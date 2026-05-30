import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Stack } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchCommunityChatToken } from '@/src/api/chat';
import { ErrorBanner, Screen } from '@/src/components/ui';
import { buildCommunityChatHtml } from '@/src/utils/communityChatHtml';

export default function CommunityChatScreen() {
  const { token } = useAuth();
  const { colors, mode } = useTheme();
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const cfg = await fetchCommunityChatToken(token);
      setHtml(buildCommunityChatHtml(cfg, mode));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open community chat.');
    } finally {
      setLoading(false);
    }
  }, [token, mode]);

  useEffect(() => { load(); }, [load]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Community chat' }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.muted, marginTop: 10 }}>Connecting to community chat…</Text>
        </View>
      ) : null}
      {error ? (
        <View style={{ padding: 16 }}>
          <ErrorBanner message={error} />
        </View>
      ) : null}
      {!loading && html ? (
        <WebView
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://biomicshub.app' }}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          style={{ flex: 1, backgroundColor: colors.bg }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' }
});
