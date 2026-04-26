import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchStudentLivekitWorkspace, openStudentLivekitWorkspaceStream } from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import StudentRoom from '../components/StudentRoom';
import './StudentLiveClassesPage.css';

const DEFAULT_CALENDAR_START_HOUR = 6;
const DEFAULT_CALENDAR_END_HOUR = 22;
const CALENDAR_HOUR_ROW_HEIGHT = 64;
const MIN_CALENDAR_EVENT_HEIGHT = 24;
const MOBILE_CALENDAR_BREAKPOINT = 768;
const WORKSPACE_REFRESH_INTERVAL_MS = 15000;
const DEFAULT_LIVE_CLASS_COURSE_FILTER = 'CSIR-NET Life Science';

function normalizeCourseName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function formatDateKey(value) {
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDays(value, amount) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(value) {
  const parsed = new Date(value);
  const day = parsed.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  parsed.setHours(0, 0, 0, 0);
  parsed.setDate(parsed.getDate() + diff);
  return parsed;
}

function buildWeekDays(anchorDate) {
  const weekStart = startOfWeek(anchorDate);
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function buildMonthGrid(anchorDate) {
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date,
      key: formatDateKey(date),
      inMonth: date.getMonth() === anchorDate.getMonth()
    };
  });
}

function formatDateTime(value) {
  if (!value) return 'Not scheduled';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not scheduled';
  return parsed.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatAgendaDay(value) {
  if (!value) return 'No date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No date';
  return parsed.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });
}

function formatAgendaDayNumber(value) {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleDateString([], { day: '2-digit' });
}

function formatAgendaMonth(value) {
  if (!value) return 'Month';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Month';
  return parsed.toLocaleDateString([], { month: 'short' });
}

