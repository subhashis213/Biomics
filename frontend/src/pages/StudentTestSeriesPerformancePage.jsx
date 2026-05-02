import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { fetchTestSeriesLeaderboardStudent, fetchTestSeriesPerformanceStudent } from '../api';
import { useSessionStore } from '../stores/sessionStore';

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function getPastDate(days) {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() - days);
  return dt;
}

function getRangeDays(range) {
  if (range === '7d') return 7;
  if (range === '30d') return 30;
  if (range === '90d') return 90;
  return null;
}

function formatDateTime(value) {
  if (!value) return 'No attempts yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No attempts yet';
  return date.toLocaleString();
}

function safePct(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

export default function StudentTestSeriesPerformancePage() {
  const navigate = useNavigate();
  const { session } = useSessionStore();
  const [performance, setPerformance] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rangeFilter, setRangeFilter] = useState('30d');
  const [courseFilter, setCourseFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [topicFilter, setTopicFilter] = useState('all');
  const [fullMockFilter, setFullMockFilter] = useState('all');

  const [tsLbTopicRows, setTsLbTopicRows] = useState([]);
  const [tsLbMockRows, setTsLbMockRows] = useState([]);
  const [tsLbLoading, setTsLbLoading] = useState(false);
  const [tsLbError, setTsLbError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    fetchTestSeriesPerformanceStudent()
      .then((data) => {
        if (!cancelled) setPerformance(data);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error?.message || 'Failed to load test series performance.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const access = performance?.access || { hasTopicTest: false, hasFullMock: false };
  const topicAttemptSource = performance?.recentTopicAttempts || [];
  const fullMockAttemptSource = performance?.recentFullMockAttempts || [];

  const courseOptions = useMemo(() => {
    const courses = new Set();
    topicAttemptSource.forEach((attempt) => {
      const courseName = normalizeText(attempt?.course || attempt?.category || '');
      if (courseName) courses.add(courseName);
    });
    fullMockAttemptSource.forEach((attempt) => {
      const courseName = normalizeText(attempt?.course || attempt?.category || '');
      if (courseName) courses.add(courseName);
    });
    return Array.from(courses).sort((a, b) => a.localeCompare(b));
  }, [fullMockAttemptSource, topicAttemptSource]);

  const batchOptions = useMemo(() => {
    const batches = new Set();
    topicAttemptSource.forEach((attempt) => {
      const courseName = normalizeText(attempt?.course || attempt?.category || '');
      const batchName = normalizeText(attempt?.batch || 'No Batch');
      if (courseFilter !== 'all' && courseName !== courseFilter) return;
      if (batchName) batches.add(batchName);
    });
    fullMockAttemptSource.forEach((attempt) => {
      const courseName = normalizeText(attempt?.course || attempt?.category || '');
      const batchName = normalizeText(attempt?.batch || 'No Batch');
      if (courseFilter !== 'all' && courseName !== courseFilter) return;
      if (batchName) batches.add(batchName);
    });
    return Array.from(batches).sort((a, b) => a.localeCompare(b));
  }, [courseFilter, fullMockAttemptSource, topicAttemptSource]);

  const moduleOptions = useMemo(() => {
    const modules = new Set((performance?.modulePerformance || []).map((item) => normalizeText(item?.module || '')).filter(Boolean));
    topicAttemptSource.forEach((attempt) => {
      const courseName = normalizeText(attempt?.course || attempt?.category || '');
      const batchName = normalizeText(attempt?.batch || 'No Batch');
      if (courseFilter !== 'all' && courseName !== courseFilter) return;
      if (batchFilter !== 'all' && batchName !== batchFilter) return;
      const moduleName = normalizeText(attempt?.module || 'General');
      if (moduleName) modules.add(moduleName);
    });
    return Array.from(modules).sort((a, b) => a.localeCompare(b));
  }, [batchFilter, courseFilter, performance?.modulePerformance, topicAttemptSource]);

  const topicOptions = useMemo(() => {
    const topics = new Set();
    (performance?.modulePerformance || []).forEach((moduleEntry) => {
      const moduleName = normalizeText(moduleEntry?.module || 'General');
      if (moduleFilter !== 'all' && moduleName !== moduleFilter) return;
      (moduleEntry?.topics || []).forEach((topicEntry) => {
        const topicName = normalizeText(topicEntry?.topic || 'General');
        if (topicName) topics.add(topicName);
      });
    });
    topicAttemptSource.forEach((attempt) => {
      const courseName = normalizeText(attempt?.course || attempt?.category || '');
      const batchName = normalizeText(attempt?.batch || 'No Batch');
      if (courseFilter !== 'all' && courseName !== courseFilter) return;
      if (batchFilter !== 'all' && batchName !== batchFilter) return;
      const moduleName = normalizeText(attempt?.module || 'General');
      const topicName = normalizeText(attempt?.topic || 'General');
      if (moduleFilter !== 'all' && moduleName !== moduleFilter) return;
      if (topicName) topics.add(topicName);
    });
    return Array.from(topics).sort((a, b) => a.localeCompare(b));
  }, [batchFilter, courseFilter, moduleFilter, performance?.modulePerformance, topicAttemptSource]);

  const fullMockOptions = useMemo(() => {
    const titles = new Set((performance?.fullMockPerformance || []).map((item) => normalizeText(item?.title || '')).filter(Boolean));
    fullMockAttemptSource.forEach((attempt) => {
      const courseName = normalizeText(attempt?.course || attempt?.category || '');
      const batchName = normalizeText(attempt?.batch || 'No Batch');
      if (courseFilter !== 'all' && courseName !== courseFilter) return;
      if (batchFilter !== 'all' && batchName !== batchFilter) return;
      const title = normalizeText(attempt?.title || 'Full Mock Test');
      if (title) titles.add(title);
    });
    return Array.from(titles).sort((a, b) => a.localeCompare(b));
  }, [batchFilter, courseFilter, fullMockAttemptSource, performance?.fullMockPerformance]);

  useEffect(() => {
    if (courseFilter !== 'all' && !courseOptions.includes(courseFilter)) {
      setCourseFilter('all');
    }
  }, [courseFilter, courseOptions]);

  useEffect(() => {
    if (batchFilter !== 'all' && !batchOptions.includes(batchFilter)) {
      setBatchFilter('all');
    }
  }, [batchFilter, batchOptions]);

  useEffect(() => {
    if (moduleFilter !== 'all' && !moduleOptions.includes(moduleFilter)) {
      setModuleFilter('all');
    }
  }, [moduleFilter, moduleOptions]);

  useEffect(() => {
    if (topicFilter !== 'all' && !topicOptions.includes(topicFilter)) {
      setTopicFilter('all');
    }
  }, [topicFilter, topicOptions]);

  useEffect(() => {
    if (fullMockFilter !== 'all' && !fullMockOptions.includes(fullMockFilter)) {
      setFullMockFilter('all');
    }
  }, [fullMockFilter, fullMockOptions]);

  const filteredTopicAttempts = useMemo(() => {
    const now = new Date();
    const rangeDays = getRangeDays(rangeFilter);
    const cutoff = rangeDays ? getPastDate(rangeDays) : null;

    return topicAttemptSource.filter((attempt) => {
      const courseName = normalizeText(attempt?.course || attempt?.category || '');
      const batchName = normalizeText(attempt?.batch || 'No Batch');
      if (courseFilter !== 'all' && courseName !== courseFilter) return false;
      if (batchFilter !== 'all' && batchName !== batchFilter) return false;
      const moduleName = normalizeText(attempt?.module || 'General');
      const topicName = normalizeText(attempt?.topic || 'General');
      if (moduleFilter !== 'all' && moduleName !== moduleFilter) return false;
      if (topicFilter !== 'all' && topicName !== topicFilter) return false;
      if (!cutoff) return true;

      const submittedAt = new Date(attempt?.submittedAt || 0);
      if (Number.isNaN(submittedAt.getTime())) return false;
      return submittedAt >= cutoff && submittedAt <= now;
    });
  }, [batchFilter, courseFilter, moduleFilter, rangeFilter, topicAttemptSource, topicFilter]);

  const filteredFullMockAttempts = useMemo(() => {
    const now = new Date();
    const rangeDays = getRangeDays(rangeFilter);
    const cutoff = rangeDays ? getPastDate(rangeDays) : null;

    return fullMockAttemptSource.filter((attempt) => {
      const courseName = normalizeText(attempt?.course || attempt?.category || '');
      const batchName = normalizeText(attempt?.batch || 'No Batch');
      if (courseFilter !== 'all' && courseName !== courseFilter) return false;
      if (batchFilter !== 'all' && batchName !== batchFilter) return false;
      const title = normalizeText(attempt?.title || 'Full Mock Test');
      if (fullMockFilter !== 'all' && title !== fullMockFilter) return false;
      if (!cutoff) return true;

      const submittedAt = new Date(attempt?.submittedAt || 0);
      if (Number.isNaN(submittedAt.getTime())) return false;
      return submittedAt >= cutoff && submittedAt <= now;
    });
  }, [batchFilter, courseFilter, fullMockAttemptSource, fullMockFilter, rangeFilter]);

  const filteredModulePerformance = useMemo(() => {
    const moduleMap = new Map();
    filteredTopicAttempts.forEach((attempt) => {
      const moduleName = normalizeText(attempt?.module || 'General');
      const topicName = normalizeText(attempt?.topic || 'General');
      const percentage = Number(attempt?.percentage || 0);
      if (!moduleMap.has(moduleName)) {
        moduleMap.set(moduleName, {
          module: moduleName,
          attempts: 0,
          totalPct: 0,
          bestScore: 0,
          topics: new Map()
        });
      }
      const moduleEntry = moduleMap.get(moduleName);
      moduleEntry.attempts += 1;
      moduleEntry.totalPct += percentage;
      moduleEntry.bestScore = Math.max(moduleEntry.bestScore, percentage);
      if (!moduleEntry.topics.has(topicName)) {
        moduleEntry.topics.set(topicName, { topic: topicName, attempts: 0, totalPct: 0, bestScore: 0, lastAttemptAt: null });
      }
      const topicEntry = moduleEntry.topics.get(topicName);
      topicEntry.attempts += 1;
      topicEntry.totalPct += percentage;
      topicEntry.bestScore = Math.max(topicEntry.bestScore, percentage);
      topicEntry.lastAttemptAt = attempt?.submittedAt || topicEntry.lastAttemptAt;
    });

    return Array.from(moduleMap.values()).map((moduleEntry) => ({
      module: moduleEntry.module,
      attempts: moduleEntry.attempts,
      averageScore: moduleEntry.attempts ? Math.round(moduleEntry.totalPct / moduleEntry.attempts) : 0,
      bestScore: moduleEntry.bestScore,
      topics: Array.from(moduleEntry.topics.values()).map((topicEntry) => ({
        topic: topicEntry.topic,
        attempts: topicEntry.attempts,
        averageScore: topicEntry.attempts ? Math.round(topicEntry.totalPct / topicEntry.attempts) : 0,
        bestScore: topicEntry.bestScore,
        lastAttemptAt: topicEntry.lastAttemptAt
      }))
    }));
  }, [filteredTopicAttempts]);

  const filteredFullMockPerformance = useMemo(() => {
    const fullMockMap = new Map();
    filteredFullMockAttempts.forEach((attempt) => {
      const title = normalizeText(attempt?.title || 'Full Mock Test');
      const percentage = Number(attempt?.percentage || 0);
      if (!fullMockMap.has(title)) {
        fullMockMap.set(title, { title, attempts: 0, totalPct: 0, bestScore: 0, lastAttemptAt: null });
      }
      const entry = fullMockMap.get(title);
      entry.attempts += 1;
      entry.totalPct += percentage;
      entry.bestScore = Math.max(entry.bestScore, percentage);
      entry.lastAttemptAt = attempt?.submittedAt || entry.lastAttemptAt;
    });
    return Array.from(fullMockMap.values()).map((entry) => ({
      title: entry.title,
      attempts: entry.attempts,
      averageScore: entry.attempts ? Math.round(entry.totalPct / entry.attempts) : 0,
      bestScore: entry.bestScore,
      lastAttemptAt: entry.lastAttemptAt
    }));
  }, [filteredFullMockAttempts]);

  const summary = useMemo(() => {
    const topicPercentages = filteredTopicAttempts.map((attempt) => Number(attempt?.percentage || 0)).filter((value) => Number.isFinite(value));
    const fullMockPercentages = filteredFullMockAttempts.map((attempt) => Number(attempt?.percentage || 0)).filter((value) => Number.isFinite(value));
    const topicModulesCovered = new Set(filteredTopicAttempts.map((attempt) => normalizeText(attempt?.module || 'General'))).size;
    const topicTracksCovered = new Set(filteredTopicAttempts.map((attempt) => `${normalizeText(attempt?.module || 'General')}::${normalizeText(attempt?.topic || 'General')}`)).size;
    const latestTopicAttempt = filteredTopicAttempts
      .slice()
      .sort((left, right) => new Date(right?.submittedAt || 0) - new Date(left?.submittedAt || 0))[0]?.submittedAt || null;
    const latestFullMockAttempt = filteredFullMockAttempts
      .slice()
      .sort((left, right) => new Date(right?.submittedAt || 0) - new Date(left?.submittedAt || 0))[0]?.submittedAt || null;

    return {
      topicTests: {
        attempts: filteredTopicAttempts.length,
        averageScore: topicPercentages.length ? Math.round(topicPercentages.reduce((sum, value) => sum + value, 0) / topicPercentages.length) : 0,
        bestScore: topicPercentages.length ? Math.max(...topicPercentages) : 0,
        lastAttemptAt: latestTopicAttempt,
        modulesCovered: topicModulesCovered,
        topicsCovered: topicTracksCovered
      },
      fullMocks: {
        attempts: filteredFullMockAttempts.length,
        averageScore: fullMockPercentages.length ? Math.round(fullMockPercentages.reduce((sum, value) => sum + value, 0) / fullMockPercentages.length) : 0,
        bestScore: fullMockPercentages.length ? Math.max(...fullMockPercentages) : 0,
        lastAttemptAt: latestFullMockAttempt
      }
    };
  }, [filteredFullMockAttempts, filteredTopicAttempts]);

  const totalSeriesAttempts = useMemo(() => (
    Number(summary.topicTests?.attempts || 0) + Number(summary.fullMocks?.attempts || 0)
  ), [summary.fullMocks?.attempts, summary.topicTests?.attempts]);

  useEffect(() => {
    let cancelled = false;
    const courseQ = courseFilter === 'all' ? '' : courseFilter;
    const moduleQ = moduleFilter === 'all' ? '' : moduleFilter;
    setTsLbLoading(true);
    setTsLbError('');
    Promise.all([
      fetchTestSeriesLeaderboardStudent({ course: courseQ, type: 'topic', module: moduleQ }),
      fetchTestSeriesLeaderboardStudent({ course: courseQ, type: 'mock' })
    ])
      .then(([topicRes, mockRes]) => {
        if (cancelled) return;
        setTsLbTopicRows(Array.isArray(topicRes?.leaderboard) ? topicRes.leaderboard : []);
        setTsLbMockRows(Array.isArray(mockRes?.leaderboard) ? mockRes.leaderboard : []);
      })
      .catch((err) => {
        if (!cancelled) setTsLbError(err?.message || 'Failed to load leaderboards.');
      })
      .finally(() => {
        if (!cancelled) setTsLbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseFilter, moduleFilter]);

  const navItems = [
    { id: 'series-performance-overview', label: 'Overview', icon: '✨' },
    { id: 'series-performance-leaderboards', label: 'Leaderboards', icon: '🏆' },
    { id: 'series-performance-topic-tests', label: 'Topic Tests', icon: '🧪' },
    { id: 'series-performance-full-mocks', label: 'Full Mocks', icon: '🏁' },
    { id: 'series-performance-recent', label: 'Recent', icon: '🕒' }
  ];

  function handleNavClick(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const rootStyles = window.getComputedStyle(document.documentElement);
    const clearance = parseFloat(rootStyles.getPropertyValue('--app-shell-topbar-clearance')) || 96;
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - clearance - 12);
    window.scrollTo({ top, behavior: 'smooth' });
  }

  return (
    <AppShell
      title="Test Series Performance"
      subtitle="Dedicated topic-test and full-mock result board"
      roleLabel="Student"
      navTitle="Series Board"
      navItems={navItems}
      onNavItemClick={handleNavClick}
      actions={(
        <div className="topbar-user-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate('/student')}>
            Back
          </button>
        </div>
      )}
    >
      <div className={`student-performance-page series-performance-page${isLoading ? ' is-loading' : ''}`}>
        {loadError ? <p className="inline-message error">{loadError}</p> : null}
        {isLoading ? (
          <div className="performance-skeleton-layout" aria-hidden="true">
            <section className="card performance-skeleton-card performance-skeleton-hero">
              <div className="skeleton-line large" />
              <div className="skeleton-line" />
              <div className="skeleton-line" style={{ width: '62%' }} />
            </section>
            <section className="performance-skeleton-grid">
              {Array.from({ length: 4 }).map((_, index) => (
                <article key={`series-skel-${index}`} className="card performance-skeleton-card">
                  <div className="skeleton-line" />
                  <div className="skeleton-line large" style={{ width: '58%' }} />
                  <div className="skeleton-line" style={{ width: '72%' }} />
                </article>
              ))}
            </section>
          </div>
        ) : null}

        <section id="series-performance-overview" className="card performance-hero-card series-performance-hero-card">
          <div>
            <p className="eyebrow">Series Performance Lounge</p>
            <h2>Hi {session?.username || 'Student'}</h2>
            <p className="subtitle">Track topic tests module by module and separate full mock results in one cleaner, more premium workspace.</p>
          </div>
          <div className="performance-filter-row" role="group" aria-label="Test series performance filters">
            <label>
              Range
              <select value={rangeFilter} onChange={(event) => setRangeFilter(event.target.value)}>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="all">All time</option>
              </select>
            </label>
            <label>
              Course
              <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
                <option value="all">All Courses</option>
                {courseOptions.map((courseName) => (
                  <option key={courseName} value={courseName}>{courseName}</option>
                ))}
              </select>
            </label>
            <label>
              Batch
              <select value={batchFilter} onChange={(event) => setBatchFilter(event.target.value)}>
                <option value="all">All Batches</option>
                {batchOptions.map((batchName) => (
                  <option key={batchName} value={batchName}>{batchName}</option>
                ))}
              </select>
            </label>
            <label>
              Module
              <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
                <option value="all">All Modules</option>
                {moduleOptions.map((moduleName) => (
                  <option key={moduleName} value={moduleName}>{moduleName}</option>
                ))}
              </select>
            </label>
            <label>
              Topic
              <select value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}>
                <option value="all">All Topics</option>
                {topicOptions.map((topicName) => (
                  <option key={topicName} value={topicName}>{topicName}</option>
                ))}
              </select>
            </label>
            <label>
              Full Mock
              <select value={fullMockFilter} onChange={(event) => setFullMockFilter(event.target.value)}>
                <option value="all">All Full Mocks</option>
                {fullMockOptions.map((title) => (
                  <option key={title} value={title}>{title}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="card performance-access-card">
          <div className="performance-access-grid" aria-label="Test series access status">
            <span className={`performance-access-pill${access.hasTopicTest ? ' active' : ''}`}>Topic Tests {access.hasTopicTest ? 'Unlocked' : 'Locked'}</span>
            <span className={`performance-access-pill${access.hasFullMock ? ' active' : ''}`}>Full Mocks {access.hasFullMock ? 'Unlocked' : 'Locked'}</span>
            <button type="button" className="primary-btn" onClick={() => navigate('/student/test-series')}>
              Open Test Series
            </button>
          </div>
        </section>

        <section className="performance-metrics-grid">
          <article className="card performance-stat-card">
            <span>Total Series Attempts</span>
            <strong>{totalSeriesAttempts}</strong>
            <small>Topic tests and full mocks combined</small>
          </article>
          <article className="card performance-stat-card">
            <span>Topic Test Average</span>
            <strong>{summary.topicTests.averageScore || 0}%</strong>
            <small>{summary.topicTests.modulesCovered || 0} modules, {summary.topicTests.topicsCovered || 0} topics</small>
          </article>
          <article className="card performance-stat-card">
            <span>Full Mock Average</span>
            <strong>{summary.fullMocks.averageScore || 0}%</strong>
            <small>{summary.fullMocks.attempts || 0} attempts recorded</small>
          </article>
          <article className="card performance-stat-card">
            <span>Best Full Mock</span>
            <strong>{summary.fullMocks.bestScore || 0}%</strong>
            <small>Latest: {formatDateTime(summary.fullMocks.lastAttemptAt)}</small>
          </article>
        </section>

        <section className="performance-spotlight-grid">
          <article className="card performance-spotlight-card">
            <p className="eyebrow">Topic Test Snapshot</p>
            <h3>{summary.topicTests.attempts || 0} attempts</h3>
            <p className="subtitle">Last topic-test attempt: {formatDateTime(summary.topicTests.lastAttemptAt)}</p>
          </article>
          <article className="card performance-spotlight-card accent">
            <p className="eyebrow">Full Mock Snapshot</p>
            <h3>{summary.fullMocks.attempts || 0} attempts</h3>
            <p className="subtitle">Best full mock score: {summary.fullMocks.bestScore || 0}%</p>
          </article>
        </section>

        <section id="series-performance-leaderboards" className="card performance-leaderboard-integrated performance-ts-leaderboard-integrated">
          <div className="performance-leaderboard-integrated-head">
            <div>
              <p className="eyebrow">Test series leaderboards</p>
              <h3>Peer rankings for your course</h3>
              <p className="subtitle">
                Topic board respects the <strong>Module</strong> filter above (when not “All”). Course scope follows the overview <strong>Course</strong> filter; when set to “All courses”, your enrolled course is used.
              </p>
            </div>
          </div>
          {tsLbLoading ? <p className="empty-note">Loading leaderboards…</p> : null}
          {!tsLbLoading && tsLbError ? <p className="inline-message error">{tsLbError}</p> : null}
          {!tsLbLoading && !tsLbError ? (
            <div className="performance-dual-leaderboard-grid">
              <div className="performance-dual-leaderboard-col">
                <h4 className="performance-dual-lb-title">Topic test series</h4>
                {tsLbTopicRows.length ? (
                  <>
                    {tsLbTopicRows[0] ? (
                      <article className="leaderboard-champion-card leaderboard-champion-card--compact">
                        <span className="leaderboard-crown" aria-hidden="true">👑</span>
                        <div>
                          <p className="leaderboard-champion-label">Leading (topic tests)</p>
                          <h3>{tsLbTopicRows[0].username}</h3>
                          <p className="leaderboard-champion-meta">
                            {tsLbTopicRows[0].module || 'General'} • {tsLbTopicRows[0].topic || 'General'} • {tsLbTopicRows[0].score}/{tsLbTopicRows[0].total} ({safePct(tsLbTopicRows[0].percentage)}%)
                          </p>
                        </div>
                      </article>
                    ) : null}
                    <div className="leaderboard-table-wrap">
                      <table className="leaderboard-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Learner</th>
                            <th>Module / topic</th>
                            <th>Best</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tsLbTopicRows.map((entry, index) => (
                            <tr key={`ts-t-${entry.username}-${index}`} className={entry.rank === 1 ? 'leaderboard-row-top' : ''}>
                              <td>#{entry.rank || index + 1}</td>
                              <td>{entry.username || '—'}</td>
                              <td>{entry.module || 'General'} · {entry.topic || 'General'}</td>
                              <td>{entry.score}/{entry.total} ({safePct(entry.percentage)}%)</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="empty-note">No topic-test leaderboard data yet for this scope.</p>
                )}
              </div>
              <div className="performance-dual-leaderboard-col">
                <h4 className="performance-dual-lb-title">Full mock series</h4>
                {tsLbMockRows.length ? (
                  <>
                    {tsLbMockRows[0] ? (
                      <article className="leaderboard-champion-card leaderboard-champion-card--compact">
                        <span className="leaderboard-crown" aria-hidden="true">👑</span>
                        <div>
                          <p className="leaderboard-champion-label">Leading (full mocks)</p>
                          <h3>{tsLbMockRows[0].username}</h3>
                          <p className="leaderboard-champion-meta">
                            {tsLbMockRows[0].title || 'Mock'} • {tsLbMockRows[0].score}/{tsLbMockRows[0].total} ({safePct(tsLbMockRows[0].percentage)}%)
                          </p>
                        </div>
                      </article>
                    ) : null}
                    <div className="leaderboard-table-wrap">
                      <table className="leaderboard-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Learner</th>
                            <th>Mock</th>
                            <th>Best</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tsLbMockRows.map((entry, index) => (
                            <tr key={`ts-m-${entry.username}-${index}`} className={entry.rank === 1 ? 'leaderboard-row-top' : ''}>
                              <td>#{entry.rank || index + 1}</td>
                              <td>{entry.username || '—'}</td>
                              <td>{entry.title || '—'}</td>
                              <td>{entry.score}/{entry.total} ({safePct(entry.percentage)}%)</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="empty-note">No full-mock leaderboard data yet for this scope.</p>
                )}
              </div>
            </div>
          ) : null}
        </section>

        <section id="series-performance-topic-tests" className="performance-module-grid">
          {access.hasTopicTest ? (
            filteredModulePerformance.length ? filteredModulePerformance.map((moduleEntry) => (
              <article key={moduleEntry.module} className="card performance-module-card">
                <div className="performance-module-head">
                  <div>
                    <p className="eyebrow">Topic Test Module</p>
                    <h3>{moduleEntry.module}</h3>
                  </div>
                  <div className="performance-module-badges">
                    <span>{moduleEntry.averageScore}% avg</span>
                    <span>{moduleEntry.bestScore}% best</span>
                    <span>{moduleEntry.attempts} attempts</span>
                  </div>
                </div>
                <div className="performance-topic-list">
                  {moduleEntry.topics.map((topicEntry) => (
                    <div key={`${moduleEntry.module}-${topicEntry.topic}`} className="performance-topic-item">
                      <div className="performance-topic-head">
                        <div>
                          <strong>{topicEntry.topic}</strong>
                          <small>Last attempt: {formatDateTime(topicEntry.lastAttemptAt)}</small>
                        </div>
                        <span>{topicEntry.averageScore}% avg</span>
                      </div>
                      <div className="performance-topic-track">
                        <div className="performance-topic-fill" style={{ width: `${topicEntry.averageScore}%` }} />
                      </div>
                      <div className="performance-topic-meta">
                        <small>{topicEntry.attempts} attempts</small>
                        <small>{topicEntry.bestScore}% best score</small>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            )) : (
              <article className="card performance-empty-card">
                <h3>No topic test attempts match this filter</h3>
                <p className="subtitle">Try changing the range, module, or topic filter to reveal more topic test results.</p>
              </article>
            )
          ) : (
            <article className="card performance-empty-card">
              <h3>Topic tests are still locked</h3>
              <p className="subtitle">Purchase the test series to unlock topic-wise performance tracking for your course.</p>
            </article>
          )}
        </section>

        <section id="series-performance-full-mocks" className="performance-module-grid performance-module-grid--compact">
          {access.hasFullMock ? (
            filteredFullMockPerformance.length ? filteredFullMockPerformance.map((item) => (
              <article key={item.title} className="card performance-module-card performance-module-card--mock">
                <div className="performance-module-head">
                  <div>
                    <p className="eyebrow">Full Mock</p>
                    <h3>{item.title}</h3>
                  </div>
                  <div className="performance-module-badges">
                    <span>{item.averageScore}% avg</span>
                    <span>{item.bestScore}% best</span>
                  </div>
                </div>
                <div className="performance-score-stack">
                  <div className="performance-score-stack-item">
                    <strong>{item.attempts}</strong>
                    <small>attempts</small>
                  </div>
                  <div className="performance-score-stack-item">
                    <strong>{formatDateTime(item.lastAttemptAt)}</strong>
                    <small>latest submission</small>
                  </div>
                </div>
              </article>
            )) : (
              <article className="card performance-empty-card">
                <h3>No full mock attempts match this filter</h3>
                <p className="subtitle">Try changing the range or full mock filter to see matching full mock performance.</p>
              </article>
            )
          ) : (
            <article className="card performance-empty-card">
              <h3>Full mocks are still locked</h3>
              <p className="subtitle">Unlock the test series plan to track full mock performance in this dedicated section.</p>
            </article>
          )}
        </section>

        <section id="series-performance-recent" className="performance-recent-grid">
          <article className="card performance-timeline-card">
            <div className="performance-section-head">
              <div>
                <p className="eyebrow">Recent Topic Tests</p>
                <h3>Latest topic-test attempts</h3>
              </div>
            </div>
            {filteredTopicAttempts.length ? (
              <div className="performance-timeline-list">
                {filteredTopicAttempts.map((attempt) => (
                  <article key={attempt._id} className="performance-timeline-item">
                    <div>
                      <strong>{attempt.course || attempt.category || 'Course'} • {attempt.batch || 'No Batch'} • {attempt.module} • {attempt.topic}</strong>
                      <small>{attempt.title}</small>
                    </div>
                    <div className="performance-score-pill">
                      {attempt.score}/{attempt.total} • {attempt.percentage}%
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-note">No topic test attempts recorded yet.</p>
            )}
          </article>

          <article className="card performance-timeline-card">
            <div className="performance-section-head">
              <div>
                <p className="eyebrow">Recent Full Mocks</p>
                <h3>Latest full mock attempts</h3>
              </div>
            </div>
            {filteredFullMockAttempts.length ? (
              <div className="performance-timeline-list">
                {filteredFullMockAttempts.map((attempt) => (
                  <article key={attempt._id} className="performance-timeline-item">
                    <div>
                      <strong>{attempt.course || attempt.category || 'Course'} • {attempt.batch || 'No Batch'} • {attempt.title}</strong>
                      <small>{formatDateTime(attempt.submittedAt)}</small>
                    </div>
                    <div className="performance-score-pill">
                      {attempt.score}/{attempt.total} • {attempt.percentage}%
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-note">No full mock attempts recorded yet.</p>
            )}
          </article>
        </section>
      </div>
    </AppShell>
  );
}