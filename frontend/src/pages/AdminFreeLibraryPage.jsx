import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import {
  deleteFreeStudyResource,
  fetchFreeStudyAdminCourses,
  fetchFreeStudyAdminLibrary,
  uploadFreeStudyResource
} from '../api';

const TYPE_OPTIONS = [
  { value: 'book', label: 'Book' },
  { value: 'material', label: 'Study material' },
  { value: 'job-notes', label: 'Job notes' }
];

export default function AdminFreeLibraryPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courseName, setCourseName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [resourceType, setResourceType] = useState('material');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [courseRes, libraryRes] = await Promise.all([
        fetchFreeStudyAdminCourses(),
        fetchFreeStudyAdminLibrary()
      ]);
      setCourses(courseRes.courses || []);
      setGroups(libraryRes.courses || []);
      if (!courseName && courseRes.courses?.length) {
        setCourseName(courseRes.courses[0].courseName);
      }
      setMessage(null);
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Failed to load library.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleUpload(event) {
    event.preventDefault();
    if (!file || !courseName.trim() || !title.trim()) {
      setMessage({ type: 'error', text: 'Course, title, and file are required.' });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('courseName', courseName.trim());
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('resourceType', resourceType);
      await uploadFreeStudyResource(formData);
      setTitle('');
      setDescription('');
      setFile(null);
      setMessage({ type: 'success', text: 'Free study resource uploaded.' });
      load();
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Upload failed.' });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id, label) {
    if (!window.confirm(`Delete "${label}"?`)) return;
    try {
      await deleteFreeStudyResource(id);
      load();
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Delete failed.' });
    }
  }

  return (
    <AppShell
      title="Free Study Library"
      subtitle="Upload course-wise books and materials — free for all students"
      actions={(
        <button type="button" className="secondary-btn" onClick={() => navigate(-1)}>← Back</button>
      )}
    >
      <main className="admin-workspace-page">
        {message ? <p className={`banner ${message.type}`}>{message.text}</p> : null}

        <section className="card quiz-builder-panel" style={{ marginBottom: 20 }}>
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Upload</p>
              <h2>Add free book / material</h2>
            </div>
          </div>
          <form onSubmit={handleUpload} className="quiz-builder-form">
            <label className="field">
              <span>Course</span>
              <select value={courseName} onChange={(e) => setCourseName(e.target.value)}>
                {courses.map((course) => (
                  <option key={course.courseName} value={course.courseName}>{course.courseName}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resource title" />
            </label>
            <label className="field">
              <span>Description</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional short note" />
            </label>
            <label className="field">
              <span>Type</span>
              <select value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>File (PDF / EPUB / Word)</span>
              <input type="file" accept=".pdf,.epub,.doc,.docx,.ppt,.pptx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <button type="submit" className="primary-btn" disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload free resource'}
            </button>
          </form>
        </section>

        {loading ? <p className="empty-note">Loading library…</p> : null}
        {groups.map((group) => (
          <section key={group.courseName} className="card" style={{ marginBottom: 16 }}>
            <h3>{group.courseName}</h3>
            {(group.items || []).map((item) => (
              <div key={item._id} className="study-material-card card" style={{ marginTop: 10 }}>
                <div className="smc-info">
                  <h4>{item.title}</h4>
                  <p className="smc-meta">{item.resourceType} · {item.isActive === false ? 'Hidden' : 'Live'}</p>
                </div>
                <div className="smc-actions">
                  <button type="button" className="danger-btn" onClick={() => handleDelete(item._id, item.title)}>Delete</button>
                </div>
              </div>
            ))}
          </section>
        ))}
      </main>
    </AppShell>
  );
}
