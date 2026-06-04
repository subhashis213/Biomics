import * as FileSystem from 'expo-file-system';
import { Platform, Share } from 'react-native';
import { getApiBase } from '@/src/api/client';
import { freeStudyDownloadPath } from '@/src/api/freeStudyResources';

function pickExtension(filename: string, displayName: string, mimeType?: string) {
  const fromFile = String(filename || '').split('.').pop();
  if (fromFile && fromFile.length <= 6) return fromFile.toLowerCase();
  const fromName = String(displayName || '').split('.').pop();
  if (fromName && fromName.length <= 6) return fromName.toLowerCase();
  const mime = String(mimeType || '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'jpg';
  return 'pdf';
}

function safeBaseName(displayName: string, filename: string) {
  const raw = String(displayName || filename || 'study-material').trim();
  const cleaned = raw.replace(/[^\w.\-() ]+/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned.replace(/\.[a-z0-9]{2,5}$/i, '') || 'study-material';
}

function mimeTypeForExtension(ext: string, fallback?: string) {
  const normalized = String(fallback || '').toLowerCase();
  if (normalized) return normalized;
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'epub') return 'application/epub+zip';
  return 'application/octet-stream';
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Could not read downloaded file.'));
    reader.readAsDataURL(blob);
  });
}

function validateDownloadedBase64(base64: string, mimeType: string) {
  if (!base64) {
    throw new Error('Downloaded file is empty. Please ask admin to re-upload this material.');
  }
  const mime = String(mimeType || '').toLowerCase();
  if (mime !== 'application/pdf') return;

  try {
    const binary = atob(base64.slice(0, 12));
    if (!binary.startsWith('%PDF')) {
      throw new Error('Downloaded file is not a valid PDF. Please ask admin to delete and re-upload this material.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('valid PDF')) throw error;
    throw new Error('Downloaded file is not a valid PDF. Please ask admin to delete and re-upload this material.');
  }
}

async function openDownloadedFile(localUri: string, mimeType: string, title: string) {
  const contentUri = await FileSystem.getContentUriAsync(localUri);
  if (Platform.OS === 'android') {
    await Share.share({
      title,
      message: `${title} downloaded. Choose a PDF viewer to open it.`,
      url: contentUri
    });
    return;
  }
  await Share.share({ url: contentUri, title });
}

export async function downloadFreeStudyResource(
  token: string,
  resourceId: string,
  displayName: string,
  options: { originalName?: string; mimeType?: string; filename?: string } = {}
) {
  const ext = pickExtension(options.filename || options.originalName || '', displayName, options.mimeType);
  const baseName = safeBaseName(options.originalName || displayName, options.filename || '');
  const mimeType = mimeTypeForExtension(ext, options.mimeType);
  const dest = `${FileSystem.documentDirectory}${Date.now()}-${baseName}.${ext}`;
  const url = `${getApiBase()}${freeStudyDownloadPath(resourceId)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: '*/*'
    }
  });

  if (!response.ok) {
    let message = 'Could not download file.';
    try {
      const data = await response.json();
      message = String(data.error || data.message || message);
    } catch {
      try {
        const text = await response.text();
        if (text && !text.startsWith('<')) message = text.slice(0, 180);
      } catch {
        // ignore
      }
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error('Downloaded file is empty. Please ask admin to re-upload this material.');
  }

  const base64 = await blobToBase64(blob);
  validateDownloadedBase64(base64, mimeType);
  await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
  await openDownloadedFile(dest, mimeType, displayName);
}
