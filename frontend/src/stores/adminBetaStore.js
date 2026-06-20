import { create } from 'zustand';

const BETA_KEY = 'biomics_admin_beta';

function readAdminBetaEnabled() {
  if (typeof localStorage === 'undefined') return true;
  const stored = localStorage.getItem(BETA_KEY);
  if (stored === null) return true;
  return stored === 'on';
}

function applyAdminBetaAttr(enabled) {
  document.documentElement.setAttribute('data-admin-beta', enabled ? 'on' : 'off');
}

const initialEnabled = readAdminBetaEnabled();

applyAdminBetaAttr(initialEnabled);

export const useAdminBetaStore = create((set) => ({
  adminBetaEnabled: initialEnabled,
  toggleAdminBeta() {
    set((state) => {
      const next = !state.adminBetaEnabled;
      localStorage.setItem(BETA_KEY, next ? 'on' : 'off');
      applyAdminBetaAttr(next);
      return { adminBetaEnabled: next };
    });
  }
}));
