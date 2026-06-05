import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { fetchMyMockExams, MockExamListItem } from '@/src/api/exams';
import { fetchRecentQuizAttempts, QuizAttempt } from '@/src/api/quiz';
import { fetchTestSeriesPerformance, TestSeriesPerformance } from '@/src/api/performance';
import { RingProgress } from '@/src/components/Charts';
import { ErrorBanner, LoadingBlock, Screen } from '@/src/components/ui';
import {
  buildPerformanceRecords,
  filterPerformanceRecords,
  kindColor,
  kindLabel,
  PerformanceKind,
  PerformanceRecord,
  PerformanceSort,
  sortPerformanceRecords,
  uniqueCourses,
  uniqueModules,
  uniqueTopics
} from '@/src/utils/performanceData';

type TypeFilter = PerformanceKind | 'all';

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'topic', label: 'Topic' },
  { key: 'full_mock', label: 'Full mock' },
  { key: 'monthly_exam', label: 'Monthly' },
  { key: 'quiz', label: 'Quiz' }
];

const SORT_OPTIONS: { key: PerformanceSort; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'score_desc', label: 'Best score' },
  { key: 'score_asc', label: 'Lowest' }
];

function fmtDate(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PerformanceScreen() {
  const { token, student } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [perf, setPerf] = useState<TestSeriesPerformance | null>(null);
  const [exams, setExams] = useState<MockExamListItem[]>([]);
  const [quizzes, setQuizzes] = useState<QuizAttempt[]>([]);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [topicFilter, setTopicFilter] = useState('all');
  const [sort, setSort] = useState<PerformanceSort>('recent');
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const courseQuery = courseFilter !== 'all' ? courseFilter : undefined;
      const [tsPerf, examsRes, quizRes] = await Promise.all([
        fetchTestSeriesPerformance(token, courseQuery).catch(() => null),
        fetchMyMockExams(token).catch(() => ({ exams: [] as MockExamListItem[] })),
        fetchRecentQuizAttempts(token).catch(() => ({ attempts: [] as QuizAttempt[] }))
      ]);
      setPerf(tsPerf);
      setExams(examsRes.exams || []);
      setQuizzes(quizRes.attempts || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load performance.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, courseFilter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const allRecords = useMemo(
    () => buildPerformanceRecords(perf, exams, quizzes),
    [perf, exams, quizzes]
  );

  const courses = useMemo(
    () => ['all', ...uniqueCourses(allRecords, student?.class || perf?.course)],
    [allRecords, student?.class, perf?.course]
  );
  const modules = useMemo(() => ['all', ...uniqueModules(allRecords)], [allRecords]);
  const topics = useMemo(() => ['all', ...uniqueTopics(allRecords, moduleFilter)], [allRecords, moduleFilter]);

  const filteredRecords = useMemo(() => {
    const filtered = filterPerformanceRecords(allRecords, {
      kind: typeFilter,
      course: courseFilter,
      module: moduleFilter,
      topic: topicFilter
    });
    return sortPerformanceRecords(filtered, sort);
  }, [allRecords, typeFilter, courseFilter, moduleFilter, topicFilter, sort]);

  const topicAvg = Math.round(perf?.summary.topicTests.averageScore || 0);
  const mockAvg = Math.round(perf?.summary.fullMocks.averageScore || 0);
  const examAvg = useMemo(() => {
    const attempted = exams.filter((e) => e.attempted && e.attemptSummary);
    if (!attempted.length) return 0;
    return Math.round(attempted.reduce((s, e) => s + (e.attemptSummary?.percentage || 0), 0) / attempted.length);
  }, [exams]);
  const quizAvg = useMemo(() => {
    if (!quizzes.length) return 0;
    return Math.round(quizzes.reduce((s, q) => s + Math.round((q.score / Math.max(q.total, 1)) * 100), 0) / quizzes.length);
  }, [quizzes]);

  const moduleRows = perf?.modulePerformance || [];

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Performance', headerBackTitle: 'Profile' }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        <ErrorBanner message={error} />

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Your performance</Text>
          <Text style={styles.heroSub}>Test series, monthly exams & quizzes — topic-wise breakdown</Text>
          <View style={styles.heroStats}>
            <MiniRing label="Topic avg" value={topicAvg} colors={colors} />
            <MiniRing label="Mock avg" value={mockAvg} colors={colors} />
            <MiniRing label="Monthly" value={examAvg} colors={colors} />
            <MiniRing label="Quiz avg" value={quizAvg} colors={colors} />
          </View>
          <View style={styles.streakRow}>
            <Ionicons name="flame" size={16} color={colors.warn} />
            <Text style={styles.streakText}>{perf?.summary.dailyAttemptStreak || 0} day practice streak</Text>
          </View>
        </View>

        <FilterSection title="Test type" colors={colors}>
          <ChipRow
            items={TYPE_FILTERS.map((f) => ({ key: f.key, label: f.label }))}
            value={typeFilter}
            onChange={(key) => setTypeFilter(key as TypeFilter)}
            colors={colors}
          />
        </FilterSection>

        {courses.length > 2 ? (
          <FilterSection title="Course" colors={colors}>
            <ChipRow
              items={courses.map((c) => ({ key: c, label: c === 'all' ? 'All courses' : c }))}
              value={courseFilter}
              onChange={setCourseFilter}
              colors={colors}
            />
          </FilterSection>
        ) : null}

        {(typeFilter === 'all' || typeFilter === 'topic') && modules.length > 1 ? (
          <FilterSection title="Module" colors={colors}>
            <ChipRow
              items={modules.map((m) => ({ key: m, label: m === 'all' ? 'All modules' : m }))}
              value={moduleFilter}
              onChange={(key) => {
                setModuleFilter(key);
                setTopicFilter('all');
              }}
              colors={colors}
            />
          </FilterSection>
        ) : null}

        {(typeFilter === 'all' || typeFilter === 'topic') && topics.length > 1 ? (
          <FilterSection title="Topic" colors={colors}>
            <ChipRow
              items={topics.map((t) => ({ key: t, label: t === 'all' ? 'All topics' : t }))}
              value={topicFilter}
              onChange={setTopicFilter}
              colors={colors}
            />
          </FilterSection>
        ) : null}

        <FilterSection title="Sort by" colors={colors}>
          <ChipRow items={SORT_OPTIONS} value={sort} onChange={(key) => setSort(key as PerformanceSort)} colors={colors} />
        </FilterSection>

        {loading ? <LoadingBlock /> : null}

        {!loading && moduleRows.length > 0 && (typeFilter === 'all' || typeFilter === 'topic') ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Topic-wise summary</Text>
            {moduleRows
              .filter((m) => moduleFilter === 'all' || m.module === moduleFilter)
              .map((moduleRow) => {
                const open = expandedModule === moduleRow.module;
                const topicsList = (moduleRow.topics || []).filter(
                  (t) => topicFilter === 'all' || t.topic === topicFilter
                );
                return (
                  <View key={moduleRow.module} style={styles.moduleCard}>
                    <Pressable
                      onPress={() => setExpandedModule(open ? null : moduleRow.module)}
                      style={styles.moduleHead}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.moduleTitle}>{moduleRow.module}</Text>
                        <Text style={styles.moduleMeta}>
                          {moduleRow.attempts} attempts · avg {moduleRow.averageScore}% · best {moduleRow.bestScore}%
                        </Text>
                      </View>
                      <View style={styles.moduleScoreWrap}>
                        <Text style={styles.moduleScore}>{moduleRow.averageScore}%</Text>
                        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                      </View>
                    </Pressable>
                    {open ? (
                      <View style={styles.topicList}>
                        {topicsList.length ? topicsList.map((topicRow) => (
                          <View key={`${moduleRow.module}-${topicRow.topic}`} style={styles.topicRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.topicTitle}>{topicRow.topic}</Text>
                              <Text style={styles.topicMeta}>
                                {topicRow.attempts} attempts · best {topicRow.bestScore}%
                              </Text>
                            </View>
                            <Text style={[styles.topicScore, { color: scoreTone(topicRow.averageScore, colors) }]}>
                              {topicRow.averageScore}%
                            </Text>
                          </View>
                        )) : (
                          <Text style={styles.emptyHint}>No topic attempts in this filter.</Text>
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
          </View>
        ) : null}

        {!loading ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Attempt history ({filteredRecords.length})</Text>
            {filteredRecords.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="analytics-outline" size={28} color={colors.muted} />
                <Text style={styles.emptyHint}>No attempts match these filters yet.</Text>
              </View>
            ) : (
              filteredRecords.map((row) => (
                <AttemptCard key={row.id} row={row} colors={colors} styles={styles} />
              ))
            )}
          </View>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}

function AttemptCard({
  row,
  colors,
  styles
}: {
  row: PerformanceRecord;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const tone = kindColor(row.kind, colors);
  return (
    <View style={styles.attemptCard}>
      <View style={styles.attemptTop}>
        <View style={[styles.kindPill, { backgroundColor: `${tone}18` }]}>
          <Text style={[styles.kindPillText, { color: tone }]}>{kindLabel(row.kind)}</Text>
        </View>
        <Text style={[styles.attemptPct, { color: scoreTone(row.percentage, colors) }]}>{row.percentage}%</Text>
      </View>
      <Text style={styles.attemptTitle}>{row.title}</Text>
      <Text style={styles.attemptMeta}>
        {[row.module, row.topic, row.course].filter(Boolean).join(' · ') || 'BiomicsHub'}
      </Text>
      <View style={styles.attemptFoot}>
        <Text style={styles.attemptScore}>{row.score}/{row.total} correct</Text>
        <Text style={styles.attemptDate}>{fmtDate(row.submittedAt)}</Text>
      </View>
    </View>
  );
}

function MiniRing({ label, value, colors }: { label: string; value: number; colors: ThemeColors }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <RingProgress percentage={value} size={72} strokeWidth={8} caption={label} />
    </View>
  );
}

function FilterSection({ title, children, colors }: { title: string; children: React.ReactNode; colors: ThemeColors }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function ChipRow({
  items,
  value,
  onChange,
  colors
}: {
  items: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  colors: ThemeColors;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {items.map((item) => {
        const active = value === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            style={{
              borderWidth: 1,
              borderColor: active ? colors.accent : colors.border,
              backgroundColor: active ? colors.accentSoft : colors.card,
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8
            }}
          >
            <Text style={{ color: active ? colors.accent : colors.muted, fontWeight: active ? '800' : '600', fontSize: 12 }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function scoreTone(pct: number, colors: ThemeColors) {
  if (pct >= 80) return colors.success;
  if (pct >= 50) return colors.accent;
  if (pct >= 30) return colors.warn;
  return colors.danger;
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 32 },
    hero: {
      backgroundColor: c.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      marginBottom: 16
    },
    heroTitle: { color: c.text, fontSize: 22, fontWeight: '900' },
    heroSub: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 14 },
    heroStats: { flexDirection: 'row', gap: 4 },
    streakRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border },
    streakText: { color: c.text, fontWeight: '700', fontSize: 13 },
    section: { marginBottom: 8 },
    sectionTitle: { color: c.text, fontSize: 17, fontWeight: '800', marginBottom: 10 },
    moduleCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 10,
      overflow: 'hidden'
    },
    moduleHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
    moduleTitle: { color: c.text, fontSize: 15, fontWeight: '800' },
    moduleMeta: { color: c.muted, fontSize: 12, marginTop: 3 },
    moduleScoreWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    moduleScore: { color: c.accent, fontWeight: '900', fontSize: 18 },
    topicList: { borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.cardAlt },
    topicRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    topicTitle: { color: c.text, fontWeight: '700', fontSize: 14 },
    topicMeta: { color: c.muted, fontSize: 11, marginTop: 2 },
    topicScore: { fontWeight: '900', fontSize: 16 },
    attemptCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginBottom: 10
    },
    attemptTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    kindPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    kindPillText: { fontSize: 11, fontWeight: '800' },
    attemptPct: { fontSize: 22, fontWeight: '900' },
    attemptTitle: { color: c.text, fontSize: 15, fontWeight: '800', marginBottom: 4 },
    attemptMeta: { color: c.muted, fontSize: 12, marginBottom: 10 },
    attemptFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    attemptScore: { color: c.text, fontWeight: '700', fontSize: 13 },
    attemptDate: { color: c.muted, fontSize: 12, fontWeight: '600' },
    emptyCard: { alignItems: 'center', padding: 24, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border },
    emptyHint: { color: c.muted, marginTop: 8, textAlign: 'center', fontSize: 13 }
  });
}
