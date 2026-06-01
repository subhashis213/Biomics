import { getApiBase, requestJson } from './client';

export type CommunityChatToken = {
  apiKey: string;
  token: string;
  apiBase?: string;
  authToken?: string;
  registeredMemberCount?: number;
  user: { id: string; name: string; biomicsRole?: string };
  channel: { type: string; id: string; name?: string };
};

export type CommunityAttachmentUpload = {
  url: string;
  absoluteUrl?: string;
  mime: string;
  name: string;
  type: 'image' | 'file';
};

export function fetchCommunityChatToken(authToken: string) {
  return requestJson<CommunityChatToken>('/chat/community/token', {
    method: 'POST',
    token: authToken,
    body: JSON.stringify({})
  }).then((data) => ({
    ...data,
    authToken,
    apiBase: data.apiBase || getApiBase()
  }));
}

export function fetchCommunityUnread(authToken: string) {
  return requestJson<{ unreadCount: number }>('/chat/community/unread', { token: authToken });
}

export function fetchCommunityStats(authToken: string) {
  return requestJson<{ registeredMemberCount: number }>('/chat/community/stats', { token: authToken });
}

export async function uploadCommunityAttachment(
  authToken: string,
  file: { uri: string; name: string; type: string }
) {
  const form = new FormData();
  form.append('attachment', file as unknown as Blob);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(`${getApiBase()}/chat/community/attachments`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: form,
      signal: controller.signal
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(String(data.error || data.message || 'Attachment upload failed.'));
    }
    return data as CommunityAttachmentUpload;
  } finally {
    clearTimeout(timeoutId);
  }
}
