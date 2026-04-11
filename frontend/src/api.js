import { getToken } from './session';

const isLocalhostClient = typeof window !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname);

const DEFAULT_REMOTE_API = 'https://biomicshub-backend.onrender.com';

// In local development, always use local backend to avoid stale remote env mismatch.
function normalizeBaseUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return value.replace(/\/+$/, '');
}

function buildApiBaseCandidates() {
  if (typeof window === 'undefined') {
    return [normalizeBaseUrl(import.meta.env.VITE_API_URL)].filter(Boolean);
  }

  if (isLocalhostClient) {
    return [`${window.location.protocol}//${window.location.hostname}:5002`];
  }

  // Production (Vercel frontend + Render backend):
  // If VITE_API_URL is explicitly set, use it. Otherwise go straight to the
  // known Render backend. Never use window.location.origin here — the frontend
  // and backend are on separate hosts; routing POST requests to the Vercel URL
  // causes 405 Method Not Allowed on every API call.
  const envPrimary = normalizeBaseUrl(import.meta.env.VITE_API_URL);
  const envFallbackRaw = String(import.meta.env.VITE_API_FALLBACK_URLS || '').trim();
  const envFallbacks = envFallbackRaw
    ? envFallbackRaw.split(',').map((entry) => normalizeBaseUrl(entry)).filter(Boolean)
    : [];

  const bases = envPrimary
    ? [envPrimary, ...envFallbacks]
    : [DEFAULT_REMOTE_API, ...envFallbacks];

  return Array.from(new Set(bases.filter(Boolean)));
}

const API_BASES = buildApiBaseCandidates();
const API_BASE = API_BASES[0] || '';
const REQUEST_TIMEOUT_MS = 15000;

export function getApiBase() {
  return API_BASE;
}

function buildUrl(path, base = API_BASE) {
  return `${base}${path}`;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const isHtml = /<\/?html|<\/?body|<\/?pre/i.test(text || '');
    const cannotRouteMatch = (text || '').match(/Cannot\s+(GET|POST|PUT|PATCH|DELETE)\s+([^<\n]+)/i);
    if (isHtml && cannotRouteMatch) {
      data = { error: `API route not found: ${cannotRouteMatch[1]} ${cannotRouteMatch[2].trim()}` };
    } else if (isHtml) {
      data = { error: `Request failed (${response.status}). Server returned an unexpected HTML response.` };
    } else {
      data = { error: text || `Request failed (${response.status})` };
    }
  }
  if (!response.ok) {
    const fallbackByStatus = response.status === 401
      ? 'Authentication required. Please login again.'
      : response.status === 403
        ? 'You are not authorized for this action.'
        : `Request failed (${response.status})`;
    throw new Error(data.error || data.message || fallbackByStatus);
  }
  return data;
}

export async function requestJson(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const isJsonBody = options.body && !(options.body instanceof FormData);
  if (isJsonBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const basesToTry = API_BASES.length ? API_BASES : [API_BASE];
  let lastNetworkError = null;
  let lastNetworkUrl = buildUrl(path);

  for (const base of basesToTry) {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(buildUrl(path, base), {
        ...options,
        headers,
        signal: controller.signal
      });
      globalThis.clearTimeout(timeoutId);
      return parseJsonResponse(response);
    } catch (error) {
      globalThis.clearTimeout(timeoutId);

      // API responded with HTTP error -> do not try alternate bases.
      // Exception: 405 (Method Not Allowed) means this host has no API endpoint
      // (e.g. Vercel SPA rewrite), so fall through and try the next base.
      if (error instanceof Error && !/abort/i.test(error.name || '')) {
        const isMethodNotAllowed = /\(405\)/.test(error.message || '');
        const likelyHttpError = !isMethodNotAllowed &&
          /Request failed|Authentication required|not authorized|API route not found/i.test(error.message || '');
        if (likelyHttpError) throw error;
      }

      lastNetworkError = error;
      lastNetworkUrl = buildUrl(path, base);
    }
  }

  const timeoutHint = lastNetworkError?.name === 'AbortError'
    ? `Request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s.`
    : 'Network/CORS handshake failed.';

  throw new Error(
    `Cannot reach API server at ${lastNetworkUrl}. ${timeoutHint} Please retry in a moment.`
  );
}

export function uploadMaterial(videoId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('material', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', buildUrl(`/videos/${videoId}/materials`));
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error(data.error || 'Upload failed'));
        }
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

export function downloadMaterial(videoId, filename, displayName, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', buildUrl(`/videos/${encodeURIComponent(videoId)}/materials/${encodeURIComponent(filename)}/download`), true);
    xhr.responseType = 'blob';
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error('Download failed'));
        return;
      }

      const objectUrl = URL.createObjectURL(xhr.response);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = displayName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      resolve();
    };

    xhr.onerror = () => reject(new Error('Network error during download'));
    xhr.send();
  });
}

