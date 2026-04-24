import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { requestJson } from '../api';

function normalizeText(value) {
  return String(value || '').trim();
}

function groupByModule(tests = []) {
  const moduleMap = new Map();
  tests.forEach((test) => {
    const moduleName = normalizeText(test?.module) || 'General';
    const topicName = normalizeText(test?.topic) || 'General';
    if (!moduleMap.has(moduleName)) {
      moduleMap.set(moduleName, {
        moduleName,
        topics: new Set(),
        tests: []
      });
    }
    const moduleEntry = moduleMap.get(moduleName);
    moduleEntry.tests.push(test);
    moduleEntry.topics.add(topicName);
  });

  return Array.from(moduleMap.values())
    .map((entry) => ({
      ...entry,
      topicCount: entry.topics.size,
      testCount: entry.tests.length
    }))
    .sort((left, right) => left.moduleName.localeCompare(right.moduleName));
}

export default function StudentTopicSeriesModulesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [course, setCourse] = useState('');
  const [tests, setTests] = useState([]);
  const [hasTopicTest, setHasTopicTest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const requestedCourse = useMemo(
    () => String(new URLSearchParams(location.search).get('course') || '').trim(),
    [location.search]
  );

  const moduleEntries = useMemo(() => groupByModule(tests), [tests]);

  useEffect(() => {
    let cancelled = false;

    async function loadModuleCatalog() {
      setLoading(true);
      setMessage('');
      try {
        const pricingEndpoint = requestedCourse
          ? `/test-series/pricing/student?course=${encodeURIComponent(requestedCourse)}`
          : '/test-series/pricing/student';
        const accessResponse = await requestJson(pricingEndpoint);
        if (cancelled) return;

        const access = accessResponse?.access || {};
        const resolvedCourse = String(accessResponse?.course || requestedCourse || '').trim();
        setCourse(resolvedCourse);
        setHasTopicTest(Boolean(access.hasTopicTest));

        if (!access.hasTopicTest) {
          setTests([]);
          return;
        }

        const testEndpoint = resolvedCourse
          ? `/test-series/topic-tests/student?course=${encodeURIComponent(resolvedCourse)}`
          : '/test-series/topic-tests/student';
        const testsResponse = await requestJson(testEndpoint);
        if (cancelled) return;
        setTests(Array.isArray(testsResponse?.tests) ? testsResponse.tests : []);
      } catch (error) {
        if (cancelled) return;
        setTests([]);
        setMessage(error.message || 'Failed to load module-wise topic tests.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadModuleCatalog();
    return () => {
      cancelled = true;
    };
  }, [requestedCourse]);

  return (
    <AppShell
      title="Start Topic Series"
      subtitle="Step 1: choose a module"
      roleLabel="Student"
      showThemeSwitch
      actions={(
        <>
          <button type="button" className="secondary-btn" onClick={() => navigate('/student/my-courses')}>
            Back to My Courses
          </button>
          <button type="button" className="secondary-btn" onClick={() => navigate('/student/test-series')}>
            Test Series Hub
          </button>
        </>
      )}
    >
      <main className="admin-workspace-page ts-series-module-page">
        <section className="card ts-series-module-hero">
          <div>
            <p className="eyebrow">Premium Topic Series</p>
            <h2>{course ? `${course} Module Wise Tests` : 'Module Wise Tests'}</h2>
            <p className="subtitle">Open a module to view all its topic buckets on the next dedicated page.</p>
          </div>
        </section>

        {message ? <p className="inline-message error">{message}</p> : null}

        {loading ? (
          <div className="ts-loading-state">
            <div className="ts-loading-spinner" />
            <p>Loading module-wise tests...</p>
          </div>
        ) : !hasTopicTest ? (
          <div className="ts-topic-empty-state">
            <span className="ts-topic-empty-icon">Locked</span>
            <p>Topic Test Series is not unlocked for this course yet.</p>
            <button type="button" className="primary-btn" onClick={() => navigate('/student/test-series/purchase?plan=topic_test')}>
              Purchase Topic Series
            </button>
          </div>
        ) : !moduleEntries.length ? (
          <div className="ts-topic-empty-state">
            <span className="ts-topic-empty-icon">Empty</span>
            <p>No topic tests are published for this course yet.</p>
          </div>
        ) : (
          <section className="card workspace-panel">
            <div className="ts-topic-summary-strip">
              <article className="ts-topic-summary-card">
                <span>Modules</span>
                <strong>{moduleEntries.length}</strong>
              </article>
              <article className="ts-topic-summary-card">
                <span>Topics</span>
                <strong>{moduleEntries.reduce((sum, item) => sum + item.topicCount, 0)}</strong>
              </article>
              <article className="ts-topic-summary-card">
                <span>Tests</span>
                <strong>{moduleEntries.reduce((sum, item) => sum + item.testCount, 0)}</strong>
              </article>
            </div>

            <div className="ts-topic-module-grid">
              {moduleEntries.map((moduleEntry) => (
                <button
                  key={moduleEntry.moduleName}
                  type="button"
                  className="ts-topic-module-card ts-topic-module-button"
                  onClick={() => navigate(`/student/test-series/topic-tests/module/${encodeURIComponent(moduleEntry.moduleName)}?course=${encodeURIComponent(course)}`)}
                >
                  <header className="ts-topic-module-head">
                    <div>
                      <p className="ts-topic-module-label">Module</p>
                      <h4>{moduleEntry.moduleName}</h4>
                    </div>
                    <div className="ts-topic-module-meta">
                      <span>{moduleEntry.topicCount} topics</span>
                      <span>{moduleEntry.testCount} tests</span>
                    </div>
                  </header>
                  <p className="ts-topic-module-description">Open this module to view every topic in a dedicated premium page.</p>
                  <span className="ts-topic-open-link">Open Topics</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
