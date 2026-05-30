const API_BASE = 'https://biomicshub-backend.onrender.com';
const REQUEST_TIMEOUT_MS = 90000;

export function getApiBase() {
  return API_BASE;
}

export function resolveApiAssetUrl(url?: string | null) {
  const value = String(url || '').trim();
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `${API_BASE}${value}`;
}

function friendlyHttpError(status: number, path: string) {
  if (status === 401) return 'Authentication required. Please login again.';
  if (status === 403) return 'You are not authorized for this action.';
  if (status === 404) return `Endpoint not found (${path}). The server may need an update.`;
  return `Request failed (${status})`;
}

async function parseJsonResponse(response: Response, path = '') {
  const text = await response.text();
  const trimmed = text.trim();
  const looksHtml = trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html');

  let data: Record<string, unknown> = {};
  if (looksHtml) {
    const match = trimmed.match(/<pre>([^<]+)<\/pre>/i);
    data = { error: match?.[1]?.trim() || friendlyHttpError(response.status, path) };
  } else {
    try {
      data = trimmed ? JSON.parse(trimmed) : {};
    } catch {
      data = { error: friendlyHttpError(response.status, path) };
    }
  }

  if (!response.ok) {
    throw new Error(String(data.error || data.message || friendlyHttpError(response.status, path)));
  }
  return data;
}

export async function requestJson<T = Record<string, unknown>>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, headers: extraHeaders, ...rest } = options;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(extraHeaders as Record<string, string>)
  };
  if (rest.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers,
      signal: controller.signal
    });
    return (await parseJsonResponse(response, path)) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}
