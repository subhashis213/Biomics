import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { fetchCourseBatchesStudent, fetchStudentCourseCatalog, resolveApiAssetUrl } from '../api';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [coursePreview, setCoursePreview] = useState(null);

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

  const normalizedSearch = String(searchTerm || '').trim().toLowerCase();
  const visibleBatches = batches.filter((batch) => {
    if (!normalizedSearch) return true;
    return String(batch.batchName || '').toLowerCase().includes(normalizedSearch);
  });

  const decodedCourseName = decodeURIComponent(courseName || '');
  const heroThumbnail = resolveApiAssetUrl(coursePreview?.thumbnailUrl || '');

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
        <section className="card student-batch-hero">
          <div className="student-batch-hero-media">
            {heroThumbnail ? (
              <img src={heroThumbnail} alt={decodedCourseName} />
            ) : (
              <div className="student-batch-hero-fallback">🎯</div>
            )}
          </div>
          <div className="student-batch-hero-copy">
            <p className="eyebrow">Course Batches</p>
            <h3>{decodedCourseName}</h3>
            <p>Select a batch below. Paid batches show lock icon and offer pricing similar to premium marketplaces.</p>
            <label className="student-course-catalog-search" htmlFor="student-batch-search">
              <span aria-hidden="true">🔎</span>
              <input
                id="student-batch-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search batches"
              />
            </label>
          </div>
        </section>

        <section className="card student-batch-list-wrap">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Batches</p>
              <h3>{decodedCourseName} ({visibleBatches.length})</h3>
            </div>
          </div>

          {isLoading ? <p className="empty-note">Loading batches...</p> : null}
          {!isLoading && !visibleBatches.length ? <p className="empty-note">No batches found for this search.</p> : null}

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

              return (
                <article key={batch.batchName} className="student-batch-card">
                  <div className="student-batch-card-media">
                    {heroThumbnail ? <img src={heroThumbnail} alt={batch.batchName} /> : <div className="student-batch-card-media-fallback">📘</div>}
                    <div className="student-batch-coupon">COUPONS</div>
                  </div>
                  <div className="student-batch-card-copy">
                    <div className="student-course-catalog-tags">
                      <span>NEW</span>
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
                      <button type="button" className="secondary-btn" onClick={() => handleAddBatchToCart(batch)}>🛒 Add to Cart</button>
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
