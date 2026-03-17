import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestJson } from '../api';
import { emptyRegisterForm } from '../constants';
import { getSession } from '../session';
import { useSessionStore } from '../stores/sessionStore';
import { useThemeStore } from '../stores/themeStore';
import promoBanner from '../../background.jpg';

export default function AuthPage() {
  const INTRO_DURATION_MS = 2300;
  const REGISTER_FLIP_BACK_MS = 3000;
  const navigate = useNavigate();
  const existingSession = getSession();
  const { login } = useSessionStore();
  const { theme, toggleTheme } = useThemeStore();
  const isLightTheme = theme === 'light';
  const [loginRole, setLoginRole] = useState('user');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState(emptyRegisterForm);
  const [loginMessage, setLoginMessage] = useState(null);
  const [registerMessage, setRegisterMessage] = useState(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPasswords, setShowRegisterPasswords] = useState(false);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [isSubmittingRegister, setIsSubmittingRegister] = useState(false);
  const [toast, setToast] = useState(null);
  const [introVisible, setIntroVisible] = useState(true);
  const registerFlipTimerRef = useRef(null);
      useEffect(() => {
        if (!existingSession) return;
    navigate(existingSession.role === 'admin' ? '/admin' : '/student', { replace: true });
  }, [existingSession, navigate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIntroVisible(false);
    }, INTRO_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [INTRO_DURATION_MS]);

      useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast(null);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (registerFlipTimerRef.current) {
        window.clearTimeout(registerFlipTimerRef.current);
      }
    };
  }, []);

  const canLogin = loginForm.username.trim().length >= 3 && loginForm.password.length >= 6;
  const canRegister =
    /^\d{10}$/.test(registerForm.phone.trim()) &&
    registerForm.username.trim().length >= 3 &&
    registerForm.class.trim() &&
    registerForm.city.trim().length >= 2 &&
    registerForm.password.length >= 8 &&
    /[A-Za-z]/.test(registerForm.password) &&
    /\d/.test(registerForm.password) &&
    registerForm.confirmPassword === registerForm.password;

  // ── Live validation hints (shown only when field has content but fails)
  const loginPasswordHint =
    loginForm.password.length > 0 && loginForm.password.length < 6
      ? 'Password is too short — must be at least 6 characters.'
      : null;

  const regPhoneHint =
    registerForm.phone.length > 0 && !/^\d{10}$/.test(registerForm.phone.trim())
      ? 'Must be exactly 10 digits (numbers only).'
      : null;

  const regUsernameHint =
    registerForm.username.length > 0 && registerForm.username.trim().length < 3
      ? 'Username must be at least 3 characters.'
      : null;

  const regCityHint =
    registerForm.city.length > 0 && registerForm.city.trim().length < 2
      ? 'City name must be at least 2 characters.'
      : null;

  function getPasswordHint(pw) {
    if (!pw.length) return null;
    const parts = [];
    if (pw.length < 8) parts.push('at least 8 characters');
    if (!/[A-Za-z]/.test(pw)) parts.push('at least one letter');
    if (!/\d/.test(pw)) parts.push('at least one number');
    return parts.length ? `Password must contain ${parts.join(', ')}.` : null;
  }

  const regPasswordHint = getPasswordHint(registerForm.password);
  const passwordScore = [
    registerForm.password.length >= 8,
    /[A-Za-z]/.test(registerForm.password),
    /\d/.test(registerForm.password),
    /[^A-Za-z0-9]/.test(registerForm.password)
  ].filter(Boolean).length;
  const passwordStrengthLabel = passwordScore >= 4 ? 'Strong' : passwordScore >= 3 ? 'Medium' : passwordScore >= 1 ? 'Weak' : 'None';

  const regConfirmHint =
    registerForm.confirmPassword.length > 0 &&
    registerForm.confirmPassword !== registerForm.password
      ? 'Passwords do not match.'
      : null;

  async function handleLogin(event) {
    event.preventDefault();
    if (!canLogin) return;
    setIsSubmittingLogin(true);
    setLoginMessage(null);
    try {
      const endpoint = loginRole === 'admin' ? '/auth/admin-login' : '/auth/login';
      const response = await requestJson(endpoint, {
        method: 'POST',
        body: JSON.stringify(loginForm),
      });
      const identity = loginRole === 'admin' ? response.admin : response.user;
      const session = {
        role: loginRole === 'admin' ? 'admin' : 'user',
        username: identity?.username || loginForm.username.trim(),
        token: response.token,
      };
      login(session);
      navigate(session.role === 'admin' ? '/admin' : '/student', { replace: true });
    } catch (error) {
      setLoginMessage({ type: 'error', text: error.message });
    } finally {
      setIsSubmittingLogin(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    if (!canRegister) return;
    setIsSubmittingRegister(true);
    setRegisterMessage(null);
    try {
      await requestJson('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          phone: registerForm.phone.trim(),
          username: registerForm.username.trim(),
          class: registerForm.class,
          city: registerForm.city.trim(),
          password: registerForm.password,
        }),
      });
      setRegisterForm(emptyRegisterForm);
      setRegisterMessage(null);
      setToast({ type: 'success', text: 'Registered successfully. Sign in now.' });
      if (registerFlipTimerRef.current) {
        window.clearTimeout(registerFlipTimerRef.current);
      }
      registerFlipTimerRef.current = window.setTimeout(() => {
        setRegisterOpen(false);
        registerFlipTimerRef.current = null;
      }, REGISTER_FLIP_BACK_MS);
    } catch (error) {
      setRegisterMessage({ type: 'error', text: error.message });
    } finally {
      setIsSubmittingRegister(false);
    }
  }

  return (
    <div className="auth-page-shell">
      {introVisible ? (
        <section className="auth-intro-screen" aria-label="Biomics Hub intro animation" role="status" aria-live="polite">
          <p className="auth-intro-kicker">Welcome to</p>
          <h1 className="auth-intro-title">
            <span className="auth-intro-title-word">Biomics</span>
            <span className="auth-intro-title-word">Hub</span>
          </h1>
          <p className="auth-intro-subtitle">Smart biology learning platform</p>
          <div className="auth-intro-loader" aria-hidden="true">
            <span className="auth-intro-loader-bar" />
          </div>
        </section>
      ) : null}

      {toast ? (
        <aside className={`auth-toast ${toast.type}`} role="status" aria-live="polite">
          <span>{toast.text}</span>
          <button type="button" className="auth-toast-close" onClick={() => setToast(null)} aria-label="Dismiss notification">
            ×
          </button>
        </aside>
      ) : null}

      {/* ── Hero panel ─────────────────────────────────── */}
      <section className="hero-panel">
        <h1>Biomics Hub</h1>
        <p className="subtitle large auth-hero-tagline">
          Enroll now for life science entrance preparation with complete chapter-wise learning.
        </p>
        <div className="auth-hero-media-card">
          <img
            src={promoBanner}
            alt="Biomics Hub life science entrance preparation"
            className="auth-hero-image"
            loading="eager"
          />
          <div className="auth-hero-media-overlay">
            <strong>Recorded Classes</strong>
            <strong>PDF Notes</strong>
            <strong>PYQ Session</strong>
            <strong>Detailed Explanation</strong>
          </div>
        </div>
      </section>

      {/* ── Auth panel ─────────────────────────────────── */}
      <section className="auth-card-panel">
        <div className="auth-toolbar">
          <button
            type="button"
            className="theme-switch"
            onClick={toggleTheme}
            aria-label={`Switch to ${isLightTheme ? 'Forest Dark' : 'Sage Light'} theme`}
            aria-pressed={isLightTheme}
            title={isLightTheme ? 'Sage Light active' : 'Forest Dark active'}
          >
            <span className="theme-switch-track" aria-hidden="true">
              <span className="theme-switch-thumb" />
            </span>
            <span>{isLightTheme ? 'Sage Light' : 'Forest Dark'}</span>
          </button>
        </div>

        <div className={`auth-flip-wrap ${registerOpen ? 'is-register' : ''}`}>
          <section className="auth-flip-face auth-flip-face-front" aria-hidden={registerOpen}>
            <form className="card auth-face-card" onSubmit={handleLogin}>
              <h2>Sign in</h2>

              <label>
                Role
                <select
                  value={loginRole}
                  onChange={(e) => setLoginRole(e.target.value)}
                >
                  <option value="user">Student</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              <label>
                Username
                <input
                  type="text"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="Enter username"
                  autoComplete="username"
                />
              </label>

              <label>
                Password
                <div className="password-input-wrap">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginForm.password}
                    onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="toggle-password-btn"
                    onClick={() => setShowLoginPassword((current) => !current)}
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                  >
                    {showLoginPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {loginPasswordHint ? <small className="field-hint">⚠ {loginPasswordHint}</small> : null}
              </label>

              <label className="password-toggle">
                <input
                  type="checkbox"
                  checked={showLoginPassword}
                  onChange={(e) => setShowLoginPassword(e.target.checked)}
                />
                <span>Show password</span>
              </label>

              <div className="form-actions">
                <button
                  className="primary-btn"
                  type="submit"
                  disabled={!canLogin || isSubmittingLogin}
                >
                  {isSubmittingLogin ? 'Signing in…' : 'Login'}
                </button>
                {loginMessage && (
                  <p className={`inline-message ${loginMessage.type}`}>{loginMessage.text}</p>
                )}
              </div>
            </form>

            <div className="register-toggle">
              <button
                className="secondary-btn"
                type="button"
                onClick={() => {
                  setRegisterOpen(true);
                  setRegisterMessage(null);
                }}
              >
                New candidate? Register here
              </button>
            </div>
          </section>

          <section className="auth-flip-face auth-flip-face-back" aria-hidden={!registerOpen}>
            <form className="card register-card auth-face-card" onSubmit={handleRegister}>
            <h2>Student Registration</h2>

            <div className="form-grid">
              <label>
                Phone
                <input
                  type="text"
                  value={registerForm.phone}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="10-digit phone"
                />
                {regPhoneHint ? <small className="field-hint">⚠ {regPhoneHint}</small> : null}
              </label>

              <label>
                Username
                <input
                  type="text"
                  value={registerForm.username}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="Choose username"
                />
                {regUsernameHint ? <small className="field-hint">⚠ {regUsernameHint}</small> : null}
              </label>

              <label>
                Course
                <select
                  value={registerForm.class}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, class: e.target.value }))}
                >
                  <option value="">Select course</option>
                  <option value="11th">11th</option>
                  <option value="12th">12th</option>
                  <option value="NEET">NEET</option>
                  <option value="IIT-JAM">IIT-JAM</option>
                  <option value="CSIR-NET Life Science">CSIR-NET Life Science</option>
                  <option value="GATE">GATE</option>
                </select>
              </label>

              <label>
                City
                <input
                  type="text"
                  value={registerForm.city}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Enter city"
                />
                {regCityHint ? <small className="field-hint">⚠ {regCityHint}</small> : null}
              </label>

              <label>
                Password
                <div className="password-input-wrap">
                  <input
                    type={showRegisterPasswords ? 'text' : 'password'}
                    value={registerForm.password}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Min 8 chars, letters + numbers"
                  />
                  <button
                    type="button"
                    className="toggle-password-btn"
                    onClick={() => setShowRegisterPasswords((current) => !current)}
                    aria-label={showRegisterPasswords ? 'Hide passwords' : 'Show passwords'}
                  >
                    {showRegisterPasswords ? 'Hide' : 'Show'}
                  </button>
                </div>
                {registerForm.password ? (
                  <div className="password-strength" aria-live="polite">
                    <div className="password-strength-track">
                      <span className={`password-strength-fill strength-${Math.max(1, passwordScore)}`} />
                    </div>
                    <small>Strength: {passwordStrengthLabel}</small>
                  </div>
                ) : null}
                {regPasswordHint ? <small className="field-hint">⚠ {regPasswordHint}</small> : null}
              </label>

              <label>
                Confirm Password
                <div className="password-input-wrap">
                  <input
                    type={showRegisterPasswords ? 'text' : 'password'}
                    value={registerForm.confirmPassword}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    placeholder="Re-enter password"
                  />
                  <button
                    type="button"
                    className="toggle-password-btn"
                    onClick={() => setShowRegisterPasswords((current) => !current)}
                    aria-label={showRegisterPasswords ? 'Hide passwords' : 'Show passwords'}
                  >
                    {showRegisterPasswords ? 'Hide' : 'Show'}
                  </button>
                </div>
                {regConfirmHint ? <small className="field-hint">⚠ {regConfirmHint}</small> : null}
              </label>
            </div>

            <label className="password-toggle">
              <input
                type="checkbox"
                checked={showRegisterPasswords}
                onChange={(e) => setShowRegisterPasswords(e.target.checked)}
              />
              <span>Show passwords</span>
            </label>

            <div className="form-actions">
              <button
                className="primary-btn"
                type="submit"
                disabled={!canRegister || isSubmittingRegister}
              >
                {isSubmittingRegister ? 'Registering…' : 'Register'}
              </button>
              {registerMessage && (
                <p className={`inline-message ${registerMessage.type}`}>{registerMessage.text}</p>
              )}
            </div>
            </form>

            <div className="register-toggle">
              <button
                className="secondary-btn"
                type="button"
                onClick={() => setRegisterOpen(false)}
              >
                Already registered? Sign in
              </button>
            </div>
          </section>
        </div>

      </section>
    </div>
  );
}


