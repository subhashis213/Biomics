import * as FileSystem from 'expo-file-system';
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';
import { getApiBase } from '@/src/api/client';
import { freeStudyDownloadPath } from '@/src/api/freeStudyResources';

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
      // fall through
    }
  }
  await Share.share({ url: localUri, title: 'Free study material' });
}

export async function downloadFreeStudyResource(token: string, resourceId: string, displayName: string) {
  const url = `${getApiBase()}${freeStudyDownloadPath(resourceId)}`;
  const safeName = String(displayName || 'study-material').replace(/[^\w.\-() ]+/g, '_').trim() || 'study-material';
  const dest = `${FileSystem.documentDirectory}${Date.now()}-${safeName}.pdf`;

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
    } catch { /* ignore */ }
    throw new Error(message);
  }

  const blob = await response.blob();
  const base64 = await blobToBase64(blob);
  await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
  await openDownloadedFile(dest);
}
