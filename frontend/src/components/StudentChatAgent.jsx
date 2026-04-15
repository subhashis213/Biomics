import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  Bot,
  FlaskConical,
  Leaf,
  Maximize2,
  Microscope,
  Minimize2,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  User,
  X
} from 'lucide-react';
import { fetchStudentAnnouncements, requestJson } from '../api';
import { useSessionStore } from '../stores/sessionStore';
import './BiotabChat.css';

const STUDENT_STARTER_PROMPTS = [
  'Is this module available for my course?',
  'Which topics are created in this module?',
  'Is there any monthly exam available now?',
  'Show the quiz sections available for now'
];

const ADMIN_STARTER_PROMPTS = [
  'Show full profile and scores of student [username]',
  'How many times did each student attempt the quiz section module wise?',
  'Show monthly exam scores and attempt count for all students',
  'Show test series topic test scores module wise for student [username]',
  'Which students gave full mock test and what are their scores?',
  'Open the audit logs and recent activity',
  'How many students are registered and what courses they purchased?',
  'Show platform wide attempt count for all sections'
];

const STUDENT_QUICK_MODES = [
  { icon: Leaf, title: 'Concept Help', action: 'Explain this concept in simple, exam-friendly language with examples.' },
  { icon: Microscope, title: 'Study Plan', action: 'Create a practical 10-day plan with daily targets and revision slots.' },
  {
    icon: BookOpen,
    title: 'NEET MCQ Drill',
    action: 'Give me 10 realistic NEET biology MCQs with 4 options, correct answer, and short explanation.'
  },
  {
    icon: FlaskConical,
    title: 'GATE Strategy',
    action: 'Design a focused GATE preparation strategy with topic priorities, weekly milestones, and revision cycles.'
  },
  {
    icon: Microscope,
    title: 'CSIR-NET Practice',
    action: 'Give me CSIR-NET Life Science style questions with detailed answer logic and common traps to avoid.'
  },
  { icon: BookOpen, title: 'MCQ Practice', action: 'Give me 5 quality MCQs with answers and short explanations.' }
];

const ADMIN_QUICK_MODES = [
  { icon: User, title: 'Student Details', action: 'Show all registered students with their class, city, phone, email, purchased courses, and total attempt count.' },
  { icon: BookOpen, title: 'Quiz Scores', action: 'Show quiz section attempt count and module wise average score for all students.' },
  { icon: FlaskConical, title: 'Exam Results', action: 'Show monthly exam attempt count and best score percentage for all students.' },
  { icon: Microscope, title: 'Test Series', action: 'Show test series topic test and full mock test attempt count and best scores for all students.' },
  { icon: Settings, title: 'Recent Logs', action: 'Show recent audit logs and content creation activity.' },
  { icon: Leaf, title: 'Content Status', action: 'Show how many videos, quizzes, topic tests, and modules are published right now.' }
];

const DEFAULT_WHATSAPP_MESSAGE = 'Hi Biomics Hub, I need support.';

function formatNow() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function getWelcomeMsg(lang, role = 'user') {
  if (role === 'admin') {
    if (lang === 'hi') {
      return 'मैं आपकी admin assistant हूं। मुझसे students, logs, quizzes, videos और navigation के बारे में पूछ सकते हैं।';
    }
    if (lang === 'or') {
      return 'ମୁଁ ଆପଣଙ୍କ admin assistant। students, logs, quizzes, videos ଏବଂ navigation ବିଷୟରେ ପଚାରନ୍ତୁ।';
    }
    return 'I am your admin assistant. Ask me about students, logs, quizzes, videos, and navigation.';
  }

  if (lang === 'hi') {
    return 'मैं Sonupriya Sahu हूं, मुझसे कुछ भी पूछिए। मैं आपकी tutor हूं।';
  }
  if (lang === 'or') {
    return 'ମୁଁ Sonupriya Sahu। ମତେ ଯେକୌଣସି ପ୍ରଶ୍ନ ପଚାରନ୍ତୁ, ମୁଁ ଆପଣଙ୍କ tutor।';
  }
  return 'I am Sonupriya Sahu. Ask me anything, I am your tutor.';
}

