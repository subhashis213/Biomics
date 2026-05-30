import { useCallback, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import {
  AdminWorkspace,
  CalendarEntry,
  createCalendarBlock,
  createLiveClass,
  endLiveClass,
  LiveClass,
  startLiveClass,
  fetchAdminLiveWorkspace
} from '@/src/api/live';
import { isVisibleLiveClass } from '@/src/utils/liveClass';
import { Badge, Card, ErrorBanner, Eyebrow, Field, LoadingBlock, PrimaryButton, Screen, SelectField, Subtitle, SuccessBanner, Title } from '@/src/components/ui';

function fmt(value?: string | null) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}
function isValidIso(value: string) {
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

export default function AdminLive() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [ws, setWs] = useState<AdminWorkspace>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<'none' | 'class' | 'block'>('none');
  const [saving, setSaving] = useState(false);

  // schedule class fields
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState('');
  const [batch, setBatch] = useState('General');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchAdminLiveWorkspace(token);
      setWs(data || {});
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load live workspace.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  const courseOptions = useMemo(
    () => (ws.availableCourses || []).map((name) => ({ value: name, label: name })),
    [ws.availableCourses]
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const classes = useMemo<LiveClass[]>(() => {
    const list: LiveClass[] = [];
    if (ws.activeClass && isVisibleLiveClass(ws.activeClass)) list.push(ws.activeClass);
    (ws.upcomingClasses || []).forEach((c) => {
      if (isVisibleLiveClass(c) && !list.find((x) => x._id === c._id)) list.push(c);
    });
    (ws.classes || []).forEach((c) => {
      if (isVisibleLiveClass(c) && !list.find((x) => x._id === c._id)) list.push(c);
    });
    return list;
  }, [ws]);

  const blocks = useMemo<CalendarEntry[]>(
    () => (ws.calendarBlocks || ws.calendar || []).filter((e) => e.kind === 'blocked-slot'),
    [ws]
  );

  function conduct(classId: string) {
    router.push({ pathname: '/live/[classId]', params: { classId, mode: 'admin' } });
  }

  async function onStart(classId: string) {
    setError('');
    try {
      await startLiveClass(token!, classId);
      conduct(classId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start class.');
    }
  }

  function onEnd(classId: string) {
    Alert.alert('End class', 'End this live session for everyone?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End',
        style: 'destructive',
        onPress: async () => {
          try {
            await endLiveClass(token!, classId);
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to end class.');
          }
        }
      }
    ]);
  }

  async function submitForm() {
    setError('');
    setSuccess('');
    if (!title.trim() || !course.trim() || !startsAt.trim()) {
      setError('Title, course and start time are required.');
      return;
    }
    if (!isValidIso(startsAt.trim()) || (endsAt.trim() && !isValidIso(endsAt.trim()))) {
      setError('Use date/time format YYYY-MM-DDTHH:MM (e.g. 2026-06-01T18:30).');
      return;
    }
    setSaving(true);
    try {
      const startIso = new Date(startsAt.trim()).toISOString();
      const endIso = endsAt.trim() ? new Date(endsAt.trim()).toISOString() : undefined;
      if (form === 'class') {
        await createLiveClass(token!, {
          title: title.trim(),
          course: course.trim(),
          batch: batch.trim() || 'General',
          scheduledAt: startIso,
          scheduledEndAt: endIso
        });
        setSuccess('Live class scheduled.');
      } else {
        if (!endIso) {
          setError('Blocked slot needs an end time.');
          setSaving(false);
          return;
        }
        await createCalendarBlock(token!, {
          course: course.trim(),
          batch: batch.trim() || 'General',
          title: title.trim(),
          startsAt: startIso,
          endsAt: endIso
        });
        setSuccess('Calendar slot blocked.');
      }
      setTitle(''); setCourse(''); setBatch('General'); setStartsAt(''); setEndsAt('');
      setForm('none');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
        >
          <Eyebrow>Live classes</Eyebrow>
          <Title>Conduct & schedule</Title>
          <Subtitle>Start a session, schedule classes and block calendar slots.</Subtitle>
          <View style={{ height: 12 }} />
          <ErrorBanner message={error} />
          <SuccessBanner message={success} />

          <View style={styles.actionsRow}>
            <Pressable style={[styles.pill, form === 'class' && styles.pillOn]} onPress={() => setForm(form === 'class' ? 'none' : 'class')}>
              <Ionicons name="add-circle-outline" size={16} color={form === 'class' ? colors.accentText : colors.accent} />
              <Text style={[styles.pillText, form === 'class' && styles.pillTextOn]}>Schedule class</Text>
            </Pressable>
            <Pressable style={[styles.pill, form === 'block' && styles.pillOn]} onPress={() => setForm(form === 'block' ? 'none' : 'block')}>
              <Ionicons name="lock-closed-outline" size={16} color={form === 'block' ? colors.accentText : colors.accent} />
              <Text style={[styles.pillText, form === 'block' && styles.pillTextOn]}>Block slot</Text>
            </Pressable>
          </View>

          {form !== 'none' ? (
            <Card>
              <Field label="Title" value={title} onChangeText={setTitle} autoCapitalize="sentences" />
              {courseOptions.length ? (
                <SelectField
                  label="Course *"
                  value={course}
                  placeholder="Select active course"
                  options={courseOptions}
                  onChange={setCourse}
                />
              ) : (
                <Field label="Course *" value={course} onChangeText={setCourse} autoCapitalize="characters" placeholder="e.g. NEET" />
              )}
              <Field label="Batch" value={batch} onChangeText={setBatch} autoCapitalize="words" />
              <Field label="Start (YYYY-MM-DDTHH:MM)" value={startsAt} onChangeText={setStartsAt} placeholder="2026-06-01T18:30" />
              <Field label={form === 'block' ? 'End (YYYY-MM-DDTHH:MM)' : 'End (optional)'} value={endsAt} onChangeText={setEndsAt} placeholder="2026-06-01T19:30" />
              <PrimaryButton label={saving ? 'Saving…' : form === 'class' ? 'Schedule class' : 'Block slot'} onPress={submitForm} disabled={saving} />
            </Card>
          ) : null}

          {loading ? <LoadingBlock /> : null}

          {!loading ? (
            <>
              <Text style={styles.section}>Sessions ({classes.length})</Text>
              {classes.map((c) => {
                const live = c.status === 'live' || c.isActive;
                return (
                  <Card key={c._id}>
                    <View style={styles.row}>
                      <Text style={styles.cTitle}>{c.title}</Text>
                      {live ? <Badge label="LIVE" tone="success" /> : <Badge label="SCHEDULED" tone="warn" />}
                    </View>
                    <Text style={styles.cMeta}>{[c.course, c.batch].filter(Boolean).join(' · ')}</Text>
                    <Text style={styles.cMeta}>{fmt(c.scheduledAt || c.startedAt)}</Text>
                    <View style={styles.btnRow}>
                      {live ? (
                        <>
                          <Pressable style={styles.primarySmall} onPress={() => conduct(c._id)}>
                            <Ionicons name="videocam" size={16} color={colors.accentText} />
                            <Text style={styles.primarySmallText}>Conduct</Text>
                          </Pressable>
                          <Pressable style={styles.dangerSmall} onPress={() => onEnd(c._id)}>
                            <Ionicons name="stop-circle-outline" size={16} color={colors.danger} />
                            <Text style={styles.dangerSmallText}>End</Text>
                          </Pressable>
                        </>
                      ) : (
                        <Pressable style={styles.primarySmall} onPress={() => onStart(c._id)}>
                          <Ionicons name="play" size={16} color={colors.accentText} />
                          <Text style={styles.primarySmallText}>Start & conduct</Text>
                        </Pressable>
                      )}
                    </View>
                  </Card>
                );
              })}
              {!classes.length ? <Text style={styles.empty}>No live classes yet. Schedule one above.</Text> : null}

              {blocks.length ? (
                <>
                  <Text style={styles.section}>Blocked slots</Text>
                  {blocks.map((b) => (
                    <Card key={b.id}>
                      <View style={styles.row}>
                        <Ionicons name="lock-closed" size={16} color={colors.warn} />
                        <Text style={styles.cTitle}>{b.title}</Text>
                      </View>
                      <Text style={styles.cMeta}>{fmt(b.startsAt)} – {fmt(b.endsAt)}</Text>
                      <Text style={styles.cMeta}>{[b.course, b.batch].filter(Boolean).join(' · ')}</Text>
                    </Card>
                  ))}
                </>
              ) : null}
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
    actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.accent, backgroundColor: c.card },
    pillOn: { backgroundColor: c.accent },
    pillText: { color: c.accent, fontWeight: '700', fontSize: 13 },
    pillTextOn: { color: c.accentText },
    section: { color: c.text, fontWeight: '800', fontSize: 16, marginTop: 8, marginBottom: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cTitle: { color: c.text, fontWeight: '700', fontSize: 15, flex: 1 },
    cMeta: { color: c.muted, fontSize: 13, marginTop: 4 },
    btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    primarySmall: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.accent, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
    primarySmallText: { color: c.accentText, fontWeight: '800', fontSize: 13 },
    dangerSmall: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: c.danger, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
    dangerSmallText: { color: c.danger, fontWeight: '800', fontSize: 13 },
    empty: { color: c.muted }
  });
}
