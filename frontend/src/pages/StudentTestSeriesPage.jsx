import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { previewTestSeriesVoucher, requestJson, resolveApiAssetUrl } from '../api';
import AppShell from '../components/AppShell';
import TopicTestCatalogBoard from '../components/TopicTestCatalogBoard';
import useAutoDismissMessage from '../hooks/useAutoDismissMessage';
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
const ACTIVE_TEST_SESSION_STORAGE_KEY = 'ts_active_exam_session_v1';

function getTsCartItemKey(item = {}) {
  const course = String(item.course || '').trim().toLowerCase();
  const seriesType = String(item.seriesType || '').trim().toLowerCase();
  return `${course}::${seriesType}`;
}

function readTestSeriesCart() {
  try {
    const saved = localStorage.getItem('ts_cart');
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        ...item,
        course: String(item?.course || '').trim(),
        seriesType: String(item?.seriesType || '').trim(),
        label: String(item?.label || '').trim()
      }))
      .filter((item) => item.course && item.seriesType);
  } catch {
    return [];
  }
}

function matchesRequestedTopic(test, requestedTopic) {
  const query = String(requestedTopic || '').trim().toLowerCase();
  if (!query) return true;

  return [test?.title, test?.topic, test?.module, test?.category, test?.description]
    .some((value) => String(value || '').toLowerCase().includes(query));
}

function restoreActiveTestSession(raw, username) {
  if (!raw || typeof raw !== 'object') return null;

  const storedUsername = String(raw.username || '').trim();
  const currentUsername = String(username || '').trim();
  if (storedUsername && currentUsername && storedUsername !== currentUsername) return null;

  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  const total = questions.length;
  if (!total) return null;

  const answersRaw = Array.isArray(raw.answers) ? raw.answers : [];
  const markedRaw = Array.isArray(raw.markedForReview) ? raw.markedForReview : [];
  const answers = Array.from({ length: total }, (_, i) => {
    const value = Number(answersRaw[i]);
    return Number.isInteger(value) && value >= -1 && value <= 3 ? value : -1;
  });
  const markedForReview = Array.from({ length: total }, (_, i) => Boolean(markedRaw[i]));

  const savedAt = Number(raw.savedAt || Date.now());
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
  const baseTimeLeft = Number(raw.timeLeft || 0);
  const adjustedTimeLeft = Math.max(0, Math.floor(baseTimeLeft) - elapsedSeconds);

  const currentQRaw = Number(raw.currentQ || 0);
  const currentQ = Number.isInteger(currentQRaw)
    ? Math.min(Math.max(0, currentQRaw), Math.max(0, total - 1))
    : 0;

  return {
    type: raw.type === 'mock' ? 'mock' : 'topic',
    test: raw.test,
    questions,
    answers,
    markedForReview,
    timeLeft: adjustedTimeLeft,
    submitted: false,
    result: null,
    currentQ,
    hasStarted: raw.hasStarted !== false,
    acceptedGuidelines: Boolean(raw.acceptedGuidelines),
    showQuitConfirm: false,
    showSubmitConfirm: false,
    isSubmitting: false
  };
}

