const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');
const HomeBanner = require('../models/HomeBanner');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const uploadsDir = path.join(__dirname, '../uploads');

const cloudinaryCloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const cloudinaryApiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
const cloudinaryApiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
const hasCloudinaryConfig = !!(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret);

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: cloudinaryCloudName,
    api_key: cloudinaryApiKey,
    api_secret: cloudinaryApiSecret,
    secure: true
  });
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const bannerUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const safeBase = path.basename(file.originalname || 'home-banner', ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      cb(null, `home-banner-${Date.now()}-${safeBase}${ext || '.jpg'}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if ((file.mimetype || '').startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files are allowed for banners.'));
  }
});

async function uploadBannerImage(localPath) {
  if (!localPath) throw new Error('Banner upload path is missing.');
  if (!hasCloudinaryConfig) return null;
  const uploadResult = await cloudinary.uploader.upload(localPath, {
    folder: 'biomicshub/home-banners',
    resource_type: 'image'
  });
  return uploadResult?.secure_url || uploadResult?.url || null;
}

function sanitizeBanner(doc = {}) {
  return {
    _id: doc._id,
    title: String(doc.title || '').trim(),
    imageUrl: String(doc.imageUrl || '').trim(),
    linkUrl: String(doc.linkUrl || '').trim(),
    active: doc.active !== false,
    sortOrder: Number(doc.sortOrder || 0),
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null
  };
}

router.get('/home-banners', async (req, res) => {
  try {
    const docs = await HomeBanner.find({ active: true })
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(50)
      .lean();
    return res.json({ banners: docs.map(sanitizeBanner) });
  } catch {
    return res.status(500).json({ error: 'Failed to load home banners.' });
  }
});

router.get('/home-banners/admin', authenticateToken('admin'), async (req, res) => {
  try {
    const docs = await HomeBanner.find({})
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(100)
      .lean();
    return res.json({ banners: docs.map(sanitizeBanner) });
  } catch {
    return res.status(500).json({ error: 'Failed to load home banners.' });
  }
});

router.post('/home-banners/admin', authenticateToken('admin'), async (req, res) => {
  try {
    const imageUrl = String(req.body?.imageUrl || '').trim();
    const title = String(req.body?.title || '').trim();
    const linkUrl = String(req.body?.linkUrl || '').trim();
    const active = req.body?.active !== false;
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;

    if (!imageUrl) {
      return res.status(400).json({ error: 'Banner image URL is required.' });
    }

    await HomeBanner.create({
      title,
      imageUrl,
      linkUrl,
      active,
      sortOrder,
      createdBy: String(req.user?.username || '').trim(),
      updatedBy: String(req.user?.username || '').trim()
    });

    const docs = await HomeBanner.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean();
    return res.status(201).json({ banners: docs.map(sanitizeBanner) });
  } catch {
    return res.status(500).json({ error: 'Failed to create home banner.' });
  }
});

router.patch('/home-banners/admin/:id', authenticateToken('admin'), async (req, res) => {
  try {
    const bannerId = String(req.params?.id || '').trim();
    if (!bannerId) return res.status(400).json({ error: 'Banner ID is required.' });

    const banner = await HomeBanner.findById(bannerId);
    if (!banner) return res.status(404).json({ error: 'Home banner not found.' });

    if (req.body?.title != null) banner.title = String(req.body.title).trim();
    if (req.body?.imageUrl != null) banner.imageUrl = String(req.body.imageUrl).trim();
    if (req.body?.linkUrl != null) banner.linkUrl = String(req.body.linkUrl).trim();
    if (req.body?.active != null) banner.active = req.body.active !== false;
    if (req.body?.sortOrder != null && Number.isFinite(Number(req.body.sortOrder))) {
      banner.sortOrder = Number(req.body.sortOrder);
    }
    banner.updatedBy = String(req.user?.username || '').trim();

    if (!String(banner.imageUrl || '').trim()) {
      return res.status(400).json({ error: 'Banner image URL is required.' });
    }

    await banner.save();
    const docs = await HomeBanner.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean();
    return res.json({ banners: docs.map(sanitizeBanner) });
  } catch {
    return res.status(500).json({ error: 'Failed to update home banner.' });
  }
});

router.delete('/home-banners/admin/:id', authenticateToken('admin'), async (req, res) => {
  try {
    const bannerId = String(req.params?.id || '').trim();
    if (!bannerId) return res.status(400).json({ error: 'Banner ID is required.' });
    await HomeBanner.findByIdAndDelete(bannerId);
    const docs = await HomeBanner.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean();
    return res.json({ banners: docs.map(sanitizeBanner) });
  } catch {
    return res.status(500).json({ error: 'Failed to delete home banner.' });
  }
});

router.post('/home-banners/admin/upload', authenticateToken('admin'), (req, res) => {
  bannerUpload.single('banner')(req, res, async (uploadError) => {
    try {
      if (uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Banner image must be 8 MB or smaller.' });
      }
      if (uploadError) {
        return res.status(400).json({ error: uploadError.message || 'Failed to upload banner image.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Banner image is required.' });
      }

      const localPath = path.join(uploadsDir, req.file.filename);
      let imageUrl = `/uploads/${encodeURIComponent(req.file.filename)}`;

      if (hasCloudinaryConfig) {
        const uploaded = await uploadBannerImage(localPath);
        if (!uploaded) {
          return res.status(500).json({ error: 'Cloud banner upload failed.' });
        }
        imageUrl = uploaded;
        try { fs.unlinkSync(localPath); } catch { /* ignore */ }
      }

      return res.json({
        message: 'Banner image uploaded.',
        imageUrl,
        imageName: String(req.file.originalname || req.file.filename || '').trim()
      });
    } catch {
      return res.status(500).json({ error: 'Failed to upload banner image.' });
    }
  });
});

module.exports = router;
