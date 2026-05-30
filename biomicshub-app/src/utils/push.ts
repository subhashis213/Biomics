import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#3dd6c6'
  });
}

/**
 * Requests permission and returns the native FCM device token (Android) or APNs
 * token (iOS). Returns '' when running in a context without FCM configured
 * (e.g. Expo Go, missing google-services.json) so callers can no-op gracefully.
 */
export async function getDevicePushToken(): Promise<string> {
  try {
    if (!Device.isDevice) return '';
    await ensureAndroidChannel();

    const settings = await Notifications.getPermissionsAsync();
    let status = settings.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return '';

    // Expo Go cannot receive remote FCM pushes — skip token fetch there.
    if (Constants.appOwnership === 'expo') return '';

    const tokenResponse = await Notifications.getDevicePushTokenAsync();
    return String(tokenResponse?.data || '');
  } catch {
    return '';
  }
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
