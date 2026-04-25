import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiBase, requestJson } from '../api';
import { emptyRegisterForm } from '../constants';
import { getSession } from '../session';
import { useSessionStore } from '../stores/sessionStore';

export default function AuthPage() {
  const REGISTER_FLIP_BACK_MS = 3000;
  const GOOGLE_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const navigate = useNavigate();
  const existingSession = getSession();
  const { login } = useSessionStore();
  const [loginMethod, setLoginMethod] = useState('password');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [otpForm, setOtpForm] = useState({ email: '', otp: '' });
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
  const [isAdminUsername, setIsAdminUsername] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [googleLoadError, setGoogleLoadError] = useState('');
  const [isGoogleSdkReady, setIsGoogleSdkReady] = useState(false);
  const [googleSlideProgress, setGoogleSlideProgress] = useState(0);
  const [isGoogleSliding, setIsGoogleSliding] = useState(false);
  const [googleSlideSuccess, setGoogleSlideSuccess] = useState(false);
  const [googleProfileDraft, setGoogleProfileDraft] = useState({
    open: false,
    completionToken: '',
    email: '',
    name: '',
    picture: '',
    phone: '',
    birthDate: '',
    missingFields: []
  });
  const [isSubmittingGoogleProfile, setIsSubmittingGoogleProfile] = useState(false);
  // serverReady: false while health ping is in-flight (Render cold start)
  const isLocalhost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const [serverReady, setServerReady] = useState(isLocalhost);
  const registerFlipTimerRef = useRef(null);
  const forgotSuccessTimerRef = useRef(null);
  const googleButtonRef = useRef(null);
  const googleSlideTrackRef = useRef(null);
  const googleSlideRafRef = useRef(0);
  const googleSlideClientXRef = useRef(null);
  const googleSuccessTimerRef = useRef(0);

  useEffect(() => {
    if (!existingSession) return;
    navigate(existingSession.role === 'admin' ? '/admin' : '/student', { replace: true });
  }, [existingSession, navigate]);

  // Ping /health on mount so we know the server is warm before the user clicks Send OTP.
  // Only needed in production (Render free tier sleeps after inactivity).
  useEffect(() => {
    if (isLocalhost) return;
    let cancelled = false;
    const deadline = setTimeout(() => { if (!cancelled) setServerReady(true); }, 90000);
    fetch(`${getApiBase()}/health`, { method: 'GET', cache: 'no-store' })
      .then(() => { if (!cancelled) setServerReady(true); })
      .catch(() => { if (!cancelled) setServerReady(true); })
      .finally(() => clearTimeout(deadline));
    return () => { cancelled = true; clearTimeout(deadline); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (googleSuccessTimerRef.current) {
        window.clearTimeout(googleSuccessTimerRef.current);
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
    if (otpCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setOtpCooldown((seconds) => (seconds > 0 ? seconds - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpCooldown]);

  useEffect(() => {
    const username = String(loginForm.username || '').trim();
    if (username.length < 3) {
      setIsAdminUsername(false);
      return undefined;
    }

    let cancelled = false;
    const timerId = window.setTimeout(async () => {
      try {
        const response = await requestJson('/auth/check-admin-username', {
          method: 'POST',
          body: JSON.stringify({ username })
        });
        if (!cancelled) {
          const isAdmin = Boolean(response?.exists);
          setIsAdminUsername(isAdmin);
          if (isAdmin) {
            setLoginMethod('password');
            setOtpSent(false);
            setOtpCooldown(0);
          }
        }
      } catch {
        if (!cancelled) setIsAdminUsername(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [loginForm.username]);

  const isOtpMode = loginMethod === 'otp';
  const isValidEmailForOtp = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(otpForm.email.trim());
  const canLogin = isOtpMode
    ? isValidEmailForOtp && /^\d{6}$/.test(otpForm.otp.trim())
    : loginForm.username.trim().length >= 3 && loginForm.password.length >= 6;
  const canSendOtp = isValidEmailForOtp && otpCooldown === 0;
  const canSubmitGoogleProfile =
    /^\d{10}$/.test(String(googleProfileDraft.phone || '').trim()) &&
    Boolean(String(googleProfileDraft.birthDate || '').trim());
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

  const otpEmailHint =
    otpForm.email.length > 0 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(otpForm.email.trim())
      ? 'Enter a valid Gmail/email address.'
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
      let response;
      let role = 'user';
      if (isOtpMode) {
        response = await requestJson('/auth/verify-email-otp', {
          method: 'POST',
          body: JSON.stringify({ email: otpForm.email.trim(), otp: otpForm.otp.trim() }),
        });
      } else {
        try {
          response = await requestJson('/auth/login', {
            method: 'POST',
            body: JSON.stringify(loginForm),
          });
        } catch (studentError) {
          // Seamless admin detection: if student login fails, try admin endpoint using same credentials.
          try {
            response = await requestJson('/auth/admin-login', {
              method: 'POST',
              body: JSON.stringify(loginForm),
            });
            role = 'admin';
          } catch {
            throw studentError;
          }
        }
      }
      const identity = role === 'admin' ? response?.admin : response?.user;
      const session = {
        role,
        username: identity?.username || (isOtpMode ? otpForm.email.trim() : loginForm.username.trim()),
        token: response?.token,
      };
      login(session);
      navigate(session.role === 'admin' ? '/admin' : '/student', { replace: true });
    } catch (error) {
      setLoginMessage({ type: 'error', text: error.message });
    } finally {
      setIsSubmittingLogin(false);
    }
  }

  async function handleGoogleCredential(credentialToken) {
    if (!credentialToken) return;
    setIsGoogleSigningIn(true);
    setLoginMessage(null);
    try {
      const response = await requestJson('/auth/google-login', {
        method: 'POST',
        body: JSON.stringify({ idToken: credentialToken })
      });
      if (response?.requiresProfileCompletion) {
        setGoogleProfileDraft({
          open: true,
          completionToken: String(response?.completionToken || '').trim(),
          email: String(response?.profile?.email || '').trim(),
          name: String(response?.profile?.name || '').trim(),
          picture: String(response?.profile?.picture || '').trim(),
          phone: String(response?.profile?.phone || '').trim(),
          birthDate: String(response?.profile?.birthDate || '').trim(),
          missingFields: Array.isArray(response?.missingFields) ? response.missingFields : []
        });
        setLoginMessage({ type: 'info', text: 'Please complete your profile to continue.' });
        return;
      }

      const identity = response?.user || {};
      const session = {
        role: 'user',
        username: identity?.username || String(response?.user?.email || 'google-user').trim(),
        token: response?.token
      };
      login(session);
      navigate('/student', { replace: true });
    } catch (error) {
      const text = String(error?.message || '').toUpperCase();
      if (text.includes('NETWORK_ERROR')) {
        const hint = error?.lastUrl ? ` (${error.lastUrl})` : '';
        setLoginMessage({ type: 'error', text: `Network error while contacting server${hint}. Restart backend and try again.` });
      } else {
        setLoginMessage({ type: 'error', text: error.message || 'Google sign-in failed' });
      }
    } finally {
      setIsGoogleSigningIn(false);
    }
  }

  function updateSlideProgressFromClientX(clientX) {
    const track = googleSlideTrackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const thumbSize = 44;
    const usableWidth = Math.max(1, rect.width - thumbSize);
    const next = Math.min(1, Math.max(0, (clientX - rect.left - thumbSize / 2) / usableWidth));
    setGoogleSlideProgress(next);
    return next;
  }

  function queueSlideProgressFromClientX(clientX) {
    googleSlideClientXRef.current = clientX;
    if (googleSlideRafRef.current) return;
    googleSlideRafRef.current = window.requestAnimationFrame(() => {
      googleSlideRafRef.current = 0;
      if (googleSlideClientXRef.current == null) return;
      updateSlideProgressFromClientX(googleSlideClientXRef.current);
    });
  }

  function triggerGoogleFromSlide() {
    const host = googleButtonRef.current;
    if (!host) return false;
    const candidate = host.querySelector('[role="button"], button, div[tabindex]');
    if (!candidate || typeof candidate.click !== 'function') return false;
    candidate.click();
    return true;
  }

  function handleGoogleSliderPointerDown(event) {
    if (isGoogleSigningIn) return;
    setIsGoogleSliding(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // pointer capture may fail on some browsers/devices
    }
    queueSlideProgressFromClientX(event.clientX);
  }

  function handleGoogleSliderPointerMove(event) {
    if (!isGoogleSliding) return;
    queueSlideProgressFromClientX(event.clientX);
  }

  function handleGoogleSliderPointerUp(event) {
    if (!isGoogleSliding) return;
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // safe no-op
    }
    const progress = updateSlideProgressFromClientX(event.clientX);
    setIsGoogleSliding(false);
    if (progress >= 0.92) {
      setGoogleSlideProgress(1);
      if (!isGoogleSdkReady) {
        setGoogleLoadError('Preparing Google sign-in. Please try sliding again in a moment.');
      } else {
        const opened = triggerGoogleFromSlide();
        if (opened) {
          setGoogleLoadError('');
          setGoogleSlideSuccess(true);
          if (googleSuccessTimerRef.current) {
            window.clearTimeout(googleSuccessTimerRef.current);
          }
          googleSuccessTimerRef.current = window.setTimeout(() => {
            setGoogleSlideSuccess(false);
            googleSuccessTimerRef.current = 0;
          }, 1200);
        } else {
          setGoogleLoadError('Google sign-in not ready yet. Please slide once more.');
        }
      }
    } else {
      setGoogleLoadError('');
      setGoogleSlideSuccess(false);
    }
    window.setTimeout(() => setGoogleSlideProgress(0), 180);
  }

  async function handleGoogleProfileSubmit(event) {
    event?.preventDefault?.();
    if (!canSubmitGoogleProfile || isSubmittingGoogleProfile) return;
    setIsSubmittingGoogleProfile(true);
    setLoginMessage(null);
    try {
      const response = await requestJson('/auth/google-complete-profile', {
        method: 'POST',
        body: JSON.stringify({
          completionToken: googleProfileDraft.completionToken,
          phone: String(googleProfileDraft.phone || '').trim(),
          birthDate: googleProfileDraft.birthDate
        })
      });
      const identity = response?.user || {};
      login({
        role: 'user',
        username: identity?.username || 'student',
        token: response?.token
      });
      navigate('/student', { replace: true });
      window.setTimeout(() => {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/student')) {
          window.location.assign('/student');
        }
      }, 120);
    } catch (error) {
      setLoginMessage({ type: 'error', text: error.message || 'Failed to complete profile' });
    } finally {
      setIsSubmittingGoogleProfile(false);
    }
  }

  async function handleSendOtp() {
    if (!canSendOtp) return;
    setIsSendingOtp(true);
    setLoginMessage({ type: 'info', text: '⏳ Connecting to server… this may take up to 60s on first use.' });
    try {
      const response = await requestJson('/auth/send-email-otp', {
        method: 'POST',
        body: JSON.stringify({ email: otpForm.email.trim() })
      });
      setOtpSent(true);
      setOtpCooldown(Number(response.cooldownSeconds || 45));
      setLoginMessage({
        type: 'success',
        text: `OTP sent to ${otpForm.email.trim()}. Check your inbox.`
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

  useEffect(() => {
    if (GOOGLE_CLIENT_ID) return;
    setLoginMessage((current) => current || { type: 'info', text: 'Google sign-in is not configured yet. Add VITE_GOOGLE_CLIENT_ID to enable it.' });
  }, [GOOGLE_CLIENT_ID]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || registerOpen || isAdminUsername) return undefined;
    if (typeof window === 'undefined') return undefined;
    setIsGoogleSdkReady(false);

    let cancelled = false;
    const scriptId = 'google-identity-services';
    let initRetryTimer = 0;
    let retryCount = 0;

    const initializeGoogleSdk = () => {
      if (cancelled) return;
      if (!window.google?.accounts?.id || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        ux_mode: 'popup',
        auto_select: false,
        callback: (response) => {
          const token = String(response?.credential || '').trim();
          if (token) handleGoogleCredential(token);
        }
      });
      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        text: 'signin_with',
        width: 340
      });
      setIsGoogleSdkReady(true);
      setGoogleLoadError('');
    };

    const tryInitializeWithRetry = () => {
      if (cancelled) return;
      if (window.google?.accounts?.id) {
        initializeGoogleSdk();
        return;
      }
      if (retryCount >= 30) {
        setGoogleLoadError('Google sign-in is taking too long to load. Refresh and try again.');
        return;
      }
      retryCount += 1;
      initRetryTimer = window.setTimeout(tryInitializeWithRetry, 150);
    };

    const existingScript = document.getElementById(scriptId);
    if (existingScript) {
      if (window.google?.accounts?.id) {
        initializeGoogleSdk();
      } else {
        existingScript.addEventListener('load', tryInitializeWithRetry);
        tryInitializeWithRetry();
      }
      return () => {
        cancelled = true;
        existingScript.removeEventListener('load', tryInitializeWithRetry);
        if (initRetryTimer) window.clearTimeout(initRetryTimer);
      };
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = tryInitializeWithRetry;
    script.onerror = () => {
      if (!cancelled) {
        setGoogleLoadError('Unable to load Google sign-in right now.');
      }
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      if (initRetryTimer) window.clearTimeout(initRetryTimer);
    };
  }, [GOOGLE_CLIENT_ID, registerOpen, isAdminUsername]);

  useEffect(() => () => {
    if (googleSlideRafRef.current) {
      window.cancelAnimationFrame(googleSlideRafRef.current);
      googleSlideRafRef.current = 0;
    }
  }, []);

  return (
    <div className="auth-page-shell">
      {toast ? (
        <aside className={`auth-toast ${toast.type}`} role="status" aria-live="polite">
          <span>{toast.text}</span>
          <button type="button" className="auth-toast-close" onClick={() => setToast(null)} aria-label="Dismiss notification">
            ×
          </button>
        </aside>
      ) : null}

      {/* ── Auth panel ─────────────────────────────────── */}
      <section className="auth-card-panel">
        <div className={`auth-flip-wrap ${registerOpen ? 'is-register' : ''}`}>
          <section className="auth-flip-face auth-flip-face-front" aria-hidden={registerOpen}>
            <form className="card auth-face-card" onSubmit={handleLogin}>
              <h2>Sign in</h2>
              <div className="auth-login-methods" role="group" aria-label="Sign in method">
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
                {!isAdminUsername ? (
                  <button
                    type="button"
                    className={`auth-login-method-btn ${loginMethod === 'otp' ? 'is-active' : ''}`}
                    onClick={() => {
                      setLoginMethod('otp');
                      setLoginMessage(null);
                    }}
                  >
                    Gmail + OTP
                  </button>
                ) : null}
              </div>
              {isAdminUsername ? <small className="field-hint">Admin account detected. Sign in using username and password.</small> : null}
              {!isAdminUsername ? (
                <div className="auth-social-block">
                  <p className="auth-social-label">or continue with</p>
                  <div className="auth-social-provider-chip" aria-hidden="true">
                    <span className="auth-social-provider-icon">
                      <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.2-1.4 3.6-5.5 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.9H12z" />
                        <path fill="#34A853" d="M3.2 7.3l3.2 2.3C7.2 8 9.4 6.5 12 6.5c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 8 2 4.6 4.2 3.2 7.3z" />
                        <path fill="#FBBC05" d="M12 22c2.6 0 4.8-.9 6.4-2.4l-3-2.5c-.8.5-1.9.9-3.4.9-2.5 0-4.7-1.7-5.5-4l-3.3 2.5C4.6 19.8 8 22 12 22z" />
                        <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.2-.2-1.9H12v3.9h5.5c-.3 1.4-1.2 2.5-2.2 3.3l3 2.5c1.8-1.7 3.3-4.3 3.3-7.8z" />
                      </svg>
                    </span>
                    <span>Google Sign-In</span>
                  </div>
                  <div className={`auth-google-slide-wrap${isGoogleSigningIn ? ' is-loading' : ''}${isGoogleSliding ? ' is-dragging' : ''}${googleSlideSuccess ? ' is-success' : ''}`}>
                    <div className="auth-google-slide-label">Slide to continue with Google</div>
                    <div
                      ref={googleSlideTrackRef}
                      className="auth-google-slide-track"
                      onPointerDown={handleGoogleSliderPointerDown}
                      onPointerMove={handleGoogleSliderPointerMove}
                      onPointerUp={handleGoogleSliderPointerUp}
                      onPointerCancel={() => {
                        setIsGoogleSliding(false);
                        setGoogleSlideProgress(0);
                      }}
                    >
                      <div className="auth-google-slide-fill" style={{ '--slide-progress': googleSlideProgress }} />
                      <div
                        className="auth-google-slide-thumb"
                        style={{ '--slide-progress': googleSlideProgress }}
                        role="button"
                        aria-label="Slide to sign in with Google"
                      >
                        <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.2-1.4 3.6-5.5 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.9H12z" />
                          <path fill="#34A853" d="M3.2 7.3l3.2 2.3C7.2 8 9.4 6.5 12 6.5c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 8 2 4.6 4.2 3.2 7.3z" />
                          <path fill="#FBBC05" d="M12 22c2.6 0 4.8-.9 6.4-2.4l-3-2.5c-.8.5-1.9.9-3.4.9-2.5 0-4.7-1.7-5.5-4l-3.3 2.5C4.6 19.8 8 22 12 22z" />
                          <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.2-.2-1.9H12v3.9h5.5c-.3 1.4-1.2 2.5-2.2 3.3l3 2.5c1.8-1.7 3.3-4.3 3.3-7.8z" />
                        </svg>
                      </div>
                      <div className="auth-google-slide-text">Slide to Sign in with Google</div>
                    </div>
                  </div>
                  <div className="auth-google-hidden-host" aria-hidden="true">
                    <div ref={googleButtonRef} className="auth-google-button-host" />
                  </div>
                  {googleLoadError ? <small className="field-hint">⚠ {googleLoadError}</small> : null}
                  {isGoogleSigningIn ? <small className="field-hint">Signing in with Google…</small> : null}
                </div>
              ) : null}

              {isOtpMode ? (
                <div className="email-otp-block">
                  <div className="email-otp-icon-row" aria-hidden="true">
                    <span className="email-otp-envelope">✉️</span>
                    <span className="email-otp-label">We&apos;ll send a 6-digit OTP to your Gmail</span>
                  </div>

                  <label>
                    Gmail Address
                    <div className="otp-input-row">
                      <input
                        type="email"
                        value={otpForm.email}
                        onChange={(e) => setOtpForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="yourname@gmail.com"
                        autoComplete="email"
                        inputMode="email"
                      />
                      <button
                        type="button"
                        className={`otp-send-btn ${otpSent ? 'otp-sent' : ''}`}
                        onClick={handleSendOtp}
                        disabled={!canSendOtp || isSendingOtp || !serverReady}
                        title={!serverReady ? 'Server is warming up, please wait…' : undefined}
                      >
                        {!serverReady
                          ? <><span className="otp-spinner" />Warming up…</>
                          : isSendingOtp
                            ? <><span className="otp-spinner" />Sending…</>
                            : otpCooldown > 0
                              ? `Resend in ${otpCooldown}s`
                              : otpSent ? '✓ Resend OTP' : 'Send OTP'}
                      </button>
                    </div>
                    {otpEmailHint ? <small className="field-hint">⚠ {otpEmailHint}</small> : null}
                  </label>

                  {otpSent ? (
                    <div className="otp-sent-banner">
                      <span className="otp-sent-icon">📬</span>
                      <span>OTP sent! Check your inbox (and spam folder).</span>
                    </div>
                  ) : null}

                  <label>
                    Enter OTP
                    <input
                      className="otp-digit-input"
                      type="text"
                      value={otpForm.otp}
                      onChange={(e) => setOtpForm((f) => ({ ...f, otp: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                      placeholder="• • • • • •"
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="one-time-code"
                    />
                    {otpHint ? <small className="field-hint">⚠ {otpHint}</small> : null}
                  </label>
                </div>
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
                {!isOtpMode ? (
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

              {googleProfileDraft.open ? (
                <section className="auth-google-profile-card" aria-label="Complete profile">
                  <h3>Complete your profile</h3>
                  <p className="subtitle">Google did not provide all required details. Please add them once.</p>
                  <div className="auth-google-profile-form">
                    <label>
                      Email
                      <input type="email" value={googleProfileDraft.email} disabled />
                    </label>
                    <label>
                      Mobile Number
                      <input
                        type="text"
                        placeholder="10-digit mobile number"
                        value={googleProfileDraft.phone}
                        onChange={(e) => setGoogleProfileDraft((current) => ({ ...current, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                      />
                    </label>
                    <label>
                      Date of Birth
                      <input
                        type="date"
                        value={googleProfileDraft.birthDate}
                        onChange={(e) => setGoogleProfileDraft((current) => ({ ...current, birthDate: e.target.value }))}
                      />
                    </label>
                    <div className="form-actions">
                      <button type="button" className="primary-btn" onClick={handleGoogleProfileSubmit} disabled={!canSubmitGoogleProfile || isSubmittingGoogleProfile}>
                        {isSubmittingGoogleProfile ? 'Saving…' : 'Save & Continue'}
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}

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


