import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { fetchFreeStudyLibrary, freeStudyDownloadUrl } from '../api';
import { getToken } from '../session';
import './StudentFreeLibraryPage.css';

function typeLabel(type) {
  if (type === 'book') return 'Book';
  if (type === 'job-notes') return 'Job notes';
  return 'Material';
}

export default function StudentFreeLibraryPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState('');

  useEffect(() => {
    let mounted = true;
    fetchFreeStudyLibrary()
      .then((data) => {
        if (!mounted) return;
        setCourses(data.courses || []);
      })
      .catch((err) => {
        if (!mounted) setError(err.message || 'Failed to load free library.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const totalCount = useMemo(
    () => courses.reduce((sum, group) => sum + (group.items?.length || 0), 0),
    [courses]
  );

  async function handleDownload(item) {
    setDownloadingId(item._id);
    setError('');
    try {
      const token = getToken();
      const response = await fetch(freeStudyDownloadUrl(item._id), {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Download failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.originalName || item.title || 'study-material.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Download failed.');
    } finally {
      setDownloadingId('');
    }
  }

  return (
    <AppShell
      title="Free Study Library"
      subtitle="Books, notes, and job materials — 100% free, organized by course"
      actions={(
        <button type="button" className="secondary-btn" onClick={() => navigate(-1)}>← Back</button>
      )}
    >
      <main className="admin-workspace-page free-library-page">
        {loading ? <p className="empty-note">Loading free library…</p> : null}
        {error ? <p className="banner error">{error}</p> : null}
        {!loading ? (
          <p className="subtitle">{totalCount} free file{totalCount === 1 ? '' : 's'} available</p>
        ) : null}

        {courses.map((group) => (
          <section key={group.courseName} className="free-library-course card">
            <div className="section-header compact">
              <div>
                <p className="eyebrow">Course</p>
                <h2>{group.courseName}</h2>
              </div>
            </div>
            <ul className="free-library-list">
              {(group.items || []).map((item) => (
                <li key={item._id} className="free-library-item">
                  <span className="free-library-item-icon" aria-hidden="true">📚</span>
                  <div className="free-library-item-body">
                    <h4>{item.title}</h4>
                    <p className="free-library-item-meta">{typeLabel(item.resourceType)} · Free for all</p>
                    {item.description ? <p className="free-library-item-desc">{item.description}</p> : null}
                  </div>
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={downloadingId === item._id}
                    onClick={() => handleDownload(item)}
                  >
                    {downloadingId === item._id ? 'Downloading…' : 'Download'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {!loading && !courses.length ? (
          <p className="empty-note">No free materials uploaded yet.</p>
        ) : null}
      </main>
    </AppShell>
  );
}
