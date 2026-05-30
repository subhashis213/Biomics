export type ThemeMode = 'light' | 'dark';

export type ThemeColors = {
  mode: ThemeMode;
  bg: string;
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  warn: string;
  danger: string;
  success: string;
  badgeBg: string;
  badgeSuccessBg: string;
  badgeWarnBg: string;
  badgeText: string;
  errorBg: string;
  errorText: string;
  successBg: string;
  successText: string;
  tabBar: string;
  shadow: string;
};

export const lightColors: ThemeColors = {
  mode: 'light',
  bg: '#f3f5fa',
  card: '#ffffff',
  cardAlt: '#eef2f8',
  border: '#dde4ef',
  text: '#0f1b2d',
  muted: '#5d6b82',
  accent: '#0d9488',
  accentSoft: '#d7f3ef',
  accentText: '#ffffff',
  warn: '#b27607',
  danger: '#d64545',
  success: '#1f9d57',
  badgeBg: '#eef2f8',
  badgeSuccessBg: '#dcf5e6',
  badgeWarnBg: '#fbeacc',
  badgeText: '#1b2a44',
  errorBg: '#fde8e8',
  errorText: '#b42318',
  successBg: '#dcf5e6',
  successText: '#16653a',
  tabBar: '#ffffff',
  shadow: 'rgba(15, 27, 45, 0.08)'
};

export const darkColors: ThemeColors = {
  mode: 'dark',
  bg: '#0b1220',
  card: '#121c2e',
  cardAlt: '#18243a',
  border: '#243352',
  text: '#f4f7fb',
  muted: '#9fb0c9',
  accent: '#3dd6c6',
  accentSoft: '#12352f',
  accentText: '#04241f',
  warn: '#f5b942',
  danger: '#ff6b6b',
  success: '#5ee08a',
  badgeBg: '#18243a',
  badgeSuccessBg: '#1a3d2e',
  badgeWarnBg: '#3d3318',
  badgeText: '#f4f7fb',
  errorBg: '#3a1820',
  errorText: '#ffb4b4',
  successBg: '#16331f',
  successText: '#bdf0cd',
  tabBar: '#121c2e',
  shadow: 'rgba(0, 0, 0, 0.4)'
};

export function colorsForMode(mode: ThemeMode): ThemeColors {
  return mode === 'dark' ? darkColors : lightColors;
}
