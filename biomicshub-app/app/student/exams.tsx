import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { fetchMyMockExams, MockExamListItem, ExamNotice } from '@/src/api/exams';
import { Badge, Card, ErrorBanner, Eyebrow, LoadingBlock, Screen, Subtitle, Title } from '@/src/components/ui';

function formatDate(value?: string) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

export default function ExamsTab() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [exams, setExams] = useState<MockExamListItem[]>([]);
  const [notices, setNotices] = useState<ExamNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetchMyMockExams(token);
      setExams(res.exams || []);
      setNotices(res.notices || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exams.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openExam(exam: MockExamListItem) {
    const now = Date.now();
    const startsAt = exam.examDate ? new Date(exam.examDate).getTime() : 0;
    if (startsAt && now < startsAt) {
      setError(`This exam starts on ${formatDate(exam.examDate)} (IST).`);
      return;
    }
    if (exam.attempted) {
      setError('You have already attempted this exam.');
      return;
    }
    if (exam.windowClosed) {
      setError('The exam window is over.');
      return;
    }
    router.push({ pathname: '/exam/[examId]', params: { examId: exam._id } });
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
      >
        <Eyebrow>Mock & monthly exams</Eyebrow>
        <Title>Exams</Title>
        <Subtitle>Scheduled mock & monthly exams for your course. Results release after admin review.</Subtitle>
        <View style={{ height: 12 }} />
        <ErrorBanner message={error} />

        {notices.length ? (
          <Card>
            <Eyebrow>Notices</Eyebrow>
            {notices.map((n, i) => (
              <View key={`${n.examId}-${i}`} style={styles.noticeRow}>
                <Ionicons
                  name={n.type === 'upcoming' ? 'calendar-outline' : n.type === 'resultReleased' ? 'checkmark-circle-outline' : 'pin-outline'}
                  size={16}
                  color={colors.accent}
                />
                <Text style={styles.notice}>
                  {n.title} {n.examDate ? `· ${formatDate(n.examDate)}` : ''}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {loading ? <LoadingBlock /> : null}

        {!loading && exams.map((exam) => (
          <Pressable key={exam._id} onPress={() => openExam(exam)}>
            <Card>
              <View style={styles.row}>
                <Text style={styles.title}>{exam.title}</Text>
                {exam.attempted ? <Badge label="ATTEMPTED" tone="success" /> : exam.windowClosed ? <Badge label="CLOSED" /> : <Badge label="OPEN" tone="warn" />}
              </View>
              <Text style={styles.meta}>{exam.category} · {exam.questionCount || 0} Q · {exam.durationMinutes || 0} min</Text>
              {exam.examDate ? <Text style={styles.meta}>Starts: {formatDate(exam.examDate)}</Text> : null}
              {exam.attemptSummary && exam.resultReleased ? (
                <Text style={styles.result}>
                  Score: {exam.attemptSummary.score}/{exam.attemptSummary.total} ({exam.attemptSummary.percentage}%)
                </Text>
              ) : exam.attempted ? (
                <Text style={styles.meta}>Result will show after admin releases it.</Text>
              ) : null}
            </Card>
          </Pressable>
        ))}
        {!loading && !exams.length ? <Text style={styles.empty}>No exams scheduled for your course.</Text> : null}
      </ScrollView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 32 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    title: { color: c.text, fontWeight: '700', fontSize: 16, flex: 1 },
    meta: { color: c.muted, fontSize: 13, marginTop: 4 },
    result: { color: c.accent, fontWeight: '700', marginTop: 6 },
    noticeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    notice: { color: c.text, fontSize: 13, flex: 1 },
    empty: { color: c.muted }
  });
}