function getLanguageLabel(lang) {
  if (lang === 'hi') return 'हिंदी';
  if (lang === 'or') return 'ଓଡ଼ିଆ';
  return 'English';
}

function extractRequestedTopic(message) {
  const raw = String(message || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';

  const patterns = [
    /\b(?:for|about|on)\s+(?:the\s+)?(?:topic\s+of\s+|topic\s+)?([a-z][a-z0-9&/+\-\s]{2,60})$/i,
    /\btopic\s*[:\-]?\s*([a-z][a-z0-9&/+\-\s]{2,60})/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const value = String(match?.[1] || '')
      .replace(/\b(test\s*series|topic\s*tests?|full\s*mocks?|mock\s*tests?)\b/gi, '')
      .trim();
    if (value && !/^(this|that|it)$/i.test(value)) return value;
  }

  return '';
}

function getStudentNavigationIntent(message) {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) return null;

  const wantsNavigation = /(open|show|go to|take me to|navigate|bring up|start)/i.test(normalized);
  const mentionsTestSeries = /test\s*series|topic\s*tests?|mock\s*tests?|full\s*mocks?/i.test(normalized);

  if (!wantsNavigation || !mentionsTestSeries) return null;

  const tab = /full\s*mocks?|mock\s*tests?/.test(normalized) && !/topic\s*tests?/.test(normalized)
    ? 'mock'
    : 'topic';

  return {
    destination: 'test-series',
    tab,
    topic: tab === 'topic' ? extractRequestedTopic(message) : ''
  };
}

function getAdminNavigationIntent(message) {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) return null;

  const wantsNavigation = /(open|show|go to|take me to|navigate|bring up|start|view|check|manage)/i.test(normalized);
  if (!wantsNavigation) return null;

  if (/student|learner|registered user|user details/.test(normalized)) {
    return { destination: 'admin-section', route: '/admin', sectionId: 'section-registered-users', reply: 'Opening the learner details section now.' };
  }
  if (/live class|go live|scheduled class/.test(normalized)) {
    return { destination: 'admin-section', route: '/admin', sectionId: 'section-live-class', reply: 'Opening the live class section now.' };
  }
  if (/content library|video|lecture|materials/.test(normalized)) {
    return { destination: 'admin-route', route: '/admin/content-library', reply: 'Opening the content library now.' };
  }
  if (/community chat|student chat|chat room/.test(normalized)) {
    return { destination: 'admin-route', route: '/admin/community-chat', reply: 'Opening the community chat now.' };
  }
  if (/quiz builder|create quiz|quiz workspace/.test(normalized)) {
    return { destination: 'admin-route', route: '/admin/quiz-builder', reply: 'Opening the quiz workspace now.' };
  }
  if (/monthly exam|mock exam|exam workspace/.test(normalized)) {
    return { destination: 'admin-route', route: '/admin/mock-exams', reply: 'Opening the monthly exam workspace now.' };
  }
  if (/test series/.test(normalized)) {
    return { destination: 'admin-route', route: '/admin/test-series', reply: 'Opening the test series workspace now.' };
  }
  if (/announcement/.test(normalized)) {
    return { destination: 'admin-route', route: '/admin/announcements-workspace', reply: 'Opening the announcements workspace now.' };
  }
  if (/voucher/.test(normalized)) {
    return { destination: 'admin-route', route: '/admin/voucher-workspace', reply: 'Opening the voucher workspace now.' };
  }
  if (/pricing|price setup|payment settings/.test(normalized)) {
    return { destination: 'admin-route', route: '/admin/pricing-workspace', reply: 'Opening the pricing workspace now.' };
  }
  if (/revenue|payment history|transactions/.test(normalized)) {
    return { destination: 'admin-route', route: '/admin/revenue-tracking', reply: 'Opening the revenue tracking page now.' };
  }
  if (/audit|logs|activity/.test(normalized)) {
    return { destination: 'admin-route', route: '/admin/audit-log', reply: 'Opening the audit log page now.' };
  }
  if (/recovery|rollback|restore/.test(normalized)) {
    return { destination: 'admin-route', route: '/admin/recovery-center', reply: 'Opening the recovery center now.' };
  }

  return null;
}

