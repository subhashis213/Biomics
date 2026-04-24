import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchCoursesAdmin, requestJson } from '../api';
import AppShell from '../components/AppShell';
import TopicTestCatalogBoard from '../components/TopicTestCatalogBoard';

// course list loaded from server

export default function AdminTopicTestCatalogPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [courses, setCourses] = useState([]);
  const [category, setCategory] = useState('');
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let ignore = false;
    async function loadCourses() {
      try {
        const res = await fetchCoursesAdmin();
        if (ignore) return;
        const courseList = Array.isArray(res?.courses) ? res.courses : [];
        setCourses(courseList);
        const params = new URLSearchParams(location.search);
        const categoryFromQuery = params.get('category');
        if (categoryFromQuery && courseList.some((c) => c.name === categoryFromQuery)) {
          setCategory(categoryFromQuery);
        } else if (!category && courseList.length) {
          setCategory(courseList[0].name);
        }
      } catch {
        if (!ignore) setCourses([]);
      }
    }
    loadCourses();
    return () => { ignore = true; };
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
                {courses.length === 0 ? <option value="">Loading courses...</option> : null}
                {courses.map((c) => (
                  <option key={c.name} value={c.name}>{c.displayName || c.name}</option>
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