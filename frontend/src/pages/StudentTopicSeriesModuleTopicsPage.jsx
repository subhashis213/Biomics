import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { requestJson } from '../api';

function normalizeText(value) {
  return String(value || '').trim();
}

function groupByTopic(tests = []) {
  const topicMap = new Map();
  tests.forEach((test) => {
    const topicName = normalizeText(test?.topic) || 'General';
    if (!topicMap.has(topicName)) {
      topicMap.set(topicName, {
        topicName,
        tests: []
      });
    }
    topicMap.get(topicName).tests.push(test);
  });

  return Array.from(topicMap.values())
    .sort((left, right) => left.topicName.localeCompare(right.topicName));
}

export default function StudentTopicSeriesModuleTopicsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { moduleName } = useParams();

  const resolvedModuleName = decodeURIComponent(String(moduleName || '').trim());
  const requestedCourse = useMemo(
    () => String(new URLSearchParams(location.search).get('course') || '').trim(),
    [location.search]
  );

  const [course, setCourse] = useState('');
  const [tests, setTests] = useState([]);
  const [hasTopicTest, setHasTopicTest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const topicEntries = useMemo(() => groupByTopic(tests), [tests]);

  useEffect(() => {
    let cancelled = false;

    async function loadTopicBuckets() {
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

        const allTests = Array.isArray(testsResponse?.tests) ? testsResponse.tests : [];
        const filtered = allTests.filter((test) => normalizeText(test?.module) === resolvedModuleName);
        setTests(filtered);
      } catch (error) {
        if (cancelled) return;
        setTests([]);
        setMessage(error.message || 'Failed to load module topics.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTopicBuckets();
    return () => {
      cancelled = true;
    };
  }, [requestedCourse, resolvedModuleName]);

  return (
    <AppShell
      title="Module Topics"
      subtitle="Step 2: choose topic and start test"
      roleLabel="Student"
      showThemeSwitch
      actions={(
        <>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => navigate(`/student/test-series/topic-tests/modules?course=${encodeURIComponent(course || requestedCourse)}`)}
          >
            Back to Modules
          </button>
          <button type="button" className="secondary-btn" onClick={() => navigate('/student/my-courses')}>
            My Courses
          </button>
        </>
      )}
    >
      <main className="admin-workspace-page ts-series-topic-page">
        <section className="card ts-series-module-hero">
          <div>
            <p className="eyebrow">Premium Topic Series</p>
            <h2>{resolvedModuleName || 'Module'} Topics</h2>
            <p className="subtitle">All topics under this module are listed below. Open any test from a topic bucket.</p>
          </div>
        </section>

        {message ? <p className="inline-message error">{message}</p> : null}

        {loading ? (
          <div className="ts-loading-state">
            <div className="ts-loading-spinner" />
            <p>Loading topic buckets...</p>
          </div>
        ) : !hasTopicTest ? (
          <div className="ts-topic-empty-state">
            <span className="ts-topic-empty-icon">Locked</span>
            <p>Topic Test Series is not unlocked for this course yet.</p>
            <button type="button" className="primary-btn" onClick={() => navigate('/student/test-series/purchase?plan=topic_test')}>
              Purchase Topic Series
            </button>
          </div>
        ) : !topicEntries.length ? (
          <div className="ts-topic-empty-state">
            <span className="ts-topic-empty-icon">Empty</span>
            <p>No topics are available in this module yet.</p>
          </div>
        ) : (
          <section className="card workspace-panel">
            <div className="ts-topic-focus-shell">
              <div className="ts-topic-focus-head">
                <div>
                  <p className="ts-topic-module-label">Selected Module</p>
                  <h4>{resolvedModuleName}</h4>
                  <p className="subtitle">{course ? `${course} Topic Series` : 'Topic Series'} · {topicEntries.length} topics</p>
                </div>
              </div>

              <div className="ts-topic-bucket-grid">
                {topicEntries.map((topicEntry) => (
                  <article key={topicEntry.topicName} className="ts-topic-bucket-card">
                    <header className="ts-topic-bucket-head">
                      <div>
                        <p className="ts-topic-bucket-label">Topic</p>
                        <h5>{topicEntry.topicName}</h5>
                      </div>
                      <span className="ts-topic-bucket-count">{topicEntry.tests.length} tests</span>
                    </header>

                    <div className="ts-topic-test-list standalone">
                      {topicEntry.tests.map((test) => (
                        <article key={test._id} className="ts-topic-test-item">
                          <div className="ts-topic-test-copy">
                            <div className="ts-topic-test-topline">
                              <strong>{test.title}</strong>
                            </div>
                            <div className="ts-topic-test-meta">
                              <span>{test.durationMinutes || 30} min</span>
                              <span>{test.questionCount || 0} questions</span>
                              <span>{test.difficulty || 'medium'}</span>
                            </div>
                          </div>
                          <div className="ts-topic-test-actions">
                            <button
                              type="button"
                              className="primary-btn"
                              onClick={() => navigate(`/student/test-series?tab=topic&course=${encodeURIComponent(course)}&topic=${encodeURIComponent(topicEntry.topicName)}&testId=${encodeURIComponent(test._id)}`)}
                            >
                              Start Test
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
