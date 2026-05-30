import { requestJson } from './client';

export type VideoMaterial = {
  name: string;
  filename: string;
};

export type VideoItem = {
  _id: string;
  title: string;
  description?: string;
  url: string;
  category?: string;
  batch?: string;
  module?: string;
  topic?: string;
  materials?: VideoMaterial[];
  uploadedAt?: string;
};

export type ModuleAccessEntry = {
  unlocked?: boolean;
  purchaseRequired?: boolean;
};

export type CourseAccess = {
  course?: string;
  unlocked?: boolean;
  purchaseRequired?: boolean;
  allModulesUnlocked?: boolean;
  moduleAccess?: Record<string, ModuleAccessEntry>;
};

export type QuizItem = {
  _id: string;
  title?: string;
  module?: string;
  category?: string;
  topic?: string;
};

export function fetchMyCourseContent(token: string, course?: string) {
  const qs = course ? `?course=${encodeURIComponent(course)}` : '';
  return requestJson<{
    course: string;
    videos: VideoItem[];
    access: CourseAccess;
    favorites?: string[];
    completedVideos?: string[];
  }>(`/videos/my-course${qs}`, { token });
}

export function fetchModuleCatalog(token: string) {
  return requestJson<{ modules: { name: string; category: string }[] }>('/modules/catalog', { token });
}

export function fetchCourseQuizzes(token: string, course?: string) {
  const qs = course ? `?course=${encodeURIComponent(course)}` : '';
  return requestJson<{ quizzes: QuizItem[] }>(`/quizzes/my-course${qs}`, { token });
}

export function toggleVideoFavorite(token: string, videoId: string) {
  return requestJson<{ favorites: string[] }>(`/videos/${encodeURIComponent(videoId)}/favorite`, {
    method: 'POST',
    token
  });
}

export function updateVideoProgress(token: string, videoId: string, completed: boolean) {
  return requestJson<{ completedVideos: string[] }>(`/videos/${encodeURIComponent(videoId)}/progress`, {
    method: 'POST',
    token,
    body: JSON.stringify({ completed })
  });
}

export function materialDownloadUrl(videoId: string, filename: string) {
  return `/videos/${encodeURIComponent(videoId)}/materials/${encodeURIComponent(filename)}/download`;
}
