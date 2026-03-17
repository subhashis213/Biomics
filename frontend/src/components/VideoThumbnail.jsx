export default function VideoThumbnail({ url, title }) {
  try {
    const parsed = new URL(url);
    let videoId = '';
    if (parsed.hostname === 'youtu.be') {
      videoId = parsed.pathname.slice(1);
    } else if (parsed.hostname.includes('youtube.com')) {
      videoId = parsed.searchParams.get('v') || '';
    }

    if (!videoId) return null;
    return <img className="video-thumb" src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} alt={`${title} thumbnail`} />;
  } catch {
    return null;
  }
}
