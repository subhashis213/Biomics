import { useEffect, useMemo, useRef, useState } from 'react';
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import MaterialManager from './MaterialManager';
import ProgressBar from './ProgressBar';
import VideoThumbnail from './VideoThumbnail';

let ytApiPromise = null;

function loadYouTubeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));
  if (window.YT?.Player) {
    console.log('YouTube API already loaded');
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) {
    console.log('YouTube API loading in progress');
    return ytApiPromise;
  }

  console.log('Loading YouTube API...');
  ytApiPromise = new Promise((resolve) => {
    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existingScript) {
      console.log('Creating YouTube API script tag');
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    } else {
      console.log('YouTube API script already exists');
    }

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      console.log('YouTube API ready callback triggered');
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

function getStateName(state) {
  const YTState = window.YT?.PlayerState || {};
  switch (state) {
    case YTState.UNSTARTED: return 'UNSTARTED';
    case YTState.ENDED: return 'ENDED';
    case YTState.PLAYING: return 'PLAYING';
    case YTState.PAUSED: return 'PAUSED';
    case YTState.BUFFERING: return 'BUFFERING';
    case YTState.CUED: return 'CUED';
    default: return `UNKNOWN(${state})`;
  }
}

function formatDuration(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export default function PremiumVideoCard({
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
  disableDangerActions = false
}) {
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [savedProgressSec, setSavedProgressSec] = useState(0);
  const [isPlayerLoading, setIsPlayerLoading] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(100);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const playerRef = useRef(null);
  const playerDivRef = useRef(null);
  const saveIntervalRef = useRef(null);
  const pendingSeekRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const progressRef = useRef(null);

  const videoId = useMemo(() => {
  const resolved = resolveYouTubeVideoId(video?.url);
  console.log('Resolved YouTube video ID:', { url: video?.url, videoId: resolved });
  return resolved;
}, [video?.url]);
  const canPlayInline = !adminMode && Boolean(videoId);
  const storageKey = useMemo(() => `biomics:video-progress:${String(video?._id || '')}`, [video?._id]);

  function clearSaveInterval() {
    if (saveIntervalRef.current) {
      clearInterval(saveIntervalRef.current);
      saveIntervalRef.current = null;
    }
  }

  function clearControlsTimeout() {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
  }

  function hideControlsDelayed() {
    clearControlsTimeout();
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }

  function persistCurrentPlayback() {
    try {
      const currentTime = Number(playerRef.current?.getCurrentTime?.() || 0);
      const safe = Math.max(0, Math.floor(currentTime));
      if (safe > 0) {
        idbSet(storageKey, safe).catch(() => {});
        setSavedProgressSec(safe);
        setCurrentTime(safe);
      }
    } catch {
      // Ignore save errors to avoid interrupting playback.
    }
  }

  useEffect(() => {
    if (!storageKey) return;
    idbGet(storageKey)
      .then((value) => {
        const persisted = Number(value || 0);
        setSavedProgressSec(Number.isFinite(persisted) && persisted > 0 ? Math.floor(persisted) : 0);
      })
      .catch(() => setSavedProgressSec(0));
  }, [storageKey]);

  useEffect(() => {
    if (!canPlayInline) return undefined;

    let cancelled = false;
    setIsPlayerLoading(true);
    setIsPlayerReady(false);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !YT?.Player || !playerDivRef.current) return;

        const ytTarget = document.createElement('div');
        playerDivRef.current.appendChild(ytTarget);

        playerRef.current = new YT.Player(ytTarget, {
          videoId,
          playerVars: { 
            rel: 0, 
            modestbranding: 1, 
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            iv_load_policy: 3,
            showinfo: 0
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              setIsPlayerLoading(false);
              setIsPlayerReady(true);
              setDuration(event.target.getDuration());
              
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
              
              console.log('YouTube state change:', { state, stateName: getStateName(state) });

              if (state === YTState.PLAYING) {
                setIsPlaying(true);
                clearSaveInterval();
                saveIntervalRef.current = setInterval(persistCurrentPlayback, 1000);
                hideControlsDelayed();
              }

              if (state === YTState.PAUSED || state === YTState.BUFFERING) {
                setIsPlaying(false);
                persistCurrentPlayback();
                setShowControls(true);
              }

              if (state === YTState.ENDED) {
                setIsPlaying(false);
                clearSaveInterval();
                idbDel(storageKey).catch(() => {});
                setSavedProgressSec(0);
                setCurrentTime(0);
                setShowControls(true);
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
      clearControlsTimeout();
      persistCurrentPlayback();
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }
      if (playerDivRef.current) {
        try { playerDivRef.current.innerHTML = ''; } catch { /* ignore */ }
      }
      setIsPlayerReady(false);
      setIsPlayerLoading(false);
    };
  }, [canPlayInline, videoId]);

  useEffect(() => {
    return () => {
      clearSaveInterval();
      clearControlsTimeout();
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
    setCurrentTime(0);
    setIsPlayerOpen(true);
    playFrom(0);
  }

  function handleHideVideo() {
    clearSaveInterval();
    clearControlsTimeout();
    persistCurrentPlayback();
    if (isPlayerReady && playerRef.current) {
      try { playerRef.current.pauseVideo(); } catch { /* ignore */ }
    }
    setIsPlayerOpen(false);
    setIsPlaying(false);
    setShowControls(true);
  }

  function handlePlayPause() {
    if (!isPlayerReady || !playerRef.current) {
      console.log('Play/Paused: Player not ready', { isPlayerReady, hasPlayerRef: !!playerRef.current });
      return;
    }
    
    console.log('Play/Paused: Current state', { isPlaying });
    
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  }

  function handleSeek(e) {
    if (!isPlayerReady || !playerRef.current) return;
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = percent * duration;
    playerRef.current.seekTo(seekTime, true);
    setCurrentTime(seekTime);
  }

  function handleVolumeChange(e) {
    if (!isPlayerReady || !playerRef.current) return;
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    playerRef.current.setVolume(newVolume);
  }

  function handleProgressClick(e) {
    if (!isPlayerOpen) {
      handleWatchResume();
      setTimeout(() => handleSeek(e), 100);
    } else {
      handleSeek(e);
    }
  }

  function handleMouseMove() {
    setShowControls(true);
    if (isPlaying) {
      hideControlsDelayed();
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <article className={`premium-video-card ${adminMode ? 'premium-video-card-admin' : ''} ${isPlaying && isPlayerOpen ? 'playing' : ''}`}>
      <div className="premium-video-container">
        {canPlayInline && isPlayerOpen ? (
          <div 
            className={`premium-video-player ${showControls ? 'show-controls' : 'hide-controls'}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={hideControlsDelayed}
          >
            {isPlayerLoading && (
              <div className="premium-player-loading">
                <div className="premium-loading-spinner"></div>
                <span>Loading premium player...</span>
              </div>
            )}
            
            <div ref={playerDivRef} className="premium-player-frame" />
            
            {isPlayerReady && (
              <div className="premium-controls-overlay">
                <div className="premium-progress-bar" onClick={handleProgressClick} ref={progressRef}>
                  <div 
                    className="premium-progress-fill" 
                    style={{ width: `${progressPercent}%` }}
                  >
                    <div className="premium-progress-handle"></div>
                  </div>
                  <div 
                    className="premium-progress-buffered"
                    style={{ width: `${(savedProgressSec / duration) * 100 || 0}%` }}
                  ></div>
                </div>
                
                <div className="premium-controls-main">
                  <div className="premium-controls-left">
                    <button 
                      className="premium-control-btn premium-play-btn"
                      onClick={handlePlayPause}
                    >
                      {isPlaying ? (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="4" width="4" height="16" />
                          <rect x="14" y="4" width="4" height="16" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      )}
                    </button>
                    
                    <div className="premium-time-display">
                      {formatDuration(currentTime)} / {formatDuration(duration)}
                    </div>
                  </div>
                  
                  <div className="premium-controls-right">
                    <div className="premium-volume-control">
                      <svg className="premium-volume-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                      </svg>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={volume}
                        onChange={handleVolumeChange}
                        className="premium-volume-slider"
                      />
                    </div>
                    
                    <button 
                      className="premium-control-btn"
                      onClick={toggleFullscreen}
                    >
                      {isFullscreen ? (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h3v-3z"/>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <VideoThumbnail url={video.url} title={video.title} />
        )}
      </div>

      <div className="premium-video-content">
        <div className="premium-video-header">
          <h3 className="premium-video-title">{video.title}</h3>
          <div className="premium-video-meta">
            <span className="premium-course-tag">{video.category || 'General'}</span>
            {video.module && <span className="premium-module-tag">📚 {video.module}</span>}
            {isCompleted && <span className="premium-completed-badge">✓ Completed</span>}
          </div>
        </div>
        
        <p className="premium-video-description">{video.description || 'No description added yet.'}</p>
        
        <div className="premium-video-stats">
          <div className="premium-stat-item">
            <span className="premium-stat-label">Progress</span>
            <div className="premium-progress-ring">
              <svg className="premium-progress-svg" viewBox="0 0 36 36">
                <path
                  className="premium-progress-bg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="premium-progress-fill"
                  strokeDasharray={`${progressPercent}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="premium-progress-text">{Math.round(progressPercent)}%</span>
            </div>
          </div>
          
          <div className="premium-stat-item">
            <span className="premium-stat-label">Duration</span>
            <span className="premium-stat-value">{formatDuration(duration || 0)}</span>
          </div>
        </div>

        <div className="premium-video-actions">
          {canPlayInline ? (
            <>
              <button 
                type="button" 
                className={`premium-btn premium-btn-primary ${isPlayerOpen ? 'premium-btn-active' : ''}`}
                onClick={isPlayerOpen ? handleHideVideo : handleWatchResume}
              >
                {isPlayerOpen ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                    Hide Video
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                    {savedProgressSec > 3 ? `Resume (${formatDuration(savedProgressSec)})` : 'Watch Video'}
                  </>
                )}
              </button>
              
              <button 
                type="button" 
                className="premium-btn premium-btn-secondary"
                onClick={handleStartOver}
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                </svg>
                Start Over
              </button>
            </>
          ) : (
            <a className="premium-btn premium-btn-primary" href={video.url} target="_blank" rel="noreferrer">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
              </svg>
              Open Video
            </a>
          )}
          
          {!adminMode ? (
            <>
              <button 
                type="button" 
                className={`premium-btn premium-btn-ghost ${isFavorite ? 'premium-btn-active' : ''}`} 
                onClick={() => onToggleFavorite?.(video._id)}
              >
                <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'}>
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
                {isFavorite ? 'Saved' : 'Save'}
              </button>
              
              <button 
                type="button" 
                className={`premium-btn premium-btn-ghost ${isCompleted ? 'premium-btn-active' : ''}`} 
                onClick={() => onToggleCompleted?.(video._id, !isCompleted)}
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                {isCompleted ? 'Completed' : 'Mark Complete'}
              </button>
            </>
          ) : null}
        </div>

        <span className="premium-timestamp">Uploaded {new Date(video.uploadedAt).toLocaleString()}</span>

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
            />
            <button 
              type="button" 
              className="premium-btn premium-btn-danger" 
              onClick={() => onDeleteVideo(video._id)} 
              disabled={disableDangerActions}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
              Delete Video
            </button>
          </>
        ) : (
          <section className="premium-materials-panel">
            <div className="premium-materials-header">
              <h4>Study Materials</h4>
              <div className="premium-materials-count">
                {video.materials?.length || 0} files
              </div>
            </div>
            {video.materials?.length ? (
              <div className="premium-materials-grid">
                {video.materials.map((material) => (
                  <div className="premium-material-item" key={material.filename}>
                    <div className="premium-material-icon">📄</div>
                    <div className="premium-material-info">
                      <span className="premium-material-name">{material.name}</span>
                      {typeof downloadProgress?.[material.filename] === 'number' ? (
                        <ProgressBar percent={downloadProgress[material.filename]} />
                      ) : null}
                    </div>
                    <button 
                      className="premium-download-btn"
                      onClick={() => onDownloadMaterial({ ...material, _videoId: video._id })}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="premium-materials-empty">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                </svg>
                <span>No materials available for this lecture.</span>
              </div>
            )}
          </section>
        )}
      </div>
    </article>
  );
}
