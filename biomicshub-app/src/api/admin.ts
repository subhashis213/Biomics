import { requestJson } from './client';

export type Learner = {
  username: string;
  class?: string;
  phone?: string;
  city?: string;
  email?: string;
  createdAt?: string;
};

export type PaymentRow = {
  _id: string;
  username: string;
  course: string;
  moduleName?: string | null;
  planType?: string | null;
  status: string;
  amountInPaise: number;
  createdAt?: string;
};

export type AdminMockExam = {
  _id: string;
  category: string;
  title: string;
  examDate?: string;
  durationMinutes?: number;
  resultReleased?: boolean;
};

export type AdminVideo = {
  _id: string;
  title: string;
  category?: string;
  module?: string;
  batch?: string;
  topic?: string;
  url: string;
};

export function sendNotification(
  token: string,
  payload: { title: string; message: string; audience?: 'students' | 'all' }
) {
  return requestJson<{
    message: string;
    announcement?: { _id?: string };
    push?: { configured: boolean; successCount: number; failureCount: number; targeted: number };
  }>('/announcements', {
    method: 'POST',
    token,
    body: JSON.stringify({
      title: payload.title,
      message: payload.message,
      isActive: true,
      audience: payload.audience || 'students'
    })
  });
}

export function fetchPushStatus(token: string) {
  return requestJson<{ pushConfigured: boolean; studentDevices: number; adminDevices: number }>(
    '/notifications/admin/status',
    { token }
  );
}

export function fetchLearners(token: string, page = 1, search = '') {
  const qs = `?page=${page}&limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`;
  return requestJson<{
    total: number;
    users: Learner[];
    pagination: { page: number; limit: number; totalPages: number };
  }>(`/auth/users${qs}`, { token });
}

export function fetchPaymentHistory(
  token: string,
  page = 1,
  options: { limit?: number; status?: string; course?: string; username?: string } = {}
) {
  const limit = options.limit ?? 20;
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (options.status) qs.set('status', options.status);
  if (options.course) qs.set('course', options.course);
  if (options.username) qs.set('username', options.username);
  return requestJson<{
    payments: PaymentRow[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/payments/admin/history?${qs.toString()}`, { token });
}

export async function fetchAllPaymentHistory(
  token: string,
  options: { status?: string } = {}
) {
  const payments: PaymentRow[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await fetchPaymentHistory(token, page, { limit: 50, ...options });
    payments.push(...(res.payments || []));
    totalPages = res.pagination?.totalPages || 1;
    page += 1;
  } while (page <= totalPages);
  return payments;
}

export function fetchAdminMockExams(token: string, category = '') {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return requestJson<{ exams: AdminMockExam[] }>(`/mock-exams/admin${qs}`, { token });
}

export function releaseMockExamResult(token: string, examId: string, resultReleased: boolean) {
  return requestJson(`/mock-exams/${encodeURIComponent(examId)}/release`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ resultReleased })
  });
}

export function deleteMockExam(token: string, examId: string) {
  return requestJson(`/mock-exams/${encodeURIComponent(examId)}`, { method: 'DELETE', token });
}

export function fetchAllVideos(token: string) {
  return requestJson<AdminVideo[]>('/videos', { token });
}

export function createVideo(
  token: string,
  payload: { title: string; url: string; category: string; module?: string; batch?: string; topic?: string; description?: string }
) {
  return requestJson('/videos', { method: 'POST', token, body: JSON.stringify(payload) });
}

export function deleteVideo(token: string, videoId: string) {
  return requestJson(`/videos/${encodeURIComponent(videoId)}`, { method: 'DELETE', token });
}

export function fetchAdminTopicTests(token: string, category = '') {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return requestJson<{ tests: any[] }>(`/test-series/topic-tests/admin${qs}`, { token });
}

export function fetchAdminFullMocks(token: string, category = '') {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return requestJson<{ mocks: any[] }>(`/test-series/full-mocks/admin${qs}`, { token });
}
