import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { requestJson, resolveApiAssetUrl } from '../api';
import { useSessionStore } from '../stores/sessionStore';

function loadRazorpayCheckoutScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
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

async function createTestSeriesOrderWithFallback({ course, seriesType, voucherCode = '' }) {
  const normalizedCourse = String(course || '').trim();
  const payload = {
    seriesType,
    ...(voucherCode ? { voucherCode } : {})
  };
  const shouldRetryWithoutCourse = (message) => /course|invalid course|profile|category/i.test(String(message || ''));

  try {
    return await requestJson('/test-series/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        ...(normalizedCourse ? { course: normalizedCourse } : {})
      })
    });
  } catch (error) {
    if (!normalizedCourse || !shouldRetryWithoutCourse(error?.message)) {
      throw error;
    }
    return requestJson('/test-series/payment/create-order', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
}

export default function StudentTestSeriesPurchasePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useSessionStore();

  const planFromQuery = useMemo(() => {
    const value = new URLSearchParams(location.search).get('plan');
    return value === 'full_mock' ? 'full_mock' : 'topic_test';
  }, [location.search]);

  const [catalogCourses, setCatalogCourses] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [purchasingType, setPurchasingType] = useState('');
  const [banner, setBanner] = useState(null);
  const [cartItems, setCartItems] = useState(() => readTestSeriesCart());

  useEffect(() => {
    async function loadCatalog() {
      setLoadingCatalog(true);
      try {
        const catalogRes = await requestJson('/test-series/catalog/student');
        setCatalogCourses(Array.isArray(catalogRes?.courses) ? catalogRes.courses : []);
      } catch (error) {
        setBanner({ type: 'error', text: error.message || 'Failed to load course-wise pricing.' });
        setCatalogCourses([]);
      } finally {
        setLoadingCatalog(false);
      }
    }
    loadCatalog();
  }, []);

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

  function hasCartEntry(courseName, seriesType) {
    const key = `${String(courseName || '').trim().toLowerCase()}::${seriesType}`;
    return cartItems.some((item) => getTsCartItemKey(item) === key);
  }

  function handleAddToCart(seriesType, selectedCourse = '', pricingData = {}) {
    const label = seriesType === 'topic_test' ? 'Topic Test Series' : 'Full Mock Series';
    const priceKey = seriesType === 'topic_test' ? 'topicTestPriceInPaise' : 'fullMockPriceInPaise';
    const normalizedCourse = String(selectedCourse || '').trim();
    const originalPaise = Number(pricingData[priceKey] || 0);

    const current = readTestSeriesCart();
    const itemKey = `${normalizedCourse.toLowerCase()}::${seriesType}`;
    const next = [
      ...current.filter((item) => getTsCartItemKey(item) !== itemKey),
      { course: normalizedCourse, seriesType, label, originalPaise, finalPaise: originalPaise, voucherCode: null, discountPaise: 0 }
    ];

    try {
      localStorage.setItem('ts_cart', JSON.stringify(next));
    } catch {
      // Ignore storage failures.
    }

    window.dispatchEvent(new Event('ts-cart-updated'));
    setCartItems(next);
    setBanner({ type: 'success', text: `${label} added to cart for ${normalizedCourse}.` });
  }

  async function handlePurchase(seriesType, selectedCourse = '') {
    if (purchasingType) return;
    setPurchasingType(seriesType);
    setBanner(null);

    try {
      const course = String(selectedCourse || '').trim();
      const orderRes = await createTestSeriesOrderWithFallback({
        course,
        seriesType
      });

      if (orderRes?.alreadyOwned) {
        setBanner({ type: 'success', text: 'Already purchased for this course.' });
        return;
      }

      if (orderRes?.free) {
        setBanner({
          type: 'success',
          text: seriesType === 'topic_test'
            ? `Access granted for ${course}: Topic Tests + Full Mocks unlocked.`
            : `Access granted for ${course}: Full Mocks unlocked.`
        });
        setCartItems((prev) => prev.filter((item) => getTsCartItemKey(item) !== `${course.toLowerCase()}::${seriesType}`));
        const catalogRes = await requestJson('/test-series/catalog/student');
        setCatalogCourses(Array.isArray(catalogRes?.courses) ? catalogRes.courses : []);
        return;
      }

      const scriptReady = await loadRazorpayCheckoutScript();
      if (!scriptReady || !window.Razorpay) throw new Error('Unable to load Razorpay. Please try again.');

      await new Promise((resolve, reject) => {
        let settled = false;
        let handlerStarted = false;
        const ok = (v) => {
          if (!settled) {
            settled = true;
            resolve(v);
          }
        };
        const err = (e) => {
          if (!settled) {
            settled = true;
            reject(e);
          }
        };

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
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                  seriesType,
                  course
                })
              });

              setBanner({
                type: 'success',
                text: seriesType === 'topic_test'
                  ? `${course} unlocked: Topic Tests + Full Mocks.`
                  : `${course} unlocked: Full Mock Series.`
              });

              setCartItems((prev) => prev.filter((item) => getTsCartItemKey(item) !== `${course.toLowerCase()}::${seriesType}`));
              const catalogRes = await requestJson('/test-series/catalog/student');
              setCatalogCourses(Array.isArray(catalogRes?.courses) ? catalogRes.courses : []);
              ok({ status: 'paid' });
            } catch (error) {
              err(new Error(error.message || 'Payment verification failed.'));
            }
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
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Payment failed. Please try again.' });
    } finally {
      setPurchasingType('');
    }
  }

  const pageTitle = planFromQuery === 'full_mock' ? 'Buy Full Mock Series' : 'Buy Topic Test Series';
  const pageSubtitle = planFromQuery === 'full_mock'
    ? 'Choose a course and unlock only Full Mock tests for that course.'
    : 'Choose a course and unlock Topic Tests for that course (with Full Mock bonus).';

  return (
    <AppShell
      title={pageTitle}
      subtitle={pageSubtitle}
      roleLabel="Student"
      showThemeSwitch
      actions={(
        <>
          <button type="button" className="secondary-btn" onClick={() => navigate('/student/test-series')}>← Back to Test Series</button>
          <button type="button" className="secondary-btn" onClick={() => navigate('/student')}>Dashboard</button>
        </>
      )}
    >
      <main className="admin-workspace-page ts-purchase-page">
        {banner && (
          <div className={`ts-top-banner ts-top-banner-${banner.type}`}>{banner.text}</div>
        )}

        {loadingCatalog ? (
          <div className="ts-loading-state">
            <div className="ts-loading-spinner" />
            <p>Loading course-wise pricing…</p>
          </div>
        ) : (
          <section className="card ts-catalog-section">
            <div className="ts-catalog-grid">
              {[...catalogCourses]
                .sort((left, right) => Number(Boolean(right?.isEnrolledCourse)) - Number(Boolean(left?.isEnrolledCourse)))
                .map((courseEntry, index) => {
                  const cardCourse = String(courseEntry?.courseName || '').trim();
                  const cardPricing = courseEntry?.pricing || {};
                  const cardAccess = courseEntry?.access || {};
                  const cardThumb = resolveApiAssetUrl(courseEntry?.thumbnailUrl || '');
                  const isTopicSelected = planFromQuery === 'topic_test';
                  const selectedLabel = isTopicSelected ? 'Topic Test Series' : 'Full Mock Series';
                  const selectedPrice = Number(isTopicSelected ? cardPricing.topicTestPriceInPaise : cardPricing.fullMockPriceInPaise);
                  const selectedMrp = Number(isTopicSelected ? cardPricing.topicTestMrpInPaise : cardPricing.fullMockMrpInPaise);
                  const selectedValidityDays = Number(isTopicSelected ? cardPricing.topicTestValidityDays : cardPricing.fullMockValidityDays) || 60;
                  const canBuySelected = isTopicSelected ? !cardAccess?.hasTopicTest : !cardAccess?.hasFullMock;
                  const inCartSelected = hasCartEntry(cardCourse, planFromQuery);
                  const discountPercent = selectedMrp > selectedPrice && selectedMrp > 0
                    ? Math.round(((selectedMrp - selectedPrice) / selectedMrp) * 100)
                    : 0;
                  const expiredForSelected = Boolean(isTopicSelected ? cardAccess?.topicExpired : cardAccess?.fullMockExpired);

                  return (
                    <article key={cardCourse} className="card ts-catalog-card" style={{ '--ts-enter-index': index }}>
                      <div className="ts-catalog-card-media">
                        {cardThumb ? (
                          <img src={cardThumb} alt={cardCourse} className="ts-catalog-thumb" />
                        ) : (
                          <div className="ts-catalog-thumb ts-catalog-thumb-fallback">{cardCourse.slice(0, 2)}</div>
                        )}
                      </div>
                      <div className="ts-catalog-card-body">
                        <div className="ts-catalog-title-row">
                          <h4>{cardCourse}</h4>
                          {courseEntry?.isEnrolledCourse && <span className="ts-catalog-pill">Enrolled</span>}
                        </div>
                        <p className="ts-catalog-course-meta">
                          {canBuySelected
                            ? `${expiredForSelected ? 'Renew' : 'Buy'} ${selectedLabel} for this course.`
                            : `${selectedLabel} is already unlocked for this course.`}
                        </p>
                        <div className="ts-catalog-plans">
                          <div className={`ts-catalog-plan-row ${isTopicSelected ? 'tone-topic' : 'tone-mock'}`}>
                            <div>
                              <strong>{selectedLabel}</strong>
                              <p>
                                {selectedPrice > 0 ? rupees(selectedPrice) : 'Free'}
                                {selectedMrp > selectedPrice && selectedPrice > 0 ? <small style={{ marginLeft: 8, opacity: 0.65, textDecoration: 'line-through' }}>{rupees(selectedMrp)}</small> : null}
                                {discountPercent > 0 ? <span style={{ marginLeft: 8 }}>{discountPercent}% OFF</span> : null}
                              </p>
                              <small className="ts-catalog-plan-note">
                                {isTopicSelected ? 'Includes full mocks as bonus access' : 'Full mocks only, topic tests are not included'} · Valid for {selectedValidityDays} days
                              </small>
                            </div>
                            {canBuySelected ? (
                              <div className="ts-catalog-plan-actions">
                                <button
                                  type="button"
                                  className="primary-btn ts-catalog-plan-buy-btn"
                                  onClick={() => handlePurchase(planFromQuery, cardCourse)}
                                  disabled={Boolean(purchasingType)}
                                >
                                  {purchasingType === planFromQuery ? 'Processing…' : 'Buy Now'}
                                </button>
                                <button
                                  type="button"
                                  className="secondary-btn ts-catalog-plan-add-btn"
                                  onClick={() => {
                                    if (inCartSelected) {
                                      navigate('/student?cart=open', { state: { openCart: true } });
                                      return;
                                    }
                                    handleAddToCart(planFromQuery, cardCourse, cardPricing);
                                  }}
                                  disabled={Boolean(purchasingType)}
                                >
                                  {inCartSelected ? 'Go To Cart' : 'Add To Cart'}
                                </button>
                              </div>
                            ) : (
                              <div className="ts-catalog-plan-actions">
                                <span className={`ts-access-badge ${isTopicSelected ? 'ts-badge-topic' : 'ts-badge-mock'}`}>Unlocked</span>
                                <button
                                  type="button"
                                  className="primary-btn ts-catalog-plan-buy-btn"
                                  onClick={() => {
                                    if (isTopicSelected) {
                                      navigate(`/student/test-series/topic-tests/modules?course=${encodeURIComponent(cardCourse)}`);
                                      return;
                                    }
                                    navigate(`/student/test-series?tab=mock&course=${encodeURIComponent(cardCourse)}`);
                                  }}
                                >
                                  Open Test Series
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
