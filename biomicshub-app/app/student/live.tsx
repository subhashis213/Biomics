import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { CalendarEntry, fetchStudentLiveWorkspace, LiveClass } from '@/src/api/live';
import { isVisibleCalendarEntry, isVisibleLiveClass } from '@/src/utils/liveClass';
import { Badge, Card, ErrorBanner, Eyebrow, LoadingBlock, PrimaryButton, Screen, Subtitle, Title } from '@/src/components/ui';

const LIVE_REFRESH_MS = 15000;

function fmtTime(value?: string | null) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
function fmtDay(value?: string | null) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export default function StudentLive() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeClass, setActiveClass] = useState<LiveClass | null>(null);
  const [upcoming, setUpcoming] = useState<LiveClass[]>([]);
  const [calendar, setCalendar] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const ws = await fetchStudentLiveWorkspace(token);
      const nextActive = ws.activeClass && isVisibleLiveClass(ws.activeClass) ? ws.activeClass : null;
      const nextUpcoming = (ws.upcomingClasses || []).filter(isVisibleLiveClass);
      const nextCalendar = (ws.calendar || []).filter(isVisibleCalendarEntry);
      setActiveClass(nextActive);
      setUpcoming(nextUpcoming);
      setCalendar(nextCalendar);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load live classes.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    const timer = setInterval(() => { load(true); }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    [...calendar]
      .filter((e) => e.startsAt)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .forEach((e) => {
        const key = fmtDay(e.startsAt);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(e);
      });
    return Array.from(map.entries());
  }, [calendar]);

  function join(classId: string) {
    router.push({ pathname: '/live/[classId]', params: { classId, mode: 'student' } });
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
      >
        <Eyebrow>Live classes</Eyebrow>
        <Title>Live & schedule</Title>
        <Subtitle>Join live sessions and see your upcoming class calendar.</Subtitle>
        <View style={{ height: 12 }} />
        <ErrorBanner message={error} />
        {loading ? <LoadingBlock /> : null}

        {activeClass ? (
          <View style={styles.liveCard}>
            <View style={styles.liveTopRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveNow}>LIVE NOW</Text>
            </View>
            <Text style={styles.liveTitle}>{activeClass.title}</Text>
            <Text style={styles.liveMeta}>{[activeClass.course, activeClass.batch].filter(Boolean).join(' · ')}</Text>
            <View style={{ height: 12 }} />
            <PrimaryButton label="Join live class" onPress={() => join(activeClass._id)} />
          </View>
        ) : !loading ? (
          <Card>
            <View style={styles.emptyLive}>
              <Ionicons name="videocam-off-outline" size={28} color={colors.muted} />
              <Text style={styles.empty}>No class is live right now.</Text>
            </View>
          </Card>
        ) : null}

        {upcoming.length ? (
          <>
            <Text style={styles.section}>Upcoming classes</Text>
            {upcoming.map((c) => (
              <Card key={c._id}>
                <View style={styles.row}>
                  <View style={styles.iconWrap}>
                    <Ionicons name="calendar-outline" size={20} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.upTitle}>{c.title}</Text>
                    <Text style={styles.upMeta}>
                      {fmtDay(c.scheduledAt)} · {fmtTime(c.scheduledAt)}
                      {c.scheduledEndAt ? ` – ${fmtTime(c.scheduledEndAt)}` : ''}
                    </Text>
                    <Text style={styles.upMeta}>{[c.course, c.batch].filter(Boolean).join(' · ')}</Text>
                  </View>
                  {c.status === 'live' || c.isActive ? <Badge label="LIVE" tone="success" /> : <Badge label="SCHEDULED" tone="warn" />}
                </View>
              </Card>
            ))}
          </>
        ) : null}

        {grouped.length ? (
          <>
            <Text style={styles.section}>Calendar</Text>
            {grouped.map(([day, entries]) => (
              <Card key={day}>
                <Text style={styles.calDay}>{day}</Text>
                {entries.map((e) => (
                  <View key={`${e.kind}-${e.id}`} style={styles.calRow}>
                    <View style={[styles.calBar, { backgroundColor: e.kind === 'blocked-slot' ? colors.warn : colors.accent }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.calTitle}>{e.title}</Text>
                      <Text style={styles.calMeta}>
                        {fmtTime(e.startsAt)}{e.endsAt ? ` – ${fmtTime(e.endsAt)}` : ''}
                        {e.course ? ` · ${e.course}` : ''}
                      </Text>
                    </View>
                    {e.kind === 'blocked-slot' ? (
                      <Ionicons name="lock-closed" size={16} color={colors.warn} />
                    ) : e.liveClassId && (activeClass?._id === e.liveClassId || e.status === 'live') ? (
                      <Pressable onPress={() => join(e.liveClassId!)}>
                        <Ionicons name="videocam" size={16} color={colors.accent} />
                      </Pressable>
                    ) : (
                      <Ionicons name="videocam-outline" size={16} color={colors.muted} />
                    )}
                  </View>
                ))}
              </Card>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 32 },
    liveCard: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.danger, padding: 16, marginBottom: 14 },
    liveTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger },
    liveNow: { color: c.danger, fontWeight: '800', letterSpacing: 1, fontSize: 12 },
    liveTitle: { color: c.text, fontSize: 18, fontWeight: '800' },
    liveMeta: { color: c.muted, marginTop: 4 },
    emptyLive: { alignItems: 'center', gap: 8, paddingVertical: 8 },
    empty: { color: c.muted },
    section: { color: c.text, fontWeight: '800', fontSize: 16, marginTop: 8, marginBottom: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
    upTitle: { color: c.text, fontWeight: '700' },
    upMeta: { color: c.muted, fontSize: 12, marginTop: 3 },
    calDay: { color: c.accent, fontWeight: '800', marginBottom: 8 },
    calRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border },
    calBar: { width: 4, height: 34, borderRadius: 2 },
    calTitle: { color: c.text, fontWeight: '600' },
    calMeta: { color: c.muted, fontSize: 12, marginTop: 2 }
  });
}
