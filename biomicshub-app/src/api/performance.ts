import { requestJson } from './client';

export type PerfSummaryBlock = {
  attempts: number;
  averageScore: number;
  bestScore: number;
  lastAttemptAt?: string | null;
  modulesCovered?: number;
  topicsCovered?: number;
};

export type TopicPerformance = {
  topic: string;
  attempts: number;
  averageScore: number;
  bestScore: number;
  lastAttemptAt?: string | null;
};

export type ModulePerformance = {
  module: string;
  attempts: number;
  averageScore: number;
  bestScore: number;
  lastAttemptAt?: string | null;
  topics?: TopicPerformance[];
};

export type FullMockPerformance = {
  title: string;
  attempts: number;
  averageScore: number;
  bestScore: number;
  lastAttemptAt?: string | null;
};

export type TestSeriesPerformance = {
  course: string;
  selectedCourse?: string;
  availableCourses?: string[];
  access?: { hasTopicTest?: boolean; hasFullMock?: boolean };
  summary: {
    topicTests: PerfSummaryBlock;
    fullMocks: PerfSummaryBlock;
    dailyAttemptStreak?: number;
  };
  modulePerformance: ModulePerformance[];
  fullMockPerformance: FullMockPerformance[];
  recentTopicAttempts: Array<{
    _id: string;
    title?: string;
    module?: string;
    topic?: string;
    course?: string;
    category?: string;
    batch?: string;
    score: number;
    total: number;
    percentage: number;
    submittedAt?: string;
  }>;
  recentFullMockAttempts: Array<{
    _id: string;
    title?: string;
    course?: string;
    category?: string;
    batch?: string;
    score: number;
    total: number;
    percentage: number;
    submittedAt?: string;
  }>;
};

export function fetchTestSeriesPerformance(token: string, course?: string) {
  const qs = course ? `?course=${encodeURIComponent(course)}` : '';
  return requestJson<TestSeriesPerformance>(`/test-series/performance/student${qs}`, { token });
}
