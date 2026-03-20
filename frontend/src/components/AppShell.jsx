import logoImg from '../assets/biomics-logo.jpeg';
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
              <span className="topbar-logout-icon">⏻</span>
              <span className="topbar-logout-label">Logout {roleLabel ? `(${roleLabel})` : ''}</span>
            </button>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}
