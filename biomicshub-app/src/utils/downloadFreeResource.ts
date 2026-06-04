import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { getApiBase } from '@/src/api/client';
import { freeStudyDownloadPath } from '@/src/api/freeStudyResources';

const SAF = FileSystem.StorageAccessFramework;

export type FreeStudyDownloadResult = {
  fileName: string;
  savedToDownloads: boolean;
  opened: boolean;
};

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

function buildFileName(displayName: string, originalName: string, filename: string, ext: string) {
  const raw = String(originalName || displayName || filename || 'study-material').trim();
  const cleaned = raw.replace(/[^\w.\-() ]+/g, '_').replace(/\s+/g, ' ').trim() || 'study-material';
  if (/\.[a-z0-9]{2,5}$/i.test(cleaned)) return cleaned;
  return `${cleaned}.${ext}`;
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

async function validatePdfHeader(localUri: string) {
  const headerBase64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
    length: 8,
    position: 0
  });
  const binary = atob(headerBase64);
  if (!binary.startsWith('%PDF')) {
    throw new Error('Downloaded file is not a valid PDF. Please ask admin to delete and re-upload this material.');
  }
}

async function saveToAndroidDownloads(localUri: string, fileName: string, mimeType: string) {
  if (Platform.OS !== 'android' || !SAF) return false;

  try {
    const permissions = await SAF.requestDirectoryPermissionsAsync(
      SAF.getUriForDirectoryInRoot('Download')
    );
    if (!permissions.granted) return false;

    const baseName = fileName.replace(/\.[a-z0-9]{2,5}$/i, '') || 'study-material';
    const savedUri = await SAF.createFileAsync(permissions.directoryUri, baseName, mimeType);
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64
    });
    await SAF.writeAsStringAsync(savedUri, base64, {
      encoding: FileSystem.EncodingType.Base64
    });
    return true;
  } catch {
    return false;
  }
}

async function openDownloadedFile(localUri: string, mimeType: string) {
  if (Platform.OS === 'android') {
    const contentUri = await FileSystem.getContentUriAsync(localUri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1,
      type: mimeType
    });
    return true;
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(localUri, { mimeType, dialogTitle: 'Open study material' });
    return true;
  }

  return false;
}

export async function downloadFreeStudyResource(
  token: string,
  resourceId: string,
  displayName: string,
  options: { originalName?: string; mimeType?: string; filename?: string } = {}
): Promise<FreeStudyDownloadResult> {
  const ext = pickExtension(options.filename || options.originalName || '', displayName, options.mimeType);
  const fileName = buildFileName(displayName, options.originalName || '', options.filename || '', ext);
  const mimeType = mimeTypeForExtension(ext, options.mimeType);
  const dest = `${FileSystem.cacheDirectory}${Date.now()}-${fileName}`;
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
  await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });

  if (mimeType === 'application/pdf') {
    await validatePdfHeader(dest);
  }

  const savedToDownloads = await saveToAndroidDownloads(dest, fileName, mimeType);

  let opened = false;
  try {
    opened = await openDownloadedFile(dest, mimeType);
  } catch {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(dest, { mimeType, dialogTitle: 'Open study material' });
      opened = true;
    }
  }

  return { fileName, savedToDownloads, opened };
}
