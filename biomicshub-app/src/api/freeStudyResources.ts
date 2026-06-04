import { getApiBase, requestJson } from './client';

export type FreeStudyResourceType = 'book' | 'material' | 'job-notes';

export type FreeStudyResource = {
  _id: string;
  courseName: string;
  title: string;
  description?: string;
  resourceType: FreeStudyResourceType;
  filename: string;
  originalName?: string;
  fileUrl?: string;
  mimeType?: string;
  fileSize?: number;
  coverUrl?: string;
  isActive?: boolean;
  hasStoredFile?: boolean;
  sortOrder?: number;
  createdAt?: string;
};

export type FreeStudyCourseGroup = {
  courseName: string;
  items: FreeStudyResource[];
  counts?: { book: number; material: number; 'job-notes': number };
  totalCount?: number;
  previewItems?: FreeStudyResource[];
};

export function freeStudyDownloadPath(resourceId: string) {
  return `/free-study-resources/${encodeURIComponent(resourceId)}/download`;
}

export function freeStudyDownloadLinkPath(resourceId: string) {
  return `/free-study-resources/${encodeURIComponent(resourceId)}/download-link`;
}

export function fetchFreeStudyHomePreview(token: string) {
  return requestJson<{ courses: FreeStudyCourseGroup[]; totalCount: number }>('/free-study-resources/home-preview', { token });
}

export function fetchFreeStudyLibrary(token: string) {
  return requestJson<{ courses: FreeStudyCourseGroup[]; totalCount: number }>('/free-study-resources', { token });
}

export function fetchFreeStudyAdminCourses(token: string) {
  return requestJson<{ courses: { courseName: string; name: string }[] }>('/free-study-resources/admin/courses', { token });
}

export function fetchFreeStudyAdminLibrary(token: string) {
  return requestJson<{ courses: FreeStudyCourseGroup[]; totalCount: number }>('/free-study-resources/admin/list', { token });
}

export async function uploadFreeStudyResource(
  token: string,
  payload: {
    uri: string;
    name: string;
    type: string;
    courseName: string;
    title: string;
    description?: string;
    resourceType: FreeStudyResourceType;
  }
) {
  const form = new FormData();
  form.append('file', { uri: payload.uri, name: payload.name, type: payload.type } as unknown as Blob);
  form.append('courseName', payload.courseName);
  form.append('title', payload.title);
  if (payload.description) form.append('description', payload.description);
  form.append('resourceType', payload.resourceType);

  const res = await fetch(`${getApiBase()}/free-study-resources/admin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data.error || data.message || 'Upload failed.'));
  return data as { message: string; resource: FreeStudyResource };
}

export async function replaceFreeStudyResourceFile(
  token: string,
  resourceId: string,
  payload: { uri: string; name: string; type: string }
) {
  const form = new FormData();
  form.append('file', { uri: payload.uri, name: payload.name, type: payload.type } as unknown as Blob);

  const res = await fetch(`${getApiBase()}/free-study-resources/admin/${encodeURIComponent(resourceId)}/file`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data.error || data.message || 'Failed to replace file.'));
  return data as { message: string; resource: FreeStudyResource };
}

export function updateFreeStudyResource(
  token: string,
  resourceId: string,
  payload: Partial<{ title: string; description: string; courseName: string; resourceType: FreeStudyResourceType; isActive: boolean }>
) {
  return requestJson<{ message: string; resource: FreeStudyResource }>(`/free-study-resources/admin/${encodeURIComponent(resourceId)}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload)
  });
}

export function deleteFreeStudyResource(token: string, resourceId: string) {
  return requestJson<{ message: string }>(`/free-study-resources/admin/${encodeURIComponent(resourceId)}`, {
    method: 'DELETE',
    token
  });
}