export function toggleFavorite(videoId) {
  return requestJson(`/videos/${videoId}/favorite`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export function updateVideoProgress(videoId, completed) {
  return requestJson(`/videos/${videoId}/progress`, {
    method: 'POST',
    body: JSON.stringify({ completed })
  });
}

export function fetchCourseQuizzes() {
  return requestJson('/quizzes/my-course');
}

export function fetchModuleTopics(courseName, moduleName) {
  return requestJson(`/modules/topics/for-student?category=${encodeURIComponent(courseName)}&module=${encodeURIComponent(moduleName)}`);
}

export function fetchModuleQuiz(moduleName) {
  return requestJson(`/quizzes/my-course/${encodeURIComponent(moduleName)}`);
}

export function fetchQuizById(quizId) {
  return requestJson(`/quizzes/my-course/quiz/${encodeURIComponent(quizId)}`);
}

export function submitQuiz(quizId, answers, durationSeconds) {
  return requestJson(`/quizzes/${quizId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ answers, durationSeconds })
  });
}

export function fetchRecentQuizAttempts() {
  return requestJson('/quizzes/my-attempts/recent');
}

export function fetchQuizLeaderboard(moduleName) {
  const query = moduleName ? `?module=${encodeURIComponent(moduleName)}` : '';
  return requestJson(`/quizzes/leaderboard${query}`);
}

export function saveModuleQuiz(payload) {
  return requestJson('/quizzes', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function fetchAdminQuizzes(category) {
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  return requestJson(`/quizzes${query}`);
}

export function deleteQuiz(quizId) {
  return requestJson(`/quizzes/${quizId}`, { method: 'DELETE' });
}

export function fetchMyCoursePaymentInfo() {
  return requestJson('/payments/my-course');
}

export function createCourseOrder(planType, voucherCode = '', moduleName = 'ALL_MODULES', course = '') {
  return requestJson('/payments/create-order', {
    method: 'POST',
    body: JSON.stringify({ planType, voucherCode, moduleName, course })
  });
}

export function previewCourseOrder(planType, voucherCode = '', moduleName = 'ALL_MODULES', course = '') {
  return requestJson('/payments/preview-order', {
    method: 'POST',
    body: JSON.stringify({ planType, voucherCode, moduleName, course })
  });
}

export function verifyCoursePayment(payload) {
  return requestJson('/payments/verify', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function fetchCoursePricingAdmin() {
  return requestJson('/payments/admin/pricing');
}

export function saveCoursePricingAdmin(course, payload) {
  return requestJson(`/payments/admin/pricing/${encodeURIComponent(course)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export function fetchModulePricingAdmin(course) {
  return requestJson(`/payments/admin/pricing/${encodeURIComponent(course)}/modules`);
}

export function saveModulePricingAdmin(course, moduleName, payload) {
  return requestJson(
    `/payments/admin/pricing/${encodeURIComponent(course)}/${encodeURIComponent(moduleName)}`,
    { method: 'PUT', body: JSON.stringify(payload) }
  );
}

export function fetchVouchersAdmin() {
  return requestJson('/payments/admin/vouchers');
}

export function createVoucherAdmin(payload) {
  return requestJson('/payments/admin/vouchers', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function updateVoucherAdmin(voucherId, payload) {
  return requestJson(`/payments/admin/vouchers/${encodeURIComponent(voucherId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export function deleteVoucherAdmin(voucherId) {
  return requestJson(`/payments/admin/vouchers/${encodeURIComponent(voucherId)}`, {
    method: 'DELETE'
  });
}

export function fetchPaymentHistoryAdmin(params = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.course) qs.set('course', params.course);
  if (params.status) qs.set('status', params.status);
  if (params.username) qs.set('username', params.username);
  return requestJson(`/payments/admin/history${qs.toString() ? '?' + qs.toString() : ''}`);
}

export function fetchQuizAnalyticsAdmin(category = '') {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return requestJson(`/quizzes/admin/analytics${qs}`);
}

export function fetchAuditLogsAdmin(params = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.action) qs.set('action', params.action);
  if (params.actor) qs.set('actor', params.actor);
  return requestJson(`/auth/admin/audit-logs${qs.toString() ? '?' + qs.toString() : ''}`);
}

export function fetchRecoveryActionsAdmin(params = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(params.limit || 30));
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  return requestJson(`/auth/admin/recovery-actions?${qs.toString()}`);
}

export function applyRecoveryActionAdmin(auditLogId) {
  return requestJson(`/auth/admin/recovery-actions/${encodeURIComponent(auditLogId)}/apply`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export function saveMockExamAdmin(payload) {
  return requestJson('/mock-exams', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function fetchMockExamsAdmin(category = '') {
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  return requestJson(`/mock-exams/admin${query}`);
}

export function releaseMockExamResultAdmin(examId, resultReleased) {
  return requestJson(`/mock-exams/${encodeURIComponent(examId)}/release`, {
    method: 'PATCH',
    body: JSON.stringify({ resultReleased })
  });
}

export function toggleMockExamNoticeAdmin(examId, noticeEnabled) {
  return requestJson(`/mock-exams/${encodeURIComponent(examId)}/notice`, {
    method: 'PATCH',
    body: JSON.stringify({ noticeEnabled })
  });
}

export function fetchMyMockExams() {
  return requestJson('/mock-exams/my-course');
}

export function fetchMockExamLeaderboard(month = '') {
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  return requestJson(`/mock-exams/leaderboard${query}`);
}

export function fetchMockExamPerformanceAdmin(category = '', month = '') {
  const qs = new URLSearchParams();
  if (category) qs.set('category', category);
  if (month) qs.set('month', month);
  return requestJson(`/mock-exams/admin/performance${qs.toString() ? `?${qs.toString()}` : ''}`);
}

export function fetchMockExamById(examId) {
  return requestJson(`/mock-exams/my-course/${encodeURIComponent(examId)}`);
}

export function submitMockExam(examId, answers, durationSeconds) {
  return requestJson(`/mock-exams/${encodeURIComponent(examId)}/submit`, {
    method: 'POST',
    body: JSON.stringify({ answers, durationSeconds })
  });
}

export function fetchMockExamResult(examId) {
  return requestJson(`/mock-exams/${encodeURIComponent(examId)}/result`);
}

export function downloadMockExamResultPdf(examId) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', buildUrl(`/mock-exams/${encodeURIComponent(examId)}/result/pdf`), true);
    xhr.responseType = 'blob';
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error('Failed to download result PDF.'));
        return;
      }

      const objectUrl = URL.createObjectURL(xhr.response);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `biomics-mock-exam-${examId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      resolve();
    };

    xhr.onerror = () => reject(new Error('Network error during PDF download.'));
    xhr.send();
  });
}

export function fetchStudentAnnouncements() {
  return requestJson('/announcements');
}

export function fetchAdminAnnouncements() {
  return requestJson('/announcements/admin');
}

export function createAnnouncementAdmin(payload) {
  return requestJson('/announcements', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function updateAnnouncementAdmin(announcementId, isActive) {
  return requestJson(`/announcements/${encodeURIComponent(announcementId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive })
  });
}

export function deleteAnnouncementAdmin(announcementId) {
  return requestJson(`/announcements/${encodeURIComponent(announcementId)}`, {
    method: 'DELETE'
  });
}

export function fetchCommunityChatToken() {
  return requestJson('/chat/community/token', {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export function clearCommunityChatAdmin() {
  return requestJson('/chat/community/messages', {
    method: 'DELETE'
  });
}

export function clearAiTutorHistoryAdmin() {
  return requestJson('/chat/history/all', {
    method: 'DELETE'
  });
}

// ── Test Series ──────────────────────────────────────────────────────────────

export function fetchTestSeriesPricingAdmin() {
  return requestJson('/test-series/pricing/admin');
}

export function saveTestSeriesPricingAdmin(payload) {
  return requestJson('/test-series/pricing', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function fetchTopicTestsAdmin(category = '') {
  return requestJson(`/test-series/topic-tests/admin${category ? `?category=${encodeURIComponent(category)}` : ''}`);
}

export function saveTopicTestAdmin(payload) {
  return requestJson('/test-series/topic-tests', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function deleteTopicTestAdmin(testId) {
  return requestJson(`/test-series/topic-tests/${testId}`, { method: 'DELETE' });
}

export function fetchFullMocksAdmin(category = '') {
  return requestJson(`/test-series/full-mocks/admin${category ? `?category=${encodeURIComponent(category)}` : ''}`);
}

export function saveFullMockAdmin(payload) {
  return requestJson('/test-series/full-mocks', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function deleteFullMockAdmin(mockId) {
  return requestJson(`/test-series/full-mocks/${mockId}`, { method: 'DELETE' });
}

export function fetchTestSeriesStudentAccess() {
  return requestJson('/test-series/pricing/student');
}

export function createTestSeriesOrder(seriesType, voucherCode) {
  return requestJson('/test-series/payment/create-order', {
    method: 'POST',
    body: JSON.stringify({ seriesType, ...(voucherCode ? { voucherCode } : {}) })
  });
}

export function previewTestSeriesVoucher(seriesType, voucherCode) {
  return requestJson('/test-series/payment/preview-voucher', {
    method: 'POST',
    body: JSON.stringify({ seriesType, voucherCode })
  });
}

export function verifyTestSeriesPayment(payload) {
  return requestJson('/test-series/payment/verify', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
