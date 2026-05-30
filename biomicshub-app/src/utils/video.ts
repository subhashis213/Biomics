import { resolveApiAssetUrl } from '@/src/api/client';

export function resolveYouTubeVideoId(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    let videoId = '';
    if (host === 'youtu.be') {
      videoId = parsed.pathname.slice(1);
    } else if (host.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/watch')) {
        videoId = parsed.searchParams.get('v') || '';
      } else if (parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.split('/embed/')[1] || '';
      } else if (parsed.pathname.startsWith('/shorts/')) {
        videoId = parsed.pathname.split('/shorts/')[1] || '';
      }
    }
    return String(videoId).split(/[?&#/]/)[0].trim();
  } catch {
    return '';
  }
}

export function resolvePlayableUrl(rawUrl: string) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  const ytId = resolveYouTubeVideoId(url);
  if (ytId) return `https://www.youtube.com/embed/${ytId}?playsinline=1&rel=0`;
  if (/^https?:\/\//i.test(url)) return url;
  return resolveApiAssetUrl(url);
}
