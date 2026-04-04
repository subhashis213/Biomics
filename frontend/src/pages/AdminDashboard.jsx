import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  createVoucherAdmin,
  deleteQuiz,
  deleteVoucherAdmin,
  fetchAdminQuizzes,
  fetchRecoveryActionsAdmin,
  fetchAuditLogsAdmin,
  fetchCoursePricingAdmin,
  fetchModulePricingAdmin,
  fetchPaymentHistoryAdmin,
  fetchQuizAnalyticsAdmin,
  fetchVouchersAdmin,
  getApiBase,
  requestJson,
  saveCoursePricingAdmin,
  saveModulePricingAdmin,
  saveModuleQuiz,
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
  '11th':                  { icon: '📖', color: '#3b82f6' },
  '12th':                  { icon: '🎓', color: '#8b5cf6' },
  'NEET':                  { icon: '🧬', color: '#10b981' },
  'IIT-JAM':               { icon: '⚗️',  color: '#f59e0b' },
  'CSIR-NET Life Science': { icon: '🔬', color: '#06b6d4' },
  'GATE':                  { icon: '💻', color: '#ef4444' },
};

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
  const [activeLibraryCourse, setActiveLibraryCourse] = useState('All');
  const [librarySearchInput, setLibrarySearchInput] = useState('');
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [libraryModuleInput, setLibraryModuleInput] = useState('');
  const [libraryModuleQuery, setLibraryModuleQuery] = useState('');
  const [videoForm, setVideoForm] = useState({ title: '', description: '', url: '' });
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState('module'); // 'module' or 'upload'
  const [courseModules, setCourseModules] = useState({}); // { courseName: ['Module1', 'Module2'] }
  const [selectedModule, setSelectedModule] = useState(null);
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
          module: selectedModule
        })
      });

      if (modalNoteFile) {
        await uploadMaterial(createdVideo._id, modalNoteFile, (percent) => {
          setModalUploadProgress(percent);
        });
      }

      const successText = `Lecture added to ${selectedModule} in ${selectedCourse}${modalNoteFile ? ' with notes.' : '.'}`;
      setVideoForm({ title: '', description: '', url: '' });
      setModalNoteFile(null);
      setPublishingForCourse(false);
      setCourseModalOpen(false);
      setModalStep('module');
      setSelectedModule(null);
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
      setModalStep('upload');
      setModalMessage(null);
      if (expandedPricingCourse === selectedCourse) {
        await loadModulePricing(selectedCourse);
      }
    } catch (error) {
      setModalMessage({ type: 'error', text: error.message || 'Failed to create module.' });
      throw error;
    }
  }

  function handleModuleSelect(moduleName) {
    setSelectedModule(moduleName);
    setModalStep('upload');
  }

  function goBackToModuleStep() {
    setModalStep('module');
    setSelectedModule(null);
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
      setPaymentHistory(res.payments || []);
      setPaymentHistoryPagination(res.pagination || { page: 1, totalPages: 1, total: 0 });
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
      setAuditLogs(res.logs || []);
      setAuditLogPagination(res.pagination || { page: 1, totalPages: 1, total: 0 });
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
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    loadRecoveryActions(30, recoveryFilter);
  }, []);

  function applyLibrarySearch() {
    setLibrarySearchQuery(String(librarySearchInput || '').trim().toLowerCase());
    setLibraryModuleQuery(String(libraryModuleInput || '').trim().toLowerCase());
  }

  function clearLibrarySearch() {
    setLibrarySearchInput('');
    setLibrarySearchQuery('');
    setLibraryModuleInput('');
    setLibraryModuleQuery('');
  }

  const filteredVideos = videos.filter((video) => {
    const matchesCourse = activeLibraryCourse === 'All' || (video.category || 'General') === activeLibraryCourse;
    if (!matchesCourse) return false;

    const title = String(video.title || '').toLowerCase();
    const moduleName = String(video.module || 'General').toLowerCase();

    const matchesTitle = !librarySearchQuery || title.includes(librarySearchQuery);
    const matchesModule = !libraryModuleQuery || moduleName.includes(libraryModuleQuery);

    return matchesTitle && matchesModule;
  });
  const activeUserUndoEntry = Object.entries(undoItems).find(([id]) => id.startsWith('user-'));
  const activeLibraryUndoEntry = Object.entries(undoItems).find(([id]) => id.startsWith('video-') || id.startsWith('material-'));

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
    { id: 'section-quiz-builder', label: 'Quiz Builder', icon: '📝' },
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

  return (
    <AppShell
      title="Admin Dashboard"
      roleLabel="Admin"
      showThemeSwitch={false}
      navTitle="Admin Sections"
      navItems={adminNavItems}
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
                  onClick={() => openCourseModal(course)}
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
      </section>

      <section id="section-content-library" className="card content-library-card">
        <div className="section-header content-library-header">
          <div>
            <p className="eyebrow">Content Library</p>
            <h2>Uploaded lectures</h2>
            <div className="course-filter-row" role="tablist" aria-label="Filter lectures by course">
              <button
                type="button"
                className={`secondary-btn course-filter-btn ${activeLibraryCourse === 'All' ? 'active' : ''}`}
                onClick={() => setActiveLibraryCourse('All')}
              >
                All
              </button>
              {COURSE_CATEGORIES.map((course) => (
                <button
                  key={course}
                  type="button"
                  className={`secondary-btn course-filter-btn ${activeLibraryCourse === course ? 'active' : ''}`}
                  onClick={() => setActiveLibraryCourse(course)}
                >
                  {course}
                </button>
              ))}
            </div>
            <div className="library-search-row" role="search" aria-label="Search lectures by name">
              <input
                type="text"
                className="library-search-input"
                placeholder="Search lecture name (e.g. bio, cell, dna)"
                value={librarySearchInput}
                onChange={(event) => setLibrarySearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyLibrarySearch();
                  }
                }}
              />
              <input
                type="text"
                className="library-search-input"
                placeholder="Filter by module (e.g. genetics, unit 1)"
                value={libraryModuleInput}
                onChange={(event) => setLibraryModuleInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyLibrarySearch();
                  }
                }}
              />
              <button
                type="button"
                className="primary-btn"
                onClick={applyLibrarySearch}
              >
                Search
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={clearLibrarySearch}
                disabled={!librarySearchInput && !librarySearchQuery && !libraryModuleInput && !libraryModuleQuery}
              >
                Clear
              </button>
            </div>
          </div>
          <StatCard label={activeLibraryCourse === 'All' ? 'Total Lectures' : 'Showing'} value={filteredVideos.length} />
        </div>
        {activeLibraryUndoEntry ? (
          <div className="section-undo-alert" role="status" aria-live="polite">
            <span className="undo-message">
              {Math.ceil(Math.max(0, activeLibraryUndoEntry[1].remainingMs || 0) / 1000)}s - {activeLibraryUndoEntry[1].message}
            </span>
            <button type="button" className="secondary-btn undo-btn" onClick={() => handleUndoAction(activeLibraryUndoEntry[0])}>
              Undo
            </button>
          </div>
        ) : null}

        <div className="library-scroll-body">
          {loading ? <p className="empty-state">Loading dashboard...</p> : null}
          {!loading && !filteredVideos.length ? (
            <p className="empty-state">
              {librarySearchQuery || libraryModuleQuery
                ? `No lectures found for the applied title/module filters.`
                : activeLibraryCourse === 'All'
                  ? `No lectures yet. Publish a lecture first, then the PDF upload button will appear on that lecture card (max ${MAX_MATERIAL_MB}MB).`
                  : `No lectures available for ${activeLibraryCourse}. Add one from Course Manager.`}
            </p>
          ) : null}
          <div className="video-grid">
            {filteredVideos.map((video) => (
              <VideoCard
                key={video._id}
                video={video}
                adminMode
                selectedFile={uploadFiles[video._id]}
                uploadProgress={uploadProgress[video._id]}
                materialMessage={materialMessages[video._id]}
                onFileSelect={(videoId, file) => setUploadFiles((current) => ({ ...current, [videoId]: file }))}
                onUploadMaterial={handleUploadMaterial}
                onRemoveMaterial={handleRemoveMaterial}
                onDeleteVideo={handleDeleteVideo}
                disableDangerActions={Object.keys(undoItems).length > 0}
                undoItem={undoItems[`video-${video._id}`]}
                onUndo={() => handleUndoAction(`video-${video._id}`)}
                undoItems={undoItems}
                onUndoMaterial={(itemId) => handleUndoAction(itemId)}
              />
            ))}
          </div>
        </div>
      </section>

      <section id="section-quiz-builder" className="card quiz-builder-panel quiz-builder-section">
        <div className="section-header compact quiz-builder-heading-row">
          <div>
            <p className="eyebrow">Quiz Builder</p>
            <h2>Create chapter-wise quizzes</h2>
            <p className="subtitle">Use uploaded lecture modules as quiz chapters and manage all quizzes in one place.</p>
          </div>
          <div className="quiz-count-cards">
            <StatCard label={`${quizCategory} Quizzes`} value={adminQuizzes.length} />
            <StatCard label="Total Quizzes" value={allQuizzesCount} />
          </div>
        </div>

        <form className="quiz-builder-form" onSubmit={handleSaveQuiz}>
          <label>
            Course
            <select value={quizCategory} onChange={(event) => setQuizCategory(event.target.value)}>
              {COURSE_CATEGORIES.map((course) => (
                <option key={course} value={course}>{course}</option>
              ))}
            </select>
          </label>

          <label>
            Module
            <input
              list="available-modules"
              value={quizModule}
              onChange={(event) => setQuizModule(event.target.value)}
              placeholder="Type module name or choose existing"
              required
            />
            <datalist id="available-modules">
              {availableModules.map((module) => (
                <option key={module} value={module} />
              ))}
            </datalist>
          </label>

          <label>
            Quiz title
            <input
              value={quizTitle}
              onChange={(event) => setQuizTitle(event.target.value)}
              placeholder="Example: Chapter 1 Fundamentals Quiz"
              required
            />
          </label>

          <div className="quiz-meta-grid">
            <label>
              Difficulty
              <select value={quizDifficulty} onChange={(event) => setQuizDifficulty(event.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label>
              Time limit (minutes)
              <input
                type="number"
                min="1"
                max="180"
                value={quizTimeLimitMinutes}
                onChange={(event) => setQuizTimeLimitMinutes(Number(event.target.value))}
                required
              />
            </label>
          </div>

          <label className="quiz-toggle-row">
            <input
              type="checkbox"
              checked={quizRequireExplanation}
              onChange={(event) => setQuizRequireExplanation(event.target.checked)}
            />
            Require explanation for all questions
          </label>

          <div className="quiz-question-list">
            {quizQuestions.map((question, questionIndex) => (
              <article key={`quiz-question-${questionIndex}`} className="quiz-editor-card">
                <div className="quiz-editor-head">
                  <strong>Question {questionIndex + 1}</strong>
                  {quizQuestions.length > 1 ? (
                    <button type="button" className="danger-text-btn" onClick={() => removeQuizQuestion(questionIndex)}>
                      Remove
                    </button>
                  ) : null}
                </div>

                <label>
                  Question text
                  <input
                    value={question.question}
                    onChange={(event) => updateQuizQuestion(questionIndex, 'question', event.target.value)}
                    placeholder="Enter question"
                    required
                  />
                </label>

                <div className="quiz-options-list">
                  {question.options.map((option, optionIndex) => (
                    <label key={`question-${questionIndex}-option-${optionIndex}`}>
                      Option {optionIndex + 1}
                      <input
                        value={option}
                        onChange={(event) => updateQuizOption(questionIndex, optionIndex, event.target.value)}
                        placeholder={`Option ${optionIndex + 1}`}
                        required
                      />
                    </label>
                  ))}
                </div>

                <label>
                  Correct option
                  <select
                    value={question.correctIndex}
                    onChange={(event) => updateQuizQuestion(questionIndex, 'correctIndex', Number(event.target.value))}
                  >
                    <option value={0}>Option 1</option>
                    <option value={1}>Option 2</option>
                    <option value={2}>Option 3</option>
                    <option value={3}>Option 4</option>
                  </select>
                </label>

                <label>
                  Explanation (shown after submit)
                  <textarea
                    rows="2"
                    value={question.explanation || ''}
                    onChange={(event) => updateQuizQuestion(questionIndex, 'explanation', event.target.value)}
                    placeholder="Optional explanation for why this answer is correct"
                  />
                </label>
              </article>
            ))}
          </div>

          <button type="button" className="secondary-btn" onClick={addQuizQuestion}>
            + Add Question
          </button>

          {editingQuizId ? (
            <button type="button" className="secondary-btn" onClick={resetQuizBuilder}>
              Cancel Edit
            </button>
          ) : null}

          {quizMessage ? (
            <p className={`inline-message ${quizMessage.type}${isQuizMessageDismissing ? ' inline-message-dismissing' : ''}`}>
              {quizMessage.text}
            </p>
          ) : null}

          <button className="primary-btn" type="submit" disabled={quizSaving}>
            {quizSaving ? 'Saving quiz...' : editingQuizId ? 'Update Quiz' : 'Save Quiz'}
          </button>
        </form>

        <section className="quiz-admin-list">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Existing Quizzes</p>
              <h3>Manage quizzes for {quizCategory}</h3>
            </div>
          </div>

          {adminQuizzes.length ? (
            <div className="quiz-admin-items">
              {adminQuizzes.map((quiz) => (
                <article key={quiz._id} className="quiz-admin-item">
                  <div className="quiz-admin-item-body">
                    <strong>{quiz.module}</strong>
                    <p>{quiz.title}</p>
                    <div className="quiz-admin-meta" aria-label="Quiz details">
                      <span className="quiz-admin-meta-chip">{quiz.questions?.length || 0} questions</span>
                      <span className="quiz-admin-meta-chip">{quiz.difficulty || 'medium'}</span>
                      <span className="quiz-admin-meta-chip">{quiz.timeLimitMinutes || 15} min</span>
                      <span className="quiz-admin-meta-chip">{quiz.requireExplanation ? 'explanation required' : 'explanation optional'}</span>
                    </div>
                  </div>
                  <div className="quiz-admin-item-actions">
                    <button type="button" className="secondary-btn" onClick={() => editQuiz(quiz)}>
                      Edit
                    </button>
                    <button type="button" className="danger-btn" onClick={() => handleDeleteQuiz(quiz)} disabled={Boolean(undoPopup)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-note">No quizzes created for this course yet.</p>
          )}
        </section>
      </section>

      <section id="section-payment-settings" className="card payment-settings-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Monetization</p>
            <h2>Course Pricing and Vouchers</h2>
          </div>
          <StatCard label="Active Vouchers" value={voucherList.filter((voucher) => voucher.active).length} />
        </div>

        <div className="dashboard-grid admin-grid">
          <section className="card payment-pricing-card">
            <div className="section-header compact">
              <div>
                <p className="eyebrow">Course & Module Pricing</p>
                <h3>Set Pro &amp; Elite prices per course or module</h3>
              </div>
            </div>
            <p className="empty-note" style={{ marginBottom: '1rem' }}>
              <strong>Bundle (All Modules)</strong> — unlocks the whole course for Pro (1 month) or Elite (3 months).<br />
              <strong>Per-Module</strong> — students can also buy access to individual modules. Click "Set Module Prices" to expand.
            </p>
            <div className="quiz-admin-items">
              {COURSE_CATEGORIES.map((courseName) => {
                const meta = COURSE_META[courseName] || {};
                const form = priceFormByCourse[courseName] || { proAmountRupees: '0', eliteAmountRupees: '0', active: true };
                const isExpanded = expandedPricingCourse === courseName;
                const courseModuleData = modulePricingByCourse[courseName];
                const bundleStatus = pricingSaveStatus[getPricingStatusKey(courseName)] || null;

                return (
                  <article key={courseName} className="quiz-admin-item pricing-course-item">
                    {/* ── Bundle row ── */}
                    <div className="quiz-admin-item-body">
                      <div className="pricing-course-header">
                        <span className="pricing-course-icon">{meta.icon || '📚'}</span>
                        <div>
                          <strong>{courseName}</strong>
                          <p className="pricing-course-sub">All Modules Bundle — Pro&nbsp;(1 mo) &amp; Elite&nbsp;(3 mo)</p>
                        </div>
                      </div>
                      <div className="quiz-admin-meta pricing-input-row" aria-label="Bundle pricing">
                        <label className="pricing-input-label">
                          <span>Pro (₹/mo)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.proAmountRupees}
                            onChange={(event) => {
                              const proAmountRupees = event.target.value;
                              setPriceFormByCourse((current) => ({
                                ...current,
                                [courseName]: { ...(current[courseName] || {}), proAmountRupees }
                              }));
                              clearPricingSaveStatus(getPricingStatusKey(courseName));
                            }}
                            placeholder="0.00"
                          />
                        </label>
                        <label className="pricing-input-label">
                          <span>Elite (₹/3 mo)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.eliteAmountRupees}
                            onChange={(event) => {
                              const eliteAmountRupees = event.target.value;
                              setPriceFormByCourse((current) => ({
                                ...current,
                                [courseName]: { ...(current[courseName] || {}), eliteAmountRupees }
                              }));
                              clearPricingSaveStatus(getPricingStatusKey(courseName));
                            }}
                            placeholder="0.00"
                          />
                        </label>
                        <label className="pricing-active-label">
                          <input
                            type="checkbox"
                            checked={form.active !== false}
                            onChange={(event) => {
                              const active = event.target.checked;
                              setPriceFormByCourse((current) => ({
                                ...current,
                                [courseName]: { ...(current[courseName] || {}), active }
                              }));
                              clearPricingSaveStatus(getPricingStatusKey(courseName));
                            }}
                          />
                          Active
                        </label>
                      </div>
                    </div>
                    <div className="quiz-admin-item-actions pricing-actions-col">
                      {bundleStatus ? (
                        <span className={`pricing-inline-status pricing-inline-status-${bundleStatus.type}`}>{bundleStatus.text}</span>
                      ) : null}
                      <button
                        type="button"
                        className="primary-btn"
                        disabled={isSavingPricing}
                        onClick={() => handleSaveCoursePrice(courseName)}
                      >
                        {isSavingPricing ? 'Saving...' : 'Save Bundle'}
                      </button>
                      <button
                        type="button"
                        className="secondary-btn module-price-toggle-btn"
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedPricingCourse(null);
                          } else {
                            setExpandedPricingCourse(courseName);
                            if (!modulePricingByCourse[courseName]) {
                              loadModulePricing(courseName);
                            }
                          }
                        }}
                      >
                        {isExpanded ? '▲ Close Module Price Editor' : '▼ Open Module Price Editor'}
                      </button>
                    </div>

                    {/* ── Per-module pricing panel ── */}
                    {isExpanded && (
                      <div className="module-pricing-panel">
                        {!courseModuleData ? (
                          <p className="empty-note">Loading modules…</p>
                        ) : courseModuleData.modules.length === 0 ? (
                          <p className="empty-note">No modules found for {courseName}. Upload videos with module names first.</p>
                        ) : (
                          <>
                            <div className="module-pricing-toolbar">
                              <button
                                type="button"
                                className="primary-btn module-pricing-save-all-btn"
                                disabled={isSavingModulePrice}
                                onClick={() => handleSaveAllModulePrices(courseName)}
                              >
                                {isSavingModulePrice ? 'Saving Module Prices...' : 'Save All Module Prices'}
                              </button>
                              <span className="module-pricing-toolbar-note">Edit module prices below, then save all updates in one click.</span>
                            </div>

                            <div className="module-pricing-scroll module-pricing-scroll-desktop" role="region" aria-label={`Module pricing for ${courseName}`}>
                              <table className="module-pricing-table">
                                <thead>
                                  <tr>
                                    <th>Module</th>
                                    <th>Pro Price (₹/1 mo)</th>
                                    <th>Elite Price (₹/3 mo)</th>
                                    <th>Active</th>
                                    <th>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {courseModuleData.modules.filter((mod) => !mod.isBundle).map((mod) => {
                                    const mf = courseModuleData.priceFormByModule[mod.moduleName] || { proAmountRupees: '0', eliteAmountRupees: '0', active: true };
                                    const moduleStatus = pricingSaveStatus[getPricingStatusKey(courseName, mod.moduleName)] || null;
                                    return (
                                      <tr key={mod.moduleName}>
                                        <td>
                                          <div className="module-pricing-name-cell">
                                            <span className="module-pricing-name">{mod.label}</span>
                                            {moduleStatus ? (
                                              <span className={`pricing-inline-status pricing-inline-status-${moduleStatus.type}`}>{moduleStatus.text}</span>
                                            ) : null}
                                          </div>
                                        </td>
                                        <td>
                                          <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="module-pricing-input"
                                            value={mf.proAmountRupees}
                                            onChange={(e) => updateModulePriceForm(courseName, mod.moduleName, 'proAmountRupees', e.target.value)}
                                            placeholder="0.00"
                                          />
                                        </td>
                                        <td>
                                          <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="module-pricing-input"
                                            value={mf.eliteAmountRupees}
                                            onChange={(e) => updateModulePriceForm(courseName, mod.moduleName, 'eliteAmountRupees', e.target.value)}
                                            placeholder="0.00"
                                          />
                                        </td>
                                        <td>
                                          <input
                                            type="checkbox"
                                            checked={mf.active !== false}
                                            onChange={(e) => updateModulePriceForm(courseName, mod.moduleName, 'active', e.target.checked)}
                                          />
                                        </td>
                                        <td>
                                          {moduleStatus ? (
                                            <span className={`pricing-inline-status pricing-inline-status-${moduleStatus.type}`}>{moduleStatus.text}</span>
                                          ) : <span className="module-pricing-status-empty">-</span>}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            <div className="module-pricing-mobile-list" aria-label={`Module pricing cards for ${courseName}`}>
                              {courseModuleData.modules.filter((mod) => !mod.isBundle).map((mod) => {
                                const mf = courseModuleData.priceFormByModule[mod.moduleName] || { proAmountRupees: '0', eliteAmountRupees: '0', active: true };
                                const moduleStatus = pricingSaveStatus[getPricingStatusKey(courseName, mod.moduleName)] || null;
                                return (
                                  <article key={`mobile-${mod.moduleName}`} className="module-pricing-mobile-card">
                                    <div className="module-pricing-mobile-head">
                                      <strong className="module-pricing-name">{mod.label}</strong>
                                      {moduleStatus ? (
                                        <span className={`pricing-inline-status pricing-inline-status-${moduleStatus.type}`}>{moduleStatus.text}</span>
                                      ) : null}
                                    </div>
                                    <div className="module-pricing-mobile-fields">
                                      <label className="module-pricing-mobile-field">
                                        <span>Pro (₹/1 mo)</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          className="module-pricing-input"
                                          value={mf.proAmountRupees}
                                          onChange={(e) => updateModulePriceForm(courseName, mod.moduleName, 'proAmountRupees', e.target.value)}
                                          placeholder="0.00"
                                        />
                                      </label>
                                      <label className="module-pricing-mobile-field">
                                        <span>Elite (₹/3 mo)</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          className="module-pricing-input"
                                          value={mf.eliteAmountRupees}
                                          onChange={(e) => updateModulePriceForm(courseName, mod.moduleName, 'eliteAmountRupees', e.target.value)}
                                          placeholder="0.00"
                                        />
                                      </label>
                                    </div>
                                    <label className="module-pricing-mobile-active">
                                      <input
                                        type="checkbox"
                                        checked={mf.active !== false}
                                        onChange={(e) => updateModulePriceForm(courseName, mod.moduleName, 'active', e.target.checked)}
                                      />
                                      Active
                                    </label>
                                  </article>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="card payment-voucher-card">
            <div className="section-header compact">
              <div>
                <p className="eyebrow">Vouchers</p>
                <h3>Create special voucher</h3>
              </div>
            </div>
            <form className="quiz-builder-form" onSubmit={handleCreateVoucher}>
              <label>
                Voucher code
                <input
                  value={voucherForm.code}
                  onChange={(event) => setVoucherForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                  placeholder="BIO10"
                  maxLength={20}
                  required
                />
              </label>
              <label>
                Description
                <input
                  value={voucherForm.description}
                  onChange={(event) => setVoucherForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Optional internal note"
                />
              </label>
              <label>
                Discount type
                <select
                  value={voucherForm.discountType}
                  onChange={(event) => setVoucherForm((current) => ({ ...current, discountType: event.target.value }))}
                >
                  <option value="percent">Percent (%)</option>
                  <option value="fixed">Fixed (INR)</option>
                </select>
              </label>
              <label>
                Discount value
                <input
                  type="number"
                  min="1"
                  step={voucherForm.discountType === 'percent' ? '1' : '0.01'}
                  value={voucherForm.discountValue}
                  onChange={(event) => setVoucherForm((current) => ({ ...current, discountValue: event.target.value }))}
                  required
                />
              </label>
              <label>
                Max discount in INR (optional)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={voucherForm.maxDiscountInPaise}
                  onChange={(event) => setVoucherForm((current) => ({ ...current, maxDiscountInPaise: event.target.value }))}
                />
              </label>
              <label>
                Usage limit (optional)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={voucherForm.usageLimit}
                  onChange={(event) => setVoucherForm((current) => ({ ...current, usageLimit: event.target.value }))}
                />
              </label>
              <label>
                Valid until (optional)
                <input
                  type="datetime-local"
                  value={voucherForm.validUntil}
                  onChange={(event) => setVoucherForm((current) => ({ ...current, validUntil: event.target.value }))}
                />
              </label>

              <div className="quiz-builder-header-checkbox">
                <span>Applicable courses</span>
                {COURSE_CATEGORIES.map((courseName) => {
                  const selected = voucherForm.applicableCourses.includes(courseName);
                  return (
                    <label key={`voucher-course-${courseName}`} className="quiz-inline-checkbox">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setVoucherForm((current) => ({
                            ...current,
                            applicableCourses: checked
                              ? [...current.applicableCourses, courseName]
                              : current.applicableCourses.filter((entry) => entry !== courseName)
                          }));
                        }}
                      />
                      <span>{courseName}</span>
                    </label>
                  );
                })}
              </div>

              <button className="primary-btn" type="submit" disabled={isSavingVoucher}>
                {isSavingVoucher ? 'Creating...' : 'Create Voucher'}
              </button>
            </form>

            <div className="quiz-admin-list">
              <div className="section-header compact">
                <div>
                  <p className="eyebrow">Voucher List</p>
                  <h3>Manage special offers</h3>
                </div>
              </div>
              {voucherList.length ? (
                <div className="quiz-admin-items">
                  {voucherList.map((voucher) => (
                    <article key={voucher._id} className="quiz-admin-item">
                      <div className="quiz-admin-item-body">
                        <div className="voucher-code-row">
                          <strong className="voucher-code-label">{voucher.code}</strong>
                          <span className={`status-badge status-${voucher.active ? 'paid' : 'failed'}`}>
                            {voucher.active ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        <p className="voucher-desc">{voucher.description || 'No description'}</p>
                        <div className="quiz-admin-meta">
                          <span className="quiz-admin-meta-chip chip-discount">
                            {voucher.discountType === 'percent'
                              ? `${voucher.discountValue}% off`
                              : `₹${(Number(voucher.discountValue || 0) / 100).toFixed(0)} off`}
                          </span>
                          {voucher.validUntil && (
                            <span className="quiz-admin-meta-chip">
                              Expires: {new Date(voucher.validUntil).toLocaleDateString()}
                            </span>
                          )}
                          {voucher.applicableCourses?.length > 0 && (
                            <span className="quiz-admin-meta-chip chip-courses">
                              {voucher.applicableCourses.join(', ')}
                            </span>
                          )}
                        </div>
                        <div className="voucher-usage-row">
                          <span className="voucher-usage-text">
                            Used: <strong>{voucher.usedCount || 0}</strong>
                            {voucher.usageLimit ? ` / ${voucher.usageLimit}` : ' (unlimited)'}
                          </span>
                          {voucher.usageLimit ? (
                            <div className="voucher-usage-bar-wrap">
                              <div
                                className="voucher-usage-bar"
                                style={{ width: `${Math.min(100, ((voucher.usedCount || 0) / voucher.usageLimit) * 100)}%` }}
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="quiz-admin-item-actions">
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => handleToggleVoucher(voucher._id, !voucher.active)}
                        >
                          {voucher.active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => handleDeleteVoucher(voucher._id, voucher.code)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-note">No vouchers created yet.</p>
              )}
            </div>
          </section>
        </div>
      </section>

      <section id="section-payment-history" className="card analytics-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Revenue Tracking</p>
            <h2>📊 Payment History</h2>
          </div>
          <StatCard label="Total Transactions" value={paymentHistoryPagination.total} />
        </div>

        <div className="analytics-filters">
          <input
            className="analytics-filter-input"
            type="text"
            placeholder="Search by username..."
            value={paymentHistoryFilter.username}
            onChange={(e) => setPaymentHistoryFilter((f) => ({ ...f, username: e.target.value }))}
          />
          <select
            className="analytics-filter-select"
            value={paymentHistoryFilter.course}
            onChange={(e) => setPaymentHistoryFilter((f) => ({ ...f, course: e.target.value }))}
          >
            <option value="">All Courses</option>
            {COURSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            className="analytics-filter-select"
            value={paymentHistoryFilter.status}
            onChange={(e) => setPaymentHistoryFilter((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="created">Created</option>
            <option value="failed">Failed</option>
          </select>
          <button
            className="primary-btn"
            type="button"
            onClick={() => loadPaymentHistory(1, paymentHistoryFilter)}
            disabled={paymentHistoryLoading}
          >
            {paymentHistoryLoading ? 'Loading...' : 'Search'}
          </button>
          <button
            className="secondary-btn"
            type="button"
            onClick={() => { setPaymentHistoryFilter({ course: '', status: '', username: '' }); loadPaymentHistory(1, { course: '', status: '', username: '' }); }}
          >
            Clear
          </button>
        </div>

        <div className="analytics-section-scroll">
          {paymentHistory.length === 0 && !paymentHistoryLoading ? (
            <p className="empty-note">No payment records. Click Search to load.</p>
          ) : (
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Course</th>
                    <th>Module</th>
                    <th>Plan</th>
                    <th>Amount</th>
                    <th>Voucher</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.map((p) => (
                    <tr key={p._id}>
                      <td><strong>{p.username}</strong></td>
                      <td>{p.course}</td>
                      <td>{p.moduleName || <span className="muted-text">-</span>}</td>
                      <td>{p.planType || <span className="muted-text">-</span>}</td>
                      <td className="amount-cell">Rs {Math.round(Number(p.amountInPaise || 0) / 100)}</td>
                      <td>{p.voucherCode || <span className="muted-text">-</span>}</td>
                      <td>
                        <span className={`status-badge status-${p.status}`}>{p.status}</span>
                      </td>
                      <td className="date-cell">{new Date(p.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {paymentHistoryPagination.totalPages > 1 && (
          <div className="pagination-bar">
            <button
              className="secondary-btn pagination-btn"
              disabled={paymentHistoryPagination.page <= 1}
              onClick={() => loadPaymentHistory(paymentHistoryPagination.page - 1)}
            >← Prev</button>
            <span className="pagination-info">
              Page {paymentHistoryPagination.page} of {paymentHistoryPagination.totalPages}
            </span>
            <button
              className="secondary-btn pagination-btn"
              disabled={paymentHistoryPagination.page >= paymentHistoryPagination.totalPages}
              onClick={() => loadPaymentHistory(paymentHistoryPagination.page + 1)}
            >Next →</button>
          </div>
        )}
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

      <section id="section-audit-log" className="card analytics-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Security & Compliance</p>
            <h2>🛡️ Audit Log</h2>
          </div>
          <StatCard label="Total Events" value={auditLogPagination.total} />
        </div>

        <div className="analytics-filters">
          <input
            className="analytics-filter-input"
            type="text"
            placeholder="Filter by action (e.g. DELETE)..."
            value={auditLogFilter.action}
            onChange={(e) => setAuditLogFilter((f) => ({ ...f, action: e.target.value }))}
          />
          <input
            className="analytics-filter-input"
            type="text"
            placeholder="Filter by admin username..."
            value={auditLogFilter.actor}
            onChange={(e) => setAuditLogFilter((f) => ({ ...f, actor: e.target.value }))}
          />
          <button
            className="primary-btn"
            type="button"
            onClick={() => loadAuditLogs(1, auditLogFilter)}
            disabled={auditLogLoading}
          >
            {auditLogLoading ? 'Loading...' : 'Search'}
          </button>
          <button
            className="secondary-btn"
            type="button"
            onClick={() => { setAuditLogFilter({ action: '', actor: '' }); loadAuditLogs(1, { action: '', actor: '' }); }}
          >
            Clear
          </button>
        </div>

        <div className="analytics-section-scroll">
          {auditLogs.length === 0 && !auditLogLoading ? (
            <p className="empty-note">No audit events. Click Search to load.</p>
          ) : (
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Target Type</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log._id}>
                      <td className="date-cell">{new Date(log.createdAt).toLocaleString()}</td>
                      <td><strong>{log.actorUsername}</strong></td>
                      <td><span className="action-badge">{log.action}</span></td>
                      <td>{log.targetType}</td>
                      <td className="details-cell">
                        {Object.entries(log.details || {}).filter(([k]) => k !== 'snapshot').map(([k, v]) => (
                          <span key={k} className="detail-chip">{k}: {String(v)}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {auditLogPagination.totalPages > 1 && (
          <div className="pagination-bar">
            <button
              className="secondary-btn pagination-btn"
              disabled={auditLogPagination.page <= 1}
              onClick={() => loadAuditLogs(auditLogPagination.page - 1)}
            >← Prev</button>
            <span className="pagination-info">
              Page {auditLogPagination.page} of {auditLogPagination.totalPages}
            </span>
            <button
              className="secondary-btn pagination-btn"
              disabled={auditLogPagination.page >= auditLogPagination.totalPages}
              onClick={() => loadAuditLogs(auditLogPagination.page + 1)}
            >Next →</button>
          </div>
        )}
      </section>

      <section id="section-recovery-center" className="card analytics-card recovery-center-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Admin Recovery</p>
            <h2>♻️ Recovery Center</h2>
          </div>
          <StatCard label="Recoverable Events" value={recoveryActions.length} />
        </div>

        <div className="analytics-filters">
          <label className="recovery-date-filter" aria-label="Recovery from date">
            <span>From date</span>
            <input
              className="analytics-filter-input recovery-date-input"
              type="date"
              value={recoveryFilter.from}
              onChange={(e) => setRecoveryFilter((prev) => ({ ...prev, from: e.target.value }))}
            />
          </label>
          <label className="recovery-date-filter" aria-label="Recovery to date">
            <span>To date</span>
            <input
              className="analytics-filter-input recovery-date-input"
              type="date"
              value={recoveryFilter.to}
              onChange={(e) => setRecoveryFilter((prev) => ({ ...prev, to: e.target.value }))}
            />
          </label>
          <button
            className="primary-btn recovery-search-btn"
            type="button"
            onClick={() => loadRecoveryActions(30, recoveryFilter)}
            disabled={recoveryLoading}
          >
            {recoveryLoading ? 'Loading...' : 'Search'}
          </button>
          <button
            className="secondary-btn recovery-clear-btn"
            type="button"
            onClick={() => {
              const clearFilter = { from: '', to: '' };
              setRecoveryFilter(clearFilter);
              loadRecoveryActions(30, clearFilter);
            }}
            disabled={recoveryLoading}
          >
            Clear
          </button>
        </div>

        <div className="analytics-section-scroll">
          {recoveryActions.length === 0 && !recoveryLoading ? (
            <p className="empty-note">No recovery actions found yet.</p>
          ) : (
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Recovery</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recoveryActions.map((log) => {
                    const supported = Boolean(log?.recovery?.supported);
                    const alreadyApplied = Boolean(log?.recovery?.alreadyApplied);
                    const isApplying = recoveryApplyingId === log._id;
                    return (
                      <tr key={log._id}>
                        <td className="date-cell">{new Date(log.createdAt).toLocaleString()}</td>
                        <td><span className="action-badge">{log.action}</span></td>
                        <td>{log.targetType} {log.targetId ? `(${log.targetId})` : ''}</td>
                        <td>
                          {supported ? (
                            <button
                              type="button"
                              className="secondary-btn recovery-action-btn"
                              onClick={() => handleApplyRecoveryAction(log)}
                              disabled={alreadyApplied || isApplying || Boolean(recoveryApplyingId)}
                              aria-label={isApplying ? 'Applying recovery action' : (log?.recovery?.label || 'Apply recovery action')}
                              title={isApplying ? 'Applying...' : (log?.recovery?.label || 'Apply')}
                            >
                              <span className="recovery-action-btn-text">
                                {isApplying ? 'Applying...' : (log?.recovery?.label || 'Apply')}
                              </span>
                              <span className="recovery-action-btn-icon" aria-hidden="true">
                                {isApplying ? '…' : '↺'}
                              </span>
                            </button>
                          ) : (
                            <span className="optional-note recovery-action-note" title="Not supported" aria-label="Not supported">
                              <span className="recovery-action-note-text">Not supported</span>
                              <span className="recovery-action-note-icon" aria-hidden="true">⦸</span>
                            </span>
                          )}
                        </td>
                        <td>
                          {alreadyApplied
                            ? <span className="detail-chip">Applied</span>
                            : (supported ? <span className="detail-chip">Ready</span> : <span className="detail-chip">{log?.recovery?.reason || 'Unavailable'}</span>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
          <section className="course-modal card" role="dialog" aria-modal="true" aria-label={modalStep === 'module' ? 'Select or create module' : 'Add lecture and notes'}>
            <div className="section-header modal-header">
              <div>
                <p className="eyebrow">Course</p>
                <h2>{selectedCourse}</h2>
                {modalStep === 'upload' && selectedModule && (
                  <p className="module-breadcrumb">→ <strong>{selectedModule}</strong></p>
                )}
              </div>
              <button type="button" className="secondary-btn" onClick={closeCourseModal}>Close</button>
            </div>

            {modalStep === 'module' ? (
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
            ) : (
              <form className="course-modal-form" onSubmit={handleCreateVideo}>
                <div className="upload-form-header">
                  <button
                    type="button"
                    className="back-btn"
                    onClick={goBackToModuleStep}
                    disabled={publishingForCourse}
                    title="Go back to module selection"
                  >
                    ← Back to Modules
                  </button>
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
