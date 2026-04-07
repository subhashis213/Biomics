import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  fetchMockExamLeaderboard,
  createCourseOrder,
  downloadMaterial,
  fetchMyMockExams,
  previewCourseOrder,
  fetchQuizLeaderboard,
  getApiBase,
  requestJson,
  verifyCoursePayment
} from '../api';
import logoImg from '../assets/biomics-logo.jpeg';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import FinalWorkingVideoCard from '../components/FinalWorkingVideoCard';
import StudentChatAgent, { StudentAnnouncementBell } from '../components/StudentChatAgent';
import { useCourseData } from '../hooks/useCourseData';
import { useFeedback } from '../hooks/useFeedback';
import { useQuizSession } from '../hooks/useQuizSession';
import { useSessionStore } from '../stores/sessionStore';
import { useThemeStore } from '../stores/themeStore';

const ALL_MODULES = 'ALL_MODULES';
const CART_STORAGE_PREFIX = 'biomics:student-cart:';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, logout, login } = useSessionStore();
  const { theme, toggleTheme } = useThemeStore();
  const isLightTheme = theme === 'light';

  const {
    videos, course, favoriteIds, completedIds, quizzes, quizAttempts,
    moduleCatalog,
    access,
    isLoading, loadError, toggleFavorite, toggleCompleted, refreshAttempts,
    favMutError, progressMutError
  } = useCourseData();

  const [selectedModule, setSelectedModule] = useState(null);
  const [selectedCourseFilter, setSelectedCourseFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('latest');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [banner, setBanner] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardModules, setLeaderboardModules] = useState([]);
  const [leaderboardModuleFilter, setLeaderboardModuleFilter] = useState('all');
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileClosing, setProfileClosing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ username: '', phone: '', city: '', password: '' });
  const [profileMessage, setProfileMessage] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [liveClass, setLiveClass] = useState(null); // { active, title, meetUrl, startedAt }
  const [upcomingClass, setUpcomingClass] = useState(null); // { _id, title, scheduledAt, meetUrl }
  const [upcomingCountdown, setUpcomingCountdown] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [isUnlockingCourse, setIsUnlockingCourse] = useState(false);
  const [selectedAccessTarget, setSelectedAccessTarget] = useState(ALL_MODULES);
  const [selectedModuleSection, setSelectedModuleSection] = useState('');
  const [lockedModuleCart, setLockedModuleCart] = useState([]);
  const [recentlyAddedCartKey, setRecentlyAddedCartKey] = useState('');
  const [cartPlanType, setCartPlanType] = useState('pro');
  const [cartVoucherCode, setCartVoucherCode] = useState('');
  const [appliedCartVoucherCode, setAppliedCartVoucherCode] = useState('');
  const [cartVoucherMessage, setCartVoucherMessage] = useState('');
  const [isApplyingCartVoucher, setIsApplyingCartVoucher] = useState(false);
  const [cartVoucherPreviewByKey, setCartVoucherPreviewByKey] = useState({});
  const [cartPriceSyncMessage, setCartPriceSyncMessage] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [isBulkCheckoutRunning, setIsBulkCheckoutRunning] = useState(false);
  const [cartItemCheckoutKey, setCartItemCheckoutKey] = useState('');
  const [isCartHydrated, setIsCartHydrated] = useState(false);
  const [mockExams, setMockExams] = useState([]);
  const [mockExamNotices, setMockExamNotices] = useState([]);
  const [mockExamLoading, setMockExamLoading] = useState(false);
  const [examLeaderboard, setExamLeaderboard] = useState([]);
  const [examLeaderboardMonths, setExamLeaderboardMonths] = useState([]);
  const [examLeaderboardMonthFilter, setExamLeaderboardMonthFilter] = useState('all');
  const [examLeaderboardLoading, setExamLeaderboardLoading] = useState(false);
  const [examLeaderboardError, setExamLeaderboardError] = useState('');
  const profileScrollLockRef = useRef(0);
  const profileCloseTimerRef = useRef(null);
  const recentlyAddedCartTimerRef = useRef(null);
  const cartIconButtonRef = useRef(null);
  const cartPulseTimerRef = useRef(null);
  const cartVoucherRequestRef = useRef(0);

  const allModulesUnlocked = Boolean(access?.allModulesUnlocked || access?.unlocked);
  const bundlePlanOptions = Array.isArray(access?.bundlePricing?.plans) ? access.bundlePricing.plans : [];
  const moduleAccessMap = access?.moduleAccess || {};
  const unlockedModuleSet = new Set(Array.isArray(access?.unlockedModules) ? access.unlockedModules.map((item) => normalizeModuleName(item)) : []);
  const hasAnyUnlockedModule = allModulesUnlocked || unlockedModuleSet.size > 0;
  const activeMembership = access?.activeMembership || null;

  const moduleMemberships = Object.values(moduleAccessMap)
    .map((entry) => entry?.activeMembership)
    .filter(Boolean)
    .sort((left, right) => new Date(left?.expiresAt || 0).getTime() - new Date(right?.expiresAt || 0).getTime());
  const visibleMembership = activeMembership || moduleMemberships[0] || null;
  const shouldShowLeaderboard = hasAnyUnlockedModule && !selectedModule;

  const profilePasswordHint =
    profileForm.password.length > 0 && profileForm.password.length < 8
      ? 'Password must be at least 8 characters.'
      : null;

  const selectedModuleName = selectedModule?.name || '';
  const selectedModuleCourse = selectedModule?.category || '';
  const selectedModuleAccess = selectedModule ? getModuleAccessInfo(selectedModuleName, selectedModuleCourse) : null;
  const selectedModuleCartKey = buildLockedCartKey(selectedModuleName, selectedModuleCourse);
  const selectedModuleIsInCart = lockedModuleCart.some((item) => item.key === selectedModuleCartKey);
  const moduleLocked = Boolean(selectedModuleAccess?.purchaseRequired && !selectedModuleAccess?.unlocked);
  const isCrossCourseSelection = Boolean(
    selectedModule
    && normalizeCourseName(selectedModuleCourse).toLowerCase() !== normalizeCourseName(course || '').toLowerCase()
  );
  const selectedTargetIsBundle = selectedAccessTarget === ALL_MODULES;
  const selectedTargetAccess = selectedTargetIsBundle
    ? {
        pricing: { currency: access?.bundlePricing?.currency || 'INR', plans: bundlePlanOptions },
        unlocked: allModulesUnlocked,
        activeMembership: activeMembership
      }
    : getModuleAccessInfo(selectedAccessTarget, selectedModuleCourse || course);
  const selectedTargetPlans = Array.isArray(selectedTargetAccess?.pricing?.plans) ? selectedTargetAccess.pricing.plans : [];
  const quizEnabledForSelection = Boolean(selectedModuleName) &&
    normalizeCourseName(selectedModuleCourse).toLowerCase() === normalizeCourseName(course || '').toLowerCase();

  const {
    moduleQuizList, loadingQuiz, moduleHasQuiz, handleLoadQuizForModule
  } = useQuizSession({
    selectedModule: quizEnabledForSelection ? selectedModuleName : null,
    quizzes,
    onError: (msg) => setBanner({ type: 'error', text: msg }),
    onAttemptsRefresh: refreshAttempts
  });

  const {
    register: registerFeedback, handleFeedbackSubmit, isSubmittingFeedback,
    feedbackInlineError, feedbackToast, isFeedbackToastDismissing, dismissFeedbackToast
  } = useFeedback();

  const query = searchQuery.trim().toLowerCase();

  function normalizeModuleName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeCourseName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function getCartStorageUsernameKey(usernameValue) {
    return String(usernameValue || '').trim().toLowerCase();
  }

  function readCartStorage(storageKey) {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) return raw;
    } catch {
      // Fall through to sessionStorage.
    }
    try {
      return window.sessionStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }

  function writeCartStorage(storageKey, value) {
    if (typeof window === 'undefined') return;
    let wroteLocal = false;
    try {
      window.localStorage.setItem(storageKey, value);
      wroteLocal = true;
    } catch {
      // Try sessionStorage as a fallback.
    }
    try {
      window.sessionStorage.setItem(storageKey, value);
    } catch {
      if (!wroteLocal) {
        // Both storage writes failed; keep in-memory cart only.
      }
    }
  }

  function resolveModuleKey(categoryName, moduleName) {
    const safeCategory = normalizeCourseName(categoryName || 'General');
    return `${safeCategory}::${normalizeModuleName(moduleName || 'General')}`;
  }

  function getQuestionCount(quiz) {
    return Math.max(
      Number(quiz?.questionCount) || 0,
      Array.isArray(quiz?.questions) ? quiz.questions.length : 0
    );
  }

  function normalizeId(value) {
    return String(value || '');
  }

  function safePercent(value) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.round(num) : 0;
  }

  function formatPriceInPaise(amountInPaise) {
    return `Rs ${(Number(amountInPaise || 0) / 100).toFixed(2)}`;
  }

  function formatMembershipDate(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function buildLockedCartKey(moduleName, moduleCourse) {
    return `${normalizeCourseName(moduleCourse || '')}::${normalizeModuleName(moduleName || '')}`;
  }

  function triggerCartIconPulse() {
    const cartButton = cartIconButtonRef.current;
    if (!cartButton) return;

    cartButton.classList.remove('is-cart-bumping');
    void cartButton.offsetWidth;
    cartButton.classList.add('is-cart-bumping');

    if (cartPulseTimerRef.current) {
      window.clearTimeout(cartPulseTimerRef.current);
    }
    cartPulseTimerRef.current = window.setTimeout(() => {
      cartButton.classList.remove('is-cart-bumping');
      cartPulseTimerRef.current = null;
    }, 380);
  }

  function animateAddToCartToHeader(originElement) {
    if (typeof document === 'undefined') return;
    const cartButton = cartIconButtonRef.current;
    if (!cartButton || !originElement) {
      triggerCartIconPulse();
      return;
    }

    const originRect = originElement.getBoundingClientRect();
    const targetRect = cartButton.getBoundingClientRect();
    if (!originRect || !targetRect) {
      triggerCartIconPulse();
      return;
    }

    const startX = originRect.left + originRect.width / 2;
    const startY = originRect.top + originRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;
    const deltaX = endX - startX;
    const deltaY = endY - startY;

    const flyNode = document.createElement('span');
    flyNode.className = 'student-cart-fly-chip';
    flyNode.setAttribute('aria-hidden', 'true');
    flyNode.textContent = '●';
    flyNode.style.left = `${startX}px`;
    flyNode.style.top = `${startY}px`;
    document.body.appendChild(flyNode);

    const animation = flyNode.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.94, offset: 0 },
        {
          transform: `translate(calc(-50% + ${Math.round(deltaX * 0.56)}px), calc(-50% + ${Math.round(deltaY * 0.28 - 34)}px)) scale(1.05)`,
          opacity: 0.9,
          offset: 0.58
        },
        {
          transform: `translate(calc(-50% + ${Math.round(deltaX)}px), calc(-50% + ${Math.round(deltaY)}px)) scale(0.32)`,
          opacity: 0.1,
          offset: 1
        }
      ],
      {
        duration: 620,
        easing: 'cubic-bezier(0.2, 0.9, 0.2, 1)',
        fill: 'forwards'
      }
    );

    animation.onfinish = () => {
      flyNode.remove();
      triggerCartIconPulse();
    };
    animation.oncancel = () => {
      flyNode.remove();
      triggerCartIconPulse();
    };
  }

  function addLockedModuleToCart(moduleName, moduleCourse, moduleAccessInfo, originElement) {
    const normalizedModule = normalizeModuleName(moduleName);
    const normalizedCourse = normalizeCourseName(moduleCourse || course || 'General');
    const itemKey = buildLockedCartKey(normalizedModule, normalizedCourse);
    const planPrices = (Array.isArray(moduleAccessInfo?.pricing?.plans) ? moduleAccessInfo.pricing.plans : []).reduce((acc, plan) => {
      const planType = String(plan?.type || '').toLowerCase();
      if (!planType) return acc;
      acc[planType] = Number(plan?.amountInPaise || 0);
      return acc;
    }, {});
    const crossCourse = normalizeCourseName(course || '').toLowerCase() !== normalizedCourse.toLowerCase();

    let wasDuplicate = false;
    setLockedModuleCart((current) => {
      if (current.some((item) => item.key === itemKey)) {
        wasDuplicate = true;
        return current;
      }
      return [
        ...current,
        {
          key: itemKey,
          moduleName: normalizedModule,
          moduleCourse: normalizedCourse,
          planPrices,
          crossCourse
        }
      ];
    });

    // Silent add-to-cart flow: only header count updates.
    if (wasDuplicate) return;
    setRecentlyAddedCartKey(itemKey);
    if (recentlyAddedCartTimerRef.current) {
      window.clearTimeout(recentlyAddedCartTimerRef.current);
    }
    recentlyAddedCartTimerRef.current = window.setTimeout(() => {
      setRecentlyAddedCartKey('');
      recentlyAddedCartTimerRef.current = null;
    }, 900);
    animateAddToCartToHeader(originElement);
  }

  function removeLockedModuleFromCart(itemKey) {
    setLockedModuleCart((current) => current.filter((item) => item.key !== itemKey));
  }

  function getCartItemPlanPrice(item, planType) {
    if (!item) return 0;
    const prices = item.planPrices || {};
    const selected = Number(prices[planType] ?? 0);
    if (Number.isFinite(selected) && selected > 0) return selected;
    const fallback = Number(prices.pro ?? prices.elite ?? 0);
    return Number.isFinite(fallback) ? fallback : 0;
  }

  function getCourseTone(courseName) {
    const normalized = normalizeCourseName(courseName).toLowerCase();
    if (normalized === '11th') return 'school11';
    if (normalized === '12th') return 'school12';
    if (normalized === 'neet') return 'neet';
    if (normalized === 'iit-jam') return 'jam';
    if (normalized === 'csir-net life science') return 'csir';
    if (normalized === 'gate') return 'gate';
    return 'default';
  }

  function getCartItemEffectivePrice(item, planType) {
    const basePrice = getCartItemPlanPrice(item, planType);
    if (!appliedCartVoucherCode) return basePrice;
    const preview = cartVoucherPreviewByKey[item?.key];
    if (!preview || typeof preview.finalAmountInPaise !== 'number') return basePrice;
    return Math.max(0, Number(preview.finalAmountInPaise || 0));
  }

  const cartPriceSyncSignature = lockedModuleCart
    .map((item) => `${item.key}:${Number(item?.planPrices?.pro || 0)}:${Number(item?.planPrices?.elite || 0)}`)
    .join('|');

  const payableCartItems = lockedModuleCart;
  const payableCartEstimate = payableCartItems.reduce((total, item) => total + getCartItemEffectivePrice(item, cartPlanType), 0);
  const payableCartOriginalTotal = payableCartItems.reduce((total, item) => total + getCartItemPlanPrice(item, cartPlanType), 0);
  const payableCartDiscountTotal = Math.max(0, payableCartOriginalTotal - payableCartEstimate);

  async function buildVoucherPreviewForCart(voucherCode, planType) {
    const normalizedVoucher = String(voucherCode || '').trim().toUpperCase();
    if (!normalizedVoucher) {
      setCartVoucherPreviewByKey({});
      return { success: false, message: 'Enter a voucher code to apply.' };
    }

    if (!payableCartItems.length) {
      setCartVoucherPreviewByKey({});
      return { success: false, message: 'No payable modules in cart.' };
    }

    const requestId = Date.now();
    cartVoucherRequestRef.current = requestId;
    setIsApplyingCartVoucher(true);

    try {
      const results = await Promise.all(
        payableCartItems.map(async (item) => {
          try {
            const preview = await previewCourseOrder(planType, normalizedVoucher, item.moduleName, item.moduleCourse);
            return {
              key: item.key,
              ok: true,
              pricing: preview?.pricing || null
            };
          } catch (error) {
            return {
              key: item.key,
              ok: false,
              error: error?.message || 'Failed to validate voucher.'
            };
          }
        })
      );

      if (cartVoucherRequestRef.current !== requestId) {
        return { success: false, message: 'Preview superseded by a newer request.' };
      }

      const previewMap = {};
      let successCount = 0;
      let firstError = '';
      results.forEach((entry) => {
        if (entry.ok && entry.pricing) {
          successCount += 1;
          previewMap[entry.key] = {
            originalAmountInPaise: Number(entry.pricing.originalAmountInPaise || 0),
            discountInPaise: Number(entry.pricing.discountInPaise || 0),
            finalAmountInPaise: Number(entry.pricing.finalAmountInPaise || 0)
          };
        } else if (!firstError) {
          firstError = entry.error || 'Voucher is invalid.';
        }
      });

      if (successCount === 0) {
        setCartVoucherPreviewByKey({});
        return { success: false, message: firstError || 'Voucher is invalid.' };
      }

      setCartVoucherPreviewByKey(previewMap);
      return {
        success: true,
        message: successCount === payableCartItems.length
          ? `Voucher ${normalizedVoucher} applied.`
          : `Voucher applied for ${successCount} item${successCount === 1 ? '' : 's'}.`
      };
    } finally {
      if (cartVoucherRequestRef.current === requestId) {
        setIsApplyingCartVoucher(false);
      }
    }
  }

  async function handleApplyCartVoucher() {
    const normalized = String(cartVoucherCode || '').trim().toUpperCase();
    const result = await buildVoucherPreviewForCart(normalized, cartPlanType);
    if (!result.success) {
      setAppliedCartVoucherCode('');
      setCartVoucherMessage(result.message);
      return;
    }

    setAppliedCartVoucherCode(normalized);
    setCartVoucherCode(normalized);
    setCartVoucherMessage(result.message);
  }

  function handleRemoveCartVoucher() {
    setAppliedCartVoucherCode('');
    setCartVoucherCode('');
    setCartVoucherPreviewByKey({});
    setCartVoucherMessage('Voucher removed. Price reverted to original rate.');
  }

  useEffect(() => {
    if (!appliedCartVoucherCode) return;
    buildVoucherPreviewForCart(appliedCartVoucherCode, cartPlanType)
      .then((result) => {
        if (!result.success) {
          setAppliedCartVoucherCode('');
          setCartVoucherMessage(result.message);
          return;
        }
        setCartVoucherMessage(result.message);
      })
      .catch((error) => {
        setAppliedCartVoucherCode('');
        setCartVoucherPreviewByKey({});
        setCartVoucherMessage(error?.message || 'Failed to refresh voucher pricing.');
      });
    // Intentionally track length and plan for re-pricing cart on structure changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedCartVoucherCode, cartPlanType, payableCartItems.length]);

  useEffect(() => {
    const username = getCartStorageUsernameKey(session?.username);
    setIsCartHydrated(false);

    if (!username || typeof window === 'undefined') {
      setLockedModuleCart([]);
      setIsCartHydrated(true);
      return;
    }

    const storageKey = `${CART_STORAGE_PREFIX}${username}`;
    try {
      const raw = readCartStorage(storageKey);
      if (!raw) {
        setLockedModuleCart([]);
      } else {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          setLockedModuleCart([]);
        } else {
          const safe = parsed
            .filter((item) => item && typeof item === 'object')
            .map((item) => ({
              key: String(item.key || ''),
              moduleName: normalizeModuleName(item.moduleName || ''),
              moduleCourse: normalizeCourseName(item.moduleCourse || String(item.key || '').split('::')[0] || course || 'General'),
              planPrices: item.planPrices && typeof item.planPrices === 'object' ? item.planPrices : {},
              crossCourse: Boolean(item.crossCourse)
            }))
            .map((item) => ({
              ...item,
              key: item.key || buildLockedCartKey(item.moduleName, item.moduleCourse)
            }))
            .filter((item) => item.key && item.moduleName)
            .filter((item, index, current) => current.findIndex((entry) => entry.key === item.key) === index);
          setLockedModuleCart(safe);
        }
      }
    } catch {
      setLockedModuleCart([]);
    } finally {
      setIsCartHydrated(true);
    }
  }, [session?.username]);

  useEffect(() => {
    const username = getCartStorageUsernameKey(session?.username);
    if (!username || typeof window === 'undefined') return;
    if (!isCartHydrated) return;

    const storageKey = `${CART_STORAGE_PREFIX}${username}`;
    try {
      writeCartStorage(storageKey, JSON.stringify(lockedModuleCart));
    } catch {
      // Ignore storage quota/privacy mode errors; cart still works in-memory.
    }
  }, [lockedModuleCart, session?.username, isCartHydrated]);

  useEffect(() => {
    if (!isCartHydrated || !lockedModuleCart.length) return;

    let cancelled = false;

    async function syncCartPlanPrices() {
      const updates = await Promise.all(
        lockedModuleCart.map(async (item) => {
          const [proPreview, elitePreview] = await Promise.all([
            previewCourseOrder('pro', '', item.moduleName, item.moduleCourse).catch(() => null),
            previewCourseOrder('elite', '', item.moduleName, item.moduleCourse).catch(() => null)
          ]);

          const nextPro = Number(proPreview?.pricing?.originalAmountInPaise ?? item?.planPrices?.pro ?? 0);
          const nextElite = Number(elitePreview?.pricing?.originalAmountInPaise ?? item?.planPrices?.elite ?? 0);
          return {
            key: item.key,
            pro: Number.isFinite(nextPro) ? Math.max(0, nextPro) : 0,
            elite: Number.isFinite(nextElite) ? Math.max(0, nextElite) : 0
          };
        })
      );

      if (cancelled) return;

      const updateMap = new Map(updates.map((entry) => [entry.key, entry]));
      const hasAnyPriceUpdate = lockedModuleCart.some((item) => {
        const update = updateMap.get(item.key);
        if (!update) return false;
        const currentPro = Number(item?.planPrices?.pro ?? 0);
        const currentElite = Number(item?.planPrices?.elite ?? 0);
        return currentPro !== update.pro || currentElite !== update.elite;
      });

      setLockedModuleCart((current) => {
        let changed = false;
        const next = current.map((item) => {
          const update = updateMap.get(item.key);
          if (!update) return item;
          const currentPro = Number(item?.planPrices?.pro ?? 0);
          const currentElite = Number(item?.planPrices?.elite ?? 0);
          if (currentPro === update.pro && currentElite === update.elite) return item;
          changed = true;
          return {
            ...item,
            planPrices: {
              ...item.planPrices,
              pro: update.pro,
              elite: update.elite
            }
          };
        });
        return changed ? next : current;
      });

      if (hasAnyPriceUpdate) {
        setCartPriceSyncMessage('Prices refreshed from latest admin settings.');
      }
    }

    syncCartPlanPrices().catch(() => {
      // Best effort: keep last known cart prices if preview API fails.
    });

    return () => {
      cancelled = true;
    };
  }, [isCartHydrated, cartPriceSyncSignature, session?.username]);

  async function startMembershipCheckout({
    targetCourse,
    targetModuleName,
    planType,
    voucher = '',
    reloadOnSuccess = true,
    showSuccessBanner = true,
    showCancelBanner = true
  }) {
    const normalizedTargetCourse = normalizeCourseName(targetCourse || course || '');
    const targetLabel = targetModuleName === ALL_MODULES
      ? `${normalizedTargetCourse || course || 'Course'} bundle`
      : `${targetModuleName}${normalizedTargetCourse ? ` (${normalizedTargetCourse})` : ''}`;

    const orderResponse = await createCourseOrder(
      planType,
      voucher.trim(),
      targetModuleName || ALL_MODULES,
      normalizedTargetCourse
    );
    if (orderResponse?.unlocked) {
      if (showSuccessBanner) {
        setBanner({ type: 'success', text: `${targetLabel} unlocked successfully.` });
      }
      await refreshAttempts();
      if (reloadOnSuccess) window.location.reload();
      return { status: 'already-unlocked' };
    }

    const scriptReady = await loadRazorpayCheckoutScript();
    if (!scriptReady || !window.Razorpay) {
      throw new Error('Unable to load Razorpay checkout. Please try again.');
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let paymentHandlerStarted = false;

      const safeResolve = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const safeReject = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const options = {
        key: orderResponse.razorpayKeyId,
        amount: orderResponse?.order?.amount,
        currency: orderResponse?.order?.currency || 'INR',
        name: 'Biomics Hub',
        description: `${targetLabel} ${planType === 'elite' ? 'Elite' : 'Pro'} Membership`,
        order_id: orderResponse?.order?.id,
        handler: async (response) => {
          paymentHandlerStarted = true;
          try {
            await verifyCoursePayment(response);
            if (showSuccessBanner) {
              setBanner({ type: 'success', text: `${targetLabel} unlocked successfully.` });
            }
            await refreshAttempts();
            if (reloadOnSuccess) window.location.reload();
            safeResolve({ status: 'paid' });
          } catch (verifyErr) {
            safeReject(new Error(verifyErr.message || 'Payment verification failed.'));
          }
        },
        prefill: {
          name: session?.username || ''
        },
        theme: {
          color: '#0f766e'
        },
        modal: {
          ondismiss: () => {
            // Razorpay can emit dismiss around payment completion; wait briefly to avoid false cancellation.
            window.setTimeout(() => {
              if (paymentHandlerStarted) return;
              if (showCancelBanner) {
                setBanner({ type: 'error', text: 'Payment cancelled before completion.' });
              }
              safeResolve({ status: 'cancelled' });
            }, 450);
          }
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    });
  }

  async function handlePayNowForCart() {
    if (isBulkCheckoutRunning || isUnlockingCourse) return;

    if (!payableCartItems.length) {
      setBanner({ type: 'error', text: 'No payable modules in cart for this account.' });
      return;
    }

    setIsBulkCheckoutRunning(true);
    setBanner(null);

    const purchasedKeys = [];
    let cancelled = false;

    try {
      for (const item of payableCartItems) {
        const result = await startMembershipCheckout({
          targetCourse: item.moduleCourse,
          targetModuleName: item.moduleName,
          planType: cartPlanType,
          voucher: appliedCartVoucherCode,
          reloadOnSuccess: false,
          showSuccessBanner: false,
          showCancelBanner: false
        });

        if (result?.status === 'cancelled') {
          cancelled = true;
          break;
        }

        if (['paid', 'already-unlocked', 'free'].includes(result?.status)) {
          purchasedKeys.push(item.key);
        }
      }

      if (purchasedKeys.length) {
        setLockedModuleCart((current) => current.filter((item) => !purchasedKeys.includes(item.key)));
        if (cancelled) {
          setBanner({
            type: 'success',
            text: `${purchasedKeys.length} module${purchasedKeys.length === 1 ? '' : 's'} unlocked. Checkout was stopped for remaining items.`
          });
        } else {
          setBanner({ type: 'success', text: `${purchasedKeys.length} module${purchasedKeys.length === 1 ? '' : 's'} unlocked successfully.` });
        }
        if (lockedModuleCart.length === purchasedKeys.length || !cancelled) {
          setCartOpen(false);
        }
        return;
      }

      if (cancelled) {
        setBanner({ type: 'error', text: 'Checkout was cancelled. No payment was made.' });
      }
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Bulk checkout failed.' });
    } finally {
      setIsBulkCheckoutRunning(false);
    }
  }

  async function handleCheckoutSingleCartItem(item) {
    if (!item) {
      setBanner({ type: 'error', text: 'Invalid cart item.' });
      return;
    }

    setCartItemCheckoutKey(item.key);
    try {
      const result = await startMembershipCheckout({
        targetCourse: item.moduleCourse,
        targetModuleName: item.moduleName,
        planType: cartPlanType,
        voucher: appliedCartVoucherCode,
        reloadOnSuccess: false,
        showSuccessBanner: false,
        showCancelBanner: true
      });

      if (['paid', 'already-unlocked', 'free'].includes(result?.status)) {
        setLockedModuleCart((current) => current.filter((entry) => entry.key !== item.key));
        setBanner({ type: 'success', text: `${item.moduleName} unlocked successfully.` });
      }
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Checkout failed for selected module.' });
    } finally {
      setCartItemCheckoutKey('');
    }
  }

  useEffect(() => {
    if (!cartOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setCartOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cartOpen]);

  useEffect(() => {
    if (!cartOpen || typeof document === 'undefined') return undefined;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarGap = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarGap > 0) {
      body.style.paddingRight = `${scrollbarGap}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [cartOpen]);

  useEffect(() => {
    return () => {
      if (recentlyAddedCartTimerRef.current) {
        window.clearTimeout(recentlyAddedCartTimerRef.current);
      }
      if (cartPulseTimerRef.current) {
        window.clearTimeout(cartPulseTimerRef.current);
      }
    };
  }, []);

  function formatMonthLabel(monthValue) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthValue || ''))) return monthValue || 'Unknown Month';
    const [year, month] = String(monthValue).split('-');
    const parsed = new Date(Number(year), Number(month) - 1, 1);
    return parsed.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }

  function getModuleAccessInfo(moduleName, moduleCourse = course) {
    const normalizedModule = normalizeModuleName(moduleName);
    const normalizedModuleCourse = normalizeCourseName(moduleCourse || '');
    const normalizedStudentCourse = normalizeCourseName(course || '');

    if (normalizedModuleCourse && normalizedStudentCourse && normalizedModuleCourse !== normalizedStudentCourse) {
      return {
        unlocked: false,
        purchaseRequired: true,
        pricing: { currency: 'INR', plans: [] },
        activeMembership: null,
        crossCourse: true
      };
    }

    return moduleAccessMap[normalizedModule] || {
      unlocked: true,
      purchaseRequired: false,
      pricing: { currency: 'INR', plans: [] },
      activeMembership: null
    };
  }

  const moduleMetaByKey = {};
  const activeCourseFilter = selectedCourseFilter === 'all' ? '' : selectedCourseFilter;

  // Group videos by course+module key.
  const videosByModule = videos.reduce((acc, video) => {
    const category = normalizeCourseName(video.category || 'General');
    const displayModule = String(video.module || 'General').trim() || 'General';
    const moduleKey = resolveModuleKey(category, displayModule);
    if (!moduleMetaByKey[moduleKey]) {
      moduleMetaByKey[moduleKey] = { module: displayModule, category };
    }
    if (!acc[moduleKey]) {
      acc[moduleKey] = [];
    }
    acc[moduleKey].push(video);
    return acc;
  }, {});

  const quizzesByModule = quizzes.reduce((acc, quiz) => {
    const category = normalizeCourseName(quiz.category || course || 'General');
    const displayModule = String(quiz.module || 'General').trim() || 'General';
    const moduleKey = resolveModuleKey(category, displayModule);
    if (!moduleMetaByKey[moduleKey]) {
      moduleMetaByKey[moduleKey] = { module: displayModule, category };
    }
    if (!acc[moduleKey]) {
      acc[moduleKey] = [];
    }
    acc[moduleKey].push(quiz);
    return acc;
  }, {});

  quizAttempts.forEach((attempt) => {
    const category = normalizeCourseName(attempt.category || course || 'General');
    const displayModule = String(attempt.module || 'General').trim() || 'General';
    const moduleKey = resolveModuleKey(category, displayModule);
    if (!moduleMetaByKey[moduleKey]) {
      moduleMetaByKey[moduleKey] = { module: displayModule, category };
    }
  });

  // Include the admin-created module catalog so modules show even before content upload.
  (Array.isArray(moduleCatalog) ? moduleCatalog : []).forEach((entry) => {
    const category = normalizeCourseName(entry?.category || '');
    const displayModule = normalizeModuleName(entry?.name || '');
    if (!category || !displayModule) return;
    const moduleKey = resolveModuleKey(category, displayModule);
    if (!moduleMetaByKey[moduleKey]) {
      moduleMetaByKey[moduleKey] = { module: displayModule, category };
    }
  });

  // Keep purchasable modules discoverable even when no visible content is returned yet.
  Object.keys(moduleAccessMap).forEach((moduleName) => {
    const normalizedModule = normalizeModuleName(moduleName);
    if (!normalizedModule || normalizedModule === ALL_MODULES) return;
    const category = normalizeCourseName(course || 'General');
    const moduleKey = resolveModuleKey(category, normalizedModule);
    if (!moduleMetaByKey[moduleKey]) {
      moduleMetaByKey[moduleKey] = { module: normalizedModule, category };
    }
  });

  const availableCourses = Array.from(new Set([
    ...videos.map((video) => normalizeCourseName(video.category || '')).filter(Boolean),
    ...quizzes.map((quiz) => normalizeCourseName(quiz.category || '')).filter(Boolean),
    ...quizAttempts.map((attempt) => normalizeCourseName(attempt.category || '')).filter(Boolean),
    ...Object.values(moduleMetaByKey).map((meta) => normalizeCourseName(meta?.category || '')).filter(Boolean),
    normalizeCourseName(course || '')
  ])).sort((a, b) => a.localeCompare(b));

  const modules = Object.keys(moduleMetaByKey)
    .filter((moduleKey) => {
      if (!activeCourseFilter) return true;
      return moduleMetaByKey[moduleKey].category === activeCourseFilter;
    })
    .sort((a, b) => {
      const aMeta = moduleMetaByKey[a];
      const bMeta = moduleMetaByKey[b];
      if (aMeta.category !== bMeta.category) return aMeta.category.localeCompare(bMeta.category);
      return aMeta.module.localeCompare(bMeta.module);
    });

  const visibleModules = modules.filter((moduleKey) => {
    const moduleMeta = moduleMetaByKey[moduleKey];
    const moduleName = moduleMeta.module;
    const courseName = moduleMeta.category;
    if (!query) return true;
    if (moduleName.toLowerCase().includes(query)) return true;
    if (courseName.toLowerCase().includes(query)) return true;

    const videoMatch = (videosByModule[moduleKey] || []).some((video) => {
      const haystack = `${video.title || ''} ${video.description || ''}`.toLowerCase();
      return haystack.includes(query);
    });

    const quizMatch = (quizzesByModule[moduleKey] || []).some((quiz) => {
      const haystack = `${quiz.title || ''} ${quiz.difficulty || ''}`.toLowerCase();
      return haystack.includes(query);
    });

    return videoMatch || quizMatch;
  });

  const selectedModuleKey = selectedModule
    ? resolveModuleKey(selectedModuleCourse, selectedModuleName)
    : '';
  const selectedModuleVideos = selectedModule ? (videosByModule[selectedModuleKey] || []) : [];

  const displayedVideos = selectedModuleVideos
    .filter((video) => {
      if (showSavedOnly && !favoriteIds.has(normalizeId(video._id))) return false;
      if (!query) return true;
      const haystack = `${video.title || ''} ${video.description || ''}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => {
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'oldest') return new Date(a.uploadedAt) - new Date(b.uploadedAt);
      return new Date(b.uploadedAt) - new Date(a.uploadedAt);
    });

  const favoriteVideos = videos.filter((video) => favoriteIds.has(normalizeId(video._id)));
  const videosForActiveFilter = activeCourseFilter
    ? videos.filter((video) => normalizeCourseName(video.category || 'General') === activeCourseFilter)
    : videos;
  const progressScopeVideos = selectedModule ? selectedModuleVideos : videosForActiveFilter;
  const progressScopeCompletedCount = progressScopeVideos.filter((video) => completedIds.has(normalizeId(video._id))).length;
  const progressScopePercent = progressScopeVideos.length
    ? Math.round((progressScopeCompletedCount / progressScopeVideos.length) * 100)
    : 0;
  const progressScopeLabel = selectedModule
    ? `${selectedModuleCourse} • ${selectedModuleName}`
    : (activeCourseFilter || 'All Courses');
  const selectedModuleAttempts = selectedModule
    ? quizAttempts.filter((attempt) => {
      const sameModule = normalizeModuleName(attempt.module) === normalizeModuleName(selectedModuleName);
      const sameCategory = normalizeCourseName(attempt.category || course || '') === normalizeCourseName(selectedModuleCourse || '');
      return sameModule && sameCategory;
    })
    : [];

  const latestAttemptByModule = quizAttempts.reduce((acc, attempt) => {
    const moduleKey = resolveModuleKey(attempt.category || course || 'General', attempt.module || 'General');
    const existing = acc[moduleKey];
    if (!existing || new Date(attempt.submittedAt) > new Date(existing.submittedAt)) {
      acc[moduleKey] = attempt;
    }
    return acc;
  }, {});

  const fallbackLeaderboardModules = Array.from(new Set(
    visibleModules.map((moduleKey) => moduleMetaByKey[moduleKey]?.module).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  const leaderboardModuleOptions = Array.from(new Set([
    ...leaderboardModules,
    ...fallbackLeaderboardModules
  ])).sort((a, b) => a.localeCompare(b));

  const leaderboardChampion = leaderboard[0] || null;

  useEffect(() => {
    if (selectedCourseFilter === 'all') return;
    if (availableCourses.includes(selectedCourseFilter)) return;
    setSelectedCourseFilter('all');
  }, [availableCourses, selectedCourseFilter]);

  useEffect(() => {
    if (!loadError) return;
    if (/authentication|unauthorized/i.test(loadError.message || '')) {
      logout();
      navigate('/', { replace: true });
    } else {
      setBanner({ type: 'error', text: loadError.message });
    }
  }, [loadError, navigate, logout]);

  useEffect(() => {
    if (favMutError) setBanner({ type: 'error', text: favMutError.message });
  }, [favMutError]);

  useEffect(() => {
    if (progressMutError) setBanner({ type: 'error', text: progressMutError.message });
  }, [progressMutError]);

  useEffect(() => {
    if (!profileMessage) return undefined;
    const timer = window.setTimeout(() => setProfileMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [profileMessage]);

  useEffect(() => {
    if (!cartPriceSyncMessage) return undefined;
    const timer = window.setTimeout(() => setCartPriceSyncMessage(''), 3000);
    return () => window.clearTimeout(timer);
  }, [cartPriceSyncMessage]);

  useEffect(() => {
    if (!banner?.text) return undefined;
    if (banner.text !== 'Checkout was cancelled. No payment was made.') return undefined;

    const timer = window.setTimeout(() => setBanner(null), 3000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    if (!profileOpen || typeof window === 'undefined') return undefined;

    const { body, documentElement } = document;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    profileScrollLockRef.current = scrollY;

    const previousBodyStyles = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overscrollBehavior: body.style.overscrollBehavior
    };

    const previousHtmlStyles = {
      overflow: documentElement.style.overflow,
      overscrollBehavior: documentElement.style.overscrollBehavior
    };

    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overscrollBehavior = 'none';
    documentElement.style.overflow = 'hidden';
    documentElement.style.overscrollBehavior = 'none';

    return () => {
      body.style.overflow = previousBodyStyles.overflow;
      body.style.position = previousBodyStyles.position;
      body.style.top = previousBodyStyles.top;
      body.style.left = previousBodyStyles.left;
      body.style.right = previousBodyStyles.right;
      body.style.width = previousBodyStyles.width;
      body.style.overscrollBehavior = previousBodyStyles.overscrollBehavior;
      documentElement.style.overflow = previousHtmlStyles.overflow;
      documentElement.style.overscrollBehavior = previousHtmlStyles.overscrollBehavior;
      window.scrollTo(0, profileScrollLockRef.current);
    };
  }, [profileOpen]);

  useEffect(() => {
    if (!selectedModule) {
      setSelectedAccessTarget(ALL_MODULES);
      return;
    }
    const nextModuleAccess = getModuleAccessInfo(selectedModule.name, selectedModule.category);
    if (nextModuleAccess?.purchaseRequired && !nextModuleAccess?.unlocked) {
      setSelectedAccessTarget(normalizeModuleName(selectedModule.name));
    }
  }, [selectedModule, access]);

  useEffect(() => {
    return () => {
      if (profileCloseTimerRef.current) {
        window.clearTimeout(profileCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const restoreModule = location.state?.restoreModule;
    if (!restoreModule?.name) return;

    setSelectedModule({
      name: normalizeModuleName(restoreModule.name),
      category: normalizeCourseName(restoreModule.category || course || 'General')
    });
    setSelectedModuleSection('');

    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate, course]);

  useEffect(() => {
    let cancelled = false;
    setLeaderboardLoading(true);
    setLeaderboardError('');

    const activeModuleFilter = leaderboardModuleFilter === 'all' ? '' : leaderboardModuleFilter;

    fetchQuizLeaderboard(activeModuleFilter)
      .then((data) => {
        if (cancelled) return;
        setLeaderboard(data?.leaderboard || []);
        setLeaderboardModules(data?.modules || []);
      })
      .catch((error) => {
        if (cancelled) return;
        setLeaderboardError(error?.message || 'Failed to load leaderboard.');
      })
      .finally(() => {
        if (!cancelled) {
          setLeaderboardLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [leaderboardModuleFilter, quizAttempts.length]);

  useEffect(() => {
    let cancelled = false;
    setIsProfileLoading(true);
    requestJson('/auth/me')
      .then((data) => {
        if (cancelled) return;
        const user = data?.user || null;
        setProfile(user);
        setProfileForm({
          username: user?.username || '',
          phone: user?.phone || '',
          city: user?.city || '',
          password: ''
        });
      })
      .catch((error) => {
        if (!cancelled) setBanner({ type: 'error', text: error.message });
      })
      .finally(() => {
        if (!cancelled) setIsProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMockExamLoading(true);
    fetchMyMockExams()
      .then((data) => {
        if (cancelled) return;
        setMockExams(Array.isArray(data?.exams) ? data.exams : []);
        setMockExamNotices(Array.isArray(data?.notices) ? data.notices : []);
      })
      .catch((error) => {
        if (!cancelled) setBanner({ type: 'error', text: error.message || 'Failed to load monthly mock exams.' });
      })
      .finally(() => {
        if (!cancelled) setMockExamLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [quizAttempts.length]);

  useEffect(() => {
    let cancelled = false;
    setExamLeaderboardLoading(true);
    setExamLeaderboardError('');

    const activeMonthFilter = examLeaderboardMonthFilter === 'all' ? '' : examLeaderboardMonthFilter;

    fetchMockExamLeaderboard(activeMonthFilter)
      .then((data) => {
        if (cancelled) return;
        setExamLeaderboard(Array.isArray(data?.leaderboard) ? data.leaderboard : []);
        setExamLeaderboardMonths(Array.isArray(data?.months) ? data.months : []);
      })
      .catch((error) => {
        if (cancelled) return;
        setExamLeaderboardError(error?.message || 'Failed to load exam leaderboard.');
      })
      .finally(() => {
        if (!cancelled) setExamLeaderboardLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mockExams.length, quizAttempts.length, examLeaderboardMonthFilter]);

  useEffect(() => {
    if (examLeaderboardMonthFilter === 'all') return;
    if (examLeaderboardMonths.includes(examLeaderboardMonthFilter)) return;
    setExamLeaderboardMonthFilter('all');
  }, [examLeaderboardMonths, examLeaderboardMonthFilter]);


  // Poll for live class status every 5 seconds
  useEffect(() => {
    let cancelled = false;
    async function checkLive() {
      try {
        const data = await requestJson('/live/status');
        if (!cancelled) {
          if (data.active) {
            setLiveClass(data);
            setUpcomingClass(null);
          } else {
            setLiveClass(null);
            setUpcomingClass(data.upcoming || null);
          }
        }
      } catch {
        // silently ignore — non-critical
      }
    }
    checkLive();
    const interval = window.setInterval(checkLive, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Live countdown for upcoming class
  useEffect(() => {
    if (!upcomingClass) { setUpcomingCountdown(''); return; }
    function computeCountdown() {
      const diff = new Date(upcomingClass.scheduledAt).getTime() - Date.now();
      if (diff <= 0) { setUpcomingCountdown('Starting soon'); return; }
      const totalMins = Math.floor(diff / 60000);
      const days = Math.floor(totalMins / 1440);
      const hours = Math.floor((totalMins % 1440) / 60);
      const mins = totalMins % 60;
      if (days > 0) setUpcomingCountdown(`in ${days}d ${hours}h`);
      else if (hours > 0) setUpcomingCountdown(`in ${hours}h ${mins}m`);
      else setUpcomingCountdown(`in ${mins}m`);
    }
    computeCountdown();
    const t = window.setInterval(computeCountdown, 30000);
    return () => window.clearInterval(t);
  }, [upcomingClass]);


  async function handleDownload(material) {
    setDownloadProgress((current) => ({ ...current, [material.filename]: 0 }));
    try {
      await downloadMaterial(material.videoId || material._videoId || material.video || material.parentVideoId, material.filename, material.name, (percent) => {
        setDownloadProgress((current) => ({ ...current, [material.filename]: percent }));
      });
      setBanner({ type: 'success', text: `Downloaded ${material.name}.` });
    } catch (error) {
      setBanner({ type: 'error', text: error.message });
    }
  }

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

  async function handleUnlockCourse() {
    if (isUnlockingCourse) return;
    setIsUnlockingCourse(true);
    setBanner(null);
    try {
      await startMembershipCheckout({
        targetModuleName: selectedAccessTarget || ALL_MODULES,
        planType: selectedPlan,
        voucher: voucherCode,
        reloadOnSuccess: true,
        showSuccessBanner: true,
        showCancelBanner: true
      });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to start payment.' });
    } finally {
      setIsUnlockingCourse(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  function openProfileModal() {
    if (profileCloseTimerRef.current) {
      window.clearTimeout(profileCloseTimerRef.current);
      profileCloseTimerRef.current = null;
    }
    setProfileClosing(false);
    setProfileOpen(true);
  }

  function closeProfileModal() {
    if (!profileOpen || profileClosing) return;
    setProfileClosing(true);
    profileCloseTimerRef.current = window.setTimeout(() => {
      setProfileOpen(false);
      setProfileClosing(false);
      profileCloseTimerRef.current = null;
    }, 220);
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage(null);
    try {
      const payload = {
        username: profileForm.username.trim(),
        phone: profileForm.phone.trim(),
        city: profileForm.city.trim()
      };
      if (profileForm.password.trim()) {
        payload.password = profileForm.password;
      }

      const response = await requestJson('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      setProfile(response.user);
      setProfileForm((current) => ({
        ...current,
        username: response.user.username,
        phone: response.user.phone,
        city: response.user.city,
        password: ''
      }));
      login({
        role: 'user',
        username: response.user.username,
        token: response.token
      });
      setProfileMessage({ type: 'success', text: response.message || 'Profile updated successfully.' });
    } catch (error) {
      setProfileMessage({ type: 'error', text: error.message });
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('avatar', file);
    setIsUploadingAvatar(true);
    setProfileMessage(null);
    try {
      const response = await requestJson('/auth/me/avatar', {
        method: 'POST',
        body: formData
      });
      setProfile(response.user);
      setProfileMessage({ type: 'success', text: response.message || 'Profile photo updated successfully.' });
    } catch (error) {
      setProfileMessage({ type: 'error', text: error.message });
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = '';
    }
  }

  async function handleDeleteAvatar() {
    setIsUploadingAvatar(true);
    setProfileMessage(null);
    try {
      const response = await requestJson('/auth/me/avatar', {
        method: 'DELETE'
      });
      setProfile(response.user);
      setProfileMessage({ type: 'success', text: response.message || 'Profile photo removed successfully.' });
    } catch (error) {
      setProfileMessage({ type: 'error', text: error.message });
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  const rawProfileAvatarUrl = String(profile?.avatarUrl || '').trim();
  const profileAvatarUrl = rawProfileAvatarUrl
    ? (/^https?:\/\//i.test(rawProfileAvatarUrl) ? rawProfileAvatarUrl : `${getApiBase()}${rawProfileAvatarUrl}`)
    : '';
  const profileInitial = (profile?.username || session?.username || 'S').trim().charAt(0).toUpperCase();
  const studentNavItems = useMemo(() => {
    const baseItems = [
      { id: 'section-overview', label: 'Overview', icon: '🏠' },
      { id: 'section-learning', label: 'Learning', icon: '📘' }
    ];
    if (selectedModule) return [...baseItems, { id: 'section-connect', label: 'Connect', icon: '🔗' }];
    return [
      ...baseItems,
      {
        id: 'section-community-chat',
        label: (
          <span className="nav-live-label">
            Community Chat
            <span className="live-badge" aria-hidden="true">
              <span className="live-badge-dot" />
              LIVE
            </span>
          </span>
        ),
        icon: '💬'
      },
      { id: 'section-quiz-performance', label: 'Quiz Performance', icon: '📊' },
      { id: 'section-leaderboard', label: 'Leaderboard', icon: '🏆' },
      { id: 'section-monthly-exam', label: 'Monthly Exam', icon: '📅' },
      { id: 'section-exam-leaderboard', label: 'Exam Leaderboard', icon: '🥇' },
      { id: 'section-feedback', label: 'Feedback', icon: '💬' },
      { id: 'section-connect', label: 'Connect', icon: '🔗' }
    ];
  }, [selectedModule]);

  return (
    <>
    <AppShell
      title="Student Dashboard"
      roleLabel="Student"
      showThemeSwitch={false}
      navTitle="Student Sections"
      navItems={studentNavItems}
      actions={(
        <div className="topbar-user-actions">
          <StudentAnnouncementBell />
          <button
            type="button"
            ref={cartIconButtonRef}
            className="student-cart-header-btn"
            title="Open cart"
            aria-label="Open cart"
            onClick={() => setCartOpen((current) => !current)}
          >
            <span aria-hidden="true">🛒</span>
            {lockedModuleCart.length ? <span className="student-cart-header-count">{lockedModuleCart.length > 9 ? '9+' : lockedModuleCart.length}</span> : null}
          </button>
          <div className="profile-trigger-wrap">
            <button
              type="button"
              className="profile-icon-btn"
              onClick={openProfileModal}
              aria-label="Open profile settings"
              title="Profile settings"
            >
              {profileAvatarUrl ? (
                <img src={profileAvatarUrl} alt="Student profile" className="profile-icon-image" />
              ) : (
                <span className="profile-icon-fallback">{profileInitial}</span>
              )}
            </button>
            <div className="profile-hover-card" aria-hidden="true">
              <strong>{profile?.username || session?.username || 'Student'}</strong>
              <span>{profile?.class || course || 'Course unavailable'}</span>
              <span>{profile?.city || 'City unavailable'}</span>
              {visibleMembership ? (
                <div className="profile-membership-card" role="status" aria-live="polite">
                  <div className="profile-membership-head">
                    <span className="profile-membership-label">Active membership</span>
                    <span className="profile-membership-tag">{visibleMembership.planType === 'elite' ? 'Elite' : 'Pro'}</span>
                  </div>
                  <span className="profile-membership-expiry">
                    Expires {formatMembershipDate(visibleMembership.expiresAt)}
                  </span>
                </div>
              ) : null}
              <button
                type="button"
                className="profile-theme-btn"
                onClick={toggleTheme}
                aria-label={`Switch to ${isLightTheme ? 'Dark' : 'Light'} theme`}
              >
                {isLightTheme ? 'Switch to Dark' : 'Switch to Light'}
              </button>
            </div>
          </div>
        </div>
      )}
    >
      <div id="section-overview" className="student-dashboard-view">
        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

        {cartOpen && typeof document !== 'undefined' ? createPortal(
          <div className="student-cart-overlay" role="presentation" onClick={() => setCartOpen(false)}>
            <aside
              className="student-cart-drawer student-cart-drawer-floating"
              role="dialog"
              aria-label="Checkout cart"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="student-cart-drawer-head">
                <div>
                  <p className="eyebrow">Checkout Cart</p>
                  <h3>{lockedModuleCart.length} item{lockedModuleCart.length === 1 ? '' : 's'} in cart</h3>
                </div>
                <button type="button" className="student-cart-close-btn" onClick={() => setCartOpen(false)} aria-label="Close cart">
                  ×
                </button>
              </header>

              <div className="student-cart-drawer-body">
                <div className="student-cart-plan-row" role="group" aria-label="Select cart plan">
                  <button
                    type="button"
                    className={`secondary-btn${cartPlanType === 'pro' ? ' active' : ''}`}
                    onClick={() => setCartPlanType('pro')}
                  >
                    Pro Plan
                  </button>
                  <button
                    type="button"
                    className={`secondary-btn${cartPlanType === 'elite' ? ' active' : ''}`}
                    onClick={() => setCartPlanType('elite')}
                  >
                    Elite Plan
                  </button>
                </div>

                <label className="student-cart-voucher-field">
                  Voucher Code
                  <div className="student-cart-voucher-row">
                    <input
                      type="text"
                      placeholder="Enter voucher"
                      value={cartVoucherCode}
                      onChange={(event) => {
                        setCartVoucherCode(event.target.value.toUpperCase());
                        if (cartVoucherMessage) setCartVoucherMessage('');
                      }}
                      maxLength={20}
                    />
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={handleApplyCartVoucher}
                      disabled={isApplyingCartVoucher || !cartVoucherCode.trim() || cartVoucherCode.trim().toUpperCase() === appliedCartVoucherCode}
                    >
                      {isApplyingCartVoucher ? 'Applying...' : 'Apply'}
                    </button>
                  </div>
                </label>

                {appliedCartVoucherCode ? (
                  <div className="student-cart-voucher-applied" role="status" aria-live="polite">
                    <span>Applied: {appliedCartVoucherCode}</span>
                    <button type="button" className="link-btn" onClick={handleRemoveCartVoucher}>Remove</button>
                  </div>
                ) : null}

                {cartVoucherMessage ? (
                  <p className="student-cart-voucher-note" role="status" aria-live="polite">{cartVoucherMessage}</p>
                ) : null}

                {cartPriceSyncMessage ? (
                  <p className="student-cart-voucher-note" role="status" aria-live="polite">{cartPriceSyncMessage}</p>
                ) : null}

                {!lockedModuleCart.length ? (
                  <p className="empty-state">Your cart is empty. Add locked modules from cards.</p>
                ) : (
                  <div className="student-cart-items">
                    {lockedModuleCart.map((item) => (
                      <article key={item.key} className="student-cart-drawer-item">
                        <div>
                          <div className="student-cart-item-headline">
                            <strong>{item.moduleName}</strong>
                            <span className={`student-cart-course-chip tone-${getCourseTone(item.moduleCourse)}`}>{item.moduleCourse}</span>
                          </div>
                          <p>Course purchase</p>
                          <span>
                            {`${cartPlanType === 'elite' ? 'Elite' : 'Pro'} • ${formatPriceInPaise(getCartItemEffectivePrice(item, cartPlanType))}`}
                          </span>
                        </div>
                        <div className="student-cart-item-actions">
                          <button
                            type="button"
                            className="link-btn"
                            disabled={isBulkCheckoutRunning || cartItemCheckoutKey === item.key}
                            onClick={() => handleCheckoutSingleCartItem(item)}
                          >
                            {cartItemCheckoutKey === item.key ? 'Processing...' : 'Checkout'}
                          </button>
                          <button type="button" className="secondary-btn" onClick={() => removeLockedModuleFromCart(item.key)}>
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
                  <small>{appliedCartVoucherCode ? 'Estimated total (voucher applied)' : 'Estimated total'}</small>
                  <strong>{formatPriceInPaise(payableCartEstimate)}</strong>
                  {appliedCartVoucherCode && payableCartDiscountTotal > 0 ? (
                    <span className="student-cart-savings-note">You save {formatPriceInPaise(payableCartDiscountTotal)}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handlePayNowForCart}
                  disabled={isBulkCheckoutRunning || isUnlockingCourse || !payableCartItems.length}
                >
                  {isBulkCheckoutRunning ? 'Processing Cart...' : `Pay Now (${payableCartItems.length})`}
                </button>
              </footer>
            </aside>
          </div>,
          document.body
        ) : null}

        {!selectedModule && mockExamNotices.length ? (
          <aside className="monthly-exam-notice card" role="status" aria-live="polite">
            <div>
              <p className="eyebrow">Monthly Mock Exam Notice</p>
              <h3>
                {mockExamNotices[0].type === 'resultReleased'
                  ? 'Result released. Go to Exam section to view details.'
                  : `Upcoming exam on ${new Date(mockExamNotices[0].examDate).toLocaleDateString()}.`}
              </h3>
              <p>{mockExamNotices[0].title}</p>
            </div>
            <div className="quiz-thankyou-actions">
              <button type="button" className="primary-btn" onClick={() => {
                const node = document.getElementById('section-monthly-exam');
                if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}>
                Go To Exam Section
              </button>
              <button type="button" className="secondary-btn" onClick={() => setMockExamNotices((current) => current.slice(1))}>
                Dismiss
              </button>
            </div>
          </aside>
        ) : null}

        {/* ── Live Class Banner ──────────────────────────── */}
        {liveClass ? (
          <section className="live-class-student-banner card">
            <div className="live-class-banner-info">
              <span className="live-badge pulsing">LIVE NOW</span>
              <div>
                <strong className="live-class-title-display">{liveClass.title}</strong>
                <span className="live-class-since">⏰ Live since {new Date(liveClass.startedAt).toLocaleTimeString()}</span>
              </div>
            </div>
            <a
              href={liveClass.meetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="primary-btn live-join-btn"
            >
              📹 Join Google Meet
            </a>
          </section>
        ) : null}

        {/* ── Upcoming Class Banner ──────────────────────── */}
        {!liveClass && upcomingClass ? (
          <section className="upcoming-class-banner">
            <div className="upcoming-banner-glow" aria-hidden="true" />
            <div className="upcoming-banner-left">
              <div className="upcoming-banner-icon">📅</div>
              <div className="upcoming-banner-text">
                <span className="upcoming-banner-label">Upcoming Class</span>
                <strong className="upcoming-banner-title">{upcomingClass.title}</strong>
                <span className="upcoming-banner-time">
                  {(() => {
                    const d = new Date(upcomingClass.scheduledAt);
                    const now = new Date();
                    const isToday = d.toDateString() === now.toDateString();
                    const isTomorrow = d.toDateString() === new Date(now.getTime() + 86400000).toDateString();
                    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    if (isToday) return `Today at ${timeStr}`;
                    if (isTomorrow) return `Tomorrow at ${timeStr}`;
                    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ` at ${timeStr}`;
                  })()}
                </span>
              </div>
            </div>
            <div className="upcoming-banner-right">
              <div className="upcoming-countdown-chip">
                <span className="upcoming-countdown-dot" />
                <span className="upcoming-countdown-text">{upcomingCountdown}</span>
              </div>
              {upcomingClass.meetUrl ? (
                <a href={upcomingClass.meetUrl} target="_blank" rel="noopener noreferrer" className="upcoming-join-btn">
                  Set Reminder &rarr;
                </a>
              ) : (
                <span className="upcoming-link-pending">Link coming soon</span>
              )}
            </div>
          </section>
        ) : null}

      <section className="student-tools-row card">
        <label>
          Search modules or lectures
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by module name, lecture title, or description"
          />
        </label>
        <label>
          Filter by course
          <select
            value={selectedCourseFilter}
            onChange={(event) => {
              setSelectedCourseFilter(event.target.value);
              setSelectedModule(null);
            }}
          >
            <option value="all">All Courses</option>
            {availableCourses.map((courseName) => (
              <option key={courseName} value={courseName}>{courseName}</option>
            ))}
          </select>
        </label>
        {selectedModule && selectedModuleSection === 'lectures' ? (
          <>
            <label>
              Sort lectures
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="latest">Latest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A-Z</option>
              </select>
            </label>
            <button type="button" className={`secondary-btn ${showSavedOnly ? 'active' : ''}`} onClick={() => setShowSavedOnly((current) => !current)}>
              {showSavedOnly ? 'Showing Saved Only' : 'Filter Saved Only'}
            </button>
          </>
        ) : null}

        <div className="progress-summary-box">
          <strong>{progressScopeCompletedCount}/{progressScopeVideos.length} complete</strong>
          <span>{progressScopeLabel} progress: {progressScopePercent}%</span>
        </div>
      </section>

      {hasAnyUnlockedModule && !selectedModule && favoriteVideos.length ? (
        <section className="card favorites-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Saved for Later</p>
              <h2>Your Favorites</h2>
            </div>
            <StatCard label="Saved" value={favoriteVideos.length} />
          </div>
          <div className="favorite-chip-row">
            {favoriteVideos.slice(0, 8).map((video) => (
              <button
                key={video._id}
                type="button"
                className="favorite-chip"
                onClick={() => {
                  setSelectedModule({
                    name: String(video.module || 'General').trim() || 'General',
                    category: normalizeCourseName(video.category || 'General')
                  });
                  setSelectedModuleSection('');
                }}
              >
                <span>★</span>
                {video.title}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section id="section-learning" className="section-header standalone student-lecture-header">
        <div>
          <p className="eyebrow">Learning Content</p>
          {selectedModule ? (
            <>
              <h2>{selectedModuleCourse} - {selectedModuleName}</h2>
              <button
                className="back-btn small"
                onClick={() => {
                  setSelectedModule(null);
                  setSelectedModuleSection('');
                }}
                title="Back to modules"
              >
                ← Back to Modules
              </button>
            </>
          ) : (
            <h2>{activeCourseFilter ? `${activeCourseFilter} Modules` : 'All Course Modules'}</h2>
          )}
        </div>
        {selectedModule && <StatCard label="Lectures in Module" value={displayedVideos.length} />}
        {!selectedModule && <StatCard label="Total Modules" value={visibleModules.length} />}
      </section>

      {!selectedModule && bundlePlanOptions.some((plan) => plan.amountInPaise > 0) && !allModulesUnlocked ? (
        <section className="card course-lock-panel membership-lock-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">All Modules Bundle</p>
              <h2>Unlock every module in {course || 'this course'}</h2>
            </div>
            <StatCard label="Unlock" value="All Modules" />
          </div>
          <p className="empty-note">Buy the full-course bundle to access every module at once. Or open a locked module card below to buy only that module.</p>

          <div className="membership-plan-grid">
            {bundlePlanOptions.map((plan) => {
              const isSelected = selectedPlan === plan.type;
              const isElite = plan.type === 'elite';
              return (
                <button
                  key={plan.type}
                  type="button"
                  className={`membership-plan-card${isSelected ? ' selected' : ''}${isElite ? ' elite' : ' pro'}`}
                  onClick={() => {
                    setSelectedPlan(plan.type);
                    setSelectedAccessTarget(ALL_MODULES);
                  }}
                >
                  <div className="membership-plan-head">
                    <span className="membership-plan-kicker">{isElite ? 'Premium Tier' : 'Starter Tier'}</span>
                    <span className="membership-plan-badge">{plan.label}</span>
                    {isElite ? <span className="membership-plan-elite-flag">Most Popular</span> : null}
                  </div>
                  <div className="membership-plan-price">{formatPriceInPaise(plan.amountInPaise)}</div>
                  <p className="membership-plan-duration">{plan.durationMonths} {plan.durationMonths === 1 ? 'month' : 'months'} access</p>
                  <ul className="membership-plan-points">
                    <li>All lectures in {course}</li>
                    <li>Study materials and downloads</li>
                    <li>Quizzes and progress tracking</li>
                    <li>{isElite ? 'Longer validity and premium status' : 'Full access for monthly prep'}</li>
                  </ul>
                </button>
              );
            })}
          </div>

          <div className="material-upload-row membership-actions-row">
            <input
              type="text"
              placeholder="Voucher code (optional)"
              value={voucherCode}
              onChange={(event) => setVoucherCode(event.target.value.toUpperCase())}
              maxLength={20}
            />
            <button type="button" className="primary-btn" onClick={handleUnlockCourse} disabled={isUnlockingCourse || !selectedPlan}>
              {isUnlockingCourse ? 'Processing...' : `Unlock All Modules with ${selectedPlan === 'elite' ? 'Elite' : 'Pro'}`}
            </button>
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <div className="video-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <article key={`student-skeleton-${index}`} className="video-card skeleton-card">
              <div className="skeleton-box" />
              <div className="video-card-body">
                <div className="skeleton-line large" />
                <div className="skeleton-line" />
                <div className="skeleton-line" />
              </div>
            </article>
          ))}
        </div>
      ) : !selectedModule && visibleModules.length ? (
        // Module Selection View
        <div className="modules-view-container">
          <div className="modules-grid-student">
            {visibleModules.map((moduleKey) => {
              const moduleMeta = moduleMetaByKey[moduleKey];
              const module = moduleMeta.module;
              const moduleCourse = moduleMeta.category;
              const moduleAccessInfo = getModuleAccessInfo(module, moduleCourse);
              const moduleIsLocked = Boolean(moduleAccessInfo.purchaseRequired && !moduleAccessInfo.unlocked);
              const cartItemKey = buildLockedCartKey(module, moduleCourse);
              const isInLockedCart = lockedModuleCart.some((item) => item.key === cartItemKey);
              const isJustAddedToCart = recentlyAddedCartKey === cartItemKey;
              const moduleVideos = videosByModule[moduleKey] || [];
              const completedInModule = moduleVideos.filter((video) => completedIds.has(normalizeId(video._id))).length;
              const moduleQuizCount = (quizzesByModule[moduleKey] || []).length;
              const hasQuizAttempt = Boolean(latestAttemptByModule[moduleKey]);
              const lectureProgress = moduleVideos.length
                ? Math.round((completedInModule / moduleVideos.length) * 100)
                : 0;
              let moduleProgressPercent = lectureProgress;
              if (!moduleVideos.length && moduleQuizCount) {
                moduleProgressPercent = hasQuizAttempt ? 100 : 0;
              } else if (moduleVideos.length && moduleQuizCount) {
                moduleProgressPercent = Math.round((lectureProgress + (hasQuizAttempt ? 100 : 0)) / 2);
              }
              return (
                <article key={moduleKey} className={`module-card-btn${moduleIsLocked ? ' module-card-btn-locked' : ''}`}>
                  <div className="module-card-header">
                    <span className="module-card-icon">📚</span>
                    <span className="module-card-count">{moduleVideos.length}</span>
                  </div>
                  <div className="module-card-body">
                    <h3 className="module-card-title">{module}</h3>
                    {selectedCourseFilter === 'all' ? <p className="module-card-course">{moduleCourse}</p> : null}
                    <p className="module-card-subtitle">
                      {moduleVideos.length} {moduleVideos.length === 1 ? 'lecture' : 'lectures'}
                      {moduleQuizCount ? ` • ${moduleQuizCount} ${moduleQuizCount === 1 ? 'quiz' : 'quizzes'}` : ''}
                    </p>
                    <p className="module-card-progress">
                      {moduleIsLocked
                        ? (moduleAccessInfo.crossCourse
                            ? 'Locked • Separate course purchase required'
                            : `Locked • ${formatPriceInPaise(moduleAccessInfo.pricing?.plans?.[0]?.amountInPaise || 0)} Pro`)
                        : `Progress: ${moduleProgressPercent}%`}
                    </p>
                    {latestAttemptByModule[moduleKey] ? (
                      <p className="module-card-quiz-score">
                        Quiz: {latestAttemptByModule[moduleKey].score}/{latestAttemptByModule[moduleKey].total}
                      </p>
                    ) : null}
                  </div>
                  <div className="module-card-actions">
                    <button
                      type="button"
                      className="primary-btn module-open-btn"
                      onClick={() => {
                        setSelectedModule({ name: module, category: moduleCourse });
                        setSelectedModuleSection('');
                      }}
                    >
                      {moduleIsLocked ? 'View Lock Details' : 'Open Module'}
                    </button>
                    {moduleIsLocked ? (
                      <button
                        type="button"
                        className={`secondary-btn module-cart-btn${isInLockedCart ? ' in-cart go-cart' : ''}${isJustAddedToCart ? ' just-added' : ''}`}
                        onClick={(event) => {
                          if (isInLockedCart) {
                            setCartOpen(true);
                            return;
                          }
                          addLockedModuleToCart(module, moduleCourse, moduleAccessInfo, event.currentTarget);
                        }}
                      >
                        {isInLockedCart ? (isJustAddedToCart ? 'Added ✓' : 'Go to Cart') : 'Add to Cart'}
                      </button>
                    ) : null}
                  </div>
                  <span className="module-card-arrow">{moduleIsLocked ? '🔒' : '→'}</span>
                </article>
              );
            })}
          </div>
        </div>
      ) : selectedModule && moduleLocked ? (
        <section className="card membership-lock-panel module-membership-lock-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Module Access Required</p>
              <h2>Unlock {selectedModuleName}</h2>
            </div>
            <StatCard label="Course" value={selectedModuleCourse || course || 'Module'} />
          </div>
          {isCrossCourseSelection ? (
            <p className="empty-note">
              Buy this module from {selectedModuleCourse} using cart checkout. You can purchase courses across branches from the same account.
            </p>
          ) : (
            <p className="empty-note">Choose whether you want access to only this module or the full-course bundle.</p>
          )}

          {isCrossCourseSelection ? (
            <div className="material-upload-row membership-actions-row">
              <button
                type="button"
                className="secondary-btn"
                onClick={(event) => {
                  if (selectedModuleIsInCart) {
                    setCartOpen(true);
                    return;
                  }
                  addLockedModuleToCart(
                    selectedModuleName,
                    selectedModuleCourse,
                    selectedModuleAccess || { pricing: { plans: [] } },
                    event.currentTarget
                  );
                }}
              >
                {selectedModuleIsInCart ? 'Go to Cart' : 'Add to Cart'}
              </button>
              <button type="button" className="primary-btn" onClick={() => setCartOpen(true)}>
                Open Cart Checkout
              </button>
            </div>
          ) : null}

          {!isCrossCourseSelection ? (
            <div className="membership-target-switch">
              <button
                type="button"
                className={`secondary-btn${selectedAccessTarget === normalizeModuleName(selectedModuleName) ? ' active' : ''}`}
                onClick={() => setSelectedAccessTarget(normalizeModuleName(selectedModuleName))}
              >
                This Module
              </button>
              <button
                type="button"
                className={`secondary-btn${selectedAccessTarget === ALL_MODULES ? ' active' : ''}`}
                onClick={() => setSelectedAccessTarget(ALL_MODULES)}
              >
                All Modules Bundle
              </button>
            </div>
          ) : null}

          {!isCrossCourseSelection ? (
            <div className="membership-plan-grid">
              {selectedTargetPlans.map((plan) => {
                const isSelected = selectedPlan === plan.type;
                const isElite = plan.type === 'elite';
                return (
                  <button
                    key={`${selectedAccessTarget}-${plan.type}`}
                    type="button"
                    className={`membership-plan-card${isSelected ? ' selected' : ''}${isElite ? ' elite' : ' pro'}`}
                    onClick={() => setSelectedPlan(plan.type)}
                  >
                    <div className="membership-plan-head">
                      <span className="membership-plan-kicker">{selectedAccessTarget === ALL_MODULES ? 'Bundle Access' : 'Module Access'}</span>
                      <span className="membership-plan-badge">{plan.label}</span>
                      {isElite ? <span className="membership-plan-elite-flag">Most Popular</span> : null}
                    </div>
                    <div className="membership-plan-price">{formatPriceInPaise(plan.amountInPaise)}</div>
                    <p className="membership-plan-duration">{plan.durationMonths} {plan.durationMonths === 1 ? 'month' : 'months'} access</p>
                    <ul className="membership-plan-points">
                      <li>{selectedAccessTarget === ALL_MODULES ? `All modules in ${selectedModuleCourse || course}` : `Only ${selectedModuleName}`}</li>
                      <li>Lecture videos and notes</li>
                      <li>Quizzes for unlocked modules</li>
                      <li>{isElite ? 'Longer validity and premium status' : 'Fast monthly access'}</li>
                    </ul>
                  </button>
                );
              })}
            </div>
          ) : null}

          {!isCrossCourseSelection ? (
            <div className="material-upload-row membership-actions-row">
              <input
                type="text"
                placeholder="Voucher code (optional)"
                value={voucherCode}
                onChange={(event) => setVoucherCode(event.target.value.toUpperCase())}
                maxLength={20}
              />
              <button type="button" className="primary-btn" onClick={handleUnlockCourse} disabled={isUnlockingCourse || !selectedPlan || !selectedTargetPlans.length}>
                {isUnlockingCourse
                  ? 'Processing...'
                  : `Unlock ${selectedAccessTarget === ALL_MODULES ? 'All Modules' : 'This Module'} with ${selectedPlan === 'elite' ? 'Elite' : 'Pro'}`}
              </button>
            </div>
          ) : null}
        </section>
      ) : selectedModule && !moduleLocked && selectedModuleSection === 'lectures' && displayedVideos.length ? (
        // Video Grid View (within selected module)
        <div className="module-videos-scroll">
          <div className="compact-premium-video-grid">
            {displayedVideos.map((video) => (
              <FinalWorkingVideoCard
                key={video._id}
                video={video}
                adminMode={false}
                downloadProgress={downloadProgress}
                onDownloadMaterial={handleDownload}
                onToggleFavorite={toggleFavorite}
                isFavorite={favoriteIds.has(normalizeId(video._id))}
                onToggleCompleted={toggleCompleted}
                isCompleted={completedIds.has(normalizeId(video._id))}
              />
            ))}
          </div>
        </div>
      ) : selectedModule && !moduleLocked && selectedModuleSection === 'lectures' ? (
        <p className="empty-state">No lectures available in {selectedModuleName}.</p>
      ) : selectedModule && !moduleLocked ? (
        <section className="card module-section-chooser">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Module Workspace</p>
              <h2>Choose section to continue</h2>
            </div>
            <StatCard label="Module" value={selectedModuleName || 'Selected'} />
          </div>
          <div className="module-section-grid">
            <button
              type="button"
              className="module-section-card"
              onClick={() => navigate(`/student/module/${encodeURIComponent(selectedModuleCourse || course || 'General')}/${encodeURIComponent(selectedModuleName || 'General')}/lectures`)}
            >
              <span className="module-section-icon" aria-hidden="true">🎬</span>
              <strong>Lecture Section</strong>
              <p>Open all videos for this module in a focused lecture layout.</p>
            </button>
            <button
              type="button"
              className="module-section-card"
              onClick={() => navigate(`/student/module/${encodeURIComponent(selectedModuleCourse || course || 'General')}/${encodeURIComponent(selectedModuleName || 'General')}/quizzes`)}
            >
              <span className="module-section-icon" aria-hidden="true">📝</span>
              <strong>Quiz Section</strong>
              <p>Open assessment quizzes and track performance for this chapter.</p>
            </button>
          </div>
        </section>
      ) : (
        <p className="empty-state">
          {activeCourseFilter ? `No modules available for ${activeCourseFilter}.` : 'No modules available yet.'}
        </p>
      )}

      {!selectedModule ? (
        <section id="section-community-chat" className="card student-community-launch-card">
          <div className="section-header compact">
            <div>
              <p className="eyebrow section-live-eyebrow">
                Community Chat
                <span className="live-badge" aria-hidden="true">
                  <span className="live-badge-dot" />
                  LIVE
                </span>
              </p>
              <h2>Talk with admins and learners in real time</h2>
              <p className="subtitle">Ask doubts, share tips, and stay connected with the whole Biomics community.</p>
            </div>
            <StatCard label="Status" value="Live" />
          </div>
          <div className="workspace-link-actions">
            <button type="button" className="primary-btn" onClick={() => navigate('/student/community-chat')}>
              Open Community Chat
            </button>
          </div>
        </section>
      ) : null}

      {hasAnyUnlockedModule && !selectedModule && visibleModules.length ? (
        <section id="section-quiz-performance" className="card quiz-history-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Quiz Performance</p>
              <h2>Last score by module</h2>
            </div>
          </div>
          <div className="quiz-history-grid">
            {visibleModules.map((moduleKey) => {
              const moduleMeta = moduleMetaByKey[moduleKey];
              const module = moduleMeta.module;
              const moduleCourse = moduleMeta.category;
              const attempt = latestAttemptByModule[moduleKey];
              return (
                <article key={`history-${moduleKey}`} className="quiz-history-item">
                  <strong>{module}</strong>
                  {selectedCourseFilter === 'all' ? <small>{moduleCourse}</small> : null}
                  {attempt ? (
                    <>
                      <span>Last: {attempt.score}/{attempt.total} ({Math.round((attempt.score / attempt.total) * 100)}%)</span>
                      <small>{new Date(attempt.submittedAt).toLocaleString()}</small>
                    </>
                  ) : (
                    <span>No attempts yet</span>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {shouldShowLeaderboard ? (
        <section id="section-leaderboard" className="card quiz-leaderboard-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Quiz Leaderboard</p>
              <h2>Top Performers</h2>
            </div>
            <label className="quiz-leaderboard-filter">
              Module
              <select
                value={leaderboardModuleFilter}
                onChange={(event) => setLeaderboardModuleFilter(event.target.value)}
              >
                <option value="all">All Modules</option>
                {leaderboardModuleOptions.map((moduleName) => (
                  <option key={moduleName} value={moduleName}>{moduleName}</option>
                ))}
              </select>
            </label>
          </div>

          {leaderboardLoading ? <p className="empty-note">Loading leaderboard...</p> : null}
          {!leaderboardLoading && leaderboardError ? <p className="inline-message error">{leaderboardError}</p> : null}

          {!leaderboardLoading && !leaderboardError ? (
            leaderboard.length ? (
              <>
                {leaderboardChampion ? (
                  <article className="leaderboard-champion-card">
                    <span className="leaderboard-crown" aria-hidden="true">👑</span>
                    <div>
                      <p className="leaderboard-champion-label">Highest Candidate</p>
                      <h3>{leaderboardChampion.username}</h3>
                      <p className="leaderboard-champion-meta">
                        {leaderboardChampion.module || 'General'} • {leaderboardChampion.score || 0}/{leaderboardChampion.total || 0} ({safePercent(leaderboardChampion.percentage)}%)
                      </p>
                    </div>
                  </article>
                ) : null}
                <div className="leaderboard-table-wrap">
                  <table className="leaderboard-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Candidate</th>
                        <th>Module</th>
                        <th>Best Score</th>
                        <th>Attempts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((entry, index) => (
                        <tr key={`${entry.username || 'candidate'}-${entry.module || 'General'}-${entry.rank || index + 1}`} className={entry.rank === 1 ? 'leaderboard-row-top' : ''}>
                          <td>#{entry.rank || index + 1}</td>
                          <td>{entry.username || 'Anonymous'}</td>
                          <td>{entry.module || 'General'}</td>
                          <td>{entry.score || 0}/{entry.total || 0} ({safePercent(entry.percentage)}%)</td>
                          <td>{entry.attemptsCount || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="empty-note">No leaderboard data yet for this module. Submit a quiz attempt to appear here.</p>
            )
          ) : null}
        </section>
      ) : null}

      {!selectedModule ? (
        <section id="section-monthly-exam" className="card monthly-exam-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Monthly Mock Test</p>
              <h2>Exam Section</h2>
            </div>
            <StatCard label="Exams" value={mockExams.length} />
          </div>

          {mockExamLoading ? <p className="empty-note">Loading monthly exams...</p> : null}

          {!mockExamLoading && !mockExams.length ? (
            <p className="empty-note">No monthly exams published yet.</p>
          ) : null}

          {!mockExamLoading && mockExams.length ? (
            <div className="quiz-admin-items">
              {mockExams.map((exam) => (
                <article key={exam._id} className="quiz-admin-item">
                  <div className="quiz-admin-item-body">
                    <strong>{exam.title}</strong>
                    <p>{new Date(exam.examDate).toLocaleString()}</p>
                    <div className="quiz-admin-meta">
                      <span className="quiz-admin-meta-chip">{exam.questionCount || 0} questions</span>
                      <span className="quiz-admin-meta-chip">{exam.durationMinutes || 60} min</span>
                      <span className="quiz-admin-meta-chip">{exam.attempted ? 'Attempted' : 'Pending'}</span>
                      <span className="quiz-admin-meta-chip">
                        {exam.windowClosed ? 'Window Over' : exam.examWindowEndAt ? `Window till ${new Date(exam.examWindowEndAt).toLocaleDateString()}` : 'Open Window'}
                      </span>
                      <span className="quiz-admin-meta-chip">{exam.resultReleased ? 'Result Released' : 'Result Pending'}</span>
                    </div>
                  </div>
                  <div className="quiz-admin-item-actions">
                    <button
                      type="button"
                      className={exam.windowClosed && !exam.attempted ? 'secondary-btn' : 'primary-btn'}
                      onClick={() => {
                        if (exam.windowClosed && !exam.attempted) return;
                        navigate(`/student/mock-exam/${encodeURIComponent(exam._id)}`);
                      }}
                      disabled={exam.windowClosed && !exam.attempted}
                    >
                      {exam.windowClosed && !exam.attempted
                        ? 'Exam Window Is Over'
                        : exam.resultReleased && exam.attempted
                          ? 'View Result'
                          : exam.attempted
                            ? 'View Status'
                            : 'Start Exam'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {!selectedModule ? (
        <section id="section-exam-leaderboard" className="card quiz-leaderboard-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Exam Leaderboard</p>
              <h2>Top Monthly Mock Performers</h2>
            </div>
            <label className="quiz-leaderboard-filter">
              Month
              <select
                value={examLeaderboardMonthFilter}
                onChange={(event) => setExamLeaderboardMonthFilter(event.target.value)}
              >
                <option value="all">All Months</option>
                {examLeaderboardMonths.map((monthValue) => (
                  <option key={monthValue} value={monthValue}>{formatMonthLabel(monthValue)}</option>
                ))}
              </select>
            </label>
          </div>

          {examLeaderboardLoading ? <p className="empty-note">Loading exam leaderboard...</p> : null}
          {!examLeaderboardLoading && examLeaderboardError ? <p className="inline-message error">{examLeaderboardError}</p> : null}

          {!examLeaderboardLoading && !examLeaderboardError ? (
            examLeaderboard.length ? (
              <div className="leaderboard-table-wrap">
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Candidate</th>
                      <th>Exam(s) Attempted</th>
                      <th>Best Score</th>
                      <th>Exams Attempted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {examLeaderboard.map((entry, index) => (
                      <tr key={`${entry.username || 'candidate'}-${entry.rank || index + 1}`} className={entry.rank === 1 ? 'leaderboard-row-top' : ''}>
                        <td>#{entry.rank || index + 1}</td>
                        <td>{entry.username || 'Anonymous'}</td>
                        <td>
                          {Array.isArray(entry.attemptedExamTitles) && entry.attemptedExamTitles.length
                            ? entry.attemptedExamTitles.join(', ')
                            : (entry.examTitle || 'Monthly Mock Exam')}
                        </td>
                        <td>{entry.bestScore || 0}/{entry.bestTotal || 0} ({safePercent(entry.bestPercentage)}%)</td>
                        <td>{entry.examsAttempted || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-note">No exam leaderboard data yet. Attempt a monthly mock test to appear here.</p>
            )
          ) : null}
        </section>
      ) : null}

      {!moduleLocked && selectedModule && selectedModuleSection === 'quiz' ? (
        <section className="card quiz-panel">
          <div className="quiz-picker-back">
            <button type="button" className="secondary-btn" onClick={() => setSelectedModuleSection('')}>
              ← Back to Module Sections
            </button>
          </div>
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Chapter Quiz</p>
              <h2>{selectedModuleName} Assessment</h2>
            </div>
            <StatCard label="Attempts" value={selectedModuleAttempts.length} />
          </div>

          {!quizEnabledForSelection ? (
            <p className="empty-note">Quizzes are currently enabled only for your enrolled course ({course || 'your profile course'}).</p>
          ) : !moduleHasQuiz ? (
            <p className="empty-note">No quiz available for this module yet.</p>
          ) : loadingQuiz && !moduleQuizList.length ? (
            <p className="empty-note">Loading quizzes...</p>
          ) : moduleQuizList.length ? (
            <div className="quiz-picker-list">
              <p className="quiz-picker-prompt">
                {moduleQuizList.length === 1
                  ? 'This module has 1 quiz. Click it to open:'
                  : `This module has ${moduleQuizList.length} quizzes. Click one to begin:`}
              </p>
              {moduleQuizList.map((quiz) => {
                return (
                  <button
                    key={quiz._id}
                    type="button"
                    className="quiz-picker-card"
                    onClick={() => navigate(`/student/quiz/${encodeURIComponent(quiz._id)}?module=${encodeURIComponent(selectedModuleName || quiz.module || '')}`)}
                  >
                    <div className="quiz-picker-info">
                      <strong className="quiz-picker-title">{quiz.title}</strong>
                      <div className="quiz-picker-meta">
                        <span className={`quiz-difficulty quiz-difficulty-${quiz.difficulty || 'medium'}`}>{quiz.difficulty || 'medium'}</span>
                        <span>{getQuestionCount(quiz)} {getQuestionCount(quiz) === 1 ? 'question' : 'questions'}</span>
                        <span>{quiz.timeLimitMinutes} min</span>
                      </div>
                    </div>
                    <span className="quiz-picker-arrow" aria-hidden="true">→</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <button type="button" className="secondary-btn" onClick={handleLoadQuizForModule} disabled={loadingQuiz}>
              {loadingQuiz ? 'Loading quizzes...' : 'Retry loading quizzes'}
            </button>
          )}
        </section>
      ) : null}

        <section id="section-feedback" className="card feedback-form-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Feedback</p>
            <h2>Share your feedback</h2>
          </div>
        </div>

        <form onSubmit={handleFeedbackSubmit} className="feedback-form">
          <label>
            Rating
            <select {...registerFeedback('rating')}>
              <option value="5">5 - Excellent</option>
              <option value="4">4 - Good</option>
              <option value="3">3 - Average</option>
              <option value="2">2 - Needs improvement</option>
              <option value="1">1 - Poor</option>
            </select>
          </label>

          <label>
            Message
            <textarea
              rows="4"
              placeholder="Tell us what can be improved or what you liked most"
              maxLength={1000}
              {...registerFeedback('message', { required: 'Please add your feedback message.' })}
            />
          </label>

          <button className="primary-btn" type="submit" disabled={isSubmittingFeedback}>
            {isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </form>

        {feedbackInlineError ? <p className="inline-message error">{feedbackInlineError}</p> : null}
        </section>
      </div>

      {feedbackToast ? (
        <aside className={`feedback-toast ${feedbackToast.type}${isFeedbackToastDismissing ? ' feedback-toast-dismissing' : ''}`} role="status" aria-live="polite">
          <span>{feedbackToast.text}</span>
          <button type="button" className="feedback-toast-close" onClick={dismissFeedbackToast} aria-label="Dismiss feedback message">
            ×
          </button>
        </aside>
      ) : null}

      {/* ── Connect With Us ─────────────────────────── */}
      <section id="section-connect" className="connect-section">
        <div className="connect-inner">
          <div className="connect-text">
            <p className="connect-eyebrow">Stay Connected</p>
            <h2 className="connect-heading">Connect With Us</h2>
            <p className="connect-sub">Follow us for daily biology tips, live class alerts, and exam prep resources.</p>
          </div>
          <div className="connect-cards">
            <a
              href="https://www.instagram.com/biomics_hub?igsh=aGJyNzhrOWZkeWV5"
              target="_blank"
              rel="noopener noreferrer"
              className="social-card social-card--instagram"
            >
              <span className="social-card-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.334 3.608 1.31.975.975 1.247 2.242 1.31 3.608.058 1.265.07 1.645.07 4.849s-.012 3.584-.07 4.85c-.062 1.366-.334 2.633-1.31 3.608-.975.975-2.242 1.247-3.608 1.31-1.265.058-1.645.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.334-3.608-1.31-.975-.975-1.247-2.242-1.31-3.608C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.85c.062-1.366.334-2.633 1.31-3.608.975-.975 2.242-1.247 3.608-1.31C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.741 0 8.332.014 7.052.072 5.197.157 3.355.673 2.014 2.014.673 3.355.157 5.197.072 7.052.014 8.332 0 8.741 0 12c0 3.259.014 3.668.072 4.948.085 1.855.601 3.697 1.942 5.038 1.341 1.341 3.183 1.857 5.038 1.942C8.332 23.986 8.741 24 12 24s3.668-.014 4.948-.072c1.855-.085 3.697-.601 5.038-1.942 1.341-1.341 1.857-3.183 1.942-5.038C23.986 15.668 24 15.259 24 12s-.014-3.668-.072-4.948c-.085-1.855-.601-3.697-1.942-5.038C20.645.673 18.803.157 16.948.072 15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
                </svg>
              </span>
              <span className="social-card-label">Instagram</span>
              <span className="social-card-handle">@biomics_hub</span>
              <span className="social-card-arrow">↗</span>
            </a>

            <a
              href="https://t.me/+WVyK_obKmJ8BbxG6"
              target="_blank"
              rel="noopener noreferrer"
              className="social-card social-card--telegram"
            >
              <span className="social-card-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </span>
              <span className="social-card-label">Telegram</span>
              <span className="social-card-handle">Join our channel</span>
              <span className="social-card-arrow">↗</span>
            </a>

            <a
              href="https://www.youtube.com/@biomicshub5733"
              target="_blank"
              rel="noopener noreferrer"
              className="social-card social-card--youtube"
            >
              <span className="social-card-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
                </svg>
              </span>
              <span className="social-card-label">YouTube</span>
              <span className="social-card-handle">@biomicshub5733</span>
              <span className="social-card-arrow">↗</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────── */}
      <footer className="student-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <img src={logoImg} alt="Biomics Hub" className="footer-logo" />
            <div>
              <p className="footer-brand-name">Biomics Hub</p>
              <p className="footer-tagline">Empowering students with quality biology &amp; science education.</p>
            </div>
          </div>

          <div className="footer-cols">
            <nav className="footer-col" aria-label="Learn section links">
              <p className="footer-col-label">Learn</p>
              <button type="button" className="footer-nav-link" onClick={() => document.getElementById('section-learning')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Learning Content</button>
              <button type="button" className="footer-nav-link" onClick={() => document.getElementById('section-feedback')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Feedback</button>
              <button type="button" className="footer-nav-link" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to Top ↑</button>
            </nav>
            <nav className="footer-col" aria-label="Community section links">
              <p className="footer-col-label">Community</p>
              <button type="button" className="footer-nav-link" onClick={() => document.getElementById('section-connect')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Connect with Us</button>
              <a href="https://www.instagram.com/biomics_hub?igsh=aGJyNzhrOWZkeWV5" target="_blank" rel="noopener noreferrer" className="footer-nav-link footer-nav-link--external">Instagram ↗</a>
              <a href="https://t.me/+WVyK_obKmJ8BbxG6" target="_blank" rel="noopener noreferrer" className="footer-nav-link footer-nav-link--external">Telegram ↗</a>
              <a href="https://www.youtube.com/@biomicshub5733" target="_blank" rel="noopener noreferrer" className="footer-nav-link footer-nav-link--external">YouTube ↗</a>
            </nav>
          </div>

          <p className="footer-copy">© {new Date().getFullYear()} Biomics Hub. All rights reserved.</p>
        </div>
      </footer>

      </AppShell>
      {profileOpen ? (
        <div className={`profile-modal-backdrop${profileClosing ? ' closing' : ''}`} onClick={closeProfileModal}>
          <section className={`profile-modal${profileClosing ? ' closing' : ''}`} onClick={(event) => event.stopPropagation()}>
            <div className="profile-modal-header">
              <div>
                <p className="eyebrow">Student Profile</p>
                <h2>Profile Settings</h2>
              </div>
              <button type="button" className="profile-close-btn" onClick={closeProfileModal} aria-label="Close profile settings">
                ×
              </button>
            </div>

            {isProfileLoading ? (
              <p className="empty-note">Loading profile...</p>
            ) : (
              <div className="profile-modal-body">
                <aside className="profile-summary-card">
                  <div className="profile-avatar-large">
                    {profileAvatarUrl ? (
                      <img src={profileAvatarUrl} alt="Student profile" className="profile-avatar-large-image" />
                    ) : (
                      <span>{profileInitial}</span>
                    )}
                  </div>
                  <label className="profile-photo-upload">
                    <input type="file" accept="image/*" onChange={handleAvatarChange} disabled={isUploadingAvatar} />
                    <span>{isUploadingAvatar ? 'Uploading...' : 'Change Photo'}</span>
                  </label>
                  <button
                    type="button"
                    className="secondary-btn profile-delete-photo-btn"
                    onClick={handleDeleteAvatar}
                    disabled={!profileAvatarUrl || isUploadingAvatar}
                  >
                    Delete Photo
                  </button>
                  <div className="profile-summary-list">
                    <div><span>Username</span><strong>{profile?.username || '-'}</strong></div>
                    <div><span>Phone</span><strong>{profile?.phone || '-'}</strong></div>
                    <div><span>Course</span><strong>{profile?.class || '-'}</strong></div>
                    <div><span>City</span><strong>{profile?.city || '-'}</strong></div>
                  </div>
                  {visibleMembership ? (
                    <div className="profile-membership-card" role="status" aria-live="polite">
                      <div className="profile-membership-head">
                        <span className="profile-membership-label">Active membership</span>
                        <span className="profile-membership-tag">{visibleMembership.planType === 'elite' ? 'Elite' : 'Pro'}</span>
                      </div>
                      <span className="profile-membership-expiry">
                        Expires {formatMembershipDate(visibleMembership.expiresAt)}
                      </span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="secondary-btn profile-theme-modal-btn"
                    onClick={toggleTheme}
                  >
                    {isLightTheme ? 'Use Dark Theme' : 'Use Light Theme'}
                  </button>
                </aside>

                <form className="profile-edit-form" onSubmit={handleSaveProfile}>
                  <label>
                    Username
                    <input
                      type="text"
                      value={profileForm.username}
                      onChange={(event) => setProfileForm((current) => ({ ...current, username: event.target.value }))}
                      placeholder="Update username"
                    />
                  </label>
                  <label>
                    Phone Number
                    <input
                      type="text"
                      value={profileForm.phone}
                      onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))}
                      placeholder="10-digit phone"
                      inputMode="numeric"
                    />
                  </label>
                  <label>
                    City
                    <input
                      type="text"
                      value={profileForm.city}
                      onChange={(event) => setProfileForm((current) => ({ ...current, city: event.target.value }))}
                      placeholder="Update city"
                    />
                  </label>
                  <label>
                    New Password
                    <input
                      type="password"
                      value={profileForm.password}
                      onChange={(event) => setProfileForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="Minimum 8 characters"
                    />
                    {profilePasswordHint ? <small className="field-hint">⚠ {profilePasswordHint}</small> : null}
                  </label>
                  <label>
                    Enrolled Course
                    <input type="text" value={profile?.class || ''} disabled />
                  </label>

                  <div className="profile-edit-actions">
                    <button type="submit" className="primary-btn" disabled={isSavingProfile}>
                      {isSavingProfile ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button type="button" className="profile-logout-btn" onClick={handleLogout}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Logout
                    </button>
                    <button type="button" className="secondary-btn" onClick={closeProfileModal}>
                      Close
                    </button>
                  </div>
                  {profileMessage ? <p className={`inline-message ${profileMessage.type}`}>{profileMessage.text}</p> : null}
                </form>
              </div>
            )}
          </section>
        </div>
      ) : null}
      
      {/* Student Chat Agent */}
      <StudentChatAgent hideAnnouncementFab />
    </>
  );
}
