import { getApiBase, requestJson } from './client';
import * as FileSystem from 'expo-file-system';

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

async function uploadStudyFile(
  token: string,
  endpoint: string,
  payload: { uri: string; name: string; type: string },
  parameters: Record<string, string> = {}
) {
  const response = await FileSystem.uploadAsync(`${getApiBase()}${endpoint}`, payload.uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: payload.type || 'application/pdf',
    headers: { Authorization: `Bearer ${token}` },
    parameters
  });

  const data = JSON.parse(response.body || '{}');
  if (response.status < 200 || response.status >= 300) {
    throw new Error(String(data.error || data.message || 'Upload failed.'));
  }
  return data;
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
  const data = await uploadStudyFile(token, '/free-study-resources/admin', payload, {
    courseName: payload.courseName,
    title: payload.title,
    description: payload.description || '',
    resourceType: payload.resourceType
  });
  return data as { message: string; resource: FreeStudyResource };
}

export async function replaceFreeStudyResourceFile(
  token: string,
  resourceId: string,
  payload: { uri: string; name: string; type: string }
) {
  const data = await uploadStudyFile(
    token,
    `/free-study-resources/admin/${encodeURIComponent(resourceId)}/file`,
    payload
  );
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
