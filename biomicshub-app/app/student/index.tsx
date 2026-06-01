import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, Linking, Image } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { fetchCourseCatalog, CourseCatalogItem } from '@/src/api/courses';
import { fetchHomeBanners, fetchStudentVoices, HomeBanner, StudentVoice } from '@/src/api/landing';
import { fetchNotifications, NotificationItem } from '@/src/api/notifications';
import { resolveApiAssetUrl } from '@/src/api/client';
import { fetchStudentLiveWorkspace, LiveClass } from '@/src/api/live';
import { isVisibleLiveClass } from '@/src/utils/liveClass';
import { syncPushRegistration } from '@/src/utils/push';
import { getTimeGreeting } from '@/src/utils/greeting';
import CartButton from '@/src/components/CartButton';
import HomeBannerCarousel from '@/src/components/home/HomeBannerCarousel';
import SocialConnectSection from '@/src/components/home/SocialConnectSection';
import StudentVoiceCarousel from '@/src/components/home/StudentVoiceCarousel';
import RichNotificationText from '@/src/components/RichNotificationText';
import { Badge, Card, ErrorBanner, Eyebrow, LoadingBlock, PrimaryButton, Title } from '@/src/components/ui';

type TileDef = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  route: string;
};

const TILES: TileDef[] = [
  { key: 'courses', label: 'Courses', icon: 'library-outline', route: '/student/learn' },
  { key: 'live', label: 'Live Class', icon: 'videocam-outline', route: '/student/live' },
  { key: 'tests', label: 'Test Series', icon: 'document-text-outline', route: '/student/tests' },
  { key: 'exams', label: 'Mock & Monthly', icon: 'trophy-outline', route: '/student/exams' }
];

const LIVE_REFRESH_MS = 15000;

