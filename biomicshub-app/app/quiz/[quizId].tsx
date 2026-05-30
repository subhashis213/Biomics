import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { fetchQuiz, submitQuiz } from '@/src/api/quiz';
import TestExamRunner from '@/src/components/TestExamRunner';
import { ErrorBanner, LoadingBlock, Screen } from '@/src/components/ui';
import { decodeRouteParam } from '@/src/utils/format';

export default function QuizScreen() {
  const params = useLocalSearchParams<{ quizId: string; course?: string }>();
  const quizId = decodeRouteParam(params.quizId);
  const course = decodeRouteParam(params.course);
  const { token } = useAuth();
  const [quiz, setQuiz] = useState<Awaited<ReturnType<typeof fetchQuiz>>['quiz'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      try {
        const data = await fetchQuiz(token, quizId, course || undefined);
        if (!cancelled) setQuiz(data.quiz);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to open quiz.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, quizId, course]);

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Quiz' }} />
        <LoadingBlock />
      </Screen>
    );
  }

  if (!quiz) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Quiz' }} />
        <ErrorBanner message={error || 'Quiz unavailable.'} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: quiz.title || 'Quiz' }} />
      <TestExamRunner
        title={quiz.title || 'Quiz'}
        questions={quiz.questions}
        durationMinutes={quiz.timeLimitMinutes}
        onSubmit={async (answers, durationSeconds) => {
          const res = await submitQuiz(token!, quizId, answers, durationSeconds);
          return {
            score: res.result.score,
            total: res.result.total,
            percentage: res.result.percentage,
            review: res.result.review
          };
        }}
      />
    </Screen>
  );
}
