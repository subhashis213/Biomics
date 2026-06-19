import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useCart } from '@/src/context/CartContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import {
  fetchFullMockSyllabus,
  fetchFullMocksStudent,
  fetchTestSeriesCatalog,
  fetchTopicSyllabus,
  fetchTopicTestsStudent,
  SyllabusItem,
  TestSeriesCourseCatalog
} from '@/src/api/testSeries';
import { Badge, Card, ErrorBanner, Eyebrow, LoadingBlock, PriceRow, PrimaryButton, Screen, Subtitle, SuccessBanner, Title } from '@/src/components/ui';
import { APP_ICONS } from '@/src/constants/appIcons';
import { addTestSeriesCartItem, makeTestSeriesCartKey } from '@/src/utils/testSeriesCart';

const DEFAULT_TEST_SERIES_COURSE = 'CSIR-NET Life Science';

function pickDefaultTestSeriesCourse(courses: TestSeriesCourseCatalog[], studentClass?: string) {
  const exact = courses.find((c) => c.courseName === DEFAULT_TEST_SERIES_COURSE);
  if (exact) return exact.courseName;
  const csir = courses.find(
    (c) => /csir/i.test(c.courseName) && /life\s*science/i.test(c.courseName)
  );
  if (csir) return csir.courseName;
  if (studentClass && courses.some((c) => c.courseName === studentClass)) return studentClass;
  return courses[0]?.courseName || '';
}

type BrowseLevel = 'modules' | 'topics' | 'tests';

function norm(s: string) {
  return String(s || '').trim().replace(/\s+/g, ' ') || 'General';
}

