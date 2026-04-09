import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestJson } from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import { useSessionStore } from '../stores/sessionStore';

function loadRazorpayCheckoutScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function rupees(paise) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
}

function difficultyColor(d) {
  if (d === 'easy') return '#16a34a';
  if (d === 'hard') return '#dc2626';
  return '#d97706';
}

const MOCK_TIMER_TICK = 1000;

export default function StudentTestSeriesPage() {
  const navigate = useNavigate();
  const { session } = useSessionStore();

  // access & pricing
  const [accessData, setAccessData] = useState(null);
  const [loadingAccess, setLoadingAccess] = useState(true);

  // lists
  const [topicTests, setTopicTests] = useState([]);
  const [fullMocks, setFullMocks] = useState([]);
  const [loadingTests, setLoadingTests] = useState(false);

  // active tab
  const [activeTab, setActiveTab] = useState('topic'); // 'topic' | 'mock'

  // payment
  const [purchasingType, setPurchasingType] = useState(''); // 'topic_test' | 'full_mock'
  const [banner, setBanner] = useState(null);

  // active test session: { type: 'topic'|'mock', test, questions, answers, startedAt, timeLeft, submitted, result }
  const [testSession, setTestSession] = useState(null);
  const timerRef = useRef(null);

  // ── load access & pricing ─────────────────────────────────────────────────

  async function loadAccess() {
    setLoadingAccess(true);
    try {
      const res = await requestJson('/test-series/pricing/student');
      setAccessData(res || null);
    } catch {
      setAccessData(null);
    } finally {
      setLoadingAccess(false);
    }
  }

  async function loadTests() {
    const access = accessData?.access;
    const jobs = [];
    if (access?.hasTopicTest) {
      jobs.push(
        requestJson('/test-series/topic-tests/student')
          .then((r) => setTopicTests(Array.isArray(r?.tests) ? r.tests : []))
          .catch(() => setTopicTests([]))
      );
    } else {
      setTopicTests([]);
    }
    if (access?.hasFullMock) {
      jobs.push(
        requestJson('/test-series/full-mocks/student')
          .then((r) => setFullMocks(Array.isArray(r?.mocks) ? r.mocks : []))
          .catch(() => setFullMocks([]))
      );
    } else {
      setFullMocks([]);
    }
    if (jobs.length) {
      setLoadingTests(true);
      await Promise.all(jobs);
      setLoadingTests(false);
    }
  }

  useEffect(() => { loadAccess(); }, []);
  useEffect(() => { if (accessData) loadTests(); }, [accessData]);

  // ── payment ───────────────────────────────────────────────────────────────

  async function handlePurchase(seriesType) {
    if (purchasingType) return;
    setPurchasingType(seriesType);
    setBanner(null);
    try {
      const orderRes = await requestJson('/test-series/payment/create-order', {
        method: 'POST',
        body: JSON.stringify({ seriesType })
      });

      if (orderRes?.alreadyOwned) {
        setBanner({ type: 'success', text: 'Already purchased — refreshing access.' });
        await loadAccess();
        return;
      }

      if (orderRes?.free) {
        setBanner({ type: 'success', text: 'Access granted (free)!' });
        await loadAccess();
        return;
      }

      const scriptReady = await loadRazorpayCheckoutScript();
      if (!scriptReady || !window.Razorpay) {
        throw new Error('Unable to load Razorpay checkout. Please try again.');
      }

      await new Promise((resolve, reject) => {
        let settled = false;
        let paymentHandlerStarted = false;

        const safeResolve = (v) => { if (!settled) { settled = true; resolve(v); } };
        const safeReject = (e) => { if (!settled) { settled = true; reject(e); } };

        const options = {
          key: orderRes.keyId,
          amount: orderRes.razorpayOrder?.amount,
          currency: orderRes.currency || 'INR',
          name: 'Biomics Hub',
          description: seriesType === 'topic_test' ? 'Topic Test Series' : 'Full Mock Test Series',
          order_id: orderRes.razorpayOrder?.id,
          handler: async (response) => {
            paymentHandlerStarted = true;
            try {
              await requestJson('/test-series/payment/verify', {
                method: 'POST',
                body: JSON.stringify({
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                  seriesType
                })
              });
              setBanner({ type: 'success', text: `${seriesType === 'topic_test' ? 'Topic Test Series' : 'Full Mock Series'} unlocked!` });
              await loadAccess();
              safeResolve({ status: 'paid' });
            } catch (verifyErr) {
              safeReject(new Error(verifyErr.message || 'Payment verification failed.'));
            }
          },
          prefill: { name: session?.username || '' },
          theme: { color: '#0f766e' },
          modal: {
            ondismiss: () => {
              window.setTimeout(() => {
                if (paymentHandlerStarted) return;
                setBanner({ type: 'error', text: 'Payment cancelled.' });
                safeResolve({ status: 'cancelled' });
              }, 450);
            }
          }
        };

        const rz = new window.Razorpay(options);
        rz.open();
      });
    } catch (err) {
      setBanner({ type: 'error', text: err.message || 'Failed to start payment.' });
    } finally {
      setPurchasingType('');
    }
  }

  // ── test session ──────────────────────────────────────────────────────────

  async function startTest(testId, type) {
    try {
      const endpoint = type === 'topic'
        ? `/test-series/topic-tests/student/${testId}`
        : `/test-series/full-mocks/student/${testId}`;
      const res = await requestJson(endpoint);
      const totalSeconds = (res.durationMinutes || 30) * 60;
      setTestSession({
        type,
        test: res,
        questions: res.questions || [],
        answers: new Array(res.questions?.length || 0).fill(-1),
        startedAt: Date.now(),
        timeLeft: totalSeconds,
        submitted: false,
        result: null
      });
    } catch (err) {
      setBanner({ type: 'error', text: err.message || 'Failed to load test.' });
    }
  }

  // timer
  useEffect(() => {
    if (!testSession || testSession.submitted) return undefined;
    timerRef.current = window.setInterval(() => {
      setTestSession((prev) => {
        if (!prev || prev.submitted) return prev;
        const next = prev.timeLeft - 1;
        if (next <= 0) {
          submitTest(prev);
          return { ...prev, timeLeft: 0 };
        }
        return { ...prev, timeLeft: next };
      });
    }, MOCK_TIMER_TICK);
    return () => window.clearInterval(timerRef.current);
  }, [testSession?.test?._id, testSession?.submitted]);

  async function submitTest(session = testSession) {
    if (!session || session.submitted) return;
    window.clearInterval(timerRef.current);
    const { test, type, answers } = session;
    try {
      const endpoint = type === 'topic'
        ? `/test-series/topic-tests/student/${test._id}/submit`
        : `/test-series/full-mocks/student/${test._id}/submit`;
      const result = await requestJson(endpoint, {
        method: 'POST',
        body: JSON.stringify({ answers })
      });
      setTestSession((prev) => prev ? { ...prev, submitted: true, result } : prev);
    } catch (err) {
      setBanner({ type: 'error', text: err.message || 'Failed to submit test.' });
    }
  }

  function exitTest() {
    window.clearInterval(timerRef.current);
    setTestSession(null);
  }

  // ── render: active test ───────────────────────────────────────────────────

  if (testSession) {
    const { test, questions, answers, timeLeft, submitted, result } = testSession;

    if (submitted && result) {
      return (
        <AppShell title="Test Result" roleLabel="Student" showThemeSwitch>
          <main className="admin-workspace-page">
            <section className="ts-result-hero card">
              <h2>{test.title}</h2>
              <div className="ts-result-score-row">
                <div className="ts-result-score-circle">
                  <span className="ts-result-score-pct">{result.percentage}%</span>
                </div>
                <div className="ts-result-score-details">
                  <p><strong>{result.score}</strong> / {result.total} correct</p>
                  <p className="subtitle">{test.durationMinutes} minute test</p>
                </div>
              </div>
              <button type="button" className="secondary-btn" onClick={exitTest}>← Back to Test Series</button>
            </section>

            <section className="card workspace-panel">
              <h3 className="ts-review-heading">Answer Review</h3>
              {result.review.map((item, i) => (
                <article key={`rev-${i}`} className={`ts-review-item ${item.isCorrect ? 'correct' : 'incorrect'}`}>
                  <p className="ts-review-q"><span className="ts-review-num">Q{i + 1}</span> {item.question}</p>
                  <div className="ts-review-options">
                    {item.options.map((opt, oi) => (
                      <div
                        key={oi}
                        className={`ts-review-option${oi === item.correctIndex ? ' correct-opt' : ''}${oi === item.selectedIndex && !item.isCorrect ? ' wrong-opt' : ''}`}
                      >
                        <span className="ts-review-opt-marker">{['A', 'B', 'C', 'D'][oi]}</span>
                        {opt}
                      </div>
                    ))}
                  </div>
                  {item.explanation ? <p className="ts-review-explanation">💡 {item.explanation}</p> : null}
                </article>
              ))}
            </section>
          </main>
        </AppShell>
      );
    }

    const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
    const secs = String(timeLeft % 60).padStart(2, '0');
    const isUrgent = timeLeft < 120;

    return (
      <AppShell
        title={test.title}
        roleLabel="Student"
        showThemeSwitch
        actions={(
          <div className="ts-timer-topbar">
            <span className={`ts-timer-badge${isUrgent ? ' urgent' : ''}`}>⏱ {mins}:{secs}</span>
            <button type="button" className="danger-btn" onClick={() => submitTest()}>Submit Now</button>
          </div>
        )}
      >
        <main className="admin-workspace-page">
          <section className="ts-exam-header card">
            <p className="eyebrow">{test.category}{test.module ? ` · ${test.module}` : ''}{test.topic && test.topic !== 'General' ? ` · ${test.topic}` : ''}</p>
            <h2>{test.title}</h2>
            <p className="subtitle">{questions.length} questions · {test.durationMinutes} min</p>
          </section>

          <div className="ts-question-list">
            {questions.map((q, qi) => (
              <article key={`q-${qi}`} className="ts-question-card card">
                <p className="ts-question-num">Q{qi + 1}</p>
                <p className="ts-question-text">{q.question}</p>
                <div className="ts-options-grid">
                  {q.options.map((opt, oi) => (
                    <button
                      key={oi}
                      type="button"
                      className={`ts-option-btn${answers[qi] === oi ? ' selected' : ''}`}
                      onClick={() => setTestSession((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.answers];
                        next[qi] = oi;
                        return { ...prev, answers: next };
                      })}
                    >
                      <span className="ts-opt-label">{['A', 'B', 'C', 'D'][oi]}</span>
                      {opt}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="ts-submit-row">
            <button type="button" className="primary-btn large-btn" onClick={() => submitTest()}>
              Submit Test ({answers.filter((a) => a >= 0).length}/{questions.length} answered)
            </button>
          </div>
        </main>
      </AppShell>
    );
  }

  // ── render: main hub ──────────────────────────────────────────────────────

  const hasTopicTest = accessData?.access?.hasTopicTest;
  const hasFullMock = accessData?.access?.hasFullMock;
  const pricing = accessData?.pricing || {};
  const course = accessData?.course || '';

  return (
    <AppShell
      title="Test Series"
      subtitle="Topic tests and full-length mock exams — purchased separately"
      roleLabel="Student"
      showThemeSwitch
      actions={(
        <button type="button" className="secondary-btn" onClick={() => navigate('/student')}>
          ← Dashboard
        </button>
      )}
    >
      <main className="admin-workspace-page">
        {/* hero */}
        <section className="workspace-hero workspace-hero-testseries">
          <div>
            <p className="eyebrow">Test Series — {course || 'your course'}</p>
            <h2>Sharpen your exam preparation</h2>
            <p className="subtitle">Test Series is a separate premium add-on. Purchase the plan that fits your goals.</p>
          </div>
          <div className="workspace-hero-stats">
            <StatCard label="Topic Tests" value={topicTests.length} />
            <StatCard label="Full Mocks" value={fullMocks.length} />
          </div>
        </section>

        {banner ? <p className={`inline-message page-banner ${banner.type}`}>{banner.text}</p> : null}

        {loadingAccess ? (
          <p className="empty-note">Loading your access…</p>
        ) : (
          <>
            {/* ── purchase cards (if not owned) ── */}
            {(!hasTopicTest || !hasFullMock) ? (
              <section className="ts-purchase-grid">
                {!hasTopicTest ? (
                  <article className="card ts-purchase-card ts-purchase-topic">
                    <div className="ts-purchase-badge">📖 Topic Test Series</div>
                    <h3>Module / Topic-wise Tests</h3>
                    <p className="subtitle">Get access to all topic-specific tests for your course <strong>plus</strong> all Full Mocks as a bonus.</p>
                    <ul className="ts-hub-feature-list">
                      <li>Chapter and topic-level tests</li>
                      <li>Immediate result with answer review</li>
                      <li>Includes Full Mock Tests free</li>
                    </ul>
                    <div className="ts-purchase-price-row">
                      {pricing.topicTestPriceInPaise > 0 ? (
                        <span className="ts-purchase-price">{rupees(pricing.topicTestPriceInPaise)}</span>
                      ) : (
                        <span className="ts-purchase-price free">Free</span>
                      )}
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => handlePurchase('topic_test')}
                        disabled={Boolean(purchasingType)}
                      >
                        {purchasingType === 'topic_test' ? 'Processing…' : 'Buy Topic Test Series'}
                      </button>
                    </div>
                  </article>
                ) : (
                  <article className="card ts-purchase-card ts-owned-card">
                    <div className="ts-owned-badge">✅ Topic Test Series</div>
                    <p className="subtitle">You have access to all topic tests for {course}.</p>
                  </article>
                )}

                {!hasFullMock ? (
                  <article className="card ts-purchase-card ts-purchase-mock">
                    <div className="ts-purchase-badge">🗒️ Full Mock Series</div>
                    <h3>Full Length Mock Tests</h3>
                    <p className="subtitle">Get access to all full-length mock tests for your course only.</p>
                    <ul className="ts-hub-feature-list">
                      <li>Full-length exam simulation</li>
                      <li>Detailed answer review after submission</li>
                      <li>Unlimited attempts per test</li>
                    </ul>
                    <div className="ts-purchase-price-row">
                      {pricing.fullMockPriceInPaise > 0 ? (
                        <span className="ts-purchase-price">{rupees(pricing.fullMockPriceInPaise)}</span>
                      ) : (
                        <span className="ts-purchase-price free">Free</span>
                      )}
                      <button
                        type="button"
                        className="secondary-btn ts-mock-buy-btn"
                        onClick={() => handlePurchase('full_mock')}
                        disabled={Boolean(purchasingType)}
                      >
                        {purchasingType === 'full_mock' ? 'Processing…' : 'Buy Mock Series Only'}
                      </button>
                    </div>
                    <p className="ts-purchase-note">Note: Buying the Topic Test Series above includes Full Mocks free.</p>
                  </article>
                ) : (
                  !hasTopicTest ? (
                    <article className="card ts-purchase-card ts-owned-card">
                      <div className="ts-owned-badge">✅ Full Mock Series</div>
                      <p className="subtitle">You have access to full mock tests for {course}.</p>
                    </article>
                  ) : null
                )}
              </section>
            ) : null}

            {/* ── content tabs (only if any access) ── */}
            {(hasTopicTest || hasFullMock) ? (
              <>
                <div className="ts-tabs">
                  {hasTopicTest ? (
                    <button
                      type="button"
                      className={`ts-tab-btn${activeTab === 'topic' ? ' active' : ''}`}
                      onClick={() => setActiveTab('topic')}
                    >
                      📖 Topic Tests
                    </button>
                  ) : null}
                  {hasFullMock ? (
                    <button
                      type="button"
                      className={`ts-tab-btn${activeTab === 'mock' ? ' active' : ''}`}
                      onClick={() => setActiveTab('mock')}
                    >
                      🗒️ Full Mock Tests
                    </button>
                  ) : null}
                </div>

                {loadingTests ? (
                  <p className="empty-note">Loading tests…</p>
                ) : null}

                {/* Topic Tests tab */}
                {activeTab === 'topic' && hasTopicTest && !loadingTests ? (
                  <div className="ts-test-grid">
                    {topicTests.length ? topicTests.map((test) => (
                      <article key={test._id} className="card ts-test-card">
                        <div className="ts-test-card-head">
                          <span className="ts-test-module">{test.module}</span>
                          <span
                            className="ts-test-difficulty"
                            style={{ color: difficultyColor(test.difficulty) }}
                          >
                            {test.difficulty}
                          </span>
                        </div>
                        <h4>{test.title}</h4>
                        <p className="subtitle">{test.topic !== 'General' ? test.topic : 'General topic'}</p>
                        <div className="ts-test-meta-row">
                          <span className="quiz-admin-meta-chip">{test.questionCount} questions</span>
                          <span className="quiz-admin-meta-chip">{test.durationMinutes} min</span>
                        </div>
                        <button
                          type="button"
                          className="primary-btn ts-start-btn"
                          onClick={() => startTest(test._id, 'topic')}
                        >
                          Start Test →
                        </button>
                      </article>
                    )) : (
                      <p className="empty-note">No topic tests available for {course} yet.</p>
                    )}
                  </div>
                ) : null}

                {/* Full Mock Tests tab */}
                {activeTab === 'mock' && hasFullMock && !loadingTests ? (
                  <div className="ts-test-grid">
                    {fullMocks.length ? fullMocks.map((mock) => (
                      <article key={mock._id} className="card ts-test-card ts-mock-card">
                        <div className="ts-test-card-head">
                          <span className="ts-test-module">Full Mock</span>
                          <span className="quiz-admin-meta-chip">{mock.questionCount} questions</span>
                        </div>
                        <h4>{mock.title}</h4>
                        {mock.description ? <p className="subtitle">{mock.description}</p> : null}
                        <div className="ts-test-meta-row">
                          <span className="quiz-admin-meta-chip">{mock.durationMinutes} min</span>
                          <span className="quiz-admin-meta-chip">{mock.category}</span>
                        </div>
                        <button
                          type="button"
                          className="primary-btn ts-start-btn"
                          onClick={() => startTest(mock._id, 'mock')}
                        >
                          Start Mock Test →
                        </button>
                      </article>
                    )) : (
                      <p className="empty-note">No full mock tests available for {course} yet.</p>
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              !loadingAccess ? (
                <p className="empty-note ts-no-access-note">Purchase a Test Series plan above to access tests.</p>
              ) : null
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
