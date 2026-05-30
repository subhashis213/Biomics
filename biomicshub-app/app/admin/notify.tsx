import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { fetchPushStatus, sendNotification } from '@/src/api/admin';
import { Card, ErrorBanner, Eyebrow, Field, PrimaryButton, Screen, Subtitle, SuccessBanner, Title } from '@/src/components/ui';

export default function AdminNotify() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<'students' | 'all'>('students');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusLoading, setStatusLoading] = useState(true);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushInitError, setPushInitError] = useState<string | null>(null);
  const [studentDevices, setStudentDevices] = useState(0);
  const [adminDevices, setAdminDevices] = useState(0);

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
      // status is optional on older servers
    } finally {
      setStatusLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { loadStatus(); }, [loadStatus]));

  async function handleSend() {
    setError('');
    setSuccess('');
    if (!title.trim() || !message.trim()) {
      setError('Title and message are required.');
      return;
    }
    if (audience === 'students' && studentDevices === 0) {
      setError('No student phones registered. Log in as a student on the phone, allow notifications, then try again — or choose Everyone.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await sendNotification(token!, { title: title.trim(), message: message.trim(), audience });
      const push = res.push;
      let detail = res.message;
      if (push) {
        detail += `\nTargeted: ${push.targeted} · Delivered: ${push.successCount} · Failed: ${push.failureCount}`;
        if (!push.configured && push.reason) detail += `\nFirebase: ${push.reason}`;
        if (push.errors?.length) detail += `\n${push.errors[0].code}: ${push.errors[0].message}`;
      }
      setSuccess(detail);
      setTitle('');
      setMessage('');
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
          <Title>Send to students</Title>
          <Subtitle>Delivered to phones via FCM (lock screen + notification tray) and saved in-app.</Subtitle>
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
            <Text style={styles.hint}>
              Students audience only reaches accounts logged in as students with notifications allowed. Use Everyone to test on your admin phone.
            </Text>
          </Card>

          <Card>
            <ErrorBanner message={error} />
            <SuccessBanner message={success} />
            <Field label="Title" value={title} onChangeText={setTitle} autoCapitalize="sentences" />
            <Text style={styles.label}>Message</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Write your notification…"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              style={styles.textarea}
            />

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

            <PrimaryButton label={submitting ? 'Sending…' : 'Send notification'} onPress={handleSend} disabled={submitting} />
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
    statusMeta: { color: c.muted, fontSize: 13, marginBottom: 8 },
    hint: { color: c.muted, fontSize: 12, lineHeight: 18 },
    label: { color: c.muted, marginBottom: 6, fontSize: 13 },
    textarea: {
      backgroundColor: c.cardAlt,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      color: c.text,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      minHeight: 100,
      textAlignVertical: 'top',
      marginBottom: 14
    },
    switch: { flexDirection: 'row', backgroundColor: c.cardAlt, borderRadius: 10, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: c.border },
    switchBtn: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    switchOn: { backgroundColor: c.accent },
    switchText: { color: c.muted, fontWeight: '700', fontSize: 12 },
    switchTextOn: { color: c.accentText }
  });
}
