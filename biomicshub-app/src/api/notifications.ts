import { requestJson } from './client';

export type NotificationItem = {
  _id: string;
  title: string;
  message: string;
  createdAt?: string;
  createdBy?: string;
};

export function registerDevice(token: string, deviceToken: string, platform = 'android') {
  return requestJson<{ message: string; pushConfigured: boolean }>('/notifications/register', {
    method: 'POST',
    token,
    body: JSON.stringify({ token: deviceToken, platform })
  });
}

export function unregisterDevice(token: string, deviceToken: string) {
  return requestJson('/notifications/unregister', {
    method: 'POST',
    token,
    body: JSON.stringify({ token: deviceToken })
  });
}

/** Production may only expose /announcements; newer servers also have /notifications. */
export async function fetchNotifications(token: string) {
  try {
    const res = await requestJson<{ notifications?: NotificationItem[] }>('/notifications', { token });
    if (Array.isArray(res.notifications)) return { notifications: res.notifications };
  } catch {
    // fall through to legacy announcements route
  }
  const legacy = await requestJson<{ announcements?: NotificationItem[] }>('/announcements', { token });
  return { notifications: Array.isArray(legacy.announcements) ? legacy.announcements : [] };
}
