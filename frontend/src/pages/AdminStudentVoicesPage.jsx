import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import {
  createStudentVoiceAdmin,
  deleteStudentVoiceAdmin,
  fetchStudentVoicesAdmin,
  updateStudentVoiceAdmin
} from '../api';

const DEFAULT_FORM = {
  name: '',
  role: '',
  message: '',
  rating: 5,
  sortOrder: 0,
  active: true
};

export default function AdminStudentVoicesPage() {
  const navigate = useNavigate();
  const [voices, setVoices] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  async function loadVoices() {
    try {
      const response = await fetchStudentVoicesAdmin();
      setVoices(Array.isArray(response?.voices) ? response.voices : []);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load voices.' });
    }
  }

  useEffect(() => {
    loadVoices();
  }, []);

  const activeCount = useMemo(
    () => voices.filter((voice) => voice.active !== false).length,
    [voices]
  );

  async function handleSave(event) {
    event.preventDefault();
    const payload = {
      name: String(form.name || '').trim(),
      role: String(form.role || '').trim(),
      message: String(form.message || '').trim(),
      rating: Number(form.rating || 5),
      sortOrder: Number(form.sortOrder || 0),
      active: form.active !== false
    };

    if (!payload.name || !payload.message) {
      setBanner({ type: 'error', text: 'Name and message are required.' });
      return;
    }

    setIsSaving(true);
    try {
      const response = editingId
        ? await updateStudentVoiceAdmin(editingId, payload)
        : await createStudentVoiceAdmin(payload);
      setVoices(Array.isArray(response?.voices) ? response.voices : []);
      setForm(DEFAULT_FORM);
      setEditingId('');
      setBanner({ type: 'success', text: editingId ? 'Voice updated.' : 'Voice added.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to save voice.' });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(voiceId) {
    if (!voiceId) return;
    if (!window.confirm('Delete this student voice?')) return;
    try {
      const response = await deleteStudentVoiceAdmin(voiceId);
      setVoices(Array.isArray(response?.voices) ? response.voices : []);
      if (editingId === voiceId) {
        setEditingId('');
        setForm(DEFAULT_FORM);
      }
      setBanner({ type: 'success', text: 'Voice deleted.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Delete failed.' });
    }
  }

  function handleEdit(voice) {
    setEditingId(String(voice?._id || ''));
    setForm({
      name: String(voice?.name || ''),
      role: String(voice?.role || ''),
      message: String(voice?.message || ''),
      rating: Number(voice?.rating || 5),
      sortOrder: Number(voice?.sortOrder || 0),
      active: voice?.active !== false
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <AppShell
      title="Student Voices"
      subtitle="Manage reverse marquee testimonials shown on landing page"
      roleLabel="Admin"
      actions={(
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="secondary-btn" onClick={() => navigate('/admin')}>Back</button>
          <button type="button" className="secondary-btn" onClick={loadVoices}>Refresh</button>
        </div>
      )}
    >
      {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="section-header compact">
          <div>
            <h3>{editingId ? 'Edit Student Voice' : 'Add Student Voice'}</h3>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <span className="stat-pill">Total: {voices.length}</span>
            <span className="stat-pill">Active: {activeCount}</span>
          </div>
        </div>
        <form onSubmit={handleSave} className="material-upload-row" style={{ display: 'grid', gap: 10 }}>
          <input
            type="text"
            placeholder="Student name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
          <input
            type="text"
            placeholder="Role (e.g. Frontend Developer)"
            value={form.role}
            onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
          />
          <textarea
            placeholder="Voice message"
            rows={4}
            value={form.message}
            onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            <input
              type="number"
              min={1}
              max={5}
              value={form.rating}
              onChange={(event) => setForm((current) => ({ ...current, rating: Number(event.target.value || 5) }))}
              placeholder="Rating"
            />
            <input
              type="number"
              value={form.sortOrder}
              onChange={(event) => setForm((current) => ({ ...current, sortOrder: Number(event.target.value || 0) }))}
              placeholder="Sort order"
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.active !== false}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
              />
              Active
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="primary-btn" disabled={isSaving}>
              {isSaving ? 'Saving...' : editingId ? 'Update Voice' : 'Add Voice'}
            </button>
            {editingId ? (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setEditingId('');
                  setForm(DEFAULT_FORM);
                }}
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="card">
        <div className="section-header compact">
          <div>
            <h3>Current Student Voices</h3>
          </div>
        </div>
        {!voices.length ? (
          <p className="empty-note">No voices yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {voices.map((voice) => (
              <article key={voice._id} className="student-dashboard-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{voice.name}</strong>
                    <p className="subtitle" style={{ margin: '4px 0' }}>{voice.role || 'Student'}</p>
                    <p style={{ margin: 0 }}>{voice.message}</p>
                    <p className="subtitle" style={{ margin: '6px 0 0 0' }}>
                      Rating: {voice.rating} / 5 • Sort: {voice.sortOrder} • {voice.active ? 'Active' : 'Hidden'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <button type="button" className="secondary-btn" onClick={() => handleEdit(voice)}>Edit</button>
                    <button type="button" className="danger-btn" onClick={() => handleDelete(voice._id)}>Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
