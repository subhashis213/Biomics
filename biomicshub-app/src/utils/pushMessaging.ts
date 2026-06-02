import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { displayRichPush } from '@/src/utils/richPush';

function shouldDisplay(data?: Record<string, string>) {
  if (!data) return false;
  return data.type === 'announcement' || Boolean(data.title);
}

/** System already shows poster pushes when FCM includes a notification payload. */
function isNativePosterPush(data?: Record<string, string>) {
  return String(data?.nativePoster || '') === '1';
}

/** Must be registered before app entry (see index.js) for background/killed state. */
export function registerBackgroundPushHandler() {
  if (Platform.OS !== 'android') return;
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    const data = remoteMessage.data as Record<string, string> | undefined;
    if (!shouldDisplay(data) || isNativePosterPush(data)) return;
    await displayRichPush(data || {});
  });
}

/** Foreground FCM — show styled notification while app is open. */
export function initForegroundPushHandler() {
  if (Platform.OS !== 'android') return () => {};
  return messaging().onMessage(async (remoteMessage) => {
    const data = remoteMessage.data as Record<string, string> | undefined;
    if (shouldDisplay(data)) {
      await displayRichPush(data || {});
    }
  });
}
