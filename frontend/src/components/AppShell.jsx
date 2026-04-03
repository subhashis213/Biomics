import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );
  const [activeNavId, setActiveNavId] = useState(navItems[0]?.id || '');
  const [topbarHeight, setTopbarHeight] = useState(104);
  const topbarRef = useRef(null);
  const hasSideNav = navItems.length > 0;
  const isNavControlled = typeof activeNavItemId === 'string' && activeNavItemId.length > 0;
  const currentActiveNavId = isNavControlled ? activeNavItemId : activeNavId;

  const safeNavItems = useMemo(() => navItems.filter((item) => item?.id && item?.label), [navItems]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
        const headerOffset = topbarTop + topbarHeight + 12;
        const targetTop = Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerOffset);
        window.scrollTo({ top: targetTop, behavior: 'smooth' });
      } else {
        return;
      }
    }

  }

  function renderNavLinks(className = 'app-side-nav-list') {
    return (
      <nav className={className} aria-label={`${navTitle} sections`}>
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
    );
  }

  const shellPad = viewportWidth <= 375 ? 8 : viewportWidth <= 720 ? 12 : 24;
  const topbarTop = viewportWidth <= 375 ? 4 : viewportWidth <= 720 ? 6 : 8;
  const layoutTopGap = viewportWidth <= 375 ? 18 : viewportWidth <= 720 ? 16 : 10;
  const layoutTopPadding = topbarTop + topbarHeight + layoutTopGap;

  useEffect(() => {
    const el = topbarRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setTopbarHeight(Math.round(entry.contentRect.height));
    });
    observer.observe(el);
    setTopbarHeight(Math.round(el.getBoundingClientRect().height));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <header
        ref={topbarRef}
        className="topbar"
        style={{
          position: 'fixed',
          top: `${topbarTop}px`,
          left: `${shellPad}px`,
          right: `${shellPad}px`,
          zIndex: 3000,
          width: 'auto'
        }}
      >
        <div className="topbar-main">
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
        </div>
        {hasSideNav ? (
          <div className="topbar-nav-row">
            <p className="topbar-nav-label">{navTitle}</p>
            {renderNavLinks('topbar-inline-nav')}
          </div>
        ) : null}
      </header>

      <div className={`app-shell${hasSideNav ? ' app-shell--with-nav' : ''}`}>
        <div className="app-shell-layout" style={{ paddingTop: `${layoutTopPadding}px` }}>
          <main className="app-main-content">{children}</main>
        </div>
      </div>
    </>
  );
}
