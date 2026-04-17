import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { requestJson } from '../api';
import AppShell from '../components/AppShell';
import TopicTestCatalogBoard from '../components/TopicTestCatalogBoard';

export default function StudentTopicTestCatalogPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [tests, setTests] = useState([]);
  const [course, setCourse] = useState('');
  const [hasTopicTest, setHasTopicTest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearchText(String(params.get('topic') || '').trim());
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      setLoading(true);
      setMessage('');
      try {
        const accessResponse = await requestJson('/test-series/pricing/student');
        if (cancelled) return;
        const access = accessResponse?.access || {};
        setCourse(accessResponse?.course || '');
        setHasTopicTest(Boolean(access.hasTopicTest));

        if (!access.hasTopicTest) {
          setTests([]);
          return;
        }

        const testsResponse = await requestJson('/test-series/topic-tests/student');
        if (cancelled) return;
        setTests(Array.isArray(testsResponse?.tests) ? testsResponse.tests : []);
      } catch (error) {
        if (cancelled) return;
        setTests([]);
        setMessage(error.message || 'Failed to load topic test organizer.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCatalog();
    return () => { cancelled = true; };
  }, []);

  return (
    <AppShell
      title="Topic Test Organizer"
      subtitle="Choose a module, open a topic bucket, and jump into the right test faster"
      roleLabel="Student"
      showThemeSwitch
      actions={(
        <button type="button" className="secondary-btn" onClick={() => navigate('/student/test-series')}>
          Back to Test Series
        </button>
      )}
    >
      <main className="admin-workspace-page">
        <section className="workspace-hero workspace-hero-testseries">
          <div>
            <p className="eyebrow">Student Organizer</p>
            <h2>Pick tests from clear module and topic sections</h2>
            <p className="subtitle">Use the organized layout to find the exact test you want before starting.</p>
          </div>
        </section>

        <section className="card workspace-panel">
          {message ? <p className="inline-message error">{message}</p> : null}

          {loading ? (
            <div className="ts-loading-state">
              <div className="ts-loading-spinner" />
              <p>Loading your topic tests...</p>
            </div>
          ) : !hasTopicTest ? (
            <div className="ts-topic-empty-state">
              <span className="ts-topic-empty-icon">Locked</span>
              <p>Topic Test Series is not unlocked for your account yet.</p>
              <button type="button" className="primary-btn" onClick={() => navigate('/student/test-series')}>
                Go to Purchase Page
              </button>
            </div>
          ) : (
            <TopicTestCatalogBoard
              tests={tests}
              mode="student"
              title={course ? `${course} topic tests` : 'Your topic tests'}
              subtitle="Module cards contain separate topic containers so you can pick the right test quickly."
              emptyMessage="No topic tests are available right now."
              searchValue={searchText}
              onSearchChange={setSearchText}
              renderCardActions={(test) => (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => navigate(`/student/test-series?tab=topic&topic=${encodeURIComponent(test.topic || '')}&testId=${encodeURIComponent(test._id)}`)}
                >
                  Attend Test
                </button>
              )}
            />
          )}
        </section>
      </main>
    </AppShell>
  );
}