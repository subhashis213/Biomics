import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { sendNotification } from '@/src/api/admin';
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

  async function handleSend() {
    setError('');
    setSuccess('');
    if (!title.trim() || !message.trim()) {
      setError('Title and message are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await sendNotification(token!, { title: title.trim(), message: message.trim(), audience });
      setSuccess(res.message);
      setTitle('');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Eyebrow>Push notification</Eyebrow>
          <Title>Send to students</Title>
          <Subtitle>Delivered to student phones via FCM and saved to in-app notifications.</Subtitle>
          <View style={{ height: 12 }} />

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
                <Text style={[styles.switchText, audience === 'students' && styles.switchTextOn]}>Students</Text>
              </Pressable>
              <Pressable onPress={() => setAudience('all')} style={[styles.switchBtn, audience === 'all' && styles.switchOn]}>
                <Ionicons name="globe-outline" size={16} color={audience === 'all' ? colors.accentText : colors.muted} />
                <Text style={[styles.switchText, audience === 'all' && styles.switchTextOn]}>Everyone</Text>
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
    switchText: { color: c.muted, fontWeight: '700' },
    switchTextOn: { color: c.accentText }
  });
}
