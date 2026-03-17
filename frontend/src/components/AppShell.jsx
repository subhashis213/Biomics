import { useThemeStore } from '../stores/themeStore';

export default function AppShell({ title, subtitle, roleLabel, onLogout, children, actions }) {
  const { theme, toggleTheme } = useThemeStore();
  const isLightTheme = theme === 'light';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Biomics Hub</p>
          <h1>{title}</h1>
          {subtitle ? <p className="subtitle">{subtitle}</p> : null}
        </div>
        <div className="topbar-actions">
          {actions}
          <button
            type="button"
            className="theme-switch"
            onClick={toggleTheme}
            aria-label={`Switch to ${isLightTheme ? 'Forest Dark' : 'Sage Light'} theme`}
            aria-pressed={isLightTheme}
            title={isLightTheme ? 'Sage Light active' : 'Forest Dark active'}
          >
            <span className="theme-switch-track" aria-hidden="true">
              <span className="theme-switch-thumb" />
            </span>
            <span>{isLightTheme ? 'Sage Light' : 'Forest Dark'}</span>
          </button>
          <button className="secondary-btn" type="button" onClick={onLogout}>
            Logout {roleLabel ? `(${roleLabel})` : ''}
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
