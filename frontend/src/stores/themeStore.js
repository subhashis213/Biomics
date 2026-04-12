import { create } from 'zustand';

const THEME_KEY = 'biomics_theme';

function normalizeTheme(v) {
  return v === 'light' ? 'light' : 'dark';
}

const initialTheme = normalizeTheme(
  typeof localStorage !== 'undefined' ? (localStorage.getItem(THEME_KEY) || 'light') : 'light'
);

// Apply immediately on module load so there's no flash.
document.documentElement.setAttribute('data-theme', initialTheme);

export const useThemeStore = create((set) => ({
  theme: initialTheme,
  toggleTheme() {
    set((state) => {
      const next = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem(THEME_KEY, next);
      document.documentElement.setAttribute('data-theme', next);
      return { theme: next };
    });
  }
}));
