import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'assets/images/adaptive-icon.png');
const outAsset = path.join(root, 'assets/images/notification-icon.png');

const densities = {
  mdpi: 24,
  hdpi: 36,
  xhdpi: 48,
  xxhdpi: 72,
  xxxhdpi: 96
};

/** Dark navy from adaptive icon background — pixels near this become transparent. */
const BG = { r: 11, g: 18, b: 32 };

function colorDistance(r, g, b) {
  return Math.sqrt(
    (r - BG.r) ** 2 +
    (g - BG.g) ** 2 +
    (b - BG.b) ** 2
  );
}

async function buildMonochromeBuffer(size) {
  const { data, info } = await sharp(source)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(data.length);
  const threshold = 42;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 16 || colorDistance(r, g, b) < threshold) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
    } else {
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = 255;
    }
  }

  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 }
  }).png().toBuffer();
}

async function main() {
  const base = await buildMonochromeBuffer(96);
  await writeFile(outAsset, base);
  console.log('Wrote', outAsset);

  for (const [folder, size] of Object.entries(densities)) {
    const dir = path.join(root, 'android/app/src/main/res', `drawable-${folder}`);
    await mkdir(dir, { recursive: true });
    const png = await buildMonochromeBuffer(size);
    const dest = path.join(dir, 'notification_icon.png');
    await writeFile(dest, png);
    console.log('Wrote', dest);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
