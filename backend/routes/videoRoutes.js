const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Video = require('../models/Video');
const Module = require('../models/Module');
const Course = require('../models/Course');
const Quiz = require('../models/Quiz');
const User = require('../models/User');
const { resolveStudentCourseFromRequest } = require('../utils/resolveStudentCourse');
const { logAdminAction } = require('../utils/auditLog');
const { authenticateToken } = require('../middleware/auth');
const {
  ALL_MODULES,
  getActiveCourseMembership,
  getActiveModuleMembership,
  getCoursePricingDocs,
  getPlanPriceInPaise,
  hasModuleAccess,
  MEMBERSHIP_PLANS,
  normalizeCourseName,
  normalizeModuleName
} = require('../utils/courseAccess');

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

async function isAllowedCourseCategory(courseName) {
  const normalized = normalizeCourseName(courseName);
  if (!normalized) return false;
  const count = await Course.countDocuments({ active: true });
  if (count === 0) return true;
  const exists = await Course.findOne({ name: normalized, active: true }).select({ _id: 1 }).lean();
  return Boolean(exists);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype === 'application/pdf' && ext === '.pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  }
});

function sanitizeIdList(items = []) {
  return items.map((item) => String(item));
}

async function getUserCourseAccessSnapshot(user, snapshotCourse) {
  const course = normalizeCourseName(snapshotCourse || user?.class);
  if (!course) return null;
  const [pricingDocs, modules, videoModules, quizModules] = await Promise.all([
    getCoursePricingDocs(course),
    Module.find({ category: course }).sort({ name: 1 }).lean(),
    Video.distinct('module', { category: course }),
    Quiz.distinct('module', { category: course })
  ]);
  const pricingByModule = new Map(pricingDocs.map((entry) => [normalizeModuleName(entry.moduleName), entry]));
  const bundlePricing = pricingByModule.get(ALL_MODULES) || null;
  const buildPlans = (pricing) => Object.values(MEMBERSHIP_PLANS).map((plan) => ({
    type: plan.type,
    label: plan.label,
    durationMonths: plan.durationMonths,
    amountInPaise: getPlanPriceInPaise(pricing, plan.type)
  }));
  const moduleNames = Array.from(new Set([
    ...modules.map((entry) => normalizeModuleName(entry.name)),
    ...pricingDocs.map((entry) => normalizeModuleName(entry.moduleName)).filter((moduleName) => moduleName !== ALL_MODULES),
    ...(Array.isArray(videoModules) ? videoModules : []).map((m) => normalizeModuleName(m)),
    ...(Array.isArray(quizModules) ? quizModules : []).map((m) => normalizeModuleName(m))
  ])).filter((name) => Boolean(name) && name !== ALL_MODULES).sort((left, right) => left.localeCompare(right));
  const moduleAccess = {};
  moduleNames.forEach((moduleName) => {
    const pricing = pricingByModule.get(moduleName) || null;
    const activeMembership = getActiveModuleMembership(user, course, moduleName);
    const purchaseRequired = Boolean(pricing && buildPlans(pricing).some((plan) => plan.amountInPaise > 0));
    moduleAccess[moduleName] = {
      unlocked: !purchaseRequired || Boolean(activeMembership),
      purchaseRequired,
      pricing: {
        currency: String(pricing?.currency || bundlePricing?.currency || 'INR'),
        plans: buildPlans(pricing)
      },
      activeMembership: activeMembership
        ? {
            moduleName: normalizeModuleName(activeMembership.moduleName) || moduleName,
            planType: activeMembership.planType || 'pro',
            expiresAt: activeMembership.expiresAt || null,
            unlockedAt: activeMembership.unlockedAt || null
          }
        : null
    };
  });
  const purchaseRequired = Boolean(
    (bundlePricing && buildPlans(bundlePricing).some((plan) => plan.amountInPaise > 0))
    || Object.values(moduleAccess).some((entry) => entry.purchaseRequired)
  );
  const unlocked = Boolean(getActiveModuleMembership(user, course, ALL_MODULES));
  const activeMembership = getActiveCourseMembership(user, course);
  return {
    course,
    unlocked,
    purchaseRequired,
    allModulesUnlocked: unlocked,
    unlockedModules: unlocked ? moduleNames : moduleNames.filter((moduleName) => moduleAccess[moduleName]?.unlocked),
    bundlePricing: {
      currency: String(bundlePricing?.currency || 'INR'),
      plans: buildPlans(bundlePricing)
    },
    moduleAccess,
    activeMembership: activeMembership
      ? {
          moduleName: normalizeModuleName(activeMembership.moduleName) || ALL_MODULES,
          planType: activeMembership.planType || 'pro',
          expiresAt: activeMembership.expiresAt || null,
          unlockedAt: activeMembership.unlockedAt || null
        }
      : null
  };
}