function formatTimeLabel(value) {
  if (!value) return 'Time unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Time unavailable';
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatWeekdayShort(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleDateString([], { weekday: 'short' });
}

function formatMonthYear(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Calendar';
  return parsed.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

function formatWeekRange(days = []) {
  if (!days.length) return 'This week';
  const first = days[0];
  const last = days[days.length - 1];
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();

  if (sameMonth) {
    return `${first.toLocaleDateString([], { month: 'long' })} ${first.getDate()}-${last.getDate()}, ${last.getFullYear()}`;
  }

  return `${first.toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${last.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function formatToolbarDay(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleDateString([], { weekday: 'short' });
}

function CalendarEventIcon({ kind }) {
  if (kind === 'live-class') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 7.5v9l7-4.5-7-4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="3.75" y="4.75" width="16.5" height="14.5" rx="3.25" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.75" y="5.75" width="14.5" height="12.5" rx="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 3.75v4M16 3.75v4M4.75 10.25h14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9.5 13.25h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function formatTimeRange(startsAt, endsAt) {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (!start || Number.isNaN(start.getTime())) return 'Time unavailable';
  const startLabel = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (!end || Number.isNaN(end.getTime())) return startLabel;
  return `${startLabel} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatCompactTimeRange(startsAt, endsAt) {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (!start || Number.isNaN(start.getTime())) return 'Time unavailable';

  const formatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  const startLabel = start.toLocaleTimeString([], formatOptions);
  if (!end || Number.isNaN(end.getTime())) return startLabel;
  return `${startLabel}-${end.toLocaleTimeString([], formatOptions)}`;
}

function buildHourLabels(startHour, endHour) {
  return Array.from({ length: Math.max(1, endHour - startHour + 1) }, (_, index) => startHour + index);
}

function formatHourLabel(hour) {
  const normalized = Number(hour);
  const suffix = normalized >= 12 ? 'PM' : 'AM';
  const displayHour = normalized % 12 || 12;
  return `${displayHour} ${suffix}`;
}

function getEventLayout(entry, startHour) {
  const start = new Date(entry?.startsAt || '');
  const endRaw = entry?.endsAt ? new Date(entry.endsAt) : null;
  const fallbackEnd = new Date(start.getTime() + 60 * 60 * 1000);
  const end = endRaw && !Number.isNaN(endRaw.getTime()) ? endRaw : fallbackEnd;

  const startMinutes = Math.max(0, ((start.getHours() + (start.getMinutes() / 60)) - startHour) * 60);
  const currentHourIndex = Math.floor(startMinutes / 60);
  const rawDurationMinutes = (end.getTime() - start.getTime()) / 60000;
  const durationMinutes = Math.max(1, Number.isFinite(rawDurationMinutes) ? rawDurationMinutes : 60);
  const actualHeight = (durationMinutes / 60) * CALENDAR_HOUR_ROW_HEIGHT;
  const sameHourEvent = start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
    && start.getDate() === end.getDate()
    && start.getHours() === end.getHours();
  let top = (startMinutes / 60) * CALENDAR_HOUR_ROW_HEIGHT;
  const height = Math.max(MIN_CALENDAR_EVENT_HEIGHT, actualHeight);

  if (sameHourEvent) {
    const nextHourBoundary = (currentHourIndex + 1) * CALENDAR_HOUR_ROW_HEIGHT;
    if (top + height > nextHourBoundary - 2) {
      top = Math.max(currentHourIndex * CALENDAR_HOUR_ROW_HEIGHT + 2, nextHourBoundary - height - 2);
    }
  }

  return {
    top,
    height,
    durationMinutes
  };
}

function getCalendarTimeBounds(entries = []) {
  if (!Array.isArray(entries) || !entries.length) {
    return {
      startHour: DEFAULT_CALENDAR_START_HOUR,
      endHour: DEFAULT_CALENDAR_END_HOUR
    };
  }

  let minHour = 24;
  let maxHour = 0;

  entries.forEach((entry) => {
    const start = new Date(entry?.startsAt || '');
    const end = entry?.endsAt ? new Date(entry.endsAt) : new Date(start.getTime() + 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    minHour = Math.min(minHour, start.getHours());
    maxHour = Math.max(maxHour, end.getHours() + (end.getMinutes() > 0 ? 1 : 0));
  });

  const startHour = Math.max(0, minHour === 24 ? DEFAULT_CALENDAR_START_HOUR : minHour);
  const endHour = Math.min(24, Math.max(startHour + 4, maxHour || DEFAULT_CALENDAR_END_HOUR));

  return { startHour, endHour };
}

export default function StudentLiveClassesPage() {
  const navigate = useNavigate();
  const { classId = '' } = useParams();
  const [workspace, setWorkspace] = useState({ access: null, activeClass: null, upcomingClasses: [], calendar: [] });
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [selectedCourseFilter, setSelectedCourseFilter] = useState(DEFAULT_LIVE_CLASS_COURSE_FILTER);
  const [selectedDateKey, setSelectedDateKey] = useState('');
  const [isMiniCalendarCollapsed, setIsMiniCalendarCollapsed] = useState(false);
  const loadRequestRef = useRef(0);

  function isMobileCalendarViewport() {
    return typeof window !== 'undefined' && window.innerWidth <= MOBILE_CALENDAR_BREAKPOINT;
  }

  function handleSelectDateKey(dateKey) {
    setSelectedDateKey(dateKey);
    if (isMobileCalendarViewport()) {
      setIsMiniCalendarCollapsed(true);
    }
  }

  function scrollToSection(sectionId) {
    if (typeof document === 'undefined') return;
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadWorkspace(options = {}) {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    const showLoading = options.showLoading !== false;

    if (showLoading) setLoading(true);
    try {
      const response = await fetchStudentLivekitWorkspace();
      if (loadRequestRef.current !== requestId) return;
      setWorkspace({
        access: response?.access || null,
        activeClass: response?.activeClass || null,
        upcomingClasses: Array.isArray(response?.upcomingClasses) ? response.upcomingClasses : [],
        calendar: Array.isArray(response?.calendar) ? response.calendar : []
      });
    } catch (error) {
      if (loadRequestRef.current !== requestId) return;
      setBanner({ type: 'error', text: error.message || 'Failed to load live class workspace.' });
    } finally {
      if (loadRequestRef.current === requestId && showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkspace();
  }, []);

  useEffect(() => {
    const refreshWorkspace = () => {
      loadWorkspace({ showLoading: false });
    };

    const intervalId = window.setInterval(refreshWorkspace, WORKSPACE_REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshWorkspace();
    };
    const handleFocus = () => {
      refreshWorkspace();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    let eventSource;

    try {
      eventSource = openStudentLivekitWorkspaceStream();
    } catch {
      return undefined;
    }

    const handleWorkspaceUpdate = () => {
      loadWorkspace({ showLoading: false });
    };

    eventSource.addEventListener('workspace-updated', handleWorkspaceUpdate);

    return () => {
      eventSource.removeEventListener('workspace-updated', handleWorkspaceUpdate);
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_CALENDAR_BREAKPOINT}px)`);
    const syncMiniCalendarState = (event) => {
      setIsMiniCalendarCollapsed(Boolean(event.matches));
    };

    syncMiniCalendarState(mediaQuery);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncMiniCalendarState);
      return () => mediaQuery.removeEventListener('change', syncMiniCalendarState);
    }

    mediaQuery.addListener(syncMiniCalendarState);
    return () => mediaQuery.removeListener(syncMiniCalendarState);
  }, []);

  const selectedClass = useMemo(() => {
    if (classId) {
      return [workspace.activeClass, ...workspace.upcomingClasses].find((item) => item?._id === classId) || workspace.activeClass || null;
    }
    return workspace.activeClass || null;
  }, [classId, workspace.activeClass, workspace.upcomingClasses]);

  const access = workspace.access || {};
  const hasCourseAccess = Boolean(access.hasCourseAccess);
  const isLiveFocusMode = Boolean(classId && selectedClass?.status === 'live');
  const rawCalendarEntries = Array.isArray(workspace.calendar) ? workspace.calendar : [];
  const normalizedSelectedCourseFilter = normalizeCourseName(selectedCourseFilter).toLowerCase();
  const showAllCourses = normalizedSelectedCourseFilter === 'all';
  const filteredActiveClass = useMemo(() => {
    const active = workspace.activeClass;
    if (!active) return null;
    if (showAllCourses) return active;
    return normalizeCourseName(active.course).toLowerCase() === normalizedSelectedCourseFilter ? active : null;
  }, [workspace.activeClass, showAllCourses, normalizedSelectedCourseFilter]);
  const filteredUpcomingClasses = useMemo(() => {
    if (showAllCourses) return Array.isArray(workspace.upcomingClasses) ? workspace.upcomingClasses : [];
    return (Array.isArray(workspace.upcomingClasses) ? workspace.upcomingClasses : []).filter(
      (entry) => normalizeCourseName(entry?.course).toLowerCase() === normalizedSelectedCourseFilter
    );
  }, [workspace.upcomingClasses, showAllCourses, normalizedSelectedCourseFilter]);
  const calendarEntries = useMemo(() => {
    if (showAllCourses) return rawCalendarEntries;
    return rawCalendarEntries.filter(
      (entry) => normalizeCourseName(entry?.course).toLowerCase() === normalizedSelectedCourseFilter
    );
  }, [rawCalendarEntries, showAllCourses, normalizedSelectedCourseFilter]);
  const courseFilterOptions = useMemo(() => {
    const courses = new Set([DEFAULT_LIVE_CLASS_COURSE_FILTER]);
    rawCalendarEntries.forEach((entry) => {
      const courseName = normalizeCourseName(entry?.course);
      if (courseName) courses.add(courseName);
    });
    const activeCourse = normalizeCourseName(workspace.activeClass?.course);
    if (activeCourse) courses.add(activeCourse);
    (Array.isArray(workspace.upcomingClasses) ? workspace.upcomingClasses : []).forEach((entry) => {
      const courseName = normalizeCourseName(entry?.course);
      if (courseName) courses.add(courseName);
    });
    return ['all', ...Array.from(courses).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))];
  }, [rawCalendarEntries, workspace.activeClass, workspace.upcomingClasses]);

  useEffect(() => {
    if (selectedDateKey) return;
    const nextRelevantDate = calendarEntries[0]?.startsAt
      || filteredActiveClass?.startedAt
      || filteredUpcomingClasses?.[0]?.scheduledAt
      || new Date();
    const nextKey = formatDateKey(nextRelevantDate);
    if (nextKey) setSelectedDateKey(nextKey);
  }, [calendarEntries, selectedDateKey, filteredActiveClass?.startedAt, filteredUpcomingClasses]);

  const selectedDate = useMemo(() => parseDateKey(selectedDateKey || formatDateKey(new Date())), [selectedDateKey]);
  const eventCountByDate = useMemo(() => {
    const counts = new Map();
    calendarEntries.forEach((entry) => {
      const key = formatDateKey(entry?.startsAt);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [calendarEntries]);
  const futureCalendarItemCount = useMemo(
    () => calendarEntries.filter((entry) => {
      const startsAt = new Date(entry?.startsAt || '').getTime();
      return Number.isFinite(startsAt) && startsAt >= Date.now();
    }).length,
    [calendarEntries]
  );
  const selectedDayEntries = useMemo(
    () => calendarEntries.filter((entry) => formatDateKey(entry?.startsAt) === selectedDateKey),
    [calendarEntries, selectedDateKey]
  );
  const nextCalendarEntry = selectedDayEntries[0] || calendarEntries[0] || null;
  const weekDays = useMemo(() => buildWeekDays(selectedDate), [selectedDate]);
  const monthDays = useMemo(() => buildMonthGrid(selectedDate), [selectedDate]);
  const weekEntriesByDay = useMemo(() => {
    const allowedKeys = new Set(weekDays.map((day) => formatDateKey(day)));
    const map = new Map(weekDays.map((day) => [formatDateKey(day), []]));

    calendarEntries.forEach((entry) => {
      const key = formatDateKey(entry?.startsAt);
      if (!allowedKeys.has(key)) return;
      map.get(key).push(entry);
    });

    map.forEach((items, key) => {
      map.set(key, items.sort((left, right) => new Date(left?.startsAt || 0).getTime() - new Date(right?.startsAt || 0).getTime()));
    });

    return map;
  }, [calendarEntries, weekDays]);
  const weekEntries = useMemo(() => Array.from(weekEntriesByDay.values()).flat(), [weekEntriesByDay]);
  const { startHour, endHour } = useMemo(() => getCalendarTimeBounds(weekEntries), [weekEntries]);
  const hourLabels = useMemo(() => buildHourLabels(startHour, endHour), [startHour, endHour]);
  const calendarRowCount = Math.max(1, hourLabels.length - 1);

  if (classId) {
    return (
      <main className="livekit-student-direct-room-page livekit-student-page">
        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}
        {loading ? <p className="empty-note">Loading live class access...</p> : null}

        {selectedClass && selectedClass.status === 'live' ? (
          <StudentRoom
            classSession={selectedClass}
            autoEnterImmersive
            onSessionRemoved={(message) => {
              setBanner({ type: 'error', text: message || 'You were removed from the current live session by the admin.' });
              navigate('/student/live-classes', { replace: true });
              loadWorkspace();
            }}
            onLeave={() => {
              navigate('/student/live-classes', { replace: true });
              loadWorkspace({ showLoading: false });
            }}
          />
        ) : !loading ? (
          <section className="card livekit-empty-room-card livekit-direct-room-empty-state">
            <strong>Live class is not available right now</strong>
            <p>The room will open here automatically when the admin starts this live session.</p>
            <button type="button" className="secondary-btn" onClick={() => navigate('/student/live-classes', { replace: true })}>
              Back to live classes
            </button>
          </section>
        ) : null}
      </main>
    );
  }

  return (
    <AppShell
      title="Live Classes"
      subtitle="Course live classroom access with calendar visibility and manual join when your class is live"
      roleLabel="Student"
      showThemeSwitch
      navTitle="Live Classes"
      navItems={[
        { id: 'section-student-live-overview', label: 'Overview', icon: '🎥' },
        { id: 'section-student-live-room', label: 'Live Room', icon: '🟢' },
        { id: 'section-student-live-calendar', label: 'Calendar', icon: '🗓️' },
        { id: 'section-student-live-access', label: 'Access', icon: '⭐' }
      ]}
      actions={(
        <div className="livekit-student-topbar-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate('/student')}>← Back to Dashboard</button>
        </div>
      )}
    >
      <main className={`admin-workspace-page livekit-student-page${isLiveFocusMode ? ' focus-mode' : ''}`}>
        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}
        {loading ? <p className="empty-note">Loading live class access...</p> : null}

        {!isLiveFocusMode ? (
          <section id="section-student-live-overview" className="workspace-hero livekit-student-hero">
            <div className="livekit-student-hero-copy">
              <p className="eyebrow">Course Live Access</p>
              <h2>Enter a cleaner mobile classroom, join the live teacher room fast, and track every scheduled class without losing focus.</h2>
              <p className="subtitle">The live section is now built around quick entry, full-screen class viewing, and a predictable mobile flow for chat, schedules, and live-room access.</p>
              <div className="livekit-student-hero-actions">
                {filteredActiveClass ? (
                  <button type="button" className="primary-btn" onClick={() => navigate(`/student/live-classes/${encodeURIComponent(filteredActiveClass._id)}`)}>
                    Join Live Class
                  </button>
                ) : (
                  <button type="button" className="primary-btn" onClick={() => scrollToSection('section-student-live-calendar')}>
                    View Schedule
                  </button>
                )}
                <button type="button" className="secondary-btn" onClick={() => scrollToSection('section-student-live-room')}>
                  Open Live Room
                </button>
              </div>
              <div className="livekit-student-hero-highlights">
                <span className="livekit-student-hero-highlight">Mobile-first classroom</span>
                <span className="livekit-student-hero-highlight">Right-side class chat</span>
                <span className="livekit-student-hero-highlight">Full-screen live focus</span>
              </div>
            </div>
            <aside className="livekit-student-hero-spotlight">
              <span className="livekit-student-hero-spotlight-kicker">Next classroom moment</span>
              <strong>{filteredActiveClass?.title || nextCalendarEntry?.title || 'No live class scheduled for selected course'}</strong>
              <p>
                {filteredActiveClass
                  ? `${formatDateTime(filteredActiveClass.startedAt)}${filteredActiveClass.course ? ` • ${filteredActiveClass.course}` : ''}`
                  : nextCalendarEntry
                    ? `${formatAgendaDay(nextCalendarEntry.startsAt)} at ${formatTimeRange(nextCalendarEntry.startsAt, nextCalendarEntry.endsAt)}`
                    : 'No blocked slots or classes for the selected course yet.'}
              </p>
              <div className="livekit-student-hero-spotlight-meta">
                <span className="livekit-student-hero-pill">{hasCourseAccess ? 'Course ready' : 'Course locked'}</span>
                <span className="livekit-student-hero-pill">{futureCalendarItemCount} upcoming</span>
              </div>
            </aside>
            <div className="workspace-hero-stats livekit-hero-stats">
              <StatCard label="Course Access" value={hasCourseAccess ? 'Enabled' : 'Locked'} />
              <StatCard label="Live Now" value={filteredActiveClass ? '1' : '0'} />
              <StatCard label="Upcoming" value={futureCalendarItemCount} />
            </div>
          </section>
        ) : null}

        <section id="section-student-live-room" className={`livekit-student-room-section${isLiveFocusMode ? ' focus-mode' : ''}`}>
          {filteredActiveClass ? (
            <section className="card workspace-panel livekit-live-banner-panel">
              <div className="livekit-live-banner-indicator" aria-hidden="true">
                <span className="livekit-live-banner-indicator-ring" />
              </div>
              <div className="livekit-live-banner-copy">
                <span className="live-badge pulsing">LIVE NOW</span>
                <div>
                  <strong>{filteredActiveClass.title}</strong>
                  <p>{filteredActiveClass.description || 'Your teacher is already inside the room.'}</p>
                  <span>{formatDateTime(filteredActiveClass.startedAt)}{filteredActiveClass.course ? ` • ${filteredActiveClass.course}` : ''}</span>
                </div>
                <div className="livekit-live-banner-meta">
                  <span className="livekit-live-banner-pill">Tap once to join</span>
                  <span className="livekit-live-banner-pill">Optimized for mobile fullscreen</span>
                </div>
              </div>
              <div className="livekit-live-banner-actions">
                {isLiveFocusMode ? (
                  <button type="button" className="secondary-btn" onClick={() => navigate('/student/live-classes')}>
                    Exit Classroom Focus
                  </button>
                ) : (
                  <button type="button" className="primary-btn" onClick={() => navigate(`/student/live-classes/${encodeURIComponent(filteredActiveClass._id)}`)}>
                    Join Live Class
                  </button>
                )}
              </div>
            </section>
          ) : null}

          {isLiveFocusMode && selectedClass && selectedClass.status === 'live' ? (
              <StudentRoom
                classSession={selectedClass}
                onSessionRemoved={(message) => {
                  setBanner({ type: 'error', text: message || 'You were removed from the current live session by the admin.' });
                  navigate('/student/live-classes', { replace: true });
                  loadWorkspace();
                }}
                onLeave={() => {
                  navigate('/student/live-classes', { replace: true });
                  loadWorkspace({ showLoading: false });
                }}
              />
          ) : !filteredActiveClass ? (
            <section className="card livekit-empty-room-card">
              <strong>No active live class yet</strong>
              <p>When the admin starts a live class for this selected course, the join option will appear here.</p>
            </section>
          ) : null}
        </section>

        {!isLiveFocusMode ? (
          <>
            <section id="section-student-live-calendar" className="livekit-student-grid">
              <section className="card workspace-panel livekit-calendar-panel livekit-calendar-panel--teams">
                <div className="section-header compact">
                  <div>
                    <p className="eyebrow">Calendar</p>
                    <h3>Shared course calendar</h3>
                  </div>
                </div>
                <div className="livekit-student-calendar-shell">
                  <section className="livekit-student-calendar-spotlight livekit-student-calendar-toolbar">
                    <div className="livekit-student-calendar-spotlight-copy">
                      <span className="livekit-student-calendar-kicker">Course schedule</span>
                      <strong>{formatWeekRange(weekDays)}</strong>
                      <p>
                        {nextCalendarEntry
                          ? `Next item: ${nextCalendarEntry.title} on ${formatAgendaDay(nextCalendarEntry.startsAt)} at ${formatTimeRange(nextCalendarEntry.startsAt, nextCalendarEntry.endsAt)}`
                          : 'This week view shows live classes and blocked slots on an hourly schedule, similar to a shared course calendar workspace.'}
                      </p>
                    </div>
                    <div className="livekit-student-calendar-spotlight-meta">
                      <div className="livekit-student-course-filter">
                        <span>Course</span>
                        <select
                          className="livekit-student-course-filter-field"
                          value={selectedCourseFilter}
                          onChange={(event) => {
                            setSelectedCourseFilter(event.target.value);
                            setSelectedDateKey('');
                          }}
                        >
                          {courseFilterOptions.map((courseOption) => (
                            <option key={courseOption} value={courseOption}>
                              {courseOption === 'all' ? 'All Courses' : courseOption}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button type="button" className="secondary-btn" onClick={() => setSelectedDateKey(formatDateKey(new Date()))}>
                        Today
                      </button>
                      <span className="livekit-student-calendar-summary-pill">{calendarEntries.length} agenda item{calendarEntries.length === 1 ? '' : 's'}</span>
                      <span className={`livekit-student-calendar-summary-pill ${hasCourseAccess ? 'is-premium' : ''}`}>{hasCourseAccess ? 'Course ready' : 'Course locked'}</span>
                      {nextCalendarEntry?.kind === 'live-class' && nextCalendarEntry.liveClassId ? (
                        <button type="button" className="primary-btn" onClick={() => navigate(`/student/live-classes/${encodeURIComponent(nextCalendarEntry.liveClassId)}`)}>
                          Open Next Class
                        </button>
                      ) : null}
                    </div>
                  </section>

                  <div className="livekit-student-calendar-layout">
                    <aside className="livekit-student-calendar-sidebar">
                      <div className="livekit-student-calendar-sidebar-toggle-row">
                        <button
                          type="button"
                          className="secondary-btn livekit-student-mini-calendar-toggle"
                          onClick={() => setIsMiniCalendarCollapsed((current) => !current)}
                          aria-expanded={!isMiniCalendarCollapsed}
                          aria-controls="student-mini-calendar"
                        >
                          {isMiniCalendarCollapsed ? 'Show Month View' : 'Hide Month View'}
                        </button>
                      </div>
                      <div id="student-mini-calendar" className={`livekit-student-mini-calendar cardless${isMiniCalendarCollapsed ? ' is-collapsed' : ''}`}>
                        <div className="livekit-student-mini-calendar-head">
                          <strong>{formatMonthYear(selectedDate)}</strong>
                          <span>{eventCountByDate.get(selectedDateKey) || 0} scheduled</span>
                        </div>
                        <div className="livekit-student-mini-calendar-weekdays">
                          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                            <span key={label}>{label}</span>
                          ))}
                        </div>
                        <div className="livekit-student-mini-calendar-grid">
                          {monthDays.map((day) => {
                            const dayEvents = eventCountByDate.get(day.key) || 0;
                            const isSelected = day.key === selectedDateKey;
                            return (
                              <button
                                key={day.key}
                                type="button"
                                className={`livekit-student-mini-day${day.inMonth ? '' : ' is-muted'}${isSelected ? ' is-selected' : ''}${dayEvents ? ' has-events' : ''}`}
                                onClick={() => handleSelectDateKey(day.key)}
                              >
                                <span>{day.date.getDate()}</span>
                                {dayEvents ? <small>{dayEvents}</small> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </aside>

                    <div className="livekit-student-calendar-main">
                      <div
                        className="livekit-student-week-board"
                        style={{
                          '--calendar-hour-height': `${CALENDAR_HOUR_ROW_HEIGHT}px`,
                          '--calendar-slot-count': String(hourLabels.length),
                          '--calendar-row-count': String(calendarRowCount)
                        }}
                      >
                        <div className="livekit-student-week-board-head">
                          <div className="livekit-student-week-board-head-spacer" />
                          {weekDays.map((day) => {
                            const dayKey = formatDateKey(day);
                            const isSelected = dayKey === selectedDateKey;
                            return (
                              <button
                                key={dayKey}
                                type="button"
                                className={`livekit-student-week-board-day${isSelected ? ' is-selected' : ''}`}
                                onClick={() => setSelectedDateKey(dayKey)}
                              >
                                <span>{formatToolbarDay(day)}</span>
                                <strong>{day.getDate()}</strong>
                              </button>
                            );
                          })}
                        </div>

                        <div className="livekit-student-week-board-body">
                          <div className="livekit-student-week-time-rail">
                            {hourLabels.map((hour) => (
                              <div key={hour} className="livekit-student-week-time-slot">
                                <span>{formatHourLabel(hour)}</span>
                              </div>
                            ))}
                          </div>

                          <div className="livekit-student-week-columns">
                            {weekDays.map((day) => {
                              const dayKey = formatDateKey(day);
                              const entries = weekEntriesByDay.get(dayKey) || [];
                              return (
                                <div key={dayKey} className={`livekit-student-week-column${dayKey === selectedDateKey ? ' is-selected' : ''}`}>
                                  <div className="livekit-student-week-grid-lines">
                                    {hourLabels.slice(0, -1).map((hour) => (
                                      <div key={hour} className="livekit-student-week-grid-line" />
                                    ))}
                                  </div>
                                  <div className="livekit-student-week-events-layer">
                                    {entries.map((entry) => {
                                      const layout = getEventLayout(entry, startHour);
                                      const isCompactEvent = layout.height < 74;
                                      const isUltraCompactEvent = layout.height < 58;
                                      return (
                                        <button
                                          key={`${dayKey}-${entry.kind}-${entry.id}`}
                                          type="button"
                                          className={`livekit-student-week-event kind-${entry.kind}${entry.liveClassId ? ' is-actionable' : ''}${isCompactEvent ? ' is-compact' : ''}${isUltraCompactEvent ? ' is-ultra-compact' : ''}`}
                                          style={{ top: `${layout.top}px`, height: `${layout.height}px` }}
                                          onClick={() => {
                                            if (entry.kind === 'live-class' && entry.liveClassId) {
                                              navigate(`/student/live-classes/${encodeURIComponent(entry.liveClassId)}`);
                                            } else {
                                              setSelectedDateKey(dayKey);
                                            }
                                          }}
                                        >
                                          <span className={`livekit-calendar-event-icon kind-${entry.kind}`}>
                                            <CalendarEventIcon kind={entry.kind} />
                                          </span>
                                          <div className="livekit-student-week-event-copy">
                                            <strong>{entry.title}</strong>
                                            <span>{isUltraCompactEvent ? formatCompactTimeRange(entry.startsAt, entry.endsAt) : formatTimeRange(entry.startsAt, entry.endsAt)}</span>
                                            {!isUltraCompactEvent ? <small>{`${entry.course || 'General'} • ${entry.batch || 'General'}`}</small> : null}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </section>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}