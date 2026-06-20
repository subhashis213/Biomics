import { useMemo, useState } from 'react';

const YOUTUBE_THUMB_VARIANTS = ['maxresdefault', 'sddefault', 'hqdefault'];

function extractYouTubeId(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || '';
    }

    if (host.includes('youtube.com')) {
      return (
        parsed.searchParams.get('v') ||
        parsed.pathname.split('/embed/')[1]?.split('/')[0] ||
        parsed.pathname.split('/shorts/')[1]?.split('/')[0] ||
        ''
      );
    }
  } catch {
    return '';
  }

  return '';
}

export default function VideoThumbnail({ url, title }) {
  const videoId = useMemo(() => extractYouTubeId(url), [url]);
  const [variantIndex, setVariantIndex] = useState(0);

  if (!videoId) return null;

  const variant = YOUTUBE_THUMB_VARIANTS[variantIndex] ?? YOUTUBE_THUMB_VARIANTS.at(-1);
  const src = `https://i.ytimg.com/vi/${videoId}/${variant}.jpg`;

  function advanceVariant() {
    setVariantIndex((prev) => Math.min(prev + 1, YOUTUBE_THUMB_VARIANTS.length - 1));
  }

  return (
    <img
      className="video-thumb"
      src={src}
      alt={`${title} thumbnail`}
      loading="lazy"
      decoding="async"
      onError={advanceVariant}
      onLoad={(event) => {
        // YouTube returns a tiny placeholder when maxresdefault is unavailable.
        if (event.currentTarget.naturalWidth <= 120 && variantIndex < YOUTUBE_THUMB_VARIANTS.length - 1) {
          advanceVariant();
        }
      }}
    />
  );
}
