import { getToken } from './session';

function isPrivateIpv4(hostname = '') {
  const value = String(hostname || '').trim();
  if (!value) return false;
  if (/^10\./.test(value)) return true;
  if (/^192\.168\./.test(value)) return true;
  const match = value.match(/^172\.(\d{1,3})\./);
  if (!match) return false;
  const secondOctet = Number(match[1]);
  return Number.isInteger(secondOctet) && secondOctet >= 16 && secondOctet <= 31;
}

function isLocalDevHost(hostname = '') {
  const value = String(hostname || '').trim().toLowerCase();
  if (!value) return false;
  return value === 'localhost'
    || value === '127.0.0.1'
    || value === '0.0.0.0'
    || value === '::1'
    || isPrivateIpv4(value);
}

// Capacitor native apps run on capacitor://localhost — treat as production, not local dev.
const isCapacitorNative = typeof window !== 'undefined'
  && (window.location.protocol === 'capacitor:'
    || window.location.protocol === 'ionic:'
    || window.Capacitor?.isNativePlatform?.());

const isLocalhostClient = !isCapacitorNative
  && typeof window !== 'undefined'
  && isLocalDevHost(window.location.hostname);

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
const REQUEST_TIMEOUT_MS = isLocalhostClient ? 45000 : 90000;
const EXTRACTION_TIMEOUT_MS = isLocalhostClient ? 180000 : 240000;

// Keep Render backend warm — ping /health every 10 min (Render sleeps after 15 min of inactivity).
// Fires immediately on page load so cold start happens before user clicks anything.
if (typeof window !== 'undefined' && !isLocalhostClient) {
  const pingUrl = `${DEFAULT_REMOTE_API}/health`;
  const ping = () => fetch(pingUrl, { method: 'GET', cache: 'no-store' }).catch(() => {});
  ping(); // wake up Render immediately on page load
  setInterval(ping, 10 * 60 * 1000); // re-ping every 10 minutes
}

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

async function attemptRequest(path, options, headers) {
  const basesToTry = API_BASES.length ? API_BASES : [API_BASE];
  let lastNetworkError = null;
  let lastNetworkUrl = buildUrl(path);
  const timeoutMs = path.includes('/extract-pdf-mcq') ? EXTRACTION_TIMEOUT_MS : REQUEST_TIMEOUT_MS;

  for (const base of basesToTry) {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

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
      // Exception: 405 means wrong host (Vercel SPA), fall through to next base.
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

  // Attach metadata so the caller knows this was a timeout
  const err = new Error(lastNetworkError?.name === 'AbortError' ? 'COLD_START_TIMEOUT' : 'NETWORK_ERROR');
  err.isTimeout = lastNetworkError?.name === 'AbortError';
  err.lastUrl = lastNetworkUrl;
  throw err;
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

  try {
    return await attemptRequest(path, options, headers);
  } catch (firstError) {
    // If it was a cold-start timeout, wait 4s then retry once automatically.
    // Render typically responds on the second attempt after the wake-up completes.
    if (firstError.isTimeout) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 4000));
      try {
        return await attemptRequest(path, options, headers);
      } catch (retryError) {
        if (retryError.isTimeout) {
          const isExtraction = path.includes('/extract-pdf-mcq');
          if (isExtraction) {
            throw new Error(
              'PDF extraction is taking longer than expected. Please wait and try again, or use a smaller PDF.'
            );
          }

          throw new Error(
            isLocalhostClient
              ? 'Request timed out while waiting for the local server. Please retry.'
              : 'Server is starting up. Please wait a moment and try again — this usually takes under 60 seconds on first use.'
          );
        }
        throw retryError;
      }
    }
    throw firstError;
  }
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

export function extractMcqFromPdf(file) {
  const formData = new FormData();
  formData.append('pdf', file);

  return requestJson('/quizzes/extract-pdf-mcq', {
    method: 'POST',
    body: formData
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
