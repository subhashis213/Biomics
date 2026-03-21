require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { v2: cloudinary } = require('cloudinary');
const User = require('./models/User');

const uploadsDir = path.join(__dirname, 'uploads');

const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
const shouldDeleteLocalAfterUpload = String(process.env.AVATAR_MIGRATION_DELETE_LOCAL || '').toLowerCase() === 'true';

function assertEnv() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required in environment');
  }
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
  }
}

function getLocalAvatarPath(filename) {
  const safeFilename = path.basename(String(filename || ''));
  if (!safeFilename) return '';
  return path.join(uploadsDir, safeFilename);
}

function maybeDeleteLocal(pathToDelete) {
  if (!shouldDeleteLocalAfterUpload || !pathToDelete) return;
  try {
    if (fs.existsSync(pathToDelete)) {
      fs.unlinkSync(pathToDelete);
    }
  } catch (_) {
    // Non-fatal local cleanup issue.
  }
}

async function migrate() {
  assertEnv();

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const cursor = User.find({}, { username: 1, avatar: 1 }).cursor();

  let scanned = 0;
  let migrated = 0;
  let skippedNoAvatar = 0;
  let skippedMissingFile = 0;
  let skippedAlreadyCloud = 0;
  let failed = 0;

  for await (const user of cursor) {
    scanned += 1;

    const cloudUrl = String(user?.avatar?.url || '').trim();
    if (cloudUrl) {
      skippedAlreadyCloud += 1;
      continue;
    }

    const filename = String(user?.avatar?.filename || '').trim();
    if (!filename) {
      skippedNoAvatar += 1;
      continue;
    }

    const localPath = getLocalAvatarPath(filename);
    if (!localPath || !fs.existsSync(localPath)) {
      skippedMissingFile += 1;
      continue;
    }

    try {
      const uploadResult = await cloudinary.uploader.upload(localPath, {
        folder: 'biomicshub/avatars',
        resource_type: 'image',
        public_id: `user-${String(user._id)}-${Date.now()}`,
        overwrite: false
      });

      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            avatar: {
              url: String(uploadResult?.secure_url || '').trim(),
              publicId: String(uploadResult?.public_id || '').trim(),
              filename: '',
              originalName: user?.avatar?.originalName || filename
            }
          }
        }
      );

      maybeDeleteLocal(localPath);
      migrated += 1;
      console.log(`Migrated avatar for user: ${user.username}`);
    } catch (error) {
      failed += 1;
      console.error(`Failed avatar migration for user ${user.username}: ${error.message}`);
    }
  }

  console.log('--- Avatar migration summary ---');
  console.log(`Scanned users: ${scanned}`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped (already Cloudinary): ${skippedAlreadyCloud}`);
  console.log(`Skipped (no avatar): ${skippedNoAvatar}`);
  console.log(`Skipped (missing local file): ${skippedMissingFile}`);
  console.log(`Failed: ${failed}`);
}

migrate()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error.message || error);
    try {
      await mongoose.disconnect();
    } catch (_) {
      // ignore disconnect errors on failed startup
    }
    process.exit(1);
  });