function getLocalNavigationIntent(message, role = 'user') {
  return role === 'admin'
    ? getAdminNavigationIntent(message)
    : getStudentNavigationIntent(message);
}

export default function StudentChatAgent({ hideAnnouncementFab = false, mode }) {
  return <StudentChatAgentPanel hideAnnouncementFab={hideAnnouncementFab} mode={mode} />;
}

export function StudentAnnouncementBell() {
  const { session } = useSessionStore();
  const isLoggedIn = !!session?.token;
  const [open, setOpen] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const openedAtRef = useRef(0);

  const activeAnnouncementCount = announcements.length;
  const shouldRingAnnouncement = activeAnnouncementCount > 0 && !open;

  const loadAnnouncements = useCallback(async () => {
    if (!isLoggedIn) {
      setAnnouncements([]);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await fetchStudentAnnouncements();
      setAnnouncements(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load announcements.');
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!isLoggedIn) return null;

  const announcementOverlay = open && typeof document !== 'undefined'
    ? createPortal(
      <>
        <button
          type="button"
          className="biotab-announcement-inline-backdrop"
          aria-label="Close announcements"
          onClick={() => {
            if (Date.now() - openedAtRef.current < 180) return;
            setOpen(false);
          }}
        />
        <div
          className="biotab-announcement-panel biotab-announcement-panel-inline"
          role="dialog"
          aria-label="Student announcements"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="biotab-announcement-head">
            <strong>Announcements</strong>
            <button
              type="button"
              className="biotab-announcement-close"
              onClick={() => setOpen(false)}
              aria-label="Close announcements"
            >
              <X size={14} />
            </button>
          </div>

          {loading ? <p className="biotab-announcement-empty">Loading announcements...</p> : null}
          {!loading && error ? <p className="biotab-announcement-empty">{error}</p> : null}

          {!loading && !error ? (
            announcements.length ? (
              <div className="biotab-announcement-list">
                {announcements.map((item) => (
                  <article key={item._id} className="biotab-announcement-item">
                    <h4>{item.title}</h4>
                    <p>{item.message}</p>
                    <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="biotab-announcement-empty">No announcements yet.</p>
            )
          ) : null}
        </div>
      </>,
      document.body
    )
    : null;

  return (
    <div className={`biotab-announcement-inline-wrap${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className={`biotab-announcement-header-btn${shouldRingAnnouncement ? ' biotab-announcement-fab-ringing' : ''}`}
        title="View announcements"
        aria-label="View admin announcements"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => {
            const nextOpen = !current;
            if (nextOpen) {
              openedAtRef.current = Date.now();
              loadAnnouncements();
            }
            return nextOpen;
          });
        }}
      >
        <Bell size={18} />
        {activeAnnouncementCount > 0 ? (
          <span className="biotab-announcement-count">{activeAnnouncementCount > 9 ? '9+' : activeAnnouncementCount}</span>
        ) : null}
      </button>
      {announcementOverlay}
    </div>
  );
}

function StudentChatAgentPanel({ hideAnnouncementFab = false, mode }) {
  const navigate = useNavigate();
  const { session } = useSessionStore();
  const isLoggedIn = !!session?.token;
  const userRole = mode || (session?.role === 'admin' ? 'admin' : 'user');
  const isAdminMode = userRole === 'admin';
  const starterPrompts = isAdminMode ? ADMIN_STARTER_PROMPTS : STUDENT_STARTER_PROMPTS;
  const quickModes = isAdminMode ? ADMIN_QUICK_MODES : STUDENT_QUICK_MODES;
  const assistantTitle = isAdminMode ? 'Biomics Admin Assistant' : 'Biomics Hub Support';
  const assistantSubtitle = isAdminMode ? 'Live admin AI help' : 'Live AI Help';

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [language, setLanguage] = useState('en');

  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [announcementsError, setAnnouncementsError] = useState('');

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const nextIdRef = useRef(1);

  const whatsappNumber = String(import.meta.env.VITE_BIOMICS_WHATSAPP_NUMBER || '').replace(/\D/g, '');
  const whatsappMessage = String(import.meta.env.VITE_BIOMICS_WHATSAPP_MESSAGE || DEFAULT_WHATSAPP_MESSAGE).trim();
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage || DEFAULT_WHATSAPP_MESSAGE)}`
    : '';

  const activeAnnouncementCount = announcements.length;
  const shouldRingAnnouncement = activeAnnouncementCount > 0 && !announcementsOpen;

  const loadAnnouncements = useCallback(async () => {
    if (!isLoggedIn || isAdminMode || hideAnnouncementFab) {
      setAnnouncements([]);
      return;
    }

    setAnnouncementsLoading(true);
    setAnnouncementsError('');
    try {
      const data = await fetchStudentAnnouncements();
      setAnnouncements(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch (error) {
      setAnnouncementsError(error.message || 'Failed to load announcements.');
    } finally {
      setAnnouncementsLoading(false);
    }
  }, [hideAnnouncementFab, isAdminMode, isLoggedIn]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  // Load history when panel first opens
  useEffect(() => {
    if (!isOpen || historyLoaded) return;

    if (isLoggedIn) {
      requestJson('/chat/history')
        .then((data) => {
          if (data.messages?.length > 0) {
            const mapped = data.messages.map((m, i) => ({
              id: i + 1,
              type: m.role === 'user' ? 'user' : 'assistant',
              content: m.content,
              timestamp: formatNow()
            }));
            nextIdRef.current = mapped.length + 1;
            setMessages(mapped);
          } else {
            setMessages([{ id: 1, type: 'assistant', content: getWelcomeMsg(language, userRole), timestamp: formatNow() }]);
            nextIdRef.current = 2;
          }
          if (data.language) setLanguage(data.language);
        })
        .catch(() => {
          setMessages([{ id: 1, type: 'assistant', content: getWelcomeMsg(language, userRole), timestamp: formatNow() }]);
          nextIdRef.current = 2;
        })
        .finally(() => setHistoryLoaded(true));
    } else {
      setMessages([{ id: 1, type: 'assistant', content: getWelcomeMsg(language, userRole), timestamp: formatNow() }]);
      nextIdRef.current = 2;
      setHistoryLoaded(true);
    }
  }, [isOpen, isLoggedIn, historyLoaded, language]);

  useEffect(() => {
    if (isOpen) {
      setAnnouncementsOpen(false);
      scrollToBottom();
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [isOpen, messages]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  // Listen for admin "Clear All AI Tutor History" event and wipe local state.
  useEffect(() => {
    const handleHistoryCleared = () => {
      setMessages([{ id: 1, type: 'assistant', content: getWelcomeMsg(language, userRole), timestamp: formatNow() }]);
      nextIdRef.current = 2;
      setHistoryLoaded(false);
      setApiError(null);
    };
    window.addEventListener('biomics-chat-history-cleared', handleHistoryCleared);
    return () => window.removeEventListener('biomics-chat-history-cleared', handleHistoryCleared);
  }, [language, userRole]);

  // Prevent background page scrolling when chat is open.
  useEffect(() => {
    if (!isOpen) return undefined;

    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;

    body.dataset.chatScrollY = String(scrollY);
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';

    return () => {
      const y = Number(body.dataset.chatScrollY || '0');
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      body.style.overflow = '';
      html.style.overflow = '';
      delete body.dataset.chatScrollY;
      window.scrollTo(0, y);
    };
  }, [isOpen]);

  const sendMessage = useCallback(
    async (question, { skipNavigation = false } = {}) => {
      const trimmed = question.trim();
      if (!trimmed || isTyping) return;

      const userMsg = { id: nextIdRef.current++, type: 'user', content: trimmed, timestamp: formatNow() };
      setMessages((prev) => [...prev, userMsg]);
      setInputMessage('');
      setApiError(null);

      const localIntent = skipNavigation ? null : getLocalNavigationIntent(trimmed, userRole);
      if (localIntent?.destination === 'test-series') {
        const params = new URLSearchParams();
        params.set('tab', localIntent.tab);
        if (localIntent.topic) params.set('topic', localIntent.topic);

        navigate('/student/test-series?' + params.toString(), {
          state: {
            fromChatAgent: true,
            tab: localIntent.tab,
            focusTopic: localIntent.topic || ''
          }
        });

        const actionReply = localIntent.tab === 'mock'
          ? 'Opening the Full Mock Test section for you now.'
          : localIntent.topic
            ? `Opening the Topic Test section for ${localIntent.topic} now.`
            : 'Opening the Topic Test section for you now.';

        const botMsg = { id: nextIdRef.current++, type: 'assistant', content: actionReply, timestamp: formatNow() };
        setMessages((prev) => [...prev, botMsg]);
        return;
      }

      if (localIntent?.destination === 'admin-route' || localIntent?.destination === 'admin-section') {
        navigate(localIntent.route || '/admin');
        if (localIntent.sectionId) {
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('biomics-admin-chat-navigate', {
              detail: { targetId: localIntent.sectionId }
            }));
          }, 120);
        }

        const botMsg = {
          id: nextIdRef.current++,
          type: 'assistant',
          content: localIntent.reply || 'Opening that admin area now.',
          timestamp: formatNow()
        };
        setMessages((prev) => [...prev, botMsg]);
        return;
      }

      setIsTyping(true);

      const historyForApi = messages.slice(-20).map((m) => ({
        role: m.type === 'user' ? 'user' : 'assistant',
        content: m.content
      }));

      try {
        let answer;
        if (isLoggedIn) {
          const data = await requestJson('/chat/ask', {
            method: 'POST',
            body: JSON.stringify({ question: trimmed, language, history: historyForApi })
          });
          answer = data.answer;
        } else {
          await new Promise((r) => setTimeout(r, 500));
          answer =
            language === 'hi'
              ? 'AI उत्तर पाने के लिए कृपया लॉग इन करें। लॉग इन के बाद Gemini AI से सटीक उत्तर मिलेंगे।'
              : language === 'or'
                ? 'AI ଉତ୍ତର ପାଇବାକୁ ଦୟାକରି ଲଗଇନ କରନ୍ତୁ। ଲଗଇନ ପରେ Gemini AI ରୁ ଭଲ ଉତ୍ତର ମିଳିବ।'
                : 'Please log in to get full AI-powered answers from Gemini. Your conversation history will also be saved to your account.';
        }

        const botMsg = { id: nextIdRef.current++, type: 'assistant', content: answer, timestamp: formatNow() };
        setMessages((prev) => [...prev, botMsg]);
      } catch (err) {
        setApiError(err.message || 'Could not reach AI. Check connection or GEMINI_API_KEY.');
      } finally {
        setIsTyping(false);
      }
    },
    [isTyping, messages, language, isLoggedIn, navigate, userRole]
  );

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputMessage);
    }
  };

  const clearChat = () => {
    setMessages([{ id: 1, type: 'assistant', content: getWelcomeMsg(language, userRole), timestamp: formatNow() }]);
    nextIdRef.current = 2;
    setApiError(null);
    if (isLoggedIn) requestJson('/chat/history', { method: 'DELETE' }).catch(() => {});
  };

  return (
    <>
      {/* ── Floating Action Button — always shows when panel is closed ── */}
      {!isOpen && (
        <>
        {isLoggedIn && !hideAnnouncementFab && !isAdminMode ? (
          <button
            type="button"
            className={`biotab-announcement-fab${shouldRingAnnouncement ? ' biotab-announcement-fab-ringing' : ''}`}
            title="View announcements"
            aria-label="View admin announcements"
            onClick={() => {
              setAnnouncementsOpen((current) => !current);
              if (!announcementsOpen) loadAnnouncements();
            }}
          >
            <Bell size={19} />
            {activeAnnouncementCount > 0 ? (
              <span className="biotab-announcement-count">{activeAnnouncementCount > 9 ? '9+' : activeAnnouncementCount}</span>
            ) : null}
          </button>
        ) : null}
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="biotab-whatsapp-fab"
            title="Chat on WhatsApp"
            aria-label="Open WhatsApp chat with Biomics Hub"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </a>
        ) : null}
        <button
          className="biotab-fab"
          onClick={() => { setIsOpen(true); setShowSettings(false); }}
          title="Open Biomics Hub Support"
          type="button"
          aria-label="Open Biomics Hub Support chat"
        >
          <Bot size={22} />
          <span className="biotab-fab-ring" aria-hidden="true" />
        </button>
        </>
      )}

      {!isOpen && announcementsOpen ? (
        <div className="biotab-announcement-panel" role="dialog" aria-label="Student announcements">
          <div className="biotab-announcement-head">
            <strong>Announcements</strong>
            <button
              type="button"
              className="biotab-announcement-close"
              onClick={() => setAnnouncementsOpen(false)}
              aria-label="Close announcements"
            >
              <X size={14} />
            </button>
          </div>

          {announcementsLoading ? <p className="biotab-announcement-empty">Loading announcements...</p> : null}
          {!announcementsLoading && announcementsError ? <p className="biotab-announcement-empty">{announcementsError}</p> : null}

          {!announcementsLoading && !announcementsError ? (
            announcements.length ? (
              <div className="biotab-announcement-list">
                {announcements.map((item) => (
                  <article key={item._id} className="biotab-announcement-item">
                    <h4>{item.title}</h4>
                    <p>{item.message}</p>
                    <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="biotab-announcement-empty">No announcements yet.</p>
            )
          ) : null}
        </div>
      ) : null}

      {/* ── Chat Panel — shown when open ── */}
      {isOpen && (
        <>
          <button
            className="biotab-backdrop"
            type="button"
            aria-label="Close support panel"
            onClick={() => {
              setIsOpen(false);
              setIsExpanded(false);
            }}
          />
          <div
            className={`biotab-panel${isExpanded ? ' expanded' : ''}`}
            role="dialog"
            aria-label="Biomics Hub Support chat"
          >
          {/* Header */}
          <div className="biotab-header">
            <div className="biotab-branding">
              <div className="biotab-avatar" aria-hidden="true">
                <Bot size={16} />
              </div>
              <div className="biotab-title-block">
                <h3>{assistantTitle}</h3>
                <p>{getLanguageLabel(language)}&nbsp;·&nbsp;{assistantSubtitle}</p>
              </div>
            </div>

            <div className="biotab-actions">
              <button
                className={`biotab-ctrl${showSettings ? ' active' : ''}`}
                onClick={() => setShowSettings((v) => !v)}
                title="Settings"
                type="button"
                aria-pressed={showSettings}
              >
                <Settings size={15} />
              </button>
              <button
                className="biotab-ctrl"
                onClick={() => setIsExpanded((v) => !v)}
                title={isExpanded ? 'Compact view' : 'Expand'}
                type="button"
              >
                {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
              <button
                className="biotab-ctrl danger"
                onClick={() => { setIsOpen(false); setIsExpanded(false); }}
                title="Close"
                type="button"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Settings Drawer */}
          {showSettings && (
            <div className="biotab-settings">
              <div className="biotab-setting-row">
                <span className="biotab-setting-label">Language</span>
                <div className="biotab-lang-toggle">
                  {[{ val: 'en', label: 'EN' }, { val: 'hi', label: 'हिं' }, { val: 'or', label: 'ଓଡ଼' }].map(({ val, label }) => (
                    <button
                      key={val}
                      className={`biotab-lang-btn${language === val ? ' active' : ''}`}
                      onClick={() => { setLanguage(val); setShowSettings(false); }}
                      type="button"
                    >{label}</button>
                  ))}
                </div>
              </div>

              <button className="biotab-clear-btn" onClick={clearChat} type="button">
                <RotateCcw size={12} /><span>Clear conversation</span>
              </button>
            </div>
          )}

          {/* Starter prompts — only before real conversation begins */}
          {!showSettings && messages.length <= 2 && (
            <div className="biotab-starters">
              {starterPrompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="biotab-starter"
                  onClick={() => sendMessage(p, { skipNavigation: isAdminMode })}
                  disabled={isTyping}
                >{p}</button>
              ))}
            </div>
          )}

          {/* Messages */}
          <div className="biotab-messages">
            {messages.map((m) => (
              <article key={m.id} className={`biotab-msg ${m.type}`}>
                <div className="biotab-msg-av" aria-hidden="true">
                  {m.type === 'assistant' ? <Bot size={13} /> : <User size={13} />}
                </div>
                <div className="biotab-msg-body">
                  <p>{m.content}</p>
                  <time>{m.timestamp}</time>
                </div>
              </article>
            ))}

            {isTyping && (
              <article className="biotab-msg assistant">
                <div className="biotab-msg-av" aria-hidden="true"><Bot size={13} /></div>
                <div className="biotab-msg-body">
                  <div className="biotab-dots" aria-label="Thinking"><span /><span /><span /></div>
                </div>
              </article>
            )}

            {apiError && <div className="biotab-error">{apiError}</div>}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick mode chips */}
          {!showSettings && (
            <div className="biotab-modes">
              {quickModes.map(({ icon: Icon, title, action }) => (
                <button
                  key={title}
                  className="biotab-mode-chip"
                  type="button"
                  onClick={() => sendMessage(action, { skipNavigation: true })}
                  disabled={isTyping}
                >
                  <Icon size={12} /><span>{title}</span>
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="biotab-input-area">
            <div className="biotab-input-row">
              <textarea
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isAdminMode
                    ? (language === 'hi'
                        ? 'पूछें: students, logs, quizzes, navigation…'
                        : language === 'or'
                          ? 'ପଚାରନ୍ତୁ: students, logs, quizzes, navigation…'
                          : 'Ask about students, logs, quizzes, navigation…')
                    : (language === 'hi'
                        ? 'कुछ भी पूछें: पढ़ाई, GATE, रणनीति…'
                        : language === 'or'
                          ? 'କିଛି ପଚାରନ୍ତୁ: ପଢ଼ା, GATE, ପ୍ଲାନିଂ, କନ୍ସେପ୍ଟ…'
                          : 'Ask anything: studies, GATE, planning, concepts…')
                }
                rows={1}
                disabled={isTyping}
                aria-label="Chat input"
              />
              <button
                onClick={() => sendMessage(inputMessage)}
                disabled={!inputMessage.trim() || isTyping}
                className="biotab-send"
                type="button"
                title="Send (Enter)"
              >
                <Send size={15} />
              </button>
            </div>
            <div className="biotab-footer-note">
              <Sparkles size={11} aria-hidden="true" />
              <span>Gemini AI · {isLoggedIn ? (isAdminMode ? 'Admin history saved' : 'History saved to your account') : 'Log in to save history'}</span>
            </div>
          </div>
          </div>
        </>
      )}
    </>
  );
}

