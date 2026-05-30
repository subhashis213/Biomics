import { requestJson } from './client';
import { ExamQuestion } from './testSeries';

export type MockExamListItem = {
  _id: string;
  category: string;
  title: string;
  description?: string;
  examDate?: string;
  examWindowEndAt?: string | null;
  durationMinutes?: number;
  questionCount?: number;
  attempted?: boolean;
  windowClosed?: boolean;
  resultReleased?: boolean;
  attemptSummary?: { score: number; total: number; percentage: number; submittedAt?: string } | null;
};

export type ExamNotice = {
  type: string;
  examId: string;
  title: string;
  examDate?: string;
  course?: string;
};

export function fetchMyMockExams(token: string) {
  return requestJson<{ exams: MockExamListItem[]; notices: ExamNotice[] }>('/mock-exams/my-course', {
    token
  });
}

export function fetchMockExam(token: string, examId: string) {
  return requestJson<{
    exam: {
      _id: string;
      title: string;
      description?: string;
      durationMinutes?: number;
      questions: ExamQuestion[];
    };
  }>(`/mock-exams/my-course/${encodeURIComponent(examId)}`, { token });
}

export function submitMockExam(token: string, examId: string, answers: number[], durationSeconds: number) {
  return requestJson<{
    message: string;
    result: { score: number; total: number; percentage: number; released: boolean };
  }>(`/mock-exams/${encodeURIComponent(examId)}/submit`, {
    method: 'POST',
    token,
    body: JSON.stringify({ answers, durationSeconds })
  });
}
