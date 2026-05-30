import { requestJson } from './client';

export type TestSeriesPricing = {
  topicTestPriceInPaise: number;
  topicTestMrpInPaise: number;
  topicTestValidityDays: number;
  fullMockPriceInPaise: number;
  fullMockMrpInPaise: number;
  fullMockValidityDays: number;
  currency: string;
};

export type TestSeriesAccess = {
  hasTopicTest?: boolean;
  hasFullMock?: boolean;
  topicTestExpiresAt?: string | null;
  fullMockExpiresAt?: string | null;
};

export type TestSeriesCourseCatalog = {
  courseName: string;
  thumbnailUrl?: string;
  isEnrolledCourse?: boolean;
  pricing: TestSeriesPricing;
  access: TestSeriesAccess;
};

export function fetchTestSeriesCatalog(token: string) {
  return requestJson<{ courses: TestSeriesCourseCatalog[] }>('/test-series/catalog/student', {
    token
  });
}

export function fetchTestSeriesPricing(token: string, course: string) {
  return requestJson<{
    course: string;
    pricing: TestSeriesPricing;
    access: TestSeriesAccess;
  }>(`/test-series/pricing/student?course=${encodeURIComponent(course)}`, { token });
}

export type SyllabusItem = {
  _id: string;
  title?: string;
  module?: string;
  topic?: string;
  difficulty?: string;
  durationMinutes?: number;
  questionCount?: number;
  description?: string;
};

export function fetchTopicTestsStudent(token: string, course: string) {
  return requestJson<{ tests?: SyllabusItem[] }>(
    `/test-series/topic-tests/student?course=${encodeURIComponent(course)}`,
    { token }
  ).catch(() => ({ tests: [] as SyllabusItem[] }));
}

export function fetchFullMocksStudent(token: string, course: string) {
  return requestJson<{ mocks?: SyllabusItem[] }>(
    `/test-series/full-mocks/student?course=${encodeURIComponent(course)}`,
    { token }
  ).catch(() => ({ mocks: [] as SyllabusItem[] }));
}

export function fetchTopicSyllabus(token: string) {
  return requestJson<{ items: SyllabusItem[]; hasTopicTest: boolean; course: string }>(
    '/test-series/topic-tests/syllabus',
    { token }
  );
}

export function fetchFullMockSyllabus(token: string) {
  return requestJson<{ items: SyllabusItem[]; hasFullMock: boolean; course: string }>(
    '/test-series/full-mocks/syllabus',
    { token }
  );
}

export type ExamQuestion = {
  question: string;
  options: string[];
  imageUrl?: string;
};

export function fetchTopicTest(token: string, testId: string, course: string) {
  return requestJson<{
    _id: string;
    title: string;
    durationMinutes: number;
    questions: ExamQuestion[];
  }>(`/test-series/topic-tests/student/${encodeURIComponent(testId)}?course=${encodeURIComponent(course)}`, {
    token
  });
}

export function submitTopicTest(
  token: string,
  testId: string,
  course: string,
  answers: number[],
  durationSeconds: number
) {
  return requestJson<{
    score: number;
    total: number;
    percentage: number;
    review: Array<{ question: string; isCorrect: boolean; explanation?: string }>;
  }>(`/test-series/topic-tests/student/${encodeURIComponent(testId)}/submit`, {
    method: 'POST',
    token,
    body: JSON.stringify({ course, answers, durationSeconds })
  });
}

export function fetchFullMock(token: string, mockId: string, course: string) {
  return requestJson<{
    _id: string;
    title: string;
    durationMinutes: number;
    questions: ExamQuestion[];
  }>(`/test-series/full-mocks/student/${encodeURIComponent(mockId)}?course=${encodeURIComponent(course)}`, {
    token
  });
}

export function submitFullMock(
  token: string,
  mockId: string,
  course: string,
  answers: number[],
  durationSeconds: number
) {
  return requestJson<{
    score: number;
    total: number;
    percentage: number;
    review: Array<{ question: string; isCorrect: boolean; explanation?: string }>;
  }>(`/test-series/full-mocks/student/${encodeURIComponent(mockId)}/submit`, {
    method: 'POST',
    token,
    body: JSON.stringify({ course, answers, durationSeconds })
  });
}

export type TestSeriesOrderResponse = {
  free?: boolean;
  alreadyOwned?: boolean;
  razorpayOrder?: { id: string; amount: number; currency?: string };
  keyId?: string;
  amountInPaise?: number;
  originalAmountInPaise?: number;
  discountInPaise?: number;
  validityDays?: number;
  currency?: string;
  seriesType?: string;
  course?: string;
};

export function createTestSeriesOrder(
  token: string,
  payload: { course: string; seriesType: 'topic_test' | 'full_mock'; voucherCode?: string }
) {
  return requestJson<TestSeriesOrderResponse>('/test-series/payment/create-order', {
    method: 'POST',
    token,
    body: JSON.stringify(payload)
  });
}

export function verifyTestSeriesPayment(
  token: string,
  payload: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }
) {
  return requestJson<{ ok?: boolean }>('/test-series/payment/verify', {
    method: 'POST',
    token,
    body: JSON.stringify(payload)
  });
}
