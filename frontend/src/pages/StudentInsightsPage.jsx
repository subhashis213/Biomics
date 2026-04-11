import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { fetchMyCoursePaymentInfo, fetchTestSeriesStudentAccess } from '../api';
import { useCourseData } from '../hooks/useCourseData';
import { useSessionStore } from '../stores/sessionStore';

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeId(value) {
  return String(value || '');
}

function asDateKey(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function rupees(value) {
  const amount = Number(value || 0) / 100;
  return `Rs ${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function getPastDate(days) {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() - days);
  return dt;
}

function clampPercent(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function getRangeDays(range) {
  if (range === '7d') return 7;
  if (range === '30d') return 30;
  if (range === '90d') return 90;
  return null;
}

export default function StudentInsightsPage() {
  const navigate = useNavigate();
  const { session, logout } = useSessionStore();
  const {
    course,
    videos,
    quizzes,
    quizAttempts,
    completedIds,
    access,
    moduleCatalog,
    isLoading,
    loadError
  } = useCourseData();

  const [rangeFilter, setRangeFilter] = useState('30d');
  const [topicFilter, setTopicFilter] = useState('all');
  const [performanceRangeFilter, setPerformanceRangeFilter] = useState('30d');
  const [performanceTopicFilter, setPerformanceTopicFilter] = useState('all');
  const [performanceModuleFilter, setPerformanceModuleFilter] = useState('all');
  const [weakRangeFilter, setWeakRangeFilter] = useState('30d');
  const [weakModuleFilter, setWeakModuleFilter] = useState('all');
  const [heatmapRangeFilter, setHeatmapRangeFilter] = useState('84d');
  const [heatmapTopicFilter, setHeatmapTopicFilter] = useState('all');
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [testSeriesAccess, setTestSeriesAccess] = useState(null);
  const [isPurchaseLoading, setIsPurchaseLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsPurchaseLoading(true);

    Promise.all([
      fetchMyCoursePaymentInfo().catch(() => null),
      fetchTestSeriesStudentAccess().catch(() => null)
    ])
      .then(([coursePayment, seriesAccess]) => {
        if (cancelled) return;
        setPaymentInfo(coursePayment);
        setTestSeriesAccess(seriesAccess);
      })
      .finally(() => {
        if (!cancelled) setIsPurchaseLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const topicOptions = useMemo(() => {
    const topics = new Set();
    quizzes.forEach((quiz) => {
      const t = normalizeText(quiz?.topic || 'General');
      if (t) topics.add(t);
    });
    quizAttempts.forEach((attempt) => {
      const t = normalizeText(attempt?.topic || 'General');
      if (t) topics.add(t);
    });
    return Array.from(topics).sort((a, b) => a.localeCompare(b));
  }, [quizzes, quizAttempts]);

  const moduleOptions = useMemo(() => {
    const modules = new Set();
    quizzes.forEach((quiz) => {
      const m = normalizeText(quiz?.module || 'General');
      if (m) modules.add(m);
    });
    quizAttempts.forEach((attempt) => {
      const m = normalizeText(attempt?.module || 'General');
      if (m) modules.add(m);
    });
    return Array.from(modules).sort((a, b) => a.localeCompare(b));
  }, [quizzes, quizAttempts]);

  useEffect(() => {
    if (topicFilter === 'all') return;
    if (topicOptions.includes(topicFilter)) return;
    setTopicFilter('all');
  }, [topicFilter, topicOptions]);

  useEffect(() => {
    if (performanceTopicFilter !== 'all' && !topicOptions.includes(performanceTopicFilter)) {
      setPerformanceTopicFilter('all');
    }
    if (heatmapTopicFilter !== 'all' && !topicOptions.includes(heatmapTopicFilter)) {
      setHeatmapTopicFilter('all');
    }
  }, [performanceTopicFilter, heatmapTopicFilter, topicOptions]);

  useEffect(() => {
    if (performanceModuleFilter !== 'all' && !moduleOptions.includes(performanceModuleFilter)) {
      setPerformanceModuleFilter('all');
    }
    if (weakModuleFilter !== 'all' && !moduleOptions.includes(weakModuleFilter)) {
      setWeakModuleFilter('all');
    }
  }, [performanceModuleFilter, weakModuleFilter, moduleOptions]);

  const filteredAttempts = useMemo(() => {
    const now = new Date();
    let cutoff = null;
    if (rangeFilter === '7d') cutoff = getPastDate(7);
    if (rangeFilter === '30d') cutoff = getPastDate(30);
    if (rangeFilter === '90d') cutoff = getPastDate(90);

    return quizAttempts.filter((attempt) => {
      const topic = normalizeText(attempt?.topic || 'General');
      if (topicFilter !== 'all' && topic !== topicFilter) return false;

      if (!cutoff) return true;
      const submittedAt = new Date(attempt?.submittedAt || 0);
      if (Number.isNaN(submittedAt.getTime())) return false;
      return submittedAt >= cutoff && submittedAt <= now;
    });
  }, [quizAttempts, rangeFilter, topicFilter]);

  const previousWindowAttempts = useMemo(() => {
    const rangeDays = getRangeDays(rangeFilter);
    if (!rangeDays) return [];

    const now = new Date();
    const currentStart = getPastDate(rangeDays);
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - rangeDays);

    return quizAttempts.filter((attempt) => {
      const topic = normalizeText(attempt?.topic || 'General');
      if (topicFilter !== 'all' && topic !== topicFilter) return false;
      const submittedAt = new Date(attempt?.submittedAt || 0);
      if (Number.isNaN(submittedAt.getTime())) return false;
      return submittedAt >= previousStart && submittedAt < currentStart && submittedAt <= now;
    });
  }, [quizAttempts, rangeFilter, topicFilter]);

  const performanceAttempts = useMemo(() => {
    const now = new Date();
    const rangeDays = getRangeDays(performanceRangeFilter);
    const cutoff = rangeDays ? getPastDate(rangeDays) : null;

    return quizAttempts.filter((attempt) => {
      const topic = normalizeText(attempt?.topic || 'General');
      const moduleName = normalizeText(attempt?.module || 'General');
      if (performanceTopicFilter !== 'all' && topic !== performanceTopicFilter) return false;
      if (performanceModuleFilter !== 'all' && moduleName !== performanceModuleFilter) return false;
      if (!cutoff) return true;
      const submittedAt = new Date(attempt?.submittedAt || 0);
      if (Number.isNaN(submittedAt.getTime())) return false;
      return submittedAt >= cutoff && submittedAt <= now;
    });
  }, [quizAttempts, performanceRangeFilter, performanceTopicFilter, performanceModuleFilter]);

  const weakTopicAttempts = useMemo(() => {
    const now = new Date();
    const rangeDays = getRangeDays(weakRangeFilter);
    const cutoff = rangeDays ? getPastDate(rangeDays) : null;

    return quizAttempts.filter((attempt) => {
      const moduleName = normalizeText(attempt?.module || 'General');
      if (weakModuleFilter !== 'all' && moduleName !== weakModuleFilter) return false;
      if (!cutoff) return true;
      const submittedAt = new Date(attempt?.submittedAt || 0);
      if (Number.isNaN(submittedAt.getTime())) return false;
      return submittedAt >= cutoff && submittedAt <= now;
    });
  }, [quizAttempts, weakRangeFilter, weakModuleFilter]);

  const heatmapAttempts = useMemo(() => {
    const now = new Date();
    const rangeDays = getRangeDays(heatmapRangeFilter);
    const cutoff = rangeDays ? getPastDate(rangeDays) : null;

    return quizAttempts.filter((attempt) => {
      const topic = normalizeText(attempt?.topic || 'General');
      if (heatmapTopicFilter !== 'all' && topic !== heatmapTopicFilter) return false;
      if (!cutoff) return true;
      const submittedAt = new Date(attempt?.submittedAt || 0);
      if (Number.isNaN(submittedAt.getTime())) return false;
      return submittedAt >= cutoff && submittedAt <= now;
    });
  }, [quizAttempts, heatmapRangeFilter, heatmapTopicFilter]);

  const attemptMetrics = useMemo(() => {
    const totalAttempts = filteredAttempts.length;
    const percentages = filteredAttempts
      .map((attempt) => {
        if (typeof attempt?.percentage === 'number') return attempt.percentage;
        const total = Number(attempt?.total || 0);
        const score = Number(attempt?.score || 0);
        return total > 0 ? (score / total) * 100 : 0;
      })
      .filter((value) => Number.isFinite(value));

    const averageScore = percentages.length
      ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length)
      : 0;

    const bestScore = percentages.length ? Math.round(Math.max(...percentages)) : 0;

    return {
      totalAttempts,
      averageScore: clampPercent(averageScore),
      bestScore: clampPercent(bestScore)
    };
  }, [filteredAttempts]);

  const previousAttemptMetrics = useMemo(() => {
    const totalAttempts = previousWindowAttempts.length;
    const percentages = previousWindowAttempts
      .map((attempt) => {
        if (typeof attempt?.percentage === 'number') return attempt.percentage;
        const total = Number(attempt?.total || 0);
        const score = Number(attempt?.score || 0);
        return total > 0 ? (score / total) * 100 : 0;
      })
      .filter((value) => Number.isFinite(value));

    const averageScore = percentages.length
      ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length)
      : 0;

    const bestScore = percentages.length ? Math.round(Math.max(...percentages)) : 0;

    return {
      totalAttempts,
      averageScore: clampPercent(averageScore),
      bestScore: clampPercent(bestScore)
    };
  }, [previousWindowAttempts]);

  const modulePerformanceBars = useMemo(() => {
    const moduleMap = {};

    performanceAttempts.forEach((attempt) => {
      const moduleName = normalizeText(attempt?.module || 'General');
      const scorePct = typeof attempt?.percentage === 'number'
        ? attempt.percentage
        : (Number(attempt?.total || 0) > 0 ? (Number(attempt?.score || 0) / Number(attempt.total)) * 100 : 0);

      if (!moduleMap[moduleName]) {
        moduleMap[moduleName] = { module: moduleName, attempts: 0, totalPct: 0 };
      }
      moduleMap[moduleName].attempts += 1;
      moduleMap[moduleName].totalPct += Number.isFinite(scorePct) ? scorePct : 0;
    });

    return Object.values(moduleMap)
      .map((entry) => ({
        module: entry.module,
        attempts: entry.attempts,
        avgPct: clampPercent(entry.attempts ? entry.totalPct / entry.attempts : 0)
      }))
      .sort((a, b) => b.avgPct - a.avgPct)
      .slice(0, 8);
  }, [performanceAttempts]);

  const completionMetrics = useMemo(() => {
    const totalVideos = videos.length;
    const completedVideos = videos.filter((video) => completedIds.has(normalizeId(video?._id))).length;
    const completionPct = totalVideos > 0 ? clampPercent((completedVideos / totalVideos) * 100) : 0;
    return { totalVideos, completedVideos, completionPct };
  }, [videos, completedIds]);

  const streakDays = useMemo(() => {
    const daySet = new Set(
      quizAttempts
        .map((attempt) => asDateKey(attempt?.submittedAt))
        .filter(Boolean)
    );

    if (!daySet.size) return 0;

    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    while (true) {
      const key = asDateKey(cursor);
      if (!daySet.has(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  }, [quizAttempts]);

  const readinessScore = useMemo(() => {
    const consistencyScore = Math.min(100, streakDays * 12);
    return clampPercent(
      (completionMetrics.completionPct * 0.35)
      + (attemptMetrics.averageScore * 0.45)
      + (consistencyScore * 0.20)
    );
  }, [completionMetrics.completionPct, attemptMetrics.averageScore, streakDays]);

  const trendMetrics = useMemo(() => {
    const hasWindowComparison = getRangeDays(rangeFilter) !== null;
    if (!hasWindowComparison) {
      return {
        attemptsDelta: null,
        averageDelta: null,
        bestDelta: null
      };
    }

    return {
      attemptsDelta: attemptMetrics.totalAttempts - previousAttemptMetrics.totalAttempts,
      averageDelta: attemptMetrics.averageScore - previousAttemptMetrics.averageScore,
      bestDelta: attemptMetrics.bestScore - previousAttemptMetrics.bestScore
    };
  }, [rangeFilter, attemptMetrics, previousAttemptMetrics]);

  const weakTopicList = useMemo(() => {
    const byTopic = {};
    weakTopicAttempts.forEach((attempt) => {
      const topic = normalizeText(attempt?.topic || 'General');
      const pct = typeof attempt?.percentage === 'number'
        ? attempt.percentage
        : (Number(attempt?.total || 0) > 0 ? (Number(attempt?.score || 0) / Number(attempt?.total || 0)) * 100 : 0);

      if (!byTopic[topic]) {
        byTopic[topic] = { topic, attempts: 0, totalPct: 0 };
      }

      byTopic[topic].attempts += 1;
      byTopic[topic].totalPct += Number.isFinite(pct) ? pct : 0;
    });

    return Object.values(byTopic)
      .map((item) => ({
        topic: item.topic,
        attempts: item.attempts,
        avgPct: clampPercent(item.attempts ? item.totalPct / item.attempts : 0)
      }))
      .sort((a, b) => {
        if (a.avgPct !== b.avgPct) return a.avgPct - b.avgPct;
        return a.attempts - b.attempts;
      })
      .slice(0, 5);
  }, [weakTopicAttempts]);

  const weeklyHeatmap = useMemo(() => {
    const heatmapRangeDays = getRangeDays(heatmapRangeFilter) || 84;
    const days = Array.from({ length: heatmapRangeDays }).map((_, index) => {
      const date = getPastDate((heatmapRangeDays - 1) - index);
      return asDateKey(date);
    });

    const countByDate = {};
    heatmapAttempts.forEach((attempt) => {
      const key = asDateKey(attempt?.submittedAt);
      if (!key) return;
      countByDate[key] = (countByDate[key] || 0) + 1;
    });

    return days.map((dateKey) => {
      const count = countByDate[dateKey] || 0;
      const date = new Date(`${dateKey}T00:00:00`);
      let intensity = 0;
      if (count >= 1) intensity = 1;
      if (count >= 2) intensity = 2;
      if (count >= 3) intensity = 3;
      if (count >= 5) intensity = 4;

      return {
        dateKey,
        count,
        intensity,
        monthLabel: date.toLocaleString('en-US', { month: 'short' }),
        dateLabel: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      };
    });
  }, [heatmapAttempts, heatmapRangeFilter]);

  const heatmapMonthLabels = useMemo(() => {
    const seen = new Set();
    return weeklyHeatmap
      .map((cell) => cell.monthLabel)
      .filter((label) => {
        if (seen.has(label)) return false;
        seen.add(label);
        return true;
      });
  }, [weeklyHeatmap]);

  const heatmapRangeLabel = useMemo(() => {
    if (!weeklyHeatmap.length) return '';
    const first = weeklyHeatmap[0]?.dateLabel || '';
    const last = weeklyHeatmap[weeklyHeatmap.length - 1]?.dateLabel || '';
    return `${first} to ${last}`;
  }, [weeklyHeatmap]);

  const purchasedCourseCards = useMemo(() => {
    const cards = [];
    const activeMembership = access?.activeMembership || null;
    const moduleAccess = access?.moduleAccess || {};

    cards.push({
      title: normalizeText(course || paymentInfo?.course || 'Your Course'),
      status: access?.allModulesUnlocked || access?.unlocked ? 'Full Access' : 'Module Access',
      details: activeMembership?.expiresAt
        ? `Valid till ${new Date(activeMembership.expiresAt).toLocaleDateString()}`
        : 'Membership active'
    });

    Object.keys(moduleAccess).forEach((moduleName) => {
      const entry = moduleAccess[moduleName];
      if (!entry?.unlocked) return;
      if (String(moduleName).toUpperCase() === 'ALL_MODULES') return;
      cards.push({
        title: normalizeText(moduleName),
        status: 'Unlocked Module',
        details: entry?.activeMembership?.expiresAt
          ? `Till ${new Date(entry.activeMembership.expiresAt).toLocaleDateString()}`
          : 'Access active'
      });
    });

    return cards;
  }, [course, paymentInfo, access]);

  const testSeriesPurchases = useMemo(() => {
    const accessInfo = testSeriesAccess?.access || {};
    const pricing = testSeriesAccess?.pricing || {};

    return [
      {
        label: 'Topic Test Series',
        purchased: Boolean(accessInfo.hasTopicTest),
        price: rupees(pricing.topicTestPriceInPaise || 0)
      },
      {
        label: 'Full Mock Series',
        purchased: Boolean(accessInfo.hasFullMock),
        price: rupees(pricing.fullMockPriceInPaise || 0)
      }
    ];
  }, [testSeriesAccess]);

  const utilizationMetrics = useMemo(() => {
    const totalModules = Array.from(new Set(
      moduleCatalog.map((entry) => normalizeText(entry?.name || '')).filter(Boolean)
    )).length;

    const unlockedModules = access?.allModulesUnlocked || access?.unlocked
      ? totalModules
      : Array.from(new Set(
        Object.keys(access?.moduleAccess || {})
          .filter((moduleName) => String(moduleName).toUpperCase() !== 'ALL_MODULES')
          .filter((moduleName) => Boolean(access?.moduleAccess?.[moduleName]?.unlocked))
          .map((moduleName) => normalizeText(moduleName))
      )).length;

    const moduleUtil = totalModules > 0 ? clampPercent((unlockedModules / totalModules) * 100) : 0;

    const boughtSeries = testSeriesPurchases.filter((item) => item.purchased).length;
    const seriesUtil = clampPercent((boughtSeries / 2) * 100);

    return {
      totalModules,
      unlockedModules,
      moduleUtil,
      boughtSeries,
      seriesUtil
    };
  }, [moduleCatalog, access, testSeriesPurchases]);

  const donutStyleCompletion = {
    '--value': `${completionMetrics.completionPct}%`
  };

  const donutStyleAccuracy = {
    '--value': `${attemptMetrics.averageScore}%`
  };

  const donutStyleReadiness = {
    '--value': `${readinessScore}%`
  };

  const insightsNavItems = [
    { id: 'insights-overview', label: 'Overview', icon: '✨' },
    { id: 'insights-streak', label: 'Streak', icon: '🔥' },
    { id: 'insights-performance', label: 'Performance', icon: '📊' },
    { id: 'insights-purchases', label: 'Purchases', icon: '🛍️' }
  ];

  function handleNavClick(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const rootStyles = window.getComputedStyle(document.documentElement);
    const clearance = parseFloat(rootStyles.getPropertyValue('--app-shell-topbar-clearance')) || 96;
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - clearance - 12);
    window.scrollTo({ top, behavior: 'smooth' });
  }

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  const moduleCount = Array.from(new Set(
    moduleCatalog
      .map((entry) => normalizeText(entry?.name || ''))
      .filter(Boolean)
  )).length;

  const showInsightsSkeleton = (isLoading || isPurchaseLoading) && !loadError;

  return (
    <AppShell
      title="Student Insights"
      subtitle="Track progress, performance and purchases"
      roleLabel="Student"
      navTitle="Insights"
      navItems={insightsNavItems}
      onNavItemClick={handleNavClick}
      actions={(
        <div className="topbar-user-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate('/student')}>
            Back to Dashboard
          </button>
        </div>
      )}
      onLogout={handleLogout}
    >
      <div className={`student-insights-page${showInsightsSkeleton ? ' is-loading' : ''}`}>
        {loadError ? <p className="inline-message error">{loadError.message || 'Failed to load analytics.'}</p> : null}
        {showInsightsSkeleton ? (
          <div className="insights-skeleton-layout" aria-hidden="true">
            <section className="card insights-skeleton-card insights-skeleton-hero">
              <div className="skeleton-line large" />
              <div className="skeleton-line" />
              <div className="skeleton-line" style={{ width: '68%' }} />
            </section>
            <section className="insights-skeleton-grid insights-skeleton-grid--stats">
              {Array.from({ length: 5 }).map((_, index) => (
                <article key={`stats-skel-${index}`} className="card insights-skeleton-card">
                  <div className="skeleton-line" />
                  <div className="skeleton-line large" style={{ width: '58%' }} />
                  <div className="skeleton-line" style={{ width: '72%' }} />
                </article>
              ))}
            </section>
            <section className="insights-skeleton-grid insights-skeleton-grid--charts">
              {Array.from({ length: 4 }).map((_, index) => (
                <article key={`chart-skel-${index}`} className="card insights-skeleton-card">
                  <div className="skeleton-line" style={{ width: '46%' }} />
                  <div className="skeleton-box" style={{ height: 130, borderRadius: 12 }} />
                </article>
              ))}
            </section>
          </div>
        ) : null}

        <section id="insights-overview" className="card insights-hero-card">
          <div>
            <p className="eyebrow">Analytics Command Center</p>
            <h2>Welcome {session?.username || 'Student'}</h2>
            <p className="subtitle">Filter and visualize quiz performance, study consistency, and purchase coverage.</p>
          </div>
          <div className="insights-filter-row" role="group" aria-label="Insights filters">
            <label>
              Time Range
              <select value={rangeFilter} onChange={(event) => setRangeFilter(event.target.value)}>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="all">All time</option>
              </select>
            </label>
            <label>
              Topic
              <select value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}>
                <option value="all">All Topics</option>
                {topicOptions.map((topic) => (
                  <option key={topic} value={topic}>{topic}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section id="insights-streak" className="card insights-streak-card">
          <div className="insights-streak-head">
            <div className={`insights-fire-badge${streakDays > 0 ? ' active' : ''}`} aria-hidden="true">🔥</div>
            <div>
              <p className="eyebrow">Daily Quiz Streak</p>
              <h3>{streakDays} day{streakDays === 1 ? '' : 's'} streak</h3>
              <p className="subtitle">Attempt at least one quiz every day to keep the fire growing.</p>
            </div>
          </div>
        </section>

        <section id="insights-performance" className="insights-metrics-grid">
          <article className="card insights-stat-card">
            <span>Readiness Score</span>
            <strong>{readinessScore}%</strong>
            <small>Completion + accuracy + consistency</small>
          </article>
          <article className="card insights-stat-card">
            <span>Total Attempts</span>
            <strong>{attemptMetrics.totalAttempts}</strong>
            <small>
              {trendMetrics.attemptsDelta === null
                ? 'Based on selected filters'
                : `${trendMetrics.attemptsDelta >= 0 ? '▲' : '▼'} ${Math.abs(trendMetrics.attemptsDelta)} vs previous period`}
            </small>
          </article>
          <article className="card insights-stat-card">
            <span>Average Score</span>
            <strong>{attemptMetrics.averageScore}%</strong>
            <small>
              {trendMetrics.averageDelta === null
                ? 'Quiz accuracy trend'
                : `${trendMetrics.averageDelta >= 0 ? '▲' : '▼'} ${Math.abs(trendMetrics.averageDelta)}% vs previous period`}
            </small>
          </article>
          <article className="card insights-stat-card">
            <span>Best Score</span>
            <strong>{attemptMetrics.bestScore}%</strong>
            <small>
              {trendMetrics.bestDelta === null
                ? 'Highest achieved score'
                : `${trendMetrics.bestDelta >= 0 ? '▲' : '▼'} ${Math.abs(trendMetrics.bestDelta)}% vs previous period`}
            </small>
          </article>
          <article className="card insights-stat-card">
            <span>Modules Covered</span>
            <strong>{moduleCount}</strong>
            <small>Across your course</small>
          </article>
        </section>

        <section className="insights-chart-layout">
          <article className="card insights-donut-card">
            <h3>Goal Readiness</h3>
            <div className="insights-donut insights-donut-readiness" style={donutStyleReadiness}>
              <div className="insights-donut-core">
                <strong>{readinessScore}%</strong>
                <span>exam readiness</span>
              </div>
            </div>
          </article>

          <article className="card insights-donut-card">
            <h3>Course Completion</h3>
            <div className="insights-donut" style={donutStyleCompletion}>
              <div className="insights-donut-core">
                <strong>{completionMetrics.completionPct}%</strong>
                <span>{completionMetrics.completedVideos}/{completionMetrics.totalVideos} videos</span>
              </div>
            </div>
          </article>

          <article className="card insights-donut-card">
            <h3>Quiz Accuracy</h3>
            <div className="insights-donut insights-donut-accent" style={donutStyleAccuracy}>
              <div className="insights-donut-core">
                <strong>{attemptMetrics.averageScore}%</strong>
                <span>avg across filters</span>
              </div>
            </div>
          </article>

          <article className="card insights-bar-card">
            <h3>Module-wise Performance</h3>
            <div className="insights-section-filter-row" role="group" aria-label="Performance section filters">
              <label>
                Range
                <select value={performanceRangeFilter} onChange={(event) => setPerformanceRangeFilter(event.target.value)}>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="all">All time</option>
                </select>
              </label>
              <label>
                Topic
                <select value={performanceTopicFilter} onChange={(event) => setPerformanceTopicFilter(event.target.value)}>
                  <option value="all">All Topics</option>
                  {topicOptions.map((topic) => (
                    <option key={`perf-topic-${topic}`} value={topic}>{topic}</option>
                  ))}
                </select>
              </label>
              <label>
                Module
                <select value={performanceModuleFilter} onChange={(event) => setPerformanceModuleFilter(event.target.value)}>
                  <option value="all">All Modules</option>
                  {moduleOptions.map((moduleName) => (
                    <option key={`perf-module-${moduleName}`} value={moduleName}>{moduleName}</option>
                  ))}
                </select>
              </label>
            </div>
            {modulePerformanceBars.length ? (
              <div className="insights-bars-wrap">
                {modulePerformanceBars.map((row) => (
                  <div key={row.module} className="insights-bar-row">
                    <div className="insights-bar-top">
                      <span>{row.module}</span>
                      <small>{row.attempts} quiz{row.attempts === 1 ? '' : 'zes'} • {row.avgPct}%</small>
                    </div>
                    <div className="insights-bar-track">
                      <div className="insights-bar-fill" style={{ width: `${row.avgPct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-note">No quiz attempts for this filter selection.</p>
            )}
          </article>
        </section>

        <section className="insights-detail-layout">
          <article className="card insights-weak-topics-card">
            <h3>Weak Topic Radar</h3>
            <div className="insights-section-filter-row" role="group" aria-label="Weak topic section filters">
              <label>
                Range
                <select value={weakRangeFilter} onChange={(event) => setWeakRangeFilter(event.target.value)}>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="all">All time</option>
                </select>
              </label>
              <label>
                Module
                <select value={weakModuleFilter} onChange={(event) => setWeakModuleFilter(event.target.value)}>
                  <option value="all">All Modules</option>
                  {moduleOptions.map((moduleName) => (
                    <option key={`weak-module-${moduleName}`} value={moduleName}>{moduleName}</option>
                  ))}
                </select>
              </label>
            </div>
            {weakTopicList.length ? (
              <div className="insights-weak-topic-list">
                {weakTopicList.map((topic) => (
                  <div key={topic.topic} className="insights-weak-topic-item">
                    <div className="insights-weak-topic-head">
                      <strong>{topic.topic}</strong>
                      <small>{topic.attempts} attempts • {topic.avgPct}% avg</small>
                    </div>
                    <div className="insights-weak-topic-track">
                      <div className="insights-weak-topic-fill" style={{ width: `${topic.avgPct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-note">No topic-level attempts yet for this filter.</p>
            )}
          </article>

          <article className="card insights-heatmap-card">
            <h3>Weekly Consistency Heatmap</h3>
            <div className="insights-section-filter-row" role="group" aria-label="Heatmap section filters">
              <label>
                Range
                <select value={heatmapRangeFilter} onChange={(event) => setHeatmapRangeFilter(event.target.value)}>
                  <option value="30d">Last 30 days</option>
                  <option value="84d">Last 12 weeks</option>
                  <option value="168d">Last 24 weeks</option>
                </select>
              </label>
              <label>
                Topic
                <select value={heatmapTopicFilter} onChange={(event) => setHeatmapTopicFilter(event.target.value)}>
                  <option value="all">All Topics</option>
                  {topicOptions.map((topic) => (
                    <option key={`heat-topic-${topic}`} value={topic}>{topic}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="insights-heatmap-range-text">{heatmapRangeLabel}</p>
            {heatmapMonthLabels.length ? (
              <div className="insights-heatmap-month-strip" aria-hidden="true">
                {heatmapMonthLabels.map((month) => (
                  <span key={`month-${month}`}>{month}</span>
                ))}
              </div>
            ) : null}
            <div className="insights-heatmap-grid" aria-label="Quiz activity heatmap">
              {weeklyHeatmap.map((cell) => (
                <span
                  key={cell.dateKey}
                  className={`insights-heat-cell level-${cell.intensity}`}
                  title={`${cell.dateLabel}: ${cell.count} quiz ${cell.count === 1 ? 'attempt' : 'attempts'}`}
                />
              ))}
            </div>
            <div className="insights-heatmap-legend" aria-hidden="true">
              <span>Less</span>
              <span className="insights-heat-cell level-0" />
              <span className="insights-heat-cell level-1" />
              <span className="insights-heat-cell level-2" />
              <span className="insights-heat-cell level-3" />
              <span className="insights-heat-cell level-4" />
              <span>More</span>
            </div>
          </article>
        </section>

        <section id="insights-purchases" className="insights-purchase-layout">
          <article className="card insights-purchase-card">
            <h3>Courses and Modules Purchased</h3>
            {purchasedCourseCards.length ? (
              <div className="insights-pill-list">
                {purchasedCourseCards.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="insights-pill-item">
                    <strong>{item.title}</strong>
                    <span>{item.status}</span>
                    <small>{item.details}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-note">No active course purchase data found.</p>
            )}
          </article>

          <article className="card insights-purchase-card">
            <h3>Test Series Purchased</h3>
            <div className="insights-pill-list">
              {testSeriesPurchases.map((item) => (
                <div key={item.label} className={`insights-pill-item${item.purchased ? ' purchased' : ''}`}>
                  <strong>{item.label}</strong>
                  <span>{item.purchased ? 'Purchased' : 'Not Purchased'}</span>
                  <small>{item.purchased ? 'Access enabled' : `Price: ${item.price}`}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="card insights-purchase-card insights-utilization-card">
            <h3>Purchase Utilization</h3>
            <div className="insights-util-row">
              <div className="insights-util-head">
                <strong>Module Access</strong>
                <small>{utilizationMetrics.unlockedModules}/{utilizationMetrics.totalModules} modules</small>
              </div>
              <div className="insights-util-track">
                <div className="insights-util-fill" style={{ width: `${utilizationMetrics.moduleUtil}%` }} />
              </div>
            </div>
            <div className="insights-util-row">
              <div className="insights-util-head">
                <strong>Test Series Access</strong>
                <small>{utilizationMetrics.boughtSeries}/2 purchased</small>
              </div>
              <div className="insights-util-track">
                <div className="insights-util-fill accent" style={{ width: `${utilizationMetrics.seriesUtil}%` }} />
              </div>
            </div>
          </article>
        </section>

      </div>
    </AppShell>
  );
}
