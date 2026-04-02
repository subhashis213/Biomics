import { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import { requestJson } from '../api';
import { useSessionStore } from '../stores/sessionStore';
import './BiotabChat.css';

const STARTER_PROMPTS = [
  'Create a 7-day study plan for my exam',
  'How should I prepare for GATE effectively?',
  'Explain photosynthesis in simple terms',
  'Give me a strategy to improve revision consistency'
];

const QUICK_MODES = [
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
    title: 'CSIR-NET Life Science Practice',
    action: 'Give me CSIR-NET Life Science style questions with detailed answer logic and common traps to avoid.'
  },
  { icon: BookOpen, title: 'MCQ Practice', action: 'Give me 5 quality MCQs with answers and short explanations.' }
];

function formatNow() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function getWelcomeMsg(lang) {
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

export default function StudentChatAgent() {
  const { session } = useSessionStore();
  const isLoggedIn = !!session?.token;

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [language, setLanguage] = useState('en');

  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [apiError, setApiError] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const nextIdRef = useRef(1);

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
            setMessages([{ id: 1, type: 'assistant', content: getWelcomeMsg(language), timestamp: formatNow() }]);
            nextIdRef.current = 2;
          }
          if (data.language) setLanguage(data.language);
        })
        .catch(() => {
          setMessages([{ id: 1, type: 'assistant', content: getWelcomeMsg(language), timestamp: formatNow() }]);
          nextIdRef.current = 2;
        })
        .finally(() => setHistoryLoaded(true));
    } else {
      setMessages([{ id: 1, type: 'assistant', content: getWelcomeMsg(language), timestamp: formatNow() }]);
      nextIdRef.current = 2;
      setHistoryLoaded(true);
    }
  }, [isOpen, isLoggedIn, historyLoaded, language]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [isOpen, messages]);

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
    async (question) => {
      const trimmed = question.trim();
      if (!trimmed || isTyping) return;

      const userMsg = { id: nextIdRef.current++, type: 'user', content: trimmed, timestamp: formatNow() };
      setMessages((prev) => [...prev, userMsg]);
      setInputMessage('');
      setIsTyping(true);
      setApiError(null);

      const historyForApi = messages.slice(-10).map((m) => ({
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
    [isTyping, messages, language, isLoggedIn]
  );

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputMessage);
    }
  };

  const clearChat = () => {
    setMessages([{ id: 1, type: 'assistant', content: getWelcomeMsg(language), timestamp: formatNow() }]);
    nextIdRef.current = 2;
    setApiError(null);
    if (isLoggedIn) requestJson('/chat/history', { method: 'DELETE' }).catch(() => {});
  };

  return (
    <>
      {/* ── Floating Action Button — always shows when panel is closed ── */}
      {!isOpen && (
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
      )}

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
                <h3>Biomics Hub Support</h3>
                <p>{getLanguageLabel(language)}&nbsp;·&nbsp;Live AI Help</p>
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
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="biotab-starter"
                  onClick={() => sendMessage(p)}
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
              {QUICK_MODES.map(({ icon: Icon, title, action }) => (
                <button
                  key={title}
                  className="biotab-mode-chip"
                  type="button"
                  onClick={() => sendMessage(action)}
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
                  language === 'hi'
                    ? 'कुछ भी पूछें: पढ़ाई, GATE, रणनीति…'
                    : language === 'or'
                      ? 'କିଛି ପଚାରନ୍ତୁ: ପଢ଼ା, GATE, ପ୍ଲାନିଂ, କନ୍ସେପ୍ଟ…'
                      : 'Ask anything: studies, GATE, planning, concepts…'
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
              <span>Gemini AI · {isLoggedIn ? 'History saved to your account' : 'Log in to save history'}</span>
            </div>
          </div>
          </div>
        </>
      )}
    </>
  );
}

