import { Linking, Platform } from 'react-native';

async function tryOpen(url: string) {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Opens HTTPS social links; Telegram also tries the native tg:// join deep link on mobile. */
export async function openSocialLink(url: string, telegramInvite?: string) {
  if (telegramInvite && Platform.OS !== 'web') {
    const opened = await tryOpen(`tg://join?invite=${telegramInvite}`);
    if (opened) return;
  }
  await tryOpen(url);
}
