import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { postSessionActivity } from '../api';
import { useSessionStore } from '../stores/sessionStore';

const ACTIVITY_SESSION_ID_KEY = 'biomics_activity_session_id';
const ACTIVITY_SESSION_OWNER_KEY = 'biomics_activity_session_owner';
const HEARTBEAT_INTERVAL_MS = 30000;

function generateSessionId() {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isTrackablePath(pathname) {
  return Boolean(pathname) && pathname !== '/auth';
}

function isDocumentActive() {
  if (typeof document === 'undefined') return false;
  const isVisible = document.visibilityState !== 'hidden';
  const isFocused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
  return isVisible && isFocused;
}

function ensureTrackedSessionId(ownerKey) {
  if (typeof window === 'undefined') return generateSessionId();

  try {
    const existingOwner = window.sessionStorage.getItem(ACTIVITY_SESSION_OWNER_KEY);
    const existingId = window.sessionStorage.getItem(ACTIVITY_SESSION_ID_KEY);
    if (existingOwner === ownerKey && existingId) {
      return existingId;
    }

    const nextId = generateSessionId();
    window.sessionStorage.setItem(ACTIVITY_SESSION_OWNER_KEY, ownerKey);
    window.sessionStorage.setItem(ACTIVITY_SESSION_ID_KEY, nextId);
    return nextId;
  } catch (_) {
    return generateSessionId();
  }
}

function clearTrackedSessionId() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(ACTIVITY_SESSION_OWNER_KEY);
    window.sessionStorage.removeItem(ACTIVITY_SESSION_ID_KEY);
  } catch (_) {
    // Best-effort cleanup only.
  }
}

export default function SessionActivityTracker() {
  const session = useSessionStore((state) => state.session);
  const location = useLocation();
  const currentPath = useMemo(
    () => `${location.pathname}${location.search || ''}`,
    [location.pathname, location.search]
  );
  const authKey = session?.token
    ? `${session.role || 'user'}:${session.username || 'unknown'}:${String(session.token).slice(-16)}`
    : '';

  const sessionIdRef = useRef('');
  const currentPathRef = useRef(currentPath);
  const isActiveRef = useRef(false);
  const tokenRef = useRef(session?.token || '');

  currentPathRef.current = currentPath;
  tokenRef.current = session?.token || '';

  function emitSessionEvent(event, options = {}) {
    const token = options.tokenOverride || tokenRef.current;
    const path = currentPathRef.current;
    if (!token || !sessionIdRef.current || !isTrackablePath(path)) {
      return Promise.resolve(null);
    }

    return postSessionActivity({
      sessionId: sessionIdRef.current,
      event,
      path,
      title: typeof document !== 'undefined' ? document.title || '' : ''
    }, {
      keepalive: options.keepalive,
      tokenOverride: token
    }).catch(() => null);
  }

  useEffect(() => {
    if (!authKey) {
      isActiveRef.current = false;
      sessionIdRef.current = '';
      clearTrackedSessionId();
      return undefined;
    }

    sessionIdRef.current = ensureTrackedSessionId(authKey);

    function syncDocumentActivity(options = {}) {
      if (!isTrackablePath(currentPathRef.current)) return;

      if (isDocumentActive()) {
        const nextEvent = isActiveRef.current ? 'heartbeat' : 'start';
        emitSessionEvent(nextEvent, options);
        isActiveRef.current = true;
        return;
      }

      if (isActiveRef.current) {
        emitSessionEvent('pause', options);
        isActiveRef.current = false;
      }
    }

    syncDocumentActivity();

    const intervalId = window.setInterval(() => {
      if (!isTrackablePath(currentPathRef.current)) return;
      if (isDocumentActive()) {
        emitSessionEvent(isActiveRef.current ? 'heartbeat' : 'start');
        isActiveRef.current = true;
      }
    }, HEARTBEAT_INTERVAL_MS);

    const handleVisibilityChange = () => syncDocumentActivity({ keepalive: document.visibilityState === 'hidden' });
    const handleFocus = () => syncDocumentActivity();
    const handleBlur = () => syncDocumentActivity({ keepalive: true });
    const handlePageHide = () => {
      if (!isActiveRef.current) return;
      emitSessionEvent('end', { keepalive: true });
      isActiveRef.current = false;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pagehide', handlePageHide);
      if (isActiveRef.current) {
        emitSessionEvent('end', { keepalive: true, tokenOverride: session?.token || '' });
      }
      isActiveRef.current = false;
      clearTrackedSessionId();
    };
  }, [authKey, session?.token]);

  useEffect(() => {
    if (!authKey || !isTrackablePath(currentPath)) return;
    if (!sessionIdRef.current) {
      sessionIdRef.current = ensureTrackedSessionId(authKey);
    }

    if (isDocumentActive()) {
      emitSessionEvent(isActiveRef.current ? 'heartbeat' : 'start');
      isActiveRef.current = true;
    }
  }, [authKey, currentPath]);

  return null;
}