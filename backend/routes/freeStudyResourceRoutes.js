const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const FreeStudyResource = require('../models/FreeStudyResource');
const Course = require('../models/Course');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const uploadsDir = path.join(__dirname, '../uploads/free-study');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const resourceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.pdf';
      const safeBase = path.basename(file.originalname || 'resource', ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
      cb(null, `free-study-${Date.now()}-${safeBase}${ext}`);
    }
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const allowed = mime === 'application/pdf'
      || mime.startsWith('image/')
      || mime === 'application/epub+zip'
      || mime === 'application/vnd.ms-powerpoint'
      || mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      || mime === 'application/msword'
      || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (allowed) return cb(null, true);
    return cb(new Error('Only PDF, EPUB, Word, PowerPoint, or image files are allowed.'));
  }
});

function normalizeCourse(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function sanitizeResource(doc = {}) {
  return {
    _id: doc._id,
    courseName: normalizeCourse(doc.courseName),
    title: String(doc.title || '').trim(),
    description: String(doc.description || '').trim(),
    resourceType: String(doc.resourceType || 'material'),
    filename: String(doc.filename || '').trim(),
    originalName: String(doc.originalName || '').trim(),
    mimeType: String(doc.mimeType || 'application/pdf').trim(),
    fileSize: Number(doc.fileSize || 0),
    coverUrl: String(doc.coverUrl || '').trim(),
    isActive: doc.isActive !== false,
    sortOrder: Number(doc.sortOrder || 0),
    createdBy: String(doc.createdBy || '').trim(),
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null
  };
}

function groupByCourse(items = []) {
  const map = new Map();
  items.forEach((item) => {
    const courseName = normalizeCourse(item.courseName) || 'General';
    if (!map.has(courseName)) {
      map.set(courseName, { courseName, items: [], counts: { book: 0, material: 0, 'job-notes': 0 } });
    }
    const group = map.get(courseName);
    group.items.push(item);
    const type = String(item.resourceType || 'material');
    if (group.counts[type] !== undefined) group.counts[type] += 1;
  });
  return Array.from(map.values()).sort((a, b) => a.courseName.localeCompare(b.courseName));
}

async function listActiveResources() {
  const docs = await FreeStudyResource.find({ isActive: true })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();
  return docs.map(sanitizeResource);
}

function authenticateAny(req, res, next) {
  return authenticateToken()(req, res, next);
}

// GET /free-study-resources — grouped free library for logged-in students/admins
router.get('/', authenticateAny, async (req, res) => {
  try {
    const items = await listActiveResources();
    const courses = groupByCourse(items);
    return res.json({ courses, totalCount: items.length });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to load free study library.' });
  }
});

// GET /free-study-resources/home-preview — lightweight list for home page cards
router.get('/home-preview', authenticateAny, async (req, res) => {
  try {
    const items = await listActiveResources();
    const courses = groupByCourse(items).slice(0, 6).map((group) => ({
      courseName: group.courseName,
      totalCount: group.items.length,
      previewItems: group.items.slice(0, 3)
    }));
    return res.json({ courses, totalCount: items.length });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to load study library preview.' });
  }
});

// GET /free-study-resources/admin/courses — course names for admin upload form
router.get('/admin/courses', authenticateToken('admin'), async (req, res) => {
  try {
    const docs = await Course.find({ archived: { $ne: true } }, { name: 1, displayName: 1 }).sort({ name: 1 }).lean();
    const courses = docs.map((doc) => ({
      courseName: normalizeCourse(doc.displayName || doc.name),
      name: normalizeCourse(doc.name)
    }));
    return res.json({ courses });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to load courses.' });
  }
});

// GET /free-study-resources/admin/list — admin list (includes inactive)
router.get('/admin/list', authenticateToken('admin'), async (req, res) => {
  try {
    const docs = await FreeStudyResource.find({})
      .sort({ courseName: 1, sortOrder: 1, createdAt: -1 })
      .lean();
    const items = docs.map(sanitizeResource);
    return res.json({ courses: groupByCourse(items), totalCount: items.length });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to load admin study library.' });
  }
});

// GET /free-study-resources/:id/download — free download for any logged-in user
router.get('/:id/download', authenticateAny, async (req, res) => {
  try {
    const resource = await FreeStudyResource.findById(req.params.id).lean();
    if (!resource || resource.isActive === false) {
      return res.status(404).json({ error: 'Study resource not found.' });
    }
    const filename = path.basename(String(resource.filename || ''));
    if (!filename) return res.status(404).json({ error: 'File missing.' });

    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server.' });
    }

    return res.download(filePath, resource.originalName || resource.title || filename);
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to download study resource.' });
  }
});

