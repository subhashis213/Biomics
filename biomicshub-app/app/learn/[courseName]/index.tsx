import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { fetchMyCourseContent, fetchModuleCatalog, VideoItem } from '@/src/api/learning';
import { Badge, Card, ErrorBanner, Eyebrow, LoadingBlock, Screen, Subtitle } from '@/src/components/ui';
import { decodeRouteParam } from '@/src/utils/format';

function norm(s: string) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

export default function LearnModulesScreen() {
  const { courseName: p } = useLocalSearchParams<{ courseName: string }>();
  const courseName = decodeRouteParam(p);
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [access, setAccess] = useState<Record<string, { unlocked?: boolean; purchaseRequired?: boolean }>>({});
  const [moduleKeys, setModuleKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      setLoading(true);
      try {
        const [content, catalog] = await Promise.all([
          fetchMyCourseContent(token, courseName),
          fetchModuleCatalog(token).catch(() => ({ modules: [] }))
        ]);
        if (cancelled) return;
        setVideos(content.videos || []);
        setAccess(content.access?.moduleAccess || {});
        const catalogMods = (catalog.modules || [])
          .filter((m) => norm(m.category) === norm(courseName))
          .map((m) => m.name);
        const fromVideos = (content.videos || []).map((v) => norm(v.module || 'General'));
        const keys = Array.from(new Set([...catalogMods, ...fromVideos].filter(Boolean)));
        setModuleKeys(keys.length ? keys : ['General']);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load modules.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, courseName]);

  const modules = useMemo(() => {
    return moduleKeys.map((name) => {
      const modVideos = videos.filter((v) => norm(v.module || 'General') === norm(name));
      const topicCount = new Set(modVideos.map((v) => norm(v.topic || 'General'))).size;
      const acc = access[name];
      const locked = Boolean(acc?.purchaseRequired && !acc?.unlocked);
      return { name, count: modVideos.length, topicCount, locked };
    });
  }, [moduleKeys, videos, access]);

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: courseName }} />
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: courseName }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ErrorBanner message={error} />
        <Eyebrow>Modules</Eyebrow>
        <Subtitle>Select a module, then pick a chapter to watch lectures, quizzes and study material.</Subtitle>
        <View style={{ height: 8 }} />
        {modules.map((mod) => (
          <Pressable
            key={mod.name}
            disabled={mod.locked}
            onPress={() => router.push(`/learn/${encodeURIComponent(courseName)}/${encodeURIComponent(mod.name)}`)}
          >
            <Card style={mod.locked ? styles.locked : undefined}>
              <View style={styles.row}>
                <View style={styles.iconWrap}>
                  <Ionicons name={mod.locked ? 'lock-closed' : 'folder-open-outline'} size={20} color={mod.locked ? colors.muted : colors.accent} />
                </View>
                <Text style={styles.name}>{mod.name}</Text>
                {mod.locked ? <Badge label="LOCKED" /> : <Badge label={`${mod.topicCount || mod.count} chapters`} tone="success" />}
              </View>
              {mod.locked ? <Text style={styles.hint}>Unlock this module from the course pricing screen.</Text> : null}
            </Card>
          </Pressable>
        ))}
        {!modules.length ? <Text style={styles.hint}>No modules found for this course.</Text> : null}
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
    hint: { color: c.muted, fontSize: 13, marginTop: 8 },
    locked: { opacity: 0.7 }
  });
}
