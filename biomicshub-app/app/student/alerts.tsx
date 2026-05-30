import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { fetchNotifications, NotificationItem } from '@/src/api/notifications';
import { Card, ErrorBanner, Eyebrow, LoadingBlock, Screen, Subtitle, Title } from '@/src/components/ui';

function formatDate(value?: string) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

export default function AlertsTab() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetchNotifications(token);
      const list = Array.isArray(res?.notifications) ? res.notifications : [];
      setItems(list);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: 'Notifications' }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
      >
        <Eyebrow>Notifications</Eyebrow>
        <Title>Announcements</Title>
        <Subtitle>Push alerts from your institute appear here.</Subtitle>
        <View style={{ height: 12 }} />
        <ErrorBanner message={error} />
        {loading ? <LoadingBlock /> : null}
        {!loading && items.map((n, i) => (
          <Card key={n?._id ? String(n._id) : `note-${i}`}>
            <View style={styles.head}>
              <Ionicons name="megaphone-outline" size={18} color={colors.accent} />
              <Text style={styles.title}>{n?.title || 'Announcement'}</Text>
            </View>
            {n?.message ? <Text style={styles.msg}>{n.message}</Text> : null}
            {n?.createdAt ? <Text style={styles.date}>{formatDate(n.createdAt)}</Text> : null}
          </Card>
        ))}
        {!loading && !items.length ? <Text style={styles.empty}>No notifications yet.</Text> : null}
      </ScrollView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 32 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { color: c.text, fontWeight: '700', fontSize: 16, flex: 1 },
    msg: { color: c.muted, marginTop: 8, lineHeight: 20 },
    date: { color: c.accent, marginTop: 8, fontSize: 12 },
    empty: { color: c.muted }
  });
}
