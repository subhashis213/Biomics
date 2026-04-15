const SESSION_KEY = 'biomics_session';

// On native Capacitor (Android/iOS), use localStorage so the session persists
// when the app is killed or cleared from recents. On web, use sessionStorage
// for per-tab isolation so multiple accounts can be open in different tabs.
function isCapacitorNativeApp() {
  if (typeof window === 'undefined') return false;
  return (
    window.location.protocol === 'capacitor:'
    || window.location.protocol === 'ionic:'
    || window.Capacitor?.isNativePlatform?.()
  );
}

function getStorage() {
  return isCapacitorNativeApp() ? window.localStorage : window.sessionStorage;
}

function getLegacyStorage() {
  return window.localStorage;
}

function clearLegacySessionKeys() {
  // In native context localStorage IS primary storage — don't clear it as legacy.
  if (isCapacitorNativeApp()) return;
  const legacyStorage = getLegacyStorage();
  legacyStorage.removeItem(SESSION_KEY);
  legacyStorage.removeItem('sessionRole');
  legacyStorage.removeItem('adminSession');
  legacyStorage.removeItem('userSession');
}

export function getSession() {
  try {
    const storage = getStorage();
    const raw = storage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);

    // Never hydrate auth state from shared localStorage (web only).
    // This guarantees each tab keeps an isolated identity.
    clearLegacySessionKeys();
    return null;
  } catch {
    return null;
  }
}

export function getToken() {
  return getSession()?.token || null;
}

export function setSession(session) {
  const storage = getStorage();
  storage.setItem(SESSION_KEY, JSON.stringify(session));
  storage.setItem('sessionRole', session.role);
  if (session.role === 'admin') {
    storage.setItem('adminSession', JSON.stringify({ username: session.username }));
    storage.removeItem('userSession');
  } else {
    storage.setItem('userSession', JSON.stringify({ username: session.username }));
    storage.removeItem('adminSession');
  }

  // Cleanup legacy global session to prevent cross-tab account override behavior.
  clearLegacySessionKeys();
}

export function clearSession() {
  const storage = getStorage();
  storage.removeItem(SESSION_KEY);
  storage.removeItem('sessionRole');
  storage.removeItem('adminSession');
  storage.removeItem('userSession');
  clearLegacySessionKeys();
}
