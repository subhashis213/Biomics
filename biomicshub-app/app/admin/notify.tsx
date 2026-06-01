import { useCallback, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { fetchPushStatus, sendNotification } from '@/src/api/admin';
import { uploadHomeBannerImage } from '@/src/api/landing';
import { resolveApiAssetUrl } from '@/src/api/client';
import RichNotificationText, { stripRichMarkup, wrapRichTag } from '@/src/components/RichNotificationText';
import { Card, ErrorBanner, Eyebrow, Field, PrimaryButton, Screen, Subtitle, SuccessBanner, Title } from '@/src/components/ui';

type RichTag = 'b' | 'red' | 'big' | 'h' | 'accent' | 'blue' | 'green';

const FORMAT_BUTTONS: Array<{ tag: RichTag; label: string; color?: string }> = [
  { tag: 'b', label: 'Bold' },
  { tag: 'red', label: 'Red', color: '#d64545' },
  { tag: 'big', label: 'Big' },
  { tag: 'h', label: 'Heading' },
  { tag: 'accent', label: 'Accent' },
  { tag: 'blue', label: 'Blue', color: '#2563eb' },
  { tag: 'green', label: 'Green', color: '#1f9d57' }
];

export default function AdminNotify() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [title, setTitle] = useState('');
  const [messageRich, setMessageRich] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [localPreview, setLocalPreview] = useState('');
  const [audience, setAudience] = useState<'students' | 'all'>('students');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusLoading, setStatusLoading] = useState(true);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushInitError, setPushInitError] = useState<string | null>(null);
  const [studentDevices, setStudentDevices] = useState(0);
  const [adminDevices, setAdminDevices] = useState(0);

  const previewPoster = localPreview || (imageUrl ? resolveApiAssetUrl(imageUrl) : '');
  const previewBody = stripRichMarkup(messageRich) || 'Your notification message…';

  const loadStatus = useCallback(async () => {
    if (!token) return;
    setStatusLoading(true);
    try {
      const res = await fetchPushStatus(token);
      setPushConfigured(Boolean(res.pushConfigured));
      setPushInitError(res.pushInitError || null);
      setStudentDevices(Number(res.studentDevices || 0));
      setAdminDevices(Number(res.adminDevices || 0));
    } catch {
      // optional
    } finally {
      setStatusLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { loadStatus(); }, [loadStatus]));

  function insertTag(tag: RichTag) {
    setMessageRich((prev) => `${prev}${prev && !prev.endsWith('\n') ? ' ' : ''}${wrapRichTag(tag)}`);
  }

  async function pickPoster() {
    setError('');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo permission is required to upload a poster.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.88
    });
    if (result.canceled || !result.assets?.length || !token) return;
    const asset = result.assets[0];
    setLocalPreview(asset.uri);
    setUploading(true);
    try {
      const uploaded = await uploadHomeBannerImage(token, asset.uri);
      setImageUrl(uploaded.imageUrl);
    } catch (err) {
      setLocalPreview('');
      setError(err instanceof Error ? err.message : 'Poster upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function clearPoster() {
    setImageUrl('');
    setLocalPreview('');
  }

  async function handleSend() {
    setError('');
    setSuccess('');
    const plain = stripRichMarkup(messageRich);
    if (!title.trim() || !plain) {
      setError('Title and message are required.');
      return;
    }
    if (audience === 'students' && studentDevices === 0) {
      setError('No student phones registered. Log in as a student, allow notifications, or choose Everyone.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await sendNotification(token!, {
        title: title.trim(),
        message: plain,
        messageRich: messageRich.trim(),
        imageUrl: imageUrl.trim(),
        audience
      });
      const push = res.push;
      let detail = res.message;
      if (push) {
        detail += `\nTargeted: ${push.targeted} · Delivered: ${push.successCount} · Failed: ${push.failureCount}`;
        if (!push.configured && push.reason) detail += `\nFirebase: ${push.reason}`;
        if (push.errors?.length) detail += `\n${push.errors[0].code}: ${push.errors[0].message}`;
      }
      setSuccess(detail);
      setTitle('');
      setMessageRich('');
      setImageUrl('');
      setLocalPreview('');
      loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={statusLoading} onRefresh={loadStatus} tintColor={colors.accent} />}
        >
          <Eyebrow>Push notification</Eyebrow>
          <Title>Send rich alert</Title>
          <Subtitle>Poster image on lock screen (Unacademy style) + bold/colored message in-app.</Subtitle>
          <View style={{ height: 12 }} />

          <Card style={styles.statusCard}>
            <Text style={styles.statusTitle}>Device registration</Text>
            <View style={styles.statusRow}>
              <Ionicons name={pushConfigured ? 'checkmark-circle' : 'alert-circle'} size={18} color={pushConfigured ? colors.success : colors.danger} />
              <Text style={styles.statusText}>
                Firebase {pushConfigured ? 'connected' : 'not configured'}
                {pushInitError ? ` — ${pushInitError}` : ''}
              </Text>
            </View>
            <Text style={styles.statusMeta}>Student phones: {studentDevices} · Admin phones: {adminDevices}</Text>
          </Card>

          <Card>
            <ErrorBanner message={error} />
            <SuccessBanner message={success} />

            <Text style={styles.label}>Notification poster (optional)</Text>
            <Pressable onPress={pickPoster} style={styles.posterPick} disabled={uploading}>
              {previewPoster ? (
                <Image source={{ uri: previewPoster }} style={styles.posterImage} resizeMode="cover" />
              ) : (
                <View style={styles.posterEmpty}>
                  <Ionicons name="image-outline" size={28} color={colors.muted} />
                  <Text style={styles.posterEmptyText}>{uploading ? 'Uploading…' : 'Tap to upload poster'}</Text>
                </View>
              )}
            </Pressable>
            {previewPoster ? (
              <Pressable onPress={clearPoster} style={styles.clearPoster}>
                <Text style={styles.clearPosterText}>Remove poster</Text>
              </Pressable>
            ) : null}

            <Field label="Title" value={title} onChangeText={setTitle} autoCapitalize="sentences" placeholder="e.g. CSIR NET Test Series Live" />

            <Text style={styles.label}>Message — tap a style, then edit the sample text</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.formatRow}>
              {FORMAT_BUTTONS.map((btn) => (
                <Pressable key={btn.tag} onPress={() => insertTag(btn.tag)} style={styles.formatBtn}>
                  <Text style={[styles.formatBtnText, btn.color ? { color: btn.color } : null]}>{btn.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput
              value={messageRich}
              onChangeText={setMessageRich}
              placeholder="Write message… use Bold / Red / Big buttons above"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={5}
              style={styles.textarea}
            />

            <Text style={styles.label}>Live preview</Text>
            <View style={styles.previewCard}>
              <View style={styles.previewAppBar}>
                <Ionicons name="notifications" size={14} color={colors.accent} />
                <Text style={styles.previewAppName}>BiomicsHub · now</Text>
              </View>
              {previewPoster ? (
                <Image source={{ uri: previewPoster }} style={styles.previewPoster} resizeMode="cover" />
              ) : null}
              <View style={styles.previewBody}>
                <Text style={styles.previewTitle}>{title.trim() || 'Notification title'}</Text>
                <RichNotificationText text={messageRich.trim() || previewBody} style={styles.previewMessage} numberOfLines={4} />
              </View>
            </View>

            <Text style={styles.label}>Audience</Text>
            <View style={styles.switch}>
              <Pressable onPress={() => setAudience('students')} style={[styles.switchBtn, audience === 'students' && styles.switchOn]}>
                <Ionicons name="school-outline" size={16} color={audience === 'students' ? colors.accentText : colors.muted} />
                <Text style={[styles.switchText, audience === 'students' && styles.switchTextOn]}>Students ({studentDevices})</Text>
              </Pressable>
              <Pressable onPress={() => setAudience('all')} style={[styles.switchBtn, audience === 'all' && styles.switchOn]}>
                <Ionicons name="globe-outline" size={16} color={audience === 'all' ? colors.accentText : colors.muted} />
                <Text style={[styles.switchText, audience === 'all' && styles.switchTextOn]}>Everyone ({studentDevices + adminDevices})</Text>
              </Pressable>
            </View>

            <PrimaryButton label={submitting ? 'Sending…' : 'Send notification'} onPress={handleSend} disabled={submitting || uploading} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scroll: { padding: 16, paddingBottom: 40 },
    statusCard: { marginBottom: 12 },
    statusTitle: { color: c.text, fontWeight: '800', fontSize: 15, marginBottom: 8 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    statusText: { color: c.text, flex: 1, fontSize: 13 },
    statusMeta: { color: c.muted, fontSize: 13 },
    label: { color: c.muted, marginBottom: 6, fontSize: 13, marginTop: 4 },
    posterPick: {
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.cardAlt,
      marginBottom: 8,
      height: 160
    },
    posterImage: { width: '100%', height: '100%' },
    posterEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 160 },
    posterEmptyText: { color: c.muted, fontWeight: '600' },
    clearPoster: { alignSelf: 'flex-start', marginBottom: 10 },
    clearPosterText: { color: c.danger, fontWeight: '700', fontSize: 13 },
    formatRow: { gap: 8, marginBottom: 10, paddingVertical: 2 },
    formatBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.cardAlt
    },
    formatBtnText: { color: c.text, fontWeight: '800', fontSize: 12 },
    textarea: {
      backgroundColor: c.cardAlt,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      color: c.text,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      minHeight: 120,
      textAlignVertical: 'top',
      marginBottom: 14
    },
    previewCard: {
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      marginBottom: 14
    },
    previewAppBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.cardAlt },
    previewAppName: { color: c.muted, fontSize: 12, fontWeight: '700' },
    previewPoster: { width: '100%', height: 140 },
    previewBody: { padding: 12 },
    previewTitle: { color: c.text, fontWeight: '800', fontSize: 16, marginBottom: 6 },
    previewMessage: { color: c.muted },
    switch: { flexDirection: 'row', backgroundColor: c.cardAlt, borderRadius: 10, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: c.border },
    switchBtn: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    switchOn: { backgroundColor: c.accent },
    switchText: { color: c.muted, fontWeight: '700', fontSize: 12 },
    switchTextOn: { color: c.accentText }
  });
}
