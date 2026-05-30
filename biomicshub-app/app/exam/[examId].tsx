import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { fetchMockExam, submitMockExam } from '@/src/api/exams';
import TestExamRunner from '@/src/components/TestExamRunner';
import { ErrorBanner, LoadingBlock, Screen } from '@/src/components/ui';
import { decodeRouteParam } from '@/src/utils/format';

export default function ExamScreen() {
  const { examId: eid } = useLocalSearchParams<{ examId: string }>();
  const examId = decodeRouteParam(eid);
  const { token } = useAuth();
  const [exam, setExam] = useState<Awaited<ReturnType<typeof fetchMockExam>>['exam'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      try {
        const data = await fetchMockExam(token, examId);
        if (!cancelled) setExam(data.exam);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to open exam.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, examId]);

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Exam' }} />
        <LoadingBlock />
      </Screen>
    );
  }

  if (!exam) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Exam' }} />
        <ErrorBanner message={error || 'Exam unavailable.'} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: exam.title || 'Exam' }} />
      <TestExamRunner
        title={exam.title}
        questions={exam.questions}
        durationMinutes={exam.durationMinutes}
        proctored
        mode="Monthly exam"
        onSubmit={async (answers, durationSeconds) => {
          const res = await submitMockExam(token!, examId, answers, durationSeconds);
          return {
            score: res.result.score,
            total: res.result.total,
            percentage: res.result.percentage,
            note: res.result.released
              ? 'Result released.'
              : 'Submitted. Your detailed result will be visible after the admin releases it.'
          };
        }}
      />
    </Screen>
  );
}
