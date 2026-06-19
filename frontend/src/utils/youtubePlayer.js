/** Shared YouTube embed helpers — minimal branding, reliable HD playback */

export function resolveYouTubeVideoId(rawUrl) {
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

    const safeId = String(videoId).split(/[?&#/]/)[0].trim();
    return safeId || '';
  } catch {
    return '';
  }
}

/** YouTube picks stream quality from the pixel size passed to the player */
export function getYouTubePlayerSize(container) {
  if (!container) return { width: 1280, height: 720 };
  const width = Math.max(640, Math.floor(container.clientWidth || 0));
  let height = Math.floor(container.clientHeight || 0);
  if (height < 200) {
    height = Math.floor(width * 9 / 16);
  }
  height = Math.max(360, height);
  return { width, height };
}

export function syncYouTubePlayerSize(player, container) {
  if (!player?.setSize || !container) return;
  const { width, height } = getYouTubePlayerSize(container);
  try {
    player.setSize(width, height);
  } catch {
    // ignore resize errors
  }
}

export function getYouTubePlayerVars({ autoplay = 0 } = {}) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return {
    rel: 0,
    modestbranding: 1,
    controls: 0,
    disablekb: 1,
    enablejsapi: 1,
    iv_load_policy: 3,
    showinfo: 0,
    fs: 0,
    cc_load_policy: 0,
    playsinline: 1,
    autoplay: autoplay ? 1 : 0,
    origin,
    widget_referrer: origin,
    color: 'white',
    hl: 'en'
  };
}

export const YOUTUBE_NO_COOKIE_HOST = 'https://www.youtube-nocookie.com';
