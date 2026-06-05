import { MockExamListItem } from '@/src/api/exams';
import { QuizAttempt } from '@/src/api/quiz';
import { TestSeriesPerformance } from '@/src/api/performance';

export type PerformanceKind = 'topic' | 'full_mock' | 'monthly_exam' | 'quiz';

export type PerformanceRecord = {
  id: string;
  kind: PerformanceKind;
  title: string;
  module?: string;
  topic?: string;
  course?: string;
  score: number;
  total: number;
  percentage: number;
  submittedAt?: string;
};

export type PerformanceSort = 'recent' | 'score_desc' | 'score_asc';

function pct(score: number, total: number) {
  if (!total) return 0;
  return Math.round((score / total) * 100);
}

export function buildPerformanceRecords(
  perf: TestSeriesPerformance | null,
  exams: MockExamListItem[],
  quizzes: QuizAttempt[]
): PerformanceRecord[] {
  const rows: PerformanceRecord[] = [];

  (perf?.recentTopicAttempts || []).forEach((item) => {
    rows.push({
      id: `topic-${item._id}`,
      kind: 'topic',
      title: item.title || item.topic || 'Topic test',
      module: item.module,
      topic: item.topic,
      course: item.course || item.category,
      score: item.score,
      total: item.total,
      percentage: item.percentage ?? pct(item.score, item.total),
      submittedAt: item.submittedAt
    });
  });

  (perf?.recentFullMockAttempts || []).forEach((item) => {
    rows.push({
      id: `mock-${item._id}`,
      kind: 'full_mock',
      title: item.title || 'Full mock test',
      course: item.course,
      score: item.score,
      total: item.total,
      percentage: item.percentage ?? pct(item.score, item.total),
      submittedAt: item.submittedAt
    });
  });

  exams
    .filter((exam) => exam.attempted && exam.attemptSummary)
    .forEach((exam) => {
      rows.push({
        id: `exam-${exam._id}`,
        kind: 'monthly_exam',
        title: exam.title || 'Monthly exam',
        course: exam.category,
        score: exam.attemptSummary!.score,
        total: exam.attemptSummary!.total,
        percentage: exam.attemptSummary!.percentage,
        submittedAt: exam.attemptSummary!.submittedAt
      });
    });

  quizzes.forEach((quiz) => {
    rows.push({
      id: `quiz-${quiz._id}`,
      kind: 'quiz',
      title: quiz.module || 'Quiz',
      module: quiz.module,
      course: quiz.category || quiz.course,
      score: quiz.score,
      total: quiz.total,
      percentage: pct(quiz.score, quiz.total),
      submittedAt: quiz.submittedAt
    });
  });

  return rows;
}

export function filterPerformanceRecords(
  rows: PerformanceRecord[],
  opts: { kind?: PerformanceKind | 'all'; module?: string; topic?: string; course?: string }
) {
  return rows.filter((row) => {
    if (opts.kind && opts.kind !== 'all' && row.kind !== opts.kind) return false;
    if (opts.course && opts.course !== 'all' && row.course !== opts.course) return false;
    if (opts.module && opts.module !== 'all' && (row.module || 'General') !== opts.module) return false;
    if (opts.topic && opts.topic !== 'all' && (row.topic || 'General') !== opts.topic) return false;
    return true;
  });
}

export function sortPerformanceRecords(rows: PerformanceRecord[], sort: PerformanceSort) {
  const list = [...rows];
  if (sort === 'score_desc') {
    return list.sort((a, b) => b.percentage - a.percentage || String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
  }
  if (sort === 'score_asc') {
    return list.sort((a, b) => a.percentage - b.percentage || String(a.submittedAt || '').localeCompare(String(b.submittedAt || '')));
  }
  return list.sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
}

export function uniqueModules(rows: PerformanceRecord[]) {
  return Array.from(new Set(rows.map((r) => r.module).filter(Boolean) as string[])).sort();
}

export function uniqueTopics(rows: PerformanceRecord[], module?: string) {
  return Array.from(
    new Set(
      rows
        .filter((r) => !module || module === 'all' || r.module === module)
        .map((r) => r.topic)
        .filter(Boolean) as string[]
    )
  ).sort();
}

export function uniqueCourses(rows: PerformanceRecord[], fallback?: string) {
  const set = new Set(rows.map((r) => r.course).filter(Boolean) as string[]);
  if (fallback) set.add(fallback);
  return Array.from(set).sort();
}

export function kindLabel(kind: PerformanceKind) {
  if (kind === 'topic') return 'Topic test';
  if (kind === 'full_mock') return 'Full mock';
  if (kind === 'monthly_exam') return 'Monthly exam';
  return 'Quiz';
}

export function kindColor(kind: PerformanceKind, colors: { accent: string; success: string; warn: string; danger: string }) {
  if (kind === 'topic') return colors.accent;
  if (kind === 'full_mock') return colors.success;
  if (kind === 'monthly_exam') return colors.warn;
  return colors.danger;
}
