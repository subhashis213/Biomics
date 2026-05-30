import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { resetPassword } from '@/src/api/auth';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { Card, ErrorBanner, Field, PasswordField, PrimaryButton, Screen, Subtitle, SuccessBanner, Title } from '@/src/components/ui';

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime());
}

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [username, setUsername] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleReset() {
    setError('');
    setSuccess('');
    if (!username.trim() || !birthDate.trim() || !password) {
      setError('Please fill all fields.');
      return;
    }
    if (!isValidDate(birthDate.trim())) {
      setError('Birth date must be in YYYY-MM-DD format.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(username.trim(), birthDate.trim(), password);
      setSuccess('Password updated. You can sign in now.');
      setTimeout(() => router.replace('/login'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.backRow}>
            <Ionicons name="chevron-back" size={20} color={colors.accent} />
            <Text style={styles.back}>Back to sign in</Text>
          </Pressable>

          <Title>Reset password</Title>
          <Subtitle>Verify your identity with your birth date to set a new password.</Subtitle>
          <View style={{ height: 12 }} />

          <Card>
            <ErrorBanner message={error} />
            <SuccessBanner message={success} />
            <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="Your username" />
            <Field label="Birth date" value={birthDate} onChangeText={setBirthDate} placeholder="YYYY-MM-DD" />
            <PasswordField label="New password" value={password} onChangeText={setPassword} placeholder="Min 8 characters" />
            <PasswordField label="Confirm new password" value={confirm} onChangeText={setConfirm} placeholder="Re-enter password" />
            <PrimaryButton label={submitting ? 'Updating…' : 'Update password'} onPress={handleReset} disabled={submitting} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scroll: { padding: 20, paddingTop: 28 },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
    back: { color: c.accent, fontWeight: '600' }
  });
}
