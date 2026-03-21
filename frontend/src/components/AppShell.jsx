import logoImg from '../assets/biomics-mark.png';
import { useThemeStore } from '../stores/themeStore';

export default function AppShell({ title, subtitle, roleLabel, onLogout, children, actions }) {
  const { theme, toggleTheme } = useThemeStore();
  const isLightTheme = theme === 'light';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <img src={logoImg} alt="Biomics Hub logo" className="topbar-logo" />
          <div className="topbar-brand-text">
            <span className="topbar-site-name">Biomics Hub</span>
            <h1 className="topbar-title">{title}</h1>
            {subtitle ? <p className="subtitle">{subtitle}</p> : null}
          </div>
        </div>
        <div className="topbar-actions">
          {actions}
          <button
            type="button"
            className="theme-switch"
            onClick={toggleTheme}
            aria-label={`Switch to ${isLightTheme ? 'Dark' : 'Light'} theme`}
            aria-pressed={isLightTheme}
            title={isLightTheme ? 'Light theme active' : 'Dark theme active'}
          >
            <span className="theme-switch-track" aria-hidden="true">
              <span className="theme-switch-thumb" />
            </span>
            <span>{isLightTheme ? 'Light' : 'Dark'}</span>
          </button>
          {typeof onLogout === 'function' ? (
            <button className="topbar-logout-btn" type="button" onClick={onLogout}>
              <svg className="topbar-logout-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="topbar-logout-label">Logout {roleLabel ? `(${roleLabel})` : ''}</span>
            </button>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}
