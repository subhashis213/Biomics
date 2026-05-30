import * as FileSystem from 'expo-file-system';
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';
import { getApiBase } from '@/src/api/client';
import { materialDownloadUrl } from '@/src/api/learning';

function pickExtension(filename: string, displayName: string) {
  const fromFile = String(filename || '').split('.').pop();
  if (fromFile && fromFile.length <= 6) return fromFile.toLowerCase();
  const fromName = String(displayName || '').split('.').pop();
  if (fromName && fromName.length <= 6) return fromName.toLowerCase();
  return 'pdf';
}

function safeBaseName(displayName: string, filename: string) {
  const raw = String(displayName || filename || 'study-material').trim();
  const cleaned = raw.replace(/[^\w.\-() ]+/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned || 'study-material';
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

async function openDownloadedFile(localUri: string, mimeType: string) {
  if (Platform.OS === 'android') {
    try {
      const contentUri = await FileSystem.getContentUriAsync(localUri);
      await Linking.openURL(contentUri);
      return;
    } catch {
      // fall through to share
    }
  }
  await Share.share({ url: localUri, title: 'Study material' });
}

export async function downloadStudyMaterial(token: string, videoId: string, filename: string, displayName: string) {
  const url = `${getApiBase()}${materialDownloadUrl(videoId, filename)}`;
  const ext = pickExtension(filename, displayName);
  const baseName = safeBaseName(displayName, filename);
  const dest = `${FileSystem.documentDirectory}${Date.now()}-${baseName}.${ext}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: '*/*'
    }
  });

  if (!response.ok) {
    let message = 'Could not download study material.';
    try {
      const data = await response.json();
      message = String(data.error || data.message || message);
    } catch {
      try {
        const text = await response.text();
        if (text && !text.startsWith('<')) message = text.slice(0, 180);
      } catch { /* ignore */ }
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const base64 = await blobToBase64(blob);
  await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });

  const mimeType = ext === 'pdf' ? 'application/pdf' : 'application/octet-stream';
  await openDownloadedFile(dest, mimeType);
}
