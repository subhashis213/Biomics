import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { fetchMyCourseContent, VideoItem } from '@/src/api/learning';
import { fetchMyQuizzes, Quiz } from '@/src/api/quiz';
import { Badge, Card, ErrorBanner, Eyebrow, LoadingBlock, Screen, Subtitle } from '@/src/components/ui';
import { decodeRouteParam } from '@/src/utils/format';

function norm(s: string) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

export default function LearnModuleTopicsScreen() {
  const params = useLocalSearchParams<{ courseName: string; moduleName: string }>();
  const courseName = decodeRouteParam(params.courseName);
  const moduleName = decodeRouteParam(params.moduleName);
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      try {
        const [content, quizRes] = await Promise.all([
          fetchMyCourseContent(token, courseName),
          fetchMyQuizzes(token, courseName).catch(() => ({ quizzes: [] as Quiz[], course: '' }))
        ]);
        if (cancelled) return;
        const modVideos = (content.videos || []).filter((v) => norm(v.module || 'General') === norm(moduleName));
        const modQuizzes = (quizRes.quizzes || []).filter((q) => norm(q.module || 'General') === norm(moduleName));
        setVideos(modVideos);
        setQuizzes(modQuizzes);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load chapters.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, courseName, moduleName]);

  const topics = useMemo(() => {
    const map = new Map<string, { videos: VideoItem[]; quizzes: Quiz[]; materials: number }>();
    videos.forEach((v) => {
      const topic = norm(v.topic || 'General');
      const entry = map.get(topic) || { videos: [], quizzes: [], materials: 0 };
      entry.videos.push(v);
      entry.materials += (v.materials || []).length;
      map.set(topic, entry);
    });
    quizzes.forEach((q) => {
      const topic = norm(q.topic || 'General');
      const entry = map.get(topic) || { videos: [], quizzes: [], materials: 0 };
      entry.quizzes.push(q);
      map.set(topic, entry);
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [videos, quizzes]);

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: moduleName }} />
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: moduleName }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ErrorBanner message={error} />
        <Eyebrow>Chapters</Eyebrow>
        <Subtitle>Select a chapter to watch lectures, attempt quizzes and download study material.</Subtitle>
        <View style={{ height: 8 }} />
        {topics.map((topic) => (
          <Pressable
            key={topic.name}
            onPress={() =>
              router.push(
                `/learn/${encodeURIComponent(courseName)}/${encodeURIComponent(moduleName)}/${encodeURIComponent(topic.name)}`
              )
            }
          >
            <Card>
              <View style={styles.row}>
                <View style={styles.iconWrap}>
                  <Ionicons name="book-outline" size={20} color={colors.accent} />
                </View>
                <Text style={styles.name}>{topic.name}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </View>
              <View style={styles.metaRow}>
                {topic.videos.length ? <Badge label={`${topic.videos.length} videos`} tone="success" /> : null}
                {topic.quizzes.length ? <Badge label={`${topic.quizzes.length} quizzes`} /> : null}
                {topic.materials ? <Badge label={`${topic.materials} materials`} tone="warn" /> : null}
              </View>
            </Card>
          </Pressable>
        ))}
        {!topics.length ? <Text style={styles.empty}>No chapters in this module yet.</Text> : null}
      </ScrollView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 40 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
    name: { color: c.text, fontSize: 16, fontWeight: '700', flex: 1 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    empty: { color: c.muted }
  });
}
