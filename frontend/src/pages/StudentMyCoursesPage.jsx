import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { fetchStudentCourseCatalog, fetchStudentCourseVideoProgress, fetchTestSeriesCatalogStudent, resolveApiAssetUrl } from '../api';

const COURSE_META = {
  'NEET': { displayName: 'NEET', icon: '🧬', tone: 'tone-neet', blurb: 'Premium medical entrance preparation with live access and locked bundle unlocks.' },
  'GAT-B': { displayName: 'GAT-B', icon: '🧪', tone: 'tone-gat-b', blurb: 'Biotech-focused preparation with structured premium bundle access.' },
  'GATE': { displayName: 'GATE EXAM', icon: '💻', tone: 'tone-gate', blurb: 'Graduate aptitude preparation with premium modules and revision support.' },
  'CSIR-NET Life Science': { displayName: 'CSIR NET LIFESCIENCE', icon: '🔬', tone: 'tone-csir-net-life-science', blurb: 'Recorded and live life science learning with ongoing premium access.' },
  'IIT-JAM': { displayName: 'IIT-JAM', icon: '⚗️', tone: 'tone-iit-jam', blurb: 'Targeted JAM preparation with premium study bundles and guided practice.' }
};

function buildMenuNav(navigate) {
  return [
    { id: 'route-student-courses', label: 'Courses', icon: '📚' },
    { id: 'route-student-my-courses', label: 'My Courses', icon: '🎓' },
    { id: 'route-student-course-cart', label: 'Checkout Cart', icon: '🛒' }
  ];
}

function formatAccessLabel(item) {
  if (item.isEnrolledCourse && item.unlocked) return 'Enrolled + Purchased';
  if (item.isEnrolledCourse) return 'Enrolled Course';
  return 'Purchased Course';
}

function getCourseProgressPercent(courseName, progressByCourse) {
  const progress = progressByCourse?.[courseName];
  if (!progress) return 0;
  return Math.max(0, Math.min(100, Number(progress.completionPercent || 0)));
}

function formatPurchasedModuleLabel(item) {
  const purchasedCount = Math.max(0, Number(item?.purchasedModuleCount || 0));
  if (item?.hasBundlePurchase) return 'Full bundle purchased';
  if (purchasedCount <= 0) return 'No module purchase yet';
  return `${purchasedCount} module${purchasedCount === 1 ? '' : 's'} purchased`;
}

