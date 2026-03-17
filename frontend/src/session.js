const SESSION_KEY = 'biomics_session';

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getToken() {
  return getSession()?.token || null;
}

export function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem('sessionRole', session.role);
  if (session.role === 'admin') {
    localStorage.setItem('adminSession', JSON.stringify({ username: session.username }));
    localStorage.removeItem('userSession');
  } else {
    localStorage.setItem('userSession', JSON.stringify({ username: session.username }));
    localStorage.removeItem('adminSession');
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('sessionRole');
  localStorage.removeItem('adminSession');
  localStorage.removeItem('userSession');
}
