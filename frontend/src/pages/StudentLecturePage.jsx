import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FinalWorkingVideoCard from '../components/FinalWorkingVideoCard';
import { downloadMaterial } from '../api';
import { useCourseData } from '../hooks/useCourseData';

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeId(value) {
  return String(value || '');
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value || '');
  } catch {
    return String(value || '');
  }
}

export default function StudentLecturePage() {
  const navigate = useNavigate();
  const { courseName, moduleName } = useParams();
  const exitTimerRef = useRef(null);

  const decodedCourseName = normalizeText(safeDecode(courseName) || 'General');
  const decodedModuleName = normalizeText(safeDecode(moduleName) || 'General');

  const {
    videos,
    access,
    favoriteIds,
    completedIds,
    isLoading,
    loadError,
    toggleFavorite,
    toggleCompleted
  } = useCourseData();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('latest');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({});
  const [banner, setBanner] = useState(null);
  const [isExiting, setIsExiting] = useState(false);
  const [isFloatingBackVisible, setIsFloatingBackVisible] = useState(true);

  const moduleAccess = access?.moduleAccess?.[decodedModuleName] || null;
  const moduleLocked = Boolean(moduleAccess?.purchaseRequired && !moduleAccess?.unlocked);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let previousY = window.scrollY;
    let ticking = false;

    function handleScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const scrollingDown = currentY > previousY + 6;
        const scrollingUp = currentY < previousY - 6;

        if (currentY < 120 || scrollingUp) {
          setIsFloatingBackVisible(true);
        } else if (scrollingDown) {
          setIsFloatingBackVisible(false);
        }

        previousY = currentY;
        ticking = false;
      });
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  function handleBackToDashboard() {
    if (isExiting) return;
    setIsExiting(true);
    exitTimerRef.current = window.setTimeout(() => {
      navigate('/student', {
        state: {
          restoreModule: {
            name: decodedModuleName,
            category: decodedCourseName
          }
        }
      });
    }, 320);
  }

  const filteredVideos = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return videos
      .filter((video) => {
        const sameCourse = normalizeText(video?.category) === decodedCourseName;
        const sameModule = normalizeText(video?.module || 'General') === decodedModuleName;
        if (!sameCourse || !sameModule) return false;
        if (showSavedOnly && !favoriteIds.has(normalizeId(video?._id))) return false;
        if (!query) return true;
        const haystack = `${video?.title || ''} ${video?.description || ''}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => {
        if (sortBy === 'title') return (a?.title || '').localeCompare(b?.title || '');
        if (sortBy === 'oldest') return new Date(a?.uploadedAt) - new Date(b?.uploadedAt);
        return new Date(b?.uploadedAt) - new Date(a?.uploadedAt);
      });
  }, [videos, decodedCourseName, decodedModuleName, showSavedOnly, favoriteIds, searchQuery, sortBy]);

  async function handleDownload(material) {
    setDownloadProgress((current) => ({ ...current, [material.filename]: 0 }));
    try {
      await downloadMaterial(
        material.videoId || material._videoId || material.video || material.parentVideoId,
        material.filename,
        material.name,
        (percent) => {
          setDownloadProgress((current) => ({ ...current, [material.filename]: percent }));
        }
      );
      setBanner({ type: 'success', text: `Downloaded ${material.name}.` });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Download failed.' });
    }
  }

  return (
    <main className={`lecture-page lecture-enter page-exit-transition${isExiting ? ' is-exiting' : ''}`}>
      <header className="lecture-page-hero lecture-enter-stage-1">
        <div className="lecture-page-hero-left">
          <p className="eyebrow">Lecture Workspace</p>
          <h1>{decodedModuleName}</h1>
          <p className="lecture-page-subtitle">{decodedCourseName} • Video Library</p>
        </div>
        <div className="lecture-page-hero-actions">
          <button type="button" className="secondary-btn" onClick={handleBackToDashboard} disabled={isExiting}>
            ← Back To Module Sections
          </button>
          <span className="lecture-total-chip">{filteredVideos.length} lecture{filteredVideos.length === 1 ? '' : 's'}</span>
        </div>
      </header>

      {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}
      {loadError ? <p className="inline-message error">{loadError.message || 'Failed to load lectures.'}</p> : null}

      {moduleLocked ? (
        <section className="lecture-locked-card lecture-enter-stage-2">
          <h3>Module access is locked</h3>
          <p>Unlock this module from dashboard to view all lecture videos.</p>
          <button type="button" className="primary-btn" onClick={handleBackToDashboard} disabled={isExiting}>
            Go Back
          </button>
        </section>
      ) : (
        <>
          <section className="lecture-tools-panel lecture-enter-stage-2">
            <label>
              Search lectures
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by lecture title or description"
              />
            </label>
            <label>
              Sort
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="latest">Latest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A-Z</option>
              </select>
            </label>
            <button
              type="button"
              className={`secondary-btn ${showSavedOnly ? 'active' : ''}`}
              onClick={() => setShowSavedOnly((current) => !current)}
            >
              {showSavedOnly ? 'Showing Saved Only' : 'Filter Saved Only'}
            </button>
          </section>

          {isLoading ? (
            <div className="video-grid">
              {Array.from({ length: 4 }).map((_, index) => (
                <article key={`lecture-skeleton-${index}`} className="video-card skeleton-card">
                  <div className="skeleton-box" />
                  <div className="video-card-body">
                    <div className="skeleton-line large" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line" />
                  </div>
                </article>
              ))}
            </div>
          ) : filteredVideos.length ? (
            <section className="lecture-video-stage lecture-enter-stage-3">
              <div className="compact-premium-video-grid">
                {filteredVideos.map((video) => (
                  <FinalWorkingVideoCard
                    key={video._id}
                    video={video}
                    adminMode={false}
                    downloadProgress={downloadProgress}
                    onDownloadMaterial={handleDownload}
                    onToggleFavorite={toggleFavorite}
                    isFavorite={favoriteIds.has(normalizeId(video._id))}
                    onToggleCompleted={toggleCompleted}
                    isCompleted={completedIds.has(normalizeId(video._id))}
                  />
                ))}
              </div>
            </section>
          ) : (
            <p className="empty-state">No lecture videos found for this module.</p>
          )}
        </>
      )}

      <button
        type="button"
        className={`lecture-floating-back${isFloatingBackVisible ? '' : ' is-hidden'}`}
        onClick={handleBackToDashboard}
        disabled={isExiting}
        aria-label="Go to previous page"
      >
        ← Previous Page
      </button>
    </main>
  );
}
