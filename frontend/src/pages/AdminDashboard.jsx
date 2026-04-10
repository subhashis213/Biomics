import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  clearAiTutorHistoryAdmin,
  clearCommunityChatAdmin,
  createAnnouncementAdmin,
  createVoucherAdmin,
  deleteQuiz,
  deleteAnnouncementAdmin,
  deleteVoucherAdmin,
  fetchAdminAnnouncements,
  fetchAdminQuizzes,
  fetchRecoveryActionsAdmin,
  fetchAuditLogsAdmin,
  fetchCoursePricingAdmin,
  fetchModulePricingAdmin,
  fetchMockExamsAdmin,
  fetchMockExamPerformanceAdmin,
  fetchPaymentHistoryAdmin,
  fetchQuizAnalyticsAdmin,
  fetchVouchersAdmin,
  getApiBase,
  requestJson,
  saveCoursePricingAdmin,
  saveMockExamAdmin,
  toggleMockExamNoticeAdmin,
  saveModulePricingAdmin,
  saveModuleQuiz,
  releaseMockExamResultAdmin,
  updateAnnouncementAdmin,
  applyRecoveryActionAdmin,
  updateVoucherAdmin,
  uploadMaterial
} from '../api';
import { MAX_MATERIAL_MB } from '../constants';
import { clearSession, getSession, setSession } from '../session';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import VideoCard from '../components/VideoCard';
import ModuleManager from '../components/ModuleManager';
import { useThemeStore } from '../stores/themeStore';

const COURSE_CATEGORIES = [
  '11th',
  '12th',
  'NEET',
  'IIT-JAM',
  'CSIR-NET Life Science',
  'GATE'
];

const COURSE_META = {
  '11th':                  { icon: '📖', color: '#2563eb' },
  '12th':                  { icon: '🎓', color: '#0f766e' },
  'NEET':                  { icon: '🧬', color: '#16a34a' },
  'IIT-JAM':               { icon: '⚗️',  color: '#d97706' },
  'CSIR-NET Life Science': { icon: '🔬', color: '#0891b2' },
  'GATE':                  { icon: '💻', color: '#dc2626' },
};

const COURSE_MODAL_THEME = {
  '11th': {
    accent: '#2563eb',
    accentAlt: '#0ea5e9',
    glowA: '37, 99, 235',
    glowB: '14, 165, 233'
  },
  '12th': {
    accent: '#0f766e',
    accentAlt: '#14b8a6',
    glowA: '15, 118, 110',
    glowB: '20, 184, 166'
  },
  'NEET': {
    accent: '#16a34a',
    accentAlt: '#84cc16',
    glowA: '22, 163, 74',
    glowB: '132, 204, 22'
  },
  'IIT-JAM': {
    accent: '#d97706',
    accentAlt: '#f59e0b',
    glowA: '217, 119, 6',
    glowB: '245, 158, 11'
  },
  'CSIR-NET Life Science': {
    accent: '#0891b2',
    accentAlt: '#06b6d4',
    glowA: '8, 145, 178',
    glowB: '6, 182, 212'
  },
  'GATE': {
    accent: '#dc2626',
    accentAlt: '#ef4444',
    glowA: '220, 38, 38',
    glowB: '239, 68, 68'
  }
};

const CSIR_COURSE = 'CSIR-NET Life Science';