// ── Inline cart button + drawer for Test Series page ─────────────────────────
function TsCartButton({ session, openOnLoad = false }) {
  const [items, setItems] = useState(() => readTestSeriesCart());
  const [open, setOpen] = useState(false);
  const [checkoutKey, setCheckoutKey] = useState('');
  const hasAutoOpenedRef = useRef(false);

  useEffect(() => {
    if (!openOnLoad || hasAutoOpenedRef.current) return;
    hasAutoOpenedRef.current = true;
    setOpen(true);
  }, [openOnLoad]);

  // Re-read cart when localStorage changes (cross-tab or after add-to-cart)
  useEffect(() => {
    function sync() {
      setItems(readTestSeriesCart());
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

  function remove(itemToRemove) {
    setItems((prev) => {
      const removeKey = getTsCartItemKey(itemToRemove);
      const next = prev.filter((i) => getTsCartItemKey(i) !== removeKey);
      try { localStorage.setItem('ts_cart', JSON.stringify(next)); } catch {}
      window.dispatchEvent(new Event('ts-cart-updated'));
      return next;
    });
  }

  async function checkout(item) {
    if (checkoutKey) return;
    setCheckoutKey(getTsCartItemKey(item));
    try {
      const orderRes = await requestJson('/test-series/payment/create-order', {
        method: 'POST',
        body: JSON.stringify({
          course: item.course,
          seriesType: item.seriesType,
          ...(item.voucherCode ? { voucherCode: item.voucherCode } : {})
        })
      });
      if (orderRes?.alreadyOwned || orderRes?.free) {
        remove(item);
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
                  seriesType: item.seriesType,
                  course: item.course
                })
              });
              remove(item);
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
                    <article key={getTsCartItemKey(item)} className="student-cart-drawer-item">
                      <div>
                        <div className="student-cart-item-headline">
                          <strong>{item.label}</strong>
                          <span className="student-cart-course-chip tone-default">{item.course}</span>
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
                        <button type="button" className="secondary-btn" onClick={() => remove(item)}>
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
  const location = useLocation();
  const { session } = useSessionStore();
  const hasHydratedTestSessionRef = useRef(false);
  const hasAutoStartedFromQueryRef = useRef(false);

  const [accessData, setAccessData]         = useState(null);
  const [catalogCourses, setCatalogCourses] = useState([]);
  const [loadingAccess, setLoadingAccess]   = useState(true);
  const [topicTests, setTopicTests]         = useState([]);
  const [fullMocks,  setFullMocks]          = useState([]);
  const [loadingTests, setLoadingTests]     = useState(false);
  const [activeTab, setActiveTab]           = useState('topic');
  const [requestedTopic, setRequestedTopic] = useState('');
  const [purchasingType, setPurchasingType] = useState('');
  const [banner, setBanner]                 = useState(null);
  const [showRenewPrompt, setShowRenewPrompt] = useState(false);
  const [renewPromptDismissed, setRenewPromptDismissed] = useState(false);
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
  const [cartItems, setCartItems] = useState(() => readTestSeriesCart());
  const [cartCheckoutST, setCartCheckoutST] = useState(''); // which cart item is being checked out

  useAutoDismissMessage(banner, setBanner);

  // Persist cart to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('ts_cart', JSON.stringify(cartItems));
    } catch { /* storage full or unavailable */ }
    window.dispatchEvent(new Event('ts-cart-updated'));
  }, [cartItems]);

  useEffect(() => {
    function syncCartItems() {
      setCartItems(readTestSeriesCart());
    }

    window.addEventListener('storage', syncCartItems);
    window.addEventListener('ts-cart-updated', syncCartItems);

    return () => {
      window.removeEventListener('storage', syncCartItems);
      window.removeEventListener('ts-cart-updated', syncCartItems);
    };
  }, []);

  const timerRef = useRef(null);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    if (hasHydratedTestSessionRef.current) return;
    hasHydratedTestSessionRef.current = true;
    try {
      const raw = localStorage.getItem(ACTIVE_TEST_SESSION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const restored = restoreActiveTestSession(parsed, session?.username);
      if (!restored) {
        localStorage.removeItem(ACTIVE_TEST_SESSION_STORAGE_KEY);
        return;
      }
      setTestSession(restored);
      setShowReview(false);
    } catch {
      localStorage.removeItem(ACTIVE_TEST_SESSION_STORAGE_KEY);
    }
  }, [session?.username]);

  useEffect(() => {
    if (!testSession || testSession.submitted) {
      localStorage.removeItem(ACTIVE_TEST_SESSION_STORAGE_KEY);
      return;
    }

    const payload = {
      username: session?.username || '',
      type: testSession.type,
      test: testSession.test,
      questions: testSession.questions,
      answers: testSession.answers,
      markedForReview: testSession.markedForReview,
      timeLeft: testSession.timeLeft,
      currentQ: testSession.currentQ,
      hasStarted: Boolean(testSession.hasStarted),
      acceptedGuidelines: Boolean(testSession.acceptedGuidelines),
      savedAt: Date.now()
    };

    try {
      localStorage.setItem(ACTIVE_TEST_SESSION_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota failures to keep exam flow uninterrupted.
    }
  }, [
    session?.username,
    testSession?.type,
    testSession?.test,
    testSession?.questions,
    testSession?.answers,
    testSession?.markedForReview,
    testSession?.timeLeft,
    testSession?.currentQ,
    testSession?.submitted
  ]);

  // ── Access & test loading ─────────────────────────────────────────────────

  async function loadAccess() {
    setLoadingAccess(true);
    try {
      const selectedCourse = String(new URLSearchParams(location.search).get('course') || '').trim();
      const pricingEndpoint = selectedCourse
        ? `/test-series/pricing/student?course=${encodeURIComponent(selectedCourse)}`
        : '/test-series/pricing/student';
      const [res, catalogRes] = await Promise.all([
        requestJson(pricingEndpoint),
        requestJson('/test-series/catalog/student')
      ]);
      setAccessData(res || null);
      const courses = Array.isArray(catalogRes?.courses) ? catalogRes.courses : [];
      setCatalogCourses(courses);

      const accessKeySet = new Set();
      courses.forEach((courseEntry) => {
        if (courseEntry?.access?.hasTopicTest) {
          accessKeySet.add(`${String(courseEntry.courseName || '').trim().toLowerCase()}::topic_test`);
        }
        if (courseEntry?.access?.hasFullMock) {
          accessKeySet.add(`${String(courseEntry.courseName || '').trim().toLowerCase()}::full_mock`);
        }
      });

      // Remove already-owned course/series combinations from cart
      setCartItems((prev) => prev.filter((item) => {
        const key = getTsCartItemKey(item);
        return !accessKeySet.has(key);
      }));
    } catch {
      setAccessData(null);
      setCatalogCourses([]);
    } finally {
      setLoadingAccess(false);
    }
  }

  async function loadTests(data) {
    const access = data?.access ?? accessData?.access;
    const selectedCourse = String(data?.course || accessData?.course || '').trim();
    const querySuffix = selectedCourse ? `?course=${encodeURIComponent(selectedCourse)}` : '';
    const jobs = [];
    if (access?.hasTopicTest) {
      jobs.push(
        requestJson(`/test-series/topic-tests/student${querySuffix}`)
          .then((r) => setTopicTests(Array.isArray(r?.tests) ? r.tests : []))
          .catch(() => setTopicTests([]))
      );
    } else { setTopicTests([]); }
    if (access?.hasFullMock) {
      jobs.push(
        requestJson(`/test-series/full-mocks/student${querySuffix}`)
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

  useEffect(() => { loadAccess(); }, [location.search]);
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
    const targetCourse = String(accessData?.course || '').trim();
    if (!code) return;
    setVoucherLoading((prev) => ({ ...prev, [seriesType]: true }));
    setVoucherErrors((prev) => ({ ...prev, [seriesType]: '' }));
    setVoucherPreviews((prev) => ({ ...prev, [seriesType]: null }));
    try {
      const res = await previewTestSeriesVoucher(seriesType, code, targetCourse);
      if (!res?.valid) {
        setVoucherErrors((prev) => ({ ...prev, [seriesType]: res?.reason || 'Invalid or expired voucher.' }));
      } else {
        setVoucherPreviews((prev) => ({ ...prev, [seriesType]: res }));
        // Update cart item if already in cart
        setCartItems((prev) => prev.map((item) =>
          item.seriesType === seriesType && String(item.course || '').trim() === targetCourse
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
    const targetCourse = String(accessData?.course || '').trim();
    setVoucherPreviews((prev) => ({ ...prev, [seriesType]: null }));
    setVoucherInputs((prev) => ({ ...prev, [seriesType]: '' }));
    setVoucherErrors((prev) => ({ ...prev, [seriesType]: '' }));
    setCartItems((prev) => prev.map((item) =>
      item.seriesType === seriesType && String(item.course || '').trim() === targetCourse
        ? { ...item, finalPaise: item.originalPaise, voucherCode: null, discountPaise: 0 }
        : item
    ));
  }

  function handleAddToCart(seriesType, selectedCourse = '') {
    const label = seriesType === 'topic_test' ? 'Topic Test Series' : 'Full Mock Series';
    const priceKey = seriesType === 'topic_test' ? 'topicTestPriceInPaise' : 'fullMockPriceInPaise';
    const normalizedCourse = String(selectedCourse || accessData?.course || '').trim();
    const selectedCatalog = catalogCourses.find((entry) => String(entry?.courseName || '').trim() === normalizedCourse);
    const pricingData = selectedCatalog?.pricing || accessData?.pricing || {};
    const originalPaise = Number(pricingData[priceKey] || 0);
    const preview = voucherPreviews[seriesType];
    const finalPaise = preview ? preview.finalAmountInPaise : originalPaise;
    const voucherCode = preview ? preview.voucherCode : null;
    const discountPaise = preview ? preview.discountInPaise : 0;

    // Build the new cart value synchronously BEFORE touching React state
    const current = readTestSeriesCart();
    const itemKey = `${normalizedCourse.toLowerCase()}::${seriesType}`;
    const next = [
      ...current.filter((item) => getTsCartItemKey(item) !== itemKey),
      { course: normalizedCourse, seriesType, label, originalPaise, finalPaise, voucherCode, discountPaise }
    ];
    // Write to localStorage FIRST so TsCartButton reads the correct value when the event fires
    try { localStorage.setItem('ts_cart', JSON.stringify(next)); } catch {}
    // Notify TsCartButton (and dashboard) immediately — localStorage is already updated
    window.dispatchEvent(new Event('ts-cart-updated'));
    // Sync React state (the useEffect persist is now a no-op because localStorage is already current)
    setCartItems(next);
    setBanner({ type: 'success', text: `${label} added to cart!` });
  }

  function handleRemoveFromCart(seriesType, selectedCourse = '') {
    const normalizedCourse = String(selectedCourse || accessData?.course || '').trim();
    const removeKey = `${normalizedCourse.toLowerCase()}::${seriesType}`;
    const current = readTestSeriesCart();
    const next = current.filter((item) => getTsCartItemKey(item) !== removeKey);
    try { localStorage.setItem('ts_cart', JSON.stringify(next)); } catch {}
    window.dispatchEvent(new Event('ts-cart-updated'));
    setCartItems(next);
  }

  // ── Payment ───────────────────────────────────────────────────────────────

  async function handlePurchase(seriesType, voucherCode, selectedCourse = '') {
    if (purchasingType) return;
    setPurchasingType(seriesType);
    setBanner(null);
    try {
      const course = String(selectedCourse || accessData?.course || '').trim();
      const orderRes = await requestJson('/test-series/payment/create-order', {
        method: 'POST',
        body: JSON.stringify({ course, seriesType, ...(voucherCode ? { voucherCode } : {}) })
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
        setCartItems((prev) => prev.filter((item) => getTsCartItemKey(item) !== `${course.toLowerCase()}::${seriesType}`));
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
                  seriesType,
                  course
                })
              });
              setBanner({ type: 'success', text: (seriesType === 'topic_test' ? 'Topic Test Series (+ Full Mocks)' : 'Full Mock Series') + ' unlocked!' });
              setCartItems((prev) => prev.filter((item) => getTsCartItemKey(item) !== `${course.toLowerCase()}::${seriesType}`));
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
      const selectedCourse = String(accessData?.course || '').trim();
      const querySuffix = selectedCourse ? `?course=${encodeURIComponent(selectedCourse)}` : '';
      const endpoint = type === 'topic'
        ? '/test-series/topic-tests/student/' + testId + querySuffix
        : '/test-series/full-mocks/student/' + testId + querySuffix;
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
        currentQ: 0,
        hasStarted: false,
        acceptedGuidelines: false,
        showQuitConfirm: false,
        showSubmitConfirm: false,
        isSubmitting: false
      });
    } catch (e) {
      setBanner({ type: 'error', text: e.message || 'Failed to load test.' });
    }
  }

  // Timer
  useEffect(() => {
    if (!testSession || testSession.submitted || !testSession.hasStarted) return undefined;
    timerRef.current = window.setInterval(() => {
      setTestSession((prev) => {
        if (!prev || prev.submitted || !prev.hasStarted) return prev;
        const next = prev.timeLeft - 1;
        if (next <= 0) { handleSubmitTest(prev); return { ...prev, timeLeft: 0 }; }
        return { ...prev, timeLeft: next };
      });
    }, 1000);
    return () => window.clearInterval(timerRef.current);
  }, [testSession?.test?._id, testSession?.submitted, testSession?.hasStarted]);

  async function handleSubmitTest(snap = testSession) {
    if (!snap || snap.submitted) return;
    window.clearInterval(timerRef.current);
    setTestSession((prev) => (prev ? { ...prev, isSubmitting: true } : prev));
    try {
      const endpoint = snap.type === 'topic'
        ? '/test-series/topic-tests/student/' + snap.test._id + '/submit'
        : '/test-series/full-mocks/student/' + snap.test._id + '/submit';
      const result = await requestJson(endpoint, {
        method: 'POST',
        body: JSON.stringify({ answers: snap.answers, course: String(accessData?.course || '').trim() })
      });
      setShowReview(false);
      setTestSession((prev) => prev ? {
        ...prev,
        submitted: true,
        result,
        showQuitConfirm: false,
        showSubmitConfirm: false,
        isSubmitting: false
      } : prev);
    } catch (e) {
      setTestSession((prev) => prev ? { ...prev, isSubmitting: false } : prev);
      setBanner({ type: 'error', text: e.message || 'Failed to submit test.' });
    }
  }

  useEffect(() => {
    if (!testSession || testSession.submitted || testSession.isSubmitting || !testSession.hasStarted) return undefined;

    const triggerSecuritySubmit = () => {
      if (autoSubmittedRef.current) return;
      autoSubmittedRef.current = true;
      setBanner({ type: 'warn', text: 'Tab switching or window change was detected. Your test has been submitted automatically.' });
      handleSubmitTest({ ...testSession, showQuitConfirm: false, showSubmitConfirm: false });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) triggerSecuritySubmit();
    };

    const handleWindowBlur = () => {
      if (document.visibilityState === 'hidden' || !document.hasFocus()) {
        triggerSecuritySubmit();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [testSession]);

  function startTestFromInstructions() {
    setTestSession((prev) => {
      if (!prev || prev.submitted || prev.isSubmitting || !prev.acceptedGuidelines) return prev;
      autoSubmittedRef.current = false;
      return {
        ...prev,
        hasStarted: true,
        showQuitConfirm: false,
        showSubmitConfirm: false
      };
    });
  }

  function openSubmitConfirm() {
    setTestSession((prev) => {
      if (!prev || prev.submitted || prev.isSubmitting) return prev;
      return { ...prev, showSubmitConfirm: true };
    });
  }

  function closeSubmitConfirm() {
    setTestSession((prev) => {
      if (!prev || prev.isSubmitting) return prev;
      return { ...prev, showSubmitConfirm: false };
    });
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
      answers[qi] = answers[qi] === oi ? -1 : oi;
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

  function hasCartEntry(courseName, seriesType) {
    const courseKey = String(courseName || '').trim().toLowerCase();
    return cartItems.some((item) => getTsCartItemKey(item) === `${courseKey}::${seriesType}`);
  }

  const hasTopicTest  = Boolean(accessData?.access?.hasTopicTest);
  const hasFullMock   = Boolean(accessData?.access?.hasFullMock);
  const hasExpiredAccess = Boolean(accessData?.access?.anyExpired);
  const pricing       = accessData?.pricing || {};
  const topicValidityDays = Number(pricing.topicTestValidityDays || 60);
  const mockValidityDays = Number(pricing.fullMockValidityDays || 60);
  const course        = accessData?.course || '';
  const hasAnyAccess  = hasTopicTest || hasFullMock;
  const topicIsFree   = !(pricing.topicTestPriceInPaise > 0);
  const mockIsFree    = !(pricing.fullMockPriceInPaise > 0);
  const filteredTopicTests = requestedTopic
    ? topicTests.filter((test) => matchesRequestedTopic(test, requestedTopic))
    : topicTests;
  const openCartOnLoad = new URLSearchParams(location.search).get('cart') === 'open';

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedTab = params.get('tab');
    const topicFromQuery = String(params.get('topic') || location.state?.focusTopic || '').trim();
    hasAutoStartedFromQueryRef.current = false;

    if (requestedTab === 'topic' || requestedTab === 'mock') {
      setActiveTab(requestedTab);
    }

    setRequestedTopic(topicFromQuery);

    if (location.state?.fromChatAgent) {
      setBanner({
        type: 'success',
        text: topicFromQuery
          ? `Opened topic tests for ${topicFromQuery}.`
          : requestedTab === 'mock'
            ? 'Opened the full mock test section.'
            : 'Opened the topic test section.'
      });
    }
  }, [location.search, location.state]);

  useEffect(() => {
    if (hasTopicTest && !hasFullMock && activeTab !== 'topic') {
      setActiveTab('topic');
      return;
    }
    if (!hasTopicTest && hasFullMock && activeTab !== 'mock') {
      setActiveTab('mock');
    }
  }, [hasTopicTest, hasFullMock, activeTab]);

  useEffect(() => {
    const testId = new URLSearchParams(location.search).get('testId');
    if (!testId || !hasTopicTest || loadingTests || testSession || hasAutoStartedFromQueryRef.current) return;

    const matchedTest = topicTests.find((test) => test._id === testId);
    if (!matchedTest) return;

    hasAutoStartedFromQueryRef.current = true;
    startTest(testId, 'topic');
  }, [location.search, hasTopicTest, loadingTests, testSession, topicTests]);

  useEffect(() => {
    if (!hasExpiredAccess || renewPromptDismissed) return;
    setShowRenewPrompt(true);
    setBanner({ type: 'warn', text: 'Your Test Series subscription has expired. Renew to continue access.' });
  }, [hasExpiredAccess, renewPromptDismissed]);

  if (testSession && !testSession.submitted && !testSession.hasStarted) {
    const { test, questions, acceptedGuidelines } = testSession;
    const examLabel = testSession.type === 'mock' ? 'Mock Test' : 'Topic Test';

    return (
      <AppShell
        title={test.title}
        subtitle={test.category + (test.module ? ' · ' + test.module : '')}
        roleLabel="Student"
        showThemeSwitch
      >
        <main className="admin-workspace-page">
          {banner ? <div className={'ts-top-banner ts-top-banner-' + banner.type}>{banner.text}</div> : null}
          <section className="quiz-instruction-panel">
            <div className="quiz-instruction-hero">
              <p className="eyebrow">Exam Instructions</p>
              <h3>Read carefully before starting</h3>
              <p>
                This {examLabel.toLowerCase()} contains <strong>{questions.length}</strong> questions and the total time is{' '}
                <strong>{test.durationMinutes || 30} minutes</strong>.
              </p>
            </div>

            <div className="quiz-instruction-grid">
              <article className="quiz-instruction-stat">
                <span>Total Questions</span>
                <strong>{questions.length}</strong>
              </article>
              <article className="quiz-instruction-stat">
                <span>Total Time</span>
                <strong>{test.durationMinutes || 30} min</strong>
              </article>
              <article className="quiz-instruction-stat">
                <span>Mode</span>
                <strong>{examLabel}</strong>
              </article>
            </div>

            <ul className="quiz-rules-list">
              <li className="quiz-rule-item">Read each question carefully and use the navigator to move between questions.</li>
              <li className="quiz-rule-item">You can mark questions for review and return to them before final submission.</li>
              <li className="quiz-rule-item">If you switch tabs, minimize the browser, or move away from the exam window, the test will be submitted automatically.</li>
              <li className="quiz-rule-item">Once submitted, the attempt is locked and scored immediately.</li>
            </ul>

            <label className="quiz-instruction-ack">
              <input
                type="checkbox"
                checked={acceptedGuidelines}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setTestSession((prev) => (prev ? { ...prev, acceptedGuidelines: checked } : prev));
                }}
              />
              <span>
                I have read the instructions and understand that switching tabs or doing other activity outside the exam will auto-submit my attempt.
              </span>
            </label>

            <div className="quiz-instruction-cta">
              <button type="button" className="secondary-btn" onClick={quitTest}>
                Back to Tests
              </button>
              <button type="button" className="primary-btn" disabled={!acceptedGuidelines} onClick={startTestFromInstructions}>
                Start {examLabel}
              </button>
            </div>
          </section>
        </main>
      </AppShell>
    );
  }

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
          {banner ? <div className={'ts-top-banner ts-top-banner-' + banner.type}>{banner.text}</div> : null}

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
                    <div className="ts-review-question-body">
                      <p className="ts-review-q-text">{item.question}</p>
                      {item.imageUrl ? (
                        <img
                          src={resolveApiAssetUrl(item.imageUrl)}
                          alt={item.imageName || `Review question ${i + 1}`}
                          className="ts-question-image"
                        />
                      ) : null}
                    </div>
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
    const { test, questions, answers, markedForReview, timeLeft, currentQ, showQuitConfirm, showSubmitConfirm, isSubmitting } = testSession;
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

              <div className="ts-question-body">
                <p className="ts-question-text">{q.question}</p>
                {q.imageUrl ? (
                  <img
                    src={resolveApiAssetUrl(q.imageUrl)}
                    alt={q.imageName || `Question ${currentQ + 1}`}
                    className="ts-question-image"
                  />
                ) : null}
              </div>

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
                      onClick={openSubmitConfirm}
                      disabled={isSubmitting}>
                      {isSubmitting ? 'Submitting...' : 'Submit Test'}
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

              <button type="button" className="primary-btn ts-nav-submit-btn" onClick={openSubmitConfirm} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : `Submit Test (${answeredCount}/${questions.length})`}
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

        {showSubmitConfirm && createPortal(
          <div
            className="ts-quit-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Submit test confirmation"
            onClick={(event) => {
              if (event.target === event.currentTarget) closeSubmitConfirm();
            }}
          >
            <div className="ts-quit-modal ts-submit-modal">
              <div className="ts-quit-icon-wrap"><span className="ts-quit-icon">📝</span></div>
              <h3 className="ts-quit-title">Ready to submit?</h3>
              <p className="ts-quit-body">
                You have answered <strong>{answeredCount}</strong> out of <strong>{questions.length}</strong> questions.
                {unansweredCount > 0 ? ` ${unansweredCount} question${unansweredCount === 1 ? ' is' : 's are'} still unanswered.` : ' All questions are answered.'}
              </p>
              <div className="ts-quit-stats ts-submit-stats">
                <div className="ts-quit-stat">
                  <span className="ts-qs-val ts-qs-answered">{answeredCount}</span>
                  <span className="ts-qs-key">Answered</span>
                </div>
                <div className="ts-quit-stat">
                  <span className="ts-qs-val ts-qs-blank">{unansweredCount}</span>
                  <span className="ts-qs-key">Unanswered</span>
                </div>
                {markedCount > 0 && (
                  <div className="ts-quit-stat">
                    <span className="ts-qs-val ts-qs-marked">{markedCount}</span>
                    <span className="ts-qs-key">Marked</span>
                  </div>
                )}
              </div>
              <div className="ts-submit-note">
                <span className="ts-submit-note-accent">Final check:</span> once submitted, this attempt is locked and scored immediately.
              </div>
              <div className="ts-quit-actions ts-submit-actions">
                <button type="button" className="secondary-btn" onClick={closeSubmitConfirm} disabled={isSubmitting}>
                  Review Again
                </button>
                <button
                  type="button"
                  className="primary-btn ts-submit-confirm-btn"
                  onClick={() => handleSubmitTest()}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : 'Yes, Submit Test'}
                </button>
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
                onClick={() => { const st = isTopicType ? 'topic_test' : 'full_mock'; setSyllabusView(null); handlePurchase(st, voucherPreviews[st]?.voucherCode || undefined, syllabusView?.course || course); }}
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
                onClick={() => { const st = isTopicType ? 'topic_test' : 'full_mock'; setSyllabusView(null); handlePurchase(st, voucherPreviews[st]?.voucherCode || undefined, syllabusView?.course || course); }}
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
      subtitle="Topic-wise tests and full-length mock exams — each subscription is valid for 2 months"
      roleLabel="Student" showThemeSwitch
      actions={
        <>
          <TsCartButton session={session} openOnLoad={openCartOnLoad} />
          <button type="button" className="secondary-btn" onClick={() => navigate('/student')}>← Dashboard</button>
        </>
      }
    >
      <main className="admin-workspace-page">

        {/* Hero */}
        <section className="workspace-hero workspace-hero-testseries">
          <div className="ts-hero-content">
            <p className="eyebrow">Test Series</p>
            <h2>Sharpen your exam preparation</h2>
            <p className="subtitle">
              {hasAnyAccess
                ? 'You have active access. Start a test below.'
                : 'Choose a plan to unlock high-quality tests for your exam.'}
            </p>
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
                    <h2 className="ts-paywall-title">Unlock Test Series Subscription</h2>
                    <p className="ts-paywall-desc">
                      {hasExpiredAccess
                        ? 'Your subscription has ended. Renew now to continue topic tests and full mocks.'
                        : hasAnyAccess
                          ? 'Upgrade your access with the remaining test series plan.'
                          : 'Test Series is a premium add-on, separate from your regular learning plan. Pick the option that matches your preparation level.'}
                    </p>
                    <p className="ts-paywall-desc">Click the plan button below to open the dedicated course-wise purchase page.</p>
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
                          <span className="ts-plan-price-val">Course-wise pricing</span>
                          <span className="ts-plan-price-period">open course chooser to pick course · valid for {topicValidityDays} days</span>
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
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> All module &amp; topic-wise tests</div>
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
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Validity: {topicValidityDays} days from purchase date</div>
                          </div>
                        </div>
                        <div className="ts-plan-cta-row">
                          <div className="ts-cta-buttons">
                            <button
                              type="button"
                              className="primary-btn ts-plan-cta-btn"
                              onClick={() => navigate('/student/test-series/purchase?plan=topic_test')}
                            >
                              Choose Course & Buy Topic Test Series
                            </button>
                            <button type="button" className="secondary-btn ts-plan-syllabus-btn"
                              onClick={() => openSyllabus('topic')}
                              disabled={loadingSyllabus}>
                              {loadingSyllabus ? '…' : '📋 View Full Syllabus'}
                            </button>
                            <p className="ts-plan-upsell-note">
                              This opens a dedicated purchase page for topic-test plans.
                            </p>
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
                          <span className="ts-plan-price-val ts-mock-price-val">Course-wise pricing</span>
                          <span className="ts-plan-price-period">open course chooser to pick course · valid for {mockValidityDays} days</span>
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
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Validity: {mockValidityDays} days from purchase date</div>
                          </div>
                          <div className="ts-plan-feat-col">
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Score breakdown with percentage grade</div>
                            <div className="ts-plan-feat"><span className="ts-feat-check">✓</span> Explanation for every answer</div>
                            <div className="ts-plan-feat ts-feat-cross"><span className="ts-feat-x">✗</span> Topic-wise tests not included</div>
                            <div className="ts-plan-feat ts-feat-cross"><span className="ts-feat-x">✗</span> Module-level tests not included</div>
                          </div>
                        </div>
                        <div className="ts-plan-cta-row">
                          <div className="ts-cta-buttons">
                            <button
                              type="button"
                              className="secondary-btn ts-plan-cta-btn ts-mock-cta-btn"
                              onClick={() => navigate('/student/test-series/purchase?plan=full_mock')}
                            >
                              Choose Course & Buy Full Mock Series
                            </button>
                            <button type="button" className="secondary-btn ts-plan-syllabus-btn"
                              onClick={() => openSyllabus('mock')}
                              disabled={loadingSyllabus}>
                              {loadingSyllabus ? '…' : '📋 View Full Syllabus'}
                            </button>
                            <p className="ts-plan-upsell-note">
                              💡 The <strong>Topic Test Series</strong> above includes Full Mocks{' '}
                              as a free bonus.
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
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => navigate('/student/test-series/purchase?plan=topic_test')}
                  >
                    Buy for Another Course
                  </button>
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

                {requestedTopic && activeTab === 'topic' ? (
                  <div className="ts-top-banner ts-top-banner-success">
                    Showing topic tests matching <strong>{requestedTopic}</strong>.
                    <button type="button" className="secondary-btn" style={{ marginLeft: '10px' }} onClick={() => setRequestedTopic('')}>
                      Clear Filter
                    </button>
                  </div>
                ) : null}

                {loadingTests && (
                  <div className="ts-loading-state">
                    <div className="ts-loading-spinner" />
                    <p>Loading tests…</p>
                  </div>
                )}

                {activeTab === 'topic' && hasTopicTest && !loadingTests && (
                  <TopicTestCatalogBoard
                    tests={filteredTopicTests}
                    mode="student"
                    title={course ? `${course} topic tests` : 'Topic tests'}
                    subtitle="Browse module containers, open the right topic bucket, and start the exact test you need."
                    emptyMessage={requestedTopic ? `No topic tests found for ${requestedTopic} yet.` : `No topic tests for ${course} yet.`}
                    searchValue={requestedTopic}
                    onSearchChange={setRequestedTopic}
                    toolbar={(
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => navigate(`/student/test-series/topic-tests/catalog${requestedTopic ? `?topic=${encodeURIComponent(requestedTopic)}` : ''}`)}
                      >
                        Open Spacious View
                      </button>
                    )}
                    renderCardActions={(test) => (
                      <button type="button" className="primary-btn ts-start-btn" onClick={() => startTest(test._id, 'topic')}>
                        Start Test
                      </button>
                    )}
                  />
                )}

                {showRenewPrompt && (
                  <div className="confirm-modal-backdrop" role="presentation" onClick={() => setShowRenewPrompt(false)}>
                    <section className="card confirm-modal" role="dialog" aria-label="Renew test series subscription" onClick={(event) => event.stopPropagation()}>
                      <p className="eyebrow">Subscription Expired</p>
                      <h2>Renew your Test Series</h2>
                      <p className="subtitle">Your previous access period has ended. Renew now to continue topic-wise and mock test practice.</p>
                      <div className="confirm-modal-actions">
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => {
                            setShowRenewPrompt(false);
                            setRenewPromptDismissed(true);
                          }}
                        >
                          Remind Me Later
                        </button>
                        <button type="button" className="primary-btn" onClick={() => setShowRenewPrompt(false)}>
                          Renew Subscription
                        </button>
                      </div>
                    </section>
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