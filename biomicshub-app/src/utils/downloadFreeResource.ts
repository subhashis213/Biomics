import * as FileSystem from 'expo-file-system';
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';
import { getApiBase } from '@/src/api/client';
import { freeStudyDownloadLinkPath } from '@/src/api/freeStudyResources';

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

async function fetchSignedDownloadUrl(token: string, resourceId: string) {
  const linkUrl = `${getApiBase()}${freeStudyDownloadLinkPath(resourceId)}`;
  const response = await fetch(linkUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data.error || data.message || 'Could not download file.'));
  }
  const resolved = String(data.url || '').trim();
  if (!/^https?:\/\//i.test(resolved)) {
    throw new Error('Download link is unavailable. Please ask admin to re-upload this material.');
  }
  return resolved;
}

async function downloadToFile(url: string, dest: string) {
  const download = FileSystem.createDownloadResumable(url, dest);
  const result = await download.downloadAsync();
  if (!result) {
    throw new Error('Could not download file.');
  }
  if (result.status !== 200) {
    throw new Error(`Could not download file (HTTP ${result.status}).`);
  }
  const info = await FileSystem.getInfoAsync(result.uri);
  if (!info.exists || !info.size) {
    throw new Error('Downloaded file is empty. Please ask admin to re-upload this material.');
  }
  return result.uri;
}

export async function downloadFreeStudyResource(
  token: string,
  resourceId: string,
  displayName: string,
  options: { originalName?: string; mimeType?: string; filename?: string } = {}
) {
  const ext = pickExtension(options.filename || options.originalName || '', displayName, options.mimeType);
  const baseName = safeBaseName(options.originalName || displayName, options.filename || '');
  const dest = `${FileSystem.documentDirectory}${Date.now()}-${baseName}.${ext}`;

  const signedUrl = await fetchSignedDownloadUrl(token, resourceId);

  try {
    const localUri = await downloadToFile(signedUrl, dest);
    await openDownloadedFile(localUri);
    return;
  } catch (error) {
    try {
      await Linking.openURL(signedUrl);
      return;
    } catch {
      throw error instanceof Error ? error : new Error('Could not download file.');
    }
  }
}
