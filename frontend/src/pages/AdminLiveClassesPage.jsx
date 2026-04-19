import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  createLivekitCalendarBlock,
  createLivekitClass,
  deleteLivekitCalendarBlock,
  deleteLivekitClass,
  endLivekitClass,
  fetchAdminLivekitWorkspace,
  fetchLiveClassServerStatus,
  stopLiveClassServer,
  updateLivekitCalendarBlock
} from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import TeacherRoom from '../components/TeacherRoom';
import './AdminLiveClassesPage.css';

const COURSE_CATEGORIES = ['11th', '12th', 'NEET', 'IIT-JAM', 'CSIR-NET Life Science', 'GATE'];

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

function formatTimeRange(startsAt, endsAt) {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (!start || Number.isNaN(start.getTime())) return 'Time unavailable';
  const startLabel = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (!end || Number.isNaN(end.getTime())) return startLabel;
  return `${startLabel} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function sortBySchedule(left, right) {
  const leftTime = new Date(left?.sortAt || left?.scheduledAt || left?.startsAt || left?.startedAt || 0).getTime();
  const rightTime = new Date(right?.sortAt || right?.scheduledAt || right?.startsAt || right?.startedAt || 0).getTime();
  return leftTime - rightTime;
}

function groupAgendaEntries(entries) {
  const grouped = new Map();

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const dayKey = formatAgendaDay(entry?.startsAt);
    if (!grouped.has(dayKey)) grouped.set(dayKey, []);
    grouped.get(dayKey).push(entry);
  });

  return Array.from(grouped.entries()).map(([day, items]) => ({
    day,
    items: items.sort((left, right) => new Date(left?.startsAt || 0).getTime() - new Date(right?.startsAt || 0).getTime())
  }));
}

function toDateTimeLocalInput(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseLocalDateTimeInput(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;

  const parsed = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    0
  );

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toLocalInputIsoString(value) {
  const parsed = parseLocalDateTimeInput(value);
  return parsed ? parsed.toISOString() : null;
}

export default function AdminLiveClassesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { classId = '' } = useParams();
  const isStudioRoute = location.pathname.endsWith('/studio');
  const [workspace, setWorkspace] = useState({ classes: [], students: [], calendarBlocks: [], availableCourses: [] });
  const [serverStatus, setServerStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [classForm, setClassForm] = useState({
    title: '',
    description: '',
    course: '',
    scheduledAt: '',
    scheduledEndAt: ''
  });
  const [isSavingClass, setIsSavingClass] = useState(false);
  const [isStoppingServer, setIsStoppingServer] = useState(false);
  const [isEndingClassId, setIsEndingClassId] = useState('');
  const [isDeletingClassId, setIsDeletingClassId] = useState('');
  const [blockForm, setBlockForm] = useState({
    course: '',
    title: '',
    description: '',
    startsAt: '',
    endsAt: ''
  });
  const [isCreatingBlock, setIsCreatingBlock] = useState(false);
  const [editingBlock, setEditingBlock] = useState({
    open: false,
    blockId: '',
    course: '',
    title: '',
    description: '',
    startsAt: '',
    endsAt: ''
  });
  const [isUpdatingBlockId, setIsUpdatingBlockId] = useState('');
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    classId: '',
    title: '',
    message: '',
    confirmLabel: 'Delete',
    processingLabel: 'Deleting...',
    meta: []
  });

  async function loadWorkspace() {
    setLoading(true);
    try {
      const [workspaceResponse, serverResponse] = await Promise.all([
        fetchAdminLivekitWorkspace(),
        fetchLiveClassServerStatus().catch(() => null)
      ]);
      setWorkspace({
        classes: Array.isArray(workspaceResponse?.classes) ? workspaceResponse.classes : [],
        students: Array.isArray(workspaceResponse?.students) ? workspaceResponse.students : [],
        calendarBlocks: Array.isArray(workspaceResponse?.calendarBlocks) ? workspaceResponse.calendarBlocks : [],
        availableCourses: Array.isArray(workspaceResponse?.availableCourses) ? workspaceResponse.availableCourses : []
      });
      setServerStatus(serverResponse?.server || null);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load live class workspace.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkspace();
  }, []);

  useEffect(() => {
    if (!banner) return undefined;

    const timerId = window.setTimeout(() => {
      setBanner(null);
    }, 3000);

    return () => window.clearTimeout(timerId);
  }, [banner]);

  useEffect(() => {
    if (blockForm.course) return;
    const firstCourse = (workspace.availableCourses || []).find(Boolean);
    if (!firstCourse) return;
    setBlockForm((current) => ({ ...current, course: firstCourse }));
  }, [workspace.availableCourses, blockForm.course]);

  const visibleClasses = useMemo(
    () => workspace.classes.filter((item) => item.status === 'live' || item.status === 'scheduled'),
    [workspace.classes]
  );

  const liveClassCount = useMemo(
    () => workspace.classes.filter((item) => item.status === 'live').length,
    [workspace.classes]
  );

  const scheduledClassCount = useMemo(
    () => workspace.classes.filter((item) => item.status === 'scheduled').length,
    [workspace.classes]
  );

  const visibleCalendarQueueBlocks = useMemo(
    () => (workspace.calendarBlocks || [])
      .filter((block) => {
        const endsAt = new Date(block?.endsAt || block?.startsAt || 0).getTime();
        return Number.isFinite(endsAt) && endsAt >= Date.now() - (6 * 60 * 60 * 1000);
      })
      .sort((left, right) => sortBySchedule(left, right)),
    [workspace.calendarBlocks]
  );

  const sessionQueueItems = useMemo(
    () => [
      ...visibleClasses.map((item) => ({
        kind: 'session',
        key: `session-${item._id}`,
        sortAt: item.scheduledAt || item.startedAt,
        data: item
      })),
      ...visibleCalendarQueueBlocks.map((block) => ({
        kind: 'calendar-block',
        key: `calendar-${block._id}`,
        sortAt: block.startsAt,
        data: block
      }))
    ].sort(sortBySchedule),
    [visibleClasses, visibleCalendarQueueBlocks]
  );

  const selectedClass = useMemo(() => {
    if (classId) {
      return visibleClasses.find((item) => item._id === classId) || null;
    }
    return visibleClasses.find((item) => item.status === 'live') || visibleClasses[0] || null;
  }, [classId, visibleClasses]);

  function openStudioRoute(targetClassId, options = {}) {
    const normalizedClassId = String(targetClassId || '').trim();
    if (!normalizedClassId) return;

    navigate(`/admin/live-classes/${encodeURIComponent(normalizedClassId)}/studio`, {
      replace: Boolean(options.replace),
      state: options.autoStart ? { autoStartClass: true } : null
    });
  }

  const calendarCourseOptions = useMemo(
    () => Array.from(new Set([...COURSE_CATEGORIES, ...(workspace.availableCourses || [])])).filter(Boolean),
    [workspace.availableCourses]
  );

  const groupedCalendarBlocks = useMemo(
    () => groupAgendaEntries(workspace.calendarBlocks || []),
    [workspace.calendarBlocks]
  );

  async function handleCreateClass(event) {
    event.preventDefault();
    setIsSavingClass(true);
    setBanner(null);
    try {
      const response = await createLivekitClass({
        title: classForm.title.trim() || 'Course Live Class',
        description: classForm.description.trim(),
        course: classForm.course,
        scheduledAt: toLocalInputIsoString(classForm.scheduledAt),
        scheduledEndAt: toLocalInputIsoString(classForm.scheduledEndAt),
        allowedUsernames: [],
        maxParticipants: 101
      });

      setClassForm({ title: '', description: '', course: '', scheduledAt: '', scheduledEndAt: '' });
      setBanner({ type: 'success', text: `Live class “${response?.liveClass?.title || 'session'}” created.` });
      await loadWorkspace();
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to create live class.' });
    } finally {
      setIsSavingClass(false);
    }
  }

  async function handleStopServer() {
    if (liveClassCount > 0 || isStoppingServer) return;

    setIsStoppingServer(true);
    setBanner(null);
    try {
      const response = await stopLiveClassServer();
      setServerStatus(response?.server || null);
      setBanner({ type: 'success', text: response?.message || 'EC2 server stop requested successfully.' });
      await loadWorkspace();
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to stop the EC2 server.' });
    } finally {
      setIsStoppingServer(false);
    }
  }

  async function handleEndClass(targetClassId) {
    setIsEndingClassId(targetClassId);
    try {
      await endLivekitClass(targetClassId);
      setBanner({ type: 'success', text: 'Live class ended.' });
      await loadWorkspace();
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to end live class.' });
    } finally {
      setIsEndingClassId('');
    }
  }

  function closeDeleteDialog(force = false) {
    if (isDeletingClassId && !force) return;
    setDeleteDialog({
      open: false,
      classId: '',
      title: '',
      message: '',
      confirmLabel: 'Delete',
      processingLabel: 'Deleting...',
      meta: []
    });
  }

  async function deleteClassNow(targetClassId) {
    const normalizedClassId = String(targetClassId || '').trim();
    if (!normalizedClassId) return;

    const targetClass = workspace.classes.find((item) => item._id === normalizedClassId);
    const isScheduledClass = targetClass?.status === 'scheduled';

    setIsDeletingClassId(normalizedClassId);
    try {
      await deleteLivekitClass(normalizedClassId);
      setBanner({ type: 'success', text: isScheduledClass ? 'Scheduled live class removed.' : 'Live class cancelled.' });
      await loadWorkspace();
      closeDeleteDialog(true);
      if (classId === normalizedClassId) {
        navigate('/admin/live-classes');
      }
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to cancel live class.' });
    } finally {
      setIsDeletingClassId('');
    }
  }

  function handleDeleteClass(targetClassId) {
    const targetClass = workspace.classes.find((item) => item._id === targetClassId);
    if (!targetClass) return;

    const isScheduledClass = targetClass?.status === 'scheduled';
    if (isScheduledClass) {
      deleteClassNow(targetClassId);
      return;
    }

    setDeleteDialog({
      open: true,
      classId: targetClassId,
      title: isScheduledClass ? 'Remove scheduled live class?' : 'Cancel live class?',
      message: isScheduledClass
        ? 'This scheduled class will be removed from the session queue and no longer appear in the studio workspace.'
        : 'This live class will be cancelled and students will no longer be able to join it.',
      confirmLabel: isScheduledClass ? 'Remove session' : 'Cancel class',
      processingLabel: isScheduledClass ? 'Removing...' : 'Cancelling...',
      meta: [
        targetClass.title || 'Untitled class',
        targetClass.course || 'All courses',
        targetClass.status || 'scheduled'
      ]
    });
  }

  async function confirmDeleteClass() {
    const targetClassId = String(deleteDialog.classId || '').trim();
    if (!targetClassId) return;

    await deleteClassNow(targetClassId);
  }

  async function handleCreateBlock(event) {
    event.preventDefault();
    setIsCreatingBlock(true);
    try {
      await createLivekitCalendarBlock({
        course: blockForm.course,
        title: blockForm.title,
        description: blockForm.description,
        startsAt: toLocalInputIsoString(blockForm.startsAt),
        endsAt: toLocalInputIsoString(blockForm.endsAt)
      });
      setBanner({ type: 'success', text: 'Course calendar block created.' });
      setBlockForm((current) => ({ ...current, title: '', description: '', startsAt: '', endsAt: '' }));
      await loadWorkspace();
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to create calendar block.' });
    } finally {
      setIsCreatingBlock(false);
    }
  }

  async function handleDeleteBlock(blockId) {
    try {
      await deleteLivekitCalendarBlock(blockId);
      setBanner({ type: 'success', text: 'Course calendar block removed.' });
      await loadWorkspace();
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to delete calendar block.' });
    }
  }

  function openEditBlockDialog(block) {
    if (!block?._id) return;
    setEditingBlock({
      open: true,
      blockId: String(block._id),
      course: String(block.course || '').trim(),
      title: String(block.title || '').trim(),
      description: String(block.description || '').trim(),
      startsAt: toDateTimeLocalInput(block.startsAt),
      endsAt: toDateTimeLocalInput(block.endsAt)
    });
  }

  function closeEditBlockDialog(force = false) {
    if (isUpdatingBlockId && !force) return;
    setEditingBlock({
      open: false,
      blockId: '',
      course: '',
      title: '',
      description: '',
      startsAt: '',
      endsAt: ''
    });
  }

  async function handleUpdateBlock(event) {
    event.preventDefault();
    const blockId = String(editingBlock.blockId || '').trim();
    if (!blockId) return;

    setIsUpdatingBlockId(blockId);
    try {
      await updateLivekitCalendarBlock(blockId, {
        course: editingBlock.course,
        title: editingBlock.title,
        description: editingBlock.description,
        startsAt: toLocalInputIsoString(editingBlock.startsAt),
        endsAt: toLocalInputIsoString(editingBlock.endsAt)
      });
      setBanner({ type: 'success', text: 'Course calendar block updated.' });
      await loadWorkspace();
      closeEditBlockDialog(true);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to update calendar block.' });
    } finally {
      setIsUpdatingBlockId('');
    }
  }

  function handleUseBlockForSession(block) {
    if (!block?._id) return;

    setClassForm({
      title: String(block.title || '').trim(),
      description: String(block.description || '').trim(),
      course: String(block.course || '').trim(),
      scheduledAt: toDateTimeLocalInput(block.startsAt),
      scheduledEndAt: toDateTimeLocalInput(block.endsAt),
      allowedUsernames: ''
    });
    setBanner({ type: 'success', text: `Session form prefilled from calendar block “${block.title || 'slot'}”.` });

    if (typeof document !== 'undefined') {
      const target = document.getElementById('section-livekit-create-session');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  const workspaceNavItems = [
    { id: 'section-livekit-overview', label: 'Overview', icon: '🎥' },
    { id: 'section-livekit-calendar', label: 'Calendar Blocks', icon: '🗓️' }
  ];

  const studioNavItems = [
    { id: 'section-livekit-studio-hero', label: 'Studio', icon: '🎬' },
    { id: 'section-livekit-studio', label: 'Room', icon: '🧑‍🏫' }
  ];

  if (isStudioRoute) {
    return (
      <AppShell
        title="Studio Room"
        subtitle="Dedicated teacher studio for live class control, polling, and course-based access"
        roleLabel="Admin"
        showThemeSwitch
        navTitle="Studio"
        navItems={studioNavItems}
        actions={(
          <div className="registered-learners-topbar-actions">
            <button type="button" className="secondary-btn" onClick={() => navigate('/admin/live-classes')}>← Back to Workspace</button>
            <button type="button" className="secondary-btn" onClick={loadWorkspace}>Refresh</button>
          </div>
        )}
      >
        <main className="admin-workspace-page livekit-admin-page livekit-studio-page">
          {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}
          {loading ? <p className="empty-note">Loading studio...</p> : null}

          <section id="section-livekit-studio-hero" className="workspace-hero livekit-studio-hero">
            <div>
              <p className="eyebrow">Teacher Studio</p>
              <h2>{selectedClass?.title || 'Live Class Studio'}</h2>
              <p className="subtitle">This page is the dedicated studio room for the teacher. Start the class, manage the room, and run live polls while paid course access handles attendance automatically.</p>
            </div>
            <div className="workspace-hero-stats livekit-hero-stats">
              <StatCard label="Room" value={selectedClass?.roomName || 'Not assigned'} />
              <StatCard label="Class Status" value={selectedClass?.status || 'Not ready'} />
              <StatCard label="Course Access" value={selectedClass?.course || 'All Courses'} />
              <StatCard label="Server" value={serverStatus?.state || 'unknown'} />
            </div>
          </section>

          <section className="livekit-studio-layout">
            <div id="section-livekit-studio" className="livekit-studio-shell">
              <TeacherRoom
                classSession={selectedClass}
                autoStart={Boolean(location.state?.autoStartClass)}
                onSessionStarted={(nextClass) => {
                  if (nextClass?._id) {
                    openStudioRoute(nextClass._id, { replace: true });
                  }
                  loadWorkspace();
                }}
                onSessionEnded={() => loadWorkspace()}
              />
            </div>
          </section>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Live Class Control"
      subtitle="LiveKit hosted classroom workspace for scheduling, course-based access, and teacher studio control"
      roleLabel="Admin"
      showThemeSwitch
      navTitle="Live Class Workspace"
      navItems={workspaceNavItems}
      actions={(
        <div className="registered-learners-topbar-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate('/admin')}>← Back to Dashboard</button>
          <button type="button" className="secondary-btn" onClick={loadWorkspace}>Refresh</button>
        </div>
      )}
    >
      <main className="admin-workspace-page livekit-admin-page">
        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}
        {loading ? <p className="empty-note">Loading live class workspace...</p> : null}

        <section id="section-livekit-overview" className="workspace-hero livekit-hero">
          <div className="livekit-hero-copy-block">
            <p className="eyebrow">AWS + LiveKit</p>
            <h2>Course live classroom control for teachers and students</h2>
            <p className="subtitle">Launch the AWS EC2 LiveKit server on demand, run the teacher studio, and schedule course-specific live classes with shared student calendars.</p>
            <div className="livekit-hero-actions">
              <button
                type="button"
                className="secondary-btn livekit-server-stop-btn"
                onClick={handleStopServer}
                disabled={isStoppingServer || liveClassCount > 0 || !['running', 'pending'].includes(String(serverStatus?.state || '').toLowerCase())}
              >
                {isStoppingServer ? 'Stopping Server...' : 'Stop Server'}
              </button>
              <span className="livekit-hero-action-note">
                {liveClassCount > 0
                  ? 'End the active live class before stopping the server.'
                  : ['running', 'pending'].includes(String(serverStatus?.state || '').toLowerCase())
                    ? 'No live class is active. You can stop the EC2 server from here.'
                    : 'Server stop is available when the EC2 instance is running.'}
              </span>
            </div>
          </div>
          <div className="workspace-hero-stats livekit-hero-stats">
            <StatCard label="Scheduled Classes" value={scheduledClassCount} />
            <StatCard label="Live Now" value={liveClassCount} />
            <StatCard label="Students" value={workspace.students.length} />
            <StatCard label="Server" value={serverStatus?.state || 'unknown'} />
          </div>
        </section>

        <section className="livekit-admin-grid livekit-admin-grid--primary">
          <section id="section-livekit-create-session" className="card workspace-panel livekit-creation-panel">
            <div className="section-header compact livekit-panel-head">
              <div>
                <p className="eyebrow">Create Session</p>
                <h3>Schedule a course live class</h3>
                <p className="subtitle">Each class gets its own LiveKit room name and supports up to 101 participants.</p>
              </div>
              <StatCard label="Max Participants" value="101" />
            </div>

            <form className="livekit-class-form" onSubmit={handleCreateClass}>
              <label>
                <span>Class title</span>
                <input type="text" value={classForm.title} onChange={(event) => setClassForm((current) => ({ ...current, title: event.target.value }))} placeholder="NEET Biology Masterclass" required />
              </label>
              <label>
                <span>Description</span>
                <textarea value={classForm.description} onChange={(event) => setClassForm((current) => ({ ...current, description: event.target.value }))} placeholder="What this live class covers" rows={3} />
              </label>
              <label>
                <span>Course access</span>
                <select value={classForm.course} onChange={(event) => setClassForm((current) => ({ ...current, course: event.target.value }))}>
                  <option value="">All courses</option>
                  {COURSE_CATEGORIES.map((courseName) => (
                    <option key={courseName} value={courseName}>{courseName}</option>
                  ))}
                </select>
              </label>
              <div className="livekit-form-grid-2">
                <label>
                  <span>Starts at</span>
                  <input type="datetime-local" value={classForm.scheduledAt} onChange={(event) => setClassForm((current) => ({ ...current, scheduledAt: event.target.value }))} />
                </label>
                <label>
                  <span>Ends at</span>
                  <input type="datetime-local" value={classForm.scheduledEndAt} onChange={(event) => setClassForm((current) => ({ ...current, scheduledEndAt: event.target.value }))} />
                </label>
              </div>
              <button type="submit" className="primary-btn" disabled={isSavingClass}>{isSavingClass ? 'Saving...' : 'Create Live Class'}</button>
            </form>
          </section>

          <section className="card workspace-panel livekit-session-list-panel">
            <div className="section-header compact livekit-panel-head livekit-panel-head--queue">
              <div>
                <p className="eyebrow">Session Queue</p>
                <h3>Upcoming and active classes</h3>
                <p className="subtitle">Use Start In Studio or Prepare Studio from live sessions below, and keep blocked calendar slots visible in the same queue so nothing gets missed.</p>
              </div>
              <StatCard label="Queue Items" value={sessionQueueItems.length} />
            </div>

            <div className="livekit-session-list">
              {sessionQueueItems.map((entry) => {
                if (entry.kind === 'calendar-block') {
                  const block = entry.data;
                  return (
                    <article key={entry.key} className="livekit-session-card livekit-session-card--calendar-block status-calendar-block">
                      <div className="livekit-session-card-content">
                        <div className="livekit-session-card-head">
                          <strong>{block.title}</strong>
                          <span className="livekit-session-status status-calendar-block">blocked slot</span>
                        </div>
                        <p>{block.description || 'Shared course schedule block.'}</p>
                        <div className="livekit-session-meta-row">
                          <span className="livekit-session-meta-pill">{formatDateTime(block.startsAt)}</span>
                          <span className="livekit-session-meta-pill">{formatTimeRange(block.startsAt, block.endsAt)}</span>
                          <span className="livekit-session-meta-pill">{block.course || 'All courses'}</span>
                        </div>
                      </div>
                      <div className="livekit-session-actions">
                        <button type="button" className="primary-btn" onClick={() => handleUseBlockForSession(block)}>
                          Use For Session
                        </button>
                        <button type="button" className="secondary-btn" onClick={() => openEditBlockDialog(block)}>
                          Edit Block
                        </button>
                      </div>
                    </article>
                  );
                }

                const item = entry.data;
                return (
                  <article key={entry.key} className={`livekit-session-card status-${item.status}`}>
                    <div className="livekit-session-card-content">
                      <div className="livekit-session-card-head">
                        <strong>{item.title}</strong>
                        <span className={`livekit-session-status status-${item.status}`}>{item.status}</span>
                      </div>
                      <p>{item.description || 'No description added yet.'}</p>
                      <div className="livekit-session-meta-row">
                        <span className="livekit-session-meta-pill">{formatDateTime(item.scheduledAt || item.startedAt)}</span>
                        <span className="livekit-session-meta-pill">{item.roomName}</span>
                        <span className="livekit-session-meta-pill">{item.course || 'All courses'}</span>
                      </div>
                    </div>
                    <div className="livekit-session-actions">
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => openStudioRoute(item._id, { autoStart: item.status !== 'live' })}
                      >
                        {item.status === 'live' ? 'Enter Live Studio' : 'Start In Studio'}
                      </button>
                      {item.status === 'live' ? (
                        <button type="button" className="danger-btn" onClick={() => handleEndClass(item._id)} disabled={isEndingClassId === item._id}>{isEndingClassId === item._id ? 'Ending...' : 'End'}</button>
                      ) : (
                        <button type="button" className="secondary-btn" onClick={() => openStudioRoute(item._id)}>Prepare Studio</button>
                      )}
                      <button type="button" className="secondary-btn" onClick={() => handleDeleteClass(item._id)} disabled={isDeletingClassId === item._id}>{isDeletingClassId === item._id ? (item.status === 'scheduled' ? 'Removing...' : 'Cancelling...') : (item.status === 'scheduled' ? 'Remove' : 'Cancel')}</button>
                    </div>
                  </article>
                );
              })}
              {!sessionQueueItems.length ? (
                <article className="livekit-session-card livekit-empty-state-card">
                  <strong>No live classes in the queue</strong>
                  <p>Create a live class or a course calendar block above and it will appear here for scheduling visibility and session control.</p>
                </article>
              ) : null}
            </div>
          </section>
        </section>

        <section id="section-livekit-calendar" className="livekit-admin-grid lower-grid">
          <section className="card workspace-panel livekit-calendar-panel">
            <div className="section-header compact livekit-panel-head">
              <div>
                <p className="eyebrow">Calendar Blocking</p>
                <h3>Shared course schedule</h3>
                <p className="subtitle">Create course-wide blocked slots so every student on that course sees the same schedule, similar to a Teams calendar channel.</p>
              </div>
            </div>

            <div className="livekit-calendar-shell">
              <form className="livekit-class-form livekit-calendar-composer" onSubmit={handleCreateBlock}>
                <label>
                  <span>Course</span>
                  <select value={blockForm.course} onChange={(event) => setBlockForm((current) => ({ ...current, course: event.target.value }))} required>
                    <option value="">Select course</option>
                    {calendarCourseOptions.map((courseName) => (
                      <option key={courseName} value={courseName}>{courseName}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Block title</span>
                  <input type="text" value={blockForm.title} onChange={(event) => setBlockForm((current) => ({ ...current, title: event.target.value }))} placeholder="Molecular Biology revision block" required />
                </label>
                <label>
                  <span>Description</span>
                  <textarea rows={3} value={blockForm.description} onChange={(event) => setBlockForm((current) => ({ ...current, description: event.target.value }))} placeholder="Shared note for all students on this course." />
                </label>
                <div className="livekit-form-grid-2">
                  <label>
                    <span>Starts at</span>
                    <input type="datetime-local" value={blockForm.startsAt} onChange={(event) => setBlockForm((current) => ({ ...current, startsAt: event.target.value }))} required />
                  </label>
                  <label>
                    <span>Ends at</span>
                    <input type="datetime-local" value={blockForm.endsAt} onChange={(event) => setBlockForm((current) => ({ ...current, endsAt: event.target.value }))} required />
                  </label>
                </div>
                <button type="submit" className="primary-btn" disabled={isCreatingBlock || !blockForm.course}>{isCreatingBlock ? 'Scheduling...' : 'Add To Course Calendar'}</button>
              </form>

              <div className="livekit-calendar-board">
                <div className="livekit-calendar-board-head">
                  <div>
                    <p className="eyebrow">Shared Agenda</p>
                    <h4>Course schedule board</h4>
                  </div>
                  <StatCard label="Blocks" value={workspace.calendarBlocks.length} />
                </div>

                <div className="livekit-calendar-agenda">
                  {groupedCalendarBlocks.map((group) => (
                    <section key={group.day} className="livekit-calendar-day-group">
                      <div className="livekit-calendar-day-rail">
                        <strong>{group.day}</strong>
                        <span>{group.items.length} item{group.items.length === 1 ? '' : 's'}</span>
                      </div>
                      <div className="livekit-calendar-day-items">
                        {group.items.map((block) => (
                          <article key={block._id} className="livekit-calendar-event-card kind-blocked-slot">
                            <div className="livekit-calendar-event-topline">
                              <span className="livekit-calendar-course-pill">{block.course}</span>
                              <span>{formatTimeRange(block.startsAt, block.endsAt)}</span>
                            </div>
                            <strong>{block.title}</strong>
                            <p>{block.description || 'Shared course schedule block.'}</p>
                            <div className="livekit-calendar-event-actions">
                              <span>Visible to all students on this course</span>
                              <div className="livekit-calendar-inline-actions">
                                <button type="button" className="secondary-btn" onClick={() => openEditBlockDialog(block)}>Edit</button>
                                <button type="button" className="secondary-btn" onClick={() => handleDeleteBlock(block._id)}>Remove</button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                  {!groupedCalendarBlocks.length ? (
                    <article className="livekit-empty-state-card livekit-calendar-empty-card">
                      <strong>No course blocks scheduled</strong>
                      <p>Create a course calendar block and it will appear here for admin review and student visibility.</p>
                    </article>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </section>

        {deleteDialog.open ? createPortal(
          <div
            className="confirm-modal-backdrop"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) closeDeleteDialog();
            }}
          >
            <section className="confirm-modal card quiz-delete-confirm-modal" role="dialog" aria-modal="true" aria-label="Delete live class confirmation">
              <p className="eyebrow">Confirmation</p>
              <h2>{deleteDialog.title}</h2>
              <p className="subtitle">{deleteDialog.message}</p>
              <div className="quiz-delete-confirm-meta">
                {deleteDialog.meta.filter(Boolean).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <div className="confirm-modal-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeDeleteDialog();
                  }}
                  disabled={Boolean(isDeletingClassId)}
                >
                  Keep session
                </button>
                <button
                  type="button"
                  className="danger-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    confirmDeleteClass();
                  }}
                  disabled={Boolean(isDeletingClassId)}
                >
                  {isDeletingClassId ? deleteDialog.processingLabel : deleteDialog.confirmLabel}
                </button>
              </div>
            </section>
          </div>,
          document.body
        ) : null}

        {editingBlock.open ? createPortal(
          <div
            className="confirm-modal-backdrop"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) closeEditBlockDialog();
            }}
          >
            <section className="confirm-modal card livekit-calendar-edit-modal" role="dialog" aria-modal="true" aria-label="Edit calendar block">
              <p className="eyebrow">Edit Calendar Block</p>
              <h2>Update shared schedule</h2>
              <p className="subtitle">Adjust course, title, note, and timing for this shared course block.</p>
              <form className="livekit-class-form livekit-calendar-edit-form" onSubmit={handleUpdateBlock}>
                <label>
                  <span>Course</span>
                  <select value={editingBlock.course} onChange={(event) => setEditingBlock((current) => ({ ...current, course: event.target.value }))} required>
                    <option value="">Select course</option>
                    {calendarCourseOptions.map((courseName) => (
                      <option key={`edit-${courseName}`} value={courseName}>{courseName}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Block title</span>
                  <input type="text" value={editingBlock.title} onChange={(event) => setEditingBlock((current) => ({ ...current, title: event.target.value }))} required />
                </label>
                <label>
                  <span>Description</span>
                  <textarea rows={3} value={editingBlock.description} onChange={(event) => setEditingBlock((current) => ({ ...current, description: event.target.value }))} />
                </label>
                <div className="livekit-form-grid-2">
                  <label>
                    <span>Starts at</span>
                    <input type="datetime-local" value={editingBlock.startsAt} onChange={(event) => setEditingBlock((current) => ({ ...current, startsAt: event.target.value }))} required />
                  </label>
                  <label>
                    <span>Ends at</span>
                    <input type="datetime-local" value={editingBlock.endsAt} onChange={(event) => setEditingBlock((current) => ({ ...current, endsAt: event.target.value }))} required />
                  </label>
                </div>
                <div className="confirm-modal-actions">
                  <button type="button" className="secondary-btn" onClick={() => closeEditBlockDialog()} disabled={Boolean(isUpdatingBlockId)}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-btn" disabled={Boolean(isUpdatingBlockId)}>
                    {isUpdatingBlockId ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </section>
          </div>,
          document.body
        ) : null}
      </main>
    </AppShell>
  );
}