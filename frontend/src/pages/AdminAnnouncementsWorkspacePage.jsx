import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createAnnouncementAdmin,
  deleteAnnouncementAdmin,
  fetchAdminAnnouncements,
  updateAnnouncementAdmin
} from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';

export default function AdminAnnouncementsWorkspacePage() {
  const navigate = useNavigate();
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [announcementList, setAnnouncementList] = useState([]);
  const [announcementInlineMessage, setAnnouncementInlineMessage] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  async function loadAnnouncements(showRefreshingState = false) {
    if (showRefreshingState) setRefreshing(true);
    try {
      const data = await fetchAdminAnnouncements();
      setAnnouncementList(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch (error) {
      setAnnouncementInlineMessage({ type: 'error', text: error.message || 'Failed to load announcements.' });
    } finally {
      if (showRefreshingState) setRefreshing(false);
    }
  }

  async function handleCreateAnnouncement(event) {
    event.preventDefault();
    const title = announcementTitle.trim();
    const message = announcementMessage.trim();
    if (!title || !message) {
      setAnnouncementInlineMessage({ type: 'error', text: 'Announcement title and message are required.' });
      return;
    }

    setAnnouncementSaving(true);
    setAnnouncementInlineMessage(null);
    try {
      await createAnnouncementAdmin({ title, message, isActive: true });
      setAnnouncementTitle('');
      setAnnouncementMessage('');
      setAnnouncementInlineMessage({ type: 'success', text: 'Announcement published.' });
      await loadAnnouncements();
    } catch (error) {
      setAnnouncementInlineMessage({ type: 'error', text: error.message || 'Failed to publish announcement.' });
    } finally {
      setAnnouncementSaving(false);
    }
  }

  async function handleToggleAnnouncementStatus(item) {
    try {
      await updateAnnouncementAdmin(item._id, !(item.isActive !== false));
      await loadAnnouncements();
      setAnnouncementInlineMessage({
        type: 'success',
        text: item.isActive !== false ? 'Announcement hidden from students.' : 'Announcement enabled for students.'
      });
    } catch (error) {
      setAnnouncementInlineMessage({ type: 'error', text: error.message || 'Failed to update announcement status.' });
    }
  }

  async function handleDeleteAnnouncement(item) {
    try {
      await deleteAnnouncementAdmin(item._id);
      await loadAnnouncements();
      setAnnouncementInlineMessage({ type: 'success', text: 'Announcement deleted.' });
    } catch (error) {
      setAnnouncementInlineMessage({ type: 'error', text: error.message || 'Failed to delete announcement.' });
    }
  }

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const activeCount = announcementList.filter((item) => item.isActive !== false).length;

  return (
    <AppShell
      title="Student Announcements"
      subtitle="Publish and manage student updates in a dedicated workspace"
      roleLabel="Admin"
      showThemeSwitch
      actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => loadAnnouncements(true)}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" className="secondary-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>
      )}
    >
      <main className="admin-workspace-page">
        <section className="workspace-hero workspace-hero-announcements">
          <div>
            <p className="eyebrow">Student Announcements</p>
            <h2>Publish important updates beautifully</h2>
            <p className="subtitle">Announcements appear in the student notification icon above WhatsApp for instant visibility.</p>
          </div>
          <div className="workspace-hero-stats">
            <StatCard label="Total Announcements" value={announcementList.length} />
            <StatCard label="Active" value={activeCount} />
          </div>
        </section>

        <section className="card quiz-builder-panel quiz-builder-section workspace-panel">
          <form className="quiz-builder-form" onSubmit={handleCreateAnnouncement}>
            <label>
              Announcement title
              <input
                value={announcementTitle}
                onChange={(event) => setAnnouncementTitle(event.target.value)}
                placeholder="Example: Sunday live doubt session at 7 PM"
                required
              />
            </label>

            <label>
              Message
              <textarea
                rows="3"
                value={announcementMessage}
                onChange={(event) => setAnnouncementMessage(event.target.value)}
                placeholder="Write announcement details shown to students"
                required
              />
            </label>

            {announcementInlineMessage ? <p className={`inline-message ${announcementInlineMessage.type}`}>{announcementInlineMessage.text}</p> : null}

            <button className="primary-btn" type="submit" disabled={announcementSaving}>
              {announcementSaving ? 'Publishing...' : 'Publish Announcement'}
            </button>
          </form>

          <section className="quiz-admin-list">
            <div className="section-header compact">
              <div>
                <p className="eyebrow">Announcement Feed</p>
                <h3>Recent announcements</h3>
              </div>
            </div>

            {announcementList.length ? (
              <div className="quiz-admin-items">
                {announcementList.map((item) => (
                  <article key={item._id} className="quiz-admin-item">
                    <div className="quiz-admin-item-body">
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                      <div className="quiz-admin-meta">
                        <span className="quiz-admin-meta-chip">{item.isActive !== false ? 'Active' : 'Hidden'}</span>
                        <span className="quiz-admin-meta-chip">{item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}</span>
                      </div>
                    </div>
                    <div className="quiz-admin-item-actions">
                      <button
                        type="button"
                        className={item.isActive !== false ? 'secondary-btn' : 'primary-btn'}
                        onClick={() => handleToggleAnnouncementStatus(item)}
                      >
                        {item.isActive !== false ? 'Hide' : 'Show'}
                      </button>
                      <button type="button" className="danger-btn" onClick={() => handleDeleteAnnouncement(item)}>
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-note">No announcements posted yet.</p>
            )}
          </section>
        </section>
      </main>
    </AppShell>
  );
}
