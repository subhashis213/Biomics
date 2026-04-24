import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { requestJson, uploadMaterial, fetchCoursesAdmin } from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import VideoCard from '../components/VideoCard';
import { MAX_MATERIAL_MB } from '../constants';
import useAutoDismissMessage from '../hooks/useAutoDismissMessage';

function getInitialCourse(search) {
  const params = new URLSearchParams(search || '');
  const raw = String(params.get('course') || '').trim();
  return raw || 'All';
}

function normalizeLibraryLabel(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function sortLibraryLabels(a, b) {
  const first = String(a || '').trim().toLowerCase();
  const second = String(b || '').trim().toLowerCase();
  if (first === second) return 0;
  if (first.includes('general')) return 1;
  if (second.includes('general')) return -1;
  return first.localeCompare(second);
}

export default function AdminContentLibraryPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [banner, setBanner] = useState(null);
  const [activeCourse, setActiveCourse] = useState(() => getInitialCourse(location.search));
  const [courses, setCourses] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleInput, setModuleInput] = useState('');
  const [moduleQuery, setModuleQuery] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [topicQuery, setTopicQuery] = useState('');
  const [uploadFiles, setUploadFiles] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});
  const [materialMessages, setMaterialMessages] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null); // { type: 'video'|'material', videoId, label, material? }

  useAutoDismissMessage(banner, setBanner);

  useEffect(() => {
    if (!pendingDelete) return undefined;
    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyLeft = body.style.left;
    const prevBodyRight = body.style.right;
    const prevBodyWidth = body.style.width;
    const prevBodyTouchAction = body.style.touchAction;
    const prevHtmlOverflow = html.style.overflow;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    html.style.overflow = 'hidden';
    return () => {
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.left = prevBodyLeft;
      body.style.right = prevBodyRight;
      body.style.width = prevBodyWidth;
      body.style.touchAction = prevBodyTouchAction;
      html.style.overflow = prevHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [pendingDelete]);

  useEffect(() => {
    let ignore = false;

    async function loadVideos() {
      setLoading(true);
      setErrorText('');
      try {
        const result = await requestJson('/videos');
        if (!ignore) {
          setVideos(Array.isArray(result) ? result : []);
        }
      } catch (error) {
        if (!ignore) {
          setErrorText(error.message || 'Failed to load uploaded content.');
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadVideos();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    setActiveCourse(getInitialCourse(location.search));
  }, [location.search]);

  useEffect(() => {
    let ignore = false;
    (async function loadCourses() {
      try {
        const res = await fetchCoursesAdmin();
        if (ignore) return;
        const courseList = Array.isArray(res?.courses) ? res.courses : [];
        setCourses(courseList);
        const params = new URLSearchParams(location.search);
        const raw = String(params.get('course') || '').trim();
        if (raw && courseList.some((c) => (c.name || c) === raw)) {
          setActiveCourse(raw);
        }
      } catch {
        if (!ignore) setCourses([]);
      }
    })();
    return () => { ignore = true; };
  }, [location.search]);

  function applySearch() {
    setSearchQuery(String(searchInput || '').trim().toLowerCase());
    setModuleQuery(String(moduleInput || '').trim().toLowerCase());
    setTopicQuery(String(topicInput || '').trim().toLowerCase());
  }

  function clearSearch() {
    setSearchInput('');
    setSearchQuery('');
    setModuleInput('');
    setModuleQuery('');
    setTopicInput('');
    setTopicQuery('');
  }

  function handleCourseChange(nextCourse) {
    setActiveCourse(nextCourse);
    const nextPath = nextCourse === 'All'
      ? '/admin/content-library'
      : `/admin/content-library?course=${encodeURIComponent(nextCourse)}`;
    navigate(nextPath, { replace: true });
  }

  async function handleDeleteVideo(videoId) {
    const video = videos.find((v) => v._id === videoId);
    setPendingDelete({ type: 'video', videoId, label: video?.title || 'this lecture' });
  }

  async function executeDeleteVideo(videoId) {
    try {
      await requestJson(`/videos/${videoId}`, { method: 'DELETE' });
      setVideos((current) => current.filter((video) => video._id !== videoId));
      setBanner({ type: 'success', text: 'Lecture deleted successfully.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Could not delete lecture.' });
    }
  }

  async function handleUploadMaterial(videoId) {
    const selected = uploadFiles[videoId];
    if (!selected) {
      setMaterialMessages((current) => ({ ...current, [videoId]: { type: 'error', text: 'Please choose a PDF first.' } }));
      return;
    }

    const isPdf = String(selected.type || '').toLowerCase() === 'application/pdf'
      || String(selected.name || '').toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setMaterialMessages((current) => ({ ...current, [videoId]: { type: 'error', text: 'Only PDF files are allowed.' } }));
      return;
    }

    const maxBytes = MAX_MATERIAL_MB * 1024 * 1024;
    if (selected.size > maxBytes) {
      setMaterialMessages((current) => ({ ...current, [videoId]: { type: 'error', text: `File exceeds ${MAX_MATERIAL_MB}MB.` } }));
      return;
    }

    try {
      setUploadProgress((current) => ({ ...current, [videoId]: 0 }));
      const response = await uploadMaterial(videoId, selected, (percent) => {
        setUploadProgress((current) => ({ ...current, [videoId]: percent }));
      });

      setVideos((current) => current.map((video) => {
        if (video._id !== videoId) return video;
        return {
          ...video,
          materials: response.materials || video.materials || []
        };
      }));
      setUploadFiles((current) => ({ ...current, [videoId]: null }));
      setMaterialMessages((current) => ({ ...current, [videoId]: { type: 'success', text: 'Material uploaded successfully.' } }));
    } catch (error) {
      setMaterialMessages((current) => ({ ...current, [videoId]: { type: 'error', text: error.message || 'Upload failed.' } }));
    } finally {
      setUploadProgress((current) => ({ ...current, [videoId]: undefined }));
    }
  }

  async function handleRemoveMaterial(videoId, material) {
    const filename = material?.filename;
    if (!filename) return;
    setPendingDelete({ type: 'material', videoId, label: material?.name || filename, material });
  }

  async function executeRemoveMaterial(videoId, material) {
    const filename = material?.filename;
    if (!filename) return;
    try {
      const response = await requestJson(
        `/videos/${videoId}/materials/${encodeURIComponent(filename)}`,
        { method: 'DELETE' }
      );

      setVideos((current) => current.map((video) => {
        if (video._id !== videoId) return video;
        return {
          ...video,
          materials: response.materials || []
        };
      }));
      setMaterialMessages((current) => ({ ...current, [videoId]: { type: 'success', text: 'Material removed.' } }));
    } catch (error) {
      setMaterialMessages((current) => ({ ...current, [videoId]: { type: 'error', text: error.message || 'Could not remove material.' } }));
    }
  }

  const filteredVideos = useMemo(() => {
    return videos.filter((video) => {
      const matchesCourse = activeCourse === 'All' || (video.category || 'General') === activeCourse;
      if (!matchesCourse) return false;

      const title = String(video.title || '').toLowerCase();
      const moduleName = String(video.module || 'General').toLowerCase();
      const topicName = String(video.topic || 'General').toLowerCase();
      const matchesTitle = !searchQuery || title.includes(searchQuery);
      const matchesModule = !moduleQuery || moduleName.includes(moduleQuery);
      const matchesTopic = !topicQuery || topicName.includes(topicQuery);
      return matchesTitle && matchesModule && matchesTopic;
    });
  }, [videos, activeCourse, searchQuery, moduleQuery, topicQuery]);

  const groupedVideos = useMemo(() => {
    const moduleMap = new Map();

    filteredVideos.forEach((video) => {
      const moduleName = normalizeLibraryLabel(video.module, 'General Module');
      const topicName = normalizeLibraryLabel(video.topic, 'General Topic');
      const existingModule = moduleMap.get(moduleName) || {
        name: moduleName,
        videos: [],
        topicMap: new Map(),
        materialCount: 0
      };

      existingModule.videos.push(video);
      existingModule.materialCount += Array.isArray(video.materials) ? video.materials.length : 0;

      const existingTopic = existingModule.topicMap.get(topicName) || {
        name: topicName,
        videos: []
      };

      existingTopic.videos.push(video);
      existingModule.topicMap.set(topicName, existingTopic);
      moduleMap.set(moduleName, existingModule);
    });

    return Array.from(moduleMap.values())
      .map((entry) => ({
        name: entry.name,
        videos: entry.videos.sort((left, right) => String(left.title || '').localeCompare(String(right.title || ''))),
        materialCount: entry.materialCount,
        topics: Array.from(entry.topicMap.values())
          .map((topicEntry) => ({
            name: topicEntry.name,
            videos: topicEntry.videos.sort((left, right) => String(left.title || '').localeCompare(String(right.title || '')))
          }))
          .sort((left, right) => sortLibraryLabels(left.name, right.name))
      }))
      .sort((left, right) => sortLibraryLabels(left.name, right.name));
  }, [filteredVideos]);

  const topicCount = useMemo(() => groupedVideos.reduce((sum, moduleEntry) => sum + moduleEntry.topics.length, 0), [groupedVideos]);
  const materialCount = useMemo(
    () => filteredVideos.reduce((sum, video) => sum + (Array.isArray(video.materials) ? video.materials.length : 0), 0),
    [filteredVideos]
  );

  return (
    <AppShell
      title="Content Library"
      subtitle="Uploaded lectures in a dedicated admin page"
      roleLabel="Admin"
      showThemeSwitch
      actions={(
        <button
          type="button"
          className="secondary-btn"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>
      )}
    >
      <main className="admin-content-page">
        <header className="admin-content-hero">
          <div>
            <p className="eyebrow">Uploaded Video Content</p>
            <h2>{activeCourse === 'All' ? 'All Uploaded Lectures' : `${activeCourse} Uploaded Lectures`}</h2>
            <p className="subtitle">Clean module-wise and topic-wise workspace for reviewing uploaded lectures, PDFs and content structure.</p>
          </div>
          <div className="admin-content-stats">
            <StatCard label="Lectures" value={filteredVideos.length} />
            <StatCard label="Modules" value={groupedVideos.length} />
            <StatCard label="Topics" value={topicCount} />
            <StatCard label="Materials" value={materialCount} />
          </div>
        </header>

        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}
        {errorText ? <p className="inline-message error">{errorText}</p> : null}

        <section className="card admin-content-tools">
          <div className="admin-content-toolbar">
            <label>
              Course
              <select value={activeCourse} onChange={(event) => handleCourseChange(event.target.value)}>
                <option value="All">All courses</option>
                {(courses || []).map((c) => (
                  <option key={`course-${c.name || c}`} value={c.name || c}>{c.displayName || c.name || c}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="library-search-row" role="search" aria-label="Search uploaded lectures">
            <input
              type="text"
              className="library-search-input"
              placeholder="Search lecture title"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applySearch();
                }
              }}
            />
            <input
              type="text"
              className="library-search-input"
              placeholder="Filter by module"
              value={moduleInput}
              onChange={(event) => setModuleInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applySearch();
                }
              }}
            />
            <input
              type="text"
              className="library-search-input"
              placeholder="Filter by topic"
              value={topicInput}
              onChange={(event) => setTopicInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applySearch();
                }
              }}
            />
            <button type="button" className="primary-btn" onClick={applySearch}>Search</button>
            <button
              type="button"
              className="secondary-btn"
              onClick={clearSearch}
              disabled={!searchInput && !searchQuery && !moduleInput && !moduleQuery && !topicInput && !topicQuery}
            >
              Clear
            </button>
          </div>
        </section>

        {!loading && groupedVideos.length ? (
          <section className="card library-structure-overview">
            <div className="section-header content-library-focused-head" style={{ marginTop: 0 }}>
              <div>
                <p className="eyebrow">Structure Overview</p>
                <h2>Modules and topics at a glance</h2>
                <p className="subtitle">Each module block below opens into topic-wise lecture collections with lecture and material counts.</p>
              </div>
            </div>
            <div className="library-structure-grid">
              {groupedVideos.map((moduleEntry) => (
                <article key={`summary-${moduleEntry.name}`} className="library-structure-card">
                  <p className="eyebrow">Module</p>
                  <h3>{moduleEntry.name}</h3>
                  <div className="library-structure-stats">
                    <span>{moduleEntry.videos.length} {moduleEntry.videos.length === 1 ? 'lecture' : 'lectures'}</span>
                    <span>{moduleEntry.topics.length} {moduleEntry.topics.length === 1 ? 'topic' : 'topics'}</span>
                    <span>{moduleEntry.materialCount} {moduleEntry.materialCount === 1 ? 'PDF' : 'PDFs'}</span>
                  </div>
                  <p className="library-structure-topics">{moduleEntry.topics.map((topicEntry) => topicEntry.name).join(' • ')}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="admin-content-results">
          {loading ? <p className="empty-state">Loading uploaded lectures...</p> : null}
          {!loading && !filteredVideos.length ? (
            <p className="empty-state">
              {searchQuery || moduleQuery || topicQuery
                ? 'No lectures found for the selected filters.'
                : activeCourse === 'All'
                  ? 'No lectures uploaded yet.'
                  : `No lectures available for ${activeCourse}.`}
            </p>
          ) : null}

          <div className="library-module-sections">
            {groupedVideos.map((moduleEntry) => (
              <article key={`module-${moduleEntry.name}`} className="card library-module-section">
                <div className="library-module-header">
                  <div>
                    <p className="eyebrow">Module</p>
                    <h3>{moduleEntry.name}</h3>
                    <p className="subtitle">{moduleEntry.topics.length} {moduleEntry.topics.length === 1 ? 'topic section' : 'topic sections'} inside this module.</p>
                  </div>
                  <div className="library-module-meta">
                    <span className="library-module-pill">{moduleEntry.videos.length} lectures</span>
                    <span className="library-module-pill">{moduleEntry.materialCount} PDFs</span>
                  </div>
                </div>

                <div className="library-topic-grid">
                  {moduleEntry.topics.map((topicEntry) => (
                    <section key={`topic-${moduleEntry.name}-${topicEntry.name}`} className="library-topic-card">
                      <div className="library-topic-header">
                        <div>
                          <p className="eyebrow">Topic</p>
                          <h4>{topicEntry.name}</h4>
                          <p className="library-topic-description">Lectures grouped under this topic are shown below for quick admin review.</p>
                        </div>
                        <span className="library-topic-stat">{topicEntry.videos.length} {topicEntry.videos.length === 1 ? 'lecture' : 'lectures'}</span>
                      </div>

                      <div className="video-grid library-video-grid">
                        {topicEntry.videos.map((video) => (
                          <VideoCard
                            key={video._id}
                            video={video}
                            adminMode
                            selectedFile={uploadFiles[video._id]}
                            uploadProgress={uploadProgress[video._id]}
                            materialMessage={materialMessages[video._id]}
                            onFileSelect={(videoId, file) => setUploadFiles((current) => ({ ...current, [videoId]: file }))}
                            onUploadMaterial={handleUploadMaterial}
                            onRemoveMaterial={handleRemoveMaterial}
                            onDeleteVideo={handleDeleteVideo}
                            disableDangerActions={false}
                            undoItems={{}}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      {pendingDelete ? createPortal(
        <div
          className="confirm-modal-backdrop"
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) setPendingDelete(null); }}
        >
          <section className="confirm-modal card" role="dialog" aria-modal="true" aria-label="Confirm delete">
            <p className="eyebrow">Confirmation</p>
            <h2>
              {pendingDelete.type === 'video' ? 'Delete Lecture?' : 'Remove Material?'}
            </h2>
            <p className="subtitle">
              {pendingDelete.type === 'video'
                ? (<>Permanently delete <strong>{pendingDelete.label}</strong>? This action cannot be undone.</>)
                : (<>Remove material <strong>{pendingDelete.label}</strong>? This action cannot be undone.</>)}
            </p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={() => {
                  const snap = pendingDelete;
                  setPendingDelete(null);
                  if (snap.type === 'video') executeDeleteVideo(snap.videoId);
                  else executeRemoveMaterial(snap.videoId, snap.material);
                }}
              >
                {pendingDelete.type === 'video' ? 'Delete Lecture' : 'Remove Material'}
              </button>
            </div>
          </section>
        </div>
      , document.body) : null}
    </AppShell>
  );
}
