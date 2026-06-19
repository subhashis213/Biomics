import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useCart } from '@/src/context/CartContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { uploadAvatar } from '@/src/api/auth';
import { resolveApiAssetUrl } from '@/src/api/client';
import { fetchCourseCatalog } from '@/src/api/courses';
import { fetchMyCourseContent } from '@/src/api/learning';
import { fetchTestSeriesPerformance } from '@/src/api/performance';
import ThemeToggle from '@/src/components/profile/ThemeToggle';
import SupportSection from '@/src/components/profile/SupportSection';
import EmojiIcon from '@/src/components/ui/EmojiIcon';
import { AppIconKey } from '@/src/constants/appIcons';
import { ErrorBanner, PrimaryButton, Screen, Subtitle, Title } from '@/src/components/ui';

export default function ProfileScreen() {
  const { student, token, role, logout, refreshProfile } = useAuth();
  const { count: cartCount } = useCart();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [coursesUnlocked, setCoursesUnlocked] = useState(0);
  const [videosCompleted, setVideosCompleted] = useState(0);
  const [streak, setStreak] = useState(0);
  const [topicAvg, setTopicAvg] = useState(0);

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    try {
      const [catalog, content, tsPerf] = await Promise.all([
        fetchCourseCatalog(token).catch(() => ({ courses: [] })),
        fetchMyCourseContent(token).catch(() => ({ completedVideos: [] as string[] })),
        fetchTestSeriesPerformance(token).catch(() => null)
      ]);
      setCoursesUnlocked((catalog.courses || []).filter((c) => c.unlocked).length);
      setVideosCompleted(((content as { completedVideos?: string[] }).completedVideos || []).length);
      setStreak(tsPerf?.summary.dailyAttemptStreak || 0);
      setTopicAvg(Math.round(tsPerf?.summary.topicTests.averageScore || 0));
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function changeAvatar() {
    setError('');
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError('Photo permission is required to change your picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7
      });
      if (result.canceled || !result.assets?.length) return;
      setUploading(true);
      await uploadAvatar(token!, role, result.assets[0].uri);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update photo.');
    } finally {
      setUploading(false);
    }
  }

  const avatarUrl = resolveApiAssetUrl(student?.avatarUrl);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <Pressable onPress={changeAvatar} style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={42} color={colors.muted} />
              </View>
            )}
            <View style={styles.editBadge}>
              {uploading ? (
                <ActivityIndicator size="small" color={colors.accentText} />
              ) : (
                <Ionicons name="camera" size={15} color={colors.accentText} />
              )}
            </View>
          </Pressable>
          <Title>{student?.username || 'Student'}</Title>
          <Subtitle>
            {[student?.class && `Class ${student.class}`, student?.city].filter(Boolean).join(' · ') || 'Tap photo to update'}
          </Subtitle>
        </View>

        <ErrorBanner message={error} />

        <View style={styles.statsRow}>
          <Stat icon="courses" label="Courses" value={String(coursesUnlocked)} colors={colors} />
          <Stat icon="video" label="Videos done" value={String(videosCompleted)} colors={colors} />
          <Stat icon="streak" label="Streak" value={String(streak)} colors={colors} />
        </View>

        <Pressable style={styles.menuCard} onPress={() => router.push('/student/performance')}>
          <EmojiIcon name="performance" size="md" />
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>Performance</Text>
            <Text style={styles.menuSub}>
              Topic-wise tests, full mocks, monthly exams & quizzes
              {topicAvg > 0 ? ` · ${topicAvg}% topic avg` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>

        <View style={styles.menuCardPlain}>
          <Pressable style={styles.menuRow} onPress={() => router.push('/community-chat')}>
            <EmojiIcon name="chat" size="md" />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Community live chat</Text>
              <Text style={styles.menuSub}>Chat with mentors and peers</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.menuRow} onPress={() => router.push('/cart')}>
            <EmojiIcon name="cart" size="md" />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>My cart</Text>
              <Text style={styles.menuSub}>
                {cartCount ? `${cartCount} item${cartCount > 1 ? 's' : ''} saved` : 'No items yet'}
              </Text>
            </View>
            {cartCount ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{cartCount}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </View>

        <View style={{ marginBottom: 14 }}>
          <SupportSection />
        </View>

        <View style={{ marginBottom: 14 }}>
          <ThemeToggle />
        </View>

        <PrimaryButton label="Sign out" variant="outline" onPress={logout} />
        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}

function Stat({
  icon,
  label,
  value,
  colors
}: {
  icon: AppIconKey;
  label: string;
  value: string;
  colors: ThemeColors;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, alignItems: 'center' }}>
      <EmojiIcon name={icon} size="sm" />
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 8 }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 32 },
    header: { alignItems: 'center', marginBottom: 18 },
    avatarWrap: { marginBottom: 12 },
    avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: c.accent },
    avatarPlaceholder: { backgroundColor: c.cardAlt, alignItems: 'center', justifyContent: 'center' },
    editBadge: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      backgroundColor: c.accent,
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: c.bg
    },
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    menuCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      marginBottom: 12
    },
    menuCardPlain: {
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 14,
      overflow: 'hidden'
    },
    menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
    menuIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    menuTitle: { color: c.text, fontWeight: '800', fontSize: 15 },
    menuSub: { color: c.muted, fontSize: 12, marginTop: 3, lineHeight: 17 },
    divider: { height: 1, backgroundColor: c.border, marginHorizontal: 16 },
    badge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
      marginRight: 4
    },
    badgeText: { color: c.accentText, fontWeight: '800', fontSize: 11 }
  });
}
