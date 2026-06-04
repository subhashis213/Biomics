/** @type {import('@expo/config').ExpoConfig} */
const fs = require('node:fs');
const path = require('node:path');

function readGoogleServicesJson() {
  try {
    const filePath = path.join(__dirname, 'google-services.json');
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readOAuthClientIdFromGoogleServices(clientType) {
  const oauthClients = readGoogleServicesJson()?.client?.[0]?.oauth_client || [];
  const match = oauthClients.find((entry) => Number(entry.client_type) === clientType);
  return String(match?.client_id || '').trim();
}

// google-services.json wins over .env so a stale EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID cannot break sign-in.
const GOOGLE_WEB_CLIENT_ID =
  readOAuthClientIdFromGoogleServices(3) ||
  String(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '').trim() ||
  '430984155371-9cgkt3u37sh40bfo0mu82c5f62829o37.apps.googleusercontent.com';

const GOOGLE_ANDROID_CLIENT_ID =
  readOAuthClientIdFromGoogleServices(1) ||
  String(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '').trim();

module.exports = {
  expo: {
    ...require('./app.json').expo,
    extra: {
      googleWebClientId: GOOGLE_WEB_CLIENT_ID,
      googleAndroidClientId: GOOGLE_ANDROID_CLIENT_ID
    }
  }
};
