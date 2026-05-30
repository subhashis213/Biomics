import { requestJson } from './client';

export type CommunityChatToken = {
  apiKey: string;
  token: string;
  user: { id: string; name: string; biomicsRole?: string };
  channel: { type: string; id: string };
};

export function fetchCommunityChatToken(authToken: string) {
  return requestJson<CommunityChatToken>('/chat/community/token', {
    method: 'POST',
    token: authToken,
    body: JSON.stringify({})
  });
}

export function fetchCommunityUnread(authToken: string) {
  return requestJson<{ unreadCount: number }>('/chat/community/unread', { token: authToken });
}
