import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { fetchCourseCatalog, CourseCatalogItem } from '@/src/api/courses';
import { resolveApiAssetUrl } from '@/src/api/client';
import PosterImage from '@/src/components/PosterImage';
import { Badge, Card, ErrorBanner, Eyebrow, LoadingBlock, Screen, Subtitle, Title } from '@/src/components/ui';

export default function LearnTab() {
  const { token, student } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [courses, setCourses] = useState<CourseCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
      >
        <Eyebrow>My learning</Eyebrow>
        <Title>Courses</Title>
        <Subtitle>
          {student?.class ? `Your class: ${student.class}. Tap a course to choose a batch.` : 'Tap a course to choose a batch.'}
        </Subtitle>
        <View style={{ height: 12 }} />
        <ErrorBanner message={error} />
        {loading ? <LoadingBlock /> : null}
        {!loading && courses.map((course, index) => {
          const thumb = resolveApiAssetUrl(course.thumbnailUrl);
          const batchCount = course.batches?.length || 0;
          return (
            <Animated.View key={course.courseName} entering={FadeInDown.delay(index * 60)}>
              <Pressable onPress={() => router.push(`/course/${encodeURIComponent(course.courseName)}`)}>
                <Card style={styles.courseCard}>
                  <PosterImage uri={thumb || undefined} maxHeight={180} rounded="top" fallbackIcon="book-outline" />
                  <View style={styles.courseBody}>
                    <View style={styles.titleRow}>
                      <Text style={styles.name}>{course.displayName || course.courseName}</Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                    </View>
                    <Text style={styles.meta}>{batchCount} batch{batchCount === 1 ? '' : 'es'} available</Text>
                    <View style={styles.badgeRow}>
                      {course.unlocked ? <Badge label="OWNED" tone="success" /> : null}
                      {course.isEnrolledCourse ? <Badge label="YOUR CLASS" tone="warn" /> : null}
                    </View>
                  </View>
                </Card>
              </Pressable>
            </Animated.View>
          );
        })}
        {!loading && courses.length === 0 ? <Text style={styles.meta}>No courses available yet.</Text> : null}
      </ScrollView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 32 },
    courseCard: { padding: 0, overflow: 'hidden' },
    courseBody: { padding: 14, gap: 6 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { color: c.text, fontSize: 16, fontWeight: '700', flex: 1 },
    meta: { color: c.muted, fontSize: 13 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }
  });
}
