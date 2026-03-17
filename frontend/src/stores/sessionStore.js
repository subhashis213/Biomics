import { create } from 'zustand';
import { clearSession, getSession, setSession } from '../session';

export const useSessionStore = create((set) => ({
  session: getSession(),

  /** Called after successful login — persists to localStorage and updates store. */
  login(session) {
    setSession(session);
    set({ session });
  },

  /** Clears localStorage session and resets store. */
  logout() {
    clearSession();
    set({ session: null });
  }
}));
