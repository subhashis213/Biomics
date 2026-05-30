import { useCallback, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import {
  AdminMockExam,
  AdminVideo,
  createVideo,
  deleteVideo,
  fetchAdminFullMocks,
  fetchAdminMockExams,
  fetchAdminTopicTests,
  fetchAllVideos
} from '@/src/api/admin';
import { Badge, Card, ErrorBanner, Eyebrow, Field, LoadingBlock, PrimaryButton, Screen, Subtitle, Title } from '@/src/components/ui';

type Section = 'videos' | 'tests' | 'exams';

export default function AdminContent() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [section, setSection] = useState<Section>('videos');
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [topicTests, setTopicTests] = useState<any[]>([]);
  const [fullMocks, setFullMocks] = useState<any[]>([]);
  const [exams, setExams] = useState<AdminMockExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [topic, setTopic] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [v, tt, fm, ex] = await Promise.all([
        fetchAllVideos(token).catch(() => []),
        fetchAdminTopicTests(token).catch(() => ({ tests: [] })),
        fetchAdminFullMocks(token).catch(() => ({ mocks: [] })),
        fetchAdminMockExams(token).catch(() => ({ exams: [] }))
      ]);
      setVideos(Array.isArray(v) ? v : []);
      setTopicTests((tt as any).tests || []);
      setFullMocks((fm as any).mocks || []);
      setExams(ex.exams || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleCreate() {
    setError('');
    if (!title.trim() || !url.trim() || !category.trim()) {
      setError('Title, URL and course are required.');
      return;
    }
    setSaving(true);
    try {
      await createVideo(token!, {
        title: title.trim(),
        url: url.trim(),
        category: category.trim(),
        module: moduleName.trim() || 'General',
        topic: topic.trim() || 'General'
      });
      setTitle(''); setUrl(''); setCategory(''); setModuleName(''); setTopic('');
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add video.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(video: AdminVideo) {
    Alert.alert('Delete lecture', `Remove "${video.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteVideo(token!, video._id);
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete.');
          }
        }
      }
    ]);
  }

  const tabs: { key: Section; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
    { key: 'videos', label: `Videos (${videos.length})`, icon: 'film-outline' },
    { key: 'tests', label: `Tests (${topicTests.length + fullMocks.length})`, icon: 'document-text-outline' },
    { key: 'exams', label: `Exams (${exams.length})`, icon: 'trophy-outline' }
  ];

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Eyebrow>Content</Eyebrow>
          <Title>Content library</Title>
          <Subtitle>All lectures, test series and exams configured for your courses.</Subtitle>

          <View style={styles.segment}>
            {tabs.map((t) => (
              <Pressable key={t.key} onPress={() => setSection(t.key)} style={[styles.segBtn, section === t.key && styles.segOn]}>
                <Ionicons name={t.icon} size={15} color={section === t.key ? colors.accentText : colors.muted} />
                <Text style={[styles.segText, section === t.key && styles.segTextOn]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          <ErrorBanner message={error} />
          {loading ? <LoadingBlock /> : null}

          {!loading && section === 'videos' ? (
            <>
              <Pressable style={styles.addBtn} onPress={() => setShowForm((s) => !s)}>
                <Ionicons name={showForm ? 'close' : 'add'} size={18} color={colors.accent} />
                <Text style={styles.addText}>{showForm ? 'Close form' : 'Add new lecture'}</Text>
              </Pressable>
              {showForm ? (
                <Card>
                  <Field label="Title" value={title} onChangeText={setTitle} autoCapitalize="sentences" />
                  <Field label="Video URL (YouTube or direct)" value={url} onChangeText={setUrl} />
                  <Field label="Course (e.g. NEET)" value={category} onChangeText={setCategory} autoCapitalize="characters" />
                  <Field label="Module (optional)" value={moduleName} onChangeText={setModuleName} autoCapitalize="sentences" />
                  <Field label="Topic (optional)" value={topic} onChangeText={setTopic} autoCapitalize="sentences" />
                  <PrimaryButton label={saving ? 'Saving…' : 'Add lecture'} onPress={handleCreate} disabled={saving} />
                </Card>
              ) : null}
              {videos.map((v) => (
                <Card key={v._id}>
                  <View style={styles.row}>
                    <Ionicons name="videocam-outline" size={18} color={colors.accent} />
                    <Text style={styles.itemTitle}>{v.title}</Text>
                    <Pressable onPress={() => confirmDelete(v)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                  <Text style={styles.meta}>{[v.category, v.module, v.topic].filter(Boolean).join(' · ')}</Text>
                </Card>
              ))}
              {!videos.length ? <Text style={styles.empty}>No lectures uploaded yet.</Text> : null}
            </>
          ) : null}

          {!loading && section === 'tests' ? (
            <>
              <Text style={styles.groupTitle}>Topic tests</Text>
              {topicTests.map((t) => (
                <Card key={t._id}>
                  <View style={styles.row}>
                    <Ionicons name="documents-outline" size={18} color={colors.accent} />
                    <Text style={styles.itemTitle}>{t.title || t.topic}</Text>
                    <Badge label={`${Array.isArray(t.questions) ? t.questions.length : t.questionCount || 0} Q`} />
                  </View>
                  <Text style={styles.meta}>{[t.category, t.module, t.topic].filter(Boolean).join(' · ')}</Text>
                </Card>
              ))}
              {!topicTests.length ? <Text style={styles.empty}>No topic tests configured.</Text> : null}

              <Text style={styles.groupTitle}>Full mocks</Text>
              {fullMocks.map((m) => (
                <Card key={m._id}>
                  <View style={styles.row}>
                    <Ionicons name="timer-outline" size={18} color={colors.accent} />
                    <Text style={styles.itemTitle}>{m.title}</Text>
                    <Badge label={`${Array.isArray(m.questions) ? m.questions.length : m.questionCount || 0} Q`} />
                  </View>
                  <Text style={styles.meta}>{[m.category, `${m.durationMinutes || 0} min`].filter(Boolean).join(' · ')}</Text>
                </Card>
              ))}
              {!fullMocks.length ? <Text style={styles.empty}>No full mocks configured.</Text> : null}
            </>
          ) : null}

          {!loading && section === 'exams' ? (
            <>
              {exams.map((e) => (
                <Card key={e._id}>
                  <View style={styles.row}>
                    <Ionicons name="trophy-outline" size={18} color={colors.accent} />
                    <Text style={styles.itemTitle}>{e.title}</Text>
                    {e.resultReleased ? <Badge label="RELEASED" tone="success" /> : <Badge label="PENDING" tone="warn" />}
                  </View>
                  <Text style={styles.meta}>
                    {[e.category, e.examDate ? new Date(e.examDate).toLocaleDateString('en-IN') : '', `${e.durationMinutes || 0} min`].filter(Boolean).join(' · ')}
                  </Text>
                </Card>
              ))}
              {!exams.length ? <Text style={styles.empty}>No exams configured.</Text> : null}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scroll: { padding: 16, paddingBottom: 40 },
    segment: { flexDirection: 'row', backgroundColor: c.cardAlt, borderRadius: 10, padding: 4, marginVertical: 14, borderWidth: 1, borderColor: c.border },
    segBtn: { flex: 1, flexDirection: 'row', gap: 5, paddingVertical: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    segOn: { backgroundColor: c.accent },
    segText: { color: c.muted, fontWeight: '700', fontSize: 12 },
    segTextOn: { color: c.accentText },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, marginBottom: 6 },
    addText: { color: c.accent, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    itemTitle: { color: c.text, fontWeight: '700', flex: 1 },
    meta: { color: c.muted, fontSize: 13, marginTop: 6 },
    groupTitle: { color: c.text, fontWeight: '800', fontSize: 15, marginTop: 8, marginBottom: 8 },
    empty: { color: c.muted, marginBottom: 8 }
  });
}
