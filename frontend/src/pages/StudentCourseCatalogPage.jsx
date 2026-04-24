import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { fetchStudentCourseCatalog, resolveApiAssetUrl } from '../api';
import { useSessionStore } from '../stores/sessionStore';

const COURSE_META = {
  'NEET': {
    displayName: 'NEET',
    icon: '🧬',
    tags: ['NEW', 'LIVE CLASS', 'FREE CONTENT'],
    blurb: 'Premium medical entrance preparation with locked modules, live learning, and quizzes.'
  },
  'GAT-B': {
    displayName: 'GAT-B',
    icon: '🧪',
    tags: ['NEW', 'BIOTECH', 'VIDEOS'],
    blurb: 'Biotech-focused course bundles with modular access and structured revision.'
  },
  'GATE': {
    displayName: 'GATE EXAM',
    icon: '💻',
    tags: ['NEW', 'MULTIPLE VALIDITY', 'LIVE CLASS'],
    blurb: 'Graduate aptitude preparation with premium bundles and practice content.'
  },
  'CSIR-NET Life Science': {
    displayName: 'CSIR NET LIFESCIENCE',
    icon: '🔬',
    tags: ['NEW', 'FREE CONTENT', 'VIDEOS'],
    blurb: 'Recorded and live life science preparation with course-wise premium access.'
  },
  'IIT-JAM': {
    displayName: 'IIT-JAM',
    icon: '⚗️',
    tags: ['NEW', 'FREE CONTENT'],
    blurb: 'Targeted post-graduate science preparation with guided bundles and revision support.'
  }
};

const CHECKOUT_CART_STORAGE_PREFIX = 'biomics:student-cart:';

function getCourseCartStorageKey(username) {
  return `${CHECKOUT_CART_STORAGE_PREFIX}${String(username || '').trim().toLowerCase()}`;
}

function buildMenuNav(cartCount) {
  return [
    { id: 'route-student-courses', label: 'Courses', icon: '📚' },
    { id: 'route-student-my-courses', label: 'My Courses', icon: '🎓' },
    { id: 'route-student-course-cart', label: `Checkout Cart${cartCount ? ` (${cartCount})` : ''}`, icon: '🛒' }
  ];
}

export default function StudentCourseCatalogPage() {
  const navigate = useNavigate();
  const { session } = useSessionStore();
  const [courseCatalog, setCourseCatalog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [cartCount, setCartCount] = useState(0);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      try {
        const response = await fetchStudentCourseCatalog();
        if (!cancelled) {
          setCourseCatalog(Array.isArray(response?.courses) ? response.courses : []);
          setLoadError('');
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error.message || 'Failed to load course catalog.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleCourses = courseCatalog;

  useEffect(() => {
    const storageKey = getCourseCartStorageKey(session?.username);
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const safeItems = Array.isArray(parsed) ? parsed : [];
      setCartCount(safeItems.length);
    } catch {
      setCartCount(0);
    }
  }, [session?.username]);

  function handleNav(id) {
    if (id === 'route-student-courses') navigate('/student/courses');
    if (id === 'route-student-my-courses') navigate('/student/my-courses');
    if (id === 'route-student-course-cart') navigate('/student', { state: { openCart: true } });
  }

  return (
    <AppShell
      title="Course Catalog"
      subtitle="Browse premium courses in a separate page"
      roleLabel="Student"
      showThemeSwitch={false}
      navTitle="Course Menu"
      navItems={buildMenuNav(cartCount)}
      activeNavItemId="route-student-courses"
      onNavItemClick={handleNav}
      actions={(
        <div className="student-course-catalog-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate('/student/my-courses')}>
            My Courses
          </button>
          <button type="button" className="secondary-btn" onClick={() => navigate('/student', { state: { openCart: true } })}>
            🛒 Cart{cartCount ? ` (${cartCount})` : ''}
          </button>
          <button type="button" className="secondary-btn" onClick={() => navigate('/student')}>
            ← Back
          </button>
        </div>
      )}
    >
      <main className="student-course-catalog-page">
        <section className="student-course-catalog-hero card">
          <div className="student-course-catalog-hero-top">
            <p className="eyebrow">Courses</p>
            <h2>Choose your learning track</h2>
            <p className="subtitle">Explore all admin-created courses, then open a course to view premium batches and offers.</p>
          </div>
          <div className="student-course-catalog-summary">
            <span>Courses ({visibleCourses.length})</span>
            <span>Premium batches available</span>
          </div>
        </section>

        <section className="student-course-catalog-list card">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Courses</p>
              <h3>Courses ({visibleCourses.length})</h3>
            </div>
          </div>

          {loadError ? <p className="banner error">{loadError}</p> : null}
          {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

          <div className="student-course-catalog-stack">
            {isLoading ? <p className="empty-note">Loading courses...</p> : null}
            {visibleCourses.map((item) => {
              const meta = COURSE_META[item.courseName] || {};
              const displayName = String(item.displayName || meta.displayName || item.courseName).trim();
              const courseIcon = String(item.icon || meta.icon || '📚').trim() || '📚';
              const courseBlurb = String(item.description || meta.blurb || 'Premium course catalog entry.').trim();
              const thumbnailUrl = resolveApiAssetUrl(item.thumbnailUrl || '');

              return (
                <article
                  key={item.courseName}
                  className="student-course-catalog-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/student/course/${encodeURIComponent(item.courseName)}/batches`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/student/course/${encodeURIComponent(item.courseName)}/batches`);
                    }
                  }}
                >
                  {thumbnailUrl ? (
                    <img className="student-course-catalog-thumb-image" src={thumbnailUrl} alt={displayName} />
                  ) : (
                    <div className={`student-course-catalog-thumb tone-${item.courseName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                      <span>{courseIcon}</span>
                      <strong>{displayName}</strong>
                    </div>
                  )}
                  <div className="student-course-catalog-copy">
                    <div className="student-course-catalog-tags">
                      {(meta.tags || ['NEW']).map((tag) => <span key={`${item.courseName}-${tag}`}>{tag}</span>)}
                      {item.unlocked ? <span>UNLOCKED</span> : null}
                    </div>
                    <h4>{displayName}</h4>
                    <p>{courseBlurb}</p>
                    {Array.isArray(item.batches) && item.batches.length ? (
                      <div className="student-course-catalog-tags">
                        {item.batches.slice(0, 4).map((batch) => (
                          <span key={`${item.courseName}-batch-${batch.name}`}>{batch.name}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="student-course-catalog-cta-row">
                      <button type="button" className="primary-btn" onClick={(event) => { event.stopPropagation(); navigate(`/student/course/${encodeURIComponent(item.courseName)}/batches`); }}>
                        View Batches
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </AppShell>
  );
}