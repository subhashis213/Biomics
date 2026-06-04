import * as FileSystem from 'expo-file-system';
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';
import { getApiBase } from '@/src/api/client';
import { freeStudyDownloadPath } from '@/src/api/freeStudyResources';

function sanitizeFileName(value: string) {
  return String(value || 'study-material').replace(/[^\w.\-() ]+/g, '_').trim() || 'study-material';
}

function ensureExtension(name: string, mimeType?: string) {
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  const mime = String(mimeType || '').toLowerCase();
  if (mime === 'application/pdf') return `${name}.pdf`;
  if (mime.startsWith('image/')) return `${name}.jpg`;
  if (mime.includes('word')) return `${name}.docx`;
  if (mime.includes('presentation')) return `${name}.pptx`;
  if (mime.includes('epub')) return `${name}.epub`;
  return `${name}.pdf`;
}

async function readErrorMessage(response: FileSystem.DownloadResult | Response) {
  if ('uri' in response) {
    if (response.status >= 400) {
      try {
        const text = await FileSystem.readAsStringAsync(response.uri);
        const data = JSON.parse(text);
        return String(data.error || data.message || 'Could not download file.');
      } catch {
        return 'Could not download file.';
      }
    }
    return '';
  }

  try {
    const data = await response.json();
    return String(data.error || data.message || 'Could not download file.');
  } catch {
    return 'Could not download file.';
  }
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

export async function downloadFreeStudyResource(
  token: string,
  resourceId: string,
  displayName: string,
  options: { originalName?: string; mimeType?: string } = {}
) {
  const url = `${getApiBase()}${freeStudyDownloadPath(resourceId)}`;
  const fileName = ensureExtension(
    sanitizeFileName(options.originalName || displayName),
    options.mimeType
  );
  const dest = `${FileSystem.documentDirectory}${Date.now()}-${fileName}`;

  const result = await FileSystem.downloadAsync(url, dest, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: '*/*'
    }
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(await readErrorMessage(result));
  }

  await openDownloadedFile(result.uri);
}
