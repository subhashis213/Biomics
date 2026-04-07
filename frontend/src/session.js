const SESSION_KEY = 'biomics_session';

function getSessionStorage() {
  return window.sessionStorage;
}

function getLegacyStorage() {
  return window.localStorage;
}

function clearLegacySessionKeys() {
  const legacyStorage = getLegacyStorage();
  legacyStorage.removeItem(SESSION_KEY);
  legacyStorage.removeItem('sessionRole');
  legacyStorage.removeItem('adminSession');
  legacyStorage.removeItem('userSession');
}

export function getSession() {
  try {
    const storage = getSessionStorage();
    const raw = storage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);

    // Never hydrate auth state from shared localStorage.
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
  const storage = getSessionStorage();
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
  const storage = getSessionStorage();
  storage.removeItem(SESSION_KEY);
  storage.removeItem('sessionRole');
  storage.removeItem('adminSession');
  storage.removeItem('userSession');
  clearLegacySessionKeys();
}
