import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteQuiz, fetchAdminQuizzes, requestJson, saveModuleQuiz, uploadMaterial } from '../api';
import { MAX_MATERIAL_MB } from '../constants';
import { clearSession } from '../session';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import VideoCard from '../components/VideoCard';
import ModuleManager from '../components/ModuleManager';

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
  const [videos, setVideos] = useState([]);
  const [students, setStudents] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [activeLibraryCourse, setActiveLibraryCourse] = useState('All');
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
  const [activeSection, setActiveSection] = useState('section-live-class');
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
  const [undoPopup, setUndoPopup] = useState(null);
  const [undoRemainingMs, setUndoRemainingMs] = useState(UNDO_DURATION_MS);
  const undoTimeoutRef = useRef(null);
  const undoIntervalRef = useRef(null);
  const undoActiveRef = useRef(false);
  const confirmActionRef = useRef(null);
  const bannerTimeoutRef = useRef(null);
  const quizMessageFadeTimeoutRef = useRef(null);
  const quizMessageClearTimeoutRef = useRef(null);

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

  async function refreshData() {
    setLoading(true);
    try {
      const [videoData, studentData, feedbackData] = await Promise.all([
        requestJson('/videos'),
        requestJson('/auth/users'),
        requestJson('/feedback')
      ]);
      setVideos(videoData);
      setStudents(studentData.users || []);
      setFeedback((feedbackData.feedback || []).map((item) => ({
        ...item,
        _id: item._id || item.id || `meta:${JSON.stringify({
          u: item.username,
          c: item.createdAt,
          m: item.message || ''
        })}`
      })));
      setBanner(null);
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

  async function fetchLiveStatus() {
    try {
      const data = await requestJson('/live/status');
      setLiveClass(data.active ? data : null);
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

  useEffect(() => {
    return () => {
      if (bannerTimeoutRef.current) {
        clearTimeout(bannerTimeoutRef.current);
      }
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
      if (undoIntervalRef.current) {
        clearInterval(undoIntervalRef.current);
      }
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

  function clearUndoTimers() {
    undoActiveRef.current = false;
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    if (undoIntervalRef.current) {
      clearInterval(undoIntervalRef.current);
      undoIntervalRef.current = null;
    }
  }

  function scheduleUndoPopup({ message, commit, rollback, successText }) {
    clearUndoTimers();
    undoActiveRef.current = true;

    const startedAt = Date.now();
    const action = {
      message,
      commit,
      rollback,
      successText,
      startedAt,
      expiresAt: startedAt + UNDO_DURATION_MS
    };

    setUndoPopup(action);
    setUndoRemainingMs(UNDO_DURATION_MS);

    undoIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, action.expiresAt - Date.now());
      setUndoRemainingMs(remaining);
    }, 100);

    undoTimeoutRef.current = setTimeout(async () => {
      clearUndoTimers();
      try {
        await action.commit();
        setBanner({ type: 'success', text: action.successText });
      } catch (error) {
        action.rollback?.();
        setBanner({ type: 'error', text: error?.message || 'Action failed.' });
      } finally {
        setUndoPopup(null);
      }
    }, UNDO_DURATION_MS);
  }

  function handleUndoAction() {
    if (!undoPopup && !undoActiveRef.current) return;
    clearUndoTimers();
    undoPopup.rollback?.();
    setUndoPopup(null);
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

      setVideoForm({ title: '', description: '', url: '' });
      setModalNoteFile(null);
      setCourseModalOpen(false);
      setModalStep('module');
      setSelectedModule(null);
      setBanner({ type: 'success', text: `Lecture added to ${selectedModule} in ${selectedCourse}${modalNoteFile ? ' with notes.' : '.'}` });
      await refreshData();
    } catch (error) {
      setModalMessage({ type: 'error', text: error.message });
    } finally {
      setPublishingForCourse(false);
    }
  }

  function handleModuleCreate(moduleName) {
    setCourseModules((prev) => ({
      ...prev,
      [selectedCourse]: Array.from(new Set([...(prev[selectedCourse] || []), moduleName]))
    }));
    setSelectedModule(moduleName);
    setModalStep('upload');
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
  }

  function handleDeleteVideo(videoId) {
    if (undoActiveRef.current) {
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
    if (undoActiveRef.current) {
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
    if (undoActiveRef.current) {
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

  useEffect(() => {
    const sectionIds = [
      'section-live-class',
      'section-course-manager',
      'section-registered-users',
      'section-content-library',
      'section-quiz-builder',
      'section-feedback'
    ];
    const observers = [];
    const ratios = {};
    sectionIds.forEach((id) => { ratios[id] = 0; });

    function pickActive() {
      let best = sectionIds[0];
      let bestRatio = -1;
      sectionIds.forEach((id) => { if (ratios[id] > bestRatio) { bestRatio = ratios[id]; best = id; } });
      setActiveSection(best);
    }

    sectionIds.forEach((id) => {
      const node = document.getElementById(id);
      if (!node) return;
      const obs = new IntersectionObserver(
        ([entry]) => { ratios[id] = entry.intersectionRatio; pickActive(); },
        { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
      );
      obs.observe(node);
      observers.push(obs);
    });
    return () => observers.forEach((obs) => obs.disconnect());
  }, [loading]);

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
    if (undoActiveRef.current) {
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

  const filteredVideos = activeLibraryCourse === 'All'
    ? videos
    : videos.filter((video) => (video.category || 'General') === activeLibraryCourse);

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

  return (
    <AppShell
      title="Admin Dashboard"
      subtitle="Publish lectures, attach PDF materials, and review registered student records."
      roleLabel="Admin"
      onLogout={handleLogout}
      actions={<StatCard label="Students" value={students.length} />}
    >
      {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

      <nav className="admin-nav-bar" aria-label="Jump to section">
        {[
          { id: 'section-live-class',        icon: '🔴', label: 'Live Class'    },
          { id: 'section-course-manager',    icon: '📚', label: 'Courses'       },
          { id: 'section-registered-users',  icon: '👥', label: 'Users'         },
          { id: 'section-content-library',   icon: '🎬', label: 'Library'       },
          { id: 'section-quiz-builder',      icon: '📝', label: 'Quiz Builder'  },
          { id: 'section-feedback',          icon: '💬', label: 'Feedback'      },
        ].map(({ id, icon, label }) => (
          <button
            key={id}
            type="button"
            className={`admin-nav-pill${activeSection === id ? ' active' : ''}`}
            onClick={() => scrollToSection(id)}
          >
            <span className="admin-nav-pill-icon">{icon}</span>
            <span className="admin-nav-pill-label">{label}</span>
            {activeSection === id && <span className="admin-nav-pill-dot" aria-hidden="true" />}
          </button>
        ))}
      </nav>

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
              const count = videos.filter((v) => (v.category || 'General') === course).length;
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
                    <span className="course-tile-count">{count} {count === 1 ? 'lecture' : 'lectures'}</span>
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
          <div className="student-cards-scroll">
            <div className="student-cards-grid">
              {students.length ? students.map((student) => {
                const initial = (student.username || '?')[0].toUpperCase();
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
                    <button
                      type="button"
                      className="student-remove-btn"
                      onClick={() => handleRemoveUser(student.username)}
                      disabled={Boolean(undoPopup)}
                      aria-label={`Remove ${student.username}`}
                      title="Remove user"
                    >
                      ✕
                    </button>
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
          </div>
          <StatCard label={activeLibraryCourse === 'All' ? 'Total Lectures' : 'Showing'} value={filteredVideos.length} />
        </div>

        <div className="library-scroll-body">
          {loading ? <p className="empty-state">Loading dashboard...</p> : null}
          {!loading && !filteredVideos.length ? (
            <p className="empty-state">
              {activeLibraryCourse === 'All'
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
                disableDangerActions={Boolean(undoPopup)}
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

      <section id="section-feedback" className="card feedback-list-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Student Voice</p>
            <h2>Feedback from students</h2>
          </div>
          <StatCard label="Total Feedback" value={feedback.length} />
        </div>

        {feedback.length ? (
          <div className="feedback-list">
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

      {courseModalOpen ? (
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
                isProcessing={publishingForCourse}
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
      ) : null}

      {confirmDialog.open ? (
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
      ) : null}

      {undoPopup ? (
        <aside className="undo-popup" role="status" aria-live="polite">
          <div className="undo-popup-ring" aria-hidden="true">
            <svg viewBox="0 0 40 40" className="undo-ring-svg">
              <circle className="undo-ring-track" cx="20" cy="20" r={RING_RADIUS} />
              <circle
                className="undo-ring-progress"
                cx="20"
                cy="20"
                r={RING_RADIUS}
                style={{
                  strokeDasharray: RING_CIRCUMFERENCE,
                  strokeDashoffset: RING_CIRCUMFERENCE * (1 - Math.max(0, undoRemainingMs) / UNDO_DURATION_MS)
                }}
              />
            </svg>
            <span className="undo-popup-seconds">{Math.ceil(Math.max(0, undoRemainingMs) / 1000)}</span>
          </div>
          <div className="undo-popup-content">
            <strong>{undoPopup.message}</strong>
            <span>You can undo before the timer ends.</span>
          </div>
          <button type="button" className="secondary-btn" onClick={handleUndoAction}>Undo</button>
        </aside>
      ) : null}
    </AppShell>
  );
}
