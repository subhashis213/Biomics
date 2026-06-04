import * as FileSystem from 'expo-file-system';
import * as Linking from 'expo-linking';
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

async function openDownloadedFile(localUri: string) {
  if (Platform.OS === 'android') {
    try {
      const contentUri = await FileSystem.getContentUriAsync(localUri);
      await Linking.openURL(contentUri);
      return;
    } catch {
      // fall through to share
    }
  }
  await Share.share({ url: localUri, title: 'Free study material' });
}

export async function downloadFreeStudyResource(
  token: string,
  resourceId: string,
  displayName: string,
  options: { originalName?: string; mimeType?: string; filename?: string } = {}
) {
  const url = `${getApiBase()}${freeStudyDownloadPath(resourceId)}`;
  const ext = pickExtension(options.filename || options.originalName || '', displayName, options.mimeType);
  const baseName = safeBaseName(options.originalName || displayName, options.filename || '');
  const dest = `${FileSystem.documentDirectory}${Date.now()}-${baseName}.${ext}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/pdf,application/octet-stream,*/*'
    },
    redirect: 'follow'
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
  await openDownloadedFile(dest);
}
