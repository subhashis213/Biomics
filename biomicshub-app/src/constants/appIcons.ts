export type AppIconKey =
  | 'home'
  | 'live'
  | 'learn'
  | 'courses'
  | 'tests'
  | 'exams'
  | 'mock'
  | 'profile'
  | 'books'
  | 'library'
  | 'performance'
  | 'chat'
  | 'cart'
  | 'support'
  | 'notifications'
  | 'course'
  | 'module'
  | 'topic'
  | 'video'
  | 'streak'
  | 'themeLight'
  | 'themeDark'
  | 'explore'
  | 'quiz'
  | 'folder'
  | 'lock'
  | 'play'
  | 'download'
  | 'calendar'
  | 'megaphone';

export type AppIconDef = {
  emoji: string;
  lightBg: string;
  darkBg: string;
  label?: string;
};

/** Colourful emoji + soft background tints for light/dark themes. */
export const APP_ICONS: Record<AppIconKey, AppIconDef> = {
  home: { emoji: '🏠', lightBg: '#E8F4FF', darkBg: '#1A2A3D' },
  live: { emoji: '🎥', lightBg: '#FFE8EC', darkBg: '#3D1A22' },
  learn: { emoji: '📚', lightBg: '#E8F8EF', darkBg: '#1A3D28' },
  courses: { emoji: '🎓', lightBg: '#EEE8FF', darkBg: '#2A1F4D' },
  tests: { emoji: '📝', lightBg: '#FFF4E5', darkBg: '#3D2E14' },
  exams: { emoji: '🏆', lightBg: '#FFF8DC', darkBg: '#3D3514' },
  mock: { emoji: '⏱️', lightBg: '#E5F6FF', darkBg: '#14303D' },
  profile: { emoji: '👤', lightBg: '#F0E8FF', darkBg: '#2A1A3D' },
  books: { emoji: '📖', lightBg: '#E8FFF4', darkBg: '#1A3D30' },
  library: { emoji: '📚', lightBg: '#E8F0FF', darkBg: '#1A2540' },
  performance: { emoji: '📊', lightBg: '#E8FFF8', darkBg: '#1A3D36' },
  chat: { emoji: '💬', lightBg: '#E8F4FF', darkBg: '#1A2A40' },
  cart: { emoji: '🛒', lightBg: '#FFF0E8', darkBg: '#3D241A' },
  support: { emoji: '🎧', lightBg: '#F3E8FF', darkBg: '#2A1A3D' },
  notifications: { emoji: '🔔', lightBg: '#FFF8E8', darkBg: '#3D341A' },
  course: { emoji: '🎓', lightBg: '#EEE8FF', darkBg: '#2A1F4D' },
  module: { emoji: '📂', lightBg: '#E8F4FF', darkBg: '#1A2A3D' },
  topic: { emoji: '🧬', lightBg: '#E8FFF0', darkBg: '#1A3D24' },
  video: { emoji: '▶️', lightBg: '#FFE8F0', darkBg: '#3D1A28' },
  streak: { emoji: '🔥', lightBg: '#FFF0E5', darkBg: '#3D2214' },
  themeLight: { emoji: '☀️', lightBg: '#FFF7D6', darkBg: '#3D3518' },
  themeDark: { emoji: '🌙', lightBg: '#E8EAFF', darkBg: '#1A1F3D' },
  explore: { emoji: '🔍', lightBg: '#E8F8FF', darkBg: '#1A2E3D' },
  quiz: { emoji: '✅', lightBg: '#E8FFEF', darkBg: '#1A3D22' },
  folder: { emoji: '📂', lightBg: '#E8F0FF', darkBg: '#1A2540' },
  lock: { emoji: '🔒', lightBg: '#FFF0E8', darkBg: '#3D241A' },
  play: { emoji: '▶️', lightBg: '#E8FFF4', darkBg: '#1A3D28' },
  download: { emoji: '⬇️', lightBg: '#E8F4FF', darkBg: '#1A2A3D' },
  calendar: { emoji: '📅', lightBg: '#FFF4E5', darkBg: '#3D2E14' },
  megaphone: { emoji: '📢', lightBg: '#FFF8E8', darkBg: '#3D341A' }
};

export const HOME_TILES = [
  { key: 'courses', label: 'Courses', icon: 'courses' as AppIconKey, route: '/student/learn' },
  { key: 'live', label: 'Live Class', icon: 'live' as AppIconKey, route: '/student/live' },
  { key: 'tests', label: 'Test Series', icon: 'tests' as AppIconKey, route: '/student/tests' },
  { key: 'exams', label: 'Mock & Monthly', icon: 'exams' as AppIconKey, route: '/student/exams' }
] as const;

export const TAB_ICONS: Record<string, AppIconKey> = {
  index: 'home',
  live: 'live',
  learn: 'learn',
  tests: 'tests',
  profile: 'profile'
};
