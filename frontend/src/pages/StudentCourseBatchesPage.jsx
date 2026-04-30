import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { fetchBatchModulesStudent, fetchCourseBatchesStudent, fetchStudentCourseVouchers, resolveApiAssetUrl } from '../api';
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
  const [availableVouchers, setAvailableVouchers] = useState([]);
  const [openCouponBatch, setOpenCouponBatch] = useState('');
  const [cartKeys, setCartKeys] = useState(new Set());
  const [modulesByBatch, setModulesByBatch] = useState({});
  const [visibleModuleShelves, setVisibleModuleShelves] = useState({});
  const decodedCourseName = decodeURIComponent(courseName || '');
  const moduleShelfRefs = useRef({});
  const moduleShelfObserverRef = useRef(null);

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
    const next = {};
    batches.forEach((b) => { next[b.batchName] = next[b.batchName] || 'pro'; });
    setSelectedPlanByBatch((current) => ({ ...next, ...current }));
  }, [batches]);

  useEffect(() => {
    let cancelled = false;
    async function loadBatchModules() {
      const entries = await Promise.all(
        (batches || []).map(async (batch) => {
          const name = String(batch?.batchName || '').trim();
          if (!name) return [name, []];
          try {
            const response = await fetchBatchModulesStudent(decodedCourseName, name);
            return [name, Array.isArray(response?.modules) ? response.modules : []];
          } catch {
            return [name, []];
          }
        })
      );
      if (!cancelled) {
        setModulesByBatch(Object.fromEntries(entries.filter(([name]) => Boolean(name))));
      }
    }
    if (batches.length) loadBatchModules();
    else setModulesByBatch({});
    return () => { cancelled = true; };
  }, [batches, decodedCourseName]);

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

  const visibleBatches = (Array.isArray(batches) ? batches : []).filter((entry) => entry?.active !== false);
  const moduleSections = visibleBatches
    .map((batch) => ({
      batch,
      modules: (Array.isArray(modulesByBatch[batch.batchName]) ? modulesByBatch[batch.batchName] : [])
        // Buy section should only show paid modules.
        .filter((moduleItem) => Number(moduleItem?.proPriceInPaise || 0) > 0 || Number(moduleItem?.elitePriceInPaise || 0) > 0)
    }))
    .filter((entry) => entry.modules.length > 0);

  function getBatchCartKey(batchName) {
    return `${decodedCourseName}::${batchName}`;
  }
  function getModuleCartKey(batchName, moduleName) {
    return `${decodedCourseName}::${batchName}::${moduleName}`;
  }

  function openCourseContent() {
    navigate(`/student/course/${encodeURIComponent(decodedCourseName)}/modules`);
  }
  function handleAddBatchToCart(batch) {
    const planType = selectedPlanByBatch[batch.batchName] || 'pro';
    const storageKey = getCartKey();
    try {
      const raw = localStorage.getItem(storageKey);
      const current = raw ? JSON.parse(raw) : [];
      const key = getBatchCartKey(batch.batchName);
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
          moduleCourse: decodedCourseName,
          batchName: batch.batchName,
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

  function handleAddModuleToCart(batch, moduleItem) {
    const moduleName = String(moduleItem?.moduleName || '').trim();
    if (!moduleName) return;
    const planType = selectedPlanByBatch[batch.batchName] || 'pro';
    const key = getModuleCartKey(batch.batchName, moduleName);
    const storageKey = getCartKey();
    try {
      const raw = localStorage.getItem(storageKey);
      const current = raw ? JSON.parse(raw) : [];
      if (current.some((item) => item.key === key)) {
        setBanner({ type: 'success', text: `${moduleName} is already in cart.` });
        return;
      }
      const planPrices = {
        pro: Number(moduleItem.proPriceInPaise || 0),
        elite: Number(moduleItem.elitePriceInPaise || 0)
      };
      const next = [
        ...current,
        {
          key,
          moduleName,
          moduleCourse: decodedCourseName,
          batchName: batch.batchName,
          planType,
          planPrices,
          crossCourse: true
        }
      ];
      localStorage.setItem(storageKey, JSON.stringify(next));
      setCartKeys(new Set(next.map((item) => String(item?.key || '').trim()).filter(Boolean)));
      setBanner({ type: 'success', text: `${moduleName} (${batch.batchName}) added to cart.` });
    } catch {
      setBanner({ type: 'error', text: 'Failed to update cart.' });
    }
  }

  useEffect(() => {
    if (!moduleSections.length) {
      setVisibleModuleShelves({});
      return undefined;
    }

    if (moduleShelfObserverRef.current) {
      moduleShelfObserverRef.current.disconnect();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const batchName = entry.target?.getAttribute('data-batch') || '';
          if (!batchName || !entry.isIntersecting) return;
          setVisibleModuleShelves((current) => ({ ...current, [batchName]: true }));
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.18, rootMargin: '0px 0px -6% 0px' }
    );
    moduleShelfObserverRef.current = observer;

    moduleSections.forEach(({ batch }) => {
      const node = moduleShelfRefs.current[batch.batchName];
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [moduleSections.length, moduleSections.map((entry) => entry.batch.batchName).join('|')]);

  return (
    <AppShell
      title={decodedCourseName}
      subtitle="Choose your premium batch and unlock access"
      roleLabel="Student"
      showThemeSwitch={false}
      actions={(
        <div className="student-course-catalog-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate('/student/courses')}>← Back</button>
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
              const selectedPlanUnlocked = selectedPlan === 'elite'
                ? Boolean(batch?.hasEliteAccess)
                : Boolean(batch?.hasProAccess);
              const canOpenContent = Boolean(selectedPlanUnlocked || !isLocked);
              const lockPillClass = selectedPlanUnlocked || !isLocked ? 'free' : 'locked';
              const lockPillLabel = selectedPlanUnlocked ? '🔓 Unlocked' : (isLocked ? '🔒 Locked' : '🔓 Free');
              const cartEntryKey = getBatchCartKey(batch.batchName);
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
                    {batch.description ? (
                      <div className="student-batch-about-box">
                        <p className="student-batch-about-label">About this course</p>
                        <p className="student-batch-about-text">{batch.description}</p>
                      </div>
                    ) : null}
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
                      <div className={`student-batch-lock-pill ${lockPillClass}`}>
                        {lockPillLabel}
                      </div>
                    </div>
                    <div className="student-course-catalog-cta-row">
                      {canOpenContent ? (
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={openCourseContent}
                        >
                          Open Content
                        </button>
                      ) : null}
                      {selectedPlanUnlocked ? null : (
                        <>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => {
                              if (isInCart) {
                                navigate('/student?cart=open', { state: { openCart: true } });
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
                              navigate('/student?cart=open', { state: { openCart: true } });
                            }}
                          >
                            Buy Now
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {moduleSections.length ? (
          <section className="card student-batch-module-section-wrap">
            <div className="section-header compact">
              <div>
                <p className="eyebrow">Module Access</p>
                <h3>Buy Single Modules by Batch</h3>
              </div>
            </div>
            <div className="student-batch-module-sections">
              {moduleSections.map(({ batch, modules }) => {
                const moduleSelectedPlan = selectedPlanByBatch[batch.batchName] || 'pro';
                return (
                  <article
                    key={`module-shelf-${batch.batchName}`}
                    className={`student-batch-module-shelf ${visibleModuleShelves[batch.batchName] ? 'is-visible' : ''}`}
                    ref={(node) => {
                      if (node) moduleShelfRefs.current[batch.batchName] = node;
                    }}
                    data-batch={batch.batchName}
                  >
                    <div className="student-batch-module-shelf-head">
                      <h4>{batch.batchName}</h4>
                      <span>{moduleSelectedPlan === 'elite' ? 'Elite plan prices' : 'Pro plan prices'}</span>
                    </div>
                    <div className="student-batch-module-grid">
                      {modules.map((moduleItem) => {
                        const moduleKey = getModuleCartKey(batch.batchName, moduleItem.moduleName);
                        const moduleInCart = cartKeys.has(moduleKey);
                        const modulePrice = Number(moduleSelectedPlan === 'elite' ? moduleItem.elitePriceInPaise : moduleItem.proPriceInPaise);
                        const moduleMrp = Number(moduleSelectedPlan === 'elite' ? moduleItem.eliteMrpInPaise : moduleItem.proMrpInPaise);
                        const moduleDiscount = moduleMrp > modulePrice && moduleMrp > 0
                          ? Math.round(((moduleMrp - modulePrice) / moduleMrp) * 100)
                          : 0;
                        return (
                          <article key={`${batch.batchName}-${moduleItem.moduleName}`} className="student-batch-module-card">
                            <div>
                              <h5>{moduleItem.moduleName}</h5>
                              <p>{modulePrice > 0 ? formatPriceInPaise(modulePrice) : 'Free'}</p>
                              {moduleMrp > modulePrice && modulePrice > 0 ? (
                                <small>
                                  <span>{formatPriceInPaise(moduleMrp)}</span> {moduleDiscount}% OFF
                                </small>
                              ) : null}
                              {moduleItem.hasUpgradeSuggestion ? (
                                <p className="student-batch-upgrade-hint">Upgrade to full batch for complete access.</p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => {
                                if (moduleInCart) {
                                  navigate('/student?cart=open', { state: { openCart: true } });
                                  return;
                                }
                                handleAddModuleToCart(batch, moduleItem);
                              }}
                            >
                              {moduleInCart ? 'Go to Cart' : 'Add Module'}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
