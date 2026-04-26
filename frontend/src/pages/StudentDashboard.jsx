import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  fetchMockExamLeaderboard,
  createCourseOrder,
  downloadMaterial,
  fetchCommunityChatUnreadCount,
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
import './StudentDashboard.css';
import { useCourseData } from '../hooks/useCourseData';
import { useFeedback } from '../hooks/useFeedback';
import { useQuizSession } from '../hooks/useQuizSession';
import { useSessionStore } from '../stores/sessionStore';
import { useThemeStore } from '../stores/themeStore';

const ALL_MODULES = 'ALL_MODULES';
const CART_STORAGE_PREFIX = 'biomics:student-cart:';
const BIOMICS_MISSION_COPY = `At Biomics Hub Biology, we deliver an exceptional learning experience through comprehensive video tutorials that cover every aspect of Biology. Our content is carefully structured to support students across a wide range of academic and competitive pathways, including core science studies as well as specialized examinations such as IIT JAM, CSIR NET, GAT-B, TIFR, CUET, DBT, ICMR, ICAR, and GATE. Our curriculum is designed to meet the needs of learners at all stages, beginning with foundational concepts and gradually advancing to more complex and in-depth topics, ensuring a strong and progressive understanding of the subject.`;

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
  const [pickerCourse, setPickerCourse] = useState('');
  const [courseBundlePreviewByCourse, setCourseBundlePreviewByCourse] = useState({});
  const [courseBundleCheckoutKey, setCourseBundleCheckoutKey] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('latest');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [banner, setBanner] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardModules, setLeaderboardModules] = useState([]);
  const [leaderboardModuleFilter, setLeaderboardModuleFilter] = useState('all');
  const [leaderboardTopicFilter, setLeaderboardTopicFilter] = useState('all');
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
  const [avatarImageFailed, setAvatarImageFailed] = useState(false);
  const [liveClass, setLiveClass] = useState(null); // { active, title, meetUrl, startedAt }
  const [lockedLiveClass, setLockedLiveClass] = useState(null);
  const [upcomingClass, setUpcomingClass] = useState(null); // { _id, title, scheduledAt, meetUrl }
  const [upcomingCountdown, setUpcomingCountdown] = useState('');
  const [communityUnreadCount, setCommunityUnreadCount] = useState(0);
  const [communityUnreadPulse, setCommunityUnreadPulse] = useState(false);
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
  const [tsCartCheckoutKey, setTsCartCheckoutKey] = useState(''); // seriesType being paid for test series
  const [tsCartItems, setTsCartItems] = useState(() => {
    try { const s = localStorage.getItem('ts_cart'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [isCartHydrated, setIsCartHydrated] = useState(false);
  const [mockExams, setMockExams] = useState([]);
  const [mockExamNotices, setMockExamNotices] = useState([]);
  const [mockExamLoading, setMockExamLoading] = useState(false);
  const [courseDirectory, setCourseDirectory] = useState([]);
  const [examLeaderboard, setExamLeaderboard] = useState([]);
  const [examLeaderboardMonths, setExamLeaderboardMonths] = useState([]);
  const [examLeaderboardMonthFilter, setExamLeaderboardMonthFilter] = useState('all');
  const [examLeaderboardLoading, setExamLeaderboardLoading] = useState(false);
  const [examLeaderboardError, setExamLeaderboardError] = useState('');
  const [testSeriesStreakDays, setTestSeriesStreakDays] = useState(0);
  const profileScrollLockRef = useRef(0);
  const profileCloseTimerRef = useRef(null);
  const recentlyAddedCartTimerRef = useRef(null);
  const cartIconButtonRef = useRef(null);
  const cartPulseTimerRef = useRef(null);
  const cartVoucherRequestRef = useRef(0);
  const previousCommunityUnreadRef = useRef(0);

  useEffect(() => {
    const shouldOpenFromQuery = new URLSearchParams(location?.search || '').get('cart') === 'open';
    if (location?.state?.openCart || shouldOpenFromQuery) {
      setCartOpen(true);
      navigate('/student', { replace: true, state: null });
    }
  }, [location?.state, location?.search, navigate]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let cancelled = false;

    const syncCommunityUnread = async () => {
      try {
        const data = await fetchCommunityChatUnreadCount();
        if (!cancelled) {
          setCommunityUnreadCount(Math.max(0, Number(data?.unreadCount || 0)));
        }
      } catch {
        if (!cancelled) setCommunityUnreadCount(0);
      }
    };

    syncCommunityUnread();
    const intervalId = window.setInterval(syncCommunityUnread, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [session?.token]);

  useEffect(() => {
    const previous = Number(previousCommunityUnreadRef.current || 0);
    const current = Number(communityUnreadCount || 0);
    if (current > previous) {
      setCommunityUnreadPulse(true);
      const timer = window.setTimeout(() => setCommunityUnreadPulse(false), 420);
      previousCommunityUnreadRef.current = current;
      return () => window.clearTimeout(timer);
    }
    previousCommunityUnreadRef.current = current;
    return undefined;
  }, [communityUnreadCount]);

  // Sync test-series cart across tabs / pages via storage event
  useEffect(() => {
    function onStorage(event) {
      if (event.key === 'ts_cart') {
        try { setTsCartItems(event.newValue ? JSON.parse(event.newValue) : []); } catch { setTsCartItems([]); }
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Also re-read ts_cart when the page gains focus (same-tab navigation back from test series page)
  useEffect(() => {
    function onFocus() {
      try { const s = localStorage.getItem('ts_cart'); setTsCartItems(s ? JSON.parse(s) : []); } catch { setTsCartItems([]); }
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestJson('/courses/student')
      .then((response) => {
        if (cancelled) return;
        const courses = Array.isArray(response?.courses) ? response.courses : [];
        setCourseDirectory(courses.map((entry) => ({
          courseName: normalizeCourseName(entry?.name || entry?.courseName || ''),
          displayName: String(entry?.displayName || entry?.name || entry?.courseName || '').trim(),
          icon: String(entry?.icon || '').trim() || '📚',
          eyebrow: 'Course Track',
          blurb: String(entry?.description || '').trim() || 'Structured modules, tests, and premium learning access.'
        })).filter((entry) => entry.courseName));
      })
      .catch(() => {
        if (!cancelled) setCourseDirectory([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allModulesUnlocked = Boolean(access?.allModulesUnlocked || access?.unlocked);
  const bundlePlanOptions = Array.isArray(access?.bundlePricing?.plans) ? access.bundlePricing.plans : [];
  const moduleAccessMap = access?.moduleAccess || {};
  const unlockedModuleSet = new Set(Array.isArray(access?.unlockedModules) ? access.unlockedModules.map((item) => normalizeModuleName(item)) : []);
  const hasAnyUnlockedModule = allModulesUnlocked || unlockedModuleSet.size > 0;
  const activeMembership = access?.activeMembership || null;

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
  const liveClassBundlePlans = bundlePlanOptions.filter((plan) => Number(plan?.amountInPaise || 0) > 0);
  const preferredLiveClassPlan = useMemo(() => {
    if (!liveClassBundlePlans.length) return null;

    const selectedPlanMatch = liveClassBundlePlans.find((plan) => plan.type === selectedPlan);
    if (selectedPlanMatch) return selectedPlanMatch;

    return [...liveClassBundlePlans].sort((left, right) => {
      const amountDiff = Number(left.amountInPaise || 0) - Number(right.amountInPaise || 0);
      if (amountDiff !== 0) return amountDiff;
      return Number(left.durationMonths || 0) - Number(right.durationMonths || 0);
    })[0] || null;
  }, [liveClassBundlePlans, selectedPlan]);
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

  function normalizeText(value) {
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

  function openCourseUnlockPanel() {
    setSelectedAccessTarget(ALL_MODULES);
    const unlockSection = document.getElementById('section-course-bundle-unlock');
    if (unlockSection) {
      unlockSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  function toLocalDateKey(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function buildLockedCartKey(moduleName, moduleCourse, batchName = 'General') {
    return `${normalizeCourseName(moduleCourse || '')}::${normalizeText(batchName || 'General')}::${normalizeModuleName(moduleName || '')}`;
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

  function addLockedModuleToCart(moduleName, moduleCourse, moduleAccessInfo, originElement, batchName = 'General') {
    const normalizedModule = normalizeModuleName(moduleName);
    const normalizedCourse = normalizeCourseName(moduleCourse || course || 'General');
    const normalizedBatch = normalizeText(batchName || 'General');
    const itemKey = buildLockedCartKey(normalizedModule, normalizedCourse, normalizedBatch);
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
          batchName: normalizedBatch,
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
    if (normalized === 'gat-b') return 'gatb';
    if (normalized === 'iit-jam') return 'jam';
    if (normalized === 'csir net lifescience') return 'csir';
    if (normalized === 'csir-net life science') return 'csir';
    if (normalized === 'gate exam') return 'gate';
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
            const preview = await previewCourseOrder(planType, normalizedVoucher, item.moduleName, item.moduleCourse, item.batchName || 'General');
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
              batchName: normalizeText(item.batchName || String(item.key || '').split('::')[1] || 'General'),
              planPrices: item.planPrices && typeof item.planPrices === 'object' ? item.planPrices : {},
              crossCourse: Boolean(item.crossCourse)
            }))
            .map((item) => ({
              ...item,
              key: item.key || buildLockedCartKey(item.moduleName, item.moduleCourse, item.batchName)
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
            previewCourseOrder('pro', '', item.moduleName, item.moduleCourse, item.batchName || 'General').catch(() => null),
            previewCourseOrder('elite', '', item.moduleName, item.moduleCourse, item.batchName || 'General').catch(() => null)
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
    targetBatch = 'General',
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
      normalizedTargetCourse,
      targetBatch || 'General'
    );
    if (orderResponse?.unlocked) {
      if (showSuccessBanner) {
        setBanner({ type: 'success', text: `${targetLabel} unlocked successfully.` });
      }
      await refreshAttempts();
      if (reloadOnSuccess) window.location.reload();
      return { status: orderResponse?.purchaseRequired ? 'already-unlocked' : 'free' };
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

    if (!payableCartItems.length && !tsCartItems.length) {
      setBanner({ type: 'error', text: 'No items in cart.' });
      return;
    }

    setIsBulkCheckoutRunning(true);
    setBanner(null);

    const purchasedKeys = [];
    let cancelled = false;

    try {
      // Process module items first
      for (const item of payableCartItems) {
        const result = await startMembershipCheckout({
          targetCourse: item.moduleCourse,
          targetBatch: item.batchName || 'General',
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
      }

      // Process test series items (sequentially via Razorpay) if not cancelled
      if (!cancelled) {
        for (const tsItem of tsCartItems) {
          await handleCheckoutTsCartItem(tsItem, true);
          // handleCheckoutTsCartItem manages its own state; just iterate
        }
      }

      const totalPurchased = purchasedKeys.length;
      if (totalPurchased > 0 && !cancelled) {
        setBanner({ type: 'success', text: `${totalPurchased} module${totalPurchased === 1 ? '' : 's'} unlocked successfully.` });
        setCartOpen(false);
      } else if (totalPurchased > 0 && cancelled) {
        setBanner({ type: 'success', text: `${totalPurchased} module${totalPurchased === 1 ? '' : 's'} unlocked. Checkout stopped for remaining items.` });
      } else if (cancelled) {
        setBanner({ type: 'error', text: 'Checkout was cancelled. No payment was made.' });
      }
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Bulk checkout failed.' });
    } finally {
      setIsBulkCheckoutRunning(false);
    }
  }

  async function handleCheckoutTsCartItem(item, skipMutex = false) {
    if (!item || (!skipMutex && tsCartCheckoutKey)) return;
    const seriesType = item.seriesType;
    const voucherCode = item.voucherCode || '';
    if (!skipMutex) setTsCartCheckoutKey(seriesType);
    setBanner(null);
    try {
      const orderRes = await requestJson('/test-series/payment/create-order', {
        method: 'POST',
        body: JSON.stringify({ seriesType, ...(voucherCode ? { voucherCode } : {}) })
      });
      if (orderRes?.alreadyOwned || orderRes?.free) {
        const label = seriesType === 'topic_test' ? 'Topic Test Series' : 'Full Mock Series';
        setBanner({ type: 'success', text: `${label} access granted!` });
        setTsCartItems((prev) => {
          const next = prev.filter((i) => i.seriesType !== seriesType);
          try { localStorage.setItem('ts_cart', JSON.stringify(next)); } catch {}
          return next;
        });
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
              const label = seriesType === 'topic_test' ? 'Topic Test Series (+ Full Mocks)' : 'Full Mock Series';
              setBanner({ type: 'success', text: `${label} unlocked!` });
              setTsCartItems((prev) => {
                const next = prev.filter((i) => i.seriesType !== seriesType);
                try { localStorage.setItem('ts_cart', JSON.stringify(next)); } catch {}
                return next;
              });
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
      if (!skipMutex) setTsCartCheckoutKey('');
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
        targetBatch: item.batchName || 'General',
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

  const catalogModuleKeySet = new Set(
    (Array.isArray(moduleCatalog) ? moduleCatalog : [])
      .map((entry) => {
        const category = normalizeCourseName(entry?.category || '');
        const displayModule = normalizeModuleName(entry?.name || '');
        if (!category || !displayModule) return '';
        return resolveModuleKey(category, displayModule);
      })
      .filter(Boolean)
  );

  // Keep purchasable modules discoverable even when no visible content is returned yet.
  Object.keys(moduleAccessMap).forEach((moduleName) => {
    const normalizedModule = normalizeModuleName(moduleName);
    if (!normalizedModule || normalizedModule === ALL_MODULES) return;
    const category = normalizeCourseName(course || 'General');
    const moduleKey = resolveModuleKey(category, normalizedModule);
    const hasContentSignals = Boolean(videosByModule[moduleKey]?.length || quizzesByModule[moduleKey]?.length);
    const existsInCatalog = catalogModuleKeySet.has(moduleKey);
    if (!existsInCatalog && !hasContentSignals) return;
    if (!moduleMetaByKey[moduleKey]) {
      moduleMetaByKey[moduleKey] = { module: normalizedModule, category };
    }
  });

  const availableCourseMap = new Map();
  [
    ...videos.map((video) => normalizeCourseName(video.category || '')).filter(Boolean),
    ...quizzes.map((quiz) => normalizeCourseName(quiz.category || '')).filter(Boolean),
    ...Object.values(moduleMetaByKey).map((meta) => normalizeCourseName(meta?.category || '')).filter(Boolean),
    normalizeCourseName(course || '')
  ].forEach((courseName) => {
    const key = String(courseName || '').toLowerCase();
    if (!key) return;
    if (!availableCourseMap.has(key)) {
      availableCourseMap.set(key, courseName);
    }
  });

  const availableCourses = Array.from(availableCourseMap.values())
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  const marketplaceCourseDirectory = courseDirectory.length
    ? courseDirectory
    : availableCourses.map((courseName) => ({
      courseName,
      displayName: courseName,
      icon: '📚',
      eyebrow: 'Course Track',
      blurb: 'Structured modules, tests, and premium learning access.'
    }));

  const marketplaceCourses = marketplaceCourseDirectory.map((courseMeta) => {
    const canonicalCourse = normalizeCourseName(courseMeta.courseName);
    const canonicalKey = canonicalCourse.toLowerCase();
    const moduleNameSet = new Set(
      Object.values(moduleMetaByKey)
        .filter((meta) => normalizeCourseName(meta?.category || '').toLowerCase() === canonicalKey)
        .map((meta) => normalizeModuleName(meta?.module || '').toLowerCase())
        .filter(Boolean)
    );
    const courseVideos = videos.filter((video) => normalizeCourseName(video.category || '').toLowerCase() === canonicalKey);
    const courseQuizCount = quizzes.filter((quiz) => normalizeCourseName(quiz.category || '').toLowerCase() === canonicalKey).length;
    const courseCompleted = courseVideos.filter((video) => completedIds.has(normalizeId(video._id))).length;
    const courseProgress = courseVideos.length ? Math.round((courseCompleted / courseVideos.length) * 100) : 0;
    const pricing = courseBundlePreviewByCourse[canonicalCourse] || null;

    return {
      ...courseMeta,
      canonicalCourse,
      canonicalKey,
      moduleCount: moduleNameSet.size,
      lectureCount: courseVideos.length,
      quizCount: courseQuizCount,
      progress: courseProgress,
      isEnrolledCourse: canonicalKey === normalizeCourseName(course || '').toLowerCase(),
      pricing
    };
  });
  const selectedMarketplaceCourse = marketplaceCourses.find((courseEntry) => courseEntry.canonicalCourse === pickerCourse) || null;
  const purchasedCourseKeySet = useMemo(() => {
    const purchasedKeys = new Set();

    Object.entries(courseBundlePreviewByCourse || {}).forEach(([courseName, entry]) => {
      if (!entry?.unlocked) return;
      const key = normalizeCourseName(courseName).toLowerCase();
      if (key) purchasedKeys.add(key);
    });

    if (hasAnyUnlockedModule) {
      const enrolledKey = normalizeCourseName(course || '').toLowerCase();
      if (enrolledKey) purchasedKeys.add(enrolledKey);
    }

    return purchasedKeys;
  }, [courseBundlePreviewByCourse, hasAnyUnlockedModule, course]);

  function hasPurchasedCourseAccess(courseName) {
    const normalizedKey = normalizeCourseName(courseName || '').toLowerCase();
    if (!normalizedKey) return false;
    return purchasedCourseKeySet.has(normalizedKey);
  }

  const visibleMockExamNotices = mockExamNotices;

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

  useEffect(() => {
    let cancelled = false;

    async function loadMarketplacePricing() {
      try {
        const courseEntries = await Promise.all(
          marketplaceCourseDirectory.map(async (courseMeta) => {
            const canonicalCourse = normalizeCourseName(courseMeta.courseName);
            const planResponses = await Promise.all(
              ['pro', 'elite'].map(async (planType) => {
                try {
                  const response = await previewCourseOrder(planType, '', ALL_MODULES, canonicalCourse);
                  const pricing = response?.pricing || null;
                  return {
                    type: planType,
                    unlocked: Boolean(response?.unlocked),
                    purchaseRequired: Boolean(response?.purchaseRequired),
                    pricing: pricing
                      ? {
                          planType: String(pricing.planType || planType),
                          durationMonths: Number(pricing.durationMonths || 0),
                          originalAmountInPaise: Number(pricing.originalAmountInPaise || 0),
                          discountInPaise: Number(pricing.discountInPaise || 0),
                          finalAmountInPaise: Number(pricing.finalAmountInPaise || 0)
                        }
                      : null
                  };
                } catch {
                  return {
                    type: planType,
                    unlocked: false,
                    purchaseRequired: false,
                    pricing: null
                  };
                }
              })
            );

            const paidPlans = planResponses
              .filter((entry) => Number(entry?.pricing?.originalAmountInPaise || 0) > 0)
              .sort((left, right) => Number(left.pricing.finalAmountInPaise || 0) - Number(right.pricing.finalAmountInPaise || 0));

            return [
              canonicalCourse,
              {
                unlocked: planResponses.some((entry) => entry.unlocked),
                plans: planResponses,
                featuredPlan: paidPlans[0] || planResponses.find((entry) => entry.pricing) || null
              }
            ];
          })
        );

        if (!cancelled) {
          setCourseBundlePreviewByCourse(Object.fromEntries(courseEntries));
        }
      } catch {
        if (!cancelled) {
          setCourseBundlePreviewByCourse({});
        }
      }
    }

    loadMarketplacePricing();
    return () => {
      cancelled = true;
    };
  }, [course, marketplaceCourseDirectory]);

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
  const selectedModuleAttempts = selectedModule
    ? quizAttempts.filter((attempt) => {
      const sameModule = normalizeModuleName(attempt.module) === normalizeModuleName(selectedModuleName);
      const sameCategory = normalizeCourseName(attempt.category || course || '') === normalizeCourseName(selectedModuleCourse || '');
      return sameModule && sameCategory;
    })
    : [];

  const quizTopicMetadata = useMemo(() => {
    const topics = new Set();
    const moduleTopicsByKey = {};
    const moduleTopicsByName = {};
    const activeModuleKeySet = new Set(visibleModules);

    function addTopic(categoryName, moduleName, topicName) {
      const normalizedCategory = normalizeCourseName(categoryName || course || 'General');
      if (activeCourseFilter && normalizedCategory !== activeCourseFilter) return;

      const normalizedModule = normalizeModuleName(moduleName || 'General');
      const normalizedTopic = normalizeModuleName(topicName || 'General');
      if (!normalizedModule || !normalizedTopic) return;

      const moduleKey = resolveModuleKey(normalizedCategory, normalizedModule);
      if (activeModuleKeySet.size > 0 && !activeModuleKeySet.has(moduleKey)) return;
      if (!moduleTopicsByKey[moduleKey]) moduleTopicsByKey[moduleKey] = new Set();
      moduleTopicsByKey[moduleKey].add(normalizedTopic);

      const moduleNameKey = normalizedModule.toLowerCase();
      if (!moduleTopicsByName[moduleNameKey]) moduleTopicsByName[moduleNameKey] = new Set();
      moduleTopicsByName[moduleNameKey].add(normalizedTopic);

      topics.add(normalizedTopic);
    }

    quizzes.forEach((quiz) => {
      addTopic(quiz?.category, quiz?.module, quiz?.topic);
    });

    const options = Array.from(topics).sort((a, b) => a.localeCompare(b));
    return { options, moduleTopicsByKey, moduleTopicsByName };
  }, [quizzes, visibleModules, activeCourseFilter, course]);

  const quizTopicOptions = quizTopicMetadata.options;

  useEffect(() => {
    let cancelled = false;
    requestJson('/test-series/performance/student')
      .then((response) => {
        if (cancelled) return;
        setTestSeriesStreakDays(Math.max(0, Number(response?.summary?.dailyAttemptStreak || 0)));
      })
      .catch(() => {
        if (!cancelled) setTestSeriesStreakDays(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fallbackLeaderboardModules = Array.from(new Set(
    visibleModules.map((moduleKey) => moduleMetaByKey[moduleKey]?.module).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  const leaderboardModuleOptions = Array.from(new Set([
    ...leaderboardModules,
    ...fallbackLeaderboardModules
  ])).sort((a, b) => a.localeCompare(b));

  const filteredLeaderboard = leaderboard.filter((entry) => {
    if (leaderboardTopicFilter === 'all') return true;
    const moduleNameKey = normalizeModuleName(entry?.module || 'General').toLowerCase();
    const topicSet = quizTopicMetadata.moduleTopicsByName[moduleNameKey];
    return Boolean(topicSet && topicSet.has(leaderboardTopicFilter));
  });

  const leaderboardChampion = filteredLeaderboard[0] || null;

  useEffect(() => {
    if (selectedCourseFilter === 'all') return;
    if (availableCourses.includes(selectedCourseFilter)) return;
    setSelectedCourseFilter('all');
  }, [availableCourses, selectedCourseFilter]);

  useEffect(() => {
    let cancelled = false;
    const prefetch = () => {
      if (cancelled) return;
      import('./StudentCourseModulesPage');
      import('./StudentInsightsPage');
      import('./StudentQuizPerformancePage');
      import('./StudentTestSeriesPerformancePage');
    };

    let cleanup = () => {};
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(prefetch, { timeout: 1200 });
      cleanup = () => window.cancelIdleCallback(idleId);
    } else {
      const timeoutId = window.setTimeout(prefetch, 650);
      cleanup = () => window.clearTimeout(timeoutId);
    }

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (leaderboardTopicFilter !== 'all' && !quizTopicOptions.includes(leaderboardTopicFilter)) {
      setLeaderboardTopicFilter('all');
    }
  }, [leaderboardTopicFilter, quizTopicOptions]);

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
        if (cancelled) return;

        if (error?.message === 'Student profile not found') {
          const fallbackUsername = String(session?.username || '').trim();
          if (fallbackUsername) {
            setProfile({ username: fallbackUsername, phone: '', class: '', city: '', avatarUrl: '' });
            setProfileForm({ username: fallbackUsername, phone: '', city: '', password: '' });
          }
          return;
        }

        setBanner({ type: 'error', text: error.message });
      })
      .finally(() => {
        if (!cancelled) setIsProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.username]);

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
          if (data.active && data.activeClass) {
            setLiveClass(data.activeClass);
            setLockedLiveClass(null);
            setUpcomingClass(null);
          } else {
            setLiveClass(null);
            setLockedLiveClass(data.lockedActiveClass || null);
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

  async function handleMarketplaceCourseCheckout(targetCourse, planType = 'pro') {
    const normalizedTargetCourse = normalizeCourseName(targetCourse || '');
    if (!normalizedTargetCourse || courseBundleCheckoutKey) return;

    setCourseBundleCheckoutKey(normalizedTargetCourse);
    setBanner(null);

    try {
      const result = await startMembershipCheckout({
        targetCourse: normalizedTargetCourse,
        targetModuleName: ALL_MODULES,
        planType,
        voucher: '',
        reloadOnSuccess: false,
        showSuccessBanner: true,
        showCancelBanner: true
      });

      if (['paid', 'already-unlocked', 'free'].includes(result?.status)) {
        setPickerCourse(normalizedTargetCourse);
        const refreshEntries = await Promise.all(
          ['pro', 'elite'].map(async (nextPlanType) => {
            try {
              const response = await previewCourseOrder(nextPlanType, '', ALL_MODULES, normalizedTargetCourse);
              return {
                type: nextPlanType,
                unlocked: Boolean(response?.unlocked),
                purchaseRequired: Boolean(response?.purchaseRequired),
                pricing: response?.pricing
                  ? {
                      planType: String(response.pricing.planType || nextPlanType),
                      durationMonths: Number(response.pricing.durationMonths || 0),
                      originalAmountInPaise: Number(response.pricing.originalAmountInPaise || 0),
                      discountInPaise: Number(response.pricing.discountInPaise || 0),
                      finalAmountInPaise: Number(response.pricing.finalAmountInPaise || 0)
                    }
                  : null
              };
            } catch {
              return { type: nextPlanType, unlocked: false, purchaseRequired: false, pricing: null };
            }
          })
        );
        setCourseBundlePreviewByCourse((current) => ({
          ...current,
          [normalizedTargetCourse]: {
            unlocked: refreshEntries.some((entry) => entry.unlocked),
            plans: refreshEntries,
            featuredPlan: refreshEntries.find((entry) => Number(entry?.pricing?.originalAmountInPaise || 0) > 0) || refreshEntries.find((entry) => entry.pricing) || null
          }
        }));
      }
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to start course unlock.' });
    } finally {
      setCourseBundleCheckoutKey('');
    }
  }

  async function handlePayForLockedLiveClass() {
    if (isUnlockingCourse || !preferredLiveClassPlan) return;

    const targetCourse = normalizeCourseName(lockedLiveClass?.course || course || '');
    setIsUnlockingCourse(true);
    setSelectedAccessTarget(ALL_MODULES);
    setSelectedPlan(preferredLiveClassPlan.type);
    setBanner(null);

    try {
      const result = await startMembershipCheckout({
        targetCourse,
        targetModuleName: ALL_MODULES,
        planType: preferredLiveClassPlan.type,
        voucher: '',
        reloadOnSuccess: false,
        showSuccessBanner: false,
        showCancelBanner: true
      });

      if (['paid', 'already-unlocked', 'free'].includes(result?.status)) {
        setBanner({
          type: 'success',
          text: `${targetCourse || 'Course'} access is ready. Opening live classes...`
        });
        navigate('/student/live-classes');
      }
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to start course payment.' });
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
  useEffect(() => {
    setAvatarImageFailed(false);
  }, [profileAvatarUrl]);
  const profileInitial = (() => {
    const rawName = String(profile?.username || session?.username || 'Student').trim();
    if (!rawName) return 'S';
    const chunks = rawName.split(/[\s._-]+/).filter(Boolean);
    if (chunks.length >= 2) {
      return `${chunks[0].charAt(0)}${chunks[1].charAt(0)}`.toUpperCase();
    }
    return rawName.charAt(0).toUpperCase();
  })();
  const studentNavItems = useMemo(() => {
    const baseItems = [
      { id: 'section-overview', label: 'Overview', icon: '🏠' },
      { id: 'route-student-insights', label: 'Insights', icon: '📈' },
      { id: 'section-learning', label: 'Learning', icon: '📘' }
    ];
    if (selectedModule) return [...baseItems, { id: 'section-connect', label: 'Connect', icon: '🔗' }];
    return [
      ...baseItems,
      { id: 'route-student-my-courses', label: 'My Courses', icon: '🎓' },
      {
        id: 'section-community-chat',
        label: (
          <span className="nav-live-label">
            Community Chat
            <span className="live-badge" aria-hidden="true">
              <span className="live-badge-dot" />
              LIVE
            </span>
            {communityUnreadCount > 0 ? (
              <span className={`community-unread-badge${communityUnreadPulse ? ' is-bumping' : ''}`} aria-label={`${communityUnreadCount} unread community messages`}>
                {communityUnreadCount > 99 ? '99+' : communityUnreadCount}
              </span>
            ) : null}
          </span>
        ),
        icon: '💬'
      },
      { id: 'route-student-quiz-performance', label: 'Quiz Performance', icon: '📊' },
      { id: 'section-leaderboard', label: 'Leaderboard', icon: '🏆' },
      { id: 'section-monthly-exam', label: 'Monthly Exam', icon: '📅' },
      { id: 'section-test-series', label: 'Test Series', icon: '📝' },
      { id: 'route-student-test-series-performance', label: 'Series Performance', icon: '🎯' },
      { id: 'section-exam-leaderboard', label: 'Exam Leaderboard', icon: '🥇' },
      { id: 'section-feedback', label: 'Feedback', icon: '💬' },
      { id: 'section-connect', label: 'Connect', icon: '🔗' }
    ];
  }, [selectedModule]);

  function handleStudentNavClick(id) {
    if (id === 'route-student-insights') {
      navigate('/student/insights');
      return;
    }

    if (id === 'route-student-quiz-performance') {
      navigate('/student/quiz-performance');
      return;
    }

    if (id === 'route-student-my-courses') {
      navigate('/student/my-courses');
      return;
    }

    if (id === 'route-student-test-series-performance') {
      navigate('/student/test-series-performance');
      return;
    }

    const target = document.getElementById(id);
    if (!target) return;
    const rootStyles = window.getComputedStyle(document.documentElement);
    const clearance = parseFloat(rootStyles.getPropertyValue('--app-shell-topbar-clearance')) || 96;
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - clearance - 12);
    window.scrollTo({ top, behavior: 'smooth' });
  }

  function renderLearningLiveCard() {
    // Keep locked-course alerts silent, but preserve the dashboard 2-card layout.
    const visibleLiveClass = liveClass && hasPurchasedCourseAccess(liveClass.course) ? liveClass : null;
    if (visibleLiveClass) {
      return (
        <section className="card student-learning-live-card student-learning-live-card--live">
          <div className="student-learning-live-header">
            <div className="student-learning-live-topline">
              <span className="live-badge pulsing">LIVE NOW</span>
              <span className="student-learning-live-kicker">Classroom Active</span>
            </div>
            <div className="student-learning-live-copy-block">
              <strong className="student-learning-live-title">{visibleLiveClass.title}</strong>
              <p className="student-learning-live-copy">Teacher is already inside the classroom. Join now or open the full live class section.</p>
            </div>
            <div className="student-learning-live-meta">
              <span className="student-learning-live-pill">Started {new Date(visibleLiveClass.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              {visibleLiveClass.course ? <span className="student-learning-live-pill">{visibleLiveClass.course}</span> : null}
            </div>
          </div>
          <div className="student-learning-live-actions">
            <button type="button" className="primary-btn" onClick={() => navigate('/student/live-classes')}>
              Join Live Class
            </button>
            <button type="button" className="secondary-btn" onClick={() => navigate('/student/live-classes')}>
              Open Live Section
            </button>
          </div>
        </section>
      );
    }

    const visibleUpcomingClass = upcomingClass && hasPurchasedCourseAccess(upcomingClass.course) ? upcomingClass : null;
    if (visibleUpcomingClass) {
      return (
        <section className="card student-learning-live-card student-learning-live-card--upcoming">
          <div className="student-learning-live-header">
            <div className="student-learning-live-topline">
              <span className="live-badge">UPCOMING</span>
              <span className="student-learning-live-kicker">Next Live Session</span>
            </div>
            <div className="student-learning-live-copy-block">
              <strong className="student-learning-live-title">{visibleUpcomingClass.title}</strong>
              <p className="student-learning-live-copy">Your next live class is scheduled soon. Open the live section to view details and calendar timing.</p>
            </div>
            <div className="student-learning-live-meta">
              <span className="student-learning-live-pill">{upcomingCountdown || 'Starting soon'}</span>
              <span className="student-learning-live-pill">{new Date(visibleUpcomingClass.scheduledAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            </div>
          </div>
          <div className="student-learning-live-actions">
            <button type="button" className="primary-btn" onClick={() => navigate('/student/live-classes')}>
              Open Live Section
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="card student-learning-live-card student-learning-live-card--default">
        <div className="student-learning-live-header">
          <div className="student-learning-live-topline">
            <span className="live-badge">LIVE</span>
            <span className="student-learning-live-kicker">Course Live Classes</span>
          </div>
          <div className="student-learning-live-copy-block">
            <strong className="student-learning-live-title">Live Class Section</strong>
            <p className="student-learning-live-copy">Track live classes and blocked slots from one section. Course-level visibility stays filtered by your access.</p>
          </div>
          <div className="student-learning-live-meta">
            <span className="student-learning-live-pill">Calendar ready</span>
            <span className="student-learning-live-pill">Course-wise filters</span>
          </div>
        </div>
        <div className="student-learning-live-actions">
          <button type="button" className="primary-btn" onClick={() => navigate('/student/live-classes')}>
            Open Live Section
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
    <AppShell
      title="Student Dashboard"
      roleLabel="Student"
      showThemeSwitch={false}
      refreshOnBrandIconClick
      navTitle="Student Sections"
      navItems={studentNavItems}
      onNavItemClick={handleStudentNavClick}
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
            {(lockedModuleCart.length + tsCartItems.length) > 0 ? <span className="student-cart-header-count">{(lockedModuleCart.length + tsCartItems.length) > 9 ? '9+' : (lockedModuleCart.length + tsCartItems.length)}</span> : null}
          </button>
          <div className="profile-trigger-wrap">
            <button
              type="button"
              className="profile-icon-btn"
              onClick={openProfileModal}
              aria-label="Open profile settings"
              title="Profile settings"
            >
              {profileAvatarUrl && !avatarImageFailed ? (
                <img
                  src={profileAvatarUrl}
                  alt="Student profile"
                  className="profile-icon-image"
                  onError={() => setAvatarImageFailed(true)}
                />
              ) : (
                <span className="profile-icon-fallback">{profileInitial}</span>
              )}
            </button>
            <div className="profile-hover-card" aria-hidden="true">
              <strong>{profile?.username || session?.username || 'Student'}</strong>
              <span>{profile?.class || course || 'Course unavailable'}</span>
              <span>{profile?.city || 'City unavailable'}</span>
              <div
                className={`profile-streak-chip profile-streak-chip-compact ${testSeriesStreakDays > 0 ? 'is-active' : ''}`}
                role="status"
                aria-live="polite"
                aria-label={`${testSeriesStreakDays} day${testSeriesStreakDays === 1 ? '' : 's'} streak`}
              >
                <span className="profile-streak-fire" aria-hidden="true">🔥</span>
                <span className="profile-streak-count" aria-hidden="true">{testSeriesStreakDays}</span>
              </div>
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
                  <h3>{lockedModuleCart.length + tsCartItems.length} item{(lockedModuleCart.length + tsCartItems.length) === 1 ? '' : 's'} in cart</h3>
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

                {!lockedModuleCart.length && !tsCartItems.length ? (
                  <p className="empty-state">Your cart is empty. Add locked modules from cards.</p>
                ) : (
                  <div className="student-cart-items">
                    {tsCartItems.map((item) => (
                      <article key={item.seriesType} className="student-cart-drawer-item">
                        <div>
                          <div className="student-cart-item-headline">
                            <strong>{item.label}</strong>
                            <span className="student-cart-course-chip tone-default">Test Series</span>
                          </div>
                          {item.voucherCode && <p style={{fontSize:'0.78rem',color:'var(--accent)',marginTop:'2px'}}>🏷 {item.voucherCode} applied</p>}
                          <span>{item.discountPaise > 0 ? <s style={{opacity:0.5,marginRight:'6px'}}>{formatPriceInPaise(item.originalPaise)}</s> : null}{formatPriceInPaise(item.finalPaise)}</span>
                        </div>
                        <div className="student-cart-item-actions">
                          <button
                            type="button"
                            className="link-btn"
                            disabled={Boolean(tsCartCheckoutKey)}
                            onClick={() => handleCheckoutTsCartItem(item)}
                          >
                            {tsCartCheckoutKey === item.seriesType ? 'Processing...' : 'Pay Now'}
                          </button>
                          <button type="button" className="secondary-btn" onClick={() => {
                            setTsCartItems((prev) => {
                              const next = prev.filter((i) => i.seriesType !== item.seriesType);
                              try { localStorage.setItem('ts_cart', JSON.stringify(next)); } catch {}
                              return next;
                            });
                          }}>Remove</button>
                        </div>
                      </article>
                    ))}
                    {lockedModuleCart.map((item) => (
                      <article key={item.key} className="student-cart-drawer-item">
                        <div>
                          <div className="student-cart-item-headline">
                            <strong>{item.moduleName === ALL_MODULES ? 'All Modules Bundle' : item.moduleName}</strong>
                            <span className={`student-cart-course-chip tone-${getCourseTone(item.moduleCourse)}`}>{item.moduleCourse}</span>
                          </div>
                          <p>{`Course purchase • Batch: ${item.batchName || 'General'}`}</p>
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
                  <strong>{formatPriceInPaise(payableCartEstimate + tsCartItems.reduce((s, i) => s + i.finalPaise, 0))}</strong>
                  {appliedCartVoucherCode && payableCartDiscountTotal > 0 ? (
                    <span className="student-cart-savings-note">You save {formatPriceInPaise(payableCartDiscountTotal)}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handlePayNowForCart}
                  disabled={isBulkCheckoutRunning || isUnlockingCourse || (!payableCartItems.length && !tsCartItems.length)}
                >
                  {isBulkCheckoutRunning ? 'Processing Cart...' : `Pay Now (${payableCartItems.length + tsCartItems.length})`}
                </button>
              </footer>
            </aside>
          </div>,
          document.body
        ) : null}

        {!selectedModule && visibleMockExamNotices.length ? (
          <aside className="monthly-exam-notice card" role="status" aria-live="polite">
            <div>
              <p className="eyebrow">Monthly Mock Exam Notice</p>
              <h3>
                {visibleMockExamNotices[0].type === 'resultReleased'
                  ? 'Result released. Go to Exam section to view details.'
                  : visibleMockExamNotices[0].type === 'noticeEnabled'
                    ? 'New monthly mock exam has been announced for your course.'
                    : `Upcoming exam on ${new Date(visibleMockExamNotices[0].examDate).toLocaleDateString()}.`}
              </h3>
              <p>{visibleMockExamNotices[0].title}</p>
            </div>
            <div className="quiz-thankyou-actions">
              <button type="button" className="primary-btn" onClick={() => {
                const node = document.getElementById('section-monthly-exam');
                if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}>
                Go To Exam Section
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  const currentNotice = visibleMockExamNotices[0];
                  if (!currentNotice) return;
                  setMockExamNotices((current) => current.filter((item) => String(item?.examId || '') !== String(currentNotice.examId || '')));
                }}
              >
                Dismiss
              </button>
            </div>
          </aside>
        ) : null}

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
              <h2>Unlock {selectedModuleName}</h2>
              <button
                className="back-btn small"
                onClick={() => {
                  navigate(`/student/course/${encodeURIComponent(selectedModuleCourse || course || 'General')}/modules`);
                  setSelectedModule(null);
                  setSelectedModuleSection('');
                }}
              >
                ← Back to {selectedModuleCourse || 'Course'}
              </button>
            </>
          ) : (
            <h2>Choose your course to continue</h2>
          )}
        </div>
        {selectedModule && <StatCard label="Module" value={selectedModuleName} />}
        {!selectedModule && <StatCard label="Courses" value={marketplaceCourses.length} />}
      </section>

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
      ) : !selectedModule ? (
        (() => {
          return (
            <div className="student-learning-spotlight-grid">
              <div className="course-chooser-wrap">
                <div className="course-chooser-card">
                  <div className="course-chooser-top">
                    <span className="course-chooser-icon" aria-hidden="true">🔐</span>
                    <div className="course-chooser-intro">
                      <h3 className="course-chooser-title">Select a Course</h3>
                      <p className="course-chooser-subtitle">Start from a compact premium card. Open it to browse all available courses and choose your track.</p>
                    </div>
                  </div>

                  {marketplaceCourses.length ? (
                    <>
                      <button
                        type="button"
                        className="course-marketplace-launcher"
                        onClick={() => navigate('/student/courses')}
                      >
                        <div className="course-marketplace-launcher-copy">
                          <span className="course-marketplace-launcher-kicker">Premium Course Entry</span>
                          <strong>{selectedMarketplaceCourse ? selectedMarketplaceCourse.displayName : 'Open Course Catalog'}</strong>
                          <span>
                            {selectedMarketplaceCourse
                              ? `${selectedMarketplaceCourse.moduleCount} modules ready to explore`
                              : `${marketplaceCourses.length} curated exam tracks available`}
                          </span>
                        </div>
                        <div className="course-marketplace-launcher-side">
                          <span className="course-marketplace-launcher-badge">Select Course</span>
                          <span className="course-marketplace-launcher-arrow" aria-hidden="true">→</span>
                        </div>
                      </button>
                    </>
                  ) : (
                    <div className="course-chooser-details">
                      <p className="course-chooser-subtitle">No courses available yet.</p>
                    </div>
                  )}
                </div>
              </div>
              {renderLearningLiveCard()}
            </div>
          );
        })()
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
      ) : (
        <p className="empty-state">No courses available yet.</p>
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
                {communityUnreadCount > 0 ? (
                  <span className={`community-unread-badge${communityUnreadPulse ? ' is-bumping' : ''}`} aria-label={`${communityUnreadCount} unread community messages`}>
                    {communityUnreadCount > 99 ? '99+' : communityUnreadCount}
                  </span>
                ) : null}
              </p>
              <h2>Talk with admins and learners in real time</h2>
              <p className="subtitle">Ask doubts, share tips, and stay connected with the whole Biomics community.</p>
            </div>
          </div>
          <div className="workspace-link-actions">
            <button type="button" className="primary-btn" onClick={() => navigate('/student/community-chat')}>
              Open Community Chat
            </button>
          </div>
        </section>
      ) : null}

      {hasAnyUnlockedModule && !selectedModule ? (
        <div className="student-performance-spotlight-grid">
          <section
            id="section-quiz-performance"
            className="card student-route-entry-card quiz-performance-entry-card"
            role="button"
            tabIndex={0}
            onClick={() => navigate('/student/quiz-performance')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate('/student/quiz-performance');
              }
            }}
          >
            <div className="section-header compact">
              <div>
                <p className="eyebrow">Quiz Performance</p>
                <h2>Open your organized performance board</h2>
                <p className="subtitle">Review module-wise and topic-wise quiz progress in a dedicated premium workspace.</p>
              </div>
            </div>
            <div className="student-route-entry-copy">
              <div className="student-route-chip-row" aria-hidden="true">
                <span>Module trends</span>
                <span>Topic breakdown</span>
                <span>Recent attempts</span>
              </div>
              <div className="workspace-link-actions">
                <button type="button" className="primary-btn" onClick={() => navigate('/student/quiz-performance')}>
                  Open Quiz Performance →
                </button>
              </div>
            </div>
          </section>

          <section
            id="section-test-series-performance"
            className="card student-route-entry-card test-series-performance-entry-card"
            role="button"
            tabIndex={0}
            onClick={() => navigate('/student/test-series-performance')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate('/student/test-series-performance');
              }
            }}
          >
            <div className="section-header compact">
              <div>
                <p className="eyebrow">Test Series Performance</p>
                <h2>Track topic tests and full mocks separately</h2>
                <p className="subtitle">Dive into module-wise topic test results and a dedicated full mock performance board with clearer spacing and cleaner visuals.</p>
              </div>
            </div>
            <div className="student-route-entry-copy">
              <div className="student-route-chip-row" aria-hidden="true">
                <span>Topic test modules</span>
                <span>Full mock scores</span>
                <span>Premium layout</span>
              </div>
              <div className="workspace-link-actions">
                <button type="button" className="primary-btn" onClick={() => navigate('/student/test-series-performance')}>
                  Open Series Performance →
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {shouldShowLeaderboard ? (
        <section id="section-leaderboard" className="card quiz-leaderboard-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Quiz Leaderboard</p>
              <h2>Top Performers</h2>
            </div>
            <div className="quiz-leaderboard-controls" />
          </div>

          <div className="quiz-filter-bar" role="group" aria-label="Quiz leaderboard filters">
            <span className="quiz-filter-icon" aria-hidden="true">🏅</span>
            <label className="quiz-filter-field">
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
            <label className="quiz-filter-field">
              Topic
              <select
                value={leaderboardTopicFilter}
                onChange={(event) => setLeaderboardTopicFilter(event.target.value)}
              >
                <option value="all">All Topics</option>
                {quizTopicOptions.map((topic) => (
                  <option key={`leader-topic-${topic}`} value={topic}>{topic}</option>
                ))}
              </select>
            </label>
          </div>

          {leaderboardLoading ? <p className="empty-note">Loading leaderboard...</p> : null}
          {!leaderboardLoading && leaderboardError ? <p className="inline-message error">{leaderboardError}</p> : null}

          {!leaderboardLoading && !leaderboardError ? (
            filteredLeaderboard.length ? (
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
                      {filteredLeaderboard.map((entry, index) => (
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
              <p className="empty-note">No leaderboard data found for this topic filter. Try a different topic or select All.</p>
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
        <section id="section-test-series" className="card ts-student-entry-card">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Premium Add-on</p>
              <h2>Test Series</h2>
              <p className="subtitle">Topic-wise tests and full-length mock exams — purchased separately from your course plan.</p>
            </div>
            <div className="quiz-count-cards">
              <StatCard label="Topic Tests" value="∞" />
              <StatCard label="Full Mocks" value="∞" />
            </div>
          </div>
          <div className="workspace-link-actions">
            <button type="button" className="primary-btn" onClick={() => navigate('/student/test-series')}>
              Go to Test Series →
            </button>
          </div>
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
      <section id="section-connect" className="connect-section app-shell-full-bleed">
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

            <a
              href="https://chat.whatsapp.com/Fc8P3ZUDhfYDw6swMKDHOI"
              target="_blank"
              rel="noopener noreferrer"
              className="social-card social-card--whatsapp"
            >
              <span className="social-card-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12.04 2C6.54 2 2.08 6.45 2.08 11.95c0 1.77.46 3.5 1.34 5.03L2 22l5.17-1.35a9.9 9.9 0 0 0 4.87 1.25h.01c5.5 0 9.95-4.45 9.95-9.95A9.96 9.96 0 0 0 12.04 2zm5.81 14.02c-.24.67-1.41 1.25-1.95 1.33-.5.08-1.13.11-1.83-.11-.43-.14-.99-.32-1.7-.63-2.99-1.29-4.94-4.32-5.09-4.52-.14-.2-1.22-1.62-1.22-3.09 0-1.47.77-2.19 1.05-2.49.27-.3.6-.37.8-.37.2 0 .4 0 .57.01.19.01.44-.07.68.52.24.58.8 2.01.87 2.16.07.15.12.33.02.53-.1.2-.15.32-.3.5-.14.17-.3.39-.42.52-.14.15-.28.31-.12.6.16.3.7 1.16 1.5 1.88 1.03.92 1.89 1.21 2.19 1.35.3.14.48.12.66-.07.17-.2.75-.88.95-1.18.2-.3.4-.25.68-.15.28.1 1.77.83 2.07.98.3.15.5.22.57.35.07.12.07.72-.17 1.39z"/>
                </svg>
              </span>
              <span className="social-card-label">WhatsApp</span>
              <span className="social-card-handle">Join group</span>
              <span className="social-card-arrow">↗</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────── */}
      <footer className="lp-footer app-shell-full-bleed">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand-col">
            <div className="lp-footer-brand">
              <img src={logoImg} alt="Biomics Hub" className="lp-footer-logo" />
              <div>
                <p className="lp-footer-name">Biomics Hub</p>
                <p className="lp-footer-tagline">Premium biology learning for ambitious students.</p>
              </div>
            </div>
            <p className="lp-footer-about">{BIOMICS_MISSION_COPY}</p>
          </div>

          <div className="lp-footer-col">
            <p className="lp-footer-col-title">Dashboard</p>
            <nav className="lp-footer-nav" aria-label="Footer navigation">
              <button type="button" className="lp-footer-link" onClick={() => document.getElementById('section-learning')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Learning Content</button>
              <button type="button" className="lp-footer-link" onClick={() => document.getElementById('section-test-series')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Test Series</button>
              <button type="button" className="lp-footer-link" onClick={() => document.getElementById('section-feedback')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Feedback</button>
              <button type="button" className="lp-footer-link" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to Top</button>
            </nav>
          </div>

          <div className="lp-footer-col">
            <p className="lp-footer-col-title">Contact</p>
            <div className="lp-footer-contact-list">
              <p className="lp-footer-contact-item">📍 Bhubaneswar, Khandagiri, Lane R7, Odisha, PIN 751030</p>
              <a href="mailto:biomicshub@gmail.com" className="lp-footer-contact-item lp-footer-contact-link">✉ biomicshub@gmail.com</a>
              <p className="lp-footer-contact-item">🕒 Open: Mon - Sat, 9:00 AM - 9:00 PM</p>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <p className="lp-footer-copy">© {new Date().getFullYear()} Biomics Hub. All rights reserved.</p>
          <div className="lp-footer-legal">
            <button type="button" className="lp-footer-legal-btn">Privacy Policy</button>
            <button type="button" className="lp-footer-legal-btn">Terms of Service</button>
          </div>
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
                    {profileAvatarUrl && !avatarImageFailed ? (
                      <img
                        src={profileAvatarUrl}
                        alt="Student profile"
                        className="profile-avatar-large-image"
                        onError={() => setAvatarImageFailed(true)}
                      />
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
                  <div className={`profile-streak-chip ${testSeriesStreakDays > 0 ? 'is-active' : ''}`} role="status" aria-live="polite">
                    <span className="profile-streak-fire" aria-hidden="true">🔥</span>
                    <span className="profile-streak-text">{testSeriesStreakDays} day{testSeriesStreakDays === 1 ? '' : 's'} streak</span>
                  </div>
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
