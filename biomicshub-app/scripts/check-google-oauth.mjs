#!/usr/bin/env node
/**
 * Prints Firebase / Google OAuth setup steps and whether google-services.json
 * already contains an Android OAuth client.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gsPath = path.join(root, 'google-services.json');

const SHA1 = {
  debug: '5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25',
  upload: '9C:65:BB:01:A6:A6:E6:C7:44:1C:2C:8B:C4:1C:99:AB:3D:22:0B:D0'
};

let oauthClients = [];
try {
  const raw = JSON.parse(readFileSync(gsPath, 'utf8'));
  oauthClients = raw?.client?.[0]?.oauth_client || [];
} catch {
  console.error('google-services.json not found at', gsPath);
  process.exit(1);
}

const androidClient = oauthClients.find((c) => Number(c.client_type) === 1);
const webClient = oauthClients.find((c) => Number(c.client_type) === 3);

console.log('\nBiomicsHub — Google Sign-In / Firebase check\n');
console.log('Package name: com.biomicshub.app\n');

if (androidClient?.client_id) {
  console.log('✓ Android OAuth client found:', androidClient.client_id);
} else {
  console.log('✗ Android OAuth client MISSING in google-services.json');
  console.log('\nFix (5 minutes):');
  console.log('1. Open https://console.firebase.google.com → biomicshub-91820');
  console.log('2. Project settings → Your apps → Android (com.biomicshub.app)');
  console.log('3. Add SHA-1 fingerprints:');
  console.log('   Debug APK:  ', SHA1.debug);
  console.log('   Play Store: ', SHA1.upload);
  console.log('   (After Play upload, also add Play App Signing SHA-1 from Play Console)');
  console.log('4. Download fresh google-services.json → biomicshub-app/google-services.json');
  console.log('5. Rebuild: npm run build:playstore (or build:apk)\n');
}

if (webClient?.client_id) {
  console.log('✓ Web OAuth client in Firebase:', webClient.client_id);
} else {
  console.log('ℹ Web client not listed in google-services.json (backend uses GOOGLE_CLIENT_ID env).');
}

console.log('\nMobile app fallback (no Firebase SHA-1 required):');
console.log('  Backend browser OAuth: GET /auth/google-mobile/start');
console.log('  Requires on Render: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET');
console.log('  Add redirect URI to Web client:');
console.log('  https://biomicshub-backend.onrender.com/auth/google-mobile/callback\n');
