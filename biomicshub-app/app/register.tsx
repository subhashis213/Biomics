import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/src/context/AuthContext';
import { fetchRegisterCourses, registerStudent, RegisterCourseOption } from '@/src/api/auth';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import {
  Card,
  DateField,
  ErrorBanner,
  Field,
  LoadingBlock,
  PasswordField,
  PrimaryButton,
  Screen,
  SelectField,
  Subtitle,
  Title
} from '@/src/components/ui';

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime());
}

export default function RegisterScreen() {
  const { loginAuto } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);

  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [courseClass, setCourseClass] = useState('');
  const [city, setCity] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [courses, setCourses] = useState<RegisterCourseOption[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCoursesLoading(true);
      try {
        const res = await fetchRegisterCourses();
        const list = (res.courses || []).filter((course) => course.name);
        if (!cancelled) {
          setCourses(list);
          if (!list.length) setError('No active courses are open for registration right now.');
        }
      } catch {
        if (!cancelled) {
          setCourses([]);
          setError('Could not load active courses. Please try again in a moment.');
        }
      } finally {
        if (!cancelled) setCoursesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const courseOptions = useMemo(
    () => courses.map((course) => ({ value: course.name, label: course.displayName || course.name })),
    [courses]
  );

  async function handleRegister() {
    setError('');
    if (!username.trim() || !phone.trim() || !courseClass.trim() || !city.trim() || !birthDate.trim() || !password) {
      setError('Please fill all required fields.');
      return;
    }
    if (!isValidDate(birthDate.trim())) {
      setError('Please choose a valid birth date.');
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
      await registerStudent({
        username: username.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        class: courseClass.trim(),
        city: city.trim(),
        birthDate: birthDate.trim(),
        password
      });
      await loginAuto(username.trim(), password);
      router.replace('/student');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={() => router.replace('/login')}
            style={styles.backRow}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
          >
            <Ionicons name="chevron-back" size={20} color={colors.accent} />
            <Text style={styles.back}>Back to sign in</Text>
          </Pressable>

          <Title>Create your account</Title>
          <Subtitle>Register as a student to access courses, test series and exams.</Subtitle>
          <View style={{ height: 12 }} />

          <Card>
            <ErrorBanner message={error} />
            <Field label="Username *" value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="Choose a username" />
            <Field label="Phone *" value={phone} onChangeText={setPhone} placeholder="10-digit mobile number" />
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" placeholder="you@example.com" />
            {coursesLoading ? (
              <LoadingBlock label="Loading active courses…" />
            ) : (
              <SelectField
                label="Course / Class *"
                value={courseClass}
                placeholder={courseOptions.length ? 'Select your course' : 'No active courses available'}
                options={courseOptions}
                onChange={setCourseClass}
              />
            )}
            <Field label="City *" value={city} onChangeText={setCity} autoCapitalize="words" placeholder="Your city" />
            <DateField label="Birth date *" value={birthDate} placeholder="Choose your birth date" onChange={setBirthDate} />
            <PasswordField label="Password *" value={password} onChangeText={setPassword} placeholder="Min 8 characters" />
            <PasswordField label="Confirm password *" value={confirm} onChangeText={setConfirm} placeholder="Re-enter password" />
            <PrimaryButton
              label={submitting ? 'Creating account…' : 'Create account'}
              onPress={handleRegister}
              disabled={submitting || coursesLoading || !courseOptions.length}
            />
          </Card>
          <Text style={styles.note}>Tip: your birth date is also used to recover your password.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function createStyles(c: ThemeColors, topInset: number) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scroll: {
      paddingHorizontal: 20,
      paddingTop: Math.max(topInset + 8, 16),
      paddingBottom: 28
    },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 2,
      marginBottom: 20,
      paddingVertical: 6,
      minHeight: 44
    },
    back: { color: c.accent, fontWeight: '600', fontSize: 15 },
    note: { color: c.muted, fontSize: 12, textAlign: 'center', marginTop: 4 }
  });
}
