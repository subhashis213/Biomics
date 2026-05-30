import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo } from 'react';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/src/context/AuthContext';
import { CartProvider } from '@/src/context/CartContext';
import { ThemeProvider, useTheme } from '@/src/theme/ThemeContext';
import { addNotificationListeners, initPushNotifications } from '@/src/utils/push';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ ...Ionicons.font });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    initPushNotifications();
    const remove = addNotificationListeners();
    return remove;
  }, []);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <AuthProvider>
        <CartProvider>
          <ThemedNavigation />
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function ThemedNavigation() {
  const { mode, colors } = useTheme();

  const navTheme = useMemo(() => {
    const base = mode === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.bg,
        card: colors.card,
        text: colors.text,
        border: colors.border
      }
    };
  }, [mode, colors]);

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </NavThemeProvider>
  );
}

function RootNavigator() {
  const { token, role, isLoading } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const group = segments[0];

    const publicRoutes = ['login', 'register', 'forgot-password'];
    if (!token) {
      if (!publicRoutes.includes(group as string)) router.replace('/login');
      return;
    }
    const sharedGroups = ['live', 'web', 'community-chat'];
    if (role === 'admin' && group !== 'admin' && !sharedGroups.includes(group as string)) {
      router.replace('/admin');
    } else if (
      role === 'user' &&
      group !== 'student' &&
      group !== 'course' &&
      group !== 'learn' &&
      group !== 'test' &&
      group !== 'exam' &&
      group !== 'quiz' &&
      group !== 'cart' &&
      group !== 'checkout' &&
      group !== 'test-series-checkout' &&
      !sharedGroups.includes(group as string)
    ) {
      router.replace('/student');
    }
  }, [token, role, isLoading, segments, router]);

  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.text }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="student" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="course/[courseName]" options={{ title: 'Course' }} />
      <Stack.Screen name="learn/[courseName]/index" options={{ title: 'Modules' }} />
      <Stack.Screen name="learn/[courseName]/[moduleName]/index" options={{ title: 'Chapters' }} />
      <Stack.Screen name="learn/[courseName]/[moduleName]/[topicName]" options={{ title: 'Lecture' }} />
      <Stack.Screen name="test/topic/[testId]" options={{ title: 'Topic test' }} />
      <Stack.Screen name="test/mock/[mockId]" options={{ title: 'Full mock' }} />
      <Stack.Screen name="exam/[examId]" options={{ title: 'Exam' }} />
      <Stack.Screen name="quiz/[quizId]" options={{ title: 'Quiz' }} />
      <Stack.Screen name="live/[classId]" options={{ title: 'Live class' }} />
      <Stack.Screen name="cart" options={{ title: 'My cart' }} />
      <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
      <Stack.Screen name="test-series-checkout" options={{ title: 'Test series checkout' }} />
      <Stack.Screen name="community-chat" options={{ title: 'Community chat' }} />
      <Stack.Screen name="web/[target]" options={{ title: 'BiomicsHub' }} />
    </Stack>
  );
}
