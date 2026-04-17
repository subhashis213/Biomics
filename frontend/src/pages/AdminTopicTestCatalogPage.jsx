import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { requestJson } from '../api';
import AppShell from '../components/AppShell';
import TopicTestCatalogBoard from '../components/TopicTestCatalogBoard';

const COURSE_CATEGORIES = [
  '11th', '12th', 'NEET', 'IIT-JAM', 'CSIR-NET Life Science', 'GATE'
];
const DEFAULT_COURSE = 'CSIR-NET Life Science';

export default function AdminTopicTestCatalogPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [category, setCategory] = useState(DEFAULT_COURSE);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const categoryFromQuery = params.get('category');
    if (categoryFromQuery && COURSE_CATEGORIES.includes(categoryFromQuery)) {
      setCategory(categoryFromQuery);
    }
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      setLoading(true);
      setMessage('');
      try {
        const response = await requestJson(`/test-series/topic-tests/admin?category=${encodeURIComponent(category)}`);
        if (cancelled) return;
        setTests(Array.isArray(response?.tests) ? response.tests : []);
      } catch (error) {
        if (cancelled) return;
        setTests([]);
        setMessage(error.message || 'Failed to load organized topic test view.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCatalog();
    return () => { cancelled = true; };
  }, [category]);

  return (
    <AppShell
      title="Topic Test Organizer"
      subtitle="Browse all published topic tests module-wise and topic-wise"
      roleLabel="Admin"
      showThemeSwitch
      actions={(
        <>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => navigate(`/admin/test-series/topic-tests?category=${encodeURIComponent(category)}`)}
          >
            Open Builder
          </button>
          <button type="button" className="secondary-btn" onClick={() => navigate('/admin/test-series')}>
            Back to Hub
          </button>
        </>
      )}
    >
      <main className="admin-workspace-page">
        <section className="workspace-hero workspace-hero-testseries">
          <div>
            <p className="eyebrow">Admin Organizer</p>
            <h2>See every test in clean module and topic containers</h2>
            <p className="subtitle">Switch courses, scan structure faster, and jump back to the builder for edits.</p>
          </div>
        </section>

        <section className="card workspace-panel">
          <div className="workspace-row-two ts-topic-filter-row">
            <label>
              Course
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {COURSE_CATEGORIES.map((course) => (
                  <option key={course} value={course}>{course}</option>
                ))}
              </select>
            </label>
          </div>

          {message ? <p className="inline-message error">{message}</p> : null}
          {loading ? (
            <div className="ts-loading-state">
              <div className="ts-loading-spinner" />
              <p>Loading organized topic tests...</p>
            </div>
          ) : (
            <TopicTestCatalogBoard
              tests={tests}
              mode="admin"
              title={`${category} topic tests`}
              subtitle="Each module contains topic buckets so the publish data stays readable."
              emptyMessage={`No topic tests published for ${category} yet.`}
              renderCardActions={(test) => (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => navigate(`/admin/test-series/topic-tests?category=${encodeURIComponent(category)}&edit=${encodeURIComponent(test._id)}`)}
                >
                  Edit Test
                </button>
              )}
            />
          )}
        </section>
      </main>
    </AppShell>
  );
}