import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { fetchFullMock, submitFullMock } from '@/src/api/testSeries';
import TestExamRunner from '@/src/components/TestExamRunner';
import { LoadingBlock, Screen } from '@/src/components/ui';
import { decodeRouteParam } from '@/src/utils/format';

export default function FullMockScreen() {
  const { mockId: mid, course: courseParam } = useLocalSearchParams<{ mockId: string; course?: string }>();
  const mockId = decodeRouteParam(mid);
  const course = decodeRouteParam(courseParam || '');
  const { token, student } = useAuth();
  const [mock, setMock] = useState<Awaited<ReturnType<typeof fetchFullMock>> | null>(null);
  const [loading, setLoading] = useState(true);

  const resolvedCourse = course || student?.class || '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || !resolvedCourse) return;
      try {
        const data = await fetchFullMock(token, mockId, resolvedCourse);
        if (!cancelled) setMock(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, mockId, resolvedCourse]);

  if (loading || !mock) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Full mock' }} />
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: mock.title || 'Full mock' }} />
      <TestExamRunner
        title={mock.title}
        questions={mock.questions}
        durationMinutes={mock.durationMinutes}
        proctored
        mode="Full mock"
        onSubmit={(answers, durationSeconds) =>
          submitFullMock(token!, mockId, resolvedCourse, answers, durationSeconds)
        }
      />
    </Screen>
  );
}
