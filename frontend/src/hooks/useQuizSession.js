import { useEffect, useRef, useState } from 'react';
import { fetchModuleQuiz, fetchQuizById, submitQuiz } from '../api';

const normalizeModuleName = (v) => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();

const getQuestionCount = (quiz) =>
  Math.max(
    Number(quiz?.questionCount) || 0,
    Array.isArray(quiz?.questions) ? quiz.questions.length : 0
  );

/**
 * Manages the full quiz session lifecycle for a student module:
 * - Loading the quiz list for the selected module
 * - Fetching full questions on quiz selection
 * - Running a countdown timer
 * - Auto-submitting on timeout
 * - Submitting answers and storing results/review
 */
export function useQuizSession({ selectedModule, quizzes, onError, onAttemptsRefresh }) {
  const [moduleQuiz, setModuleQuiz] = useState(null);
  const [moduleQuizList, setModuleQuizList] = useState([]);
  const [quizAnswers, setQuizAnswers] = useState([]);
  const [quizResult, setQuizResult] = useState(null);
  const [quizReview, setQuizReview] = useState([]);
  const [showQuizReview, setShowQuizReview] = useState(false);
  const [quizSecondsLeft, setQuizSecondsLeft] = useState(0);
  const [quizStartedAt, setQuizStartedAt] = useState(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [loadingQuizDetailsId, setLoadingQuizDetailsId] = useState('');
  const [submittingQuiz, setSubmittingQuiz] = useState(false);

  const autoSubmitFiredRef = useRef(false);
  const selectedModuleKey = normalizeModuleName(selectedModule || '');

  const moduleHasQuiz =
    Boolean(selectedModule) &&
    quizzes.some((q) => normalizeModuleName(q.module) === selectedModuleKey);

  // Reset all quiz state when the module changes.
  useEffect(() => {
    setModuleQuiz(null);
    setModuleQuizList([]);
    setQuizAnswers([]);
    setQuizResult(null);
    setQuizReview([]);
    setShowQuizReview(false);
    setQuizSecondsLeft(0);
    setQuizStartedAt(null);
    setLoadingQuizDetailsId('');
    autoSubmitFiredRef.current = false;
  }, [selectedModule]);

  // Build an initial list from the already-cached quizzes array.
  useEffect(() => {
    if (!selectedModule || !moduleHasQuiz) return;
    setModuleQuizList(
      quizzes
        .filter((q) => normalizeModuleName(q.module) === selectedModuleKey)
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    );
  }, [selectedModule, moduleHasQuiz, quizzes, selectedModuleKey]);

  // Hydrate list with full question counts from the API.
  useEffect(() => {
    if (!selectedModule || !moduleHasQuiz) return;
    let cancelled = false;
    setLoadingQuiz(true);

    fetchModuleQuiz(selectedModule)
      .then((data) => {
        if (cancelled) return;
        const fetched = Array.isArray(data?.quizzes) ? data.quizzes : (data?.quiz ? [data.quiz] : []);
        if (!fetched.length) return;

        setModuleQuizList((current) => {
          const merged = current.map((item) => {
            const match =
              fetched.find((c) => String(c?._id || '') === String(item?._id || '')) ||
              fetched.find(
                (c) =>
                  normalizeModuleName(c?.module) === normalizeModuleName(item?.module) &&
                  String(c?.title || '').trim().toLowerCase() === String(item?.title || '').trim().toLowerCase()
              );
            if (!match) return item;
            return { ...item, ...match, questionCount: Math.max(getQuestionCount(item), getQuestionCount(match)) };
          });

          fetched.forEach((candidate) => {
            if (!merged.some((item) => String(item?._id || '') === String(candidate?._id || ''))) {
              merged.push({ ...candidate, questionCount: getQuestionCount(candidate) });
            }
          });
          return merged;
        });
      })
      .catch(() => { /* ignore hydration failures; base list is shown */ })
      .finally(() => { if (!cancelled) setLoadingQuiz(false); });

    return () => { cancelled = true; };
  }, [selectedModule, moduleHasQuiz]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer.
  useEffect(() => {
    if (!moduleQuiz || !quizStartedAt || quizSecondsLeft <= 0 || quizResult) return;
    const id = setInterval(() => setQuizSecondsLeft((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [moduleQuiz, quizStartedAt, quizSecondsLeft, quizResult]);

  // Auto-submit when timer hits zero.
  useEffect(() => {
    if (!moduleQuiz || quizResult || submittingQuiz || quizSecondsLeft !== 0 || !quizStartedAt) return;
    if (autoSubmitFiredRef.current) return;
    autoSubmitFiredRef.current = true;
    _submitQuiz({ requireAllAnswered: false }); // eslint-disable-line no-use-before-define
  }, [moduleQuiz, quizSecondsLeft, quizResult, submittingQuiz, quizStartedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  function _startQuizSession(quiz) {
    setModuleQuiz(quiz);
    setQuizAnswers(Array(quiz.questions.length).fill(-1));
    setQuizResult(null);
    setQuizReview([]);
    setShowQuizReview(false);
    setQuizSecondsLeft((quiz.timeLimitMinutes || 15) * 60);
    setQuizStartedAt(Date.now());
    autoSubmitFiredRef.current = false;
  }

  async function _submitQuiz({ requireAllAnswered }) {
    if (!moduleQuiz) return;
    if (requireAllAnswered && quizAnswers.some((a) => a < 0)) {
      onError?.('Please answer all questions before submitting.');
      return;
    }
    setSubmittingQuiz(true);
    try {
      const duration = quizStartedAt
        ? Math.max(0, Math.round((Date.now() - quizStartedAt) / 1000))
        : undefined;
      const data = await submitQuiz(moduleQuiz._id, quizAnswers, duration);
      setQuizResult(data.result);
      const review = Array.isArray(data.result?.review) ? data.result.review : [];
      setQuizReview(review);
      setShowQuizReview(review.length > 0);
      setQuizSecondsLeft(0);
      onAttemptsRefresh?.();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSubmittingQuiz(false);
    }
  }

  return {
    // ── State (read) ──────────────────────────────────────────────────────────
    moduleQuiz,
    moduleQuizList,
    quizAnswers,
    quizResult,
    quizReview,
    showQuizReview,
    quizSecondsLeft,
    loadingQuiz,
    loadingQuizDetailsId,
    submittingQuiz,
    moduleHasQuiz,

    // ── Setters (expose raw setState so JSX can do `setShowQuizReview(c => !c)`)
    setQuizAnswers,
    setShowQuizReview,

    // ── Actions ───────────────────────────────────────────────────────────────
    async handleSelectQuizFromList(quiz) {
      if (!quiz?._id) {
        console.warn('[Quiz] No quiz ID provided');
        return;
      }
      setLoadingQuizDetailsId(String(quiz._id));
      console.log('[Quiz] Starting to load quiz:', quiz._id, quiz.title);
      try {
        if (Array.isArray(quiz.questions) && quiz.questions.length > 0) {
          console.log('[Quiz] Quiz already has questions cached, starting session');
          _startQuizSession(quiz);
          return;
        }
        
        let fullQuiz = null;
        console.log('[Quiz] Quiz questions not cached, fetching from backend');
        
        try {
          console.log('[Quiz] Attempting to fetch quiz by ID:', quiz._id);
          const d = await fetchQuizById(quiz._id);
          fullQuiz = d?.quiz || null;
          console.log('[Quiz] Fetch by ID result:', fullQuiz ? 'Success' : 'No quiz data');
        } catch (fetchErr) {
          console.warn('[Quiz] Fetch by ID failed, trying module endpoint:', fetchErr.message);
        }

        if (!fullQuiz?.questions?.length) {
          const module = selectedModule || quiz.module || '';
          console.log('[Quiz] Full quiz not found, fetching module quizzes for module:', module);
          
          if (!module) {
            throw new Error('Module name is required to fetch quiz details.');
          }
          
          const md = await fetchModuleQuiz(module);
          const list = Array.isArray(md?.quizzes) ? md.quizzes : (md?.quiz ? [md.quiz] : []);
          console.log('[Quiz] Module fetch returned', list.length, 'quizzes');
          
          fullQuiz = list.find((item) => String(item._id) === String(quiz._id)) || null;
          console.log('[Quiz] Found quiz in module list:', fullQuiz ? 'Yes' : 'No');
        }

        if (!fullQuiz?.questions?.length) {
          console.error('[Quiz] Quiz has no questions:', fullQuiz);
          throw new Error('This quiz has no questions available. Please contact your instructor.');
        }
        
        console.log('[Quiz] Starting quiz session with', fullQuiz.questions.length, 'questions');
        _startQuizSession(fullQuiz);
      } catch (err) {
        console.error('[Quiz] Error loading quiz:', err);
        onError?.(String(err?.message || 'Failed to load quiz'));
      } finally {
        setLoadingQuizDetailsId('');
      }
    },

    handleBackToQuizList() {
      setModuleQuiz(null);
      setQuizAnswers([]);
      setQuizResult(null);
      setQuizReview([]);
      setShowQuizReview(false);
      setQuizSecondsLeft(0);
      setQuizStartedAt(null);
    },

    handleRetakeQuiz() {
      if (!moduleQuiz) return;
      setQuizAnswers(Array(moduleQuiz.questions.length).fill(-1));
      setQuizResult(null);
      setQuizReview([]);
      setShowQuizReview(false);
      setQuizSecondsLeft((moduleQuiz.timeLimitMinutes || 15) * 60);
      setQuizStartedAt(Date.now());
      autoSubmitFiredRef.current = false;
    },

    async handleSubmitQuiz(event, options = {}) {
      if (event?.preventDefault) event.preventDefault();
      const requireAllAnswered = options.requireAllAnswered ?? true;
      await _submitQuiz({ requireAllAnswered });
    },

    async handleLoadQuizForModule() {
      if (!selectedModule) return;
      setLoadingQuiz(true);
      setQuizResult(null);
      try {
        const data = await fetchModuleQuiz(selectedModule);
        const list = Array.isArray(data.quizzes) ? data.quizzes : (data.quiz ? [data.quiz] : []);
        if (!list.length) { onError?.('No quizzes found for this module.'); return; }
        setModuleQuizList(list);
      } catch (err) {
        onError?.(err.message);
      } finally {
        setLoadingQuiz(false);
      }
    }
  };
}
