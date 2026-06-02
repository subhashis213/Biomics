import { AppState, PermissionsAndroid, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { registerDevice } from '@/src/api/notifications';
import { ensureNotifeeChannel } from '@/src/utils/richPush';

export const PUSH_CHANNEL_ID = 'biomicshub_alerts_v2';

export type PushRegistrationResult = {
  ok: boolean;
  reason?: 'simulator' | 'permission_denied' | 'no_token' | 'register_failed' | 'expo_go';
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

/** Call once when the app starts so lock-screen notifications use the right channel. */
export async function initPushNotifications() {
  await ensureAndroidChannel();
  await ensureNotifeeChannel();
}

async function requestAndroidPostNotifications(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Number(Platform.Version) < 33) return true;
  const current = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  if (current) return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: 'BiomicsHub Alerts',
    description: 'Course updates, live classes, and announcements',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#3dd6c6',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
    enableVibrate: true,
    enableLights: true,
    showBadge: true,
    bypassDnd: false
  });
}

export async function getNotificationPermissionStatus() {
  return Notifications.getPermissionsAsync();
}

export async function getDevicePushToken(): Promise<string> {
  if (!Device.isDevice) return '';

  const androidOk = await requestAndroidPostNotifications();
  if (!androidOk) return '';

  await ensureAndroidChannel();

  let settings = await Notifications.getPermissionsAsync();
  if (settings.status !== 'granted') {
    settings = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true }
    });
  }
  if (settings.status !== 'granted') return '';

  if (Constants.appOwnership === 'expo') return '';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const tokenResponse = await Notifications.getDevicePushTokenAsync();
      const token = String(tokenResponse?.data || '').trim();
      if (token.length > 20) return token;
    } catch {
      // FCM can be slow right after install or cold start.
    }
    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  return '';
}

/** Request permission, fetch FCM token, and register with backend (with retries). */
export async function syncPushRegistration(authToken: string): Promise<PushRegistrationResult> {
  if (!authToken) return { ok: false, reason: 'register_failed' };
  if (!Device.isDevice) return { ok: false, reason: 'simulator' };
  if (Constants.appOwnership === 'expo') return { ok: false, reason: 'expo_go' };

  await ensureAndroidChannel();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const deviceToken = await getDevicePushToken();
      if (!deviceToken) {
        const perm = await Notifications.getPermissionsAsync();
        if (perm.status !== 'granted') {
          return { ok: false, reason: 'permission_denied' };
        }
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          continue;
        }
        return { ok: false, reason: 'no_token' };
      }
      await registerDevice(authToken, deviceToken, Platform.OS);
      return { ok: true };
    } catch {
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  }
  return { ok: false, reason: 'register_failed' };
}

export function addNotificationListeners(onReceive?: () => void) {
  const received = Notifications.addNotificationReceivedListener(() => {
    if (onReceive) onReceive();
  });
  const responded = Notifications.addNotificationResponseReceivedListener(() => {
    if (onReceive) onReceive();
  });
  return () => {
    received.remove();
    responded.remove();
  };
}

/** Re-register when app returns to foreground so tokens stay fresh. */
export function watchPushRegistration(authToken: string) {
  const sync = () => {
    if (authToken) syncPushRegistration(authToken);
  };
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') sync();
  });
  return () => sub.remove();
}
