import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appJson = JSON.parse(await readFile(path.join(root, 'app.json'), 'utf8'));
const version = appJson.expo.version || '1.0.0';
const src = path.join(root, 'android/app/build/outputs/bundle/release/app-release.aab');
const dest = path.join(root, 'releases', `BiomicsHub-${version}.aab`);

await mkdir(path.dirname(dest), { recursive: true });
await copyFile(src, dest);
console.log(`Play Store bundle ready: releases/BiomicsHub-${version}.aab`);
