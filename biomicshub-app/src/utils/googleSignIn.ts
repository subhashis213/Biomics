import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes
} from '@react-native-google-signin/google-signin';
import { getApiBase } from '@/src/api/client';
import type { GoogleLoginResult } from '@/src/api/auth';
import {
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
  hasAndroidOAuthClient,
  isGoogleSignInConfigured
} from '@/src/config/google';

WebBrowser.maybeCompleteAuthSession();

const MOBILE_AUTH_RETURN_URL = Linking.createURL('google-auth');

let nativeConfigured = false;

function ensureNativeConfigured() {
  if (nativeConfigured) return;
  if (!isGoogleSignInConfigured()) {
    throw new Error('Google sign-in is not configured for this app build.');
  }

  const webProject = GOOGLE_WEB_CLIENT_ID.split('-')[0] || '';
  const androidProject = GOOGLE_ANDROID_CLIENT_ID.split('-')[0] || '';
  if (webProject && androidProject && webProject !== androidProject) {
    throw new Error(
      'Google sign-in client IDs do not match. Rebuild the app after updating google-services.json.'
    );
  }

  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
    scopes: ['openid', 'email', 'profile']
  });
  nativeConfigured = true;
}

async function signInWithGoogleNative(): Promise<string> {
  ensureNativeConfigured();

  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  let response;
  try {
    response = await GoogleSignin.signIn();
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        throw new Error('Google sign-in was cancelled.');
      }
      if (err.code === statusCodes.IN_PROGRESS) {
        throw new Error('Google sign-in is already in progress.');
      }
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services is unavailable on this device.');
      }
    }
    throw err;
  }

  if (isCancelledResponse(response)) {
    throw new Error('Google sign-in was cancelled.');
  }

  if (!isSuccessResponse(response)) {
    throw new Error('Google sign-in failed. Check that google-services.json matches this app build.');
  }

  const idToken = String(response.data?.idToken || '').trim();
  if (idToken) return idToken;

  const tokens = await GoogleSignin.getTokens();
  const fallbackToken = String(tokens?.idToken || '').trim();
  if (!fallbackToken) {
    throw new Error('Google did not return a valid sign-in token.');
  }
  return fallbackToken;
}

function parseMobileAuthRedirect(url: string): GoogleLoginResult {
  const parsed = Linking.parse(url);
  const params = parsed.queryParams || {};

  const readParam = (key: string) => {
    const value = params[key];
    if (Array.isArray(value)) return String(value[0] || '').trim();
    return String(value || '').trim();
  };

  const error = readParam('error');
  if (error) {
    throw new Error(decodeURIComponent(error.replace(/\+/g, ' ')));
  }

  if (readParam('needs_profile') === '1') {
    const completionToken = readParam('completionToken');
    if (!completionToken) {
      throw new Error('Google sign-in did not return profile completion details.');
    }
    return {
      status: 'profile_required',
      completionToken,
      profile: {
        email: readParam('email'),
        name: readParam('name'),
        phone: readParam('phone'),
        birthDate: readParam('birthDate')
      }
    };
  }

  const token = readParam('token');
  if (!token) {
    throw new Error('Google sign-in did not return a session token.');
  }

  return {
    status: 'authenticated',
    token,
    user: { username: '' }
  };
}

/** Browser OAuth via backend HTTPS redirect — works without Firebase SHA-1 setup. */
async function signInWithGoogleBackendOAuth(): Promise<GoogleLoginResult> {
  const startUrl = `${getApiBase()}/auth/google-mobile/start`;
  const result = await WebBrowser.openAuthSessionAsync(startUrl, MOBILE_AUTH_RETURN_URL);

  if (result.type !== 'success' || !result.url) {
    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new Error('Google sign-in was cancelled.');
    }
    throw new Error('Google sign-in failed. Please try again.');
  }

  return parseMobileAuthRedirect(result.url);
}

function isDeveloperError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || '');
  return message.includes('DEVELOPER_ERROR') || message.includes('developer_error');
}

export type GoogleSignInOutcome =
  | { mode: 'id_token'; idToken: string }
  | { mode: 'session'; login: GoogleLoginResult };

/** Sign in with Google — native when configured, otherwise backend browser OAuth. */
export async function signInWithGoogle(): Promise<GoogleSignInOutcome> {
  if (!isGoogleSignInConfigured()) {
    throw new Error('Google sign-in is not configured for this app build.');
  }

  if (Platform.OS === 'web') {
    throw new Error('Google sign-in is only available on the mobile app.');
  }

  if (hasAndroidOAuthClient()) {
    try {
      const idToken = await signInWithGoogleNative();
      return { mode: 'id_token', idToken };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || '');
      if (message === 'Google sign-in was cancelled.') {
        throw err;
      }
      if (!isDeveloperError(err)) {
        throw err;
      }
    }
  }

  return { mode: 'session', login: await signInWithGoogleBackendOAuth() };
}

export function googleSignInErrorMessage(err: unknown) {
  if (typeof err === 'object' && err && 'code' in err) {
    const code = String((err as { code?: string }).code || '');
    if (code === statusCodes.SIGN_IN_CANCELLED) return 'Google sign-in was cancelled.';
    if (code === statusCodes.IN_PROGRESS) return 'Google sign-in is already in progress.';
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return 'Google Play Services is unavailable on this device.';
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Google sign-in failed. Please try again.';
}

/** Debug keystore SHA-1 — sideload / dev APK builds. */
export const ANDROID_DEBUG_SHA1 = '5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25';

/** Upload keystore SHA-1 — Play Store builds signed locally. */
export const ANDROID_UPLOAD_SHA1 = '9C:65:BB:01:A6:A6:E6:C7:44:1C:2C:8B:C4:1C:99:AB:3D:22:0B:D0';
