import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

function normalizeId(value) {
  return String(value || '');
}

export default function StudentCourseModulesPage() {
  const navigate = useNavigate();
  const { courseName } = useParams();
  const [searchQuery, setSearchQuery] = useState('');

  const decodedCourse = normalizeText(safeDecode(courseName) || 'General');

  const {
    videos,
    quizzes,
    quizAttempts,
    completedIds,
    access,
    isLoading,
    loadError,
    moduleCatalog,
  } = useCourseData();

  const allModulesUnlocked = Boolean(access?.allModulesUnlocked || access?.unlocked);
  const moduleAccessMap = access?.moduleAccess || {};

  // Build module metadata for this specific course
  const moduleMetaByKey = useMemo(() => {
    const map = {};
    const catalogModuleKeySet = new Set();

    function resolveKey(cat, mod) {
      return `${normalizeText(cat)}::${normalizeText(mod)}`;
    }

    videos.forEach((video) => {
      const cat = normalizeText(video?.category || 'General');
      if (cat !== decodedCourse) return;
      const mod = normalizeText(video?.module || 'General');
      const key = resolveKey(cat, mod);
      if (!map[key]) map[key] = { module: mod, category: cat };
    });

    quizzes.forEach((quiz) => {
      const cat = normalizeText(quiz?.category || decodedCourse);
      if (cat !== decodedCourse) return;
      const mod = normalizeText(quiz?.module || 'General');
      const key = resolveKey(cat, mod);
      if (!map[key]) map[key] = { module: mod, category: cat };
    });

    (Array.isArray(moduleCatalog) ? moduleCatalog : []).forEach((entry) => {
      const cat = normalizeText(entry?.category || '');
      if (cat !== decodedCourse) return;
      const mod = normalizeText(entry?.name || '');
      if (!mod) return;
      const key = resolveKey(cat, mod);
      catalogModuleKeySet.add(key);
      if (!map[key]) map[key] = { module: mod, category: cat };
    });

    // Also surface purchasable modules from access data
    Object.keys(moduleAccessMap).forEach((modName) => {
      const modNorm = normalizeText(modName);
      if (!modNorm || modNorm === 'ALL_MODULES') return;
      const key = resolveKey(decodedCourse, modNorm);
      const hasContentSignals = Boolean(map[key]);
      const existsInCatalog = catalogModuleKeySet.has(key);
      if (!hasContentSignals && !existsInCatalog) return;
      if (!map[key]) map[key] = { module: modNorm, category: decodedCourse };
    });

    return map;
  }, [videos, quizzes, moduleCatalog, moduleAccessMap, decodedCourse]);

  const videosByModule = useMemo(() => {
    const map = {};
    videos.forEach((video) => {
      const cat = normalizeText(video?.category || 'General');
      if (cat !== decodedCourse) return;
      const mod = normalizeText(video?.module || 'General');
      const key = `${cat}::${mod}`;
      if (!map[key]) map[key] = [];
      map[key].push(video);
    });
    return map;
  }, [videos, decodedCourse]);

  const quizzesByModule = useMemo(() => {
    const map = {};
    quizzes.forEach((quiz) => {
      const cat = normalizeText(quiz?.category || decodedCourse);
      if (cat !== decodedCourse) return;
      const mod = normalizeText(quiz?.module || 'General');
      const key = `${cat}::${mod}`;
      if (!map[key]) map[key] = [];
      map[key].push(quiz);
    });
    return map;
  }, [quizzes, decodedCourse]);

  const latestAttemptByModule = useMemo(() => {
    const map = {};
    [...quizAttempts]
      .sort((a, b) => new Date(b?.submittedAt || 0).getTime() - new Date(a?.submittedAt || 0).getTime())
      .forEach((attempt) => {
        const cat = normalizeText(attempt?.category || decodedCourse);
        if (cat !== decodedCourse) return;
        const mod = normalizeText(attempt?.module || 'General');
        const key = `${cat}::${mod}`;
        if (!map[key]) map[key] = attempt;
      });
    return map;
  }, [quizAttempts, decodedCourse]);

  function getModuleAccess(moduleName) {
    if (allModulesUnlocked) return { unlocked: true, purchaseRequired: false };
    const entry = moduleAccessMap[moduleName];
    if (entry) return entry;
    const norm = normalizeText(moduleName).toLowerCase();
    const matched = Object.keys(moduleAccessMap).find(
      (k) => normalizeText(k).toLowerCase() === norm
    );
    return matched ? moduleAccessMap[matched] : null;
  }

  const query = searchQuery.trim().toLowerCase();

  const sortedModuleKeys = Object.keys(moduleMetaByKey)
    .sort((a, b) => moduleMetaByKey[a].module.localeCompare(moduleMetaByKey[b].module))
    .filter((key) => {
      if (!query) return true;
      return moduleMetaByKey[key].module.toLowerCase().includes(query);
    });
  const lockedModuleCount = sortedModuleKeys.filter((moduleKey) => {
    const meta = moduleMetaByKey[moduleKey];
    const moduleAccess = getModuleAccess(meta.module);
    return Boolean(moduleAccess?.purchaseRequired && !moduleAccess?.unlocked);
  }).length;

  // Overall course progress
  const totalVideos = videos.filter((v) => normalizeText(v?.category || 'General') === decodedCourse);
  const totalCompleted = totalVideos.filter((v) => completedIds.has(normalizeId(v._id))).length;
  const overallProgress = totalVideos.length
    ? Math.round((totalCompleted / totalVideos.length) * 100)
    : 0;

  return (
    <main className="lecture-page course-modules-page lecture-enter">
      <header className="lecture-page-hero lecture-enter-stage-1">
        <div className="lecture-page-hero-left">
          <p className="eyebrow">Course Workspace</p>
          <h1>{decodedCourse}</h1>
          <p className="lecture-page-subtitle">
            {sortedModuleKeys.length} module{sortedModuleKeys.length === 1 ? '' : 's'} •{' '}
            {totalVideos.length} lecture{totalVideos.length === 1 ? '' : 's'} •{' '}
            {overallProgress}% complete
          </p>
        </div>
        <div className="lecture-page-hero-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => navigate('/student')}
          >
            ← Back to Dashboard
          </button>
          <span className="lecture-total-chip">
            {sortedModuleKeys.length} Module{sortedModuleKeys.length === 1 ? '' : 's'}
          </span>
        </div>
      </header>

      {loadError ? (
        <p className="inline-message error">
          {loadError.message || 'Failed to load modules.'}
        </p>
      ) : null}

      <section className="lecture-tools-panel lecture-enter-stage-2">
        <label>
          Search modules
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by module name..."
          />
        </label>
        <div className="course-modules-progress-row">
          <span className="course-modules-progress-label">Overall progress</span>
          <div className="course-modules-progress-track">
            <div
              className="course-modules-progress-fill"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <span className="course-modules-progress-pct">{overallProgress}%</span>
        </div>
      </section>
      {!allModulesUnlocked && lockedModuleCount > 0 ? (
        <p className="banner info">
          {`${lockedModuleCount} module${lockedModuleCount === 1 ? '' : 's'} locked in this course. `}
          <button
            type="button"
            className="link-btn"
            onClick={() => navigate(`/student/course/${encodeURIComponent(decodedCourse)}/batches`)}
          >
            Upgrade or buy single modules
          </button>
        </p>
      ) : null}

      {isLoading ? (
        <div className="modules-grid-student">
          {Array.from({ length: 6 }).map((_, i) => (
            <article
              key={`skel-${i}`}
              className="module-card-btn"
              style={{ opacity: 1, animation: 'none', minHeight: 180 }}
            >
              <div className="skeleton-box" style={{ height: '100%', borderRadius: 10 }} />
            </article>
          ))}
        </div>
      ) : sortedModuleKeys.length === 0 ? (
        <p className="empty-state">
          {query
            ? `No modules match "${searchQuery}" in ${decodedCourse}.`
            : `No modules available yet in ${decodedCourse}.`}
        </p>
      ) : (
        <div className="modules-grid-student lecture-enter-stage-3">
          {sortedModuleKeys.map((moduleKey) => {
            const meta = moduleMetaByKey[moduleKey];
            const modName = meta.module;
            const moduleAccess = getModuleAccess(modName);
            const isLocked = Boolean(moduleAccess?.purchaseRequired && !moduleAccess?.unlocked);
            const moduleVideos = videosByModule[moduleKey] || [];
            const moduleQuizCount = (quizzesByModule[moduleKey] || []).length;
            const completedCount = moduleVideos.filter((v) =>
              completedIds.has(normalizeId(v._id))
            ).length;
            const progress = moduleVideos.length
              ? Math.round((completedCount / moduleVideos.length) * 100)
              : 0;
            const latestAttempt = latestAttemptByModule[moduleKey];

            return (
              <article
                key={moduleKey}
                className={`module-card-btn${isLocked ? ' module-card-btn-locked' : ''}`}
                onClick={() =>
                  navigate(
                    `/student/module/${encodeURIComponent(decodedCourse)}/${encodeURIComponent(modName)}`
                  )
                }
              >
                <div className="module-card-header">
                  <span className="module-card-icon">📚</span>
                  <span className="module-card-count">{moduleVideos.length}</span>
                </div>
                <div className="module-card-body">
                  <h3 className="module-card-title">{modName}</h3>
                  <p className="module-card-subtitle">
                    {moduleVideos.length} lecture{moduleVideos.length === 1 ? '' : 's'}
                    {moduleQuizCount
                      ? ` • ${moduleQuizCount} quiz${moduleQuizCount === 1 ? '' : 'zes'}`
                      : ''}
                  </p>
                  <p className="module-card-progress">
                    {isLocked ? '🔒 Locked — click to view details' : `Progress: ${progress}%`}
                  </p>
                  {latestAttempt ? (
                    <p className="module-card-quiz-score">
                      Quiz best: {latestAttempt.score}/{latestAttempt.total}
                    </p>
                  ) : null}
                </div>
                <span className="module-card-arrow">{isLocked ? '🔒' : '→'}</span>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
