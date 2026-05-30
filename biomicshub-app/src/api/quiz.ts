import { requestJson } from './client';
import { ExamQuestion } from './testSeries';

export type Quiz = {
  _id: string;
  title?: string;
  category?: string;
  course?: string;
  batch?: string;
  module?: string;
  topic?: string;
  difficulty?: string;
  timeLimitMinutes?: number;
  questionCount?: number;
};

export type QuizAttempt = {
  _id: string;
  quizId?: string;
  course?: string;
  category?: string;
  module?: string;
  score: number;
  total: number;
  submittedAt?: string;
};

export function fetchMyQuizzes(token: string, course?: string) {
  const qs = course ? `?course=${encodeURIComponent(course)}` : '';
  return requestJson<{ course: string; quizzes: Quiz[] }>(`/quizzes/my-course${qs}`, { token });
}

export function fetchQuiz(token: string, quizId: string, course?: string) {
  const qs = course ? `?course=${encodeURIComponent(course)}` : '';
  return requestJson<{
    quiz: { _id: string; title?: string; timeLimitMinutes?: number; questions: ExamQuestion[] };
  }>(`/quizzes/my-course/quiz/${encodeURIComponent(quizId)}${qs}`, { token });
}

export function submitQuiz(token: string, quizId: string, answers: number[], durationSeconds: number) {
  return requestJson<{
    result: {
      score: number;
      total: number;
      percentage: number;
      review: Array<{ question: string; isCorrect: boolean; explanation?: string }>;
    };
  }>(`/quizzes/${encodeURIComponent(quizId)}/submit`, {
    method: 'POST',
    token,
    body: JSON.stringify({ answers, durationSeconds })
  });
}

export function fetchRecentQuizAttempts(token: string) {
  return requestJson<{ attempts: QuizAttempt[] }>('/quizzes/my-attempts/recent', { token });
}
