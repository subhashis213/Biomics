import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WebView } from 'react-native-webview';
import { resolveApiAssetUrl } from '@/src/api/client';
import { resolveYouTubeVideoId } from '@/src/utils/video';
import { useTheme } from '@/src/theme/ThemeContext';
import { VideoPlayerDirect } from './VideoPlayerDirect';

const PLAYER_ORIGIN = 'https://biomicshub.app';

function buildPremiumYouTubeHtml(videoId: string, fullscreen = false) {
  const params = new URLSearchParams({
    autoplay: '1',
    playsinline: fullscreen ? '0' : '1',
    modestbranding: '1',
    rel: '0',
    controls: '1',
    fs: '1',
    iv_load_policy: '3',
    disablekb: '1',
    enablejsapi: '1',
    origin: PLAYER_ORIGIN
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
    .wrap { position: absolute; inset: 0; }
    iframe { width: 100%; height: 100%; border: 0; display: block; }
  </style>
</head>
<body>
  <div class="wrap">
    <iframe
      src="https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}"
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
  </div>
</body>
</html>`;
}

function isExternalYouTubeUrl(url: string) {
  const lower = url.toLowerCase();
  return (
    lower.includes('youtube.com/watch') ||
    lower.includes('youtube.com/channel') ||
    lower.includes('youtube.com/user') ||
    lower.includes('youtube.com/@') ||
    lower.includes('m.youtube.com') ||
    lower.includes('youtu.be/')
  );
}

function YoutubeFrame({ videoId, fullscreen }: { videoId: string; fullscreen?: boolean }) {
  const html = useMemo(() => buildPremiumYouTubeHtml(videoId, fullscreen), [videoId, fullscreen]);
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html, baseUrl: PLAYER_ORIGIN }}
      style={styles.webview}
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      bounces={false}
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(request) => !isExternalYouTubeUrl(request.url || '')}
      onOpenWindow={() => {}}
    />
  );
}

export default function VideoPlayer({ url }: { url: string }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [fullscreen, setFullscreen] = useState(false);
  const raw = String(url || '').trim();
  const ytId = resolveYouTubeVideoId(raw);
  const direct = !ytId ? (/^https?:\/\//i.test(raw) ? raw : resolveApiAssetUrl(raw)) : '';
  const playerHeight = Math.round(((width - 32) * 9) / 16);

  if (!raw) return null;

  if (ytId) {
    return (
      <>
        <View style={[styles.wrap, { borderColor: colors.border, height: playerHeight }]}>
          <YoutubeFrame videoId={ytId} />
          <Pressable style={styles.fullscreenBtn} onPress={() => setFullscreen(true)} hitSlop={8}>
            <Ionicons name="expand" size={18} color="#fff" />
          </Pressable>
        </View>
        <Modal visible={fullscreen} animationType="fade" supportedOrientations={['portrait', 'landscape']}>
          <View style={styles.modal}>
            <YoutubeFrame videoId={ytId} fullscreen />
            <Pressable style={styles.closeBtn} onPress={() => setFullscreen(false)}>
              <Ionicons name="contract" size={22} color="#fff" />
              <Text style={styles.closeText}>Exit fullscreen</Text>
            </Pressable>
          </View>
        </Modal>
      </>
    );
  }

  if (direct) return <VideoPlayerDirect url={direct} />;
  return null;
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative'
  },
  webview: { flex: 1, backgroundColor: '#000' },
  fullscreenBtn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modal: { flex: 1, backgroundColor: '#000' },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999
  },
  closeText: { color: '#fff', fontWeight: '700', fontSize: 13 }
});
