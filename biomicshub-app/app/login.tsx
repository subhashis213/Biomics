import { useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { Card, ErrorBanner, Field, PasswordField, PrimaryButton, Screen, Subtitle, Title } from '@/src/components/ui';

export default function LoginScreen() {
  const { loginAuto } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Enter username and password.');
      return;
    }
    setSubmitting(true);
    try {
      const detectedRole = await loginAuto(username.trim(), password);
      router.replace(detectedRole === 'admin' ? '/admin' : '/student');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Image source={require('@/assets/images/icon.png')} style={styles.logo} />
            <Title>Welcome to BiomicsHub</Title>
            <Subtitle>Sign in — we’ll take you to the right dashboard automatically.</Subtitle>
          </View>

          <Card>
            <ErrorBanner message={error} />
            <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="Your username" />
            <PasswordField label="Password" value={password} onChangeText={setPassword} placeholder="Your password" />

            <Pressable onPress={() => router.push('/forgot-password')} style={styles.forgotWrap}>
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>

            <PrimaryButton label={submitting ? 'Signing in…' : 'Sign in'} onPress={handleLogin} disabled={submitting} />
          </Card>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New student?</Text>
            <Pressable onPress={() => router.push('/register')}>
              <Text style={styles.linkStrong}>Create an account</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
    brand: { marginBottom: 24, alignItems: 'center' },
    logo: { width: 84, height: 84, borderRadius: 20, marginBottom: 12 },
    forgotWrap: { alignSelf: 'flex-end', marginBottom: 14 },
    link: { color: c.accent, fontWeight: '600', fontSize: 13 },
    footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 20 },
    footerText: { color: c.muted },
    linkStrong: { color: c.accent, fontWeight: '800' }
  });
}
