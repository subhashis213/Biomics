import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { previewTestSeriesVoucher, requestJson } from '../api';
import AppShell from '../components/AppShell';
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
  const n = Number(paise || 0) / 100;
  return '\u20b9' + n.toLocaleString('en-IN', { minimumFractionDigits: 0 });
}

const DIFFICULTY_COLOR = { easy: '#16a34a', hard: '#dc2626', medium: '#d97706' };

// ── Inline cart button + drawer for Test Series page ─────────────────────────
function TsCartButton({ session }) {
  const [items, setItems] = useState(() => {
    try { const s = localStorage.getItem('ts_cart'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [open, setOpen] = useState(false);
  const [checkoutKey, setCheckoutKey] = useState('');

  // Re-read cart when localStorage changes (cross-tab or after add-to-cart)
  useEffect(() => {
    function sync() {
      try { const s = localStorage.getItem('ts_cart'); setItems(s ? JSON.parse(s) : []); } catch { setItems([]); }
    }
    window.addEventListener('storage', sync);
    window.addEventListener('ts-cart-updated', sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('ts-cart-updated', sync); };
  }, []);

  // Scroll-lock when open
  useEffect(() => {
    if (!open) return undefined;
    const body = document.body;
    const html = document.documentElement;
    const y = window.scrollY;
    body.dataset.tsCartScrollY = String(y);
    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.left = '0'; body.style.right = '0'; body.style.width = '100%'; body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    return () => {
      const savedY = Number(body.dataset.tsCartScrollY || '0');
      body.style.position = ''; body.style.top = ''; body.style.left = ''; body.style.right = '';
      body.style.width = ''; body.style.overflow = ''; html.style.overflow = '';
      delete body.dataset.tsCartScrollY;
      window.scrollTo(0, savedY);
    };
  }, [open]);

  function remove(seriesType) {
    setItems((prev) => {
      const next = prev.filter((i) => i.seriesType !== seriesType);
      try { localStorage.setItem('ts_cart', JSON.stringify(next)); } catch {}
      window.dispatchEvent(new Event('ts-cart-updated'));
      return next;
    });
  }

  async function checkout(item) {
    if (checkoutKey) return;
    setCheckoutKey(item.seriesType);
    try {
      const orderRes = await requestJson('/test-series/payment/create-order', {
        method: 'POST',
        body: JSON.stringify({ seriesType: item.seriesType, ...(item.voucherCode ? { voucherCode: item.voucherCode } : {}) })
      });
      if (orderRes?.alreadyOwned || orderRes?.free) {
        remove(item.seriesType);
        return;
      }
      const ready = await loadRazorpayCheckoutScript();
      if (!ready || !window.Razorpay) throw new Error('Unable to load Razorpay.');
      await new Promise((resolve, reject) => {
        let settled = false; let started = false;
        const ok = (v) => { if (!settled) { settled = true; resolve(v); } };
        const err = (e) => { if (!settled) { settled = true; reject(e); } };
        const rz = new window.Razorpay({
          key: orderRes.keyId,
          amount: orderRes.razorpayOrder?.amount,
          currency: orderRes.currency || 'INR',
          name: 'Biomics Hub',
          description: item.seriesType === 'topic_test' ? 'Topic Test Series' : 'Full Mock Series',
          order_id: orderRes.razorpayOrder?.id,
          prefill: { name: session?.username || '' },
          theme: { color: '#0f766e' },
          handler: async (response) => {
            started = true;
            try {
              await requestJson('/test-series/payment/verify', {
                method: 'POST',
                body: JSON.stringify({
                  razorpayOrderId:   response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                  seriesType: item.seriesType
                })
              });
              remove(item.seriesType);
              setOpen(false);
              // Reload access on the parent page via a custom event
              window.dispatchEvent(new Event('ts-access-refresh'));
              ok({ status: 'paid' });
            } catch (e) { err(new Error(e.message || 'Verification failed.')); }
          },
          modal: {
            ondismiss: () => window.setTimeout(() => { if (!started) ok({ status: 'cancelled' }); }, 450)
          }
        });
        rz.open();
      });
    } catch (e) {
      alert(e.message || 'Payment failed.');
    } finally {
      setCheckoutKey('');
    }
  }

  const total = items.reduce((s, i) => s + i.finalPaise, 0);

  return (
    <>
      <button
        type="button"
        className="student-cart-header-btn"
        title="Open test series cart"
        aria-label="Open test series cart"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">🛒</span>
        {items.length > 0 && (
          <span className="student-cart-header-count">{items.length > 9 ? '9+' : items.length}</span>
        )}
      </button>

      {open && createPortal(
        <div className="student-cart-overlay" role="presentation" onClick={() => setOpen(false)}>
          <aside
            className="student-cart-drawer student-cart-drawer-floating"
            role="dialog"
            aria-label="Test series cart"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="student-cart-drawer-head">
              <div>
                <p className="eyebrow">Test Series Cart</p>
                <h3>{items.length} item{items.length === 1 ? '' : 's'} in cart</h3>
              </div>
              <button type="button" className="student-cart-close-btn" onClick={() => setOpen(false)} aria-label="Close cart">×</button>
            </header>

            <div className="student-cart-drawer-body">
              {!items.length ? (
                <p className="empty-state">Your test series cart is empty.</p>
              ) : (
                <div className="student-cart-items">
                  {items.map((item) => (
                    <article key={item.seriesType} className="student-cart-drawer-item">
                      <div>
                        <div className="student-cart-item-headline">
                          <strong>{item.label}</strong>
                          <span className="student-cart-course-chip tone-default">Test Series</span>
                        </div>
                        {item.voucherCode && (
                          <p style={{ fontSize: '0.78rem', color: 'var(--accent)', marginTop: '2px' }}>🏷 {item.voucherCode} applied</p>
                        )}
                        <span>
                          {item.discountPaise > 0 && <s style={{ opacity: 0.5, marginRight: '6px' }}>{rupees(item.originalPaise)}</s>}
                          {rupees(item.finalPaise)}
                        </span>
                      </div>
                      <div className="student-cart-item-actions">
                        <button type="button" className="secondary-btn" onClick={() => remove(item.seriesType)}>
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <footer className="student-cart-drawer-foot">
              <div>
                <small>Total</small>
                <strong>{rupees(total)}</strong>
              </div>
              {items.length > 0 && (
                <button
                  type="button"
                  className="primary-btn"
                  disabled={Boolean(checkoutKey)}
                  onClick={() => items.forEach((item) => checkout(item))}
                >
                  {checkoutKey ? 'Processing…' : `Pay Now (${items.length})`}
                </button>
              )}
            </footer>
          </aside>
        </div>,
        document.body
      )}
    </>
  );
}

export default function StudentTestSeriesPage() {
  const navigate = useNavigate();
  const { session } = useSessionStore();

  const [accessData, setAccessData]         = useState(null);
  const [loadingAccess, setLoadingAccess]   = useState(true);
  const [topicTests, setTopicTests]         = useState([]);
  const [fullMocks,  setFullMocks]          = useState([]);
  const [loadingTests, setLoadingTests]     = useState(false);
  const [activeTab, setActiveTab]           = useState('topic');
  const [purchasingType, setPurchasingType] = useState('');
  const [banner, setBanner]                 = useState(null);
  const [testSession, setTestSession]       = useState(null);
  const [showReview, setShowReview]         = useState(false);
  // syllabusView: null | { type:'topic'|'mock', items:[], hasAccess:bool, course:string }
  const [syllabusView, setSyllabusView]     = useState(null);
  const [loadingSyllabus, setLoadingSyllabus] = useState(false);

  // Voucher state — keyed by seriesType: 'topic_test' | 'full_mock'
  const [voucherInputs,   setVoucherInputs]   = useState({ topic_test: '', full_mock: '' });
  const [voucherPreviews, setVoucherPreviews] = useState({ topic_test: null, full_mock: null });
  const [voucherErrors,   setVoucherErrors]   = useState({ topic_test: '', full_mock: '' });
  const [voucherLoading,  setVoucherLoading]  = useState({ topic_test: false, full_mock: false });

  // Cart state — { seriesType, label, originalPaise, finalPaise, voucherCode }
  const [cartItems, setCartItems] = useState(() => {
    try {
      const saved = localStorage.getItem('ts_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [cartCheckoutST, setCartCheckoutST] = useState(''); // which cart item is being checked out

  // Persist cart to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('ts_cart', JSON.stringify(cartItems));
    } catch { /* storage full or unavailable */ }
    window.dispatchEvent(new Event('ts-cart-updated'));
  }, [cartItems]);

  const timerRef = useRef(null);

  // ── Access & test loading ─────────────────────────────────────────────────

  async function loadAccess() {
    setLoadingAccess(true);
    try {
      const res = await requestJson('/test-series/pricing/student');
      setAccessData(res || null);
      // Remove already-owned series from the cart
      const access = res?.access || {};
      setCartItems((prev) => prev.filter((item) => {
        if (item.seriesType === 'topic_test' && access.hasTopicTest) return false;
        if (item.seriesType === 'full_mock'  && access.hasFullMock)  return false;
        return true;
      }));
    } catch {
      setAccessData(null);
    } finally {
      setLoadingAccess(false);
    }
  }

  async function loadTests(data) {
    const access = data?.access ?? accessData?.access;
    const jobs = [];
    if (access?.hasTopicTest) {
      jobs.push(
        requestJson('/test-series/topic-tests/student')
          .then((r) => setTopicTests(Array.isArray(r?.tests) ? r.tests : []))
          .catch(() => setTopicTests([]))
      );
    } else { setTopicTests([]); }
    if (access?.hasFullMock) {
      jobs.push(
        requestJson('/test-series/full-mocks/student')
          .then((r) => setFullMocks(Array.isArray(r?.mocks) ? r.mocks : []))
          .catch(() => setFullMocks([]))
      );
    } else { setFullMocks([]); }
    if (jobs.length) {
      setLoadingTests(true);
      await Promise.all(jobs);
      setLoadingTests(false);
    }
  }

  useEffect(() => { loadAccess(); }, []);
  useEffect(() => { if (accessData) loadTests(accessData); }, [accessData]);

  // Reload access after checkout from the in-page cart button
  useEffect(() => {
    function onRefresh() { loadAccess(); }
    window.addEventListener('ts-access-refresh', onRefresh);
    return () => window.removeEventListener('ts-access-refresh', onRefresh);
  }, []);

  // ── Syllabus preview ─────────────────────────────────────────────────────

  async function openSyllabus(type) {
    setLoadingSyllabus(true);
    setSyllabusView({ type, items: [], hasAccess: false, course: '', loading: true });
    try {
      const endpoint = type === 'topic'
        ? '/test-series/topic-tests/syllabus'
        : '/test-series/full-mocks/syllabus';
      const res = await requestJson(endpoint);
      setSyllabusView({
        type,
        items:     res.items     || [],
        hasAccess: type === 'topic' ? Boolean(res.hasTopicTest) : Boolean(res.hasFullMock),
        course:    res.course    || '',
        loading:   false
      });
    } catch (e) {
      setBanner({ type: 'error', text: e.message || 'Failed to load syllabus.' });
      setSyllabusView(null);
    } finally {
      setLoadingSyllabus(false);
    }
  }

  // ── Voucher ───────────────────────────────────────────────────────────────

  async function handleApplyVoucher(seriesType) {
    const code = (voucherInputs[seriesType] || '').trim().toUpperCase();
    if (!code) return;
    setVoucherLoading((prev) => ({ ...prev, [seriesType]: true }));
    setVoucherErrors((prev) => ({ ...prev, [seriesType]: '' }));
    setVoucherPreviews((prev) => ({ ...prev, [seriesType]: null }));
    try {
      const res = await previewTestSeriesVoucher(seriesType, code);
      if (!res?.valid) {
        setVoucherErrors((prev) => ({ ...prev, [seriesType]: res?.reason || 'Invalid or expired voucher.' }));
      } else {
        setVoucherPreviews((prev) => ({ ...prev, [seriesType]: res }));
        // Update cart item if already in cart
        setCartItems((prev) => prev.map((item) =>
          item.seriesType === seriesType
            ? { ...item, finalPaise: res.finalAmountInPaise, voucherCode: res.voucherCode, discountPaise: res.discountInPaise }
            : item
        ));
      }
    } catch (e) {
      setVoucherErrors((prev) => ({ ...prev, [seriesType]: e.message || 'Failed to apply voucher.' }));
    } finally {
      setVoucherLoading((prev) => ({ ...prev, [seriesType]: false }));
    }
  }

  function handleRemoveVoucher(seriesType) {
    setVoucherPreviews((prev) => ({ ...prev, [seriesType]: null }));
    setVoucherInputs((prev) => ({ ...prev, [seriesType]: '' }));
    setVoucherErrors((prev) => ({ ...prev, [seriesType]: '' }));
    setCartItems((prev) => prev.map((item) =>
      item.seriesType === seriesType
        ? { ...item, finalPaise: item.originalPaise, voucherCode: null, discountPaise: 0 }
        : item
    ));
  }

  function handleAddToCart(seriesType) {
    const label = seriesType === 'topic_test' ? 'Topic Test Series' : 'Full Mock Series';
    const priceKey = seriesType === 'topic_test' ? 'topicTestPriceInPaise' : 'fullMockPriceInPaise';
    const pricingData = accessData?.pricing || {};
    const originalPaise = Number(pricingData[priceKey] || 0);
    const preview = voucherPreviews[seriesType];
    const finalPaise = preview ? preview.finalAmountInPaise : originalPaise;
    const voucherCode = preview ? preview.voucherCode : null;
    const discountPaise = preview ? preview.discountInPaise : 0;

    // Build the new cart value synchronously BEFORE touching React state
    let current = [];
    try { current = JSON.parse(localStorage.getItem('ts_cart') || '[]'); } catch {}
    const next = [
      ...current.filter((item) => item.seriesType !== seriesType),
      { seriesType, label, originalPaise, finalPaise, voucherCode, discountPaise }
    ];
    // Write to localStorage FIRST so TsCartButton reads the correct value when the event fires
    try { localStorage.setItem('ts_cart', JSON.stringify(next)); } catch {}
    // Notify TsCartButton (and dashboard) immediately — localStorage is already updated
    window.dispatchEvent(new Event('ts-cart-updated'));
    // Sync React state (the useEffect persist is now a no-op because localStorage is already current)
    setCartItems(next);
    setBanner({ type: 'success', text: `${label} added to cart!` });
  }

  function handleRemoveFromCart(seriesType) {
    let current = [];
    try { current = JSON.parse(localStorage.getItem('ts_cart') || '[]'); } catch {}
    const next = current.filter((item) => item.seriesType !== seriesType);
    try { localStorage.setItem('ts_cart', JSON.stringify(next)); } catch {}
    window.dispatchEvent(new Event('ts-cart-updated'));
    setCartItems(next);
  }

  // ── Payment ───────────────────────────────────────────────────────────────

  async function handlePurchase(seriesType, voucherCode) {
    if (purchasingType) return;
    setPurchasingType(seriesType);
    setBanner(null);
    try {
      const orderRes = await requestJson('/test-series/payment/create-order', {
        method: 'POST',
        body: JSON.stringify({ seriesType, ...(voucherCode ? { voucherCode } : {}) })
      });
      if (orderRes?.alreadyOwned) {
        setBanner({ type: 'success', text: 'Already purchased — refreshing your access.' });
        await loadAccess();
        return;
      }
      if (orderRes?.free) {
        setBanner({
          type: 'success',
          text: seriesType === 'topic_test'
            ? 'Access granted! Topic Tests and Full Mocks are now unlocked.'
            : 'Access granted! Full Mock Tests are now unlocked.'
        });
        setCartItems((prev) => prev.filter((item) => item.seriesType !== seriesType));
        await loadAccess();
        return;
      }
      const scriptReady = await loadRazorpayCheckoutScript();
      if (!scriptReady || !window.Razorpay) throw new Error('Unable to load Razorpay. Please try again.');
      await new Promise((resolve, reject) => {
        let settled = false;
        let handlerStarted = false;
        const ok  = (v) => { if (!settled) { settled = true; resolve(v); } };
        const err = (e) => { if (!settled) { settled = true; reject(e); } };
        const rz = new window.Razorpay({
          key: orderRes.keyId,
          amount: orderRes.razorpayOrder?.amount,
          currency: orderRes.currency || 'INR',
          name: 'Biomics Hub',
          description: seriesType === 'topic_test' ? 'Topic Test Series' : 'Full Mock Series',
          order_id: orderRes.razorpayOrder?.id,
          prefill: { name: session?.username || '' },
          theme: { color: '#0f766e' },
          handler: async (response) => {
            handlerStarted = true;
            try {
              await requestJson('/test-series/payment/verify', {
                method: 'POST',
                body: JSON.stringify({
                  razorpayOrderId:   response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                  seriesType
                })
              });
              setBanner({ type: 'success', text: (seriesType === 'topic_test' ? 'Topic Test Series (+ Full Mocks)' : 'Full Mock Series') + ' unlocked!' });
              setCartItems((prev) => prev.filter((item) => item.seriesType !== seriesType));
              await loadAccess();
              ok({ status: 'paid' });
            } catch (e) { err(new Error(e.message || 'Payment verification failed.')); }
          },
          modal: {
            ondismiss: () => window.setTimeout(() => {
              if (handlerStarted) return;
              setBanner({ type: 'warn', text: 'Payment was cancelled.' });
              ok({ status: 'cancelled' });
            }, 450)
          }
        });
        rz.open();
      });
    } catch (e) {
      setBanner({ type: 'error', text: e.message || 'Payment failed. Please try again.' });
    } finally {
      setPurchasingType('');
      setCartCheckoutST('');
    }
  }

  // ── Test session ──────────────────────────────────────────────────────────

  async function startTest(testId, type) {
    setBanner(null);
    try {
      const endpoint = type === 'topic'
        ? '/test-series/topic-tests/student/' + testId
        : '/test-series/full-mocks/student/' + testId;
      const res = await requestJson(endpoint);
      const qCount = res.questions?.length || 0;
      setShowReview(false);
      setTestSession({
        type, test: res,
        questions:       res.questions || [],
        answers:         new Array(qCount).fill(-1),
        markedForReview: new Array(qCount).fill(false),
        timeLeft:        (res.durationMinutes || 30) * 60,
        submitted: false, result: null,
        currentQ: 0, showQuitConfirm: false
      });
    } catch (e) {
      setBanner({ type: 'error', text: e.message || 'Failed to load test.' });
    }
  }

  // Timer
  useEffect(() => {
    if (!testSession || testSession.submitted) return undefined;
    timerRef.current = window.setInterval(() => {
      setTestSession((prev) => {
        if (!prev || prev.submitted) return prev;
        const next = prev.timeLeft - 1;
        if (next <= 0) { handleSubmitTest(prev); return { ...prev, timeLeft: 0 }; }
        return { ...prev, timeLeft: next };
      });
    }, 1000);
    return () => window.clearInterval(timerRef.current);
  }, [testSession?.test?._id, testSession?.submitted]);

  async function handleSubmitTest(snap = testSession) {
    if (!snap || snap.submitted) return;
    window.clearInterval(timerRef.current);
    try {
      const endpoint = snap.type === 'topic'
        ? '/test-series/topic-tests/student/' + snap.test._id + '/submit'
        : '/test-series/full-mocks/student/' + snap.test._id + '/submit';
      const result = await requestJson(endpoint, {
        method: 'POST',
        body: JSON.stringify({ answers: snap.answers })
      });
      setShowReview(false);
      setTestSession((prev) => prev ? { ...prev, submitted: true, result, showQuitConfirm: false } : prev);
    } catch (e) {
      setBanner({ type: 'error', text: e.message || 'Failed to submit test.' });
    }
  }

  function quitTest() {
    window.clearInterval(timerRef.current);
    setTestSession(null);
    setShowReview(false);
  }

  function setAnswer(qi, oi) {
    setTestSession((prev) => {
      if (!prev) return prev;
      const answers = [...prev.answers];
      answers[qi] = oi;
      return { ...prev, answers };
    });
  }

  function toggleMarkForReview(qi) {
    setTestSession((prev) => {
      if (!prev) return prev;
      const markedForReview = [...prev.markedForReview];
      markedForReview[qi] = !markedForReview[qi];
      return { ...prev, markedForReview };
    });
  }

  const hasTopicTest  = Boolean(accessData?.access?.hasTopicTest);
  const hasFullMock   = Boolean(accessData?.access?.hasFullMock);
  const pricing       = accessData?.pricing || {};
  const course        = accessData?.course || '';
  const hasAnyAccess  = hasTopicTest || hasFullMock;
  const topicIsFree   = !(pricing.topicTestPriceInPaise > 0);
  const mockIsFree    = !(pricing.fullMockPriceInPaise > 0);

  useEffect(() => {
    if (hasTopicTest && !hasFullMock && activeTab !== 'topic') {
      setActiveTab('topic');
      return;
    }
    if (!hasTopicTest && hasFullMock && activeTab !== 'mock') {
      setActiveTab('mock');
    }
  }, [hasTopicTest, hasFullMock, activeTab]);

  // ══════════════════════════════════════════════════════════
  // RENDER: Result
  // ══════════════════════════════════════════════════════════
  if (testSession?.submitted && testSession.result) {
    const { test, result } = testSession;
    const pct = Number(result.percentage);
    const grade = pct >= 80 ? { label: 'Excellent', color: '#16a34a' }
                : pct >= 60 ? { label: 'Good',      color: '#0f766e' }
                : pct >= 40 ? { label: 'Average',   color: '#d97706' }
                :             { label: 'Needs Work', color: '#dc2626' };
    const skipped = result.review?.filter((r) => r.selectedIndex === -1).length || 0;

    return (
      <AppShell title="Test Result" subtitle={test.title} roleLabel="Student" showThemeSwitch
        actions={<button type="button" className="secondary-btn" onClick={quitTest}>← Back to Tests</button>}
      >
        <main className="admin-workspace-page">

          <section className="card ts-result-score-card">
            <div className="ts-result-score-left">
              <div className="ts-result-ring" style={{ '--ring-color': grade.color, '--ring-deg': ((pct / 100) * 360) + 'deg' }}>
                <div className="ts-result-ring-inner">
                  <span className="ts-result-ring-pct">{pct}<span className="ts-result-ring-symbol">%</span></span>
                  <span className="ts-result-ring-label" style={{ color: grade.color }}>{grade.label}</span>
                </div>
              </div>
            </div>
            <div className="ts-result-score-right">
              <h2 className="ts-result-title">{test.title}</h2>
              <p className="eyebrow">{test.category}{test.module ? ' · ' + test.module : ''}</p>
              <div className="ts-result-stats-row">
                <div className="ts-result-stat correct-stat">
                  <span className="ts-result-stat-val">{result.score}</span>
                  <span className="ts-result-stat-key">Correct</span>
                </div>
                <div className="ts-result-stat wrong-stat">
                  <span className="ts-result-stat-val">{result.total - result.score - skipped}</span>
                  <span className="ts-result-stat-key">Wrong</span>
                </div>
                <div className="ts-result-stat skip-stat">
                  <span className="ts-result-stat-val">{skipped}</span>
                  <span className="ts-result-stat-key">Skipped</span>
                </div>
                <div className="ts-result-stat total-stat">
                  <span className="ts-result-stat-val">{result.total}</span>
                  <span className="ts-result-stat-key">Total</span>
                </div>
              </div>
              <div className="ts-result-actions">
                <button type="button" className="primary-btn" onClick={() => setShowReview((v) => !v)}>
                  {showReview ? '▲ Hide Answer Review' : '▼ View Answer Review'}
                </button>
                <button type="button" className="secondary-btn" onClick={quitTest}>← Back to Tests</button>
              </div>
            </div>
          </section>

          {showReview && (
            <section className="card workspace-panel">
              <h3 className="ts-review-heading">Answer Review — {result.review.length} Questions</h3>
              {result.review.map((item, i) => (
                <article key={i} className={'ts-review-item ' + (item.isCorrect ? 'ts-ri-correct' : item.selectedIndex === -1 ? 'ts-ri-skip' : 'ts-ri-wrong')}>
                  <div className="ts-review-q-row">
                    <span className={'ts-review-status-dot ' + (item.isCorrect ? 'dot-correct' : item.selectedIndex === -1 ? 'dot-skip' : 'dot-wrong')} />
                    <span className="ts-review-num">Q{i + 1}</span>
                    <p className="ts-review-q-text">{item.question}</p>
                  </div>
                  <div className="ts-review-options">
                    {item.options.map((opt, oi) => (
                      <div key={oi} className={['ts-review-option', oi === item.correctIndex ? 'correct-opt' : '', oi === item.selectedIndex && !item.isCorrect ? 'wrong-opt' : ''].filter(Boolean).join(' ')}>
                        <span className="ts-review-opt-marker">{['A','B','C','D'][oi]}</span>
                        <span className="ts-review-opt-text">{opt}</span>
                        {oi === item.correctIndex && <span className="ts-review-opt-badge correct-badge">✓ Answer</span>}
                        {oi === item.selectedIndex && !item.isCorrect && <span className="ts-review-opt-badge wrong-badge">✗ Yours</span>}
                      </div>
                    ))}
                  </div>
                  {item.explanation && <p className="ts-review-explanation">💡 {item.explanation}</p>}
                </article>
              ))}
            </section>
          )}

        </main>
      </AppShell>
    );
  }

  // ══════════════════════════════════════════════════════════
  // RENDER: Active test
  // ══════════════════════════════════════════════════════════
  if (testSession && !testSession.submitted) {
    const { test, questions, answers, markedForReview, timeLeft, currentQ, showQuitConfirm } = testSession;
    const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
    const secs = String(timeLeft % 60).padStart(2, '0');
    const isUrgent        = timeLeft < 120;
    const answeredCount   = answers.filter((a) => a >= 0).length;
    const markedCount     = markedForReview.filter(Boolean).length;
    const unansweredCount = answers.length - answeredCount;
    const q               = questions[currentQ];
    const isCurrentMarked = markedForReview[currentQ];

    return (
      <AppShell
        title={test.title}
        subtitle={test.category + (test.module ? ' · ' + test.module : '')}
        roleLabel="Student" showThemeSwitch
        actions={(
          <div className="ts-timer-topbar">
            <div className="ts-timer-counts">
              <span className="ts-tc-item ts-tc-answered">{answeredCount} ans</span>
              <span className="ts-tc-sep">·</span>
              <span className="ts-tc-item">{unansweredCount} left</span>
              {markedCount > 0 && (
                <>
                  <span className="ts-tc-sep">·</span>
                  <span className="ts-tc-item ts-tc-marked">{markedCount} marked</span>
                </>
              )}
            </div>
            <span className={'ts-timer-badge' + (isUrgent ? ' urgent' : '')}>⏱ {mins}:{secs}</span>
            <button type="button" className="danger-outline-btn"
              onClick={() => setTestSession((p) => ({ ...p, showQuitConfirm: true }))}>
              Quit
            </button>
          </div>
        )}
      >
        <main className="ts-exam-layout">

          {/* Question panel */}
          <div className="ts-exam-main">
            <div className="card ts-question-card">

              <div className="ts-question-header">
                <div className="ts-qh-left">
                  <span className="ts-q-counter">
                    Q <strong>{currentQ + 1}</strong>
                    <span className="ts-q-total"> / {questions.length}</span>
                  </span>
                  {isCurrentMarked && <span className="ts-marked-pill">🟣 Marked for Review</span>}
                </div>
                <span className={'ts-timer-mobile' + (isUrgent ? ' urgent' : '')}>⏱ {mins}:{secs}</span>
              </div>

              <p className="ts-question-text">{q.question}</p>

              <div className="ts-options-list">
                {q.options.map((opt, oi) => (
                  <button key={oi} type="button"
                    className={'ts-option-btn' + (answers[currentQ] === oi ? ' selected' : '')}
                    onClick={() => setAnswer(currentQ, oi)}
                  >
                    <span className="ts-opt-label">{['A','B','C','D'][oi]}</span>
                    <span className="ts-opt-text">{opt}</span>
                    {answers[currentQ] === oi && <span className="ts-opt-check">✓</span>}
                  </button>
                ))}
              </div>

              <div className="ts-question-actions">
                <button type="button"
                  className={'ts-mark-review-btn' + (isCurrentMarked ? ' active' : '')}
                  onClick={() => toggleMarkForReview(currentQ)}
                >
                  {isCurrentMarked ? '🟣 Unmark Review' : '🔖 Mark for Review'}
                </button>
                <div className="ts-nav-prev-next">
                  <button type="button" className="secondary-btn ts-nav-btn" disabled={currentQ === 0}
                    onClick={() => setTestSession((p) => ({ ...p, currentQ: p.currentQ - 1 }))}>
                    ← Prev
                  </button>
                  {currentQ < questions.length - 1 ? (
                    <button type="button" className="primary-btn ts-nav-btn"
                      onClick={() => setTestSession((p) => ({ ...p, currentQ: p.currentQ + 1 }))}>
                      Next →
                    </button>
                  ) : (
                    <button type="button" className="primary-btn ts-nav-btn"
                      onClick={() => handleSubmitTest()}>
                      Submit Test
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Navigator sidebar */}
          <aside className="ts-exam-sidebar">
            <div className="card ts-nav-panel">
              <p className="ts-nav-panel-title">Question Navigator</p>

              <div className="ts-nav-legend">
                <div className="ts-legend-item"><span className="ts-legend-dot ts-ld-answered" /><span>Answered</span></div>
                <div className="ts-legend-item"><span className="ts-legend-dot ts-ld-marked"  /><span>Review</span></div>
                <div className="ts-legend-item"><span className="ts-legend-dot ts-ld-blank"   /><span>Not Done</span></div>
              </div>

              <div className="ts-nav-grid">
                {questions.map((_, qi) => {
                  const isAnswered = answers[qi] >= 0;
                  const isMarked   = markedForReview[qi];
                  const isCurrent  = qi === currentQ;
                  return (
                    <button key={qi} type="button"
                      className={['ts-nav-dot', isMarked ? 'marked' : isAnswered ? 'answered' : '', isCurrent ? 'current' : ''].filter(Boolean).join(' ')}
                      onClick={() => setTestSession((p) => ({ ...p, currentQ: qi }))}
                      title={'Q' + (qi + 1) + (isAnswered ? ' \u2713' : '') + (isMarked ? ' \uD83D\uDFE3' : '')}
                    >
                      {qi + 1}
                    </button>
                  );
                })}
              </div>

              <div className="ts-nav-summary">
                <span className="ts-nav-sum-item ts-sum-answered">{answeredCount} Answered</span>
                {markedCount > 0 && <span className="ts-nav-sum-item ts-sum-marked">{markedCount} Review</span>}
                <span className="ts-nav-sum-item ts-sum-blank">{unansweredCount} Left</span>
              </div>

              <button type="button" className="primary-btn ts-nav-submit-btn" onClick={() => handleSubmitTest()}>
                Submit Test ({answeredCount}/{questions.length})
              </button>
              <button type="button" className="danger-outline-btn ts-nav-quit-btn"
                onClick={() => setTestSession((p) => ({ ...p, showQuitConfirm: true }))}>
                Quit Test
              </button>
            </div>
          </aside>

        </main>

        {/* Quit confirmation modal */}
        {showQuitConfirm && createPortal(
          <div className="ts-quit-backdrop" role="dialog" aria-modal="true" aria-label="Quit test confirmation">
            <div className="ts-quit-modal">
              <div className="ts-quit-icon-wrap"><span className="ts-quit-icon">⚠️</span></div>
              <h3 className="ts-quit-title">Quit this test?</h3>
              <p className="ts-quit-body">
                Your progress will be <strong>permanently lost</strong>. This attempt will not be scored or saved.
              </p>
              <div className="ts-quit-stats">
                <div className="ts-quit-stat">
                  <span className="ts-qs-val ts-qs-answered">{answeredCount}</span>
                  <span className="ts-qs-key">Answered</span>
                </div>
                <div className="ts-quit-stat">
                  <span className="ts-qs-val ts-qs-blank">{unansweredCount}</span>
                  <span className="ts-qs-key">Left</span>
                </div>
                {markedCount > 0 && (
                  <div className="ts-quit-stat">
                    <span className="ts-qs-val ts-qs-marked">{markedCount}</span>
                    <span className="ts-qs-key">Marked</span>
                  </div>
                )}
              </div>
              <div className="ts-quit-actions">
                <button type="button" className="secondary-btn"
                  onClick={() => setTestSession((p) => ({ ...p, showQuitConfirm: false }))}>
                  Continue Test
                </button>
                <button type="button" className="danger-btn" onClick={quitTest}>Yes, Quit Test</button>
              </div>
            </div>
          </div>,
          document.body
        )}

      </AppShell>
    );
  }

  // ══════════════════════════════════════════════════════════
  // RENDER: Syllabus preview page
  // ══════════════════════════════════════════════════════════
  if (syllabusView) {
    const { type, items, hasAccess, course: svCourse, loading: svLoading } = syllabusView;
    const isTopicType = type === 'topic';
    const typeLabel   = isTopicType ? 'Topic Tests' : 'Full Mock Tests';
    const typeIcon    = isTopicType ? '📖' : '🗒️';

    return (
      <AppShell
        title={typeLabel + ' — Syllabus'}
        subtitle={svCourse ? svCourse + ' course content' : 'Course content overview'}
        roleLabel="Student"
        showThemeSwitch
        actions={(
          <button type="button" className="secondary-btn" onClick={() => setSyllabusView(null)}>
            ← Back
          </button>
        )}
      >
        <main className="admin-workspace-page">

          {/* Syllabus Hero */}
          <section className={'workspace-hero ' + (isTopicType ? 'workspace-hero-testseries' : 'workspace-hero-fullmock')}>
            <div className="ts-hero-content">
              <p className="eyebrow ts-hero-eyebrow">{typeIcon} {typeLabel}</p>
              <h2 className="ts-hero-heading">
                {isTopicType ? 'Complete Topic-wise Test Catalog' : 'Full-Length Mock Exam Catalog'}
              </h2>
              <p className="subtitle ts-hero-subtitle">
                {hasAccess
                  ? '✅ Purchased — all tests below are unlocked.'
                  : '🔒 Locked — purchase to unlock all tests and start practicing.'}
              </p>
            </div>
            <div className="ts-hero-stats-row">
              <div className="ts-hero-stat-box ts-hero-stat-box-hero">
                <span className="ts-hero-stat-val-hero">{items.length}</span>
                <span className="ts-hero-stat-key-hero">{typeLabel}</span>
              </div>
              {isTopicType && (
                <div className="ts-hero-stat-box ts-hero-stat-box-hero">
                  <span className="ts-hero-stat-val-hero">
                    {[...new Set(items.map((t) => t.module))].length}
                  </span>
                  <span className="ts-hero-stat-key-hero">Modules</span>
                </div>
              )}
            </div>
          </section>

          {/* lock / unlock notice */}
          {!hasAccess && (
            <div className="ts-syllabus-lock-notice">
              <span className="ts-sln-icon">🔒</span>
              <div className="ts-sln-text">
                <strong>These tests are locked.</strong>{' '}
                Purchase the{' '}
                {isTopicType
                  ? <strong>Topic Test Series</strong>
                  : <strong>Full Mock Series</strong>}{' '}
                to unlock all {items.length} tests and start practising.
              </div>
              <button
                type="button"
                className="primary-btn ts-sln-buy-btn"
                onClick={() => { const st = isTopicType ? 'topic_test' : 'full_mock'; setSyllabusView(null); handlePurchase(st, voucherPreviews[st]?.voucherCode || undefined); }}
              >
                {isTopicType ? 'Buy Topic Test Series' : 'Buy Full Mock Series'}
              </button>
            </div>
          )}

          {svLoading ? (
            <div className="ts-loading-state">
              <div className="ts-loading-spinner" />
              <p>Loading syllabus…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="ts-empty-state">
              <span className="ts-empty-icon">{typeIcon}</span>
              <p>No {typeLabel.toLowerCase()} have been added yet.</p>
              <p className="subtitle">Check back soon.</p>
            </div>
          ) : (
            <div className="ts-syllabus-grid">
              {items.map((item, idx) => (
                <article
                  key={item._id || idx}
                  className={'ts-syllabus-card card' + (hasAccess ? ' ts-syllabus-unlocked' : ' ts-syllabus-locked')}
                >
                  {/* lock overlay */}
                  {!hasAccess && (
                    <div className="ts-syllabus-lock-overlay">
                      <span className="ts-syllabus-lock-icon">🔒</span>
                      <span className="ts-syllabus-lock-label">Locked</span>
                    </div>
                  )}

                  <div className="ts-syllabus-card-head">
                    {isTopicType ? (
                      <span className="ts-module-chip">{item.module}</span>
                    ) : (
                      <span className="ts-module-chip ts-mock-chip">Full Mock</span>
                    )}
                    {isTopicType && item.difficulty && (
                      <span
                        className="ts-difficulty-chip"
                        style={{ color: DIFFICULTY_COLOR[item.difficulty] || '#d97706' }}
                      >
                        {item.difficulty}
                      </span>
                    )}
                  </div>

                  <h4 className={'ts-test-title' + (hasAccess ? '' : ' ts-title-blurred')}>
                    {item.title}
                  </h4>

                  {isTopicType && item.topic && item.topic !== 'General' && (
                    <p className={'ts-test-topic' + (hasAccess ? '' : ' ts-blurred')}>
                      {item.topic}
                    </p>
                  )}
                  {!isTopicType && item.description && (
                    <p className={'ts-test-topic' + (hasAccess ? '' : ' ts-blurred')}>
                      {item.description}
                    </p>
                  )}

                  <div className="ts-test-meta">
                    <span className="ts-meta-chip">📝 {item.questionCount} Qs</span>
                    <span className="ts-meta-chip">⏱ {item.durationMinutes} min</span>
                  </div>

                  {hasAccess ? (
                    <button
                      type="button"
                      className="primary-btn ts-start-btn"
                      onClick={() => { setSyllabusView(null); startTest(item._id, type); }}
                    >
                      Start Test →
                    </button>
                  ) : (
                    <div className="ts-syllabus-locked-cta">
                      <span className="ts-locked-cta-text">🔒 Purchase to unlock</span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          {/* Bottom CTA for locked state */}
          {!hasAccess && !svLoading && items.length > 0 && (
            <div className="ts-syllabus-bottom-cta">
              <p>Ready to unlock all {items.length} {typeLabel.toLowerCase()}?</p>
              <button
                type="button"
                className="primary-btn ts-sln-buy-btn ts-bottom-buy-btn"
                onClick={() => { const st = isTopicType ? 'topic_test' : 'full_mock'; setSyllabusView(null); handlePurchase(st, voucherPreviews[st]?.voucherCode || undefined); }}
              >
                {isTopicType
                  ? `Buy Topic Test Series — Unlock ${items.length} Tests + Full Mocks`
                  : `Buy Full Mock Series — Unlock ${items.length} Mocks`}
              </button>
            </div>
          )}

        </main>
      </AppShell>
    );
  }

  // ══════════════════════════════════════════════════════════
  // RENDER: Hub / Paywall / Test list
  // ══════════════════════════════════════════════════════════
  return (
    <AppShell
      title="Test Series"
      subtitle="Premium topic tests and full-length mock exams — purchased separately"
      roleLabel="Student" showThemeSwitch
      actions={
        <>
          <TsCartButton session={session} />
          <button type="button" className="secondary-btn" onClick={() => navigate('/student')}>← Dashboard</button>
        </>
      }
    >
      <main className="admin-workspace-page">

        {/* Hero */}
        <section className="workspace-hero workspace-hero-testseries">
          <div className="ts-hero-content">
            <p className="eyebrow">Test Series{course ? ' — ' + course : ''}</p>
            <h2>Sharpen your exam preparation</h2>
            <p className="subtitle">
              {hasAnyAccess
                ? 'You have active access. Start a test below.'
                : 'Choose a plan to unlock high-quality tests for your exam.'}
            </p>
          </div>
          <div className="ts-hero-stats-row">
            <div className="ts-hero-stat-box">
              <span className="ts-hero-stat-val">{hasAnyAccess ? topicTests.length : '—'}</span>
              <span className="ts-hero-stat-key">Topic Tests</span>
            </div>
            <div className="ts-hero-stat-box">
              <span className="ts-hero-stat-val">{hasAnyAccess ? fullMocks.length : '—'}</span>
              <span className="ts-hero-stat-key">Full Mocks</span>
            </div>
          </div>
        </section>

        {banner && (
          <div className={'ts-top-banner ts-top-banner-' + banner.type}>{banner.text}</div>
        )}

        {loadingAccess ? (
          <div className="ts-loading-state">
            <div className="ts-loading-spinner" />
            <p>Checking your access…</p>
          </div>
        ) : (
          <>
            {/* ─── PURCHASE OPTIONS: show only plans not yet purchased ─── */}
            {(!hasTopicTest || !hasFullMock) && (
              <section className="ts-paywall-section">
                <div className="ts-paywall-intro">
                  <span className="ts-lock-icon">🔒</span>
                  <div>
                    <h2 className="ts-paywall-title">Unlock Test Series for {course || 'your course'}</h2>
                    <p className="ts-paywall-desc">
                      {hasAnyAccess
                        ? 'Upgrade your access with the remaining test series plan.'
                        : 'Test Series is a premium add-on, separate from your course plan. Pick the option that matches your preparation level.'}
                    </p>
                  </div>
                </div>

                <div className="ts-plan-banners">

                  {/* ── Banner 1: Topic Test Series (Recommended) ── */}
                  {!hasTopicTest && (
                  <article className="ts-plan-banner ts-plan-topic">
                    <div className="ts-plan-banner-badge">⭐ RECOMMENDED</div>
                    <div className="ts-plan-banner-inner">
                      <div className="ts-plan-banner-iconside">
                        <div className="ts-plan-banner-icon-circle topic-circle">📖</div>
                        <div className="ts-plan-price-box">
                          <span className="ts-plan-price-val">
                            {topicIsFree ? 'Free' : rupees(pricing.topicTestPriceInPaise)}
                          </span>
                          <span className="ts-plan-price-period">one-time · lifetime</span>
                        </div>
                      </div>
                      <div className="ts-plan-banner-details">
                        <h3 className="ts-plan-banner-name">Topic Test Series</h3>
                        <p className="ts-plan-banner-tagline">
                          Chapter &amp; topic-wise tests to build strong conceptual foundations —
                          perfect for systematic, step-by-step preparation.
                        </p>
                        <div className="ts-plan-feat-grid">
                          <div className="ts-plan-feat-col">
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> All module &amp; topic-wise tests for {course || 'your course'}</div>
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Instant result with detailed answer key</div>
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Easy, Medium &amp; Hard difficulty levels</div>
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Question navigator with mark-for-review</div>
                          </div>
                          <div className="ts-plan-feat-col">
                            <div className="ts-plan-feat ts-plan-feat-bonus">
                              <span className="ts-feat-check bonus-check">✓</span>
                              <strong>Full Mock Tests included free</strong> — bonus
                            </div>
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Score breakdown: correct, wrong, skipped</div>
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Explanation for every question</div>
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Lifetime access — no expiry, no renewal</div>
                          </div>
                        </div>
                        <div className="ts-plan-cta-row">
                          {!topicIsFree && (
                            <div className="ts-voucher-row">
                              <div className="ts-voucher-input-group">
                                <input
                                  className="ts-voucher-input"
                                  type="text"
                                  placeholder="Have a voucher code?"
                                  value={voucherInputs.topic_test}
                                  onChange={(e) => {
                                    const v = e.target.value.toUpperCase();
                                    setVoucherInputs((prev) => ({ ...prev, topic_test: v }));
                                    if (!v) {
                                      setVoucherPreviews((prev) => ({ ...prev, topic_test: null }));
                                      setVoucherErrors((prev) => ({ ...prev, topic_test: '' }));
                                    }
                                  }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleApplyVoucher('topic_test'); }}
                                  maxLength={30}
                                />
                                {voucherPreviews.topic_test ? (
                                  <button type="button" className="ts-voucher-remove-btn" onClick={() => handleRemoveVoucher('topic_test')}>✕ Remove</button>
                                ) : (
                                  <button type="button" className="ts-voucher-apply-btn" onClick={() => handleApplyVoucher('topic_test')} disabled={voucherLoading.topic_test || !voucherInputs.topic_test}>
                                    {voucherLoading.topic_test ? '…' : 'Apply'}
                                  </button>
                                )}
                              </div>
                              {voucherErrors.topic_test && <p className="ts-voucher-error">{voucherErrors.topic_test}</p>}
                              {voucherPreviews.topic_test && (
                                <div className="ts-voucher-preview-box">
                                  <span className="ts-voucher-check">✓</span>
                                  <span className="ts-voucher-preview-text">
                                    <strong>{voucherPreviews.topic_test.voucherCode}</strong> applied — save {rupees(voucherPreviews.topic_test.discountInPaise)}
                                    {' '}→ final price: <strong>{rupees(voucherPreviews.topic_test.finalAmountInPaise)}</strong>
                                    {voucherPreviews.topic_test.description ? <em className="ts-voucher-desc-note"> ({voucherPreviews.topic_test.description})</em> : null}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="ts-cta-buttons">
                            {!topicIsFree && (
                              <>
                                <button type="button" className="ts-add-to-cart-btn"
                                  onClick={() => handleAddToCart('topic_test')}
                                  disabled={Boolean(purchasingType)}
                                >
                                  {cartItems.some((i) => i.seriesType === 'topic_test') ? '✓ In Cart' : '🛒 Add to Cart'}
                                </button>
                                {cartItems.some((i) => i.seriesType === 'topic_test') && (
                                  <span className="ts-go-to-cart-hint">↑ tap 🛒 to checkout</span>
                                )}
                              </>
                            )}
                            <button type="button" className="primary-btn ts-plan-cta-btn"
                              onClick={() => handlePurchase('topic_test', voucherPreviews.topic_test?.voucherCode || undefined)}
                              disabled={Boolean(purchasingType)}>
                              {purchasingType === 'topic_test'
                                ? 'Processing…'
                                : topicIsFree
                                  ? 'Enroll Free — Topic Tests + Full Mocks'
                                  : voucherPreviews.topic_test
                                    ? 'Buy Now — ' + rupees(voucherPreviews.topic_test.finalAmountInPaise)
                                    : 'Buy Topic Test Series — ' + rupees(pricing.topicTestPriceInPaise)}
                            </button>
                            <button type="button" className="secondary-btn ts-plan-syllabus-btn"
                              onClick={() => openSyllabus('topic')}
                              disabled={loadingSyllabus}>
                              {loadingSyllabus ? '…' : '📋 View Full Syllabus'}
                            </button>
                            {topicIsFree && <span className="ts-free-badge">🎉 No payment required</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                  )}

                  {!hasTopicTest && !hasFullMock && (
                    <div className="ts-plan-banners-or">
                      <span className="ts-or-text">OR, if you only need mock tests</span>
                    </div>
                  )}

                  {/* ── Banner 2: Full Mock Series ── */}
                  {!hasFullMock && (
                  <article className="ts-plan-banner ts-plan-mock">
                    <div className="ts-plan-banner-badge ts-mock-badge">MOCK ONLY</div>
                    <div className="ts-plan-banner-inner">
                      <div className="ts-plan-banner-iconside">
                        <div className="ts-plan-banner-icon-circle mock-circle">{'\uD83D\uDDD2\uFE0F'}</div>
                        <div className="ts-plan-price-box">
                          <span className="ts-plan-price-val ts-mock-price-val">
                            {mockIsFree ? 'Free' : rupees(pricing.fullMockPriceInPaise)}
                          </span>
                          <span className="ts-plan-price-period">one-time · lifetime</span>
                        </div>
                      </div>
                      <div className="ts-plan-banner-details">
                        <h3 className="ts-plan-banner-name">
                          Full Mock Series <span className="ts-mock-only-tag">Mock Only</span>
                        </h3>
                        <p className="ts-plan-banner-tagline">
                          Simulate the real exam with full-length timed tests —
                          ideal for final-stage revision and self-assessment.
                        </p>
                        <div className="ts-plan-feat-grid">
                          <div className="ts-plan-feat-col">
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Full-length timed exam simulations</div>
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Detailed answer review after submission</div>
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Question navigator with mark-for-review</div>
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Lifetime access — no expiry</div>
                          </div>
                          <div className="ts-plan-feat-col">
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Score breakdown with percentage grade</div>
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Explanation for every answer</div>
                            <div className="ts-plan-feat ts-feat-cross"><span className="ts-feat-x">✗</span> Topic-wise tests not included</div>
                            <div className="ts-plan-feat ts-feat-cross"><span className="ts-feat-x">✗</span> Module-level tests not included</div>
                          </div>
                        </div>
                        <div className="ts-plan-cta-row">
                          {!mockIsFree && (
                            <div className="ts-voucher-row">
                              <div className="ts-voucher-input-group">
                                <input
                                  className="ts-voucher-input"
                                  type="text"
                                  placeholder="Have a voucher code?"
                                  value={voucherInputs.full_mock}
                                  onChange={(e) => {
                                    const v = e.target.value.toUpperCase();
                                    setVoucherInputs((prev) => ({ ...prev, full_mock: v }));
                                    if (!v) {
                                      setVoucherPreviews((prev) => ({ ...prev, full_mock: null }));
                                      setVoucherErrors((prev) => ({ ...prev, full_mock: '' }));
                                    }
                                  }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleApplyVoucher('full_mock'); }}
                                  maxLength={30}
                                />
                                {voucherPreviews.full_mock ? (
                                  <button type="button" className="ts-voucher-remove-btn" onClick={() => handleRemoveVoucher('full_mock')}>✕ Remove</button>
                                ) : (
                                  <button type="button" className="ts-voucher-apply-btn" onClick={() => handleApplyVoucher('full_mock')} disabled={voucherLoading.full_mock || !voucherInputs.full_mock}>
                                    {voucherLoading.full_mock ? '…' : 'Apply'}
                                  </button>
                                )}
                              </div>
                              {voucherErrors.full_mock && <p className="ts-voucher-error">{voucherErrors.full_mock}</p>}
                              {voucherPreviews.full_mock && (
                                <div className="ts-voucher-preview-box">
                                  <span className="ts-voucher-check">✓</span>
                                  <span className="ts-voucher-preview-text">
                                    <strong>{voucherPreviews.full_mock.voucherCode}</strong> applied — save {rupees(voucherPreviews.full_mock.discountInPaise)}
                                    {' '}→ final price: <strong>{rupees(voucherPreviews.full_mock.finalAmountInPaise)}</strong>
                                    {voucherPreviews.full_mock.description ? <em className="ts-voucher-desc-note"> ({voucherPreviews.full_mock.description})</em> : null}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="ts-cta-buttons">
                            {!mockIsFree && (
                              <>
                                <button type="button" className="ts-add-to-cart-btn"
                                  onClick={() => handleAddToCart('full_mock')}
                                  disabled={Boolean(purchasingType)}
                                >
                                  {cartItems.some((i) => i.seriesType === 'full_mock') ? '✓ In Cart' : '🛒 Add to Cart'}
                                </button>
                                {cartItems.some((i) => i.seriesType === 'full_mock') && (
                                  <span className="ts-go-to-cart-hint">↑ tap 🛒 to checkout</span>
                                )}
                              </>
                            )}
                            <button type="button" className="secondary-btn ts-plan-cta-btn ts-mock-cta-btn"
                              onClick={() => handlePurchase('full_mock', voucherPreviews.full_mock?.voucherCode || undefined)}
                              disabled={Boolean(purchasingType)}>
                              {purchasingType === 'full_mock'
                                ? 'Processing…'
                                : mockIsFree
                                  ? 'Enroll Free — Full Mock Tests'
                                  : voucherPreviews.full_mock
                                    ? 'Buy Now — ' + rupees(voucherPreviews.full_mock.finalAmountInPaise)
                                    : 'Buy Full Mock Series — ' + rupees(pricing.fullMockPriceInPaise)}
                            </button>
                            <button type="button" className="secondary-btn ts-plan-syllabus-btn"
                              onClick={() => openSyllabus('mock')}
                              disabled={loadingSyllabus}>
                              {loadingSyllabus ? '…' : '📋 View Full Syllabus'}
                            </button>
                            <p className="ts-plan-upsell-note">
                              💡 The <strong>Topic Test Series</strong> above includes Full Mocks{' '}
                              {topicIsFree ? 'at no extra cost' : 'as a free bonus'}.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                  )}

                </div>{/* /ts-plan-banners */}
              </section>
            )}

            {/* ─── UNLOCKED: Tests ─── */}
            {hasAnyAccess && (
              <>
                <div className="ts-access-badges">
                  {hasTopicTest && <span className="ts-access-badge ts-badge-topic">✅ Topic Tests Unlocked</span>}
                  {hasFullMock  && <span className="ts-access-badge ts-badge-mock">✅ Full Mocks Unlocked</span>}
                </div>

                <div className="ts-tabs">
                  {hasTopicTest && (
                    <button type="button"
                      className={'ts-tab-btn' + (activeTab === 'topic' ? ' active' : '')}
                      onClick={() => setActiveTab('topic')}>
                      📖 Topic Tests <span className="ts-tab-count">{topicTests.length}</span>
                    </button>
                  )}
                  {hasFullMock && (
                    <button type="button"
                      className={'ts-tab-btn' + (activeTab === 'mock' ? ' active' : '')}
                      onClick={() => setActiveTab('mock')}>
                      🗒️ Full Mock Tests <span className="ts-tab-count">{fullMocks.length}</span>
                    </button>
                  )}
                </div>

                {loadingTests && (
                  <div className="ts-loading-state">
                    <div className="ts-loading-spinner" />
                    <p>Loading tests…</p>
                  </div>
                )}

                {activeTab === 'topic' && hasTopicTest && !loadingTests && (
                  <div className="ts-test-grid">
                    {topicTests.length ? topicTests.map((test) => (
                      <article key={test._id} className="card ts-test-card">
                        <div className="ts-test-card-top">
                          <span className="ts-module-chip">{test.module}</span>
                          <span className="ts-difficulty-chip"
                            style={{ color: DIFFICULTY_COLOR[test.difficulty] || '#d97706' }}>
                            {test.difficulty}
                          </span>
                        </div>
                        <h4 className="ts-test-title">{test.title}</h4>
                        {test.topic && test.topic !== 'General' && (
                          <p className="ts-test-topic">{test.topic}</p>
                        )}
                        <div className="ts-test-meta">
                          <span className="ts-meta-chip">📝 {test.questionCount} Qs</span>
                          <span className="ts-meta-chip">⏱ {test.durationMinutes} min</span>
                        </div>
                        <button type="button" className="primary-btn ts-start-btn"
                          onClick={() => startTest(test._id, 'topic')}>
                          Start Test →
                        </button>
                      </article>
                    )) : (
                      <div className="ts-empty-state">
                        <span className="ts-empty-icon">📖</span>
                        <p>No topic tests for <strong>{course}</strong> yet.</p>
                        <p className="subtitle">Check back soon.</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'mock' && hasFullMock && !loadingTests && (
                  <div className="ts-test-grid">
                    {fullMocks.length ? fullMocks.map((mock) => (
                      <article key={mock._id} className="card ts-test-card ts-mock-test-card">
                        <div className="ts-test-card-top">
                          <span className="ts-module-chip ts-mock-chip">Full Mock</span>
                          <span className="ts-meta-chip">📝 {mock.questionCount} Qs</span>
                        </div>
                        <h4 className="ts-test-title">{mock.title}</h4>
                        {mock.description && <p className="ts-test-topic">{mock.description}</p>}
                        <div className="ts-test-meta">
                          <span className="ts-meta-chip">⏱ {mock.durationMinutes} min</span>
                          <span className="ts-meta-chip">{mock.category}</span>
                        </div>
                        <button type="button" className="primary-btn ts-start-btn"
                          onClick={() => startTest(mock._id, 'mock')}>
                          Start Mock Test →
                        </button>
                      </article>
                    )) : (
                      <div className="ts-empty-state">
                        <span className="ts-empty-icon">🗒️</span>
                        <p>No full mock tests for <strong>{course}</strong> yet.</p>
                        <p className="subtitle">Check back soon.</p>
                      </div>
                    )}
                  </div>
                )}

              </>
            )}
          </>
        )}

      </main>
    </AppShell>
  );
}