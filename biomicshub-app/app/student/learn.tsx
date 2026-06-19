import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { fetchCourseCatalog, CourseCatalogItem } from '@/src/api/courses';
import CourseLearningRow from '@/src/components/learning/CourseLearningRow';
import EmojiIcon from '@/src/components/ui/EmojiIcon';
import { APP_ICONS } from '@/src/constants/appIcons';
import { ErrorBanner, LoadingBlock, Screen } from '@/src/components/ui';

function courseSubtitle(course: CourseCatalogItem, studentClass?: string) {
  const batchCount = course.batches?.length || 0;
  if (course.isEnrolledCourse && studentClass) {
    return `Your class · ${studentClass}`;
  }
  if (batchCount) {
    return `${batchCount} batch${batchCount === 1 ? '' : 'es'} · BiomicsHub`;
  }
  return 'BiomicsHub';
}

export default function LearnTab() {
  const { token, student } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const [courses, setCourses] = useState<CourseCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetchCourseCatalog(token);
      setCourses(res.courses || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load courses.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filteredCourses = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => {
      const name = (c.displayName || c.courseName).toLowerCase();
      return name.includes(q);
    });
  }, [courses, query]);

  const myCourses = useMemo(
    () => filteredCourses.filter((c) => c.unlocked || c.isEnrolledCourse),
    [filteredCourses]
  );
  const exploreCourses = useMemo(
    () => filteredCourses.filter((c) => !c.unlocked && !c.isEnrolledCourse),
    [filteredCourses]
  );

  const openCourse = (course: CourseCatalogItem) => {
    router.push(`/course/${encodeURIComponent(course.courseName)}`);
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📚 My learning</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setSearchOpen((v) => !v)}
            style={styles.iconBtn}
            accessibilityLabel="Search courses"
          >
            <Ionicons name={searchOpen ? 'close-outline' : 'search-outline'} size={22} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => load(true)}
            style={styles.iconBtn}
            accessibilityLabel="Refresh courses"
          >
            <Ionicons name="refresh-outline" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {searchOpen ? (
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your courses"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoFocus
            returnKeyType="search"
          />
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        <ErrorBanner message={error} />
        {loading ? <LoadingBlock /> : null}

        {!loading && myCourses.length ? (
          <View style={styles.section}>
            {myCourses.map((course, index) => (
              <Animated.View key={course.courseName} entering={FadeInDown.delay(index * 50)}>
                <CourseLearningRow
                  title={course.displayName || course.courseName}
                  subtitle={courseSubtitle(course, student?.class)}
                  thumbnailUrl={course.thumbnailUrl}
                  unlocked={course.unlocked}
                  enrolled={course.isEnrolledCourse}
                  onPress={() => openCourse(course)}
                  showDivider={index < myCourses.length - 1}
                />
              </Animated.View>
            ))}
          </View>
        ) : null}

        {!loading && exploreCourses.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>🔍 Explore courses</Text>
            {exploreCourses.map((course, index) => (
              <Animated.View key={course.courseName} entering={FadeInDown.delay((myCourses.length + index) * 50)}>
                <CourseLearningRow
                  title={course.displayName || course.courseName}
                  subtitle={courseSubtitle(course, student?.class)}
                  thumbnailUrl={course.thumbnailUrl}
                  onPress={() => openCourse(course)}
                  showDivider={index < exploreCourses.length - 1}
                />
              </Animated.View>
            ))}
          </View>
        ) : null}

        {!loading && filteredCourses.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>{APP_ICONS.library.emoji}</Text>
            <Text style={styles.emptyTitle}>
              {query.trim() ? 'No courses match your search' : 'No courses available yet'}
            </Text>
            <Text style={styles.emptyHint}>
              {query.trim() ? 'Try a different keyword.' : 'Check back soon for new batches.'}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function createStyles(c: ThemeColors, topInset: number) {
  return StyleSheet.create({
    screen: {
      backgroundColor: c.card
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: topInset + 8,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      backgroundColor: c.card
    },
    headerTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.2
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.cardAlt
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 4,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: 15,
      padding: 0
    },
    scroll: {
      paddingBottom: 32
    },
    section: {
      backgroundColor: c.card,
      marginBottom: 8
    },
    sectionLabel: {
      color: c.muted,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 4
    },
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 56,
      paddingHorizontal: 24,
      gap: 8
    },
    emptyEmoji: { fontSize: 48, marginBottom: 4 },
    emptyTitle: {
      color: c.text,
      fontSize: 16,
      fontWeight: '700',
      textAlign: 'center'
    },
    emptyHint: {
      color: c.muted,
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20
    }
  });
}
