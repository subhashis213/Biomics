import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestJson } from '../api';
import { emptyRegisterForm } from '../constants';
import { getSession } from '../session';
import { useSessionStore } from '../stores/sessionStore';
import { useThemeStore } from '../stores/themeStore';
import promoBanner from '../assets/biomics-hero-banner.jpeg';

export default function AuthPage() {
  const INTRO_DURATION_MS = 2300;
  const REGISTER_FLIP_BACK_MS = 3000;
  const navigate = useNavigate();
  const existingSession = getSession();
  const { login } = useSessionStore();
  const { theme, toggleTheme } = useThemeStore();
  const isLightTheme = theme === 'light';
  const [loginRole, setLoginRole] = useState('user');
  const [loginMethod, setLoginMethod] = useState('password');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [otpForm, setOtpForm] = useState({ phone: '', otp: '' });
  const [forgotForm, setForgotForm] = useState({ username: '', birthDate: '', password: '', confirmPassword: '' });
  const [registerForm, setRegisterForm] = useState(emptyRegisterForm);
  const [loginMessage, setLoginMessage] = useState(null);
  const [registerMessage, setRegisterMessage] = useState(null);
  const [forgotMessage, setForgotMessage] = useState(null);
  const [forgotSuccessModal, setForgotSuccessModal] = useState(false);
  const [forgotUsernameValid, setForgotUsernameValid] = useState(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPasswords, setShowRegisterPasswords] = useState(false);
  const [showForgotPasswords, setShowForgotPasswords] = useState(false);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isSubmittingRegister, setIsSubmittingRegister] = useState(false);
  const [isSubmittingForgot, setIsSubmittingForgot] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [toast, setToast] = useState(null);
  const [introVisible, setIntroVisible] = useState(true);
  const registerFlipTimerRef = useRef(null);
  const forgotSuccessTimerRef = useRef(null);

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
      if (forgotSuccessTimerRef.current) {
        window.clearTimeout(forgotSuccessTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const hasOpenAuthModal = forgotOpen || forgotSuccessModal;
    if (!hasOpenAuthModal) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyTouchAction = document.body.style.touchAction;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.touchAction = previousBodyTouchAction;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [forgotOpen, forgotSuccessModal]);

  useEffect(() => {
    if (loginRole === 'admin') {
      setLoginMethod('password');
    }
  }, [loginRole]);

  useEffect(() => {
    if (otpCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setOtpCooldown((seconds) => (seconds > 0 ? seconds - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpCooldown]);

  const isOtpMode = loginRole === 'user' && loginMethod === 'otp';
  const canLogin = isOtpMode
    ? /^\d{10}$/.test(otpForm.phone.trim()) && /^\d{6}$/.test(otpForm.otp.trim())
    : loginForm.username.trim().length >= 3 && loginForm.password.length >= 6;
  const canSendOtp = /^\d{10}$/.test(otpForm.phone.trim()) && otpCooldown === 0;
  const regEmailHint =
    registerForm.email.length > 0 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(registerForm.email.trim())
      ? 'Enter a valid email address.'
      : null;

  const canRegister =
    /^\d{10}$/.test(registerForm.phone.trim()) &&
    registerForm.username.trim().length >= 3 &&
    registerForm.class.trim() &&
    registerForm.city.trim().length >= 2 &&
    (registerForm.email.trim() === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(registerForm.email.trim())) &&
    registerForm.password.length >= 8 &&
    /[A-Za-z]/.test(registerForm.password) &&
    /\d/.test(registerForm.password) &&
    Boolean(registerForm.birthDate) &&
    registerForm.confirmPassword === registerForm.password;

  const canForgotReset =
    forgotForm.username.trim().length >= 3 &&
    Boolean(forgotForm.birthDate) &&
    forgotForm.password.length >= 8 &&
    forgotForm.confirmPassword === forgotForm.password;

  // ── Live validation hints (shown only when field has content but fails)
  const loginPasswordHint =
    loginForm.password.length > 0 && loginForm.password.length < 6
      ? 'Password is too short — must be at least 6 characters.'
      : null;

  const otpPhoneHint =
    otpForm.phone.length > 0 && !/^\d{10}$/.test(otpForm.phone.trim())
      ? 'Must be exactly 10 digits (numbers only).'
      : null;

  const otpHint =
    otpForm.otp.length > 0 && !/^\d{6}$/.test(otpForm.otp.trim())
      ? 'OTP must be exactly 6 digits.'
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

  const forgotPasswordHint = getPasswordHint(forgotForm.password);
  const forgotConfirmHint =
    forgotForm.confirmPassword.length > 0 && forgotForm.confirmPassword !== forgotForm.password
      ? 'Passwords do not match.'
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
      const endpoint = loginRole === 'admin'
        ? '/auth/admin-login'
        : (isOtpMode ? '/auth/verify-otp' : '/auth/login');
      const body = loginRole === 'admin' || !isOtpMode
        ? loginForm
        : { phone: otpForm.phone.trim(), otp: otpForm.otp.trim() };
      const response = await requestJson(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const identity = loginRole === 'admin' ? response.admin : response.user;
      const session = {
        role: loginRole === 'admin' ? 'admin' : 'user',
        username: identity?.username || (isOtpMode ? otpForm.phone.trim() : loginForm.username.trim()),
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

  async function handleSendOtp() {
    if (!canSendOtp) return;
    setIsSendingOtp(true);
    setLoginMessage(null);
    try {
      const response = await requestJson('/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: otpForm.phone.trim() })
      });
      setOtpSent(true);
      setOtpCooldown(Number(response.cooldownSeconds || 45));
      setLoginMessage({
        type: 'success',
        text: response.devOtp
          ? `OTP sent. Dev OTP: ${response.devOtp}`
          : 'OTP sent to your mobile number.'
      });
    } catch (error) {
      setLoginMessage({ type: 'error', text: error.message });
    } finally {
      setIsSendingOtp(false);
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
          email: registerForm.email.trim(),
          class: registerForm.class,
          city: registerForm.city.trim(),
          birthDate: registerForm.birthDate,
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

  async function checkForgotUsername() {
    const username = forgotForm.username.trim();
    if (username.length < 3) {
      setForgotUsernameValid(false);
      return;
    }
    setIsCheckingUsername(true);
    try {
      const data = await requestJson('/auth/check-username', {
        method: 'POST',
        body: JSON.stringify({ username })
      });
      setForgotUsernameValid(data.exists);
    } catch (error) {
      setForgotUsernameValid(false);
    } finally {
      setIsCheckingUsername(false);
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    if (!canForgotReset) return;
    if (forgotUsernameValid === false) {
      setForgotMessage({ type: 'error', text: 'Username not found. Please check and try again.' });
      return;
    }
    setIsSubmittingForgot(true);
    setForgotMessage(null);
    try {
      const response = await requestJson('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          username: forgotForm.username.trim(),
          birthDate: forgotForm.birthDate,
          password: forgotForm.password
        })
      });
      console.log('Password reset response:', response);
      setForgotSuccessModal(true);
      setForgotMessage(null);

      if (forgotSuccessTimerRef.current) {
        window.clearTimeout(forgotSuccessTimerRef.current);
      }
      forgotSuccessTimerRef.current = window.setTimeout(() => {
        setForgotSuccessModal(false);
        setForgotForm({ username: '', birthDate: '', password: '', confirmPassword: '' });
        setForgotOpen(false);
        setForgotUsernameValid(null);
        setLoginForm({ username: '', password: '' });
        forgotSuccessTimerRef.current = null;
      }, 2500);
    } catch (error) {
      console.error('Password reset error:', error);
      setForgotMessage({ type: 'error', text: error.message || 'Password reset failed' });
      setForgotSuccessModal(false);
    } finally {
      setIsSubmittingForgot(false);
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
          <p className="auth-hero-media-badge">Trusted by life science aspirants across India</p>
        </div>
      </section>

      {/* ── Auth panel ─────────────────────────────────── */}
      <section className="auth-card-panel">
        <div className="auth-toolbar">
          <button
            type="button"
            className="theme-switch"
            onClick={toggleTheme}
            aria-label={`Switch to ${isLightTheme ? 'Dark' : 'Light'} theme`}
            aria-pressed={isLightTheme}
            title={isLightTheme ? 'Light theme active' : 'Dark theme active'}
          >
            <span className="theme-switch-track" aria-hidden="true">
              <span className="theme-switch-thumb" />
            </span>
            <span>{isLightTheme ? 'Light' : 'Dark'}</span>
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
                  onChange={(e) => {
                    const role = e.target.value;
                    setLoginRole(role);
                    setLoginMessage(null);
                    if (role === 'admin') {
                      setOtpSent(false);
                      setOtpCooldown(0);
                    }
                  }}
                >
                  <option value="user">Student</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              {loginRole === 'user' ? (
                <div className="auth-login-methods" role="group" aria-label="Student sign in method">
                  <button
                    type="button"
                    className={`auth-login-method-btn ${loginMethod === 'password' ? 'is-active' : ''}`}
                    onClick={() => {
                      setLoginMethod('password');
                      setLoginMessage(null);
                    }}
                  >
                    Username + Password
                  </button>
                  <button
                    type="button"
                    className={`auth-login-method-btn ${loginMethod === 'otp' ? 'is-active' : ''}`}
                    onClick={() => {
                      setLoginMethod('otp');
                      setLoginMessage(null);
                    }}
                  >
                    Mobile + OTP
                  </button>
                </div>
              ) : null}

              {isOtpMode ? (
                <>
                  <label>
                    Mobile Number
                    <div className="otp-input-row">
                      <input
                        type="text"
                        value={otpForm.phone}
                        onChange={(e) => setOtpForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="Enter 10-digit mobile"
                        inputMode="numeric"
                        maxLength={10}
                      />
                      <button
                        type="button"
                        className="secondary-btn otp-send-btn"
                        onClick={handleSendOtp}
                        disabled={!canSendOtp || isSendingOtp}
                      >
                        {isSendingOtp ? 'Sending...' : (otpCooldown > 0 ? `Resend ${otpCooldown}s` : 'Send OTP')}
                      </button>
                    </div>
                    {otpPhoneHint ? <small className="field-hint">⚠ {otpPhoneHint}</small> : null}
                  </label>

                  <label>
                    OTP
                    <input
                      type="text"
                      value={otpForm.otp}
                      onChange={(e) => setOtpForm((f) => ({ ...f, otp: e.target.value }))}
                      placeholder="Enter 6-digit OTP"
                      inputMode="numeric"
                      maxLength={6}
                    />
                    {otpHint ? <small className="field-hint">⚠ {otpHint}</small> : null}
                    {otpSent ? <small className="field-hint">OTP sent. Enter it to continue.</small> : null}
                  </label>
                </>
              ) : (
                <>
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

                </>
              )}

              <div className="form-actions">
                <button
                  className="primary-btn"
                  type="submit"
                  disabled={!canLogin || isSubmittingLogin}
                >
                  {isSubmittingLogin ? 'Signing in…' : (isOtpMode ? 'Verify OTP & Login' : 'Login')}
                </button>
                {!isOtpMode && loginRole === 'user' ? (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => {
                      setForgotOpen((current) => !current);
                      setForgotMessage(null);
                    }}
                  >
                    {forgotOpen ? 'Close Forgot Password' : 'Forgot Password?'}
                  </button>
                ) : null}
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

              <label style={{ gridColumn: '1 / -1' }}>
                Email Address
                <input
                  type="email"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="e.g. yourname@gmail.com"
                  autoComplete="email"
                />
                {regEmailHint ? <small className="field-hint">⚠ {regEmailHint}</small> : null}
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
                Security Question
                <input type="text" value="What is your birth date?" disabled />
              </label>

              <label>
                Answer (Birth Date)
                <input
                  type="date"
                  value={registerForm.birthDate}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, birthDate: e.target.value }))}
                />
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

      {forgotOpen ? (
        <div className="modal-overlay forgot-password-overlay" onClick={() => setForgotOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reset Password</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setForgotOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="subtitle">Security question: What is your birth date?</p>
            {forgotMessage ? (
              <div className={`forgot-error-banner ${forgotMessage.type === 'success' ? 'success' : 'error'}`} role="alert" aria-live="assertive">
                {forgotMessage.text}
              </div>
            ) : null}
            <form className="auth-forgot-form" onSubmit={handleForgotPassword}>
              <label>
                Username
                <input
                  type="text"
                  value={forgotForm.username}
                  onChange={(e) => {
                    setForgotForm((f) => ({ ...f, username: e.target.value }));
                    setForgotUsernameValid(null);
                  }}
                  onBlur={checkForgotUsername}
                  placeholder="Enter username"
                  autoComplete="username"
                />
                {isCheckingUsername ? (
                  <small className="field-hint">Checking username...</small>
                ) : forgotUsernameValid === false ? (
                  <small className="field-hint error">⚠ Username not found</small>
                ) : forgotUsernameValid === true ? (
                  <small className="field-hint success">✓ Username found</small>
                ) : null}
              </label>
              <label>
                Birth Date
                <input
                  type="date"
                  value={forgotForm.birthDate}
                  onChange={(e) => setForgotForm((f) => ({ ...f, birthDate: e.target.value }))}
                />
              </label>
              <label>
                New Password
                <div className="password-input-wrap">
                  <input
                    type={showForgotPasswords ? 'text' : 'password'}
                    value={forgotForm.password}
                    onChange={(e) => setForgotForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Min 8 chars, letters + numbers"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="toggle-password-btn"
                    onClick={() => setShowForgotPasswords((current) => !current)}
                    aria-label={showForgotPasswords ? 'Hide password' : 'Show password'}
                  >
                    {showForgotPasswords ? 'Hide' : 'Show'}
                  </button>
                </div>
                {forgotPasswordHint ? <small className="field-hint">⚠ {forgotPasswordHint}</small> : null}
              </label>
              <label>
                Confirm New Password
                <div className="password-input-wrap">
                  <input
                    type={showForgotPasswords ? 'text' : 'password'}
                    value={forgotForm.confirmPassword}
                    onChange={(e) => setForgotForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="toggle-password-btn"
                    onClick={() => setShowForgotPasswords((current) => !current)}
                    aria-label={showForgotPasswords ? 'Hide password' : 'Show password'}
                  >
                    {showForgotPasswords ? 'Hide' : 'Show'}
                  </button>
                </div>
                {forgotConfirmHint ? <small className="field-hint">⚠ {forgotConfirmHint}</small> : null}
              </label>
              <div className="form-actions">
                <button className="primary-btn" type="submit" disabled={!canForgotReset || isSubmittingForgot}>
                  {isSubmittingForgot ? 'Updating...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {forgotSuccessModal ? (
        <div className="modal-overlay success-modal-overlay">
          <div className="modal-dialog success-modal-dialog">
            <div className="success-icon">✓</div>
            <h2>Password Reset Successful!</h2>
            <p>Your password has been updated. Please sign in with your new password.</p>
            <div className="success-progress">
              <div className="progress-bar"></div>
            </div>
          </div>
        </div>
      ) : null}

      </section>
    </div>
  );
}


