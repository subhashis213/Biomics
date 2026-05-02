import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchModuleQuiz, fetchModuleTopics } from '../api';
import { useCourseData } from '../hooks/useCourseData';

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value || '');
  } catch {
    return String(value || '');
  }
}

function formatPriceInPaise(amountInPaise, currency = 'INR') {
  const amount = Number(amountInPaise || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(amount / 100);
}

export default function StudentModuleDetailsPage() {
  const navigate = useNavigate();
  const { courseName, moduleName } = useParams();

  const decodedCourseName = normalizeText(safeDecode(courseName) || 'General');
  const decodedModuleName = normalizeText(safeDecode(moduleName) || 'General');

  const {
    videos,
    quizzes,
    quizAttempts,
    favoriteIds,
    completedIds,
    access,
    course,
    isLoading,
    loadError
  } = useCourseData(decodedCourseName);

  const scopeCourseLabel = normalizeText(course || decodedCourseName);

  const [catalogTopics, setCatalogTopics] = useState([]);
  const [topicsLoadedFromCatalog, setTopicsLoadedFromCatalog] = useState(false);
  /** Full module quiz list from GET /quizzes/my-course/:module (matches lectures; avoids per-quiz batch stripping). */
  const [moduleHubQuizzes, setModuleHubQuizzes] = useState([]);

  const moduleAccessMap = access?.moduleAccess || {};

  const moduleAccess = useMemo(() => {
    if (moduleAccessMap[decodedModuleName]) return moduleAccessMap[decodedModuleName];
    const normalizedTarget = normalizeText(decodedModuleName).toLowerCase();
    const matchedKey = Object.keys(moduleAccessMap).find(
      (key) => normalizeText(key).toLowerCase() === normalizedTarget
    );
    return matchedKey ? moduleAccessMap[matchedKey] : null;
  }, [moduleAccessMap, decodedModuleName]);

  const moduleLocked = Boolean(moduleAccess?.purchaseRequired && !moduleAccess?.unlocked);

  const courseKey = scopeCourseLabel.toLowerCase();
  const moduleKey = decodedModuleName.toLowerCase();

  useEffect(() => {
    let cancelled = false;
    setCatalogTopics([]);
    setTopicsLoadedFromCatalog(false);

    fetchModuleTopics(scopeCourseLabel, decodedModuleName)
      .then((data) => {
        if (cancelled) return;
        const topics = Array.isArray(data?.topics)
          ? data.topics.map((entry) => normalizeText(entry?.name || '')).filter(Boolean)
          : [];
        setCatalogTopics(topics);
        setTopicsLoadedFromCatalog(true);
      })
      .catch(() => {
        if (!cancelled) setTopicsLoadedFromCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scopeCourseLabel, decodedModuleName]);

  useEffect(() => {
    if (moduleLocked || !scopeCourseLabel || !decodedModuleName) {
      setModuleHubQuizzes([]);
      return;
    }
    let cancelled = false;
    fetchModuleQuiz(decodedModuleName, scopeCourseLabel)
      .then((data) => {
        if (cancelled) return;
        setModuleHubQuizzes(Array.isArray(data?.quizzes) ? data.quizzes : []);
      })
      .catch(() => {
        if (!cancelled) setModuleHubQuizzes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [moduleLocked, scopeCourseLabel, decodedModuleName]);

  const moduleVideos = useMemo(() => {
    return videos.filter((video) => {
      const sameCourse = normalizeText(video?.category || '').toLowerCase() === courseKey;
      const sameModule = normalizeText(video?.module || 'General').toLowerCase() === moduleKey;
      return sameCourse && sameModule;
    });
  }, [videos, courseKey, moduleKey]);

  const moduleQuizzes = useMemo(() => {
    return quizzes.filter((quiz) => {
      const sameCourse = normalizeText(quiz?.category || scopeCourseLabel).toLowerCase() === courseKey;
      const sameModule = normalizeText(quiz?.module || 'General').toLowerCase() === moduleKey;
      return sameCourse && sameModule;
    });
  }, [quizzes, scopeCourseLabel, courseKey, moduleKey]);

  const moduleAttempts = useMemo(() => {
    return quizAttempts
      .filter((attempt) => {
        const sameCourse = normalizeText(attempt?.category || scopeCourseLabel).toLowerCase() === courseKey;
        const sameModule = normalizeText(attempt?.module || 'General').toLowerCase() === moduleKey;
        return sameCourse && sameModule;
      })
      .sort((a, b) => new Date(b?.submittedAt || 0).getTime() - new Date(a?.submittedAt || 0).getTime());
  }, [quizAttempts, scopeCourseLabel, courseKey, moduleKey]);

  const completedCount = moduleVideos.filter((video) => completedIds.has(String(video?._id || ''))).length;
  const savedCount = moduleVideos.filter((video) => favoriteIds.has(String(video?._id || ''))).length;
  const progressPercent = moduleVideos.length
    ? Math.round((completedCount / moduleVideos.length) * 100)
    : 0;

  const latestAttempt = moduleAttempts[0] || null;

  const quizzesForMetrics = useMemo(
    () => (moduleHubQuizzes.length ? moduleHubQuizzes : moduleQuizzes),
    [moduleHubQuizzes, moduleQuizzes]
  );

  const topicCount = useMemo(() => {
    if (topicsLoadedFromCatalog) {
      return Array.from(new Set(catalogTopics.map((topic) => normalizeText(topic)).filter(Boolean))).length;
    }
    return new Set(
      [
        ...moduleVideos.map((video) => normalizeText(video?.topic || 'General')),
        ...quizzesForMetrics.map((quiz) => normalizeText(quiz?.topic || 'General'))
      ].filter(Boolean)
    ).size;
  }, [moduleVideos, quizzesForMetrics, catalogTopics, topicsLoadedFromCatalog]);

  function handleBack() {
    navigate(`/student/course/${encodeURIComponent(scopeCourseLabel)}/modules`);
  }

  const primaryPlan = Array.isArray(moduleAccess?.pricing?.plans)
    ? moduleAccess.pricing.plans.find((plan) => plan.type === 'pro')
    : null;

  const elitePlan = Array.isArray(moduleAccess?.pricing?.plans)
    ? moduleAccess.pricing.plans.find((plan) => plan.type === 'elite')
    : null;

  return (
    <main className="lecture-page module-detail-page lecture-enter">
      <header className="lecture-page-hero module-detail-hero lecture-enter-stage-1">
        <div className="lecture-page-hero-left">
          <p className="eyebrow">Module Details</p>
          <h1>{decodedModuleName}</h1>
          <p className="lecture-page-subtitle">{scopeCourseLabel} • Complete learning snapshot</p>
        </div>
        <div className="lecture-page-hero-actions">
          <button type="button" className="secondary-btn module-detail-back-btn" onClick={handleBack}>
            ← Back to Modules
          </button>
          <span className="lecture-total-chip module-detail-chip">
            {moduleLocked ? 'Locked Module' : 'Ready to Learn'}
          </span>
        </div>
      </header>

      {loadError ? <p className="inline-message error">{loadError.message || 'Failed to load module details.'}</p> : null}

      <section className="module-detail-stats-grid lecture-enter-stage-2">
        <article className="module-detail-stat-card">
          <span>Lectures</span>
          <strong>{moduleVideos.length}</strong>
        </article>
        <article className="module-detail-stat-card">
          <span>Topics</span>
          <strong>{topicCount}</strong>
        </article>
        <article className="module-detail-stat-card">
          <span>Quizzes</span>
          <strong>{quizzesForMetrics.length}</strong>
        </article>
        <article className="module-detail-stat-card">
          <span>Progress</span>
          <strong>{progressPercent}%</strong>
        </article>
      </section>

      {moduleLocked ? (
        <section className="module-detail-lock-card lecture-enter-stage-3">
          <h3>This module is locked</h3>
          <p>Unlock this module from dashboard to access lectures and quizzes.</p>
          <div className="module-detail-price-row">
            <div>
              <span>Pro</span>
              <strong>{formatPriceInPaise(primaryPlan?.amountInPaise || 0, moduleAccess?.pricing?.currency || 'INR')}</strong>
            </div>
            <div>
              <span>Elite</span>
              <strong>{formatPriceInPaise(elitePlan?.amountInPaise || 0, moduleAccess?.pricing?.currency || 'INR')}</strong>
            </div>
          </div>
          <button
            type="button"
            className="primary-btn"
            onClick={() => navigate(`/student/course/${encodeURIComponent(scopeCourseLabel)}/modules`)}
          >
            Open Unlock Panel
          </button>
        </section>
      ) : (
        <section className="module-detail-workspace lecture-enter-stage-3">
          <div className="module-detail-actions-grid">
            <button
              type="button"
              className="module-detail-action-card"
              onClick={() => navigate(`/student/module/${encodeURIComponent(scopeCourseLabel)}/${encodeURIComponent(decodedModuleName)}/lectures`)}
              disabled={isLoading}
            >
              <span aria-hidden="true">🎬</span>
              <strong>Lecture Workspace</strong>
              <p>Watch all videos, PDFs and chapter materials for this module.</p>
            </button>
            <button
              type="button"
              className="module-detail-action-card"
              onClick={() => navigate(`/student/module/${encodeURIComponent(scopeCourseLabel)}/${encodeURIComponent(decodedModuleName)}/quizzes`)}
              disabled={isLoading}
            >
              <span aria-hidden="true">🧪</span>
              <strong>Quiz Workspace</strong>
              <p>Practice topic-wise quizzes and track recent performance.</p>
            </button>
          </div>

          <div className="module-detail-info-grid">
            <article className="module-detail-info-card">
              <h4>Recent Performance</h4>
              {latestAttempt ? (
                <p>
                  Last attempt score: {latestAttempt.score}/{latestAttempt.total} ({Math.round((latestAttempt.score / latestAttempt.total) * 100)}%)
                </p>
              ) : (
                <p>No quiz attempt yet for this module.</p>
              )}
            </article>
            <article className="module-detail-info-card">
              <h4>Saved Lectures</h4>
              <p>{savedCount} lecture{savedCount === 1 ? '' : 's'} marked as saved for quick revision.</p>
            </article>
            <article className="module-detail-info-card">
              <h4>Completion</h4>
              <p>{completedCount} of {moduleVideos.length} lectures completed.</p>
            </article>
          </div>
        </section>
      )}
    </main>
  );
}
