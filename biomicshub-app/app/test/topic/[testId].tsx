import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { fetchTopicTest, submitTopicTest } from '@/src/api/testSeries';
import TestExamRunner from '@/src/components/TestExamRunner';
import { LoadingBlock, Screen } from '@/src/components/ui';
import { decodeRouteParam } from '@/src/utils/format';

export default function TopicTestScreen() {
  const { testId: tid, course: courseParam } = useLocalSearchParams<{ testId: string; course?: string }>();
  const testId = decodeRouteParam(tid);
  const course = decodeRouteParam(courseParam || '');
  const { token, student } = useAuth();
  const [test, setTest] = useState<Awaited<ReturnType<typeof fetchTopicTest>> | null>(null);
  const [loading, setLoading] = useState(true);

  const resolvedCourse = course || student?.class || '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || !resolvedCourse) return;
      try {
        const data = await fetchTopicTest(token, testId, resolvedCourse);
        if (!cancelled) setTest(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, testId, resolvedCourse]);

  if (loading || !test) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Topic test' }} />
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: test.title || 'Topic test' }} />
      <TestExamRunner
        title={test.title}
        questions={test.questions}
        durationMinutes={test.durationMinutes}
        proctored
        mode="Topic test"
        onSubmit={(answers, durationSeconds) =>
          submitTopicTest(token!, testId, resolvedCourse, answers, durationSeconds)
        }
      />
    </Screen>
  );
}
