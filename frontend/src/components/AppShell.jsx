import { useEffect, useMemo, useRef, useState } from 'react';
import logoImg from '../assets/biomics-logo.jpeg';
import { useThemeStore } from '../stores/themeStore';
import StudentChatAgent from './StudentChatAgent';

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
  onNavItemClick,
  refreshOnBrandIconClick = false
}) {
  const { theme, toggleTheme } = useThemeStore();
  const isLightTheme = theme === 'light';
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );
  const [activeNavId, setActiveNavId] = useState(navItems[0]?.id || '');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBrandRefreshing, setIsBrandRefreshing] = useState(false);
  const [topbarHeight, setTopbarHeight] = useState(104);
  const topbarRef = useRef(null);
  const menuScrollLockRef = useRef(0);
  const pendingNavTargetRef = useRef(null);
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

  useEffect(() => {
    if (!hasSideNav) {
      setIsMenuOpen(false);
    }
  }, [hasSideNav]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const { body, documentElement } = document;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    menuScrollLockRef.current = scrollY;

    const previousBodyStyles = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      touchAction: body.style.touchAction,
      overscrollBehavior: body.style.overscrollBehavior
    };

    const previousHtmlStyles = {
      overflow: documentElement.style.overflow,
      overscrollBehavior: documentElement.style.overscrollBehavior
    };

    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.touchAction = 'none';
    body.style.overscrollBehavior = 'none';
    documentElement.style.overflow = 'hidden';
    documentElement.style.overscrollBehavior = 'none';

    return () => {
      body.style.overflow = previousBodyStyles.overflow;
      body.style.position = previousBodyStyles.position;
      body.style.top = previousBodyStyles.top;
      body.style.left = previousBodyStyles.left;
      body.style.right = previousBodyStyles.right;
      body.style.width = previousBodyStyles.width;
      body.style.touchAction = previousBodyStyles.touchAction;
      body.style.overscrollBehavior = previousBodyStyles.overscrollBehavior;
      documentElement.style.overflow = previousHtmlStyles.overflow;
      documentElement.style.overscrollBehavior = previousHtmlStyles.overscrollBehavior;
      window.scrollTo(0, menuScrollLockRef.current);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMenuOpen]);

  function runNavigationTarget(id) {
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

  useEffect(() => {
    if (isMenuOpen) return;
    const pendingId = pendingNavTargetRef.current;
    if (!pendingId) return;
    pendingNavTargetRef.current = null;

    // Wait until layout/scroll lock cleanup is applied before scrolling to section.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        runNavigationTarget(pendingId);
      });
    });
  }, [isMenuOpen]);

  function handleNavClick(id) {
    if (!isNavControlled) {
      setActiveNavId(id);
    }

    if (isMenuOpen) {
      pendingNavTargetRef.current = id;
      setIsMenuOpen(false);
      return;
    }

    runNavigationTarget(id);

  }

  function renderNavLinks(className = 'hub-side-list') {
    function getNavTone(item) {
      const key = `${String(item?.id || '')} ${String(item?.label || '')}`.toLowerCase();
      if (/dashboard|home|overview/.test(key)) return 'home';
      if (/video|content|library|lecture|module/.test(key)) return 'content';
      if (/quiz|exam|mock/.test(key)) return 'assessment';
      if (/chat|community/.test(key)) return 'community';
      if (/price|revenue|payment|voucher/.test(key)) return 'commerce';
      if (/profile|setting|account/.test(key)) return 'profile';
      if (/audit|recovery|admin/.test(key)) return 'security';
      return 'default';
    }

    return (
      <nav className={className} aria-label={`${navTitle} sections`}>
        {safeNavItems.map((item, index) => {
          const tone = getNavTone(item);
          return (
          <button
            key={item.id}
            type="button"
            className={`hub-side-link tone-${tone}${currentActiveNavId === item.id ? ' active' : ''}`}
            onClick={() => handleNavClick(item.id)}
            style={{ '--menu-index': index }}
          >
            <span className="hub-side-link-icon" aria-hidden="true">{item.icon || '•'}</span>
            <span className="hub-side-link-label">{item.label}</span>
          </button>
          );
        })}
      </nav>
    );
  }

  function handleBrandIconClick() {
    if (!refreshOnBrandIconClick) return;
    if (isBrandRefreshing) return;
    setIsBrandRefreshing(true);
    window.setTimeout(() => {
      window.location.reload();
    }, 560);
  }

  const shellPad = viewportWidth <= 375 ? 8 : viewportWidth <= 720 ? 12 : 24;
  const topbarTop = viewportWidth <= 375 ? 4 : viewportWidth <= 720 ? 6 : 8;
  const layoutTopGap = viewportWidth <= 375 ? 18 : viewportWidth <= 720 ? 16 : 10;
  const layoutTopPadding = topbarTop + topbarHeight + layoutTopGap;
  const sidePanelTop = Math.max(8, shellPad);
  const sidePanelHeight = `calc(100dvh - ${sidePanelTop + shellPad}px)`;

  useEffect(() => {
    const topbarClearance = Math.max(64, topbarTop + topbarHeight + 8);
    document.documentElement.style.setProperty('--app-shell-topbar-clearance', `${topbarClearance}px`);
    return () => {
      document.documentElement.style.removeProperty('--app-shell-topbar-clearance');
    };
  }, [topbarTop, topbarHeight]);

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
        className={`topbar${isMenuOpen ? ' topbar-dimmed' : ''}`}
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
            {hasSideNav ? (
              <button
                type="button"
                className={`hub-menu-trigger${isMenuOpen ? ' is-open' : ''}`}
                aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={isMenuOpen}
                onClick={() => setIsMenuOpen((current) => !current)}
              >
                <span className="hub-menu-trigger-glow" aria-hidden="true" />
                <span className="hub-menu-trigger-bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="hub-menu-trigger-label">Menu</span>
              </button>
            ) : null}
            <button
              type="button"
              className={`topbar-logo-btn${refreshOnBrandIconClick ? ' is-refresh-enabled' : ''}${isBrandRefreshing ? ' is-refreshing' : ''}`}
              onClick={handleBrandIconClick}
              aria-label={refreshOnBrandIconClick ? 'Refresh dashboard' : 'Biomics Hub logo'}
              title={refreshOnBrandIconClick ? 'Refresh dashboard' : 'Biomics Hub'}
            >
              <img src={logoImg} alt="Biomics Hub logo" className="topbar-logo" />
            </button>
            <div className="topbar-brand-text">
              <span className="topbar-site-name">Biomics Hub</span>
              <h1 className="topbar-title">{title}</h1>
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
      </header>

      {hasSideNav ? (
        <>
          <button
            type="button"
            className={`hub-side-overlay${isMenuOpen ? ' visible' : ''}`}
            aria-label="Close navigation menu"
            onClick={() => setIsMenuOpen(false)}
          />
          <aside
            className={`hub-side-panel${isMenuOpen ? ' open' : ''}`}
            aria-label={navTitle}
            style={{
              top: `${sidePanelTop}px`,
              left: `${shellPad}px`,
              height: sidePanelHeight
            }}
          >
            <div className="hub-side-head">
              <p>
                <span className="hub-side-head-kicker">Navigation</span>
                <span className="hub-side-head-title">{navTitle}</span>
              </p>
              <button
                type="button"
                className="hub-side-close"
                onClick={() => setIsMenuOpen(false)}
                aria-label="Close menu"
              >
                ×
              </button>
            </div>
            {renderNavLinks('hub-side-list')}
          </aside>
        </>
      ) : null}

      <div className={`app-shell${hasSideNav ? ' app-shell--with-nav' : ''}`}>
        <div className="app-shell-layout" style={{ paddingTop: `${layoutTopPadding}px` }}>
          <main className="app-main-content">{children}</main>
        </div>
      </div>
      {roleLabel === 'Admin' ? <StudentChatAgent hideAnnouncementFab mode="admin" /> : null}
    </>
  );
}
