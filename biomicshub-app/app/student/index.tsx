import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, Linking, Image } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { HOME_TILES } from '@/src/constants/appIcons';
import FeatureTile from '@/src/components/home/FeatureTile';
import EmojiIcon from '@/src/components/ui/EmojiIcon';
import { fetchCourseCatalog, CourseCatalogItem } from '@/src/api/courses';
import { fetchHomeBanners, fetchStudentVoices, HomeBanner, StudentVoice } from '@/src/api/landing';
import { fetchFreeStudyHomePreview, FreeStudyCourseGroup } from '@/src/api/freeStudyResources';
import { fetchNotifications, NotificationItem } from '@/src/api/notifications';
import { resolveApiAssetUrl } from '@/src/api/client';
import { fetchStudentLiveWorkspace, LiveClass } from '@/src/api/live';
import { isVisibleLiveClass } from '@/src/utils/liveClass';
import { syncPushRegistration } from '@/src/utils/push';
import { getTimeGreeting } from '@/src/utils/greeting';
import CartButton from '@/src/components/CartButton';
import HomeBannerCarousel from '@/src/components/home/HomeBannerCarousel';
import FreeStudyLibrarySection from '@/src/components/home/FreeStudyLibrarySection';
import SocialConnectSection from '@/src/components/home/SocialConnectSection';
import StudentVoiceCarousel from '@/src/components/home/StudentVoiceCarousel';
import RichNotificationText from '@/src/components/RichNotificationText';
import CourseLearningRow from '@/src/components/learning/CourseLearningRow';
import { Card, ErrorBanner, Eyebrow, LoadingBlock, PrimaryButton, Title } from '@/src/components/ui';

const LIVE_REFRESH_MS = 15000;

export default function StudentHome() {
  const { student, token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [courses, setCourses] = useState<CourseCatalogItem[]>([]);
  const [homeBanners, setHomeBanners] = useState<HomeBanner[]>([]);
  const [studentVoices, setStudentVoices] = useState<StudentVoice[]>([]);
  const [freeLibrary, setFreeLibrary] = useState<FreeStudyCourseGroup[]>([]);
  const [freeLibraryCount, setFreeLibraryCount] = useState(0);
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
      const [cat, notes, live, banners, voices, library] = await Promise.all([
        fetchCourseCatalog(token),
        fetchNotifications(token).catch(() => ({ notifications: [] as NotificationItem[] })),
        fetchStudentLiveWorkspace(token).catch(() => ({ activeClass: null })),
        fetchHomeBanners().catch(() => ({ banners: [] as HomeBanner[] })),
        fetchStudentVoices().catch(() => ({ voices: [] as StudentVoice[] })),
        fetchFreeStudyHomePreview(token).catch(() => ({ courses: [] as FreeStudyCourseGroup[], totalCount: 0 }))
      ]);
      setCourses(cat.courses || []);
      setHomeBanners(banners.banners || []);
      setStudentVoices(voices.voices || []);
      setFreeLibrary(library.courses || []);
      setFreeLibraryCount(library.totalCount || 0);
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
              <EmojiIcon name="notifications" size="sm" />
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

        <FreeStudyLibrarySection courses={freeLibrary} totalCount={freeLibraryCount} />

        <View style={styles.tiles}>
          {HOME_TILES.map((tile, i) => (
            <Animated.View key={tile.key} entering={FadeInDown.delay(i * 70)} style={styles.tileWrap}>
              <FeatureTile
                label={tile.label}
                icon={tile.icon}
                onPress={() => router.push(tile.route as never)}
              />
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
                  <Text style={styles.noteEmoji}>📢</Text>
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
          <View style={styles.continueSection}>
            <View style={styles.continueHeader}>
              <Text style={styles.continueTitle}>Continue learning</Text>
              <Pressable onPress={() => router.push('/student/learn')}>
                <Text style={styles.continueLink}>See all</Text>
              </Pressable>
            </View>
            {myCourses.slice(0, 3).map((c, index) => (
              <CourseLearningRow
                key={c.courseName}
                title={c.displayName || c.courseName}
                subtitle={
                  c.batches?.length
                    ? `${c.batches.length} batch${c.batches.length === 1 ? '' : 'es'} · BiomicsHub`
                    : 'BiomicsHub'
                }
                thumbnailUrl={c.thumbnailUrl}
                unlocked={c.unlocked}
                enrolled={c.isEnrolledCourse}
                onPress={() => router.push(`/course/${encodeURIComponent(c.courseName)}`)}
                showDivider={index < Math.min(myCourses.length, 3) - 1}
                style={index === 0 ? styles.continueFirstRow : undefined}
              />
            ))}
          </View>
        ) : null}

        <StudentVoiceCarousel voices={studentVoices} />

        <SocialConnectSection />

        {!loading ? (
          <Card>
            <Eyebrow>Explore</Eyebrow>
            <Text style={styles.exploreHint}>Browse all courses.</Text>
            {courses.map((c) => (
              <Pressable
                key={`exp-${c.courseName}`}
                style={styles.courseRow}
                onPress={() => router.push(`/course/${encodeURIComponent(c.courseName)}`)}
              >
                <Text style={styles.courseEmoji}>🎓</Text>
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
    liveBanner: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.danger, padding: 16, marginBottom: 16 },
    liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger },
    liveNow: { color: c.danger, fontWeight: '800', letterSpacing: 1, fontSize: 12 },
    liveTitle: { color: c.text, fontSize: 17, fontWeight: '800' },
    noteHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    noteEmoji: { fontSize: 16 },
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
    courseEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
    courseName: { color: c.text, fontWeight: '600', flex: 1 },
    exploreHint: { color: c.muted, marginBottom: 4 },
    continueSection: {
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
      marginBottom: 16
    },
    continueHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 4
    },
    continueTitle: {
      color: c.text,
      fontSize: 17,
      fontWeight: '800'
    },
    continueLink: {
      color: c.accent,
      fontSize: 14,
      fontWeight: '700'
    },
    continueFirstRow: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border
    }
  });
}
