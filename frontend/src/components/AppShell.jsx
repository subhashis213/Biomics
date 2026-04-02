import { useEffect, useMemo, useState } from 'react';
import logoImg from '../assets/biomics-logo.jpeg';
import { useThemeStore } from '../stores/themeStore';

export default function AppShell({
  title,
  subtitle,
  roleLabel,
  onLogout,
  children,
  actions,
  navItems = [],
  navTitle = 'Menu',
  showThemeSwitch = true,
  activeNavItemId,
  onNavItemClick
}) {
  const { theme, toggleTheme } = useThemeStore();
  const isLightTheme = theme === 'light';
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [activeNavId, setActiveNavId] = useState(navItems[0]?.id || '');
  const hasSideNav = navItems.length > 0;
  const isNavControlled = typeof activeNavItemId === 'string' && activeNavItemId.length > 0;
  const currentActiveNavId = isNavControlled ? activeNavItemId : activeNavId;

  const safeNavItems = useMemo(() => navItems.filter((item) => item?.id && item?.label), [navItems]);

  useEffect(() => {
    if (!isMobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileNavOpen]);

  useEffect(() => {
    if (isNavControlled) return;
    setActiveNavId(safeNavItems[0]?.id || '');
  }, [safeNavItems, isNavControlled]);

  function handleNavClick(id) {
    if (!isNavControlled) {
      setActiveNavId(id);
    }

    if (typeof onNavItemClick === 'function') {
      onNavItemClick(id);
    } else {
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    setIsMobileNavOpen(false);
  }

  function renderNavLinks() {
    return (
      <>
        <p className="app-side-nav-title">{navTitle}</p>
        <nav className="app-side-nav-list" aria-label={`${navTitle} sections`}>
          {safeNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`app-side-nav-link${currentActiveNavId === item.id ? ' active' : ''}`}
              onClick={() => handleNavClick(item.id)}
            >
              <span className="app-side-nav-link-icon" aria-hidden="true">{item.icon || '•'}</span>
              <span className="app-side-nav-link-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </>
    );
  }

  return (
    <div className={`app-shell${hasSideNav ? ' app-shell--with-nav' : ''}`}>
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
          {hasSideNav ? (
            <button
              type="button"
              className="topbar-menu-btn"
              onClick={() => setIsMobileNavOpen(true)}
              aria-label="Open section menu"
              title="Open section menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
              <span>Menu</span>
            </button>
          ) : null}
          {actions}
          {showThemeSwitch ? (
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
          ) : null}
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

      <div className="app-shell-layout">
        {hasSideNav ? (
          <aside className="app-side-nav" aria-label={`${navTitle} menu`}>
            {renderNavLinks()}
          </aside>
        ) : null}
        <main className="app-main-content">{children}</main>
      </div>

      {hasSideNav ? (
        <>
          <button
            type="button"
            className={`app-side-nav-backdrop${isMobileNavOpen ? ' visible' : ''}`}
            onClick={() => setIsMobileNavOpen(false)}
            aria-label="Close section menu"
          />
          <aside className={`app-side-nav-mobile${isMobileNavOpen ? ' open' : ''}`} aria-label={`${navTitle} menu mobile`}>
            <div className="app-side-nav-mobile-header">
              <p>{navTitle}</p>
              <button type="button" onClick={() => setIsMobileNavOpen(false)} aria-label="Close section menu">
                ✕
              </button>
            </div>
            {renderNavLinks()}
          </aside>
        </>
      ) : null}
    </div>
  );
}
