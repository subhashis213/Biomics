import Constants from 'expo-constants';

/** Web client ID — backend verifies idToken audience against this. */
export const GOOGLE_WEB_CLIENT_ID = String(
  Constants.expoConfig?.extra?.googleWebClientId ||
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    ''
).trim();

/** Android OAuth client ID — allows native + in-app OAuth redirect on mobile. */
export const GOOGLE_ANDROID_CLIENT_ID = String(
  Constants.expoConfig?.extra?.googleAndroidClientId ||
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
    ''
).trim();

export function isGoogleSignInConfigured() {
  return GOOGLE_WEB_CLIENT_ID.includes('.apps.googleusercontent.com');
}

export function hasAndroidOAuthClient() {
  return GOOGLE_ANDROID_CLIENT_ID.includes('.apps.googleusercontent.com');
}
