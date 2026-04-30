import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestJson, resolveApiAssetUrl, uploadTestSeriesPricingThumbnailAdmin, fetchCoursesAdmin, fetchTestSeriesAttemptFeedbackAdmin } from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import useAutoDismissMessage from '../hooks/useAutoDismissMessage';

// courses loaded from server

function rupees(paise) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function normalizeCourseKey(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveTestCourseName(test = {}) {
  return String(test?.category || test?.course || '').trim();
}

export default function AdminTestSeriesHubPage() {
  const navigate = useNavigate();
  const [topicTestCount, setTopicTestCount] = useState(0);
  const [fullMockCount, setFullMockCount] = useState(0);
  const [pricing, setPricing] = useState([]);
  const [priceForm, setPriceForm] = useState({});
  const [banner, setBanner] = useState(null);
  const [savingCourse, setSavingCourse] = useState('');
  const [uploadingCourse, setUploadingCourse] = useState('');
  const [courses, setCourses] = useState([]);
  const [attemptFeedbackSummary, setAttemptFeedbackSummary] = useState({ thumbsUp: 0, thumbsDown: 0, total: 0 });
  const [attemptFeedbackRows, setAttemptFeedbackRows] = useState([]);

  useAutoDismissMessage(banner, setBanner);

  async function loadCounts(validCourseSet = null) {
    try {
      const [topicRes, mockRes] = await Promise.all([
        requestJson('/test-series/topic-tests/admin'),
        requestJson('/test-series/full-mocks/admin')
      ]);
      const allTopicTests = Array.isArray(topicRes?.tests) ? topicRes.tests : [];
      const allFullMocks = Array.isArray(mockRes?.mocks) ? mockRes.mocks : [];

      if (validCourseSet instanceof Set && validCourseSet.size > 0) {
        setTopicTestCount(
          allTopicTests.filter((test) => validCourseSet.has(normalizeCourseKey(resolveTestCourseName(test)))).length
        );
        setFullMockCount(
          allFullMocks.filter((test) => validCourseSet.has(normalizeCourseKey(resolveTestCourseName(test)))).length
        );
      } else {
        setTopicTestCount(allTopicTests.length);
        setFullMockCount(allFullMocks.length);
      }
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
          topicTestMrp: String(Number(entry.topicTestMrpInPaise || 0) / 100),
          topicTestValidityDays: String(Number(entry.topicTestValidityDays || 60)),
          fullMock: String(Number(entry.fullMockPriceInPaise || 0) / 100),
          fullMockMrp: String(Number(entry.fullMockMrpInPaise || 0) / 100),
          fullMockValidityDays: String(Number(entry.fullMockValidityDays || 60)),
          active: entry.active !== false,
          thumbnailUrl: String(entry.thumbnailUrl || '').trim(),
          thumbnailName: String(entry.thumbnailName || '').trim()
        };
      });
      let validCourseSet = null;
      try {
        const courseRes = await fetchCoursesAdmin();
        const courseList = Array.isArray(courseRes?.courses)
          ? courseRes.courses.filter((entry) => entry?.active !== false && entry?.archived !== true)
          : [];
        setCourses(courseList);
        validCourseSet = new Set(
          courseList
            .map((entry) => normalizeCourseKey(entry?.name || entry))
            .filter(Boolean)
        );
        courseList.forEach((c) => {
          const cat = c.name || c;
          if (!form[cat]) {
            form[cat] = {
              topicTest: '0',
              topicTestMrp: '0',
              topicTestValidityDays: '60',
              fullMock: '0',
              fullMockMrp: '0',
              fullMockValidityDays: '60',
              active: true,
              thumbnailUrl: '',
              thumbnailName: ''
            };
          }
        });
      } catch {
        // ignore course fetch error; fall back to existing form
      }
      setPriceForm(form);
      await loadCounts(validCourseSet);
      try {
        const feedbackRes = await fetchTestSeriesAttemptFeedbackAdmin({ limit: 60 });
        setAttemptFeedbackSummary(feedbackRes?.summary || { thumbsUp: 0, thumbsDown: 0, total: 0 });
        setAttemptFeedbackRows(Array.isArray(feedbackRes?.feedback) ? feedbackRes.feedback : []);
      } catch {
        setAttemptFeedbackSummary({ thumbsUp: 0, thumbsDown: 0, total: 0 });
        setAttemptFeedbackRows([]);
      }
    } catch {
      setBanner({ type: 'error', text: 'Failed to load test series pricing.' });
    }
  }

  function formatFeedbackDate(value) {
    const dt = new Date(value || 0);
    if (Number.isNaN(dt.getTime())) return '--';
    return dt.toLocaleString();
  }

  useEffect(() => {
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
    const topicTestMrpInPaise = Math.max(topicTestPriceInPaise, Math.round(Number(form.topicTestMrp || 0) * 100));
    const topicTestValidityDays = Math.max(1, Math.floor(Number(form.topicTestValidityDays || 60)));
    const fullMockPriceInPaise = Math.max(0, Math.round(Number(form.fullMock || 0) * 100));
    const fullMockMrpInPaise = Math.max(fullMockPriceInPaise, Math.round(Number(form.fullMockMrp || 0) * 100));
    const fullMockValidityDays = Math.max(1, Math.floor(Number(form.fullMockValidityDays || 60)));

    setSavingCourse(course);
    try {
      await requestJson('/test-series/pricing', {
        method: 'POST',
        body: JSON.stringify({
          category: course,
          topicTestPriceInPaise,
          topicTestMrpInPaise,
          topicTestValidityDays,
          fullMockPriceInPaise,
          fullMockMrpInPaise,
          fullMockValidityDays,
          thumbnailUrl: String(form.thumbnailUrl || '').trim(),
          thumbnailName: String(form.thumbnailName || '').trim(),
          active: form.active
        })
      });
      setBanner({ type: 'success', text: `${course} pricing saved.` });
      await loadPricing();
    } catch (e) {
      setBanner({ type: 'error', text: e.message || 'Failed to save pricing.' });
    } finally {
      setSavingCourse('');
    }
  }

  async function handleThumbnailUpload(course, file) {
    if (!file) return;
    setUploadingCourse(course);
    try {
      const uploadRes = await uploadTestSeriesPricingThumbnailAdmin(file);
      setPriceForm((prev) => ({
        ...prev,
        [course]: {
          ...prev[course],
          thumbnailUrl: String(uploadRes?.thumbnailUrl || '').trim(),
          thumbnailName: String(uploadRes?.thumbnailName || file.name || '').trim()
        }
      }));
      setBanner({ type: 'success', text: `${course} thumbnail uploaded. Save pricing to publish.` });
    } catch (e) {
      setBanner({ type: 'error', text: e.message || 'Failed to upload thumbnail.' });
    } finally {
      setUploadingCourse('');
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
            <StatCard label="👍" value={attemptFeedbackSummary.thumbsUp || 0} />
            <StatCard label="👎" value={attemptFeedbackSummary.thumbsDown || 0} />
          </div>
        </section>

        {banner ? <p className={`inline-message page-banner ${banner.type}`}>{banner.text}</p> : null}

        <section className="card workspace-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Post Exam Feedback</p>
              <h3>Students who gave thumbs feedback</h3>
              <p className="subtitle">Track whether students marked the test experience as 👍 or 👎 after submission.</p>
            </div>
          </div>
          {!attemptFeedbackRows.length ? (
            <p className="empty-note">No post-exam feedback submitted yet.</p>
          ) : (
            <div className="module-pricing-scroll">
              <table className="module-pricing-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Type</th>
                    <th>Course</th>
                    <th>Test</th>
                    <th>Reaction</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {attemptFeedbackRows.map((row) => (
                    <tr key={`${row.attemptType}-${row._id}`}>
                      <td>{row.username || '--'}</td>
                      <td>{row.attemptType === 'topic' ? 'Topic Test' : 'Full Mock'}</td>
                      <td>{row.course || '--'}</td>
                      <td>{row.title || '--'}</td>
                      <td>{row.reaction === 'up' ? '👍' : '👎'}</td>
                      <td>{formatFeedbackDate(row.feedbackAt || row.submittedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

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
            {(courses.length ? courses.map((c) => c.name || c) : Object.keys(priceForm)).map((course) => {
              const form = priceForm[course] || {};
              const isSaving = savingCourse === course;
              const isUploading = uploadingCourse === course;
              const thumbnailUrl = resolveApiAssetUrl(form.thumbnailUrl || '');
              return (
                <article key={course} className="ts-pricing-row card">
                  <div className="ts-pricing-row-head">
                    <strong>{course}</strong>
                  </div>
                  <div className="ts-pricing-thumb-row">
                    <div className="ts-pricing-thumb-wrap">
                      {thumbnailUrl ? (
                        <img src={thumbnailUrl} alt={`${course} thumbnail`} className="ts-pricing-thumb" />
                      ) : (
                        <div className="ts-pricing-thumb ts-pricing-thumb-fallback">{course.slice(0, 2)}</div>
                      )}
                    </div>
                    <label className="secondary-btn ts-upload-btn">
                      {isUploading ? 'Uploading…' : 'Upload Thumbnail'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={isUploading}
                        onChange={(e) => {
                          const selected = e.target.files?.[0];
                          if (selected) {
                            handleThumbnailUpload(course, selected);
                          }
                          e.target.value = '';
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                  <div className="ts-pricing-inputs">
                    <label>
                      Topic Test Price (₹)
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.topicTest || '0'}
                        onChange={(e) => updatePriceField(course, 'topicTest', e.target.value)}
                      />
                    </label>
                    <label>
                      Topic Test MRP (₹)
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.topicTestMrp || '0'}
                        onChange={(e) => updatePriceField(course, 'topicTestMrp', e.target.value)}
                      />
                    </label>
                    <label>
                      Topic Test Validity (days)
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={form.topicTestValidityDays || '60'}
                        onChange={(e) => updatePriceField(course, 'topicTestValidityDays', e.target.value)}
                      />
                    </label>
                    <label>
                      Full Mock Price (₹)
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.fullMock || '0'}
                        onChange={(e) => updatePriceField(course, 'fullMock', e.target.value)}
                      />
                    </label>
                    <label>
                      Full Mock MRP (₹)
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.fullMockMrp || '0'}
                        onChange={(e) => updatePriceField(course, 'fullMockMrp', e.target.value)}
                      />
                    </label>
                    <label>
                      Full Mock Validity (days)
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={form.fullMockValidityDays || '60'}
                        onChange={(e) => updatePriceField(course, 'fullMockValidityDays', e.target.value)}
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