export default function AdminDashboard() {
  const UNDO_DURATION_MS = 5000;
  const BANNER_VISIBLE_MS = 3000;
  const QUIZ_MESSAGE_VISIBLE_MS = 3000;
  const QUIZ_MESSAGE_FADE_MS = 280;
  const RING_RADIUS = 16;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  const navigate = useNavigate();
  const { theme, toggleTheme } = useThemeStore();
  const isLightTheme = theme === 'light';
  const [videos, setVideos] = useState([]);
  const [students, setStudents] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [videoForm, setVideoForm] = useState({ title: '', description: '', url: '' });
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState('module'); // 'module' or 'upload'
  const [courseModules, setCourseModules] = useState({}); // { courseName: ['Module1', 'Module2'] }
  const [selectedModule, setSelectedModule] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [moduleTopicsByKey, setModuleTopicsByKey] = useState({});
  const [newTopicName, setNewTopicName] = useState('');
  const [isTopicLoading, setIsTopicLoading] = useState(false);
  const [isTopicSaving, setIsTopicSaving] = useState(false);
  const [isTopicDeleting, setIsTopicDeleting] = useState('');
  const [modalNoteFile, setModalNoteFile] = useState(null);
  const [modalMessage, setModalMessage] = useState(null);
  const [modalUploadProgress, setModalUploadProgress] = useState(0);
  const [publishingForCourse, setPublishingForCourse] = useState(false);
  const [banner, setBanner] = useState(null);
  const [uploadFiles, setUploadFiles] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});
  const [materialMessages, setMaterialMessages] = useState({});
  const [loading, setLoading] = useState(true);
  const [liveClass, setLiveClass] = useState(null); // { active, title, meetUrl, startedAt }
  const [liveClassTitle, setLiveClassTitle] = useState('');
  const [liveClassMeetUrl, setLiveClassMeetUrl] = useState('');
  const [isStartingClass, setIsStartingClass] = useState(false);
  const [isEndingClass, setIsEndingClass] = useState(false);
  const [scheduledClass, setScheduledClass] = useState(null); // { _id, title, scheduledAt, meetUrl }
  const [scheduleForm, setScheduleForm] = useState({ title: '', meetUrl: '', date: '', time: '' });
  const [isScheduling, setIsScheduling] = useState(false);
  const [isCancellingSchedule, setIsCancellingSchedule] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [quizCategory, setQuizCategory] = useState(COURSE_CATEGORIES[0]);
  const [quizModule, setQuizModule] = useState('');
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDifficulty, setQuizDifficulty] = useState('medium');
  const [quizRequireExplanation, setQuizRequireExplanation] = useState(false);
  const [quizTimeLimitMinutes, setQuizTimeLimitMinutes] = useState(15);
  const [quizQuestions, setQuizQuestions] = useState([
    { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' }
  ]);
  const [adminQuizzes, setAdminQuizzes] = useState([]);
  const [allAdminQuizzes, setAllAdminQuizzes] = useState([]);
  const [allQuizzesCount, setAllQuizzesCount] = useState(0);
  const [editingQuizId, setEditingQuizId] = useState(null);
  const [quizSaving, setQuizSaving] = useState(false);
  const [quizMessage, setQuizMessage] = useState(null);
  const [mockExamCategory, setMockExamCategory] = useState(COURSE_CATEGORIES[0]);
  const [mockExamTitle, setMockExamTitle] = useState('');
  const [mockExamDescription, setMockExamDescription] = useState('');
  const [mockExamDate, setMockExamDate] = useState('');
  const [mockExamWindowEndAt, setMockExamWindowEndAt] = useState('');
  const [mockExamDurationMinutes, setMockExamDurationMinutes] = useState(60);
  const [mockExamNoticeEnabled, setMockExamNoticeEnabled] = useState(true);
  const [mockExamQuestions, setMockExamQuestions] = useState([
    { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' }
  ]);
  const [mockExamSaving, setMockExamSaving] = useState(false);
  const [mockExamList, setMockExamList] = useState([]);
  const [mockExamPerformance, setMockExamPerformance] = useState([]);
  const [mockExamPerformanceMonths, setMockExamPerformanceMonths] = useState([]);
  const [mockExamPerformanceMonthFilter, setMockExamPerformanceMonthFilter] = useState('all');
  const [mockExamPerformanceLoading, setMockExamPerformanceLoading] = useState(false);
  const [mockExamPerformanceError, setMockExamPerformanceError] = useState('');
  const [editingMockExamId, setEditingMockExamId] = useState('');
  const [mockExamMessage, setMockExamMessage] = useState(null);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [announcementList, setAnnouncementList] = useState([]);
  const [announcementInlineMessage, setAnnouncementInlineMessage] = useState(null);
  const [isQuizMessageDismissing, setIsQuizMessageDismissing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Delete',
    processingLabel: 'Deleting...',
    errorText: ''
  });
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const [coursePricing, setCoursePricing] = useState([]);
  const [voucherList, setVoucherList] = useState([]);
  const [priceFormByCourse, setPriceFormByCourse] = useState({});
  // module-level pricing: { 'GATE': { modules: [...], priceFormByModule: { 'MODULE_A': {...} } } }
  const [modulePricingByCourse, setModulePricingByCourse] = useState({});
  const [isSavingModulePrice, setIsSavingModulePrice] = useState(false);
  const [expandedPricingCourse, setExpandedPricingCourse] = useState(null);
  const [pricingSaveStatus, setPricingSaveStatus] = useState({});
  const [voucherForm, setVoucherForm] = useState({
    code: '',
    description: '',
    discountType: 'percent',
    discountValue: '',
    maxDiscountInPaise: '',
    usageLimit: '',
    validUntil: '',
    applicableCourses: []
  });
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [isSavingVoucher, setIsSavingVoucher] = useState(false);
  const [isClearingCommunityChat, setIsClearingCommunityChat] = useState(false);
  const [isClearingAiTutorHistory, setIsClearingAiTutorHistory] = useState(false);
  const [undoItems, setUndoItems] = useState({});
  const undoTimeoutsRef = useRef({});
  const undoIntervalsRef = useRef({});
  const pricingSaveTimeoutsRef = useRef({});
  const undoActiveRef = useRef(false);
  const confirmActionRef = useRef(null);
  const bannerTimeoutRef = useRef(null);
  const quizMessageFadeTimeoutRef = useRef(null);
  const quizMessageClearTimeoutRef = useRef(null);

  // ── Payment History state ────────────────────────────────
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [paymentHistoryPagination, setPaymentHistoryPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [paymentHistoryFilter, setPaymentHistoryFilter] = useState({ course: '', status: '', username: '' });
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);

  // ── Quiz Analytics state ─────────────────────────────────
  const [quizAnalytics, setQuizAnalytics] = useState([]);
  const [quizAnalyticsCategory, setQuizAnalyticsCategory] = useState('');
  const [quizAnalyticsLoading, setQuizAnalyticsLoading] = useState(false);

  // ── Audit Log state ──────────────────────────────────────
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogPagination, setAuditLogPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [auditLogFilter, setAuditLogFilter] = useState({ action: '', actor: '' });
  const [auditLogLoading, setAuditLogLoading] = useState(false);
  const [recoveryActions, setRecoveryActions] = useState([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryApplyingId, setRecoveryApplyingId] = useState('');
  const [recoveryFilter, setRecoveryFilter] = useState({ from: '', to: '' });
  const [adminProfileOpen, setAdminProfileOpen] = useState(false);
  const [adminProfile, setAdminProfile] = useState(null);
  const [adminProfileForm, setAdminProfileForm] = useState({ username: '', password: '', confirmPassword: '' });
  const [adminProfileMessage, setAdminProfileMessage] = useState(null);
  const [isAdminProfileLoading, setIsAdminProfileLoading] = useState(false);
  const [isAdminAvatarUploading, setIsAdminAvatarUploading] = useState(false);
  const [isSavingAdminProfile, setIsSavingAdminProfile] = useState(false);

  function clearQuizMessageTimers() {
    if (quizMessageFadeTimeoutRef.current) {
      clearTimeout(quizMessageFadeTimeoutRef.current);
      quizMessageFadeTimeoutRef.current = null;
    }
    if (quizMessageClearTimeoutRef.current) {
      clearTimeout(quizMessageClearTimeoutRef.current);
      quizMessageClearTimeoutRef.current = null;
    }
  }

  function getPricingStatusKey(courseName, moduleName = 'ALL_MODULES') {
    return `${courseName}::${moduleName}`;
  }

  function clearPricingSaveStatus(key) {
    if (pricingSaveTimeoutsRef.current[key]) {
      clearTimeout(pricingSaveTimeoutsRef.current[key]);
      delete pricingSaveTimeoutsRef.current[key];
    }
    setPricingSaveStatus((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function setPricingInlineStatus(key, type, text) {
    if (pricingSaveTimeoutsRef.current[key]) {
      clearTimeout(pricingSaveTimeoutsRef.current[key]);
      delete pricingSaveTimeoutsRef.current[key];
    }

    setPricingSaveStatus((current) => ({
      ...current,
      [key]: { type, text }
    }));

    if (type === 'success') {
      pricingSaveTimeoutsRef.current[key] = setTimeout(() => {
        clearPricingSaveStatus(key);
      }, 2200);
    }
  }

  async function refreshData() {
    setLoading(true);
    try {
      const [videoResult, studentResult, feedbackResult, moduleResult] = await Promise.allSettled([
        requestJson('/videos'),
        requestJson('/auth/users'),
        requestJson('/feedback'),
        requestJson('/modules')
      ]);

      const authError = [videoResult, studentResult, feedbackResult, moduleResult]
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason?.message || '')
        .find((message) => /authentication|forbidden/i.test(message));

      if (authError) {
        clearSession();
        navigate('/', { replace: true });
        return;
      }

      if (videoResult.status === 'fulfilled') {
        setVideos(Array.isArray(videoResult.value) ? videoResult.value : []);
      }

      if (studentResult.status === 'fulfilled') {
        setStudents(studentResult.value?.users || []);
      }

      if (feedbackResult.status === 'fulfilled') {
        setFeedback((feedbackResult.value?.feedback || []).map((item) => ({
          ...item,
          _id: item._id || item.id || `meta:${JSON.stringify({
            u: item.username,
            c: item.createdAt,
            m: item.message || ''
          })}`
        })));
      }

      const modulesByCourse = {};
      if (moduleResult.status === 'fulfilled') {
        (moduleResult.value?.modules || []).forEach((entry) => {
          const category = String(entry.category || '').trim();
          const name = String(entry.name || '').trim();
          if (!category || !name) return;
          if (!modulesByCourse[category]) modulesByCourse[category] = [];
          modulesByCourse[category].push(name);
        });
      }

      setCourseModules((prev) => {
        const next = { ...prev };
        Object.keys(modulesByCourse).forEach((course) => {
          next[course] = Array.from(new Set(modulesByCourse[course])).sort((a, b) => a.localeCompare(b));
        });
        return next;
      });

      const failures = [videoResult, studentResult, feedbackResult, moduleResult]
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason?.message || 'Request failed');

      if (failures.length) {
        setBanner({ type: 'error', text: failures[0] });
      }
    } catch (error) {
      const message = error?.message || 'Failed to load admin data.';
      if (message.toLowerCase().includes('authentication') || message.toLowerCase().includes('forbidden')) {
        clearSession();
        navigate('/', { replace: true });
        return;
      }
      setBanner({ type: 'error', text: message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsAdminProfileLoading(true);
    requestJson('/auth/admin/me')
      .then((data) => {
        if (cancelled) return;
        const admin = data?.admin || null;
        setAdminProfile(admin);
        setAdminProfileForm({ username: admin?.username || '', password: '', confirmPassword: '' });
      })
      .catch((error) => {
        if (!cancelled) setBanner({ type: 'error', text: error.message || 'Failed to load admin profile.' });
      })
      .finally(() => {
        if (!cancelled) setIsAdminProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!adminProfileOpen) return undefined;

    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;

    const previousBodyOverflow = body.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyLeft = body.style.left;
    const previousBodyRight = body.style.right;
    const previousBodyWidth = body.style.width;
    const previousBodyTouchAction = body.style.touchAction;
    const previousHtmlOverflow = html.style.overflow;

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    html.style.overflow = 'hidden';

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.left = previousBodyLeft;
      body.style.right = previousBodyRight;
      body.style.width = previousBodyWidth;
      body.style.touchAction = previousBodyTouchAction;
      html.style.overflow = previousHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [adminProfileOpen]);

  useEffect(() => {
    if (!adminProfileMessage) return undefined;
    const timer = window.setTimeout(() => setAdminProfileMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [adminProfileMessage]);

  async function loadPaymentSettings() {
    try {
      const [pricingRes, voucherRes] = await Promise.all([
        fetchCoursePricingAdmin(),
        fetchVouchersAdmin()
      ]);
      const pricing = pricingRes?.pricing || [];
      setCoursePricing(pricing);
      setVoucherList(voucherRes?.vouchers || []);

      const nextPriceForm = {};
      COURSE_CATEGORIES.forEach((category) => {
        // Find the ALL_MODULES (bundle) doc for this course
        const matched = pricing.find(
          (entry) => String(entry.category || '').trim() === category
            && String(entry.moduleName || '').trim() === 'ALL_MODULES'
        );
        nextPriceForm[category] = {
          proAmountRupees: matched ? String(Number(matched.proPriceInPaise || 0) / 100) : '0',
          eliteAmountRupees: matched ? String(Number(matched.elitePriceInPaise || 0) / 100) : '0',
          active: matched ? matched.active !== false : true
        };
      });
      setPriceFormByCourse(nextPriceForm);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load payment settings.' });
    }
  }

  useEffect(() => {
    loadPaymentSettings();
  }, []);

  async function fetchLiveStatus() {
    try {
      const data = await requestJson('/live/status');
      setLiveClass(data.active ? data : null);
      setScheduledClass(data.upcoming || null);
    } catch {
      // silently ignore — non-critical
    }
  }

  useEffect(() => {
    fetchLiveStatus();
  }, []);

  async function handleStartClass() {
    if (isStartingClass) return;
    const trimmedUrl = liveClassMeetUrl.trim();
    if (!trimmedUrl.startsWith('https://meet.google.com/')) {
      setBanner({ type: 'error', text: 'Please enter a valid Google Meet link (https://meet.google.com/...)' });
      return;
    }
    setIsStartingClass(true);
    try {
      const data = await requestJson('/live/start', {
        method: 'POST',
        body: JSON.stringify({ title: liveClassTitle.trim() || 'Live Class', meetUrl: trimmedUrl })
      });
      setLiveClass(data);
      setBanner({ type: 'success', text: `Live class “${data.title}” started! Students can now join.` });
    } catch (error) {
      setBanner({ type: 'error', text: error.message });
    } finally {
      setIsStartingClass(false);
    }
  }

  async function handleEndClass() {
    if (isEndingClass) return;
    setIsEndingClass(true);
    try {
      await requestJson('/live/end', { method: 'POST' });
      setLiveClass(null);
      setLiveClassTitle('');
      setLiveClassMeetUrl('');
      setBanner({ type: 'success', text: 'Live class ended.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message });
    } finally {
      setIsEndingClass(false);
    }
  }

  async function handleScheduleClass(event) {
    event.preventDefault();
    if (isScheduling) return;
    const { title, meetUrl, date, time } = scheduleForm;
    if (!date || !time) {
      setBanner({ type: 'error', text: 'Please select a date and time for the class.' });
      return;
    }
    const scheduledAt = new Date(`${date}T${time}`);
    if (isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      setBanner({ type: 'error', text: 'Scheduled time must be in the future.' });
      return;
    }
    setIsScheduling(true);
    try {
      const data = await requestJson('/live/schedule', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || 'Live Class',
          meetUrl: meetUrl.trim(),
          scheduledAt: scheduledAt.toISOString()
        })
      });
      setScheduledClass(data);
      setScheduleForm({ title: '', meetUrl: '', date: '', time: '' });
      setShowScheduleForm(false);
      setBanner({ type: 'success', text: `Class scheduled for ${scheduledAt.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.` });
    } catch (error) {
      setBanner({ type: 'error', text: error.message });
    } finally {
      setIsScheduling(false);
    }
  }

  async function handleCancelSchedule() {
    if (isCancellingSchedule) return;
    setIsCancellingSchedule(true);
    try {
      await requestJson('/live/schedule', { method: 'DELETE' });
      setScheduledClass(null);
      setBanner({ type: 'success', text: 'Scheduled class cancelled.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message });
    } finally {
      setIsCancellingSchedule(false);
    }
  }

  useEffect(() => {
    return () => {
      if (bannerTimeoutRef.current) {
        clearTimeout(bannerTimeoutRef.current);
      }
      Object.values(undoTimeoutsRef.current).forEach(timeoutId => clearTimeout(timeoutId));
      Object.values(undoIntervalsRef.current).forEach(intervalId => clearInterval(intervalId));
      Object.values(pricingSaveTimeoutsRef.current).forEach(timeoutId => clearTimeout(timeoutId));
      clearQuizMessageTimers();
    };
  }, []);

  useEffect(() => {
    clearQuizMessageTimers();
    setIsQuizMessageDismissing(false);

    if (quizMessage?.type !== 'success') return;

    quizMessageFadeTimeoutRef.current = setTimeout(() => {
      setIsQuizMessageDismissing(true);
    }, Math.max(0, QUIZ_MESSAGE_VISIBLE_MS - QUIZ_MESSAGE_FADE_MS));

    quizMessageClearTimeoutRef.current = setTimeout(() => {
      setQuizMessage((current) => (current?.type === 'success' ? null : current));
      setIsQuizMessageDismissing(false);
      clearQuizMessageTimers();
    }, QUIZ_MESSAGE_VISIBLE_MS);

    return () => {
      clearQuizMessageTimers();
      setIsQuizMessageDismissing(false);
    };
  }, [quizMessage, QUIZ_MESSAGE_VISIBLE_MS, QUIZ_MESSAGE_FADE_MS]);

  useEffect(() => {
    if (bannerTimeoutRef.current) {
      clearTimeout(bannerTimeoutRef.current);
      bannerTimeoutRef.current = null;
    }

    if (banner?.type !== 'success') return;

    bannerTimeoutRef.current = setTimeout(() => {
      setBanner((current) => (current?.type === 'success' ? null : current));
      bannerTimeoutRef.current = null;
    }, BANNER_VISIBLE_MS);

    return () => {
      if (bannerTimeoutRef.current) {
        clearTimeout(bannerTimeoutRef.current);
        bannerTimeoutRef.current = null;
      }
    };
  }, [banner, BANNER_VISIBLE_MS]);

  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyTouchAction = body.style.touchAction;
    const previousHtmlOverflow = html.style.overflow;
    const hasBlockingModal = courseModalOpen || confirmDialog.open;

    if (hasBlockingModal) {
      body.style.overflow = 'hidden';
      body.style.touchAction = 'none';
      html.style.overflow = 'hidden';
    }

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.touchAction = previousBodyTouchAction;
      html.style.overflow = previousHtmlOverflow;
    };
  }, [courseModalOpen, confirmDialog.open]);

  function openConfirmDialog({ title, message, confirmLabel, processingLabel, onConfirm }) {
    confirmActionRef.current = onConfirm || null;
    setConfirmDialog({
      open: true,
      title,
      message,
      confirmLabel: confirmLabel || 'Delete',
      processingLabel: processingLabel || 'Deleting...',
      errorText: ''
    });
  }

  function closeConfirmDialog() {
    if (isConfirmingAction) return;
    confirmActionRef.current = null;
    setConfirmDialog({
      open: false,
      title: '',
      message: '',
      confirmLabel: 'Delete',
      processingLabel: 'Deleting...',
      errorText: ''
    });
  }

  async function handleConfirmAction() {
    const action = confirmActionRef.current;
    if (isConfirmingAction) return;
    if (!action) {
      setConfirmDialog((current) => ({
        ...current,
        errorText: 'Confirm action is not available. Please close this popup and try again.'
      }));
      return;
    }

    setConfirmDialog((current) => ({
      ...current,
      errorText: ''
    }));
    setIsConfirmingAction(true);
    try {
      await action();
      confirmActionRef.current = null;
      setConfirmDialog({
        open: false,
        title: '',
        message: '',
        confirmLabel: 'Delete',
        processingLabel: 'Deleting...',
        errorText: ''
      });
    } catch (error) {
      const message = error?.message || 'Action failed.';
      setConfirmDialog((current) => ({
        ...current,
        errorText: message
      }));
      setBanner({ type: 'error', text: message });
    } finally {
      setIsConfirmingAction(false);
    }
  }

  function handleClearCommunityChatClick() {
    openConfirmDialog({
      title: 'Clear Community Chat?',
      message: 'This will permanently delete all messages in the student-admin community chat for everyone.',
      confirmLabel: 'Clear All Messages',
      processingLabel: 'Clearing...',
      onConfirm: async () => {
        setIsClearingCommunityChat(true);
        try {
          await clearCommunityChatAdmin();
          setBanner({ type: 'success', text: 'Community chat was cleared for all users.' });
        } finally {
          setIsClearingCommunityChat(false);
        }
      }
    });
  }

  function handleClearAiTutorHistoryClick() {
    openConfirmDialog({
      title: 'Clear All AI Tutor History?',
      message: 'This will permanently delete all AI tutor conversation history records from the database for every user.',
      confirmLabel: 'Clear AI Tutor History',
      processingLabel: 'Clearing...',
      onConfirm: async () => {
        setIsClearingAiTutorHistory(true);
        try {
          const response = await clearAiTutorHistoryAdmin();
          const deletedCount = Number(response?.deletedCount || 0);
          setBanner({ type: 'success', text: `AI tutor history cleared (${deletedCount} records removed).` });
        } finally {
          setIsClearingAiTutorHistory(false);
        }
      }
    });
  }

  function clearUndoTimers(itemId) {
    if (undoTimeoutsRef.current[itemId]) {
      clearTimeout(undoTimeoutsRef.current[itemId]);
      delete undoTimeoutsRef.current[itemId];
    }
    if (undoIntervalsRef.current[itemId]) {
      clearInterval(undoIntervalsRef.current[itemId]);
      delete undoIntervalsRef.current[itemId];
    }
  }

  function scheduleUndoPopup({ itemId, message, commit, rollback, successText }) {
    clearUndoTimers(itemId);
    undoActiveRef.current = true;

    const startedAt = Date.now();
    const action = {
      message,
      commit,
      rollback,
      successText,
      startedAt,
      expiresAt: startedAt + UNDO_DURATION_MS,
      remainingMs: UNDO_DURATION_MS
    };

    setUndoItems((current) => ({
      ...current,
      [itemId]: action
    }));

    undoIntervalsRef.current[itemId] = setInterval(() => {
      const remaining = Math.max(0, action.expiresAt - Date.now());
      setUndoItems((current) => ({
        ...current,
        [itemId]: current[itemId] ? { ...current[itemId], remainingMs: remaining } : current[itemId]
      }));
    }, 100);

    undoTimeoutsRef.current[itemId] = setTimeout(async () => {
      clearUndoTimers(itemId);
      try {
        await action.commit();
        setBanner({ type: 'success', text: action.successText });
      } catch (error) {
        action.rollback?.();
        setBanner({ type: 'error', text: error?.message || 'Action failed.' });
      } finally {
        setUndoItems((current) => {
          const next = { ...current };
          delete next[itemId];
          return next;
        });
      }
    }, UNDO_DURATION_MS);
  }

  function handleUndoAction(itemId) {
    const action = undoItems[itemId];
    if (!action) return;
    clearUndoTimers(itemId);
    action.rollback?.();
    setUndoItems((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    setBanner({ type: 'success', text: 'Action cancelled.' });
  }

  async function handleCreateVideo(event) {
    event.preventDefault();
    if (!videoForm.title.trim() || !videoForm.url.trim() || !selectedCourse || !selectedModule) return;
    if (selectedCourse === CSIR_COURSE && !selectedTopic) {
      setModalMessage({ type: 'error', text: 'Please select or create a topic before uploading in CSIR module.' });
      return;
    }

    if (modalNoteFile) {
      const isPdf = modalNoteFile.type === 'application/pdf' || modalNoteFile.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        setModalMessage({ type: 'error', text: 'Only PDF notes are allowed.' });
        return;
      }
      if (modalNoteFile.size > MAX_MATERIAL_MB * 1024 * 1024) {
        setModalMessage({ type: 'error', text: `Maximum notes size is ${MAX_MATERIAL_MB}MB.` });
        return;
      }
    }

    setPublishingForCourse(true);
    setModalMessage(null);
    setModalUploadProgress(0);

    try {
      const createdVideo = await requestJson('/videos', {
        method: 'POST',
        body: JSON.stringify({
          title: videoForm.title.trim(),
          description: videoForm.description.trim(),
          url: videoForm.url.trim(),
          category: selectedCourse,
          module: selectedModule,
          topic: selectedCourse === CSIR_COURSE ? selectedTopic : 'General'
        })
      });

      if (modalNoteFile) {
        await uploadMaterial(createdVideo._id, modalNoteFile, (percent) => {
          setModalUploadProgress(percent);
        });
      }

      const topicSegment = selectedCourse === CSIR_COURSE && selectedTopic ? ` / ${selectedTopic}` : '';
      const successText = `Lecture added to ${selectedModule}${topicSegment} in ${selectedCourse}${modalNoteFile ? ' with notes.' : '.'}`;
      setVideoForm({ title: '', description: '', url: '' });
      setModalNoteFile(null);
      setPublishingForCourse(false);
      setCourseModalOpen(false);
      setModalStep('module');
      setSelectedModule(null);
      setSelectedTopic(null);
      await refreshData();
      setBanner({ type: 'success', text: successText });
    } catch (error) {
      setModalMessage({ type: 'error', text: error.message });
      setPublishingForCourse(false);
    }
  }

  async function handleModuleCreate(moduleName) {
    if (!selectedCourse || !moduleName) return;
    try {
      await requestJson('/modules', {
        method: 'POST',
        body: JSON.stringify({ category: selectedCourse, name: moduleName })
      });
      await refreshData();
      setCourseModules((prev) => ({
        ...prev,
        [selectedCourse]: Array.from(new Set([...(prev[selectedCourse] || []), moduleName]))
      }));
      setSelectedModule(moduleName);
      if (selectedCourse === CSIR_COURSE) {
        setSelectedTopic(null);
        setModalStep('topic');
        await loadTopicsForModule(selectedCourse, moduleName);
      } else {
        setModalStep('upload');
      }
      setModalMessage(null);
      if (expandedPricingCourse === selectedCourse) {
        await loadModulePricing(selectedCourse);
      }
    } catch (error) {
      setModalMessage({ type: 'error', text: error.message || 'Failed to create module.' });
      throw error;
    }
  }

  async function handleModuleSelect(moduleName) {
    setSelectedModule(moduleName);
    if (selectedCourse === CSIR_COURSE) {
      setSelectedTopic(null);
      setModalStep('topic');
      await loadTopicsForModule(selectedCourse, moduleName);
    } else {
      setModalStep('upload');
    }
  }

  function goBackToModuleStep() {
    setModalStep('module');
    setSelectedModule(null);
    setSelectedTopic(null);
    setNewTopicName('');
    setVideoForm({ title: '', description: '', url: '' });
    setModalNoteFile(null);
    setModalMessage(null);
  }

  function getTopicBucketKey(courseName, moduleName) {
    return `${String(courseName || '').trim()}::${String(moduleName || '').trim()}`;
  }

  async function loadTopicsForModule(courseName, moduleName) {
    if (!courseName || !moduleName) return;
    setIsTopicLoading(true);
    try {
      const query = `?category=${encodeURIComponent(courseName)}&module=${encodeURIComponent(moduleName)}`;
      const response = await requestJson(`/modules/topics${query}`);
      const topics = Array.isArray(response?.topics)
        ? response.topics.map((entry) => String(entry?.name || '').trim()).filter(Boolean)
        : [];
      const bucketKey = getTopicBucketKey(courseName, moduleName);
      setModuleTopicsByKey((prev) => ({ ...prev, [bucketKey]: topics }));
    } catch (error) {
      setModalMessage({ type: 'error', text: error.message || 'Failed to load topics.' });
    } finally {
      setIsTopicLoading(false);
    }
  }

  async function handleTopicCreate() {
    const topicName = newTopicName.trim();
    if (!selectedCourse || !selectedModule || !topicName) return;
    const bucketKey = getTopicBucketKey(selectedCourse, selectedModule);
    const existingTopics = moduleTopicsByKey[bucketKey] || [];
    if (existingTopics.some((item) => item.toLowerCase() === topicName.toLowerCase())) {
      setModalMessage({ type: 'error', text: 'Topic already exists in this module.' });
      return;
    }

    setIsTopicSaving(true);
    setModalMessage(null);
    try {
      await requestJson('/modules/topics', {
        method: 'POST',
        body: JSON.stringify({ category: selectedCourse, module: selectedModule, name: topicName })
      });
      setModuleTopicsByKey((prev) => ({
        ...prev,
        [bucketKey]: Array.from(new Set([...(prev[bucketKey] || []), topicName])).sort((a, b) => a.localeCompare(b))
      }));
      setSelectedTopic(topicName);
      setNewTopicName('');
      setModalMessage({ type: 'success', text: `Topic "${topicName}" created.` });
    } catch (error) {
      setModalMessage({ type: 'error', text: error.message || 'Failed to create topic.' });
    } finally {
      setIsTopicSaving(false);
    }
  }

  function handleTopicSelect(topicName) {
    setSelectedTopic(topicName);
    setModalStep('upload');
    setModalMessage(null);
  }

  async function handleTopicDelete(topicName) {
    if (!selectedCourse || !selectedModule || !topicName) return;
    const bucketKey = getTopicBucketKey(selectedCourse, selectedModule);
    setIsTopicDeleting(topicName);
    try {
      await requestJson('/modules/topics', {
        method: 'DELETE',
        body: JSON.stringify({ category: selectedCourse, module: selectedModule, name: topicName })
      });
      setModuleTopicsByKey((prev) => ({
        ...prev,
        [bucketKey]: (prev[bucketKey] || []).filter((entry) => entry !== topicName)
      }));
      if (selectedTopic === topicName) {
        setSelectedTopic(null);
      }
      setModalMessage({ type: 'success', text: `Topic "${topicName}" removed.` });
    } catch (error) {
      setModalMessage({ type: 'error', text: error.message || 'Failed to delete topic.' });
    } finally {
      setIsTopicDeleting('');
    }
  }

  function goBackToTopicStep() {
    setModalStep('topic');
    setSelectedTopic(null);
    setVideoForm({ title: '', description: '', url: '' });
    setModalNoteFile(null);
    setModalMessage(null);
  }

  async function handleModuleDelete(moduleName) {
    if (!selectedCourse || !moduleName) return;
    try {
      await Promise.all([
        requestJson('/videos/module', {
          method: 'DELETE',
          body: JSON.stringify({ category: selectedCourse, module: moduleName })
        }),
        requestJson('/quizzes/module', {
          method: 'DELETE',
          body: JSON.stringify({ category: selectedCourse, module: moduleName })
        }),
        requestJson('/modules', {
          method: 'DELETE',
          body: JSON.stringify({ category: selectedCourse, name: moduleName })
        })
      ]);
      // Remove from local module list
      setCourseModules((prev) => ({
        ...prev,
        [selectedCourse]: (prev[selectedCourse] || []).filter((m) => m !== moduleName)
      }));
      // Keep quiz caches in sync immediately so deleted modules do not reappear.
      setAllAdminQuizzes((current) => current.filter((quiz) => {
        const sameCategory = (quiz.category || 'General') === selectedCourse;
        const quizModule = String(quiz.module || '').trim() || 'General';
        return !(sameCategory && quizModule === moduleName);
      }));
      setAdminQuizzes((current) => current.filter((quiz) => {
        const sameCategory = (quiz.category || 'General') === selectedCourse;
        const quizModule = String(quiz.module || '').trim() || 'General';
        return !(sameCategory && quizModule === moduleName);
      }));
      await refreshData();
      if (expandedPricingCourse === selectedCourse) {
        await loadModulePricing(selectedCourse);
      }
      await loadAdminQuizzes(quizCategory);
      setModalMessage({ type: 'success', text: `Module "${moduleName}" and all its content deleted.` });
      setTimeout(() => setModalMessage(null), 3000);
    } catch (err) {
      setModalMessage({ type: 'error', text: err.message || 'Failed to delete module.' });
      setTimeout(() => setModalMessage(null), 3000);
    }
  }

  function getModulesForCourse(courseName) {
    const fromLocal = courseModules[courseName] || [];
    const fromVideos = videos
      .filter((video) => (video.category || 'General') === courseName)
      .map((video) => (video.module || 'General').trim())
      .filter(Boolean);
    const fromQuizzes = allAdminQuizzes
      .filter((quiz) => (quiz.category || 'General') === courseName)
      .map((quiz) => String(quiz.module || '').trim())
      .filter(Boolean);

    return Array.from(new Set([...fromLocal, ...fromVideos, ...fromQuizzes])).sort((a, b) => a.localeCompare(b));
  }

  function openCourseModal(course) {
    const mergedModules = getModulesForCourse(course);
    setCourseModules((prev) => ({
      ...prev,
      [course]: mergedModules
    }));
    setSelectedCourse(course);
    setCourseModalOpen(true);
    setModalStep('module');
    setSelectedModule(null);
    setSelectedTopic(null);
    setNewTopicName('');
    setModalMessage(null);
    setModalUploadProgress(0);
    setModalNoteFile(null);
    setPublishingForCourse(false);
    setVideoForm({ title: '', description: '', url: '' });
  }

  function closeCourseModal() {
    setCourseModalOpen(false);
    setModalStep('module');
    setSelectedModule(null);
    setSelectedTopic(null);
    setNewTopicName('');
    setModalMessage(null);
    setModalUploadProgress(0);
    setModalNoteFile(null);
    setVideoForm({ title: '', description: '', url: '' });
    setPublishingForCourse(false);
  }

  function handleDeleteVideo(videoId) {
    if (Object.keys(undoItems).length > 0) {
      setBanner({ type: 'error', text: 'Undo or wait for the current pending delete/remove action first.' });
      return;
    }
    openConfirmDialog({
      title: 'Delete video?',
      message: 'Are you sure you want to delete this video and all its materials?',
      confirmLabel: 'Delete video',
      processingLabel: 'Deleting...',
      onConfirm: () => {
        const removedIndex = videos.findIndex((video) => video._id === videoId);
        const target = removedIndex >= 0 ? videos[removedIndex] : null;
        setVideos((current) => current.filter((video) => video._id !== videoId));

        scheduleUndoPopup({
          itemId: `video-${videoId}`,
          message: `Deleting lecture${target?.title ? `: ${target.title}` : ''}`,
          commit: async () => {
            await requestJson(`/videos/${videoId}`, { method: 'DELETE' });
            await refreshData();
          },
          rollback: () => {
            if (!target) return;
            setVideos((current) => {
              if (current.some((video) => video._id === videoId)) return current;
              const next = [...current];
              const insertAt = removedIndex >= 0 ? Math.min(removedIndex, next.length) : next.length;
              next.splice(insertAt, 0, target);
              return next;
            });
          },
          successText: 'Video deleted.'
        });
      }
    });
  }

  async function handleUploadMaterial(videoId) {
    const file = uploadFiles[videoId];
    if (!file) {
      setMaterialMessages((current) => ({ ...current, [videoId]: { type: 'error', text: 'Select a PDF first.' } }));
      return;
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setMaterialMessages((current) => ({ ...current, [videoId]: { type: 'error', text: 'Only PDF files are allowed.' } }));
      return;
    }

    if (file.size > MAX_MATERIAL_MB * 1024 * 1024) {
      setMaterialMessages((current) => ({ ...current, [videoId]: { type: 'error', text: `Maximum file size is ${MAX_MATERIAL_MB}MB.` } }));
      return;
    }

    setMaterialMessages((current) => ({ ...current, [videoId]: { type: 'success', text: 'Uploading material...' } }));
    setUploadProgress((current) => ({ ...current, [videoId]: 0 }));

    try {
      await uploadMaterial(videoId, file, (percent) => {
        setUploadProgress((current) => ({ ...current, [videoId]: percent }));
      });
      setMaterialMessages((current) => ({ ...current, [videoId]: { type: 'success', text: 'Material uploaded successfully.' } }));
      setUploadFiles((current) => ({ ...current, [videoId]: null }));
      setUploadProgress((current) => ({ ...current, [videoId]: 100 }));
      await refreshData();
    } catch (error) {
      setMaterialMessages((current) => ({ ...current, [videoId]: { type: 'error', text: error.message } }));
    }
  }

  function handleRemoveMaterial(videoId, filename) {
    if (Object.keys(undoItems).length > 0) {
      setBanner({ type: 'error', text: 'Undo or wait for the current pending delete/remove action first.' });
      return;
    }
    openConfirmDialog({
      title: 'Remove material?',
      message: `Are you sure you want to remove \"${filename}\"?`,
      confirmLabel: 'Remove',
      processingLabel: 'Removing...',
      onConfirm: () => {
        const targetVideo = videos.find((video) => video._id === videoId);
        const materials = targetVideo?.materials || [];
        const removedMaterialIndex = materials.findIndex((item) => item.filename === filename);
        const removedMaterial = removedMaterialIndex >= 0 ? materials[removedMaterialIndex] : null;

        setVideos((current) => current.map((video) => (
          video._id === videoId
            ? { ...video, materials: (video.materials || []).filter((item) => item.filename !== filename) }
            : video
        )));

        scheduleUndoPopup({
          itemId: `material-${videoId}-${filename}`,
          message: `Removing material: ${filename}`,
          commit: async () => {
            await requestJson(`/videos/${videoId}/materials/${encodeURIComponent(filename)}`, { method: 'DELETE', headers: {} });
            await refreshData();
          },
          rollback: () => {
            if (!removedMaterial) return;
            setVideos((current) => current.map((video) => {
              if (video._id !== videoId) return video;
              const existing = Array.isArray(video.materials) ? video.materials : [];
              if (existing.some((item) => item.filename === filename)) return video;
              const nextMaterials = [...existing];
              const insertAt = removedMaterialIndex >= 0 ? Math.min(removedMaterialIndex, nextMaterials.length) : nextMaterials.length;
              nextMaterials.splice(insertAt, 0, removedMaterial);
              return { ...video, materials: nextMaterials };
            }));
          },
          successText: 'Material removed.'
        });
      }
    });
  }

  function handleRemoveUser(username) {
    if (Object.keys(undoItems).length > 0) {
      setBanner({ type: 'error', text: 'Undo or wait for the current pending delete/remove action first.' });
      return;
    }
    openConfirmDialog({
      title: 'Remove user?',
      message: `Are you sure you want to remove user \"${username}\"? This user will not be able to login again.`,
      confirmLabel: 'Remove user',
      processingLabel: 'Removing...',
      onConfirm: () => {
        const removedIndex = students.findIndex((student) => student.username === username);
        const removedUser = removedIndex >= 0 ? students[removedIndex] : null;
        setStudents((current) => current.filter((student) => student.username !== username));

        scheduleUndoPopup({
          itemId: `user-${username}`,
          message: `Removing user: ${username}`,
          commit: async () => {
            await requestJson(`/auth/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
            await refreshData();
          },
          rollback: () => {
            if (!removedUser) return;
            setStudents((current) => {
              if (current.some((student) => student.username === username)) return current;
              const next = [...current];
              const insertAt = removedIndex >= 0 ? Math.min(removedIndex, next.length) : next.length;
              next.splice(insertAt, 0, removedUser);
              return next;
            });
          },
          successText: `User ${username} removed successfully.`
        });
      }
    });
  }

  function handleDeleteFeedback(feedbackItem) {
    const feedbackId = feedbackItem?._id || feedbackItem?.id;
    const username = feedbackItem?.username;
    openConfirmDialog({
      title: 'Delete feedback?',
      message: `Delete feedback from "${username}"?`,
      confirmLabel: 'Delete feedback',
      processingLabel: 'Deleting feedback...',
      onConfirm: async () => {
        if (!feedbackId) throw new Error('Feedback id missing.');
        await requestJson(`/feedback/${encodeURIComponent(feedbackId)}`, { method: 'DELETE' });
        setFeedback((current) => current.filter((item) => {
          const itemId = item._id || item.id;
          return itemId !== feedbackId;
        }));
        setBanner({ type: 'success', text: 'Feedback deleted.' });
      }
    });
  }

  function handleLogout() {
    clearSession();
    navigate('/', { replace: true });
  }

  async function handleAdminAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('avatar', file);
    setIsAdminAvatarUploading(true);
    try {
      const response = await requestJson('/auth/admin/me/avatar', {
        method: 'POST',
        body: formData
      });
      setAdminProfile(response.admin);
      setBanner({ type: 'success', text: response.message || 'Admin profile photo updated successfully.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to update admin profile photo.' });
    } finally {
      setIsAdminAvatarUploading(false);
      event.target.value = '';
    }
  }

  async function handleDeleteAdminAvatar() {
    setIsAdminAvatarUploading(true);
    try {
      const response = await requestJson('/auth/admin/me/avatar', {
        method: 'DELETE'
      });
      setAdminProfile(response.admin);
      setBanner({ type: 'success', text: response.message || 'Admin profile photo removed successfully.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to remove admin profile photo.' });
    } finally {
      setIsAdminAvatarUploading(false);
    }
  }

  async function handleSaveAdminProfile(event) {
    event.preventDefault();
    if (adminProfileForm.password && adminProfileForm.password !== adminProfileForm.confirmPassword) {
      setAdminProfileMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    setIsSavingAdminProfile(true);
    setAdminProfileMessage(null);
    try {
      const payload = {
        username: adminProfileForm.username.trim()
      };
      if (adminProfileForm.password.trim()) {
        payload.password = adminProfileForm.password;
      }

      const response = await requestJson('/auth/admin/me', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      setAdminProfile(response.admin);
      setAdminProfileForm({ username: response.admin.username || '', password: '', confirmPassword: '' });

      const currentSession = getSession();
      if (response.token && currentSession?.role === 'admin') {
        setSession({
          role: 'admin',
          username: response.admin.username,
          token: response.token
        });
      }

      setAdminProfileMessage({ type: 'success', text: response.message || 'Admin profile updated successfully.' });
    } catch (error) {
      setAdminProfileMessage({ type: 'error', text: error.message || 'Failed to update admin profile.' });
    } finally {
      setIsSavingAdminProfile(false);
    }
  }

  async function handleSaveCoursePrice(courseName) {
    const statusKey = getPricingStatusKey(courseName);
    const form = priceFormByCourse[courseName] || { proAmountRupees: '0', eliteAmountRupees: '0', active: true };
    const proRupees = Number(form.proAmountRupees || 0);
    const eliteRupees = Number(form.eliteAmountRupees || 0);
    if (!Number.isFinite(proRupees) || proRupees < 0 || !Number.isFinite(eliteRupees) || eliteRupees < 0) {
      setPricingInlineStatus(statusKey, 'error', 'Invalid amount');
      setBanner({ type: 'error', text: `Invalid price for ${courseName}.` });
      return;
    }
    setIsSavingPricing(true);
    try {
      await saveCoursePricingAdmin(courseName, {
        proPriceInPaise: Math.round(proRupees * 100),
        elitePriceInPaise: Math.round(eliteRupees * 100),
        currency: 'INR',
        active: form.active !== false
      });
      await loadPaymentSettings();
      if (expandedPricingCourse === courseName) {
        await loadModulePricing(courseName);
      }
      setPricingInlineStatus(statusKey, 'success', 'Saved');
      setBanner({ type: 'success', text: `Bundle pricing saved for ${courseName}.` });
    } catch (error) {
      setPricingInlineStatus(statusKey, 'error', error.message || 'Save failed');
      setBanner({ type: 'error', text: error.message || 'Failed to save pricing.' });
    } finally {
      setIsSavingPricing(false);
    }
  }

  async function loadModulePricing(courseName) {
    try {
      const res = await fetchModulePricingAdmin(courseName);
      const modules = res?.modules || [];
      const priceFormByModule = {};
      modules.forEach((m) => {
        priceFormByModule[m.moduleName] = {
          proAmountRupees: String(Number(m.proPriceInPaise || 0) / 100),
          eliteAmountRupees: String(Number(m.elitePriceInPaise || 0) / 100),
          active: m.active !== false
        };
      });
      setModulePricingByCourse((prev) => ({
        ...prev,
        [courseName]: { modules, priceFormByModule }
      }));
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load module pricing.' });
    }
  }

  async function handleSaveModulePrice(courseName, moduleName) {
    const statusKey = getPricingStatusKey(courseName, moduleName);
    const courseData = modulePricingByCourse[courseName];
    const form = courseData?.priceFormByModule?.[moduleName] || { proAmountRupees: '0', eliteAmountRupees: '0', active: true };
    const proRupees = Number(form.proAmountRupees || 0);
    const eliteRupees = Number(form.eliteAmountRupees || 0);
    if (!Number.isFinite(proRupees) || proRupees < 0 || !Number.isFinite(eliteRupees) || eliteRupees < 0) {
      setPricingInlineStatus(statusKey, 'error', 'Invalid amount');
      setBanner({ type: 'error', text: `Invalid price for module ${moduleName}.` });
      return;
    }
    setIsSavingModulePrice(true);
    try {
      const payload = {
        proPriceInPaise: Math.round(proRupees * 100),
        elitePriceInPaise: Math.round(eliteRupees * 100),
        currency: 'INR',
        active: form.active !== false
      };
      await saveModulePricingAdmin(courseName, moduleName, payload);
      // Immediately update form state with saved values to show confirmation
      setModulePricingByCourse((prev) => {
        const courseData = prev[courseName] || { modules: [], priceFormByModule: {} };
        return {
          ...prev,
          [courseName]: {
            ...courseData,
            priceFormByModule: {
              ...courseData.priceFormByModule,
              [moduleName]: {
                proAmountRupees: String(payload.proPriceInPaise / 100),
                eliteAmountRupees: String(payload.elitePriceInPaise / 100),
                active: payload.active
              }
            }
          }
        };
      });
      // Refresh full list to catch any normalization or new module additions
      await loadModulePricing(courseName);
      setPricingInlineStatus(statusKey, 'success', 'Saved');
      setBanner({ type: 'success', text: `Pricing saved for ${moduleName}.` });
    } catch (error) {
      setPricingInlineStatus(statusKey, 'error', error.message || 'Save failed');
      setBanner({ type: 'error', text: error.message || 'Failed to save module pricing.' });
    } finally {
      setIsSavingModulePrice(false);
    }
  }

  async function handleSaveAllModulePrices(courseName) {
    const courseData = modulePricingByCourse[courseName];
    const modulesToSave = (courseData?.modules || []).filter((mod) => !mod.isBundle);

    if (!modulesToSave.length) {
      setBanner({ type: 'error', text: `No modules available to save for ${courseName}.` });
      return;
    }

    for (const mod of modulesToSave) {
      const form = courseData?.priceFormByModule?.[mod.moduleName] || { proAmountRupees: '0', eliteAmountRupees: '0', active: true };
      const proRupees = Number(form.proAmountRupees || 0);
      const eliteRupees = Number(form.eliteAmountRupees || 0);
      if (!Number.isFinite(proRupees) || proRupees < 0 || !Number.isFinite(eliteRupees) || eliteRupees < 0) {
        setBanner({ type: 'error', text: `Invalid price for module ${mod.moduleName}.` });
        return;
      }
    }

    setIsSavingModulePrice(true);
    try {
      await Promise.all(
        modulesToSave.map((mod) => {
          const form = courseData?.priceFormByModule?.[mod.moduleName] || { proAmountRupees: '0', eliteAmountRupees: '0', active: true };
          return saveModulePricingAdmin(courseName, mod.moduleName, {
            proPriceInPaise: Math.round(Number(form.proAmountRupees || 0) * 100),
            elitePriceInPaise: Math.round(Number(form.eliteAmountRupees || 0) * 100),
            currency: 'INR',
            active: form.active !== false
          });
        })
      );

      await loadModulePricing(courseName);
      modulesToSave.forEach((mod) => {
        setPricingInlineStatus(getPricingStatusKey(courseName, mod.moduleName), 'success', 'Saved');
      });
      setBanner({ type: 'success', text: `Saved pricing for all modules in ${courseName}.` });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || `Failed to save module pricing for ${courseName}.` });
    } finally {
      setIsSavingModulePrice(false);
    }
  }

  function updateModulePriceForm(courseName, moduleName, field, value) {
    clearPricingSaveStatus(getPricingStatusKey(courseName, moduleName));
    setModulePricingByCourse((prev) => {
      const courseData = prev[courseName] || { modules: [], priceFormByModule: {} };
      return {
        ...prev,
        [courseName]: {
          ...courseData,
          priceFormByModule: {
            ...courseData.priceFormByModule,
            [moduleName]: {
              ...(courseData.priceFormByModule[moduleName] || {}),
              [field]: value
            }
          }
        }
      };
    });
  }

  async function handleCreateVoucher(event) {
    event.preventDefault();
    const code = String(voucherForm.code || '').trim().toUpperCase();
    const rawDiscountValue = Number(voucherForm.discountValue || 0);
    const discountValue = voucherForm.discountType === 'fixed'
      ? Math.round(rawDiscountValue * 100)
      : rawDiscountValue;
    if (!code || !discountValue) {
      setBanner({ type: 'error', text: 'Voucher code and discount value are required.' });
      return;
    }

    setIsSavingVoucher(true);
    try {
      await createVoucherAdmin({
        code,
        description: voucherForm.description,
        discountType: voucherForm.discountType,
        discountValue,
        maxDiscountInPaise: voucherForm.maxDiscountInPaise ? Math.round(Number(voucherForm.maxDiscountInPaise) * 100) : null,
        usageLimit: voucherForm.usageLimit ? Number(voucherForm.usageLimit) : null,
        validUntil: voucherForm.validUntil || null,
        applicableCourses: voucherForm.applicableCourses
      });
      setVoucherForm({
        code: '',
        description: '',
        discountType: 'percent',
        discountValue: '',
        maxDiscountInPaise: '',
        usageLimit: '',
        validUntil: '',
        applicableCourses: []
      });
      await loadPaymentSettings();
      setBanner({ type: 'success', text: 'Voucher created successfully.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to create voucher.' });
    } finally {
      setIsSavingVoucher(false);
    }
  }

  async function handleToggleVoucher(voucherId, active) {
    try {
      await updateVoucherAdmin(voucherId, { active });
      await loadPaymentSettings();
      setBanner({ type: 'success', text: active ? 'Voucher activated.' : 'Voucher disabled.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to update voucher.' });
    }
  }

  async function handleDeleteVoucher(voucherId, code) {
    if (!window.confirm(`Delete voucher "${code}"? This cannot be undone.`)) return;
    try {
      await deleteVoucherAdmin(voucherId);
      await loadPaymentSettings();
      setBanner({ type: 'success', text: 'Voucher deleted.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to delete voucher.' });
    }
  }

  async function loadPaymentHistory(page = 1, filter = paymentHistoryFilter) {
    setPaymentHistoryLoading(true);
    try {
      const res = await fetchPaymentHistoryAdmin({ page, limit: 20, ...filter });
      const payments = Array.isArray(res?.payments) ? res.payments : [];
      const normalizedTotal = Number.isFinite(Number(res?.pagination?.total))
        ? Number(res.pagination.total)
        : Number.isFinite(Number(res?.total))
          ? Number(res.total)
          : payments.length;
      const total = Math.max(normalizedTotal, payments.length);
      const limit = Number.isFinite(Number(res?.pagination?.limit))
        ? Number(res.pagination.limit)
        : 20;
      const totalPages = Number.isFinite(Number(res?.pagination?.totalPages))
        ? Number(res.pagination.totalPages)
        : Math.max(1, Math.ceil(total / Math.max(1, limit)));
      const currentPage = Number.isFinite(Number(res?.pagination?.page))
        ? Number(res.pagination.page)
        : page;

      setPaymentHistory(payments);
      setPaymentHistoryPagination({ page: currentPage, totalPages, total });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load payment history.' });
    } finally {
      setPaymentHistoryLoading(false);
    }
  }

  async function loadQuizAnalytics(category = quizAnalyticsCategory) {
    setQuizAnalyticsLoading(true);
    try {
      const res = await fetchQuizAnalyticsAdmin(category);
      setQuizAnalytics(res.analytics || []);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load quiz analytics.' });
    } finally {
      setQuizAnalyticsLoading(false);
    }
  }

  async function loadAuditLogs(page = 1, filter = auditLogFilter) {
    setAuditLogLoading(true);
    try {
      const res = await fetchAuditLogsAdmin({ page, limit: 20, ...filter });
      const logs = Array.isArray(res?.logs) ? res.logs : [];
      const normalizedTotal = Number.isFinite(Number(res?.pagination?.total))
        ? Number(res.pagination.total)
        : Number.isFinite(Number(res?.total))
          ? Number(res.total)
          : logs.length;
      const total = Math.max(normalizedTotal, logs.length);
      const limit = Number.isFinite(Number(res?.pagination?.limit))
        ? Number(res.pagination.limit)
        : 20;
      const totalPages = Number.isFinite(Number(res?.pagination?.totalPages))
        ? Number(res.pagination.totalPages)
        : Math.max(1, Math.ceil(total / Math.max(1, limit)));
      const currentPage = Number.isFinite(Number(res?.pagination?.page))
        ? Number(res.pagination.page)
        : page;

      setAuditLogs(logs);
      setAuditLogPagination({ page: currentPage, totalPages, total });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load audit logs.' });
    } finally {
      setAuditLogLoading(false);
    }
  }

  async function loadRecoveryActions(limit = 30, filter = recoveryFilter) {
    setRecoveryLoading(true);
    try {
      const res = await fetchRecoveryActionsAdmin({ limit, ...filter });
      setRecoveryActions(res.actions || []);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load recovery actions.' });
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function handleApplyRecoveryAction(log) {
    if (!log?._id) return;
    if (recoveryApplyingId) return;
    if (!log?.recovery?.supported) {
      setBanner({ type: 'error', text: log?.recovery?.reason || 'This audit action is not recoverable.' });
      return;
    }
    if (log?.recovery?.alreadyApplied) {
      setBanner({ type: 'error', text: 'This recovery action was already applied.' });
      return;
    }

    const label = log?.recovery?.label || 'Apply recovery action';
    const confirmed = window.confirm(`${label}? This will modify live data.`);
    if (!confirmed) return;

    setRecoveryApplyingId(log._id);
    try {
      const res = await applyRecoveryActionAdmin(log._id);
      setBanner({ type: 'success', text: res?.message || 'Recovery action applied.' });

      await Promise.allSettled([
        refreshData(),
        loadPaymentSettings(),
        loadAdminQuizzes(quizCategory),
        loadAuditLogs(1, auditLogFilter),
        loadRecoveryActions(30, recoveryFilter)
      ]);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to apply recovery action.' });
    } finally {
      setRecoveryApplyingId('');
    }
  }

  function scrollToSection(sectionId) {
    const node = document.getElementById(sectionId);
    if (node) {
      const topOffset = window.innerWidth <= 768 ? 84 : 112;
      const targetTop = node.getBoundingClientRect().top + window.scrollY - topOffset;
      window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    }
  }

  async function loadAdminQuizzes(category = quizCategory) {
    try {
      const [filtered, all] = await Promise.all([
        fetchAdminQuizzes(category),
        fetchAdminQuizzes('')
      ]);
      setAdminQuizzes(filtered.quizzes || []);
      setAllAdminQuizzes(all.quizzes || []);
      setAllQuizzesCount((all.quizzes || []).length);
    } catch (error) {
      setQuizMessage({ type: 'error', text: error.message });
    }
  }

  async function loadMockExamList(category = mockExamCategory) {
    try {
      const data = await fetchMockExamsAdmin(category);
      setMockExamList(data?.exams || []);
    } catch (error) {
      setMockExamMessage({ type: 'error', text: error.message || 'Failed to load monthly mock exams.' });
    }
  }

  function formatMonthLabel(monthValue) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthValue || ''))) return monthValue || 'Unknown Month';
    const [year, month] = String(monthValue).split('-');
    const parsed = new Date(Number(year), Number(month) - 1, 1);
    return parsed.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }

  async function loadMockExamPerformance(category = mockExamCategory, monthFilter = mockExamPerformanceMonthFilter) {
    setMockExamPerformanceLoading(true);
    setMockExamPerformanceError('');
    try {
      const activeMonthFilter = monthFilter === 'all' ? '' : monthFilter;
      const data = await fetchMockExamPerformanceAdmin(category, activeMonthFilter);
      setMockExamPerformance(Array.isArray(data?.performance) ? data.performance : []);
      setMockExamPerformanceMonths(Array.isArray(data?.months) ? data.months : []);
    } catch (error) {
      setMockExamPerformanceError(error.message || 'Failed to load exam performance.');
    } finally {
      setMockExamPerformanceLoading(false);
    }
  }

  function resetMockExamBuilder() {
    setEditingMockExamId('');
    setMockExamTitle('');
    setMockExamDescription('');
    setMockExamDate('');
    setMockExamWindowEndAt('');
    setMockExamDurationMinutes(60);
    setMockExamNoticeEnabled(true);
    setMockExamQuestions([{ question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' }]);
  }

  function updateMockExamQuestion(index, field, value) {
    setMockExamQuestions((current) => current.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)));
  }

  function updateMockExamOption(questionIndex, optionIndex, value) {
    setMockExamQuestions((current) => current.map((item, idx) => {
      if (idx !== questionIndex) return item;
      const nextOptions = [...item.options];
      nextOptions[optionIndex] = value;
      return { ...item, options: nextOptions };
    }));
  }

  function addMockExamQuestion() {
    setMockExamQuestions((current) => [
      ...current,
      { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' }
    ]);
  }

  function removeMockExamQuestion(index) {
    setMockExamQuestions((current) => {
      if (current.length === 1) return current;
      return current.filter((_, idx) => idx !== index);
    });
  }

  function editMockExam(exam) {
    setEditingMockExamId(exam._id);
    setMockExamCategory(exam.category || COURSE_CATEGORIES[0]);
    setMockExamTitle(exam.title || '');
    setMockExamDescription(exam.description || '');
    setMockExamDate(exam.examDate ? new Date(exam.examDate).toISOString().slice(0, 16) : '');
    setMockExamWindowEndAt(exam.examWindowEndAt ? new Date(exam.examWindowEndAt).toISOString().slice(0, 16) : '');
    setMockExamDurationMinutes(exam.durationMinutes || 60);
    setMockExamNoticeEnabled(exam.noticeEnabled !== false);
    setMockExamQuestions((exam.questions || []).map((item) => ({
      question: item.question,
      options: [...item.options],
      correctIndex: Number(item.correctIndex || 0),
      explanation: item.explanation || ''
    })));
    setMockExamMessage(null);
    setTimeout(() => scrollToSection('section-monthly-mock-exam'), 0);
  }

  async function handleSaveMockExam(event) {
    event.preventDefault();
    if (!mockExamCategory || !mockExamTitle.trim() || !mockExamDate) {
      setMockExamMessage({ type: 'error', text: 'Course, title and exam date are required.' });
      return;
    }

    const hasInvalidQuestion = mockExamQuestions.some((item) => {
      if (!item.question.trim()) return true;
      if (!Array.isArray(item.options) || item.options.length !== 4) return true;
      if (item.options.some((opt) => !opt.trim())) return true;
      return item.correctIndex < 0 || item.correctIndex > 3;
    });

    if (hasInvalidQuestion) {
      setMockExamMessage({ type: 'error', text: 'Each question must have text, 4 options and one correct answer.' });
      return;
    }

    setMockExamSaving(true);
    setMockExamMessage(null);
    try {
      await saveMockExamAdmin({
        examId: editingMockExamId || undefined,
        category: mockExamCategory,
        title: mockExamTitle.trim(),
        description: mockExamDescription.trim(),
        examDate: new Date(mockExamDate).toISOString(),
        examWindowEndAt: mockExamWindowEndAt ? new Date(mockExamWindowEndAt).toISOString() : null,
        durationMinutes: Number(mockExamDurationMinutes || 60),
        noticeEnabled: mockExamNoticeEnabled,
        questions: mockExamQuestions.map((item) => ({
          question: item.question.trim(),
          options: item.options.map((opt) => opt.trim()),
          correctIndex: Number(item.correctIndex),
          explanation: String(item.explanation || '').trim()
        }))
      });
      setMockExamMessage({ type: 'success', text: editingMockExamId ? 'Mock exam updated.' : 'Mock exam created.' });
      resetMockExamBuilder();
      await loadMockExamList(mockExamCategory);
    } catch (error) {
      setMockExamMessage({ type: 'error', text: error.message || 'Failed to save mock exam.' });
    } finally {
      setMockExamSaving(false);
    }
  }

  async function handleToggleMockResultRelease(exam) {
    try {
      await releaseMockExamResultAdmin(exam._id, !exam.resultReleased);
      await loadMockExamList(mockExamCategory);
      setMockExamMessage({ type: 'success', text: !exam.resultReleased ? 'Result released.' : 'Result hidden.' });
    } catch (error) {
      setMockExamMessage({ type: 'error', text: error.message || 'Failed to update result release.' });
    }
  }

  async function handleToggleMockNotice(exam) {
    try {
      await toggleMockExamNoticeAdmin(exam._id, !(exam.noticeEnabled !== false));
      await loadMockExamList(mockExamCategory);
      setMockExamMessage({ type: 'success', text: exam.noticeEnabled !== false ? 'Student notice banner disabled.' : 'Student notice banner enabled.' });
    } catch (error) {
      setMockExamMessage({ type: 'error', text: error.message || 'Failed to update exam notice setting.' });
    }
  }

  async function loadAnnouncements() {
    try {
      const data = await fetchAdminAnnouncements();
      setAnnouncementList(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch (error) {
      setAnnouncementInlineMessage({ type: 'error', text: error.message || 'Failed to load announcements.' });
    }
  }

  async function handleCreateAnnouncement(event) {
    event.preventDefault();
    const title = announcementTitle.trim();
    const message = announcementMessage.trim();
    if (!title || !message) {
      setAnnouncementInlineMessage({ type: 'error', text: 'Announcement title and message are required.' });
      return;
    }

    setAnnouncementSaving(true);
    setAnnouncementInlineMessage(null);
    try {
      await createAnnouncementAdmin({ title, message, isActive: true });
      setAnnouncementTitle('');
      setAnnouncementMessage('');
      setAnnouncementInlineMessage({ type: 'success', text: 'Announcement published.' });
      await loadAnnouncements();
    } catch (error) {
      setAnnouncementInlineMessage({ type: 'error', text: error.message || 'Failed to publish announcement.' });
    } finally {
      setAnnouncementSaving(false);
    }
  }

  async function handleToggleAnnouncementStatus(item) {
    try {
      await updateAnnouncementAdmin(item._id, !(item.isActive !== false));
      await loadAnnouncements();
      setAnnouncementInlineMessage({
        type: 'success',
        text: item.isActive !== false ? 'Announcement hidden from students.' : 'Announcement enabled for students.'
      });
    } catch (error) {
      setAnnouncementInlineMessage({ type: 'error', text: error.message || 'Failed to update announcement status.' });
    }
  }

  async function handleDeleteAnnouncement(item) {
    try {
      await deleteAnnouncementAdmin(item._id);
      await loadAnnouncements();
      setAnnouncementInlineMessage({ type: 'success', text: 'Announcement deleted.' });
    } catch (error) {
      setAnnouncementInlineMessage({ type: 'error', text: error.message || 'Failed to delete announcement.' });
    }
  }

  function resetQuizBuilder() {
    setEditingQuizId(null);
    setQuizModule('');
    setQuizTitle('');
    setQuizDifficulty('medium');
    setQuizRequireExplanation(false);
    setQuizTimeLimitMinutes(15);
    setQuizQuestions([{ question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' }]);
  }

  function editQuiz(quiz) {
    setEditingQuizId(quiz._id);
    setQuizCategory(quiz.category);
    setQuizModule(quiz.module);
    setQuizTitle(quiz.title);
    setQuizDifficulty(quiz.difficulty || 'medium');
    setQuizRequireExplanation(Boolean(quiz.requireExplanation));
    setQuizTimeLimitMinutes(quiz.timeLimitMinutes || 15);
    setQuizQuestions((quiz.questions || []).map((item) => ({
      question: item.question,
      options: [...item.options],
      correctIndex: item.correctIndex,
      explanation: item.explanation || ''
    })));
    setQuizMessage(null);
    setTimeout(() => {
      scrollToSection('section-quiz-builder');
    }, 0);
  }

  function handleDeleteQuiz(quiz) {
    if (Object.keys(undoItems).length > 0) {
      setQuizMessage({ type: 'error', text: 'Undo or wait for the current pending delete/remove action first.' });
      return;
    }
    openConfirmDialog({
      title: 'Delete quiz?',
      message: `Delete quiz for ${quiz.module} (${quiz.category})?`,
      confirmLabel: 'Delete quiz',
      processingLabel: 'Deleting quiz...',
      onConfirm: () => {
        const removedIndex = adminQuizzes.findIndex((item) => item._id === quiz._id);
        const removedQuiz = removedIndex >= 0 ? adminQuizzes[removedIndex] : quiz;
        const snapshotAllCount = allQuizzesCount;
        const wasEditingDeletedQuiz = editingQuizId === quiz._id;

        setAdminQuizzes((current) => current.filter((item) => item._id !== quiz._id));
        setAllQuizzesCount((current) => Math.max(0, current - 1));
        if (wasEditingDeletedQuiz) {
          resetQuizBuilder();
        }

        scheduleUndoPopup({
          itemId: `quiz-${quiz._id}`,
          message: `Deleting quiz${quiz.title ? `: ${quiz.title}` : ''}`,
          commit: async () => {
            await deleteQuiz(quiz._id);
            await loadAdminQuizzes(quizCategory);
            if (wasEditingDeletedQuiz) {
              resetQuizBuilder();
            }
          },
          rollback: () => {
            setAdminQuizzes((current) => {
              if (current.some((item) => item._id === quiz._id)) return current;
              const next = [...current];
              const insertAt = removedIndex >= 0 ? Math.min(removedIndex, next.length) : next.length;
              next.splice(insertAt, 0, removedQuiz);
              return next;
            });
            setAllQuizzesCount(snapshotAllCount);
            if (wasEditingDeletedQuiz) {
              editQuiz(quiz);
            }
          },
          successText: 'Quiz deleted.'
        });
      }
    });
  }

  useEffect(() => {
    loadAdminQuizzes(quizCategory);
  }, [quizCategory]);

  useEffect(() => {
    loadMockExamList(mockExamCategory);
  }, [mockExamCategory]);

  useEffect(() => {
    loadMockExamPerformance(mockExamCategory, mockExamPerformanceMonthFilter);
  }, [mockExamCategory, mockExamPerformanceMonthFilter]);

  useEffect(() => {
    loadAnnouncements();
  }, []);

  useEffect(() => {
    setMockExamPerformanceMonthFilter('all');
  }, [mockExamCategory]);

  useEffect(() => {
    if (mockExamPerformanceMonthFilter === 'all') return;
    if (mockExamPerformanceMonths.includes(mockExamPerformanceMonthFilter)) return;
    setMockExamPerformanceMonthFilter('all');
  }, [mockExamPerformanceMonths, mockExamPerformanceMonthFilter]);

  useEffect(() => {
    loadRecoveryActions(30, recoveryFilter);
  }, []);

  useEffect(() => {
    loadPaymentHistory(1, paymentHistoryFilter);
    loadAuditLogs(1, auditLogFilter);
  }, []);

  function openLibraryCourseView(course) {
    const search = course === 'All' ? '' : `?course=${encodeURIComponent(course)}`;
    navigate(`/admin/content-library${search}`);
  }

  function handleAdminNavItemClick(id) {
    scrollToSection(id);
  }

  const activeUserUndoEntry = Object.entries(undoItems).find(([id]) => id.startsWith('user-'));

  const modulesByCourseFromVideos = videos.reduce((acc, video) => {
    const category = video.category || 'General';
    const module = video.module || 'General';
    if (!acc[category]) acc[category] = new Set();
    acc[category].add(module);
    return acc;
  }, {});

  const modulesByCourseFromQuizzes = allAdminQuizzes.reduce((acc, quiz) => {
    const category = quiz.category || 'General';
    const module = String(quiz.module || '').trim() || 'General';
    if (!acc[category]) acc[category] = new Set();
    acc[category].add(module);
    return acc;
  }, {});

  const availableModules = Array.from(new Set([
    ...Array.from(modulesByCourseFromVideos[quizCategory] || []),
    ...Array.from(modulesByCourseFromQuizzes[quizCategory] || []),
    ...(courseModules[quizCategory] || [])
  ])).sort((a, b) => a.localeCompare(b));

  function updateQuizQuestion(index, field, value) {
    setQuizQuestions((current) => current.map((item, idx) => (
      idx === index ? { ...item, [field]: value } : item
    )));
  }

  function updateQuizOption(questionIndex, optionIndex, value) {
    setQuizQuestions((current) => current.map((item, idx) => {
      if (idx !== questionIndex) return item;
      const nextOptions = [...item.options];
      nextOptions[optionIndex] = value;
      return { ...item, options: nextOptions };
    }));
  }

  function addQuizQuestion() {
    setQuizQuestions((current) => [
      ...current,
      { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' }
    ]);
  }

  function removeQuizQuestion(index) {
    setQuizQuestions((current) => {
      if (current.length === 1) return current;
      return current.filter((_, idx) => idx !== index);
    });
  }

  async function handleSaveQuiz(event) {
    event.preventDefault();
    if (!quizCategory || !quizModule.trim() || !quizTitle.trim()) {
      setQuizMessage({ type: 'error', text: 'Category, module and title are required.' });
      return;
    }

    const hasInvalidQuestion = quizQuestions.some((item) => {
      if (!item.question.trim()) return true;
      if (!Array.isArray(item.options) || item.options.length !== 4) return true;
      if (item.options.some((opt) => !opt.trim())) return true;
      if (quizRequireExplanation && !String(item.explanation || '').trim()) return true;
      return item.correctIndex < 0 || item.correctIndex > 3;
    });

    if (hasInvalidQuestion) {
      setQuizMessage({ type: 'error', text: quizRequireExplanation
        ? 'Each question must include text, 4 options, one correct answer, and explanation.'
        : 'Each question must include text, 4 options, and one correct answer.' });
      return;
    }

    setQuizSaving(true);
    setQuizMessage(null);
    try {
      const normalizedModule = quizModule.trim();
      await saveModuleQuiz({
        quizId: editingQuizId || undefined,
        category: quizCategory,
        module: normalizedModule,
        title: quizTitle.trim(),
        difficulty: quizDifficulty,
        requireExplanation: quizRequireExplanation,
        timeLimitMinutes: Number(quizTimeLimitMinutes),
        questions: quizQuestions.map((item) => ({
          question: item.question.trim(),
          options: item.options.map((opt) => opt.trim()),
          correctIndex: Number(item.correctIndex),
          explanation: item.explanation ? item.explanation.trim() : ''
        }))
      });
      setQuizMessage({
        type: 'success',
        text: editingQuizId
          ? `Quiz updated for ${normalizedModule} (${quizCategory}).`
          : `Quiz saved for ${normalizedModule} (${quizCategory}).`
      });
      resetQuizBuilder();
      await loadAdminQuizzes(quizCategory);
    } catch (error) {
      setQuizMessage({ type: 'error', text: error.message });
    } finally {
      setQuizSaving(false);
    }
  }

  const adminNavItems = [
    { id: 'section-live-class', label: 'Live Class', icon: '🔴' },
    { id: 'section-course-manager', label: 'Course Manager', icon: '📚' },
    { id: 'section-registered-users', label: 'Learners', icon: '👥' },
    { id: 'section-content-library', label: 'Content Library', icon: '🎬' },
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
    { id: 'section-quiz-builder', label: 'Quiz Builder', icon: '📝' },
    { id: 'section-monthly-mock-exam', label: 'Monthly Exam', icon: '📅' },
    { id: 'section-test-series', label: 'Test Series', icon: '🧪' },
    { id: 'section-announcements', label: 'Announcements', icon: '📢' },
    { id: 'section-payment-settings', label: 'Payments', icon: '💳' },
    { id: 'section-payment-history', label: 'Pay History', icon: '📊' },
    { id: 'section-quiz-analytics', label: 'Quiz Analytics', icon: '🏆' },
    { id: 'section-audit-log', label: 'Audit Log', icon: '🛡️' },
    { id: 'section-recovery-center', label: 'Recovery', icon: '♻️' },
    { id: 'section-feedback', label: 'Feedback', icon: '💬' }
  ];

  const rawAdminAvatarUrl = String(adminProfile?.avatarUrl || '').trim();
  const adminAvatarUrl = rawAdminAvatarUrl
    ? (/^https?:\/\//i.test(rawAdminAvatarUrl) ? rawAdminAvatarUrl : `${getApiBase()}${rawAdminAvatarUrl}`)
    : '';
  const adminInitial = (adminProfile?.username || 'A').trim().charAt(0).toUpperCase();
  const isCsirModuleFlow = selectedCourse === CSIR_COURSE;
  const topicBucketKey = getTopicBucketKey(selectedCourse, selectedModule);
  const currentModuleTopics = moduleTopicsByKey[topicBucketKey] || [];
  const selectedCourseTheme = COURSE_MODAL_THEME[selectedCourse] || COURSE_MODAL_THEME['11th'];
  const courseModalStyle = {
    '--course-modal-accent': selectedCourseTheme.accent,
    '--course-modal-accent-alt': selectedCourseTheme.accentAlt,
    '--course-modal-glow-a': selectedCourseTheme.glowA,
    '--course-modal-glow-b': selectedCourseTheme.glowB
  };
  const courseModalSteps = [
    { id: 'module', label: 'Module' },
    { id: 'topic', label: 'Topic' },
    { id: 'upload', label: 'Upload' }
  ];
  const activeCourseModalStepIndex = courseModalSteps.findIndex((step) => step.id === modalStep);

  return (
    <AppShell
      title="Admin Dashboard"
      roleLabel="Admin"
      showThemeSwitch={false}
      refreshOnBrandIconClick
      navTitle="Admin Sections"
      navItems={adminNavItems}
      onNavItemClick={handleAdminNavItemClick}
      actions={(
        <div className="profile-trigger-wrap">
          <button
            type="button"
            className="profile-icon-btn"
            onClick={() => setAdminProfileOpen(true)}
            aria-label="Open admin profile settings"
            title="Admin profile settings"
          >
            {adminAvatarUrl ? (
              <img src={adminAvatarUrl} alt="Admin profile" className="profile-icon-image" />
            ) : (
              <span className="profile-icon-fallback">{adminInitial}</span>
            )}
          </button>
          <div className="profile-hover-card" aria-hidden="true">
            <strong>{adminProfile?.username || 'Admin'}</strong>
            <span>Administrator</span>
            <button
              type="button"
              className="profile-theme-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${isLightTheme ? 'Dark' : 'Light'} theme`}
            >
              {isLightTheme ? 'Switch to Dark' : 'Switch to Light'}
            </button>
            <button
              type="button"
              className="profile-theme-btn profile-quick-logout-btn"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </div>
      )}
    >
      {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

      <section className="dashboard-grid admin-grid">
        {/* ── Live Class Section ──────────────────────────── */}
        <section id="section-live-class" className="card live-class-admin-card">
          <div className="live-class-header">
            <h2>🔴 Live Class</h2>
            {liveClass ? (
              <span className="live-badge pulsing">LIVE NOW</span>
            ) : (
              <span className="live-badge offline">OFFLINE</span>
            )}
          </div>

          {!liveClass ? (
            <div className="live-class-start-panel">
              <p className="subtitle">Create a Google Meet, paste the link below, then start the session. Students see a join button within 5 seconds.</p>
              <div className="live-class-form">
                <div className="live-class-form-row">
                  <label className="live-field-label">
                    Class title
                    <input
                      type="text"
                      className="live-class-title-input"
                      placeholder="e.g. Cell Biology – Chapter 3"
                      value={liveClassTitle}
                      onChange={(e) => setLiveClassTitle(e.target.value)}
                      maxLength={100}
                    />
                  </label>
                  <label className="live-field-label">
                    Google Meet link
                    <input
                      type="url"
                      className="live-class-title-input meet-url-input"
                      placeholder="https://meet.google.com/abc-defg-hij"
                      value={liveClassMeetUrl}
                      onChange={(e) => setLiveClassMeetUrl(e.target.value)}
                    />
                  </label>
                </div>
                <div className="live-class-form-actions">
                  <button
                    type="button"
                    className="primary-btn live-start-btn"
                    onClick={handleStartClass}
                    disabled={isStartingClass || !liveClassMeetUrl.trim()}
                  >
                    {isStartingClass ? 'Starting…' : '🟢 Go Live'}
                  </button>
                  <a
                    href="https://meet.google.com/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="secondary-btn meet-new-link"
                  >
                    📹 Create Google Meet
                  </a>
                </div>
                <p className="live-help-text">
                  Don’t have a link yet?
                  Click “Create Google Meet” → copy the link → paste it above.
                </p>
              </div>

              {/* ── Schedule a class ── */}
{/* ── Schedule a class ── */}
              <div className="schedule-class-section">
                <div className="schedule-section-header">
                  <div>
                    <h3 className="schedule-section-title">📅 Schedule a Class</h3>
                    <p className="schedule-section-sub">Students see a countdown banner before the class starts.</p>
                  </div>
                  {!showScheduleForm && !scheduledClass && (
                    <button type="button" className="secondary-btn schedule-toggle-btn" onClick={() => setShowScheduleForm(true)}>
                      + Schedule
                    </button>
                  )}
                </div>

                {scheduledClass ? (
                  <div className="scheduled-class-card">
                    <div className="scheduled-card-icon">📅</div>
                    <div className="scheduled-card-info">
                      <strong className="scheduled-card-title">{scheduledClass.title}</strong>
                      <span className="scheduled-card-time">
                        {new Date(scheduledClass.scheduledAt).toLocaleString([], {
                          weekday: 'short', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                      {scheduledClass.meetUrl && (
                        <a href={scheduledClass.meetUrl} target="_blank" rel="noopener noreferrer" className="scheduled-card-url">
                          {scheduledClass.meetUrl}
                        </a>
                      )}
                    </div>
                    <button
                      type="button"
                      className="danger-btn schedule-cancel-btn"
                      onClick={handleCancelSchedule}
                      disabled={isCancellingSchedule}
                    >
                      {isCancellingSchedule ? 'Cancelling…' : '✕ Cancel'}
                    </button>
                  </div>
                ) : showScheduleForm ? (
                  <form className="schedule-form" onSubmit={handleScheduleClass}>
                    <div className="schedule-form-row">
                      <label className="live-field-label">
                        Class title
                        <input
                          type="text"
                          className="live-class-title-input"
                          placeholder="e.g. Cell Biology – Chapter 3"
                          value={scheduleForm.title}
                          onChange={(e) => setScheduleForm((p) => ({ ...p, title: e.target.value }))}
                          maxLength={100}
                        />
                      </label>
                      <label className="live-field-label">
                        Google Meet link <span className="schedule-optional-label">(optional — can add later)</span>
                        <input
                          type="url"
                          className="live-class-title-input"
                          placeholder="https://meet.google.com/abc-defg-hij"
                          value={scheduleForm.meetUrl}
                          onChange={(e) => setScheduleForm((p) => ({ ...p, meetUrl: e.target.value }))}
                        />
                      </label>
                    </div>
                    <div className="schedule-form-row">
                      <label className="live-field-label">
                        Date
                        <input
                          type="date"
                          className="live-class-title-input"
                          value={scheduleForm.date}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={(e) => setScheduleForm((p) => ({ ...p, date: e.target.value }))}
                          required
                        />
                      </label>
                      <label className="live-field-label">
                        Time
                        <input
                          type="time"
                          className="live-class-title-input"
                          value={scheduleForm.time}
                          onChange={(e) => setScheduleForm((p) => ({ ...p, time: e.target.value }))}
                          required
                        />
                      </label>
                    </div>
                    <div className="live-class-form-actions">
                      <button type="submit" className="primary-btn" disabled={isScheduling || !scheduleForm.date || !scheduleForm.time}>
                        {isScheduling ? 'Scheduling…' : '📅 Set Schedule'}
                      </button>
                      <button type="button" className="secondary-btn" onClick={() => { setShowScheduleForm(false); setScheduleForm({ title: '', meetUrl: '', date: '', time: '' }); }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="live-class-active-panel">
              <div className="live-class-info-bar">
                <div className="live-class-info-text">
                  <strong className="live-class-title-display">{liveClass.title}</strong>
                  <span className="live-class-since">⏰ Started at {new Date(liveClass.startedAt).toLocaleTimeString()}</span>
                </div>
                <div className="live-class-controls">
                  <a
                    href={liveClass.meetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="primary-btn meet-open-btn"
                  >
                    📹 Open Google Meet
                  </a>
                  <button
                    type="button"
                    className="danger-btn"
                    onClick={handleEndClass}
                    disabled={isEndingClass}
                  >
                    {isEndingClass ? 'Ending…' : '⏹️ End Class'}
                  </button>
                </div>
              </div>
              <div className="live-meet-info-box">
                <span className="live-meet-url-label">Meet link shared with students:</span>
                <a
                  href={liveClass.meetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="live-meet-url-text"
                >
                  {liveClass.meetUrl}
                </a>
              </div>
            </div>
          )}
        </section>

        <section id="section-community-chat" className="card quiz-builder-panel quiz-builder-section admin-workspace-link-card community-link-card">
          <div className="section-header compact quiz-builder-heading-row">
            <div>
              <p className="eyebrow section-live-eyebrow">
                Community Space
                <span className="live-badge" aria-hidden="true">
                  <span className="live-badge-dot" />
                  LIVE
                </span>
              </p>
              <h2>Live student-admin community chat</h2>
              <p className="subtitle">Join the real-time room where admins and students can discuss doubts and updates together.</p>
            </div>
            <div className="quiz-count-cards">
              <StatCard label="Mode" value="Live" />
              <StatCard label="Access" value="All" />
            </div>
          </div>
          <div className="workspace-link-actions">
            <button type="button" className="primary-btn" onClick={() => navigate('/admin/community-chat')}>
              Open Community Chat
            </button>
            <button
              type="button"
              className="danger-btn"
              onClick={handleClearCommunityChatClick}
              disabled={isClearingCommunityChat}
            >
              {isClearingCommunityChat ? 'Clearing...' : 'Clear All Chat Messages'}
            </button>
            <button
              type="button"
              className="danger-btn"
              onClick={handleClearAiTutorHistoryClick}
              disabled={isClearingAiTutorHistory}
            >
              {isClearingAiTutorHistory ? 'Clearing...' : 'Clear All AI Tutor History'}
            </button>
          </div>
        </section>

        <div className="admin-after-community-grid">
          <section id="section-course-manager" className="card compose-card course-manager-card">
            <h2>Course categories</h2>
            <p className="subtitle">Tap a course to add lectures &amp; notes.</p>
            <div className="course-grid">
              {COURSE_CATEGORIES.map((course) => {
                const meta = COURSE_META[course] || { icon: '\ud83d\udcda', color: '#6b7280' };
                const lectureCount = videos.filter((v) => (v.category || 'General') === course).length;
                const moduleCount = getModulesForCourse(course).length;
                return (
                  <button
                    key={course}
                    type="button"
                    className="course-tile"
                    style={{ '--tile-accent': meta.color }}
                    onClick={() => navigate(`/admin/course-workspace/${encodeURIComponent(course)}`)}
                  >
                    <span className="course-tile-icon">{meta.icon}</span>
                    <span className="course-tile-body">
                      <span className="course-tile-label">{course}</span>
                      <span className="course-tile-count">
                        {moduleCount} {moduleCount === 1 ? 'module' : 'modules'} · {lectureCount} {lectureCount === 1 ? 'lecture' : 'lectures'}
                      </span>
                    </span>
                    <span className="course-tile-plus" aria-hidden="true">+</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section id="section-registered-users" className="card table-card registered-learners-card">
            <div className="section-header" style={{ marginTop: 0 }}>
              <div>
                <p className="eyebrow">Students</p>
                <h2>Registered learners</h2>
              </div>
              <StatCard label="Total Students" value={students.length} />
            </div>
            {activeUserUndoEntry ? (
              <div className="section-undo-alert" role="status" aria-live="polite">
                <span className="undo-message">
                  {Math.ceil(Math.max(0, activeUserUndoEntry[1].remainingMs || 0) / 1000)}s - {activeUserUndoEntry[1].message}
                </span>
                <button type="button" className="secondary-btn undo-btn" onClick={() => handleUndoAction(activeUserUndoEntry[0])}>
                  Undo
                </button>
              </div>
            ) : null}
            <div className="student-cards-scroll">
              <div className="student-cards-grid">
                {students.length ? students.map((student) => {
                  const initial = (student.username || '?')[0].toUpperCase();
                  const undoItem = undoItems[`user-${student.username}`];
                  return (
                    <div key={`${student.username}-${student.phone}`} className="student-card">
                      <div className="student-card-avatar">{initial}</div>
                      <div className="student-card-info">
                        <span className="student-card-name">{student.username}</span>
                        <div className="student-card-meta">
                          {student.class ? <span className="student-course-badge">{student.class}</span> : null}
                          {student.city ? <span className="student-city">📍 {student.city}</span> : null}
                        </div>
                        {student.phone ? <span className="student-card-phone">📞 {student.phone}</span> : null}
                      </div>
                      {undoItem ? (
                        <div className="student-card-undo">
                          <span className="undo-timer">{undoItem.remainingMs > 0 ? Math.ceil(undoItem.remainingMs / 1000) : '0'}s</span>
                          <button
                            type="button"
                            className="secondary-btn undo-btn"
                            onClick={() => handleUndoAction(`user-${student.username}`)}
                            aria-label={`Undo removal of ${student.username}`}
                            title="Undo removal"
                          >
                            Undo
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="student-remove-btn"
                          onClick={() => handleRemoveUser(student.username)}
                          disabled={Object.keys(undoItems).length > 0}
                          aria-label={`Remove ${student.username}`}
                          title="Remove user"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                }) : (
                  <p className="empty-state">No students registered yet.</p>
                )}
              </div>
            </div>
          </section>
        </div>
      </section>

      <section id="section-content-library" className="card content-library-card is-overview">
        <div className="section-header content-library-header">
          <div>
            <p className="eyebrow">Content Library</p>
            <h2>Uploaded lectures</h2>
            <p className="subtitle">Choose a course and open uploaded contents in a dedicated page view.</p>
          </div>
          <div className="quiz-count-cards">
            <StatCard label="Total Lectures" value={videos.length} />
            <StatCard label="Courses With Content" value={COURSE_CATEGORIES.filter((course) => videos.some((v) => (v.category || 'General') === course)).length} />
          </div>
        </div>

        <div className="library-course-selector" role="list" aria-label="Select course to open uploaded contents">
          {COURSE_CATEGORIES.map((course) => {
            const meta = COURSE_META[course] || { icon: '📚', color: '#6b7280' };
            const lectureCount = videos.filter((video) => (video.category || 'General') === course).length;
            const moduleCount = Array.from(new Set(videos
              .filter((video) => (video.category || 'General') === course)
              .map((video) => String(video.module || 'General')))).length;

            return (
              <button
                key={`library-${course}`}
                type="button"
                className="course-tile library-course-tile"
                style={{ '--tile-accent': meta.color }}
                onClick={() => openLibraryCourseView(course)}
                role="listitem"
              >
                <span className="course-tile-icon">{meta.icon}</span>
                <span className="course-tile-body">
                  <span className="course-tile-label">{course}</span>
                  <span className="course-tile-count">
                    {moduleCount} {moduleCount === 1 ? 'module' : 'modules'} · {lectureCount} {lectureCount === 1 ? 'lecture' : 'lectures'}
                  </span>
                </span>
                <span className="course-tile-plus" aria-hidden="true">→</span>
              </button>
            );
          })}

          <button
            type="button"
            className="course-tile library-course-tile library-course-all"
            style={{ '--tile-accent': '#6366f1' }}
            onClick={() => openLibraryCourseView('All')}
            role="listitem"
          >
            <span className="course-tile-icon">🎬</span>
            <span className="course-tile-body">
              <span className="course-tile-label">All Uploaded Contents</span>
              <span className="course-tile-count">Browse all courses in one list</span>
            </span>
            <span className="course-tile-plus" aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <section id="section-quiz-builder" className="card quiz-builder-panel quiz-builder-section admin-workspace-link-card quiz-link-card">
        <div className="section-header compact quiz-builder-heading-row">
          <div>
            <p className="eyebrow">Quiz Builder</p>
            <h2>Chapter-wise quiz workspace</h2>
            <p className="subtitle">Open the dedicated page to choose class, set quiz details and build question sets in a cleaner UI.</p>
          </div>
          <div className="quiz-count-cards">
            <StatCard label={`${quizCategory} Quizzes`} value={adminQuizzes.length} />
            <StatCard label="Total Quizzes" value={allQuizzesCount} />
          </div>
        </div>
        <div className="workspace-link-actions">
          <button type="button" className="primary-btn" onClick={() => navigate('/admin/quiz-builder')}>
            Open Quiz Workspace
          </button>
        </div>
      </section>

      <section id="section-monthly-mock-exam" className="card quiz-builder-panel quiz-builder-section admin-workspace-link-card mock-link-card">
        <div className="section-header compact quiz-builder-heading-row">
          <div>
            <p className="eyebrow">Monthly Mock Test</p>
            <h2>Monthly exam workspace</h2>
            <p className="subtitle">Open the dedicated page to choose class, set exam details and add questions with a focused layout.</p>
          </div>
          <div className="quiz-count-cards">
            <StatCard label={`${mockExamCategory} Exams`} value={mockExamList.length} />
            <StatCard label="Performance Rows" value={mockExamPerformance.length} />
          </div>
        </div>
        <div className="workspace-link-actions">
          <button type="button" className="primary-btn" onClick={() => navigate('/admin/mock-exams')}>
            Open Monthly Exam Workspace
          </button>
        </div>
      </section>

      <section id="section-test-series" className="card quiz-builder-panel quiz-builder-section admin-workspace-link-card ts-link-card">
        <div className="section-header compact quiz-builder-heading-row">
          <div>
            <p className="eyebrow">Test Series</p>
            <h2>Test Series workspace</h2>
            <p className="subtitle">Create topic-wise tests and full-length mock tests sold as separate add-ons. Manage pricing per course independently of Pro and Elite plans.</p>
          </div>
          <div className="quiz-count-cards">
            <StatCard label="Topic Tests" value="—" />
            <StatCard label="Full Mocks" value="—" />
          </div>
        </div>
        <div className="workspace-link-actions">
          <button type="button" className="primary-btn" onClick={() => navigate('/admin/test-series')}>
            Open Test Series Workspace
          </button>
        </div>
      </section>

      <section id="section-announcements" className="card quiz-builder-panel quiz-builder-section admin-workspace-link-card announcements-link-card">
        <div className="section-header compact quiz-builder-heading-row">
          <div>
            <p className="eyebrow">Student Announcements</p>
            <h2>Announcement workspace</h2>
            <p className="subtitle">Open the dedicated colorful page to publish updates and manage active announcements cleanly.</p>
          </div>
          <div className="quiz-count-cards">
            <StatCard label="Total" value={announcementList.length} />
            <StatCard label="Active" value={announcementList.filter((item) => item.isActive !== false).length} />
          </div>
        </div>
        <div className="workspace-link-actions">
          <button type="button" className="primary-btn" onClick={() => navigate('/admin/announcements-workspace')}>
            Open Announcement Workspace
          </button>
        </div>
      </section>

      <section id="section-payment-settings" className="card payment-settings-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Monetization</p>
            <h2>Pricing and Voucher Workspaces</h2>
          </div>
          <StatCard label="Active Vouchers" value={voucherList.filter((voucher) => voucher.active).length} />
        </div>

        <div className="workspace-launch-grid">
          <article className="workspace-launch-card workspace-launch-pricing">
            <p className="eyebrow">Pricing Setup</p>
            <h3>Course and module pricing</h3>
            <p className="subtitle">Open a dedicated page to manage bundle and module plans without dashboard clutter.</p>
            <button type="button" className="primary-btn" onClick={() => navigate('/admin/pricing-workspace')}>
              Open Pricing Workspace
            </button>
          </article>

          <article className="workspace-launch-card workspace-launch-voucher">
            <p className="eyebrow">Voucher Setup</p>
            <h3>Create and manage vouchers</h3>
            <p className="subtitle">Use the voucher workspace for smooth offer creation, status toggles and deletion.</p>
            <button type="button" className="primary-btn" onClick={() => navigate('/admin/voucher-workspace')}>
              Open Voucher Workspace
            </button>
          </article>
        </div>
      </section>

      <section id="section-payment-history" className="card analytics-card workspace-launch-card workspace-launch-revenue">
        <div className="section-header">
          <div>
            <p className="eyebrow">Revenue Tracking</p>
            <h2>Open Revenue Workspace</h2>
            <p className="subtitle">Go to the dedicated colorful page for payment filters, tables and pagination.</p>
            <div className="workspace-quick-chips" aria-label="Revenue quick insights">
              <span className="workspace-quick-chip">{paymentHistoryLoading ? 'Refreshing data' : 'Data synced'}</span>
              <span className="workspace-quick-chip">Page {paymentHistoryPagination.page} / {paymentHistoryPagination.totalPages}</span>
              <span className="workspace-quick-chip">{paymentHistoryFilter.status || 'All statuses'}</span>
            </div>
          </div>
          <StatCard label="Total Transactions" value={paymentHistoryPagination.total} />
        </div>
        <div className="workspace-link-actions">
          <button type="button" className="primary-btn" onClick={() => navigate('/admin/revenue-tracking')}>
            Open Revenue Tracking
          </button>
        </div>
      </section>

      <section id="section-quiz-analytics" className="card analytics-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Performance Insights</p>
            <h2>🏆 Quiz Analytics</h2>
          </div>
          <StatCard label="Total Quizzes Tracked" value={quizAnalytics.length} />
        </div>

        <div className="analytics-filters">
          <select
            className="analytics-filter-select"
            value={quizAnalyticsCategory}
            onChange={(e) => setQuizAnalyticsCategory(e.target.value)}
          >
            <option value="">All Courses</option>
            {COURSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            className="primary-btn"
            type="button"
            onClick={() => loadQuizAnalytics(quizAnalyticsCategory)}
            disabled={quizAnalyticsLoading}
          >
            {quizAnalyticsLoading ? 'Loading...' : 'Load Analytics'}
          </button>
        </div>

        <div className="analytics-section-scroll">
          {quizAnalytics.length === 0 && !quizAnalyticsLoading ? (
            <p className="empty-note">Click Load Analytics to view quiz performance data.</p>
          ) : (
            <div className="analytics-cards-grid">
              {quizAnalytics.map((q) => (
                <div key={String(q.quizId)} className="quiz-stat-card">
                  <div className="quiz-stat-card-header">
                    <span className={`difficulty-badge diff-${q.difficulty}`}>{q.difficulty}</span>
                    <span className="quiz-stat-module">{q.module} · {q.category}</span>
                  </div>
                  <h4 className="quiz-stat-title">{q.title}</h4>
                  <div className="quiz-stat-metrics">
                    <div className="quiz-stat-metric">
                      <span className="metric-value">{q.totalAttempts}</span>
                      <span className="metric-label">Attempts</span>
                    </div>
                    <div className="quiz-stat-metric">
                      <span className="metric-value">{q.avgScore}</span>
                      <span className="metric-label">Avg Score</span>
                    </div>
                    <div className="quiz-stat-metric">
                      <span className={`metric-value ${Number(q.passRate) >= 60 ? 'metric-pass' : 'metric-fail'}`}>{q.passRate}%</span>
                      <span className="metric-label">Pass Rate</span>
                    </div>
                  </div>
                  <div className="quiz-stat-bar-wrap">
                    <div className="quiz-stat-bar" style={{ width: `${Math.min(100, Number(q.avgPct))}%` }} />
                    <span className="quiz-stat-bar-label">{q.avgPct}% avg</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="section-audit-log" className="card analytics-card workspace-launch-card workspace-launch-audit">
        <div className="section-header">
          <div>
            <p className="eyebrow">Security & Compliance</p>
            <h2>Open Audit Log Workspace</h2>
            <p className="subtitle">Use the dedicated colorful page to search and inspect full audit events cleanly.</p>
            <div className="workspace-quick-chips" aria-label="Audit quick insights">
              <span className="workspace-quick-chip">{auditLogLoading ? 'Refreshing events' : 'Events synced'}</span>
              <span className="workspace-quick-chip">Page {auditLogPagination.page} / {auditLogPagination.totalPages}</span>
              <span className="workspace-quick-chip">{auditLogFilter.action || 'All actions'}</span>
            </div>
          </div>
          <StatCard label="Total Events" value={auditLogPagination.total} />
        </div>
        <div className="workspace-link-actions">
          <button type="button" className="primary-btn" onClick={() => navigate('/admin/audit-log')}>
            Open Audit Log
          </button>
        </div>
      </section>

      <section id="section-recovery-center" className="card analytics-card recovery-center-card workspace-launch-card workspace-launch-recovery">
        <div className="section-header">
          <div>
            <p className="eyebrow">Admin Recovery</p>
            <h2>Open Recovery Workspace</h2>
            <p className="subtitle">Move to the dedicated colorful page to filter recoverable actions and apply rollback safely.</p>
            <div className="workspace-quick-chips" aria-label="Recovery quick insights">
              <span className="workspace-quick-chip">{recoveryLoading ? 'Refreshing recoveries' : 'Recovery feed synced'}</span>
              <span className="workspace-quick-chip">Supported: {recoveryActions.filter((item) => item?.recovery?.supported).length}</span>
              <span className="workspace-quick-chip">Applied: {recoveryActions.filter((item) => item?.recovery?.alreadyApplied).length}</span>
            </div>
          </div>
          <StatCard label="Recoverable Events" value={recoveryActions.length} />
        </div>
        <div className="workspace-link-actions">
          <button type="button" className="primary-btn" onClick={() => navigate('/admin/recovery-center')}>
            Open Recovery Center
          </button>
        </div>
      </section>

      <section id="section-feedback" className="card feedback-list-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Student Voice</p>
            <h2>Feedback from students</h2>
          </div>
          <StatCard label="Total Feedback" value={feedback.length} />
        </div>

        {feedback.length ? (
          <div className="feedback-list feedback-list-scroll">
            {feedback.map((item) => (
              <article className="feedback-item" key={item._id || `${item.username}-${item.createdAt}`}>
                <div className="feedback-head">
                  <strong>{item.username}</strong>
                  <div className="feedback-head-actions">
                    <span className="feedback-rating">{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</span>
                    <button
                      type="button"
                      className="feedback-delete-btn"
                      onClick={() => handleDeleteFeedback(item)}
                      aria-label={`Delete feedback from ${item.username}`}
                      title="Delete feedback"
                    >
                      🗑
                    </button>
                  </div>
                </div>
                <p>{item.message}</p>
                <span className="timestamp">{new Date(item.createdAt).toLocaleString()}</span>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No feedback submitted yet.</p>
        )}
      </section>

      {courseModalOpen ? createPortal(
        <div className="course-modal-backdrop" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) closeCourseModal();
        }}>
          <section
            className={`course-modal card course-modal-themed${isCsirModuleFlow ? ' csir-course-modal' : ''} course-modal-step-${modalStep}`}
            role="dialog"
            aria-modal="true"
            aria-label={modalStep === 'module' ? 'Select or create module' : modalStep === 'topic' ? 'Select or create topic' : 'Add lecture and notes'}
            style={courseModalStyle}
          >
            <div className="section-header modal-header">
              <div>
                <p className="eyebrow">Course</p>
                <h2>{selectedCourse}</h2>
                {(modalStep === 'upload' || modalStep === 'topic') && selectedModule && (
                  <p className="module-breadcrumb">
                    → <strong>{selectedModule}</strong>
                    {modalStep === 'upload' && selectedTopic ? <> / <strong>{selectedTopic}</strong></> : null}
                  </p>
                )}
              </div>
              <button type="button" className="secondary-btn" onClick={closeCourseModal}>Close</button>
            </div>

            <div className="course-modal-stagebar" role="list" aria-label="Course creation steps">
              {courseModalSteps.map((step, index) => {
                const isActive = step.id === modalStep;
                const isDone = activeCourseModalStepIndex > index;
                return (
                  <div key={step.id} className={`course-modal-stage-pill${isActive ? ' active' : ''}${isDone ? ' done' : ''}`} role="listitem">
                    <span className="course-modal-stage-index">{isDone ? '✓' : index + 1}</span>
                    <span>{step.label}</span>
                  </div>
                );
              })}
            </div>

            {modalStep === 'module' ? (
              <section className="course-modal-step-shell module-step-shell" aria-label="Module workspace">
                <div className="course-modal-step-head">
                  <p className="eyebrow">Step 1</p>
                  <h3>Create or pick a module</h3>
                  <p className="subtitle">Start with a module bucket. The next screen opens topic creation for that module.</p>
                </div>
                <ModuleManager
                  course={selectedCourse}
                  modules={courseModules[selectedCourse] || []}
                  selectedModule={selectedModule}
                  onModuleSelect={handleModuleSelect}
                  onModuleCreate={handleModuleCreate}
                  onModuleDelete={handleModuleDelete}
                  isProcessing={publishingForCourse}
                  modalMessage={modalMessage}
                  onClearMessage={() => setModalMessage(null)}
                />
              </section>
            ) : modalStep === 'topic' ? (
              <section className="course-modal-step-shell topic-step-shell" aria-label="Topic workspace">
                <div className="csir-topic-manager">
                <div className="upload-form-header">
                  <button
                    type="button"
                    className="back-btn"
                    onClick={goBackToModuleStep}
                    disabled={isTopicLoading || isTopicSaving}
                    title="Go back to module selection"
                  >
                    ← Back to Modules
                  </button>
                </div>

                <div className="csir-topic-header">
                  <div>
                    <p className="eyebrow">Step 2</p>
                    <h3>Choose topic folder for {selectedModule}</h3>
                    <p className="subtitle">Create topic folders and upload learning videos + PDFs inside each topic.</p>
                  </div>
                </div>

                <div className="csir-topic-create-row">
                  <input
                    type="text"
                    value={newTopicName}
                    onChange={(event) => setNewTopicName(event.target.value)}
                    placeholder="Create topic name (e.g., Cell Signaling)"
                    disabled={isTopicSaving || isTopicLoading}
                  />
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleTopicCreate}
                    disabled={isTopicSaving || isTopicLoading || !newTopicName.trim()}
                  >
                    {isTopicSaving ? 'Creating...' : 'Create Topic'}
                  </button>
                </div>

                {modalMessage ? <p className={`inline-message ${modalMessage.type}`}>{modalMessage.text}</p> : null}

                {isTopicLoading ? <p className="empty-note">Loading topic folders...</p> : null}

                {!isTopicLoading && currentModuleTopics.length ? (
                  <div className="csir-topic-grid">
                    {currentModuleTopics.map((topicName) => (
                      <article key={topicName} className={`csir-topic-card${selectedTopic === topicName ? ' active' : ''}`}>
                        <button type="button" className="csir-topic-open" onClick={() => handleTopicSelect(topicName)}>
                          <span className="csir-topic-icon" aria-hidden="true">📁</span>
                          <span className="csir-topic-name">{topicName}</span>
                          <span className="csir-topic-hint">Open Folder</span>
                        </button>
                        <button
                          type="button"
                          className="csir-topic-delete"
                          onClick={() => handleTopicDelete(topicName)}
                          disabled={isTopicDeleting === topicName}
                          title={`Delete topic ${topicName}`}
                        >
                          {isTopicDeleting === topicName ? 'Deleting...' : '🗑'}
                        </button>
                      </article>
                    ))}
                  </div>
                ) : null}

                {!isTopicLoading && !currentModuleTopics.length ? (
                  <p className="empty-note">No topics yet. Create your first topic folder to start uploading content.</p>
                ) : null}
              </div>
              </section>
            ) : (
              <form className="course-modal-form course-upload-shell" onSubmit={handleCreateVideo}>
                <div className="upload-form-header">
                  <button
                    type="button"
                    className="back-btn"
                    onClick={isCsirModuleFlow ? goBackToTopicStep : goBackToModuleStep}
                    disabled={publishingForCourse}
                    title={isCsirModuleFlow ? 'Go back to topic selection' : 'Go back to module selection'}
                  >
                    {isCsirModuleFlow ? '← Back to Topics' : '← Back to Modules'}
                  </button>
                </div>

                <div className="course-modal-step-head">
                  <p className="eyebrow">Step 3</p>
                  <h3>Upload lecture video and notes</h3>
                  <p className="subtitle">Publish content into the selected folder with optional PDF notes.</p>
                </div>

                <label>
                  Lecture title
                  <input value={videoForm.title} onChange={(event) => setVideoForm((current) => ({ ...current, title: event.target.value }))} required disabled={publishingForCourse} />
                </label>
                <label>
                  Description
                  <textarea value={videoForm.description} onChange={(event) => setVideoForm((current) => ({ ...current, description: event.target.value }))} rows="4" disabled={publishingForCourse} />
                </label>
                <label>
                  Video URL
                  <input value={videoForm.url} onChange={(event) => setVideoForm((current) => ({ ...current, url: event.target.value }))} required disabled={publishingForCourse} />
                </label>
                <label>
                  Notes (PDF, optional)
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(event) => setModalNoteFile(event.target.files?.[0] || null)}
                    disabled={publishingForCourse}
                  />
                </label>

                {modalNoteFile ? <p className="optional-note">Selected note: {modalNoteFile.name}</p> : null}
                {modalUploadProgress > 0 && modalUploadProgress < 100 ? <p className="optional-note">Uploading notes: {modalUploadProgress}%</p> : null}
                {modalMessage ? <p className={`inline-message ${modalMessage.type}`}>{modalMessage.text}</p> : null}

                <button className="primary-btn" type="submit" disabled={publishingForCourse}>
                  {publishingForCourse ? 'Publishing...' : 'Add Lecture & Notes'}
                </button>
              </form>
            )}
          </section>
        </div>
      , document.body) : null}

      {confirmDialog.open ? createPortal(
        <div className="confirm-modal-backdrop" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) closeConfirmDialog();
        }}>
          <section className="confirm-modal card" role="dialog" aria-modal="true" aria-label="Confirm action">
            <p className="eyebrow">Confirmation</p>
            <h2>{confirmDialog.title}</h2>
            <p className="subtitle">{confirmDialog.message}</p>
            {confirmDialog.errorText ? <p className="inline-message error">{confirmDialog.errorText}</p> : null}
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  closeConfirmDialog();
                }}
                disabled={isConfirmingAction}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  handleConfirmAction();
                }}
                disabled={isConfirmingAction}
              >
                {isConfirmingAction ? confirmDialog.processingLabel : confirmDialog.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      , document.body) : null}

      {adminProfileOpen ? createPortal(
        <div className="profile-modal-backdrop" onClick={() => setAdminProfileOpen(false)}>
          <section className="profile-modal" onClick={(event) => event.stopPropagation()}>
            <div className="profile-modal-header">
              <div>
                <p className="eyebrow">Admin Profile</p>
                <h2>Profile Settings</h2>
              </div>
              <button type="button" className="profile-close-btn" onClick={() => setAdminProfileOpen(false)} aria-label="Close admin profile settings">
                ×
              </button>
            </div>

            {isAdminProfileLoading ? (
              <p className="empty-note">Loading profile...</p>
            ) : (
              <div className="profile-modal-body">
                <aside className="profile-summary-card">
                  <div className="profile-avatar-large">
                    {adminAvatarUrl ? (
                      <img src={adminAvatarUrl} alt="Admin profile" className="profile-avatar-large-image" />
                    ) : (
                      <span>{adminInitial}</span>
                    )}
                  </div>
                  <label className="profile-photo-upload">
                    <input type="file" accept="image/*" onChange={handleAdminAvatarChange} disabled={isAdminAvatarUploading} />
                    <span>{isAdminAvatarUploading ? 'Uploading...' : 'Change Photo'}</span>
                  </label>
                  <button
                    type="button"
                    className="secondary-btn profile-delete-photo-btn"
                    onClick={handleDeleteAdminAvatar}
                    disabled={!adminAvatarUrl || isAdminAvatarUploading}
                  >
                    Delete Photo
                  </button>
                  <div className="profile-summary-list">
                    <div><span>Username</span><strong>{adminProfile?.username || '-'}</strong></div>
                    <div><span>Role</span><strong>Administrator</strong></div>
                  </div>
                  <button
                    type="button"
                    className="secondary-btn profile-theme-modal-btn"
                    onClick={toggleTheme}
                  >
                    {isLightTheme ? 'Use Dark Theme' : 'Use Light Theme'}
                  </button>
                  <button
                    type="button"
                    className="profile-logout-btn"
                    onClick={handleLogout}
                  >
                    Logout
                  </button>
                </aside>
                <form className="profile-edit-form" onSubmit={handleSaveAdminProfile}>
                  <label>
                    Username
                    <input
                      type="text"
                      value={adminProfileForm.username}
                      onChange={(event) => setAdminProfileForm((current) => ({ ...current, username: event.target.value }))}
                      placeholder="Update username"
                    />
                  </label>
                  <label>
                    New Password
                    <input
                      type="password"
                      value={adminProfileForm.password}
                      onChange={(event) => setAdminProfileForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="Leave blank to keep current password"
                    />
                  </label>
                  <label>
                    Confirm New Password
                    <input
                      type="password"
                      value={adminProfileForm.confirmPassword}
                      onChange={(event) => setAdminProfileForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                      placeholder="Re-enter new password"
                    />
                  </label>

                  {adminProfileMessage ? <p className={`inline-message ${adminProfileMessage.type}`}>{adminProfileMessage.text}</p> : null}

                  <div className="profile-edit-actions">
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => setAdminProfileOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="primary-btn"
                      disabled={isSavingAdminProfile || isAdminAvatarUploading}
                    >
                      {isSavingAdminProfile ? 'Saving...' : 'Save Profile'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>
        </div>
      , document.body) : null}
    </AppShell>
  );
}
