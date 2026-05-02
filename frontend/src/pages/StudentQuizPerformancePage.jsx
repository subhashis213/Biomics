import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { fetchQuizLeaderboard } from '../api';
import { useCourseData } from '../hooks/useCourseData';
import { useSessionStore } from '../stores/sessionStore';

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function clampPercent(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
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

function percentageFromAttempt(attempt) {
  if (typeof attempt?.percentage === 'number') return clampPercent(attempt.percentage);
  const total = Number(attempt?.total || 0);
  const score = Number(attempt?.score || 0);
  return total > 0 ? clampPercent((score / total) * 100) : 0;
}

function formatDateTime(value) {
  if (!value) return 'No attempts yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No attempts yet';
  return date.toLocaleString();
}

function safePercent(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

export default function StudentQuizPerformancePage() {
  const navigate = useNavigate();
  const { session } = useSessionStore();
  const { quizzes, quizAttempts, isLoading, loadError } = useCourseData();
  const [rangeFilter, setRangeFilter] = useState('30d');
  const [courseFilter, setCourseFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [topicFilter, setTopicFilter] = useState('all');

  const [lbModuleFilter, setLbModuleFilter] = useState('all');
  const [lbTopicFilter, setLbTopicFilter] = useState('all');
  const [lbRows, setLbRows] = useState([]);
  const [lbApiModules, setLbApiModules] = useState([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbError, setLbError] = useState('');

  const courseOptions = useMemo(() => {
    const courses = new Set();
    quizzes.forEach((quiz) => {
      const courseName = normalizeText(quiz?.course || quiz?.category || '');
      if (courseName) courses.add(courseName);
    });
    quizAttempts.forEach((attempt) => {
      const courseName = normalizeText(attempt?.course || attempt?.category || '');
      if (courseName) courses.add(courseName);
    });
    return Array.from(courses).sort((a, b) => a.localeCompare(b));
  }, [quizzes, quizAttempts]);

  const batchOptions = useMemo(() => {
    const batches = new Set();
    quizzes.forEach((quiz) => {
      const courseName = normalizeText(quiz?.course || quiz?.category || '');
      const batchName = normalizeText(quiz?.batch || 'No Batch');
      if (courseFilter !== 'all' && courseName !== courseFilter) return;
      if (batchName) batches.add(batchName);
    });
    quizAttempts.forEach((attempt) => {
      const courseName = normalizeText(attempt?.course || attempt?.category || '');
      const batchName = normalizeText(attempt?.batch || 'No Batch');
      if (courseFilter !== 'all' && courseName !== courseFilter) return;
      if (batchName) batches.add(batchName);
    });
    return Array.from(batches).sort((a, b) => a.localeCompare(b));
  }, [courseFilter, quizzes, quizAttempts]);

  const moduleOptions = useMemo(() => {
    const modules = new Set();
    quizzes.forEach((quiz) => {
      const courseName = normalizeText(quiz?.course || quiz?.category || '');
      const batchName = normalizeText(quiz?.batch || 'No Batch');
      if (courseFilter !== 'all' && courseName !== courseFilter) return;
      if (batchFilter !== 'all' && batchName !== batchFilter) return;
      const moduleName = normalizeText(quiz?.module || 'General');
      if (moduleName) modules.add(moduleName);
    });
    quizAttempts.forEach((attempt) => {
      const courseName = normalizeText(attempt?.course || attempt?.category || '');
      const batchName = normalizeText(attempt?.batch || 'No Batch');
      if (courseFilter !== 'all' && courseName !== courseFilter) return;
      if (batchFilter !== 'all' && batchName !== batchFilter) return;
      const moduleName = normalizeText(attempt?.module || 'General');
      if (moduleName) modules.add(moduleName);
    });
    return Array.from(modules).sort((a, b) => a.localeCompare(b));
  }, [batchFilter, courseFilter, quizzes, quizAttempts]);

  const topicOptions = useMemo(() => {
    const topics = new Set();
    quizzes.forEach((quiz) => {
      const courseName = normalizeText(quiz?.course || quiz?.category || '');
      const batchName = normalizeText(quiz?.batch || 'No Batch');
      if (courseFilter !== 'all' && courseName !== courseFilter) return;
      if (batchFilter !== 'all' && batchName !== batchFilter) return;
      const moduleName = normalizeText(quiz?.module || 'General');
      const topicName = normalizeText(quiz?.topic || 'General');
      if (moduleFilter !== 'all' && moduleName !== moduleFilter) return;
      if (topicName) topics.add(topicName);
    });
    quizAttempts.forEach((attempt) => {
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
  }, [batchFilter, courseFilter, moduleFilter, quizzes, quizAttempts]);

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

  const filteredAttempts = useMemo(() => {
    const now = new Date();
    const rangeDays = getRangeDays(rangeFilter);
    const cutoff = rangeDays ? getPastDate(rangeDays) : null;

    return quizAttempts.filter((attempt) => {
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
  }, [batchFilter, courseFilter, moduleFilter, quizAttempts, rangeFilter, topicFilter]);

  const summary = useMemo(() => {
    if (!filteredAttempts.length) {
      return {
        attempts: 0,
        averageScore: 0,
        bestScore: 0,
        modulesCovered: 0,
        topicsCovered: 0,
        lastAttemptAt: null
      };
    }

    const percentages = filteredAttempts.map((attempt) => percentageFromAttempt(attempt));
    const modulesCovered = new Set(filteredAttempts.map((attempt) => normalizeText(attempt?.module || 'General'))).size;
    const topicsCovered = new Set(filteredAttempts.map((attempt) => `${normalizeText(attempt?.module || 'General')}::${normalizeText(attempt?.topic || 'General')}`)).size;

    return {
      attempts: filteredAttempts.length,
      averageScore: clampPercent(percentages.reduce((sum, value) => sum + value, 0) / percentages.length),
      bestScore: Math.max(...percentages),
      modulesCovered,
      topicsCovered,
      lastAttemptAt: filteredAttempts
        .slice()
        .sort((left, right) => new Date(right?.submittedAt || 0) - new Date(left?.submittedAt || 0))[0]?.submittedAt || null
    };
  }, [filteredAttempts]);

  const moduleGroups = useMemo(() => {
    const groupMap = new Map();

    filteredAttempts.forEach((attempt) => {
      const moduleName = normalizeText(attempt?.module || 'General');
      const topicName = normalizeText(attempt?.topic || 'General');
      const percentage = percentageFromAttempt(attempt);

      if (!groupMap.has(moduleName)) {
        groupMap.set(moduleName, {
          module: moduleName,
          attempts: 0,
          totalPct: 0,
          bestScore: 0,
          lastAttemptAt: null,
          topics: new Map()
        });
      }

      const moduleEntry = groupMap.get(moduleName);
      moduleEntry.attempts += 1;
      moduleEntry.totalPct += percentage;
      moduleEntry.bestScore = Math.max(moduleEntry.bestScore, percentage);
      if (!moduleEntry.lastAttemptAt || new Date(attempt?.submittedAt || 0) > new Date(moduleEntry.lastAttemptAt || 0)) {
        moduleEntry.lastAttemptAt = attempt?.submittedAt || null;
      }

      if (!moduleEntry.topics.has(topicName)) {
        moduleEntry.topics.set(topicName, {
          topic: topicName,
          attempts: 0,
          totalPct: 0,
          bestScore: 0,
          lastAttemptAt: null
        });
      }

      const topicEntry = moduleEntry.topics.get(topicName);
      topicEntry.attempts += 1;
      topicEntry.totalPct += percentage;
      topicEntry.bestScore = Math.max(topicEntry.bestScore, percentage);
      if (!topicEntry.lastAttemptAt || new Date(attempt?.submittedAt || 0) > new Date(topicEntry.lastAttemptAt || 0)) {
        topicEntry.lastAttemptAt = attempt?.submittedAt || null;
      }
    });

    return Array.from(groupMap.values())
      .map((entry) => ({
        module: entry.module,
        attempts: entry.attempts,
        averageScore: clampPercent(entry.totalPct / entry.attempts),
        bestScore: entry.bestScore,
        lastAttemptAt: entry.lastAttemptAt,
        topics: Array.from(entry.topics.values())
          .map((topic) => ({
            topic: topic.topic,
            attempts: topic.attempts,
            averageScore: clampPercent(topic.totalPct / topic.attempts),
            bestScore: topic.bestScore,
            lastAttemptAt: topic.lastAttemptAt
          }))
          .sort((left, right) => {
            if (right.averageScore !== left.averageScore) return right.averageScore - left.averageScore;
            return left.topic.localeCompare(right.topic);
          })
      }))
      .sort((left, right) => {
        if (right.averageScore !== left.averageScore) return right.averageScore - left.averageScore;
        return left.module.localeCompare(right.module);
      });
  }, [filteredAttempts]);

  const recentAttempts = useMemo(() => (
    filteredAttempts
      .slice()
      .sort((left, right) => new Date(right?.submittedAt || 0) - new Date(left?.submittedAt || 0))
      .slice(0, 10)
      .map((attempt) => ({
        ...attempt,
        percentage: percentageFromAttempt(attempt)
      }))
  ), [filteredAttempts]);

  const bestModule = moduleGroups[0] || null;

  const quizTopicMeta = useMemo(() => {
    const moduleTopicsByName = {};
    const topics = new Set();
    const add = (moduleName, topicName) => {
      const mk = normalizeText(moduleName || 'General').toLowerCase();
      const tk = normalizeText(topicName || 'General');
      if (!moduleTopicsByName[mk]) moduleTopicsByName[mk] = new Set();
      moduleTopicsByName[mk].add(tk);
      topics.add(tk);
    };
    quizzes.forEach((q) => add(q?.module, q?.topic));
    quizAttempts.forEach((a) => add(a?.module, a?.topic));
    return {
      moduleTopicsByName,
      topicOptions: Array.from(topics).sort((a, b) => a.localeCompare(b))
    };
  }, [quizzes, quizAttempts]);

  const lbModuleOptions = useMemo(() => {
    const set = new Set([...lbApiModules]);
    quizzes.forEach((q) => set.add(normalizeText(q?.module || 'General')));
    quizAttempts.forEach((a) => set.add(normalizeText(a?.module || 'General')));
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [lbApiModules, quizzes, quizAttempts]);

  const filteredLb = useMemo(() => (
    lbRows.filter((entry) => {
      if (lbTopicFilter === 'all') return true;
      const mk = normalizeText(entry?.module || 'General').toLowerCase();
      const topicSet = quizTopicMeta.moduleTopicsByName[mk];
      return Boolean(topicSet && topicSet.has(lbTopicFilter));
    })
  ), [lbRows, lbTopicFilter, quizTopicMeta.moduleTopicsByName]);

  const lbChampion = filteredLb[0] || null;

  useEffect(() => {
    let cancelled = false;
    const activeModule = lbModuleFilter === 'all' ? '' : lbModuleFilter;
    setLbLoading(true);
    setLbError('');
    fetchQuizLeaderboard(activeModule)
      .then((data) => {
        if (cancelled) return;
        setLbRows(Array.isArray(data?.leaderboard) ? data.leaderboard : []);
        setLbApiModules(Array.isArray(data?.modules) ? data.modules : []);
      })
      .catch((error) => {
        if (!cancelled) setLbError(error?.message || 'Failed to load leaderboard.');
      })
      .finally(() => {
        if (!cancelled) setLbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lbModuleFilter, quizAttempts.length]);

  useEffect(() => {
    if (lbTopicFilter !== 'all' && !quizTopicMeta.topicOptions.includes(lbTopicFilter)) {
      setLbTopicFilter('all');
    }
  }, [lbTopicFilter, quizTopicMeta.topicOptions]);

  const navItems = [
    { id: 'quiz-performance-overview', label: 'Overview', icon: '✨' },
    { id: 'quiz-performance-leaderboard', label: 'Leaderboard', icon: '🏆' },
    { id: 'quiz-performance-modules', label: 'Modules', icon: '📚' },
    { id: 'quiz-performance-recent', label: 'Recent', icon: '🕒' }
  ];

  function handleNavClick(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const rootStyles = window.getComputedStyle(document.documentElement);
    const clearance = parseFloat(rootStyles.getPropertyValue('--app-shell-topbar-clearance')) || 96;
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - clearance - 12);
    window.scrollTo({ top, behavior: 'smooth' });
  }

  const showSkeleton = isLoading && !loadError;

  return (
    <AppShell
      title="Quiz Performance"
      subtitle="Module-wise and topic-wise quiz progress"
      roleLabel="Student"
      navTitle="Performance"
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
      <div className={`student-performance-page quiz-performance-page${showSkeleton ? ' is-loading' : ''}`}>
        {loadError ? <p className="inline-message error">{loadError.message || 'Failed to load quiz performance.'}</p> : null}
        {showSkeleton ? (
          <div className="performance-skeleton-layout" aria-hidden="true">
            <section className="card performance-skeleton-card performance-skeleton-hero">
              <div className="skeleton-line large" />
              <div className="skeleton-line" />
              <div className="skeleton-line" style={{ width: '62%' }} />
            </section>
            <section className="performance-skeleton-grid">
              {Array.from({ length: 4 }).map((_, index) => (
                <article key={`perf-skel-${index}`} className="card performance-skeleton-card">
                  <div className="skeleton-line" />
                  <div className="skeleton-line large" style={{ width: '58%' }} />
                  <div className="skeleton-line" style={{ width: '72%' }} />
                </article>
              ))}
            </section>
          </div>
        ) : null}

        <section id="quiz-performance-overview" className="card performance-hero-card">
          <div>
            <p className="eyebrow">Quiz Analytics Board</p>
            <h2>Welcome {session?.username || 'Student'}</h2>
            <p className="subtitle">A cleaner workspace for checking module trends, topic depth, and your latest quiz momentum.</p>
          </div>
          <div className="performance-filter-row" role="group" aria-label="Quiz performance filters">
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
                {topicOptions.map((topic) => (
                  <option key={topic} value={topic}>{topic}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="performance-metrics-grid">
          <article className="card performance-stat-card">
            <span>Total Attempts</span>
            <strong>{summary.attempts}</strong>
            <small>Within the current filter selection</small>
          </article>
          <article className="card performance-stat-card">
            <span>Average Score</span>
            <strong>{summary.averageScore}%</strong>
            <small>Across your selected quiz attempts</small>
          </article>
          <article className="card performance-stat-card">
            <span>Best Score</span>
            <strong>{summary.bestScore}%</strong>
            <small>Your strongest quiz result in view</small>
          </article>
          <article className="card performance-stat-card">
            <span>Coverage</span>
            <strong>{summary.modulesCovered} modules</strong>
            <small>{summary.topicsCovered} topic tracks covered</small>
          </article>
        </section>

        <section className="performance-spotlight-grid">
          <article className="card performance-spotlight-card">
            <p className="eyebrow">Best Module Right Now</p>
            <h3>{bestModule?.module || 'No data yet'}</h3>
            <p className="subtitle">
              {bestModule
                ? `${bestModule.averageScore}% average across ${bestModule.attempts} quiz${bestModule.attempts === 1 ? '' : 'zes'}`
                : 'Attempt more quizzes to unlock your top module spotlight.'}
            </p>
          </article>
          <article className="card performance-spotlight-card accent">
            <p className="eyebrow">Latest Activity</p>
            <h3>{summary.lastAttemptAt ? formatDateTime(summary.lastAttemptAt) : 'No recent attempts'}</h3>
            <p className="subtitle">Your most recent quiz submission timestamp in this board.</p>
          </article>
        </section>

        <section id="quiz-performance-leaderboard" className="card performance-leaderboard-integrated">
          <div className="performance-leaderboard-integrated-head">
            <div>
              <p className="eyebrow">Course quiz leaderboard</p>
              <h3>How you rank among peers</h3>
              <p className="subtitle">Based on each learner’s best quiz attempt in your enrolled course. Filter by module or topic to narrow the board.</p>
            </div>
          </div>
          <div className="performance-leaderboard-filters quiz-filter-bar" role="group" aria-label="Quiz leaderboard filters">
            <span className="quiz-filter-icon" aria-hidden="true">🏅</span>
            <label className="quiz-filter-field">
              Module
              <select
                value={lbModuleFilter}
                onChange={(event) => setLbModuleFilter(event.target.value)}
              >
                <option value="all">All modules</option>
                {lbModuleOptions.map((moduleName) => (
                  <option key={`lb-mod-${moduleName}`} value={moduleName}>{moduleName}</option>
                ))}
              </select>
            </label>
            <label className="quiz-filter-field">
              Topic
              <select
                value={lbTopicFilter}
                onChange={(event) => setLbTopicFilter(event.target.value)}
              >
                <option value="all">All topics</option>
                {quizTopicMeta.topicOptions.map((topic) => (
                  <option key={`lb-topic-${topic}`} value={topic}>{topic}</option>
                ))}
              </select>
            </label>
          </div>
          {lbLoading ? <p className="empty-note">Loading leaderboard…</p> : null}
          {!lbLoading && lbError ? <p className="inline-message error">{lbError}</p> : null}
          {!lbLoading && !lbError ? (
            filteredLb.length ? (
              <div className="performance-leaderboard-body">
                {lbChampion ? (
                  <article className="leaderboard-champion-card">
                    <span className="leaderboard-crown" aria-hidden="true">👑</span>
                    <div>
                      <p className="leaderboard-champion-label">Top score (this view)</p>
                      <h3>{lbChampion.username}</h3>
                      <p className="leaderboard-champion-meta">
                        {lbChampion.module || 'General'} • {lbChampion.score || 0}/{lbChampion.total || 0} ({safePercent(lbChampion.percentage)}%)
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
                        <th>Module</th>
                        <th>Best score</th>
                        <th>Attempts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLb.map((entry, index) => (
                        <tr
                          key={`${entry.username || 'u'}-${entry.module || 'm'}-${entry.rank || index + 1}`}
                          className={entry.rank === 1 ? 'leaderboard-row-top' : ''}
                        >
                          <td>#{entry.rank || index + 1}</td>
                          <td>{entry.username || '—'}</td>
                          <td>{entry.module || 'General'}</td>
                          <td>{entry.score || 0}/{entry.total || 0} ({safePercent(entry.percentage)}%)</td>
                          <td>{entry.attemptsCount ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="empty-note">No leaderboard rows for this filter. Try All modules / All topics.</p>
            )
          ) : null}
        </section>

        <section id="quiz-performance-modules" className="performance-module-grid">
          {moduleGroups.length ? moduleGroups.map((moduleEntry) => (
            <article key={moduleEntry.module} className="card performance-module-card">
              <div className="performance-module-head">
                <div>
                  <p className="eyebrow">Module</p>
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
              <h3>No quiz attempts match this filter yet</h3>
              <p className="subtitle">Try switching the module, topic, or time range to see your organized quiz results.</p>
            </article>
          )}
        </section>

        <section id="quiz-performance-recent" className="card performance-timeline-card">
          <div className="performance-section-head">
            <div>
              <p className="eyebrow">Recent Attempts</p>
              <h3>Latest quiz submissions</h3>
            </div>
          </div>
          {recentAttempts.length ? (
            <div className="performance-timeline-list">
              {recentAttempts.map((attempt, index) => (
                <article key={`${attempt?._id || 'attempt'}-${index}`} className="performance-timeline-item">
                  <div>
                    <strong>{normalizeText(attempt?.course || attempt?.category || 'Course')} • {normalizeText(attempt?.batch || 'No Batch')} • {normalizeText(attempt?.module || 'General')} • {normalizeText(attempt?.topic || 'General')}</strong>
                    <small>{formatDateTime(attempt?.submittedAt)}</small>
                  </div>
                  <div className="performance-score-pill">
                    {Number(attempt?.score || 0)}/{Number(attempt?.total || 0)} • {attempt.percentage}%
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-note">No recent attempts available in the current filters.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}