import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchCourseQuizzes,
  fetchRecentQuizAttempts,
  requestJson,
  toggleFavorite as apiFavorite,
  updateVideoProgress as apiProgress
} from '../api';

const normalizeId = (v) => String(v || '');

/**
 * Fetches and caches all course data for the student:
 * videos, quizzes, quiz attempts, favorites, completedVideos.
 *
 * Provides optimistic mutations for toggling favorites and completion.
 * Uses React Query so data is cached, deduplicated and auto-stale.
 */
export function useCourseData() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['courseData'],
    queryFn: async () => {
      const [allVideos, profileData, quizData, attemptData, moduleCatalogData] = await Promise.all([
        requestJson('/videos'),
        requestJson('/videos/my-course'),
        fetchCourseQuizzes(),
        fetchRecentQuizAttempts(),
        requestJson('/modules/catalog')
      ]);
      return { allVideos, profileData, quizData, attemptData, moduleCatalogData };
    },
    staleTime: 2 * 60 * 1000,
    retry: (failureCount, err) => {
      if (/authentication|unauthorized/i.test(err?.message || '')) return false;
      return failureCount < 1;
    }
  });

  const favMutation = useMutation({
    mutationFn: apiFavorite,
    onSuccess: (result) => {
      queryClient.setQueryData(['courseData'], (old) =>
        old ? { ...old, profileData: { ...old.profileData, favorites: result.favorites || [] } } : old
      );
    }
  });

  const progressMutation = useMutation({
    mutationFn: ({ videoId, completed }) => apiProgress(videoId, completed),
    onSuccess: (result) => {
      queryClient.setQueryData(['courseData'], (old) =>
        old ? { ...old, profileData: { ...old.profileData, completedVideos: result.completedVideos || [] } } : old
      );
    }
  });

  /** Re-fetches quiz attempts (called after a quiz submission). */
  async function refreshAttempts() {
    try {
      const attemptData = await fetchRecentQuizAttempts();
      queryClient.setQueryData(['courseData'], (old) =>
        old ? { ...old, attemptData } : old
      );
    } catch {
      // Best-effort; ignore failures.
    }
  }

  const rawFavorites = data?.profileData?.favorites || [];
  const rawCompleted = data?.profileData?.completedVideos || [];

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const favoriteIds = useMemo(() => new Set(rawFavorites.map(normalizeId)), [rawFavorites]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const completedIds = useMemo(() => new Set(rawCompleted.map(normalizeId)), [rawCompleted]);

  return {
    videos: data?.allVideos || [],
    course: data?.profileData?.course || '',
    access: data?.profileData?.access || {
      unlocked: true,
      purchaseRequired: false,
      allModulesUnlocked: true,
      unlockedModules: [],
      bundlePricing: { currency: 'INR', plans: [] },
      moduleAccess: {},
      activeMembership: null
    },
    favoriteIds,
    completedIds,
    quizzes: data?.quizData?.quizzes || [],
    quizAttempts: data?.attemptData?.attempts || [],
    moduleCatalog: data?.moduleCatalogData?.modules || [],
    isLoading,
    loadError: error,
    toggleFavorite: (videoId) => favMutation.mutate(videoId),
    toggleCompleted: (videoId, completed) => progressMutation.mutate({ videoId, completed }),
    favMutError: favMutation.error,
    progressMutError: progressMutation.error,
    refreshAttempts
  };
}
