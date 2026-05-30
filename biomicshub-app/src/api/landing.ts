import { getApiBase, requestJson } from './client';

export type HomeBanner = {
  _id: string;
  title?: string;
  imageUrl: string;
  linkUrl?: string;
  active?: boolean;
  sortOrder?: number;
};

export type StudentVoice = {
  _id: string;
  name: string;
  role?: string;
  message: string;
  rating?: number;
  avatarUrl?: string;
};

export function fetchHomeBanners() {
  return requestJson<{ banners: HomeBanner[] }>('/landing/home-banners');
}

export function fetchStudentVoices() {
  return requestJson<{ voices: StudentVoice[] }>('/landing/student-voices');
}

export function fetchHomeBannersAdmin(token: string) {
  return requestJson<{ banners: HomeBanner[] }>('/landing/home-banners/admin', { token });
}

export async function uploadHomeBannerImage(token: string, uri: string) {
  const form = new FormData();
  const name = uri.split('/').pop() || 'banner.jpg';
  const ext = (name.split('.').pop() || 'jpg').toLowerCase();
  const type = ext === 'png' ? 'image/png' : 'image/jpeg';
  form.append('banner', { uri, name, type } as unknown as Blob);

  const res = await fetch(`${getApiBase()}/landing/home-banners/admin/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(data.error || data.message || 'Failed to upload banner.'));
  }
  return data as { imageUrl: string; imageName?: string };
}

export function createHomeBannerAdmin(
  token: string,
  payload: { title?: string; imageUrl: string; linkUrl?: string; sortOrder?: number; active?: boolean }
) {
  return requestJson<{ banners: HomeBanner[] }>('/landing/home-banners/admin', {
    method: 'POST',
    token,
    body: JSON.stringify(payload)
  });
}

export function updateHomeBannerAdmin(
  token: string,
  bannerId: string,
  payload: Partial<{ title: string; imageUrl: string; linkUrl: string; sortOrder: number; active: boolean }>
) {
  return requestJson<{ banners: HomeBanner[] }>(`/landing/home-banners/admin/${encodeURIComponent(bannerId)}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload)
  });
}

export function deleteHomeBannerAdmin(token: string, bannerId: string) {
  return requestJson<{ banners: HomeBanner[] }>(`/landing/home-banners/admin/${encodeURIComponent(bannerId)}`, {
    method: 'DELETE',
    token
  });
}
