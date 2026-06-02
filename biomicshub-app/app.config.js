/** @type {import('@expo/config').ExpoConfig} */
const fs = require('node:fs');
const path = require('node:path');

const GOOGLE_WEB_CLIENT_ID =
  String(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '').trim() ||
  '517522563325-v3mogr6jj1n1s7dbttt4d8ohlslhhd9m.apps.googleusercontent.com';

function readAndroidClientIdFromGoogleServices() {
  try {
    const filePath = path.join(__dirname, 'google-services.json');
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const oauthClients = raw?.client?.[0]?.oauth_client || [];
    const androidClient = oauthClients.find((entry) => Number(entry.client_type) === 1);
    return String(androidClient?.client_id || '').trim();
  } catch {
    return '';
  }
}

const GOOGLE_ANDROID_CLIENT_ID =
  String(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '').trim() ||
  readAndroidClientIdFromGoogleServices();

module.exports = {
  expo: {
    ...require('./app.json').expo,
    extra: {
      googleWebClientId: GOOGLE_WEB_CLIENT_ID,
      googleAndroidClientId: GOOGLE_ANDROID_CLIENT_ID
    }
  }
};