// POST /free-study-resources/admin — upload a free book/material for a course
router.post('/admin', authenticateToken('admin'), (req, res) => {
  resourceUpload.single('file')(req, res, async (uploadError) => {
    if (uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File exceeds 30MB limit.' });
    }
    if (uploadError) {
      return res.status(400).json({ error: uploadError.message || 'Upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please choose a file to upload.' });
    }

    try {
      const courseName = normalizeCourse(req.body?.courseName);
      const title = String(req.body?.title || req.file.originalname || 'Study material').trim();
      const description = String(req.body?.description || '').trim();
      const resourceType = ['book', 'material', 'job-notes'].includes(String(req.body?.resourceType || '').trim())
        ? String(req.body.resourceType).trim()
        : 'material';
      const sortOrder = Number(req.body?.sortOrder || 0);

      if (!courseName) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Course is required.' });
      }
      if (!title) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Title is required.' });
      }

      const created = await FreeStudyResource.create({
        courseName,
        title,
        description,
        resourceType,
        filename: req.file.filename,
        originalName: req.file.originalname || title,
        mimeType: req.file.mimetype || 'application/pdf',
        fileSize: Number(req.file.size || 0),
        coverUrl: String(req.body?.coverUrl || '').trim(),
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        createdBy: String(req.user?.username || '').trim(),
        isActive: true
      });

      return res.status(201).json({
        message: 'Free study resource uploaded.',
        resource: sanitizeResource(created.toObject())
      });
    } catch (error) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      return res.status(500).json({ error: error?.message || 'Failed to save study resource.' });
    }
  });
});

// PATCH /free-study-resources/admin/:id
router.patch('/admin/:id', authenticateToken('admin'), async (req, res) => {
  try {
    const resource = await FreeStudyResource.findById(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Study resource not found.' });

    if (req.body?.courseName !== undefined) resource.courseName = normalizeCourse(req.body.courseName);
    if (req.body?.title !== undefined) resource.title = String(req.body.title || '').trim();
    if (req.body?.description !== undefined) resource.description = String(req.body.description || '').trim();
    if (req.body?.resourceType !== undefined) {
      const nextType = String(req.body.resourceType || '').trim();
      if (['book', 'material', 'job-notes'].includes(nextType)) resource.resourceType = nextType;
    }
    if (req.body?.sortOrder !== undefined) resource.sortOrder = Number(req.body.sortOrder || 0);
    if (req.body?.isActive !== undefined) resource.isActive = Boolean(req.body.isActive);
    if (req.body?.coverUrl !== undefined) resource.coverUrl = String(req.body.coverUrl || '').trim();

    await resource.save();
    return res.json({ message: 'Study resource updated.', resource: sanitizeResource(resource.toObject()) });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to update study resource.' });
  }
});

// DELETE /free-study-resources/admin/:id
router.delete('/admin/:id', authenticateToken('admin'), async (req, res) => {
  try {
    const resource = await FreeStudyResource.findById(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Study resource not found.' });

    const filename = path.basename(String(resource.filename || ''));
    if (filename) {
      const filePath = path.join(uploadsDir, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await resource.deleteOne();
    return res.json({ message: 'Study resource deleted.' });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to delete study resource.' });
  }
});

module.exports = router;
