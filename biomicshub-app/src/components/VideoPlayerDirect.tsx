import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '@/src/theme/ThemeContext';

function buildDirectHtml(url: string) {
  const safe = url.replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <style>
      * { margin: 0; padding: 0; }
      html, body { background: #000; height: 100%; }
      video { width: 100%; height: 100%; background: #000; object-fit: contain; }
    </style>
  </head>
  <body>
    <video src="${safe}" controls playsinline webkit-playsinline></video>
  </body>
</html>`;
}

export function VideoPlayerDirect({ url }: { url: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { borderColor: colors.border }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html: buildDirectHtml(url), baseUrl: 'https://biomicshub.app' }}
        style={styles.webview}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1
  },
  webview: { flex: 1, backgroundColor: '#000' }
});
