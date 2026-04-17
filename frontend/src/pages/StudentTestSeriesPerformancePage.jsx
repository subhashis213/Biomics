import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { fetchTestSeriesPerformanceStudent } from '../api';
import { useSessionStore } from '../stores/sessionStore';

function formatDateTime(value) {
  if (!value) return 'No attempts yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No attempts yet';
  return date.toLocaleString();
}

export default function StudentTestSeriesPerformancePage() {
  const navigate = useNavigate();
  const { session } = useSessionStore();
  const [performance, setPerformance] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

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

  const summary = performance?.summary || {
    topicTests: { attempts: 0, averageScore: 0, bestScore: 0, lastAttemptAt: null, modulesCovered: 0, topicsCovered: 0 },
    fullMocks: { attempts: 0, averageScore: 0, bestScore: 0, lastAttemptAt: null }
  };
  const access = performance?.access || { hasTopicTest: false, hasFullMock: false };
  const modulePerformance = performance?.modulePerformance || [];
  const fullMockPerformance = performance?.fullMockPerformance || [];
  const recentTopicAttempts = performance?.recentTopicAttempts || [];
  const recentFullMockAttempts = performance?.recentFullMockAttempts || [];

  const totalSeriesAttempts = useMemo(() => (
    Number(summary.topicTests?.attempts || 0) + Number(summary.fullMocks?.attempts || 0)
  ), [summary.fullMocks?.attempts, summary.topicTests?.attempts]);

  const navItems = [
    { id: 'series-performance-overview', label: 'Overview', icon: '✨' },
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

        <section id="series-performance-topic-tests" className="performance-module-grid">
          {access.hasTopicTest ? (
            modulePerformance.length ? modulePerformance.map((moduleEntry) => (
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
                <h3>No topic test attempts yet</h3>
                <p className="subtitle">Your module-wise and topic-wise breakdown will appear here after you start attempting topic tests.</p>
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
            fullMockPerformance.length ? fullMockPerformance.map((item) => (
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
                <h3>No full mock attempts yet</h3>
                <p className="subtitle">Once you complete a full mock, this page will show separate result cards here.</p>
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
            {recentTopicAttempts.length ? (
              <div className="performance-timeline-list">
                {recentTopicAttempts.map((attempt) => (
                  <article key={attempt._id} className="performance-timeline-item">
                    <div>
                      <strong>{attempt.module} • {attempt.topic}</strong>
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
            {recentFullMockAttempts.length ? (
              <div className="performance-timeline-list">
                {recentFullMockAttempts.map((attempt) => (
                  <article key={attempt._id} className="performance-timeline-item">
                    <div>
                      <strong>{attempt.title}</strong>
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