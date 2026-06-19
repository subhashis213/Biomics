import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { fetchFreeStudyLibrary, FreeStudyCourseGroup, FreeStudyResource } from '@/src/api/freeStudyResources';
import { APP_ICONS } from '@/src/constants/appIcons';
import { downloadFreeStudyResource } from '@/src/utils/downloadFreeResource';
import { Badge, Card, ErrorBanner, Eyebrow, LoadingBlock, Screen, Subtitle, SuccessBanner, Title } from '@/src/components/ui';

function typeEmoji(type: string) {
  if (type === 'book') return APP_ICONS.books.emoji;
  if (type === 'job-notes') return '💼';
  return APP_ICONS.tests.emoji;
}

function typeLabel(type: string) {
  if (type === 'book') return 'Book';
  if (type === 'job-notes') return 'Job notes';
  return 'Material';
}

export default function StudyLibraryScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [courses, setCourses] = useState<FreeStudyCourseGroup[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [downloadingId, setDownloadingId] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetchFreeStudyLibrary(token);
      setCourses(res.courses || []);
      setTotalCount(res.totalCount || 0);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleDownload(item: FreeStudyResource) {
    if (!token) return;
    setDownloadingId(item._id);
    setError('');
    setSuccess('');
    try {
      const result = await downloadFreeStudyResource(token, item._id, item.title, {
        originalName: item.originalName,
        mimeType: item.mimeType,
        filename: item.filename
      });
      if (result.savedToDownloads) {
        setSuccess(`${result.fileName} saved to Downloads. Open Files app to view it.`);
      } else if (result.opened) {
        setSuccess(`${result.fileName} downloaded. Choose a PDF app if prompted.`);
      } else {
        setSuccess(`${result.fileName} downloaded successfully.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloadingId('');
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Free study library' }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
      >
        <Eyebrow>100% free</Eyebrow>
        <Title>Books & study materials</Title>
        <Subtitle>Download course-wise notes, books, and job materials — no payment required.</Subtitle>
        <View style={{ height: 12 }} />
        <ErrorBanner message={error} />
        <SuccessBanner message={success} />
        {loading ? <LoadingBlock /> : null}

        {!loading && totalCount === 0 ? (
          <Card>
            <Text style={styles.empty}>No free materials uploaded yet. Check back soon.</Text>
          </Card>
        ) : null}

        {courses.map((group) => (
          <Card key={group.courseName} style={styles.groupCard}>
            <View style={styles.groupHead}>
              <Text style={styles.groupEmoji}>{APP_ICONS.course.emoji}</Text>
              <Text style={styles.groupTitle}>{group.courseName}</Text>
              <Badge label={`${group.items.length}`} tone="success" />
            </View>
            {group.items.map((item) => (
              <View key={item._id} style={styles.itemRow}>
                <View style={styles.itemIcon}>
                  <Text style={styles.itemEmoji}>{typeEmoji(item.resourceType)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  {item.description ? <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text> : null}
                  <Text style={styles.itemMeta}>{typeLabel(item.resourceType)} · Free download</Text>
                </View>
                <Pressable style={styles.downloadBtn} onPress={() => handleDownload(item)} disabled={downloadingId === item._id}>
                  {downloadingId === item._id ? (
                    <ActivityIndicator color={colors.accentText} size="small" />
                  ) : (
                    <>
                      <Text style={styles.dlEmoji}>{APP_ICONS.download.emoji}</Text>
                      <Text style={styles.downloadText}>Get</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ))}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 40 },
    empty: { color: c.muted, textAlign: 'center', paddingVertical: 20 },
    groupCard: { marginBottom: 14, padding: 0, overflow: 'hidden' },
    groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, backgroundColor: c.cardAlt, borderBottomWidth: 1, borderBottomColor: c.border },
    groupEmoji: { fontSize: 18 },
    groupTitle: { color: c.text, fontWeight: '800', fontSize: 16, flex: 1 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border },
    itemIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
    itemEmoji: { fontSize: 18 },
    itemTitle: { color: c.text, fontWeight: '800', fontSize: 14 },
    itemDesc: { color: c.muted, fontSize: 12, marginTop: 3, lineHeight: 17 },
    itemMeta: { color: c.accent, fontSize: 11, fontWeight: '700', marginTop: 4 },
    downloadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.accent,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      minWidth: 64,
      justifyContent: 'center'
    },
    downloadText: { color: c.accentText, fontWeight: '800', fontSize: 12 },
    dlEmoji: { fontSize: 14 }
  });
}