export default function StudentMyCoursesPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [progressByCourse, setProgressByCourse] = useState({});
  const [testSeriesCourses, setTestSeriesCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchStudentCourseCatalog(), fetchStudentCourseVideoProgress(), fetchTestSeriesCatalogStudent()])
      .then(([catalogResponse, progressResponse, testSeriesResponse]) => {
        if (cancelled) return;
        setCourses(Array.isArray(catalogResponse?.courses) ? catalogResponse.courses : []);
        setProgressByCourse(progressResponse?.progressByCourse || {});
        setTestSeriesCourses(Array.isArray(testSeriesResponse?.courses) ? testSeriesResponse.courses : []);
        setLoadError('');
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error.message || 'Failed to load your courses.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const myCourses = useMemo(
    () => courses.filter((course) => course.unlocked || course.isEnrolledCourse),
    [courses]
  );
  const expiredCoursePlans = useMemo(
    () => courses.filter((course) => course.expiredMembership && !course.unlocked),
    [courses]
  );
  const enrolledCount = myCourses.filter((course) => course.isEnrolledCourse).length;
  const premiumCount = myCourses.filter((course) => course.unlocked).length;
  const totalModules = myCourses.reduce((sum, course) => sum + Number(course.moduleCount || 0), 0);
  const purchasedTestSeries = useMemo(
    () => testSeriesCourses.filter((courseEntry) => courseEntry?.access?.hasTopicTest || courseEntry?.access?.hasFullMock),
    [testSeriesCourses]
  );
  const expiredTestSeries = useMemo(
    () => testSeriesCourses.filter(
      (courseEntry) => !(courseEntry?.access?.hasTopicTest || courseEntry?.access?.hasFullMock)
        && (courseEntry?.access?.topicExpired || courseEntry?.access?.fullMockExpired)
    ),
    [testSeriesCourses]
  );

  function handleNav(id) {
    if (id === 'route-student-courses') navigate('/student/courses');
    if (id === 'route-student-my-courses') navigate('/student/my-courses');
    if (id === 'route-student-course-cart') navigate('/student', { state: { openCart: true } });
  }

  return (
    <AppShell
      title="My Courses"
      subtitle="Purchased and active course access"
      roleLabel="Student"
      showThemeSwitch={false}
      navTitle="Course Menu"
      navItems={buildMenuNav(navigate)}
      activeNavItemId="route-student-my-courses"
      onNavItemClick={handleNav}
      actions={(
        <button type="button" className="secondary-btn" onClick={() => navigate('/student')}>
          ← Dashboard
        </button>
      )}
    >
      <main className="student-my-courses-page">
        {loadError ? <p className="banner error">{loadError}</p> : null}

        <section className="card student-my-courses-grid-wrap">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Active Access</p>
              <h3>My Courses ({myCourses.length})</h3>
            </div>
            {myCourses.length ? <p className="student-my-courses-note">Choose a course to jump straight into modules.</p> : null}
          </div>

          {isLoading ? <p className="empty-note">Loading your courses...</p> : null}
          {!isLoading && !myCourses.length ? <p className="empty-note">No purchased course found yet. Add a course to cart and complete payment first.</p> : null}

          <div className="student-my-courses-grid">
            {myCourses.map((item, index) => {
              const meta = COURSE_META[item.courseName] || {};
              const thumbnailUrl = resolveApiAssetUrl(item.thumbnailUrl || '');
              const progressPercent = getCourseProgressPercent(item.courseName, progressByCourse);
              const progressEntry = progressByCourse?.[item.courseName] || { completedVideos: 0, totalVideos: 0 };
              const progressLabel = Number(progressEntry.totalVideos || 0) > 0
                ? `${progressEntry.completedVideos}/${progressEntry.totalVideos} videos done`
                : 'No videos published yet';
              return (
                <article key={item.courseName} className="student-my-course-card" style={{ '--enter-index': index }}>
                  <div className="student-my-course-media-wrap">
                    {thumbnailUrl ? (
                      <img src={thumbnailUrl} alt={meta.displayName || item.courseName} className="student-my-course-thumb" />
                    ) : (
                      <div className={`student-my-course-thumb student-my-course-thumb-fallback ${meta.tone || ''}`}>
                        <span>{meta.icon || '📚'}</span>
                      </div>
                    )}
                    <div className="student-my-course-progress-pill">Active</div>
                  </div>
                  <div className="student-my-course-main">
                    <div className="student-my-course-copy">
                      <div className="student-my-course-meta-row">
                        <p className="eyebrow">{formatAccessLabel(item)}</p>
                        <span className="student-my-course-badge">{item.moduleCount || 0} modules</span>
                        <span className="student-my-course-badge">{formatPurchasedModuleLabel(item)}</span>
                      </div>
                      <h4>{meta.displayName || item.courseName}</h4>
                      <p>{meta.blurb || 'Premium course access is active for this learning track.'}</p>
                    </div>
                    <div className="student-my-course-inline-stats">
                      <span>{progressLabel}</span>
                      <span>{item.unlocked ? 'Premium Unlocked' : 'Starter Access'}</span>
                      <span>{item.isEnrolledCourse ? 'Primary Track' : 'Purchased Track'}</span>
                    </div>
                  </div>
                  <div className="student-my-course-actions">
                    <div className="student-my-course-progress-ring" style={{ '--progress': `${progressPercent}%` }} role="img" aria-label={`${progressPercent}% course readiness`}>
                      <div className="student-my-course-progress-ring-inner">
                        <strong>{progressPercent}%</strong>
                        <span>Progress</span>
                      </div>
                    </div>
                    <div className="student-my-course-footnote">
                      <strong>{item.unlocked ? 'Premium unlocked' : 'Starter access'}</strong>
                      <span>{item.isEnrolledCourse ? 'Matches your enrolled course' : 'Unlocked from purchase history'}</span>
                    </div>
                    <button type="button" className="primary-btn" onClick={() => navigate(`/student/course/${encodeURIComponent(item.courseName)}/modules`)}>
                      Open Course
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="card student-my-courses-grid-wrap">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Renewals</p>
              <h3>Expired Course Plans ({expiredCoursePlans.length})</h3>
            </div>
          </div>
          {!isLoading && !expiredCoursePlans.length ? <p className="empty-note">No expired course plans.</p> : null}
          <div className="student-my-courses-grid">
            {expiredCoursePlans.map((item, index) => {
              const meta = COURSE_META[item.courseName] || {};
              const thumbnailUrl = resolveApiAssetUrl(item.thumbnailUrl || '');
              return (
                <article key={`expired-course-${item.courseName}`} className="student-my-course-card" style={{ '--enter-index': index }}>
                  <div className="student-my-course-media-wrap">
                    {thumbnailUrl ? <img src={thumbnailUrl} alt={meta.displayName || item.courseName} className="student-my-course-thumb" /> : (
                      <div className={`student-my-course-thumb student-my-course-thumb-fallback ${meta.tone || ''}`}>
                        <span>{meta.icon || '📚'}</span>
                      </div>
                    )}
                    <div className="student-my-course-progress-pill">Expired</div>
                  </div>
                  <div className="student-my-course-main">
                    <div className="student-my-course-copy">
                      <h4>{meta.displayName || item.courseName}</h4>
                      <p>Your course plan has expired. Renew to continue premium access.</p>
                    </div>
                  </div>
                  <div className="student-my-course-actions">
                    <button type="button" className="primary-btn" onClick={() => navigate('/student/courses')}>
                      Renew Course
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="card student-my-courses-grid-wrap">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Premium Add-ons</p>
              <h3>My Test Series ({purchasedTestSeries.length})</h3>
            </div>
            {purchasedTestSeries.length ? <p className="student-my-courses-note">Purchased test series plans now appear here by course.</p> : null}
          </div>

          {!isLoading && !purchasedTestSeries.length ? <p className="empty-note">No test series purchased yet.</p> : null}

          <div className="student-my-courses-grid">
            {purchasedTestSeries.map((item, index) => {
              const meta = COURSE_META[item.courseName] || {};
              const thumbnailUrl = resolveApiAssetUrl(item.thumbnailUrl || '');
              return (
                <article key={`ts-${item.courseName}`} className="student-my-course-card" style={{ '--enter-index': index }}>
                  <div className="student-my-course-media-wrap">
                    {thumbnailUrl ? (
                      <img src={thumbnailUrl} alt={meta.displayName || item.courseName} className="student-my-course-thumb" />
                    ) : (
                      <div className={`student-my-course-thumb student-my-course-thumb-fallback ${meta.tone || ''}`}>
                        <span>{meta.icon || '🧪'}</span>
                      </div>
                    )}
                    <div className="student-my-course-progress-pill">Test Series</div>
                  </div>
                  <div className="student-my-course-main">
                    <div className="student-my-course-copy">
                      <div className="student-my-course-meta-row">
                        <p className="eyebrow">Purchased Add-on</p>
                        <span className="student-my-course-badge">{item.access?.hasTopicTest && item.access?.hasFullMock ? 'Topic + Mock' : item.access?.hasTopicTest ? 'Topic Plan' : 'Mock Plan'}</span>
                      </div>
                      <h4>{meta.displayName || item.courseName}</h4>
                      <p>Premium test-series access is active for this course.</p>
                    </div>
                    <div className="student-my-course-inline-stats">
                      <span>{item.access?.hasTopicTest ? 'Topic Tests Unlocked' : 'Topic Tests Locked'}</span>
                      <span>{item.access?.hasFullMock ? 'Full Mocks Unlocked' : 'Full Mocks Locked'}</span>
                      <span>{item.isEnrolledCourse ? 'Primary Track' : 'Purchased Track'}</span>
                    </div>
                  </div>
                  <div className="student-my-course-actions">
                    <div className="student-my-course-footnote">
                      <strong>Ready for practice</strong>
                      <span>Start from module-wise flow and open topics in a dedicated page.</span>
                    </div>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => {
                        const targetCourse = encodeURIComponent(item.courseName || '');
                        if (item.access?.hasTopicTest) {
                          navigate(`/student/test-series/topic-tests/modules?course=${targetCourse}`);
                          return;
                        }
                        navigate(`/student/test-series?tab=mock&course=${targetCourse}`);
                      }}
                    >
                      Start Series
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="card student-my-courses-grid-wrap">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Renewals</p>
              <h3>Expired Test Series ({expiredTestSeries.length})</h3>
            </div>
          </div>
          {!isLoading && !expiredTestSeries.length ? <p className="empty-note">No expired test series plans.</p> : null}
          <div className="student-my-courses-grid">
            {expiredTestSeries.map((item, index) => {
              const meta = COURSE_META[item.courseName] || {};
              const thumbnailUrl = resolveApiAssetUrl(item.thumbnailUrl || '');
              return (
                <article key={`expired-ts-${item.courseName}`} className="student-my-course-card" style={{ '--enter-index': index }}>
                  <div className="student-my-course-media-wrap">
                    {thumbnailUrl ? <img src={thumbnailUrl} alt={meta.displayName || item.courseName} className="student-my-course-thumb" /> : (
                      <div className={`student-my-course-thumb student-my-course-thumb-fallback ${meta.tone || ''}`}>
                        <span>{meta.icon || '🧪'}</span>
                      </div>
                    )}
                    <div className="student-my-course-progress-pill">Expired</div>
                  </div>
                  <div className="student-my-course-main">
                    <div className="student-my-course-copy">
                      <h4>{meta.displayName || item.courseName}</h4>
                      <p>Your test series validity has ended for this course. Renew to continue.</p>
                    </div>
                  </div>
                  <div className="student-my-course-actions">
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => navigate(`/student/test-series/purchase?plan=topic_test&course=${encodeURIComponent(item.courseName || '')}`)}
                    >
                      Renew Plan
                    </button>
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