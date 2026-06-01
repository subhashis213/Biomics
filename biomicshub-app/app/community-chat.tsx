import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchCommunityChatToken, uploadCommunityAttachment } from '@/src/api/chat';
import { resolveApiAssetUrl } from '@/src/api/client';
import { ErrorBanner, Screen } from '@/src/components/ui';
import { buildCommunityChatHtml } from '@/src/utils/communityChatHtml';

export default function CommunityChatScreen() {
  const { token } = useAuth();
  const { colors, mode } = useTheme();
  const webRef = useRef<WebView>(null);
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

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

  const injectAttachment = useCallback((payload: { url: string; mime: string; name: string; type: string }) => {
    const script = `window.__onNativeAttachmentUploaded(${JSON.stringify(payload)}); true;`;
    webRef.current?.injectJavaScript(script);
  }, []);

  const pickImage = useCallback(async () => {
    if (!token) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const uploaded = await uploadCommunityAttachment(token, {
        uri: asset.uri,
        name: asset.fileName || `photo-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg'
      });
      injectAttachment({
        url: resolveApiAssetUrl(uploaded.absoluteUrl || uploaded.url),
        mime: uploaded.mime,
        name: uploaded.name,
        type: uploaded.type
      });
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Could not upload attachment.');
    } finally {
      setUploading(false);
    }
  }, [token, injectAttachment]);

  const pickDocument = useCallback(async () => {
    if (!token) return;
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['image/*', 'application/pdf']
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const uploaded = await uploadCommunityAttachment(token, {
        uri: asset.uri,
        name: asset.name || `file-${Date.now()}`,
        type: asset.mimeType || 'application/octet-stream'
      });
      injectAttachment({
        url: resolveApiAssetUrl(uploaded.absoluteUrl || uploaded.url),
        mime: uploaded.mime,
        name: uploaded.name,
        type: uploaded.type
      });
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Could not upload attachment.');
    } finally {
      setUploading(false);
    }
  }, [token, injectAttachment]);

  const onWebMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.type === 'REQUEST_ATTACHMENT') {
        Alert.alert('Attach file', 'Choose what you want to share in community chat.', [
          { text: 'Photo', onPress: () => { pickImage(); } },
          { text: 'Document / PDF', onPress: () => { pickDocument(); } },
          { text: 'Cancel', style: 'cancel' }
        ]);
      }
    } catch {
      // ignore malformed bridge messages
    }
  }, [pickImage, pickDocument]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Community chat' }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.muted, marginTop: 10 }}>Connecting to community chat…</Text>
        </View>
      ) : null}
      {uploading ? (
        <View style={[styles.uploadBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={{ color: colors.muted, marginLeft: 8 }}>Uploading attachment…</Text>
        </View>
      ) : null}
      {error ? (
        <View style={{ padding: 16 }}>
          <ErrorBanner message={error} />
        </View>
      ) : null}
      {!loading && html ? (
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://biomicshub.app' }}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          allowFileAccess
          allowFileAccessFromFileURLs
          onMessage={onWebMessage}
          style={{ flex: 1, backgroundColor: colors.bg }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  uploadBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1
  }
});
