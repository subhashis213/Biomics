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
import { fetchRecentQuizAttempts, QuizAttempt } from '@/src/api/quiz';
import { fetchMyMockExams, MockExamListItem } from '@/src/api/exams';
import { fetchMyCourseContent } from '@/src/api/learning';
import { fetchTestSeriesPerformance, TestSeriesPerformance } from '@/src/api/performance';
import { BarChart, BarDatum, RingProgress } from '@/src/components/Charts';
import { Card, ErrorBanner, Eyebrow, PrimaryButton, Screen, Subtitle, Title } from '@/src/components/ui';

type Section = 'tests' | 'quiz' | 'exams';

function pct(score: number, total: number) {
  if (!total) return 0;
  return Math.round((score / total) * 100);
}

export default function ProfileScreen() {
  const { student, token, role, logout, refreshProfile } = useAuth();
  const { count: cartCount } = useCart();
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<Section>('tests');

  const [coursesUnlocked, setCoursesUnlocked] = useState(0);
  const [videosCompleted, setVideosCompleted] = useState(0);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [exams, setExams] = useState<MockExamListItem[]>([]);
  const [perf, setPerf] = useState<TestSeriesPerformance | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    try {
      const [catalog, quizzes, examsRes, content, tsPerf] = await Promise.all([
        fetchCourseCatalog(token).catch(() => ({ courses: [] })),
        fetchRecentQuizAttempts(token).catch(() => ({ attempts: [] as QuizAttempt[] })),
        fetchMyMockExams(token).catch(() => ({ exams: [], notices: [] })),
        fetchMyCourseContent(token).catch(() => ({ completedVideos: [] as string[] })),
        fetchTestSeriesPerformance(token).catch(() => null)
      ]);
      setCoursesUnlocked((catalog.courses || []).filter((c) => c.unlocked).length);
      setQuizAttempts(quizzes.attempts || []);
      setExams(examsRes.exams || []);
      setVideosCompleted(((content as any).completedVideos || []).length);
      setPerf(tsPerf);
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const quizAvg = useMemo(() => {
    if (!quizAttempts.length) return 0;
    return Math.round(quizAttempts.reduce((s, a) => s + pct(a.score, a.total), 0) / quizAttempts.length);
  }, [quizAttempts]);

  const examAttempted = useMemo(() => exams.filter((e) => e.attempted && e.attemptSummary), [exams]);
  const examAvg = useMemo(() => {
    if (!examAttempted.length) return 0;
    return Math.round(examAttempted.reduce((s, e) => s + (e.attemptSummary?.percentage || 0), 0) / examAttempted.length);
  }, [examAttempted]);

  async function changeAvatar() {
    setError('');
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setError('Photo permission is required to change your picture.'); return; }
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
  const topicAvg = Math.round(perf?.summary.topicTests.averageScore || 0);
  const mockAvg = Math.round(perf?.summary.fullMocks.averageScore || 0);
  const moduleBars: BarDatum[] = (perf?.modulePerformance || [])
    .slice(0, 6)
    .map((m) => ({ label: m.module, value: Math.round(m.averageScore) }));
  const quizBars: BarDatum[] = quizAttempts.slice(0, 6).reverse().map((a, i) => ({ label: a.module || `Q${i + 1}`, value: pct(a.score, a.total) }));
  const examBars: BarDatum[] = examAttempted.slice(0, 6).map((e) => ({ label: e.title || e.category || 'Exam', value: e.attemptSummary?.percentage || 0 }));

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
              {uploading ? <ActivityIndicator size="small" color={colors.accentText} /> : <Ionicons name="camera" size={15} color={colors.accentText} />}
            </View>
          </Pressable>
          <Title>{student?.username || 'Student'}</Title>
          <Subtitle>{[student?.class && `Class ${student.class}`, student?.city].filter(Boolean).join(' · ') || 'Tap photo to update'}</Subtitle>
        </View>

        <ErrorBanner message={error} />

        <View style={styles.statsRow}>
          <Stat icon="lock-open-outline" label="Courses" value={String(coursesUnlocked)} colors={colors} />
          <Stat icon="checkmark-done-outline" label="Videos done" value={String(videosCompleted)} colors={colors} />
          <Stat icon="flame-outline" label="Streak" value={String(perf?.summary.dailyAttemptStreak || 0)} colors={colors} />
        </View>

        <Card>
          <Eyebrow>Performance</Eyebrow>
          <View style={styles.segment}>
            {(['tests', 'quiz', 'exams'] as Section[]).map((s) => (
              <Pressable key={s} onPress={() => setSection(s)} style={[styles.segBtn, section === s && styles.segOn]}>
                <Text style={[styles.segText, section === s && styles.segTextOn]}>
                  {s === 'tests' ? 'Test series' : s === 'quiz' ? 'Quizzes' : 'Exams'}
                </Text>
              </Pressable>
            ))}
          </View>

          {section === 'tests' ? (
            <View>
              <View style={styles.ringRow}>
                <RingProgress percentage={topicAvg} caption="Topic avg" />
                <RingProgress percentage={mockAvg} caption="Mock avg" />
              </View>
              <Text style={styles.chartTitle}>Module-wise average</Text>
              <BarChart data={moduleBars} />
              <View style={styles.miniRow}>
                <Mini label="Topic attempts" value={String(perf?.summary.topicTests.attempts || 0)} colors={colors} />
                <Mini label="Best topic" value={`${Math.round(perf?.summary.topicTests.bestScore || 0)}%`} colors={colors} />
                <Mini label="Mock attempts" value={String(perf?.summary.fullMocks.attempts || 0)} colors={colors} />
              </View>
            </View>
          ) : null}

          {section === 'quiz' ? (
            <View>
              <View style={styles.ringRow}>
                <RingProgress percentage={quizAvg} caption="Quiz avg" />
              </View>
              <Text style={styles.chartTitle}>Recent quiz scores</Text>
              <BarChart data={quizBars} />
            </View>
          ) : null}

          {section === 'exams' ? (
            <View>
              <View style={styles.ringRow}>
                <RingProgress percentage={examAvg} caption="Exam avg" />
              </View>
              <Text style={styles.chartTitle}>Monthly exam scores</Text>
              <BarChart data={examBars} />
            </View>
          ) : null}
        </Card>

        <Card>
          <Eyebrow>More</Eyebrow>
          <Pressable style={styles.linkRow} onPress={() => router.push('/community-chat')}>
            <View style={[styles.linkIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="chatbubbles" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitle}>Community live chat</Text>
              <Text style={styles.linkSub}>Chat live with mentors and peers</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
          <View style={styles.linkDivider} />
          <Pressable style={styles.linkRow} onPress={() => router.push('/cart')}>
            <View style={[styles.linkIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="cart" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitle}>My cart</Text>
              <Text style={styles.linkSub}>{cartCount ? `${cartCount} item${cartCount > 1 ? 's' : ''} saved` : 'No items yet'}</Text>
            </View>
            {cartCount ? (
              <View style={styles.linkBadge}>
                <Text style={styles.linkBadgeText}>{cartCount}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </Card>

        <Card>
          <Eyebrow>Appearance</Eyebrow>
          <Text style={styles.sectionTitle}>Theme</Text>
          <View style={styles.themeSwitch}>
            <Pressable onPress={() => setMode('light')} style={[styles.themeBtn, mode === 'light' && styles.themeOn]}>
              <Ionicons name="sunny-outline" size={16} color={mode === 'light' ? colors.accentText : colors.muted} />
              <Text style={[styles.themeText, mode === 'light' && styles.themeTextOn]}>Light</Text>
            </Pressable>
            <Pressable onPress={() => setMode('dark')} style={[styles.themeBtn, mode === 'dark' && styles.themeOn]}>
              <Ionicons name="moon-outline" size={16} color={mode === 'dark' ? colors.accentText : colors.muted} />
              <Text style={[styles.themeText, mode === 'dark' && styles.themeTextOn]}>Dark</Text>
            </Pressable>
          </View>
        </Card>

        <PrimaryButton label="Sign out" variant="outline" onPress={logout} />
        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}

function Stat({ icon, label, value, colors }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; colors: ThemeColors }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 6 }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function Mini({ label, value, colors }: { label: string; value: string; colors: ThemeColors }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{value}</Text>
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
    editBadge: { position: 'absolute', right: 0, bottom: 0, backgroundColor: c.accent, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.bg },
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    segment: { flexDirection: 'row', backgroundColor: c.cardAlt, borderRadius: 10, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: c.border },
    segBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
    segOn: { backgroundColor: c.accent },
    segText: { color: c.muted, fontWeight: '700', fontSize: 13 },
    segTextOn: { color: c.accentText },
    ringRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
    chartTitle: { color: c.text, fontWeight: '700', marginTop: 12, marginBottom: 4 },
    miniRow: { flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.border },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    linkIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    linkTitle: { color: c.text, fontWeight: '700', fontSize: 15 },
    linkSub: { color: c.muted, fontSize: 12, marginTop: 2 },
    linkDivider: { height: 1, backgroundColor: c.border },
    linkBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    linkBadgeText: { color: c.accentText, fontWeight: '800', fontSize: 11 },
    sectionTitle: { color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 10 },
    themeSwitch: { flexDirection: 'row', backgroundColor: c.cardAlt, borderRadius: 10, padding: 4, borderWidth: 1, borderColor: c.border },
    themeBtn: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    themeOn: { backgroundColor: c.accent },
    themeText: { color: c.muted, fontWeight: '700' },
    themeTextOn: { color: c.accentText }
  });
}
