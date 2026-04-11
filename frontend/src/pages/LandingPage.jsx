import { useEffect, useRef, useState, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { getSession } from '../session';
import logoImg from '../assets/biomics-logo.jpeg';
import posterTestSeries from '../assets/poster-test-series.jpeg';
import posterLifeScience from '../assets/poster-life-science.jpeg';
import posterBatch from '../assets/poster-batch.jpeg';

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

export default function LandingPage() {
  const navigate = useNavigate();

  // Redirect already-authenticated users to their dashboard
  const session = getSession();
  if (session?.token && session?.role) {
    return <Navigate to={session.role === 'admin' ? '/admin' : '/student'} replace />;
  }
  const pageRef = useRef(null);

  /* ── Slideshow state ─────────────────────── */
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused]       = useState(false);
  const autoRef = useRef(null);
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
          <div className="lp-nav-cta">
            <button type="button" className="lp-btn-ghost" onClick={() => navigate('/auth')}>Log In</button>
            <button type="button" className="lp-btn-primary" onClick={() => navigate('/auth')}>Get Started</button>
          </div>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-glow-a" aria-hidden="true" />
        <div className="lp-hero-glow-b" aria-hidden="true" />
        <div className="lp-hero-inner">
          <p className="lp-eyebrow">The Biology Learning Platform</p>
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
          <div className="lp-hero-badges">
            <span className="lp-badge">📹 Video Lectures</span>
            <span className="lp-badge">📝 Quizzes</span>
            <span className="lp-badge">🎯 Mock Tests</span>
            <span className="lp-badge">🔴 Live Classes</span>
          </div>
        </div>
      </section>

      {/* ── STATS ──────────────────────────────── */}
      <section className="lp-stats lp-reveal">
        <div className="lp-stats-inner">
          {[
            { value: '500+', label: 'Video Lectures' },
            { value: '200+', label: 'Practice Quizzes' },
            { value: '50+', label: 'Mock Tests' },
            { value: '1000+', label: 'Students Learning' },
          ].map((s) => (
            <div key={s.label} className="lp-stat-item">
              <span className="lp-stat-value">{s.value}</span>
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
            <p className="lp-section-sub">Comprehensive biology programmes for every stage of your preparation.</p>
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
            <h2 className="lp-section-title">Built for serious biology students</h2>
            <p className="lp-section-sub">Every tool crafted to make learning efficient, measurable and enjoyable.</p>
          </div>

          <div className="lp-features-grid">
            {[
              {
                icon: '📹',
                title: 'Video Lectures',
                desc: 'Chapter-wise HD videos taught by expert biology educators. Pause, rewind, and learn at your own pace.',
                color: '#6366f1',
              },
              {
                icon: '📝',
                title: 'Smart Quizzes',
                desc: 'Topic-wise quizzes with instant feedback and detailed explanations to reinforce every concept.',
                color: '#8b5cf6',
              },
              {
                icon: '🎯',
                title: 'Mock Test Series',
                desc: 'Full-length and topic-based mock exams modelled on real exam patterns with detailed analytics.',
                color: '#06b6d4',
              },
              {
                icon: '🔴',
                title: 'Live Classes',
                desc: 'Join scheduled live sessions with your teachers for doubt-clearing and interactive learning.',
                color: '#f43f5e',
              },
              {
                icon: '📊',
                title: 'Progress Insights',
                desc: 'Track your quiz streaks, scores over time, and see exactly where you need to focus more.',
                color: '#10b981',
              },
              {
                icon: '💬',
                title: 'Community',
                desc: 'Stay connected on Telegram, YouTube and Instagram with daily updates, tips and peer support.',
                color: '#f59e0b',
              },
            ].map((f) => (
              <div key={f.title} className="lp-feature-card lp-reveal" style={{ '--lp-feat-color': f.color }}>
                <span className="lp-feature-icon">{f.icon}</span>
                <h3 className="lp-feature-title">{f.title}</h3>
                <p className="lp-feature-desc">{f.desc}</p>
              </div>
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

          <div className="lp-testimonials">
            {[
              {
                quote: 'The mock tests are incredibly close to the real exam pattern. My score improved by 20 marks after just 3 weeks of practice.',
                name: 'Priya S.',
                tag: 'NEET Aspirant, Class 12',
              },
              {
                quote: 'I love how organised everything is. Video lectures, then quiz, then mock test — the flow makes sense and keeps me focused.',
                name: 'Aryan M.',
                tag: 'Biology Student',
              },
              {
                quote: 'The live classes and Telegram community make me feel like I\'m in a real classroom. The teachers are amazing and always available.',
                name: 'Neha K.',
                tag: 'Biomics Hub Student',
              },
            ].map((t) => (
              <div key={t.name} className="lp-testimonial-card lp-reveal">
                <div className="lp-testimonial-stars" aria-label="5 stars">★★★★★</div>
                <p className="lp-testimonial-quote">"{t.quote}"</p>
                <div className="lp-testimonial-author">
                  <span className="lp-testimonial-name">{t.name}</span>
                  <span className="lp-testimonial-tag">{t.tag}</span>
                </div>
              </div>
            ))}
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
              { label: 'Instagram', handle: '@biomics_hub', href: 'https://www.instagram.com/biomics_hub', icon: '📸', color: '#e1306c' },
              { label: 'Telegram', handle: 'Join Channel', href: 'https://t.me/+WVyK_obKmJ8BbxG6', icon: '✈️', color: '#2aabee' },
              { label: 'YouTube', handle: '@biomicshub5733', href: 'https://www.youtube.com/@biomicshub5733', icon: '▶️', color: '#ff0000' },
            ].map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="lp-social-card lp-reveal"
                style={{ '--lp-social-color': s.color }}
              >
                <span className="lp-social-icon">{s.icon}</span>
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
          <p className="lp-cta-sub">Join hundreds of students already learning on Biomics Hub.</p>
          <button type="button" className="lp-btn-primary lp-btn-lg" onClick={() => navigate('/auth')}>
            Create Free Account
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
          </button>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <img src={logoImg} alt="Biomics Hub" className="lp-footer-logo" />
            <div>
              <p className="lp-footer-name">Biomics Hub</p>
              <p className="lp-footer-tagline">Empowering students with quality biology education.</p>
            </div>
          </div>
          <nav className="lp-footer-nav" aria-label="Footer navigation">
            <a href="#features" className="lp-footer-link">Features</a>
            <a href="#how-it-works" className="lp-footer-link">How it Works</a>
            <a href="#community" className="lp-footer-link">Community</a>
            <button type="button" className="lp-footer-link" onClick={() => navigate('/auth')}>Log In</button>
          </nav>
          <p className="lp-footer-copy">© {new Date().getFullYear()} Biomics Hub. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