function groupTopicTests(items: SyllabusItem[]) {
  const modules = new Map<string, Map<string, SyllabusItem[]>>();
  items.forEach((item) => {
    const mod = norm(item.module || 'General');
    const topic = norm(item.topic || item.title || 'General');
    if (!modules.has(mod)) modules.set(mod, new Map());
    const topics = modules.get(mod)!;
    if (!topics.has(topic)) topics.set(topic, []);
    topics.get(topic)!.push(item);
  });
  return Array.from(modules.entries())
    .map(([module, topicsMap]) => ({
      module,
      topics: Array.from(topicsMap.entries())
        .map(([topic, tests]) => ({ topic, tests }))
        .sort((a, b) => a.topic.localeCompare(b.topic)),
      testCount: Array.from(topicsMap.values()).reduce((n, list) => n + list.length, 0)
    }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

export default function TestsTab() {
  const { token, student, username } = useAuth();
  const { refreshTestSeriesCart } = useCart();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [courses, setCourses] = useState<TestSeriesCourseCatalog[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [tab, setTab] = useState<'topic' | 'mock'>('topic');
  const [topicItems, setTopicItems] = useState<SyllabusItem[]>([]);
  const [mockItems, setMockItems] = useState<SyllabusItem[]>([]);
  const [hasTopicAccess, setHasTopicAccess] = useState(false);
  const [hasMockAccess, setHasMockAccess] = useState(false);
  const [pricing, setPricing] = useState<TestSeriesCourseCatalog['pricing'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [innerLoading, setInnerLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cartSuccess, setCartSuccess] = useState('');
  const [level, setLevel] = useState<BrowseLevel>('modules');
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');

  const loadCourseTests = useCallback(async (course: string, catalog: TestSeriesCourseCatalog[]) => {
    if (!token || !course) return;
    const entry = catalog.find((c) => c.courseName === course);
    setPricing(entry?.pricing || null);
    const topicPurchased = Boolean(entry?.access?.hasTopicTest);
    const mockPurchased = Boolean(entry?.access?.hasFullMock);

    if (topicPurchased) {
      const res = await fetchTopicTestsStudent(token, course).catch(() => ({ tests: [] }));
      setTopicItems((res.tests || []) as SyllabusItem[]);
      setHasTopicAccess(true);
    } else {
      const syllabus = await fetchTopicSyllabus(token).catch(() => ({ items: [], course: '' }));
      setTopicItems(syllabus.course === course || student?.class === course ? syllabus.items || [] : []);
      setHasTopicAccess(false);
    }

    if (mockPurchased) {
      const res = await fetchFullMocksStudent(token, course).catch(() => ({ mocks: [] }));
      setMockItems((res.mocks || []) as SyllabusItem[]);
      setHasMockAccess(true);
    } else {
      const syllabus = await fetchFullMockSyllabus(token).catch(() => ({ items: [], course: '' }));
      setMockItems(syllabus.course === course || student?.class === course ? syllabus.items || [] : []);
      setHasMockAccess(false);
    }
  }, [token, student?.class]);

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetchTestSeriesCatalog(token);
      const list = res.courses || [];
      setCourses(list);
      const initial = selectedCourse || pickDefaultTestSeriesCourse(list, student?.class);
      setSelectedCourse(initial);
      if (initial) await loadCourseTests(initial, list);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load test series.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, selectedCourse, student?.class, loadCourseTests]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function selectCourse(course: string) {
    setSelectedCourse(course);
    setLevel('modules');
    setSelectedModule('');
    setSelectedTopic('');
    setInnerLoading(true);
    try {
      await loadCourseTests(course, courses);
    } finally {
      setInnerLoading(false);
    }
  }

  function resetBrowse() {
    setLevel('modules');
    setSelectedModule('');
    setSelectedTopic('');
  }

  function switchTab(next: 'topic' | 'mock') {
    setTab(next);
    resetBrowse();
  }

  function startTopic(testId: string) {
    if (!hasTopicAccess) { setError('Purchase the topic test series to attempt in-app.'); return; }
    router.push({ pathname: '/test/topic/[testId]', params: { testId, course: selectedCourse } });
  }
  function startMock(mockId: string) {
    if (!hasMockAccess) { setError('Purchase the full mock series to attempt in-app.'); return; }
    router.push({ pathname: '/test/mock/[mockId]', params: { mockId, course: selectedCourse } });
  }

  const items = tab === 'topic' ? topicItems : mockItems;
  const hasAccess = tab === 'topic' ? hasTopicAccess : hasMockAccess;
  const seriesType = tab === 'topic' ? 'topic_test' : 'full_mock';
  const salePaise = tab === 'topic' ? pricing?.topicTestPriceInPaise || 0 : pricing?.fullMockPriceInPaise || 0;
  const seriesLabel = tab === 'topic' ? 'Topic test series' : 'Full mock series';

  const moduleGroups = useMemo(() => groupTopicTests(items), [items]);
  const sortedCourses = useMemo(() => {
    const list = [...courses];
    list.sort((a, b) => {
      const aDefault = a.courseName === DEFAULT_TEST_SERIES_COURSE ? -1 : 0;
      const bDefault = b.courseName === DEFAULT_TEST_SERIES_COURSE ? -1 : 0;
      if (aDefault !== bDefault) return aDefault - bDefault;
      return a.courseName.localeCompare(b.courseName);
    });
    return list;
  }, [courses]);
  const activeModule = useMemo(
    () => moduleGroups.find((m) => m.module === selectedModule) || null,
    [moduleGroups, selectedModule]
  );
  const activeTopic = useMemo(
    () => activeModule?.topics.find((t) => t.topic === selectedTopic) || null,
    [activeModule, selectedTopic]
  );

  async function addToCart() {
    if (!selectedCourse || !username) return;
    const key = makeTestSeriesCartKey(selectedCourse, seriesType);
    await addTestSeriesCartItem(username, {
      key,
      course: selectedCourse,
      seriesType,
      label: `${seriesLabel} · ${selectedCourse}`,
      priceInPaise: salePaise,
      validityDays: tab === 'topic' ? pricing?.topicTestValidityDays || 60 : pricing?.fullMockValidityDays || 60
    });
    await refreshTestSeriesCart();
    setCartSuccess('Added to cart. Open Profile → Cart to checkout.');
    setTimeout(() => setCartSuccess(''), 3000);
  }

  function buyNow() {
    if (!selectedCourse) return;
    router.push({
      pathname: '/test-series-checkout',
      params: { course: selectedCourse, seriesType, title: `${seriesLabel} · ${selectedCourse}` }
    });
  }

  function renderTestRow(t: SyllabusItem) {
    return (
      <Pressable key={t._id} onPress={() => (tab === 'topic' ? startTopic(t._id) : startMock(t._id))} style={styles.testRow}>
        <View style={styles.testIcon}>
          <Text style={styles.testEmoji}>{hasAccess ? APP_ICONS.play.emoji : APP_ICONS.lock.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.testTitle}>{t.title || t.topic || 'Test'}</Text>
          <Text style={styles.testMeta}>
            {[`${t.questionCount || 0} Q`, `${t.durationMinutes || 0} min`, t.difficulty].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </Pressable>
    );
  }

  function renderBrowse() {
    if (tab === 'mock') {
      return (
        <Card>
          <View style={styles.cardHead}>
            <Text style={styles.section}>Full mocks ({items.length})</Text>
            {hasAccess ? <Badge label="ACTIVE" tone="success" /> : <Badge label="PREVIEW" />}
          </View>
          {items.map(renderTestRow)}
          {!items.length ? <Text style={styles.empty}>No full mocks for this course.</Text> : null}
        </Card>
      );
    }

    if (level === 'modules') {
      return (
        <Card>
          <View style={styles.cardHead}>
            <Text style={styles.section}>Modules ({moduleGroups.length})</Text>
            {hasAccess ? <Badge label="ACTIVE" tone="success" /> : <Badge label="PREVIEW" />}
          </View>
          <Text style={styles.hint}>Open a module, then pick a topic to see tests.</Text>
          {moduleGroups.map((mod) => (
            <Pressable
              key={mod.module}
              onPress={() => { setSelectedModule(mod.module); setLevel('topics'); }}
              style={styles.testRow}
            >
              <View style={styles.testIcon}>
                <Text style={styles.testEmoji}>{APP_ICONS.folder.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.testTitle}>{mod.module}</Text>
                <Text style={styles.testMeta}>{mod.topics.length} topics · {mod.testCount} tests</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
          {!moduleGroups.length ? <Text style={styles.empty}>No topic tests for this course.</Text> : null}
        </Card>
      );
    }

    if (level === 'topics' && activeModule) {
      return (
        <Card>
          <Pressable onPress={() => { setLevel('modules'); setSelectedModule(''); }} style={styles.crumb}>
            <Ionicons name="arrow-back" size={14} color={colors.accent} />
            <Text style={styles.crumbText}>{activeModule.module}</Text>
          </Pressable>
          <Text style={styles.section}>Topics ({activeModule.topics.length})</Text>
          {activeModule.topics.map((topic) => (
            <Pressable
              key={topic.topic}
              onPress={() => { setSelectedTopic(topic.topic); setLevel('tests'); }}
              style={styles.testRow}
            >
              <View style={styles.testIcon}>
                <Text style={styles.testEmoji}>{APP_ICONS.topic.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.testTitle}>{topic.topic}</Text>
                <Text style={styles.testMeta}>{topic.tests.length} test{topic.tests.length === 1 ? '' : 's'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </Card>
      );
    }

    if (level === 'tests' && activeTopic) {
      return (
        <Card>
          <Pressable onPress={() => { setLevel('topics'); setSelectedTopic(''); }} style={styles.crumb}>
            <Ionicons name="arrow-back" size={14} color={colors.accent} />
            <Text style={styles.crumbText}>{selectedModule} · {activeTopic.topic}</Text>
          </Pressable>
          <Text style={styles.section}>Tests ({activeTopic.tests.length})</Text>
          {activeTopic.tests.map(renderTestRow)}
        </Card>
      );
    }

    return null;
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
      >
        <Eyebrow>Test series</Eyebrow>
        <Title>Practice tests</Title>
        <Subtitle>Browse by module and topic. Purchase a plan to attempt tests in-app.</Subtitle>
        <View style={{ height: 8 }} />
        <ErrorBanner message={error} />
        <SuccessBanner message={cartSuccess} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent}>
          {sortedCourses.map((c) => (
            <Pressable
              key={c.courseName}
              onPress={() => selectCourse(c.courseName)}
              style={[styles.chip, selectedCourse === c.courseName && styles.chipOn]}
            >
              <Text style={[styles.chipText, selectedCourse === c.courseName && styles.chipTextOn]}>{c.courseName}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.segment}>
          <Pressable onPress={() => switchTab('topic')} style={[styles.segBtn, tab === 'topic' && styles.segOn]}>
            <Text style={styles.segEmoji}>{APP_ICONS.tests.emoji}</Text>
            <Text style={[styles.segText, tab === 'topic' && styles.segTextOn]}>Topic tests</Text>
          </Pressable>
          <Pressable onPress={() => switchTab('mock')} style={[styles.segBtn, tab === 'mock' && styles.segOn]}>
            <Text style={styles.segEmoji}>{APP_ICONS.mock.emoji}</Text>
            <Text style={[styles.segText, tab === 'mock' && styles.segTextOn]}>Full mocks</Text>
          </Pressable>
        </View>

        {loading || innerLoading ? <LoadingBlock /> : null}

        {!loading && !innerLoading && pricing ? (
          <Card>
            <Eyebrow>Pricing</Eyebrow>
            {tab === 'topic' ? (
              <PriceRow label="Topic test series" salePaise={pricing.topicTestPriceInPaise} mrpPaise={pricing.topicTestMrpInPaise} validityDays={pricing.topicTestValidityDays} />
            ) : (
              <PriceRow label="Full mock series" salePaise={pricing.fullMockPriceInPaise} mrpPaise={pricing.fullMockMrpInPaise} validityDays={pricing.fullMockValidityDays} />
            )}
            {!hasAccess ? (
              <View style={styles.purchaseRow}>
                {salePaise > 0 ? (
                  <>
                    <View style={styles.purchaseBtn}><PrimaryButton label="Add to cart" variant="outline" onPress={addToCart} /></View>
                    <View style={styles.purchaseBtn}><PrimaryButton label="Buy now" onPress={buyNow} /></View>
                  </>
                ) : (
                  <View style={styles.purchaseBtnFull}><PrimaryButton label="Unlock free access" onPress={buyNow} /></View>
                )}
              </View>
            ) : (
              <View style={styles.activeRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={styles.activeText}>Your plan is active — start any test below.</Text>
              </View>
            )}
          </Card>
        ) : null}

        {!loading && !innerLoading ? renderBrowse() : null}
      </ScrollView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 32 },
    chips: { marginVertical: 10 },
    chipsContent: { gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
    chipOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
    chipText: { color: c.text, fontWeight: '600' },
    chipTextOn: { color: c.accent },
    segment: { flexDirection: 'row', backgroundColor: c.cardAlt, borderRadius: 10, padding: 4, marginBottom: 14, borderWidth: 1, borderColor: c.border },
    segBtn: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    segEmoji: { fontSize: 16 },
    segOn: { backgroundColor: c.accent },
    segText: { color: c.muted, fontWeight: '700' },
    segTextOn: { color: c.accentText },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    section: { color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
    hint: { color: c.muted, fontSize: 13, marginBottom: 8 },
    crumb: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    crumbText: { color: c.accent, fontWeight: '700', fontSize: 13 },
    testRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border },
    testIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
    testEmoji: { fontSize: 16 },
    testTitle: { color: c.text, fontWeight: '600' },
    testMeta: { color: c.muted, fontSize: 12, marginTop: 4 },
    empty: { color: c.muted, fontSize: 13 },
    purchaseRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    purchaseBtn: { flex: 1 },
    purchaseBtnFull: { flex: 1, width: '100%' },
    activeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
    activeText: { color: c.success, fontWeight: '600', flex: 1, fontSize: 13 }
  });
}
