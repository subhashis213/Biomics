import { AppState, PermissionsAndroid, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { registerDevice } from '@/src/api/notifications';

export const PUSH_CHANNEL_ID = 'default';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

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
    showBadge: true
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

  // Expo Go cannot receive remote FCM pushes.
  if (Constants.appOwnership === 'expo') return '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const tokenResponse = await Notifications.getDevicePushTokenAsync();
      const token = String(tokenResponse?.data || '').trim();
      if (token) return token;
    } catch {
      // FCM can be slow right after install or cold start.
    }
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
    }
  }
  return '';
}

/** Request permission, fetch FCM token, and register with backend (with retries). */
export async function syncPushRegistration(authToken: string): Promise<boolean> {
  if (!authToken) return false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const deviceToken = await getDevicePushToken();
      if (!deviceToken) {
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      await registerDevice(authToken, deviceToken, Platform.OS);
      return true;
    } catch {
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  return false;
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
