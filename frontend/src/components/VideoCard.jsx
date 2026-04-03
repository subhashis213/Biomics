import { useEffect, useMemo, useRef, useState } from 'react';
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import MaterialManager from './MaterialManager';
import ProgressBar from './ProgressBar';
import VideoThumbnail from './VideoThumbnail';

let ytApiPromise = null;

function loadYouTubeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') previous();
      resolve(window.YT);
    };
  });

  return ytApiPromise;
}

function resolveYouTubeVideoId(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    let videoId = '';

    if (host === 'youtu.be') {
      videoId = parsed.pathname.slice(1);
    } else if (host.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/watch')) {
        videoId = parsed.searchParams.get('v') || '';
      } else if (parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.split('/embed/')[1] || '';
      } else if (parsed.pathname.startsWith('/shorts/')) {
        videoId = parsed.pathname.split('/shorts/')[1] || '';
      }
    }

    const safeId = String(videoId).split(/[?&#/]/)[0].trim();
    if (!safeId) return '';
    return safeId;
  } catch {
    return '';
  }
}

export default function VideoCard({
  video,
  adminMode,
  onDeleteVideo,
  onFileSelect,
  onUploadMaterial,
  onRemoveMaterial,
  uploadProgress,
  materialMessage,
  selectedFile,
  downloadProgress,
  onDownloadMaterial,
  onToggleFavorite,
  isFavorite = false,
  onToggleCompleted,
  isCompleted = false,
  disableDangerActions = false,
  undoItem = null,
  onUndo = null,
  undoItems = {},
  onUndoMaterial = null
}) {
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [savedProgressSec, setSavedProgressSec] = useState(0);
  const [isPlayerLoading, setIsPlayerLoading] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  // playerRef holds the YT.Player instance; playerDivRef is the stable DOM target
  const playerRef = useRef(null);
  const playerDivRef = useRef(null);
  const saveIntervalRef = useRef(null);
  // pendingSeekRef holds the seconds to seek/play once the player becomes ready
  const pendingSeekRef = useRef(null);

  const videoId = useMemo(() => resolveYouTubeVideoId(video?.url), [video?.url]);
  // Admin cards do not need embedded playback; keeping iframe players out of the
  // admin list prevents DOM race issues during optimistic delete/undo updates.
  const canPlayInline = !adminMode && Boolean(videoId);
  const storageKey = useMemo(() => `biomics:video-progress:${String(video?._id || '')}`, [video?._id]);

  function clearSaveInterval() {
    if (saveIntervalRef.current) {
      clearInterval(saveIntervalRef.current);
      saveIntervalRef.current = null;
    }
  }

  function persistCurrentPlayback() {
    try {
      const currentTime = Number(playerRef.current?.getCurrentTime?.() || 0);
      const safe = Math.max(0, Math.floor(currentTime));
      if (safe > 0) {
        idbSet(storageKey, safe).catch(() => {});
        setSavedProgressSec(safe);
      }
    } catch {
      // Ignore save errors to avoid interrupting playback.
    }
  }

  // Load saved progress from localStorage on mount / when video changes
  useEffect(() => {
    if (!storageKey) return;
    idbGet(storageKey)
      .then((value) => {
        const persisted = Number(value || 0);
        setSavedProgressSec(Number.isFinite(persisted) && persisted > 0 ? Math.floor(persisted) : 0);
      })
      .catch(() => setSavedProgressSec(0));
  }, [storageKey]);

  // Initialize YT.Player ONCE on a stable DOM target.
  // The player is never destroyed on open/close — only on unmount or videoId change.
  useEffect(() => {
    if (!canPlayInline) return undefined;

    // playerDivRef.current is always mounted (rendered unconditionally when canPlayInline).
    // We cannot call this effect until the ref is populated; it will be on the first render.
    let cancelled = false;
    setIsPlayerLoading(true);
    setIsPlayerReady(false);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !YT?.Player || !playerDivRef.current) return;

        // Create a fresh inner div for YouTube to replace with its iframe.
        // playerDivRef.current stays as a stable React-owned container — never
        // touched by YouTube — so React's virtual DOM stays in sync with the real DOM.
        const ytTarget = document.createElement('div');
        playerDivRef.current.appendChild(ytTarget);

        playerRef.current = new YT.Player(ytTarget, {
          videoId,
          playerVars: { rel: 0, modestbranding: 1, autoplay: 0 },
          events: {
            onReady: () => {
              if (cancelled) return;
              setIsPlayerLoading(false);
              setIsPlayerReady(true);
              // If the user already clicked watch/resume before the player was ready, honour it now.
              if (pendingSeekRef.current !== null) {
                const sec = pendingSeekRef.current;
                pendingSeekRef.current = null;
                try {
                  playerRef.current?.seekTo(sec, true);
                  playerRef.current?.playVideo();
                } catch { /* ignore */ }
              }
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const state = event?.data;
              const YTState = window.YT?.PlayerState || {};

              if (state === YTState.PLAYING) {
                clearSaveInterval();
                saveIntervalRef.current = setInterval(persistCurrentPlayback, 3000);
              }

              if (state === YTState.PAUSED || state === YTState.BUFFERING) {
                persistCurrentPlayback();
              }

              if (state === YTState.ENDED) {
                clearSaveInterval();
                idbDel(storageKey).catch(() => {});
                setSavedProgressSec(0);
              }
            }
          }
        });
      })
      .catch(() => {
        if (!cancelled) setIsPlayerLoading(false);
      });

    return () => {
      cancelled = true;
      clearSaveInterval();
      persistCurrentPlayback();
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }
      // Wipe the container so no stale iframe node remains for the next mount.
      if (playerDivRef.current) {
        try { playerDivRef.current.innerHTML = ''; } catch { /* ignore */ }
      }
      setIsPlayerReady(false);
      setIsPlayerLoading(false);
    };
    // Only recreate the player when the actual video changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlayInline, videoId]);

  // On component unmount, persist and clean up (safety net).
  useEffect(() => {
    return () => {
      clearSaveInterval();
      persistCurrentPlayback();
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }
      if (playerDivRef.current) {
        try { playerDivRef.current.innerHTML = ''; } catch { /* ignore */ }
      }
    };
  }, []);

  function playFrom(sec) {
    if (!isPlayerReady || !playerRef.current) {
      // Player not ready yet — store for deferred play once onReady fires.
      pendingSeekRef.current = sec;
      return;
    }
    try {
      playerRef.current.seekTo(sec, true);
      playerRef.current.playVideo();
    } catch { /* ignore */ }
  }

  function handleWatchResume() {
    const resumeFrom = savedProgressSec > 3 ? savedProgressSec : 0;
    setIsPlayerOpen(true);
    playFrom(resumeFrom);
  }

  function handleStartOver() {
    idbDel(storageKey).catch(() => {});
    setSavedProgressSec(0);
    setIsPlayerOpen(true);
    playFrom(0);
  }

  function handleHideVideo() {
    // Pause and save current position; keep player alive in the DOM.
    clearSaveInterval();
    persistCurrentPlayback();
    if (isPlayerReady && playerRef.current) {
      try { playerRef.current.pauseVideo(); } catch { /* ignore */ }
    }
    setIsPlayerOpen(false);
  }

  return (
    <article className={`video-card ${adminMode ? 'video-card-admin' : ''}`}>
      <VideoThumbnail url={video.url} title={video.title} />
      <div className="video-card-body">
        <h3>{video.title}</h3>
        <div className="video-tags">
          <span className="video-course-tag">{video.category || 'General'}</span>
          {video.module && <span className="video-module-tag">📚 {video.module}</span>}
        </div>
        <p>{video.description || 'No description added yet.'}</p>
        <div className="video-actions-row">
          {canPlayInline ? (
            <>
              <button type="button" className="link-btn" onClick={isPlayerOpen ? handleHideVideo : handleWatchResume}>
                {isPlayerOpen ? 'Hide Video' : (savedProgressSec > 3 ? `Resume (${Math.floor(savedProgressSec / 60)}:${String(savedProgressSec % 60).padStart(2, '0')})` : 'Watch Video')}
              </button>
              <button type="button" className="secondary-btn" onClick={handleStartOver}>
                Start Over
              </button>
            </>
          ) : (
            <a className="link-btn" href={video.url} target="_blank" rel="noreferrer">
              Open Video
            </a>
          )}
          {!adminMode ? (
            <>
              <button type="button" className={`secondary-btn icon-pill ${isFavorite ? 'active' : ''}`} onClick={() => onToggleFavorite?.(video._id)}>
                {isFavorite ? '★ Saved' : '☆ Save'}
              </button>
              <button type="button" className={`secondary-btn icon-pill ${isCompleted ? 'active' : ''}`} onClick={() => onToggleCompleted?.(video._id, !isCompleted)}>
                {isCompleted ? '✓ Completed' : 'Mark Complete'}
              </button>
            </>
          ) : null}
        </div>

        {/* Player shell is always in the DOM when canPlayInline to avoid YT.Player remount issues.
             The CSS class video-player-shell--hidden hides it visually and pauses interaction. */}
        {canPlayInline ? (
          <div className={`video-player-shell${isPlayerOpen ? '' : ' video-player-shell--hidden'}`}>
            {isPlayerLoading ? <div className="video-player-loading">Loading player...</div> : null}
            <div ref={playerDivRef} className="video-player-frame" />
          </div>
        ) : null}

        <span className="timestamp">Uploaded {new Date(video.uploadedAt).toLocaleString()}</span>

        {adminMode ? (
          <>
            <MaterialManager
              video={video}
              progress={uploadProgress}
              message={materialMessage}
              selectedFile={selectedFile}
              onFileSelect={onFileSelect}
              onUpload={onUploadMaterial}
              onRemove={onRemoveMaterial}
              disableRemove={disableDangerActions}
              undoItems={undoItems}
              onUndoMaterial={onUndoMaterial}
            />
            {undoItem ? (
              <div className="video-delete-undo">
                <span className="undo-message">{undoItem.remainingMs > 0 ? Math.ceil(undoItem.remainingMs / 1000) : '0'}s - {undoItem.message}</span>
                <button type="button" className="secondary-btn" onClick={onUndo}>
                  Undo
                </button>
              </div>
            ) : (
              <button type="button" className="danger-btn" onClick={() => onDeleteVideo(video._id)} disabled={disableDangerActions}>
                Delete video
              </button>
            )}
          </>
        ) : (
          <section className="materials-panel compact">
            <div className="panel-heading-row">
              <h4>Study Materials</h4>
            </div>
            {video.materials?.length ? (
              video.materials.map((material) => (
                <div className="download-item" key={material.filename}>
                  <button type="button" className="download-btn" onClick={() => onDownloadMaterial(material)}>
                    Download {material.name}
                  </button>
                  {typeof downloadProgress?.[material.filename] === 'number' ? (
                    <ProgressBar percent={downloadProgress[material.filename]} />
                  ) : null}
                </div>
              ))
            ) : (
              <p className="empty-note">No materials available for this lecture.</p>
            )}
          </section>
        )}
      </div>
    </article>
  );
}
