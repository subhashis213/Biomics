import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { fetchCourseBatchesStudent, fetchStudentCourseCatalog, fetchStudentCourseVouchers, resolveApiAssetUrl } from '../api';
import { useSessionStore } from '../stores/sessionStore';

function formatPriceInPaise(amountInPaise) {
  const amount = Number(amountInPaise || 0) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

export default function StudentCourseBatchesPage() {
  const navigate = useNavigate();
  const { courseName } = useParams();
  const { session } = useSessionStore();
  const [batches, setBatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [selectedPlanByBatch, setSelectedPlanByBatch] = useState({});
  const [coursePreview, setCoursePreview] = useState(null);
  const [availableVouchers, setAvailableVouchers] = useState([]);
  const [openCouponBatch, setOpenCouponBatch] = useState('');
  const [cartKeys, setCartKeys] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchCourseBatchesStudent(courseName);
        if (!cancelled) {
          setBatches(Array.isArray(res?.batches) ? res.batches : []);
        }
      } catch (err) {
        if (!cancelled) setBanner({ type: 'error', text: err.message || 'Failed to load batches.' });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [courseName]);

  useEffect(() => {
    let cancelled = false;
    async function loadVouchers() {
      try {
        const response = await fetchStudentCourseVouchers(decodeURIComponent(courseName || ''));
        if (!cancelled) setAvailableVouchers(Array.isArray(response?.vouchers) ? response.vouchers : []);
      } catch {
        if (!cancelled) setAvailableVouchers([]);
      }
    }
    loadVouchers();
    return () => { cancelled = true; };
  }, [courseName]);

  useEffect(() => {
    let cancelled = false;
    async function loadCoursePreview() {
      try {
        const response = await fetchStudentCourseCatalog();
        if (cancelled) return;
        const normalizedCourse = decodeURIComponent(courseName || '');
        const match = (Array.isArray(response?.courses) ? response.courses : []).find(
          (entry) => String(entry?.courseName || '').trim().toLowerCase() === normalizedCourse.toLowerCase()
        );
        setCoursePreview(match || null);
      } catch {
        if (!cancelled) setCoursePreview(null);
      }
    }
    loadCoursePreview();
    return () => { cancelled = true; };
  }, [courseName]);

  useEffect(() => {
    const next = {};
    batches.forEach((b) => { next[b.batchName] = next[b.batchName] || 'pro'; });
    setSelectedPlanByBatch((current) => ({ ...next, ...current }));
  }, [batches]);

  function getCartKey() {
    return `biomics:student-cart:${String(session?.username || '').toLowerCase()}`;
  }

  function refreshCartKeys() {
    try {
      const raw = localStorage.getItem(getCartKey());
      const current = raw ? JSON.parse(raw) : [];
      const keys = Array.isArray(current) ? current.map((item) => String(item?.key || '').trim()).filter(Boolean) : [];
      setCartKeys(new Set(keys));
    } catch {
      setCartKeys(new Set());
    }
  }

  useEffect(() => {
    refreshCartKeys();
    function handleStorageSync() {
      refreshCartKeys();
    }
    window.addEventListener('storage', handleStorageSync);
    return () => window.removeEventListener('storage', handleStorageSync);
  }, [session?.username]);

  const visibleBatches = batches;

  const decodedCourseName = decodeURIComponent(courseName || '');
  function handleAddBatchToCart(batch) {
    const planType = selectedPlanByBatch[batch.batchName] || 'pro';
    const storageKey = getCartKey();
    try {
      const raw = localStorage.getItem(storageKey);
      const current = raw ? JSON.parse(raw) : [];
      const key = `${courseName}::${batch.batchName}`;
      if (current.some((item) => item.key === key)) {
        setBanner({ type: 'success', text: `${batch.batchName} is already in cart.` });
        return;
      }
      const planPrices = {
        pro: Number(batch.proPriceInPaise || 0),
        elite: Number(batch.elitePriceInPaise || 0)
      };
      const next = [
        ...current,
        {
          key,
          moduleName: batch.batchName,
          moduleCourse: courseName,
          planType,
          planPrices,
          crossCourse: true
        }
      ];
      localStorage.setItem(storageKey, JSON.stringify(next));
      setCartKeys(new Set(next.map((item) => String(item?.key || '').trim()).filter(Boolean)));
      setBanner({ type: 'success', text: `${batch.batchName} added to cart.` });
    } catch (e) {
      setBanner({ type: 'error', text: 'Failed to update cart.' });
    }
  }

  return (
    <AppShell
      title={decodedCourseName}
      subtitle="Choose your premium batch and unlock access"
      roleLabel="Student"
      showThemeSwitch={false}
      actions={(
        <div className="student-course-catalog-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate('/student/courses')}>← Back</button>
          <button type="button" className="secondary-btn" onClick={() => navigate('/student', { state: { openCart: true } })}>🛒 Cart</button>
        </div>
      )}
    >
      <main className="student-batch-page">
        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}
        <section className="card student-batch-list-wrap">
          <div className="section-header compact">
            <div>
              <h3>{decodedCourseName}</h3>
            </div>
          </div>

          {isLoading ? <p className="empty-note">Loading batches...</p> : null}
          {!isLoading && !visibleBatches.length ? <p className="empty-note">No batches available for this course.</p> : null}

          <div className="student-batch-list">
            {visibleBatches.map((batch) => {
              const selectedPlan = selectedPlanByBatch[batch.batchName] || 'pro';
              const isPro = selectedPlan === 'pro';
              const salePrice = Number(isPro ? batch.proPriceInPaise : batch.elitePriceInPaise);
              const mrpPrice = Number(isPro ? batch.proMrpInPaise : batch.eliteMrpInPaise);
              const discountPercent = mrpPrice > salePrice && mrpPrice > 0
                ? Math.round(((mrpPrice - salePrice) / mrpPrice) * 100)
                : 0;
              const isLocked = salePrice > 0;
              const cartEntryKey = `${courseName}::${batch.batchName}`;
              const isInCart = cartKeys.has(cartEntryKey);

              return (
                <article key={batch.batchName} className="student-batch-card">
                  <div className="student-batch-card-media">
                    {batch.thumbnailUrl ? (
                      <img src={resolveApiAssetUrl(batch.thumbnailUrl)} alt={batch.batchName} />
                    ) : (
                      <div className="student-batch-card-media-fallback">📘</div>
                    )}
                    <button
                      type="button"
                      className={`student-batch-coupon ${openCouponBatch === batch.batchName ? 'is-open' : ''}`}
                      onClick={() => setOpenCouponBatch((current) => (current === batch.batchName ? '' : batch.batchName))}
                    >
                      {openCouponBatch === batch.batchName ? 'HIDE COUPONS' : 'COUPONS'}
                    </button>
                    <div className={`student-batch-coupon-panel ${openCouponBatch === batch.batchName ? 'is-open' : ''}`}>
                      {availableVouchers.length ? (
                        availableVouchers.slice(0, 4).map((voucher) => (
                          <div key={voucher.code} className="student-batch-coupon-chip">
                            <strong>{voucher.code}</strong>
                            <span>
                              {voucher.discountType === 'percent'
                                ? `${Math.round(voucher.discountValue)}% OFF`
                                : `₹${Math.round(voucher.discountValue / 100)} OFF`}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="student-batch-coupon-empty">No active coupons for this course right now.</p>
                      )}
                    </div>
                  </div>
                  <div className="student-batch-card-copy">
                    <div className="student-course-catalog-tags">
                      <span>LIVE CLASS</span>
                      <span>FREE CONTENT</span>
                    </div>
                    <h4>{batch.batchName}</h4>
                    <div className="student-course-catalog-controls">
                      <label className="student-course-plan-select">
                        <span>Choose plan</span>
                        <select
                          value={selectedPlan}
                          onChange={(e) => setSelectedPlanByBatch((cur) => ({ ...cur, [batch.batchName]: e.target.value }))}
                        >
                          <option value="pro">Pro - {formatPriceInPaise(batch.proPriceInPaise)}</option>
                          <option value="elite">Elite - {formatPriceInPaise(batch.elitePriceInPaise)}</option>
                        </select>
                      </label>
                    </div>
                    <div className="student-course-catalog-price-row">
                      <div className="student-course-catalog-price-stack">
                        <div>
                          <strong>{salePrice > 0 ? formatPriceInPaise(salePrice) : 'Free'}</strong>
                          {mrpPrice > salePrice && salePrice > 0 ? <small>{formatPriceInPaise(mrpPrice)}</small> : null}
                          {discountPercent > 0 ? <span>{discountPercent}% OFF</span> : null}
                        </div>
                      </div>
                      <div className={`student-batch-lock-pill ${isLocked ? 'locked' : 'free'}`}>
                        {isLocked ? '🔒 Locked' : '🔓 Free'}
                      </div>
                    </div>
                    <div className="student-course-catalog-cta-row">
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => {
                          if (isInCart) {
                            navigate('/student', { state: { openCart: true } });
                            return;
                          }
                          handleAddBatchToCart(batch);
                        }}
                      >
                        {isInCart ? 'Go to Cart' : '🛒 Add to Cart'}
                      </button>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => {
                          handleAddBatchToCart(batch);
                          navigate('/student', { state: { openCart: true } });
                        }}
                      >
                        Buy Now
                      </button>
                    </div>
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
