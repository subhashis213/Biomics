import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestJson } from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import useAutoDismissMessage from '../hooks/useAutoDismissMessage';

const COURSE_CATEGORIES = [
  '11th', '12th', 'NEET', 'IIT-JAM', 'CSIR-NET Life Science', 'GATE'
];

function rupees(paise) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function AdminTestSeriesHubPage() {
  const navigate = useNavigate();
  const [topicTestCount, setTopicTestCount] = useState(0);
  const [fullMockCount, setFullMockCount] = useState(0);
  const [pricing, setPricing] = useState([]);
  const [priceForm, setPriceForm] = useState({});
  const [banner, setBanner] = useState(null);
  const [savingCourse, setSavingCourse] = useState('');

  useAutoDismissMessage(banner, setBanner);

  async function loadCounts() {
    try {
      const [topicRes, mockRes] = await Promise.all([
        requestJson('/test-series/topic-tests/admin'),
        requestJson('/test-series/full-mocks/admin')
      ]);
      setTopicTestCount(Array.isArray(topicRes?.tests) ? topicRes.tests.length : 0);
      setFullMockCount(Array.isArray(mockRes?.mocks) ? mockRes.mocks.length : 0);
    } catch {
      // counts are cosmetic
    }
  }

  async function loadPricing() {
    try {
      const res = await requestJson('/test-series/pricing/admin');
      const list = Array.isArray(res?.pricing) ? res.pricing : [];
      setPricing(list);
      const form = {};
      list.forEach((entry) => {
        form[entry.category] = {
          topicTest: String(Number(entry.topicTestPriceInPaise || 0) / 100),
          fullMock: String(Number(entry.fullMockPriceInPaise || 0) / 100),
          active: entry.active !== false
        };
      });
      COURSE_CATEGORIES.forEach((cat) => {
        if (!form[cat]) {
          form[cat] = { topicTest: '0', fullMock: '0', active: true };
        }
      });
      setPriceForm(form);
    } catch {
      setBanner({ type: 'error', text: 'Failed to load test series pricing.' });
    }
  }

  useEffect(() => {
    loadCounts();
    loadPricing();
  }, []);

  function updatePriceField(course, field, value) {
    setPriceForm((prev) => ({
      ...prev,
      [course]: { ...prev[course], [field]: value }
    }));
  }

  async function handleSavePrice(course) {
    const form = priceForm[course];
    if (!form) return;
    const topicTestPriceInPaise = Math.max(0, Math.round(Number(form.topicTest || 0) * 100));
    const fullMockPriceInPaise = Math.max(0, Math.round(Number(form.fullMock || 0) * 100));

    setSavingCourse(course);
    try {
      await requestJson('/test-series/pricing', {
        method: 'POST',
        body: JSON.stringify({ category: course, topicTestPriceInPaise, fullMockPriceInPaise, active: form.active })
      });
      setBanner({ type: 'success', text: `${course} pricing saved.` });
      await loadPricing();
    } catch (e) {
      setBanner({ type: 'error', text: e.message || 'Failed to save pricing.' });
    } finally {
      setSavingCourse('');
    }
  }

  return (
    <AppShell
      title="Test Series Workspace"
      subtitle="Manage topic-wise and full-length test series for all courses"
      roleLabel="Admin"
      showThemeSwitch
      actions={(
        <button type="button" className="secondary-btn" onClick={() => navigate('/admin')}>
          ← Back to Dashboard
        </button>
      )}
    >
      <main className="admin-workspace-page">
        {/* ── hero ── */}
        <section className="workspace-hero workspace-hero-testseries">
          <div>
            <p className="eyebrow">Test Series</p>
            <h2>Topic-wise &amp; Full-length assessment suite</h2>
            <p className="subtitle">
              Test Series is sold separately from Pro/Elite plans. Students purchase either the
              Topic Test Series, Full Mock Series, or both.
            </p>
          </div>
          <div className="workspace-hero-stats">
            <StatCard label="Topic Tests" value={topicTestCount} />
            <StatCard label="Full Mocks" value={fullMockCount} />
          </div>
        </section>

        {banner ? <p className={`inline-message page-banner ${banner.type}`}>{banner.text}</p> : null}

        {/* ── two builder cards ── */}
        <section className="ts-hub-grid">
          {/* Card 1 — Topic Test Series */}
          <article className="card ts-hub-card ts-hub-card-topic">
            <div className="ts-hub-card-icon" aria-hidden="true">📖</div>
            <div className="ts-hub-card-body">
              <p className="eyebrow">Module / Topic-wise</p>
              <h3>Topic Test Series Builder</h3>
              <p className="subtitle">
                Create module and topic-specific tests. Students who purchase the Topic Test Series
                get these tests <em>plus</em> all Full Mock Tests as a bonus.
              </p>
              <ul className="ts-hub-feature-list">
                <li>Organise tests by Course → Module → Topic</li>
                <li>Set difficulty and time limit per test</li>
                <li>Questions with 4 options and explanation</li>
              </ul>
            </div>
            <div className="ts-hub-card-action">
              <button
                type="button"
                className="primary-btn"
                onClick={() => navigate('/admin/test-series/topic-tests')}
              >
                Open Topic Test Builder →
              </button>
            </div>
          </article>

          {/* Card 2 — Full Mock Test */}
          <article className="card ts-hub-card ts-hub-card-mock">
            <div className="ts-hub-card-icon" aria-hidden="true">🗒️</div>
            <div className="ts-hub-card-body">
              <p className="eyebrow">Full Length</p>
              <h3>Full Mock Test Builder</h3>
              <p className="subtitle">
                Build comprehensive full-length on-demand mock tests per course.
                Students who purchase only the Mock Test Series can access these tests.
              </p>
              <ul className="ts-hub-feature-list">
                <li>Select course from dropdown and add questions</li>
                <li>On-demand (not time-scheduled)</li>
                <li>Detailed answer review after submission</li>
              </ul>
            </div>
            <div className="ts-hub-card-action">
              <button
                type="button"
                className="primary-btn"
                onClick={() => navigate('/admin/test-series/full-mocks')}
              >
                Open Full Mock Builder →
              </button>
            </div>
          </article>
        </section>

        {/* ── Pricing Section ── */}
        <section className="card workspace-panel ts-pricing-section">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Test Series Pricing</p>
              <h3>Set prices per course</h3>
              <p className="subtitle">
                These prices are completely independent of Pro/Elite plan pricing.
                Set ₹0 to make test series free.
              </p>
            </div>
          </div>

          <div className="ts-pricing-notice">
            <span className="ts-pricing-badge badge-topic">Topic Test Purchase</span>
            <span className="ts-pricing-sep">→</span>
            <span>Topic Tests + Full Mocks (complementary)</span>
            <span className="ts-pricing-divider" />
            <span className="ts-pricing-badge badge-mock">Full Mock Only Purchase</span>
            <span className="ts-pricing-sep">→</span>
            <span>Full Mock Tests only</span>
          </div>

          <div className="ts-pricing-grid">
            {COURSE_CATEGORIES.map((course) => {
              const form = priceForm[course] || {};
              const isSaving = savingCourse === course;
              return (
                <article key={course} className="ts-pricing-row card">
                  <div className="ts-pricing-row-head">
                    <strong>{course}</strong>
                  </div>
                  <div className="ts-pricing-inputs">
                    <label>
                      Topic Test Series (₹)
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.topicTest || '0'}
                        onChange={(e) => updatePriceField(course, 'topicTest', e.target.value)}
                      />
                    </label>
                    <label>
                      Full Mock Series (₹)
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.fullMock || '0'}
                        onChange={(e) => updatePriceField(course, 'fullMock', e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="ts-pricing-row-footer">
                    <span className="ts-pricing-preview">
                      Combined: {rupees(Math.round(Number(form.topicTest || 0) * 100) + Math.round(Number(form.fullMock || 0) * 100))}
                    </span>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => handleSavePrice(course)}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving…' : 'Save Pricing'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
