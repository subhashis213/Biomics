import { getToken } from './session';

const isLocalhostClient = typeof window !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname);

// In local development, always use local backend to avoid stale remote env mismatch.
const API_BASE = isLocalhostClient
  ? `${window.location.protocol}//${window.location.hostname}:5002`
  : (import.meta.env.VITE_API_URL
    || (typeof window !== 'undefined' && window.location.port !== '5002'
      ? `${window.location.protocol}//${window.location.hostname}:5002`
      : ''));

export function getApiBase() {
  return API_BASE;
}

function buildUrl(path) {
  return `${API_BASE}${path}`;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || `Request failed (${response.status})` };
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

  let response;
  try {
    response = await fetch(buildUrl(path), {
      ...options,
      headers
    });
  } catch {
    throw new Error(`Cannot reach API server at ${buildUrl(path)}. Ensure backend is running on port 5002.`);
  }
  return parseJsonResponse(response);
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

export function createCourseOrder(planType, voucherCode = '', moduleName = 'ALL_MODULES') {
  return requestJson('/payments/create-order', {
    method: 'POST',
    body: JSON.stringify({ planType, voucherCode, moduleName })
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
