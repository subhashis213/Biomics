import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { isGoogleSignInConfigured } from '@/src/config/google';
import GoogleIcon from '@/src/components/auth/GoogleIcon';
import GoogleProfileSheet, { GoogleProfileDraft } from '@/src/components/auth/GoogleProfileSheet';
import { googleSignInErrorMessage, signInWithGoogle } from '@/src/utils/googleSignIn';
import { lightColors } from '@/src/theme/theme';
import { Card, ErrorBanner, Field, PasswordField, PrimaryButton, Screen } from '@/src/components/ui';

/** Auth screens always use the light palette for a clean, welcoming first impression. */
const colors = lightColors;

export default function LoginScreen() {
  const { setMode } = useTheme();
  const { loginAuto, loginWithGoogleIdToken, loginWithGoogleResult, completeGoogleProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(insets.top), [insets.top]);
  const googleEnabled = isGoogleSignInConfigured();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [profileDraft, setProfileDraft] = useState<GoogleProfileDraft | null>(null);
  const [profileError, setProfileError] = useState('');
  const [profileSubmitting, setProfileSubmitting] = useState(false);

  useEffect(() => {
    setMode('light');
  }, [setMode]);

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

  async function handleGoogleSignIn() {
    setError('');
    if (!googleEnabled) {
      setError('Google sign-in is not configured in this build yet.');
      return;
    }
    setGoogleSubmitting(true);
    try {
      const outcome = await signInWithGoogle();
      const result =
        outcome.mode === 'id_token'
          ? await loginWithGoogleIdToken(outcome.idToken)
          : await loginWithGoogleResult(outcome.login);
      if (result.status === 'profile_required') {
        setProfileDraft({
          completionToken: result.completionToken,
          email: String(result.profile.email || '').trim(),
          name: String(result.profile.name || '').trim(),
          phone: String(result.profile.phone || '').trim(),
          birthDate: String(result.profile.birthDate || '').trim()
        });
        setProfileError('');
        return;
      }
      router.replace('/student');
    } catch (err) {
      setError(googleSignInErrorMessage(err));
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function handleGoogleProfileSubmit(phone: string, birthDate: string) {
    if (!profileDraft?.completionToken) return;
    setProfileError('');
    setProfileSubmitting(true);
    try {
      await completeGoogleProfile(profileDraft.completionToken, phone, birthDate);
      setProfileDraft(null);
      router.replace('/student');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to complete profile.');
    } finally {
      setProfileSubmitting(false);
    }
  }

  return (
    <Screen style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.logoWrap}>
              <Image source={require('@/assets/images/icon.png')} style={styles.logo} />
            </View>
            <Text style={styles.heroTitle}>Welcome to BiomicsHub</Text>
            <Text style={styles.heroSubtitle}>
              Courses, test series, live classes & free study material — all in one place.
            </Text>
          </View>

          <Card style={styles.formCard}>
            <Text style={styles.formTitle}>Sign in</Text>
            <Text style={styles.formHint}>
              Use your username and password. We&apos;ll take you to the right dashboard automatically.
            </Text>

            <ErrorBanner message={error} />

            <Field
              label="Username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              placeholder="Your username"
            />
            <PasswordField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
            />

            <Pressable onPress={() => router.push('/forgot-password')} style={styles.forgotWrap}>
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>

            <PrimaryButton
              label={submitting ? 'Signing in…' : 'Sign in'}
              onPress={handleLogin}
              disabled={submitting || googleSubmitting}
            />

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              onPress={handleGoogleSignIn}
              disabled={submitting || googleSubmitting || !googleEnabled}
              style={({ pressed }) => [
                styles.googleBtn,
                !googleEnabled && styles.googleBtnDisabled,
                pressed && styles.googleBtnPressed
              ]}
            >
              <GoogleIcon size={20} />
              <Text style={styles.googleBtnText}>
                {googleSubmitting ? 'Signing in with Google…' : 'Continue with Google'}
              </Text>
            </Pressable>
          </Card>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New student?</Text>
            <Pressable onPress={() => router.push('/register')}>
              <Text style={styles.linkStrong}>Create an account</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <GoogleProfileSheet
        visible={Boolean(profileDraft)}
        draft={profileDraft}
        submitting={profileSubmitting}
        error={profileError}
        onClose={() => {
          if (!profileSubmitting) setProfileDraft(null);
        }}
        onSubmit={handleGoogleProfileSubmit}
      />
    </Screen>
  );
}

function createStyles(topInset: number) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.bg
    },
    flex: { flex: 1 },
    scroll: {
      flexGrow: 1,
      paddingTop: Math.max(topInset, 12),
      paddingHorizontal: 20,
      paddingBottom: 32
    },
    hero: {
      alignItems: 'center',
      paddingTop: 16,
      paddingBottom: 24
    },
    logoWrap: {
      width: 88,
      height: 88,
      borderRadius: 22,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 12,
      elevation: 4
    },
    logo: {
      width: 68,
      height: 68,
      borderRadius: 16
    },
    heroTitle: {
      color: colors.text,
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: -0.3,
      textAlign: 'center'
    },
    heroSubtitle: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
      marginTop: 8,
      maxWidth: 320,
      paddingHorizontal: 8
    },
    formCard: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: 20,
      padding: 20,
      marginBottom: 8,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 10,
      elevation: 2
    },
    formTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '800'
    },
    formHint: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
      marginBottom: 14
    },
    forgotWrap: {
      alignSelf: 'flex-end',
      marginBottom: 14,
      marginTop: -4
    },
    link: {
      color: colors.accent,
      fontWeight: '700',
      fontSize: 13
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginVertical: 18
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border
    },
    dividerText: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: '500'
    },
    googleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: colors.card
    },
    googleBtnPressed: {
      backgroundColor: colors.cardAlt
    },
    googleBtnDisabled: {
      opacity: 0.55
    },
    googleBtnText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700'
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      marginTop: 20
    },
    footerText: {
      color: colors.muted,
      fontSize: 14
    },
    linkStrong: {
      color: colors.accent,
      fontWeight: '800',
      fontSize: 14
    }
  });
}
