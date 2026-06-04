import Constants from 'expo-constants';

/** Web client ID — baked into the APK via app.config.js + google-services.json. */
export const GOOGLE_WEB_CLIENT_ID = String(Constants.expoConfig?.extra?.googleWebClientId || '').trim();

/** Android OAuth client ID — from google-services.json at build time. */
export const GOOGLE_ANDROID_CLIENT_ID = String(
  Constants.expoConfig?.extra?.googleAndroidClientId || ''
).trim();

export function isGoogleSignInConfigured() {
  return GOOGLE_WEB_CLIENT_ID.includes('.apps.googleusercontent.com');
}

export function hasAndroidOAuthClient() {
  return GOOGLE_ANDROID_CLIENT_ID.includes('.apps.googleusercontent.com');
}
