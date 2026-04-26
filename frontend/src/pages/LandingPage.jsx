import { useEffect, useRef, useState, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { getSession } from '../session';
import logoImg from '../assets/biomics-logo.jpeg';
import posterTestSeries from '../assets/poster-test-series.jpeg';
import posterLifeScience from '../assets/poster-life-science.jpeg';
import posterBatch from '../assets/poster-batch.jpeg';
import { fetchStudentVoicesPublic } from '../api';
import { useThemeStore } from '../stores/themeStore';

const LANDING_STATS = [
  { target: 500, label: 'Video Lectures', suffix: '+' },
  { target: 200, label: 'Practice Quizzes', suffix: '+' },
  { target: 50, label: 'Mock Tests', suffix: '+' },
  { target: 1000, label: 'Students Learning', suffix: '+' },
];

const POSTERS = [
  {
    src: posterTestSeries,
    alt: 'CSIR NET 2026 Test Series – Topic Wise, Full Length, PYQ Included',
    label: 'Test Series',
    tag: 'CSIR NET 2026',
  },
  {
    src: posterLifeScience,
    alt: 'CSIR NET Life Science – Recorded Classes, Complete Syllabus, PYQ Session',
    label: 'Life Science Course',
    tag: 'Recorded + Live',
  },
  {
    src: posterBatch,
    alt: 'Batch 1.0 for CSIR NET DEC 2026 – Live & Recorded, PDF Notes, Test Series',
    label: 'Batch 1.0',
    tag: 'DEC 2026',
  },
];

const FALLBACK_STUDENT_VOICES = [
  { _id: 'voice-1', name: 'Priya Singh', role: 'CSIR NET Aspirant', rating: 5, message: 'The mock tests and analytics made my preparation structured and confident.' },
  { _id: 'voice-2', name: 'Rohit Patel', role: 'Life Science Student', rating: 5, message: 'Live classes are super interactive, and doubts get solved very quickly.' },
  { _id: 'voice-3', name: 'Anjali Sharma', role: 'Biotech Learner', rating: 4, message: 'Topic-wise practice and revision flow helped me improve every week.' },
  { _id: 'voice-4', name: 'Devansh Verma', role: 'NET Candidate', rating: 5, message: 'I love the course structure. It keeps me focused and consistent daily.' },
  { _id: 'voice-5', name: 'Sneha Nair', role: 'Final Year Student', rating: 5, message: 'Community support and teacher guidance gave me real exam confidence.' }
];

const FEATURE_CARDS = [
  {
    icon: '🎥',
    title: 'Daily Live Class',
    desc: 'Attend structured daily live classes with mentor-led concept clarity and real-time doubt solving.',
    color: '#6366f1',
  },
  {
    icon: '📝',
    title: 'Practice Live Class',
    desc: 'Join problem-practice live sessions focused on exam patterns, speed, and accuracy under pressure.',
    color: '#f97316',
  },
  {
    icon: '🌍',
    title: 'Learn Anytime Anywhere',
    desc: 'Access premium recordings, smart revision modules, and performance insights from any device.',
    color: '#10b981',
  },
];

const BIOMICS_MISSION_COPY = `At Biomics Hub, we deliver an exceptional learning experience through comprehensive video tutorials that cover every aspect of Biology. Our content supports core science studies and competitive pathways including IIT JAM, CSIR NET, GAT-B, TIFR, CUET, DBT, ICMR, ICAR, and GATE. Our curriculum starts from strong fundamentals and progressively advances to in-depth concepts for every stage of preparation.`;
const BIOMICS_FOOTER_COPY = `Biomics Hub offers structured video learning for core science and top competitive exams like IIT JAM, CSIR NET, GAT-B, TIFR, CUET, DBT, ICMR, ICAR, and GATE. Learn from fundamentals to advanced concepts with a clear, progressive path.`;

function SocialIcon({ kind }) {
  if (kind === 'instagram') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" />
      </svg>
    );
  }
  if (kind === 'telegram') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 2L11 13" />
        <path d="M22 2L15 22l-4-9-9-4z" />
      </svg>
    );
  }
  if (kind === 'whatsapp') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z" />
        <path d="M9.5 9.5c.4-1 1-.9 1.3-.8.3.1.8.7.9 1 .1.3.1.6-.1.9l-.4.6c-.1.2 0 .5.2.8.3.5.8 1 1.3 1.3.3.2.6.3.8.2l.6-.4c.3-.2.6-.2.9-.1.3.1.9.6 1 1 .1.3.2.9-.8 1.3-.9.4-2.1.2-3.7-.8a8.3 8.3 0 0 1-2.1-2.1c-1-1.6-1.2-2.8-.8-3.7z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useThemeStore();
  const isLightTheme = theme === 'light';
  const androidAppUrl = String(import.meta.env.VITE_ANDROID_APP_URL || '').trim() || 'https://play.google.com/store';
  const iosAppUrl = String(import.meta.env.VITE_IOS_APP_URL || '').trim() || 'https://www.apple.com/app-store/';
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  // Redirect already-authenticated users to their dashboard
  const session = getSession();
  if (session?.token && session?.role) {
    return <Navigate to={session.role === 'admin' ? '/admin' : '/student'} replace />;
  }
  const pageRef = useRef(null);
  const statsRef = useRef(null);
  const countStartedRef = useRef(false);

  /* ── Slideshow state ─────────────────────── */
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused]       = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [studentVoices, setStudentVoices] = useState(FALLBACK_STUDENT_VOICES);
  const [hoveredBrandLetter, setHoveredBrandLetter] = useState(null);
  const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);
  const [statNumbers, setStatNumbers] = useState(
    () => LANDING_STATS.map((item) => Math.max(0, item.target - 100))
  );
  const autoRef = useRef(null);
  const featureTrackRef = useRef(null);
  const SLIDE_INTERVAL = 3200;

  const goTo = useCallback((idx) => {
    setActiveSlide(((idx % POSTERS.length) + POSTERS.length) % POSTERS.length);
  }, []);

  const prev = useCallback(() => {
    setActiveSlide((s) => ((s - 1) + POSTERS.length) % POSTERS.length);
  }, []);

  const next = useCallback(() => {
    setActiveSlide((s) => (s + 1) % POSTERS.length);
  }, []);

  // Auto-advance; pauses on hover
  useEffect(() => {
    if (isPaused) return;
    autoRef.current = setInterval(() => {
      setActiveSlide((s) => (s + 1) % POSTERS.length);
    }, SLIDE_INTERVAL);
    return () => clearInterval(autoRef.current);
  }, [isPaused]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    }
    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    fetchStudentVoicesPublic()
      .then((response) => {
        if (cancelled) return;
        const apiVoices = Array.isArray(response?.voices) ? response.voices : [];
        setStudentVoices(apiVoices.length ? apiVoices : FALLBACK_STUDENT_VOICES);
      })
      .catch(() => {
        if (!cancelled) setStudentVoices(FALLBACK_STUDENT_VOICES);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const track = featureTrackRef.current;
    if (!track) return;

    function handleScroll() {
      const cards = Array.from(track.querySelectorAll('.lp-feature-card'));
      if (!cards.length) return;
      const midpoint = track.scrollLeft + (track.clientWidth / 2);
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      cards.forEach((card, index) => {
        const center = card.offsetLeft + (card.clientWidth / 2);
        const distance = Math.abs(center - midpoint);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      setActiveFeatureIndex(nearestIndex);
    }

    track.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => track.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollFeatureTo = useCallback((index) => {
    const track = featureTrackRef.current;
    if (!track) return;
    const safeIndex = Math.max(0, Math.min(FEATURE_CARDS.length - 1, index));
    const cards = Array.from(track.querySelectorAll('.lp-feature-card'));
    const card = cards[safeIndex];
    if (!card) return;
    track.scrollTo({
      left: card.offsetLeft - Math.max(0, (track.clientWidth - card.clientWidth) / 2),
      behavior: 'smooth',
    });
  }, []);

  const handleFeatureKeyNav = useCallback((event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      scrollFeatureTo(activeFeatureIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      scrollFeatureTo(activeFeatureIndex - 1);
    }
  }, [activeFeatureIndex, scrollFeatureTo]);

  useEffect(() => {
    const minY = 120;
    let lastY = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;

      if (y <= minY) {
        lastY = y;
        setShowScrollTop(false);
        return;
      }

      const delta = y - lastY;
      lastY = y;

      // Show immediately when user scrolls up; hide when scrolling down.
      if (delta < 0) {
        setShowScrollTop(true);
      } else if (delta > 0) {
        setShowScrollTop(false);
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const node = statsRef.current;
    if (!node) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animateCounts = () => {
      if (countStartedRef.current) return;
      countStartedRef.current = true;

      if (prefersReducedMotion) {
        setStatNumbers(LANDING_STATS.map((item) => item.target));
        return;
      }

      const starts = LANDING_STATS.map((item) => Math.max(0, item.target - 100));
      const durationMs = 1400;
      const t0 = performance.now();

      const tick = (ts) => {
        const progress = Math.min(1, (ts - t0) / durationMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        setStatNumbers(
          LANDING_STATS.map((item, i) => Math.round(starts[i] + (item.target - starts[i]) * eased))
        );
        if (progress < 1) window.requestAnimationFrame(tick);
      };

      window.requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounts();
            observer.disconnect();
          }
        });
      },
      { threshold: 0.25 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Scroll reveal — IntersectionObserver fires just before element enters viewport
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;
    const page = pageRef.current;
    if (!page) return;

    const seen = new WeakSet();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('lp-in-view');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0, rootMargin: '0px 0px 12% 0px' }
    );

    let batchIdx = 0;
    const addTargets = () => {
      page.querySelectorAll('.lp-reveal').forEach((node) => {
        if (seen.has(node)) return;
        seen.add(node);
        const rect = node.getBoundingClientRect();
        if (rect.top < window.innerHeight * 1.08) {
          node.classList.add('lp-in-view'); // already visible — show immediately, no animation
          return;
        }
        const shiftX = batchIdx % 2 === 0 ? '-40px' : '40px';
        const delay = (batchIdx % 4) * 60;
        node.style.setProperty('--lp-shift-x', shiftX);
        node.style.setProperty('--lp-delay', `${delay}ms`);
        observer.observe(node);
        batchIdx += 1;
      });
    };

    addTargets();
    const mo = new MutationObserver(addTargets);
    mo.observe(page, { childList: true, subtree: true });
    return () => { observer.disconnect(); mo.disconnect(); };
  }, []);

  return (
    <div className="lp-root" ref={pageRef}>

      {/* ── NAVBAR ─────────────────────────────── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-nav-brand">
            <img src={logoImg} alt="Biomics Hub" className="lp-nav-logo" />
            <span className="lp-nav-name">Biomics Hub</span>
          </div>
          <div className="lp-nav-links">
            <a href="#courses" className="lp-nav-link">Courses</a>
            <a href="#features" className="lp-nav-link">Features</a>
            <a href="#how-it-works" className="lp-nav-link">How it Works</a>
            <a href="#community" className="lp-nav-link">Community</a>
          </div>
          <div className="lp-nav-cta" ref={profileMenuRef}>
            <button
              type="button"
              className="lp-nav-profile-trigger"
              onClick={() => setProfileMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              aria-label="Open profile menu"
            >
              <span className="lp-nav-profile-avatar">G</span>
              <span className="lp-nav-profile-trigger-text">Profile</span>
            </button>
            <div className={`lp-nav-profile-menu${profileMenuOpen ? ' is-open' : ''}`} role="menu">
              <div className="lp-nav-profile-card">
                <div className="lp-nav-profile-id">
                  <span className="lp-nav-profile-avatar">G</span>
                  <div>
                    <strong>Guest Profile</strong>
                    <small>Welcome to Biomics Hub</small>
                  </div>
                </div>
                <div className="lp-nav-profile-actions">
                  <button type="button" className="lp-btn-ghost lp-nav-auth-btn" onClick={() => navigate('/auth')}>Sign In</button>
                  <button type="button" className="lp-btn-primary lp-nav-auth-btn" onClick={() => navigate('/auth')}>Sign Up</button>
                  <button
                    type="button"
                    className="lp-nav-theme-switch"
                    onClick={toggleTheme}
                    aria-label={`Switch to ${isLightTheme ? 'dark' : 'light'} theme`}
                    title={isLightTheme ? 'Light mode active' : 'Dark mode active'}
                  >
                    <span className="lp-header-sun" aria-hidden="true">
                      {isLightTheme ? '☀️' : '🌙'}
                    </span>
                    <span>{isLightTheme ? 'Light' : 'Dark'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-orb lp-hero-orb-a" aria-hidden="true" />
        <div className="lp-hero-orb lp-hero-orb-b" aria-hidden="true" />
        <div className="lp-hero-orb lp-hero-orb-c" aria-hidden="true" />
        <div className="lp-hero-glow-a" aria-hidden="true" />
        <div className="lp-hero-glow-b" aria-hidden="true" />
        <div className="lp-hero-inner">
          <h1 className="lp-hero-headline">
            Master Biology.<br />
            <span className="lp-hero-gradient">Ace Your Exams.</span>
          </h1>
          <p className="lp-hero-sub">
            Structured video lectures, smart quizzes, full-length mock tests, live classes and a
            community that grows together — everything you need to crack your biology paper.
          </p>
          <div className="lp-hero-actions">
            <button type="button" className="lp-btn-primary lp-btn-lg" onClick={() => navigate('/auth')}>
              Start Learning
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
            </button>
            <a href="#features" className="lp-btn-ghost lp-btn-lg">See What's Inside</a>
          </div>
        </div>

        <div className="lp-hero-playful-stack" aria-hidden="true">
          <article className="lp-floater-card lp-floater-card-live lp-corner-live-card">
            <p>LIVE NOW</p>
            <strong>Cell Biology</strong>
            <span>1,234 watching</span>
          </article>
          <article className="lp-floater-card lp-floater-card-quiz lp-corner-quiz-card">
            <p>TOPIC FOCUS</p>
            <strong>Genetics</strong>
            <span>8 chapters • 256 questions</span>
          </article>
          <article className="lp-floater-card lp-floater-card-mock lp-corner-mock-card">
            <p>MOCK GOAL</p>
            <strong>87% +</strong>
            <span>Clear exam score line</span>
          </article>
        </div>
      </section>

      {/* ── STATS ──────────────────────────────── */}
      <section className="lp-stats lp-reveal" ref={statsRef}>
        <div className="lp-stats-inner">
          {LANDING_STATS.map((s, i) => (
            <div key={s.label} className="lp-stat-item">
              <span className="lp-stat-value">{statNumbers[i]}{s.suffix}</span>
              <span className="lp-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── COURSE SLIDESHOW ────────────────────── */}
      <section id="courses" className="lp-section lp-section-alt lp-slideshow-section">
        <div className="lp-section-inner">
          <div className="lp-section-header lp-reveal">
            <p className="lp-eyebrow">Our Courses</p>
            <h2 className="lp-section-title">What we offer</h2>
            <p className="lp-section-sub">{BIOMICS_MISSION_COPY}</p>
          </div>

          <div
            className="lp-slideshow lp-reveal"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            {/* ── Slide track — pure CSS translateX, zero JS timing ── */}
            <div
              className="lp-slide-track"
              style={{ transform: `translateX(-${activeSlide * (100 / POSTERS.length)}%)` }}
              aria-live="polite"
              aria-label="Course slideshow"
            >
              {POSTERS.map((poster, i) => (
                <div
                  key={poster.label}
                  className={`lp-slide${i === activeSlide ? ' lp-slide-active' : ''}`}
                  aria-hidden={i !== activeSlide}
                >
                  <div className="lp-slide-inner">
                    <img
                      src={poster.src}
                      alt={poster.alt}
                      className="lp-slide-img"
                      draggable="false"
                      loading="eager"
                    />
                    <div className="lp-slide-badge">
                      <span className="lp-slide-tag">{poster.tag}</span>
                      <span className="lp-slide-label">{poster.label}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Prev / Next arrows */}
            <button
              type="button"
              className="lp-slide-arrow lp-slide-arrow-prev"
              onClick={prev}
              aria-label="Previous course"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              className="lp-slide-arrow lp-slide-arrow-next"
              onClick={next}
              aria-label="Next course"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            {/* Dot indicators */}
            <div className="lp-slide-dots" role="tablist" aria-label="Slide selector">
              {POSTERS.map((poster, i) => (
                <button
                  key={poster.label}
                  type="button"
                  role="tab"
                  aria-selected={i === activeSlide}
                  aria-label={`Go to slide ${i + 1}: ${poster.label}`}
                  className={`lp-slide-dot${i === activeSlide ? ' lp-slide-dot-active' : ''}`}
                  onClick={() => goTo(i)}
                />
              ))}
            </div>

            {/* Auto-advance progress bar — key forces remount on slide change */}
            <div className="lp-slide-progress" aria-hidden="true">
              <div
                key={`${activeSlide}-${isPaused}`}
                className="lp-slide-progress-bar"
                style={{
                  animationDuration: `${SLIDE_INTERVAL}ms`,
                  animationPlayState: isPaused ? 'paused' : 'running',
                }}
              />
            </div>
          </div>

          {/* CTA below slideshow */}
          <div className="lp-slideshow-cta lp-reveal">
            <button type="button" className="lp-btn-primary lp-btn-lg" onClick={() => navigate('/auth')}>
              Enrol Now
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
            </button>
          </div>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────── */}
      <section id="features" className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-section-header lp-reveal">
            <p className="lp-eyebrow">Everything You Need</p>
            <h2 className="lp-section-title">Built for serious students</h2>
            <p className="lp-section-sub">Every tool crafted to make learning efficient, measurable and enjoyable.</p>
          </div>

          <div className="lp-features-carousel lp-reveal">
            <button
              type="button"
              className="lp-feature-nav lp-feature-nav-prev"
              aria-label="Previous feature card"
              disabled={activeFeatureIndex <= 0}
              onClick={() => scrollFeatureTo(Math.max(0, activeFeatureIndex - 1))}
            >
              ←
            </button>
            <div
              className="lp-features-grid"
              ref={featureTrackRef}
              role="region"
              aria-label="Built for serious students cards"
              tabIndex={0}
              onKeyDown={handleFeatureKeyNav}
            >
              {FEATURE_CARDS.map((f, index) => (
              <div
                key={f.title}
                className={`lp-feature-card${activeFeatureIndex === index ? ' is-active' : ''}`}
                style={{ '--lp-feat-color': f.color }}
              >
                <span className="lp-feature-icon">{f.icon}</span>
                <span className="lp-feature-chip">Premium</span>
                <h3 className="lp-feature-title">{f.title}</h3>
                <p className="lp-feature-desc">{f.desc}</p>
              </div>
              ))}
            </div>
            <button
              type="button"
              className="lp-feature-nav lp-feature-nav-next"
              aria-label="Next feature card"
              disabled={activeFeatureIndex >= FEATURE_CARDS.length - 1}
              onClick={() => scrollFeatureTo(Math.min(FEATURE_CARDS.length - 1, activeFeatureIndex + 1))}
            >
              →
            </button>
          </div>
          <div className="lp-feature-dots lp-reveal" aria-label="Feature card position">
            {FEATURE_CARDS.map((card, index) => (
              <button
                key={card.title}
                type="button"
                className={`lp-feature-dot${activeFeatureIndex === index ? ' is-active' : ''}`}
                onClick={() => scrollFeatureTo(index)}
                aria-label={`Go to ${card.title}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────── */}
      <section id="how-it-works" className="lp-section lp-section-alt">
        <div className="lp-section-inner">
          <div className="lp-section-header lp-reveal">
            <p className="lp-eyebrow">Simple Process</p>
            <h2 className="lp-section-title">Learn in four simple steps</h2>
          </div>

          <div className="lp-steps">
            {[
              { num: '01', title: 'Create Your Account', desc: 'Sign up in seconds. No complicated forms — just your name and email.' },
              { num: '02', title: 'Choose Your Course', desc: 'Browse courses and modules covering every biology topic you need.' },
              { num: '03', title: 'Learn & Practice', desc: 'Watch lectures, take quizzes, attempt mock tests and join live classes.' },
              { num: '04', title: 'Track & Improve', desc: 'Review your insights dashboard to see your growth and focus areas.' },
            ].map((step) => (
              <div key={step.num} className="lp-step lp-reveal">
                <span className="lp-step-num">{step.num}</span>
                <div>
                  <h3 className="lp-step-title">{step.title}</h3>
                  <p className="lp-step-desc">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────── */}
      <section className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-section-header lp-reveal">
            <p className="lp-eyebrow">Student Voices</p>
            <h2 className="lp-section-title">What learners say</h2>
          </div>

          <div className="lp-voices-marquee-wrap lp-reveal">
            <div className="lp-voices-marquee-track">
              {[...studentVoices, ...studentVoices].map((voice, idx) => (
                <article key={`${voice._id || voice.name}-${idx}`} className="lp-voice-card">
                  <div className="lp-voice-top">
                    <div className="lp-voice-avatar">{String(voice?.name || 'S').trim().charAt(0).toUpperCase()}</div>
                    <div>
                      <strong className="lp-voice-name">{voice.name}</strong>
                      <span className="lp-voice-role">{voice.role || 'Student'}</span>
                    </div>
                  </div>
                  <div className="lp-testimonial-stars" aria-label={`${voice.rating || 5} stars`}>
                    {'★'.repeat(Math.max(1, Math.min(5, Number(voice.rating || 5))))}
                  </div>
                  <p className="lp-testimonial-quote">"{voice.message}"</p>
                </article>
              ))}
            </div>
          </div>

          <div className="lp-voices-marquee-wrap lp-voices-marquee-wrap-reverse lp-reveal">
            <div className="lp-voices-marquee-track lp-voices-marquee-track-reverse">
              {[...studentVoices.slice().reverse(), ...studentVoices.slice().reverse()].map((voice, idx) => (
                <article key={`rev-${voice._id || voice.name}-${idx}`} className="lp-voice-card">
                  <div className="lp-voice-top">
                    <div className="lp-voice-avatar">{String(voice?.name || 'S').trim().charAt(0).toUpperCase()}</div>
                    <div>
                      <strong className="lp-voice-name">{voice.name}</strong>
                      <span className="lp-voice-role">{voice.role || 'Student'}</span>
                    </div>
                  </div>
                  <div className="lp-testimonial-stars" aria-label={`${voice.rating || 5} stars`}>
                    {'★'.repeat(Math.max(1, Math.min(5, Number(voice.rating || 5))))}
                  </div>
                  <p className="lp-testimonial-quote">"{voice.message}"</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── BRAND GLOW ─────────────────────────── */}
      <section className="lp-section lp-brand-glow-section">
        <div className="lp-section-inner">
          <div className="lp-brand-glow-board lp-reveal" role="img" aria-label="Interactive BIOMICS HUB glowing letters">
            <div className="lp-brand-glow-word">
              {'BIOMICS HUB'.split('').map((char, index) => {
                const isSpace = char === ' ';
                const isHovered = hoveredBrandLetter === index;
                return (
                  <span
                    key={`brand-letter-${index}`}
                    className={`lp-brand-glow-letter${isHovered ? ' is-hovered' : ''}${isSpace ? ' is-space' : ''}`}
                    onMouseEnter={() => {
                      if (isSpace) return;
                      setHoveredBrandLetter(index);
                    }}
                    onMouseLeave={() => setHoveredBrandLetter(null)}
                    onFocus={() => {
                      if (isSpace) return;
                      setHoveredBrandLetter(index);
                    }}
                    onBlur={() => setHoveredBrandLetter(null)}
                    tabIndex={isSpace ? -1 : 0}
                  >
                    {isSpace ? '\u00A0' : char}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── COMMUNITY ───────────────────────────── */}
      <section id="community" className="lp-section lp-section-alt">
        <div className="lp-section-inner">
          <div className="lp-section-header lp-reveal">
            <p className="lp-eyebrow">Stay Connected</p>
            <h2 className="lp-section-title">Join our community</h2>
            <p className="lp-section-sub">Follow for daily biology tips, exam alerts, and study resources.</p>
          </div>

          <div className="lp-social-row">
            {[
              { label: 'Instagram', handle: '@biomics_hub', href: 'https://www.instagram.com/biomics_hub', icon: 'instagram', color: '#e1306c' },
              { label: 'Telegram', handle: 'Join Channel', href: 'https://t.me/+WVyK_obKmJ8BbxG6', icon: 'telegram', color: '#2aabee' },
              { label: 'YouTube', handle: '@biomicshub5733', href: 'https://www.youtube.com/@biomicshub5733', icon: 'youtube', color: '#ff0000' },
              { label: 'WhatsApp', handle: 'Join Group', href: 'https://chat.whatsapp.com/Fc8P3ZUDhfYDw6swMKDHOI', icon: 'whatsapp', color: '#22c55e' },
            ].map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="lp-social-card lp-reveal"
                style={{ '--lp-social-color': s.color }}
              >
                <span className="lp-social-icon"><SocialIcon kind={s.icon} /></span>
                <span className="lp-social-label">{s.label}</span>
                <span className="lp-social-handle">{s.handle}</span>
                <span className="lp-social-arrow">↗</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ──────────────────────────── */}
      <section className="lp-cta lp-reveal">
        <div className="lp-cta-glow" aria-hidden="true" />
        <div className="lp-cta-inner">
          <h2 className="lp-cta-title">Ready to start your biology journey?</h2>
          <p className="lp-cta-sub">Structured from basics to advanced mastery for students and aspirants preparing for top life science exams.</p>
          <button type="button" className="lp-btn-primary lp-btn-lg" onClick={() => navigate('/auth')}>
            Create Free Account
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
          </button>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand-col">
            <div className="lp-footer-brand">
              <img src={logoImg} alt="Biomics Hub" className="lp-footer-logo" />
              <div>
                <p className="lp-footer-name">Biomics Hub</p>
                <p className="lp-footer-tagline">Premium biology learning for ambitious students.</p>
              </div>
            </div>
            <p className="lp-footer-about">{BIOMICS_FOOTER_COPY}</p>
            <div className="lp-store-badges">
              <a
                href={iosAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="lp-store-badge lp-store-badge--appstore"
                aria-label="Download on the App Store"
              >
                <span className="lp-store-badge-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="#fff">
                    <path d="M16.42 12.3c.03 2.58 2.26 3.44 2.28 3.45-.02.06-.35 1.2-1.15 2.38-.69 1.02-1.41 2.03-2.54 2.05-1.11.02-1.47-.66-2.75-.66s-1.67.64-2.72.68c-1.09.04-1.92-1.08-2.62-2.09-1.43-2.07-2.53-5.84-1.06-8.39.73-1.27 2.04-2.08 3.46-2.1 1.08-.02 2.09.72 2.75.72.66 0 1.9-.9 3.2-.77.54.02 2.05.22 3.03 1.66-.08.05-1.81 1.06-1.78 3.17zm-2.1-5.37c.58-.7.97-1.67.86-2.64-.84.03-1.86.56-2.46 1.26-.54.62-1.01 1.61-.88 2.56.94.07 1.9-.48 2.48-1.18z"/>
                  </svg>
                </span>
                <span className="lp-store-badge-copy">
                  <small>Download on the</small>
                  <strong>App Store</strong>
                </span>
              </a>
              <a
                href={androidAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="lp-store-badge lp-store-badge--googleplay"
                aria-label="Get it on Google Play"
              >
                <span className="lp-store-badge-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M3 2.75v18.5c0 .55.45 1 1 1 .18 0 .36-.05.52-.15l10.73-6.2-3.75-3.9L3 2.75z" fill="#00E676"/>
                    <path d="M17.24 10.87l-2.98-1.72-2.01 2.09 2.02 2.11 2.97-1.71c.58-.33.58-1.17 0-1.5z" fill="#FFB300"/>
                    <path d="M15.23 15.86L4.52 22.1c.45.29 1.05.34 1.56.05l8.95-5.17-1.8-1.12z" fill="#FF3A44"/>
                    <path d="M13.43 7.02L5.98 2.7A1.59 1.59 0 0 0 4.5 2.68l8.74 9.1 1.19-1.26z" fill="#00A0FF"/>
                  </svg>
                </span>
                <span className="lp-store-badge-copy">
                  <small>GET IT ON</small>
                  <strong>Google Play</strong>
                </span>
              </a>
            </div>
          </div>

          <div className="lp-footer-col">
            <p className="lp-footer-col-title">Company</p>
            <nav className="lp-footer-nav" aria-label="Footer navigation">
              <a href="#courses" className="lp-footer-link">Courses</a>
              <a href="#features" className="lp-footer-link">Features</a>
              <a href="#how-it-works" className="lp-footer-link">How it Works</a>
              <a href="#community" className="lp-footer-link">Community</a>
              <button type="button" className="lp-footer-link" onClick={() => navigate('/auth')}>Log In</button>
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

      <button
        type="button"
        className={`lp-scroll-top${showScrollTop ? ' is-visible' : ''}`}
        onClick={() => {
          setShowScrollTop(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        aria-label="Scroll to top"
      >
        ↑
      </button>

    </div>
  );
}