export default function StudentHome() {
  const { student, token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [courses, setCourses] = useState<CourseCatalogItem[]>([]);
  const [homeBanners, setHomeBanners] = useState<HomeBanner[]>([]);
  const [studentVoices, setStudentVoices] = useState<StudentVoice[]>([]);
  const [latestNote, setLatestNote] = useState<NotificationItem | null>(null);
  const [liveClass, setLiveClass] = useState<LiveClass | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [pushHint, setPushHint] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [cat, notes, live, banners, voices] = await Promise.all([
        fetchCourseCatalog(token),
        fetchNotifications(token).catch(() => ({ notifications: [] as NotificationItem[] })),
        fetchStudentLiveWorkspace(token).catch(() => ({ activeClass: null })),
        fetchHomeBanners().catch(() => ({ banners: [] as HomeBanner[] })),
        fetchStudentVoices().catch(() => ({ voices: [] as StudentVoice[] }))
      ]);
      setCourses(cat.courses || []);
      setHomeBanners(banners.banners || []);
      setStudentVoices(voices.voices || []);
      setLatestNote((notes.notifications || [])[0] || null);
      setLiveClass((live as { activeClass: LiveClass | null }).activeClass && isVisibleLiveClass((live as { activeClass: LiveClass | null }).activeClass)
        ? (live as { activeClass: LiveClass | null }).activeClass
        : null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      syncPushRegistration(token).then((result) => {
        setPushHint(result.reason === 'permission_denied' ? 'Turn on notifications in Settings to get alerts on your lock screen.' : '');
      });
    }, [token])
  );

  useEffect(() => {
    const timer = setInterval(() => { load(true); }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const myCourses = courses.filter((c) => c.unlocked || c.isEnrolledCourse);
  const greeting = useMemo(() => getTimeGreeting(), []);

  return (
    <Screen colors={colors}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Eyebrow>{greeting}</Eyebrow>
            <Title>{student?.username || 'Student'}</Title>
          </View>
          <View style={styles.headerActions}>
            <CartButton bordered />
            <Pressable onPress={() => router.push('/student/alerts')} style={styles.iconBtn}>
              <Ionicons name="notifications-outline" size={22} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <ErrorBanner message={error} />

        {pushHint ? (
          <Pressable onPress={() => Linking.openSettings()} style={styles.pushHint}>
            <Ionicons name="notifications-off-outline" size={18} color={colors.warn} />
            <Text style={styles.pushHintText}>{pushHint}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        ) : null}

        <HomeBannerCarousel banners={homeBanners} />

        <View style={styles.tiles}>
          {TILES.map((tile, i) => (
            <Animated.View key={tile.key} entering={FadeInDown.delay(i * 70)} style={styles.tileWrap}>
              <Pressable style={styles.tile} onPress={() => router.push(tile.route as never)}>
                <View style={styles.tileIconWrap}>
                  <Ionicons name={tile.icon} size={26} color={colors.accent} />
                </View>
                <Text style={styles.tileLabel}>{tile.label}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>

        {liveClass ? (
          <View style={styles.liveBanner}>
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveNow}>LIVE NOW</Text>
            </View>
            <Text style={styles.liveTitle}>{liveClass.title}</Text>
            <View style={{ height: 10 }} />
            <PrimaryButton
              label="Join live class"
              onPress={() => router.push({ pathname: '/live/[classId]', params: { classId: liveClass._id, mode: 'student' } })}
            />
          </View>
        ) : null}

        {latestNote ? (
          <Pressable onPress={() => router.push('/student/alerts')}>
            <Card style={styles.noteCard}>
              {latestNote.imageUrl ? (
                <Image source={{ uri: resolveApiAssetUrl(latestNote.imageUrl) }} style={styles.notePoster} resizeMode="cover" />
              ) : null}
              <View style={styles.noteBody}>
                <View style={styles.noteHead}>
                  <Ionicons name="megaphone-outline" size={16} color={colors.accent} />
                  <Text style={styles.noteEyebrow}>Latest notification</Text>
                </View>
                <Text style={styles.noteTitle}>{latestNote.title}</Text>
                <RichNotificationText
                  text={latestNote.messageRich || latestNote.message}
                  style={styles.noteMsg}
                  numberOfLines={3}
                />
              </View>
            </Card>
          </Pressable>
        ) : null}

        {loading ? <LoadingBlock /> : null}

        {!loading && myCourses.length ? (
          <Card>
            <Eyebrow>Continue learning</Eyebrow>
            {myCourses.map((c) => (
              <Pressable
                key={c.courseName}
                style={styles.courseRow}
                onPress={() => router.push(`/learn/${encodeURIComponent(c.courseName)}`)}
              >
                <Ionicons name="play-circle-outline" size={20} color={colors.accent} />
                <Text style={styles.courseName}>{c.displayName || c.courseName}</Text>
                {c.unlocked ? <Badge label="UNLOCKED" tone="success" /> : <Badge label="ENROLLED" tone="warn" />}
              </Pressable>
            ))}
          </Card>
        ) : null}

        <StudentVoiceCarousel voices={studentVoices} />

        <SocialConnectSection />

        {!loading ? (
          <Card>
            <Eyebrow>Explore</Eyebrow>
            <Text style={styles.exploreHint}>Browse all courses and admin pricing.</Text>
            {courses.map((c) => (
              <Pressable
                key={`exp-${c.courseName}`}
                style={styles.courseRow}
                onPress={() => router.push(`/course/${encodeURIComponent(c.courseName)}`)}
              >
                <Ionicons name="school-outline" size={20} color={colors.muted} />
                <Text style={styles.courseName}>{c.displayName || c.courseName}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Screen({ children, colors }: { children: React.ReactNode; colors: ThemeColors }) {
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 32 },
    pushHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.badgeWarnBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.warn,
      padding: 12,
      marginBottom: 12
    },
    pushHintText: { color: c.text, flex: 1, fontSize: 13, lineHeight: 18 },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    headerActions: { flexDirection: 'row', gap: 10, overflow: 'visible' },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.card,
      overflow: 'visible'
    },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4, marginBottom: 16 },
    tileWrap: { width: '47%' },
    tile: {
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 20,
      alignItems: 'center'
    },
    tileIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10
    },
    tileLabel: { color: c.text, fontWeight: '700' },
    liveBanner: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.danger, padding: 16, marginBottom: 16 },
    liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger },
    liveNow: { color: c.danger, fontWeight: '800', letterSpacing: 1, fontSize: 12 },
    liveTitle: { color: c.text, fontSize: 17, fontWeight: '800' },
    noteHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    noteEyebrow: { color: c.accent, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
    noteCard: { padding: 0, overflow: 'hidden', marginBottom: 16 },
    notePoster: { width: '100%', height: 130, backgroundColor: c.cardAlt },
    noteBody: { padding: 14 },
    noteTitle: { color: c.text, fontWeight: '800', marginTop: 2, fontSize: 16 },
    noteMsg: { color: c.muted, marginTop: 6 },
    courseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: c.border
    },
    courseName: { color: c.text, fontWeight: '600', flex: 1 },
    exploreHint: { color: c.muted, marginBottom: 4 }
  });
}
