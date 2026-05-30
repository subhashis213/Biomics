import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, PermissionsAndroid, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import {
  fetchStudentLiveToken,
  fetchTeacherLiveToken,
  startLiveClass
} from '@/src/api/live';
import { ErrorBanner, PrimaryButton, Screen } from '@/src/components/ui';
import { buildLiveClassRoomHtml } from '@/src/utils/liveClassRoomHtml';
import { decodeRouteParam } from '@/src/utils/format';

export default function LiveRoomScreen() {
  const params = useLocalSearchParams<{ classId: string; mode?: string }>();
  const classId = decodeRouteParam(params.classId);
  const mode = decodeRouteParam(params.mode) || 'student';
  const isAdmin = mode === 'admin';
  const { token, username } = useAuth();
  const { colors, mode: themeMode } = useTheme();
  const [permReady, setPermReady] = useState(Platform.OS !== 'android');
  const [permError, setPermError] = useState('');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        const perms = isAdmin
          ? [PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]
          : [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
        const result = await PermissionsAndroid.requestMultiple(perms);
        const micOk = result[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === 'granted';
        if (!micOk) setPermError('Microphone access is needed to join the live class.');
        if (isAdmin && result[PermissionsAndroid.PERMISSIONS.CAMERA] !== 'granted') {
          setPermError('Camera and microphone access are needed to conduct a live class.');
        }
      } catch {
        setPermError('Could not request camera/microphone permission.');
      } finally {
        setPermReady(true);
      }
    })();
  }, [isAdmin]);

  const loadRoom = useCallback(async () => {
    if (!token || !classId) return;
    setLoading(true);
    setError('');
    try {
      if (isAdmin) {
        try {
          await startLiveClass(token, classId);
        } catch (startErr) {
          const msg = startErr instanceof Error ? startErr.message : '';
          if (!/already|live|active/i.test(msg)) throw startErr;
        }
      }
      const res = isAdmin
        ? await fetchTeacherLiveToken(token, classId)
        : await fetchStudentLiveToken(token, classId);
      if (!res.token || !res.livekitUrl) throw new Error('Live class connection details were not returned.');
      setHtml(
        buildLiveClassRoomHtml(
          {
            role: isAdmin ? 'teacher' : 'student',
            displayName: username || (isAdmin ? 'Admin' : 'Student'),
            livekitUrl: res.livekitUrl,
            token: res.token,
            roomName: res.roomName,
            classTitle: res.liveClass?.title
          },
          themeMode
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to live class.');
      setHtml('');
    } finally {
      setLoading(false);
    }
  }, [token, classId, isAdmin, username, themeMode]);

  useEffect(() => {
    if (permReady) loadRoom();
  }, [permReady, loadRoom]);

  const onWebMessage = useCallback((raw: string) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'leave') router.back();
    } catch { /* ignore */ }
  }, []);

  const title = useMemo(() => (isAdmin ? 'Conduct live class' : 'Live class'), [isAdmin]);

  if (!permReady) {
    return (
      <Screen>
        <Stack.Screen options={{ title }} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      {permError ? (
        <View style={{ padding: 16 }}>
          <ErrorBanner message={permError} />
        </View>
      ) : null}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.muted, marginTop: 10 }}>Connecting to live class…</Text>
        </View>
      ) : null}
      {error ? (
        <View style={{ padding: 16, gap: 12 }}>
          <ErrorBanner message={error} />
          <PrimaryButton label="Try again" onPress={loadRoom} />
          <PrimaryButton label="Go back" variant="outline" onPress={() => router.back()} />
        </View>
      ) : null}
      {!loading && !error && html ? (
        <WebView
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://biomicshub.app' }}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          allowsFullscreenVideo
          onMessage={(e) => onWebMessage(e.nativeEvent.data)}
          style={{ flex: 1, backgroundColor: colors.bg }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' }
});
