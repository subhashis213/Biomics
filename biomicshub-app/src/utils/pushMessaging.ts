import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { displayRichPush } from '@/src/utils/richPush';

function shouldDisplay(data?: Record<string, string>) {
  if (!data) return false;
  return data.type === 'announcement' || Boolean(data.title);
}

/** Must be registered before app entry (see index.js) for background/killed state. */
export function registerBackgroundPushHandler() {
  if (Platform.OS !== 'android') return;
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    const data = remoteMessage.data as Record<string, string> | undefined;
    if (shouldDisplay(data)) {
      await displayRichPush(data || {});
    }
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
