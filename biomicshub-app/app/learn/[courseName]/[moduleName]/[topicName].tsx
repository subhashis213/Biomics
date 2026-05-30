import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import {
  fetchMyCourseContent,
  toggleVideoFavorite,
  updateVideoProgress,
  VideoItem,
  VideoMaterial
} from '@/src/api/learning';
import { fetchMyQuizzes, Quiz } from '@/src/api/quiz';
import VideoPlayer from '@/src/components/VideoPlayer';
import { Badge, Card, ErrorBanner, LoadingBlock, Screen } from '@/src/components/ui';
import { decodeRouteParam } from '@/src/utils/format';
import { downloadStudyMaterial } from '@/src/utils/downloadMaterial';

function norm(s: string) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

type MaterialRow = VideoMaterial & { videoId: string; videoTitle: string };

export default function LearnTopicScreen() {
  const params = useLocalSearchParams<{ courseName: string; moduleName: string; topicName: string }>();
  const courseName = decodeRouteParam(params.courseName);
  const moduleName = decodeRouteParam(params.moduleName);
  const topicName = decodeRouteParam(params.topicName);
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');

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
        const topicVideos = (content.videos || []).filter(
          (v) => norm(v.module || 'General') === norm(moduleName) && norm(v.topic || 'General') === norm(topicName)
        );
        const topicQuizzes = (quizRes.quizzes || []).filter(
          (q) => norm(q.module || 'General') === norm(moduleName) && norm(q.topic || 'General') === norm(topicName)
        );
        setVideos(topicVideos);
        setQuizzes(topicQuizzes);
        setFavorites(new Set((content.favorites || []).map(String)));
        setCompleted(new Set((content.completedVideos || []).map(String)));
        if (topicVideos[0]) setActiveId(String(topicVideos[0]._id));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load lectures.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, courseName, moduleName, topicName]);

  const materials = useMemo<MaterialRow[]>(() => {
    const rows: MaterialRow[] = [];
    videos.forEach((v) => {
      (v.materials || []).forEach((m) => {
        rows.push({ ...m, videoId: String(v._id), videoTitle: v.title });
      });
    });
    return rows;
  }, [videos]);

  const active = videos.find((v) => String(v._id) === activeId);

  async function onToggleFavorite(videoId: string) {
    if (!token) return;
    try {
      const res = await toggleVideoFavorite(token, videoId);
      setFavorites(new Set((res.favorites || []).map(String)));
    } catch { /* ignore */ }
  }

  async function onToggleComplete(videoId: string) {
    if (!token) return;
    const next = !completed.has(videoId);
    try {
      const res = await updateVideoProgress(token, videoId, next);
      setCompleted(new Set((res.completedVideos || []).map(String)));
    } catch { /* ignore */ }
  }

  async function onDownloadMaterial(row: MaterialRow) {
    if (!token) return;
    const key = `${row.videoId}::${row.filename}`;
    setDownloading(key);
    setError('');
    try {
      await downloadStudyMaterial(token, row.videoId, row.filename, row.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloading('');
    }
  }

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: topicName }} />
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: topicName }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ErrorBanner message={error} />
        {active ? (
          <Card>
            <Text style={styles.activeTitle}>{active.title}</Text>
            <VideoPlayer url={active.url} />
            <View style={styles.actions}>
              <Pressable
                onPress={() => onToggleFavorite(String(active._id))}
                style={[styles.actionBtn, favorites.has(String(active._id)) && styles.actionOn]}
              >
                <Ionicons
                  name={favorites.has(String(active._id)) ? 'star' : 'star-outline'}
                  size={16}
                  color={favorites.has(String(active._id)) ? colors.warn : colors.muted}
                />
                <Text style={styles.actionText}>{favorites.has(String(active._id)) ? 'Saved' : 'Save'}</Text>
              </Pressable>
              <Pressable
                onPress={() => onToggleComplete(String(active._id))}
                style={[styles.actionBtn, completed.has(String(active._id)) && styles.actionDone]}
              >
                <Ionicons
                  name={completed.has(String(active._id)) ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={completed.has(String(active._id)) ? colors.success : colors.muted}
                />
                <Text style={styles.actionText}>{completed.has(String(active._id)) ? 'Completed' : 'Mark complete'}</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        <Text style={styles.listTitle}>Lectures ({videos.length})</Text>
        {videos.map((v) => {
          const id = String(v._id);
          const isActive = id === activeId;
          return (
            <Pressable key={id} onPress={() => setActiveId(id)}>
              <Card style={isActive ? styles.activeCard : undefined}>
                <View style={styles.row}>
                  <Ionicons name={isActive ? 'play-circle' : 'play-circle-outline'} size={20} color={isActive ? colors.accent : colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.videoTitle}>{v.title}</Text>
                    {v.description ? <Text style={styles.topic}>{v.description}</Text> : null}
                  </View>
                  {completed.has(id) ? <Ionicons name="checkmark-circle" size={18} color={colors.success} /> : null}
                </View>
              </Card>
            </Pressable>
          );
        })}
        {!videos.length ? <Text style={styles.empty}>No lectures in this chapter yet.</Text> : null}

        {quizzes.length ? (
          <>
            <Text style={styles.listTitle}>Quizzes ({quizzes.length})</Text>
            <Text style={styles.hint}>Attempt short quizzes after watching the lectures.</Text>
            {quizzes.map((q) => (
              <Pressable
                key={q._id}
                onPress={() => router.push({ pathname: '/quiz/[quizId]', params: { quizId: q._id, course: courseName } })}
              >
                <Card>
                  <View style={styles.row}>
                    <Ionicons name="help-circle-outline" size={20} color={colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.videoTitle}>{q.title || q.topic || 'Quiz'}</Text>
                      <Text style={styles.topic}>
                        {[q.difficulty, `${q.questionCount || 0} Q`, `${q.timeLimitMinutes || 0} min`].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Badge label="START" tone="success" />
                  </View>
                </Card>
              </Pressable>
            ))}
          </>
        ) : null}

        {materials.length ? (
          <>
            <Text style={styles.listTitle}>Study material ({materials.length})</Text>
            <Text style={styles.hint}>PDFs and notes uploaded for this chapter.</Text>
            {materials.map((m) => {
              const key = `${m.videoId}::${m.filename}`;
              const busy = downloading === key;
              return (
                <Card key={key}>
                  <View style={styles.row}>
                    <Ionicons name="document-text-outline" size={20} color={colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.videoTitle}>{m.name}</Text>
                      <Text style={styles.topic}>{m.videoTitle}</Text>
                    </View>
                    <Pressable style={styles.downloadBtn} onPress={() => onDownloadMaterial(m)} disabled={busy}>
                      {busy ? (
                        <ActivityIndicator size="small" color={colors.accent} />
                      ) : (
                        <>
                          <Ionicons name="download-outline" size={16} color={colors.accent} />
                          <Text style={styles.downloadText}>Download</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </Card>
              );
            })}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 40 },
    activeTitle: { color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 10 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardAlt },
    actionOn: { borderColor: c.warn },
    actionDone: { borderColor: c.success },
    actionText: { color: c.text, fontWeight: '600', fontSize: 13 },
    listTitle: { color: c.muted, fontWeight: '700', marginVertical: 12 },
    hint: { color: c.muted, fontSize: 13, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    videoTitle: { color: c.text, fontWeight: '600' },
    topic: { color: c.muted, fontSize: 12, marginTop: 4 },
    activeCard: { borderColor: c.accent },
    empty: { color: c.muted },
    downloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: c.accent },
    downloadText: { color: c.accent, fontWeight: '700', fontSize: 12 }
  });
}