// Get all videos
router.get('/', async (req, res) => {
  try {
    const requestedCategory = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const requestedBatch = typeof req.query.batch === 'string' ? req.query.batch.trim() : '';
    const filter = {};
    if (requestedCategory) filter.category = requestedCategory;
    if (requestedBatch) filter.batch = requestedBatch;
    const videos = await Video.find(filter).sort({ uploadedAt: -1 });
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

// Student-only: fetch lectures for the student's registered course
router.get('/my-course', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne(
      { username: req.user.username },
      { class: 1, favorites: 1, completedVideos: 1, purchasedCourses: 1, _id: 0 }
    ).lean();
    if (!user || !user.class) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const queryCourse = typeof req.query.course === 'string' ? req.query.course.trim() : '';
    const canonicalCourse = await resolveStudentCourseFromRequest(queryCourse || user.class, user.class);
    if (!canonicalCourse) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const access = await getUserCourseAccessSnapshot(user, canonicalCourse);
    if (!access) {
      return res.status(404).json({ error: 'Unable to resolve course access' });
    }

    const videos = await Video.find({ category: canonicalCourse }).sort({ uploadedAt: -1 });
    return res.json({
      course: canonicalCourse,
      enrollmentCourse: user.class,
      videos,
      favorites: sanitizeIdList(user.favorites || []),
      completedVideos: sanitizeIdList(user.completedVideos || []),
      access
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch course videos' });
  }
});

// Student-only: toggle favorite for quick access
router.post('/:id/favorite', authenticateToken('user'), async (req, res) => {
  try {
    const video = await Video.findById(req.params.id, { _id: 1, category: 1 }).lean();
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: 'Student profile not found.' });
    const canAccess = await hasModuleAccess(user, video.category || user.class, video.module || 'General', video.batch || 'General');
    if (!canAccess) return res.status(402).json({ error: 'Please unlock this module to access lectures.' });

    const videoId = String(video._id);
    const currentFavorites = new Set(sanitizeIdList(user.favorites || []));
    let isFavorite;

    if (currentFavorites.has(videoId)) {
      user.favorites = (user.favorites || []).filter((id) => String(id) !== videoId);
      isFavorite = false;
    } else {
      user.favorites = [...(user.favorites || []), video._id];
      isFavorite = true;
    }

    await user.save();
    return res.json({ isFavorite, favorites: sanitizeIdList(user.favorites || []) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update favorites.' });
  }
});

// Student-only: mark lecture progress complete/incomplete
router.post('/:id/progress', authenticateToken('user'), async (req, res) => {
  try {
    const { completed } = req.body || {};
    const shouldComplete = Boolean(completed);

    const video = await Video.findById(req.params.id, { _id: 1, category: 1 }).lean();
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: 'Student profile not found.' });
    const canAccess = await hasModuleAccess(user, video.category || user.class, video.module || 'General', video.batch || 'General');
    if (!canAccess) return res.status(402).json({ error: 'Please unlock this module to track progress.' });

    const videoId = String(video._id);
    const completedSet = new Set(sanitizeIdList(user.completedVideos || []));

    if (shouldComplete) {
      completedSet.add(videoId);
    } else {
      completedSet.delete(videoId);
    }

    user.completedVideos = Array.from(completedSet);
    await user.save();

    return res.json({ completed: shouldComplete, completedVideos: sanitizeIdList(user.completedVideos || []) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update progress.' });
  }
});

// Upload a new video — admin only
router.post('/', authenticateToken('admin'), async (req, res) => {
  const { title, description, url, category, batch, module, topic } = req.body;
  if (!title || !url) return res.status(400).json({ error: 'Title and URL required' });
  if (!category || !(await isAllowedCourseCategory(category))) {
    return res.status(400).json({ error: 'Valid course category is required' });
  }
  try {
    const normalizedModule = String(module || 'General').trim() || 'General';
    const normalizedTopic = String(topic || 'General').trim() || 'General';
    const normalizedBatch = String(batch || '').trim();
    const video = new Video({
      title,
      description,
      url,
      category,
      batch: normalizedBatch,
      module: normalizedModule,
      topic: normalizedTopic
    });
    await video.save();
    await Module.findOneAndUpdate(
      { category, name: normalizedModule, batch: normalizedBatch || 'General' },
      { $setOnInsert: { category, name: normalizedModule, batch: normalizedBatch || 'General', createdBy: req.user?.username || '' } },
      { upsert: true }
    );
    await logAdminAction(req, {
      action: 'video.create',
      targetType: 'video',
      targetId: String(video._id),
      details: {
        title: video.title,
        category: video.category,
        batch: video.batch,
        module: video.module,
        topic: video.topic
      }
    });
    res.status(201).json(video);
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload video' });
  }
});

// Bulk-delete all videos for a category+module — admin only
router.delete('/module', authenticateToken('admin'), async (req, res) => {
  const { category, module: moduleName, batch } = req.body || {};
  if (!category || !moduleName) {
    return res.status(400).json({ error: 'category and module are required' });
  }
  try {
    const normalizedModule = String(moduleName).trim();
    const batchFilter = String(batch || '').trim();
    const isGeneralModule = normalizedModule.toLowerCase() === 'general';
    const moduleFilter = isGeneralModule
      ? { $or: [{ module: 'General' }, { module: '' }, { module: null }, { module: { $exists: false } }] }
      : { module: normalizedModule };
    const match = { category, ...moduleFilter };
    if (batchFilter) {
      match.$and = [{
        $or: [
          { batch: batchFilter },
          { batch: 'General' },
          { batch: '' },
          { batch: null },
          { batch: { $exists: false } }
        ]
      }];
    }
    const videos = await Video.find(match);
    let deletedCount = 0;
    for (const video of videos) {
      if (video.materials && video.materials.length) {
        video.materials.forEach(m => {
          const fp = path.join(uploadsDir, path.basename(m.filename));
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        });
      }
      await video.deleteOne();
      deletedCount++;
    }
    await logAdminAction(req, {
      action: 'module.delete',
      targetType: 'module',
      targetId: `${category}::${normalizedModule}`,
      details: { category, module: normalizedModule, batch: batchFilter || null, videosDeleted: deletedCount }
    });
    return res.json({ message: `Module deleted`, deletedCount });
  } catch (err) {
    console.error('[module-delete]', err.message);
    return res.status(500).json({ error: 'Failed to delete module' });
  }
});

// Delete a video by ID — admin only
router.delete('/:id', authenticateToken('admin'), async (req, res) => {
  try {
    const video = await Video.findByIdAndDelete(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    const videoObj = video.toObject();
    // Remove any associated material files from disk
    if (video.materials && video.materials.length) {
      video.materials.forEach(m => {
        const fp = path.join(uploadsDir, path.basename(m.filename));
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      });
    }
    await logAdminAction(req, {
      action: 'video.delete',
      targetType: 'video',
      targetId: String(video._id),
      details: {
        title: video.title,
        category: video.category,
        materialCount: video.materials?.length || 0,
        snapshot: {
          _id: String(videoObj._id),
          title: videoObj.title,
          description: videoObj.description,
          url: videoObj.url,
          category: videoObj.category,
          module: videoObj.module,
          topic: videoObj.topic,
          uploadedAt: videoObj.uploadedAt,
          materials: Array.isArray(videoObj.materials) ? videoObj.materials : []
        }
      }
    });
    res.json({ message: 'Video deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

// Add a PDF material to a video — admin only
router.post('/:id/materials', authenticateToken('admin'), upload.single('material'), async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!video.materials) video.materials = [];
    video.materials.push({ name: req.file.originalname, filename: req.file.filename });
    await video.save();
    await logAdminAction(req, {
      action: 'material.add',
      targetType: 'video',
      targetId: String(video._id),
      details: { name: req.file.originalname, filename: req.file.filename }
    });
    res.json(video);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to add material' });
  }
});

// Student-only: protected material download
router.get('/:id/materials/:filename/download', authenticateToken('user'), async (req, res) => {
  try {
    const filename = path.basename(String(req.params.filename || ''));
    if (!filename) return res.status(400).json({ error: 'Material filename is required.' });

    const [video, user] = await Promise.all([
      Video.findById(req.params.id, { category: 1, materials: 1 }).lean(),
      User.findOne({ username: req.user.username }, { class: 1, purchasedCourses: 1 }).lean()
    ]);

    if (!video) return res.status(404).json({ error: 'Video not found.' });
    if (!user) return res.status(404).json({ error: 'Student profile not found.' });

    const canAccess = await hasModuleAccess(user, video.category || user.class, video.module || 'General', video.batch || 'General');
    if (!canAccess) return res.status(402).json({ error: 'Please unlock this module to access study materials.' });

    const material = (video.materials || []).find((entry) => String(entry.filename || '') === filename);
    if (!material) return res.status(404).json({ error: 'Material not found for this lecture.' });

    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Material file missing on server.' });

    return res.download(filePath, material.name || filename);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to download material.' });
  }
});

// Remove a PDF material from a video — admin only
router.delete('/:id/materials/:filename', authenticateToken('admin'), async (req, res) => {
  try {
    // Prevent path traversal
    const filename = path.basename(req.params.filename);
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    const mat = video.materials.find(m => m.filename === filename);
    if (!mat) return res.status(404).json({ error: 'Material not found' });
    const fp = path.join(uploadsDir, filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    video.materials = video.materials.filter(m => m.filename !== filename);
    await video.save();
    await logAdminAction(req, {
      action: 'material.remove',
      targetType: 'video',
      targetId: String(video._id),
      details: { name: mat.name, filename: mat.filename }
    });
    res.json({ message: 'Material removed' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to remove material' });
  }
});

router.use((err, req, res, next) => {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message || 'Upload failed' });
  }
  return res.status(400).json({ error: err.message || 'Upload failed' });
});

module.exports = router;
