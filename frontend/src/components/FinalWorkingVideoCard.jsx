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

export default function FinalWorkingVideoCard({
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
  const [showMaterials, setShowMaterials] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const [playerInstanceKey, setPlayerInstanceKey] = useState(0);
  const [availableQualities, setAvailableQualities] = useState([]);
  const [currentQuality, setCurrentQuality] = useState('default');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null); // 'quality' | 'speed' | null
  const [hoverTime, setHoverTime] = useState(null);
  const [isVideoEnded, setIsVideoEnded] = useState(false);

  const playerRef = useRef(null);
  const playerContainerRef = useRef(null);
  const playerFrameWrapRef = useRef(null);
  const saveIntervalRef = useRef(null);
  const pendingSeekRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const progressRef = useRef(null);
  const qualityMenuRef = useRef(null);
  const speedMenuRef = useRef(null);
  const qualityPopupRef = useRef(null);
  const volPopupRef = useRef(null);
  const volHideTimeoutRef = useRef(null);

  const videoId = useMemo(() => resolveYouTubeVideoId(video?.url), [video?.url]);
  const canPlayInline = !adminMode && Boolean(videoId);
  const storageKey = useMemo(() => `biomics:video-progress:${String(video?._id || '')}`, [video?._id]);
  const qualityOptions = useMemo(() => {
    const normalized = Array.from(new Set((availableQualities || []).filter(Boolean)));
    // Sort highest quality first, keep 'default' (Auto) at end
    return [
      ...normalized.filter((q) => q !== 'default').sort((a, b) => {
        const QUALITY_ORDER = ['highres','hd2160','hd1440','hd1080','hd720','large','medium','small','tiny'];
        return QUALITY_ORDER.indexOf(a) - QUALITY_ORDER.indexOf(b);
      }),
      'default'
    ];
  }, [availableQualities]);

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
    if (!canPlayInline || !isPlayerOpen) return undefined;

    let cancelled = false;
    setIsPlayerLoading(true);
    setIsPlayerReady(false);
    setPlayerError('');

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !YT?.Player || !playerFrameWrapRef.current) return;

        console.log('Creating YouTube player for video:', videoId);

        // Create a fresh div for YouTube to replace with its iframe.
        // This keeps the mount point outside React's virtual DOM so React's
        // reconciler never encounters the replaced node (avoiding insertBefore errors).
        const ytDiv = document.createElement('div');
        ytDiv.style.cssText = 'width:100%;height:100%;';
        playerFrameWrapRef.current.appendChild(ytDiv);

        playerRef.current = new YT.Player(ytDiv, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: { 
            rel: 0, 
            modestbranding: 1, 
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            iv_load_policy: 3,
            showinfo: 0,
            fs: 0,
            cc_load_policy: 0,
            mute: 0,
            playsinline: 1,
            origin: typeof window !== 'undefined' ? window.location.origin : ''
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              console.log('YouTube player ready for video:', videoId);
              setIsPlayerLoading(false);
              setIsPlayerReady(true);
              setDuration(event.target.getDuration());
              let detectedQualities = [];
              try {
                const qualities = event.target.getAvailableQualityLevels?.();
                if (Array.isArray(qualities) && qualities.length) {
                  setAvailableQualities(qualities);
                  detectedQualities = qualities;
                }
              } catch { /* ignore */ }
              try {
                // Auto-set highest available quality
                const QUALITY_ORDER = ['highres','hd2160','hd1440','hd1080','hd720','large','medium','small','tiny'];
                const best = QUALITY_ORDER.find((q) => detectedQualities.includes(q));
                if (best) {
                  event.target.setPlaybackQuality(best);
                  if (typeof event.target.setPlaybackQualityRange === 'function') {
                    event.target.setPlaybackQualityRange(best, best);
                  }
                  setCurrentQuality(best);
                } else {
                  setCurrentQuality(event.target.getPlaybackQuality?.() || 'default');
                }
              } catch { /* ignore */ }
              try {
                setPlaybackSpeed(event.target.getPlaybackRate?.() || 1);
              } catch { /* ignore */ }

              // Explicitly unmute and set volume — required for async-initiated playback
              try { event.target.unMute(); } catch { /* ignore */ }
              try { event.target.setVolume(volume); } catch { /* ignore */ }
              
              if (pendingSeekRef.current !== null) {
                const sec = pendingSeekRef.current;
                pendingSeekRef.current = null;
                try {
                  playerRef.current?.seekTo(sec, true);
                  playerRef.current?.playVideo();
                  try { playerRef.current?.unMute(); } catch { /* ignore */ }
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
                setIsVideoEnded(false);
                clearSaveInterval();
                saveIntervalRef.current = setInterval(persistCurrentPlayback, 1000);
                hideControlsDelayed();
                // Re-enforce highest quality each time playback starts (YT may reset it)
                try {
                  const qualities = playerRef.current?.getAvailableQualityLevels?.() || [];
                  const QUALITY_ORDER = ['highres','hd2160','hd1440','hd1080','hd720','large','medium','small','tiny'];
                  const best = QUALITY_ORDER.find((q) => qualities.includes(q));
                  if (best) {
                    playerRef.current?.setPlaybackQuality(best);
                    if (typeof playerRef.current?.setPlaybackQualityRange === 'function') {
                      playerRef.current.setPlaybackQualityRange(best, best);
                    }
                    setAvailableQualities(qualities);
                    setCurrentQuality(best);
                  }
                } catch { /* ignore */ }
              }

              if (state === YTState.PAUSED || state === YTState.BUFFERING) {
                setIsPlaying(false);
                persistCurrentPlayback();
                setShowControls(true);
              }

              if (state === YTState.ENDED) {
                setIsPlaying(false);
                setIsVideoEnded(true);
                clearSaveInterval();
                idbDel(storageKey).catch(() => {});
                setSavedProgressSec(0);
                setCurrentTime(0);
                setShowControls(true);
              }
            },
            onError: (event) => {
              console.error('YouTube player error:', event);
              setIsPlayerLoading(false);
              setPlayerError('Video failed to load. Please reload video.');
            },
            onPlaybackQualityChange: (event) => {
              if (cancelled) return;
              setCurrentQuality(event.data || 'default');
            }
          }
        });
      })
      .catch((error) => {
        console.error('Failed to load YouTube API:', error);
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
      // Remove YouTube-injected content from the stable wrapper so React's
      // virtual DOM stays in sync with the real DOM on the next render.
      try {
        const wrap = playerFrameWrapRef.current;
        if (wrap) {
          while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
        }
      } catch { /* ignore */ }
      setIsPlayerReady(false);
      setIsPlayerLoading(false);
      setActiveMenu(null);
    };
  }, [canPlayInline, videoId, isPlayerOpen, playerInstanceKey]);

  useEffect(() => {
    return () => {
      clearSaveInterval();
      clearControlsTimeout();
      persistCurrentPlayback();
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      setIsFullscreen(Boolean(fsEl));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Keyboard shortcuts while player is open
  useEffect(() => {
    if (!isPlayerOpen || !isPlayerReady) return undefined;
    const handleKey = (e) => {
      if (document.activeElement?.tagName?.match(/^(INPUT|TEXTAREA|SELECT)$/i)) return;
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          if (isPlaying) { try { playerRef.current?.pauseVideo(); } catch {} }
          else { try { playerRef.current?.playVideo(); } catch {} }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          try { const t = playerRef.current?.getCurrentTime() || 0; playerRef.current?.seekTo(Math.max(0, t - 10), true); } catch {}
          break;
        case 'ArrowRight':
          e.preventDefault();
          try { const t = playerRef.current?.getCurrentTime() || 0; playerRef.current?.seekTo(t + 10, true); } catch {}
          break;
        case 'ArrowUp':
          e.preventDefault();
          { const v = Math.min(100, volume + 10); setVolume(v); try { playerRef.current?.setVolume(v); } catch {} }
          break;
        case 'ArrowDown':
          e.preventDefault();
          { const v = Math.max(0, volume - 10); setVolume(v); try { playerRef.current?.setVolume(v); } catch {} }
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          if (isMuted) { try { playerRef.current?.unMute(); playerRef.current?.setVolume(volume); } catch {} setIsMuted(false); }
          else { try { playerRef.current?.mute(); } catch {} setIsMuted(true); }
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          { const fsEl = document.fullscreenElement || document.webkitFullscreenElement; if (!fsEl) { const tgt = playerContainerRef.current || playerFrameWrapRef.current?.querySelector('iframe') || document.documentElement; if (tgt.requestFullscreen) tgt.requestFullscreen().catch(() => {}); else if (tgt.webkitRequestFullscreen) tgt.webkitRequestFullscreen(); } else { if (document.exitFullscreen) document.exitFullscreen().catch(() => {}); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } }
          break;
        case 'Escape':
          if (activeMenu) setActiveMenu(null);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isPlayerOpen, isPlayerReady, isPlaying, volume, isMuted, activeMenu]);

  // Close quality/speed popup on outside click
  useEffect(() => {
    if (!activeMenu) return undefined;
    function handleOutside(e) {
      const ref = activeMenu === 'quality' ? qualityMenuRef : speedMenuRef;
      if (ref.current && !ref.current.contains(e.target)) setActiveMenu(null);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [activeMenu]);

  // Scroll active quality item into view when quality popup opens
  useEffect(() => {
    if (activeMenu !== 'quality' || !qualityPopupRef.current) return;
    const activeItem = qualityPopupRef.current.querySelector('.vp-popup-item--on');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    } else {
      qualityPopupRef.current.scrollTop = 0;
    }
  }, [activeMenu]);

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
    setPlayerError('');
    setIsPlayerOpen(true);
    playFrom(resumeFrom);
  }

  function handleStartOver() {
    idbDel(storageKey).catch(() => {});
    setSavedProgressSec(0);
    setCurrentTime(0);
    setPlayerError('');
    setIsVideoEnded(false);
    setIsPlayerOpen(true);
    playFrom(0);
  }

  function handleReloadPlayer() {
    setPlayerError('');
    setIsPlayerReady(false);
    setIsPlayerLoading(true);
    setPlayerInstanceKey((current) => current + 1);
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
    setActiveMenu(null);
  }

  function handlePlayPause() {
    if (!isPlayerReady || !playerRef.current) return;
    
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  }

  function handleVolumeChange(e) {
    if (!isPlayerReady || !playerRef.current) return;
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    playerRef.current.setVolume(newVolume);
    if (newVolume <= 0) {
      try { playerRef.current.mute(); } catch { /* ignore */ }
      setIsMuted(true);
      return;
    }
    try { playerRef.current.unMute(); } catch { /* ignore */ }
    setIsMuted(false);
  }

  function updateVolFromPointer(e) {
    if (!isPlayerReady || !playerRef.current) return;
    const el = volPopupRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const usableTop = rect.top + 10;
    const usableHeight = rect.height - 20;
    const pct = Math.max(0, Math.min(100, Math.round((1 - (e.clientY - usableTop) / usableHeight) * 100)));
    setVolume(pct);
    try { playerRef.current.setVolume(pct); } catch { /* ignore */ }
    if (pct <= 0) { try { playerRef.current.mute(); } catch {} setIsMuted(true); }
    else { try { playerRef.current.unMute(); } catch {} setIsMuted(false); }
  }

  function handleVolPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    updateVolFromPointer(e);
  }

  function handleVolPointerMove(e) {
    if (!e.buttons) return;
    updateVolFromPointer(e);
  }

  function showVol() {
    clearTimeout(volHideTimeoutRef.current);
    setShowVolume(true);
  }

  function hideVol() {
    volHideTimeoutRef.current = setTimeout(() => setShowVolume(false), 180);
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
    if (!isPlayerReady || !playerRef.current) return;

    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fsEl) {
      const target = playerContainerRef.current || playerFrameWrapRef.current?.querySelector('iframe') || document.documentElement;
      if (target.requestFullscreen) {
        target.requestFullscreen().catch(() => {});
      } else if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen();
      }
      return;
    }

    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }

  const QUALITY_ORDER = ['highres','hd2160','hd1440','hd1080','hd720','large','medium','small','tiny','default'];
  const QUALITY_LABELS = { highres: '4K', hd2160: '4K', hd1440: '1440p', hd1080: '1080p', hd720: '720p', large: '480p', medium: '360p', small: '240p', tiny: '144p', default: 'Auto' };

  function handleSkip(secs) {
    if (!isPlayerReady || !playerRef.current) return;
    try {
      const current = playerRef.current.getCurrentTime() || 0;
      playerRef.current.seekTo(Math.max(0, current + secs), true);
    } catch { /* ignore */ }
  }

  function handleSpeedChange(speed) {
    if (!isPlayerReady || !playerRef.current) return;
    try { playerRef.current.setPlaybackRate(speed); } catch { /* ignore */ }
    setPlaybackSpeed(speed);
    setActiveMenu(null);
  }

  function handleQualityChange(quality) {
    if (!isPlayerReady || !playerRef.current) return;
    try {
      playerRef.current.setPlaybackQuality(quality);
      if (typeof playerRef.current.setPlaybackQualityRange === 'function') {
        playerRef.current.setPlaybackQualityRange(quality, quality);
      }
    } catch { /* ignore */ }
    setCurrentQuality(quality);
  }

  function toggleMute() {
    if (!isPlayerReady || !playerRef.current) return;
    try {
      if (isMuted) {
        playerRef.current.unMute();
        playerRef.current.setVolume(volume);
        setIsMuted(false);
      } else {
        playerRef.current.mute();
        setIsMuted(true);
      }
    } catch { /* ignore */ }
  }

  function handleProgressHover(e) {
    if (!duration) return;
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;
    const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    setHoverTime({ percent, time: formatDuration((percent / 100) * duration) });
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const shouldShowDetails = adminMode || showDetails;
  const isMiniMode = !adminMode && !showDetails;
  const watchButtonLabel = isPlayerOpen
    ? 'Hide Video'
    : (savedProgressSec > 3 ? `Resume (${formatDuration(savedProgressSec)})` : 'Watch Video');

  return (
    <article className={`compact-premium-video-card ${adminMode ? 'compact-premium-video-card-admin' : ''} ${isPlaying && isPlayerOpen ? 'playing' : ''}`}>
      {/* Thumbnail — clickable play overlay when player is closed */}
      {!isPlayerOpen && (
        <div className="cpv-thumb-wrap" onClick={canPlayInline ? handleWatchResume : undefined} role={canPlayInline ? 'button' : undefined} tabIndex={canPlayInline ? 0 : undefined} onKeyDown={canPlayInline ? (e) => e.key === 'Enter' && handleWatchResume() : undefined}>
          <VideoThumbnail url={video.url} title={video.title} />
          {canPlayInline && (
            <div className="cpv-thumb-overlay">
              <div className="cpv-play-circle">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </div>
              {savedProgressSec > 3 && (
                <span className="cpv-resume-badge">Resume {formatDuration(savedProgressSec)}</span>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Video Player - properly positioned and sized */}
      {canPlayInline && (
         <div
           ref={playerContainerRef}
           className={`compact-premium-video-player ${isPlayerOpen ? '' : 'compact-premium-video-player--hidden'} ${isFullscreen ? 'compact-premium-video-player--fullscreen' : ''}`}
             onMouseMove={handleMouseMove}
             onMouseLeave={() => isPlaying && hideControlsDelayed()}>
          {isPlayerLoading && (
            <div className="compact-premium-player-loading">
              <div className="compact-premium-loading-spinner"></div>
              <span>Loading video...</span>
            </div>
          )}
          
          {/* YouTube player container — stable wrapper; YT mounts inside programmatically */}
          <div
            ref={playerFrameWrapRef}
            className="compact-premium-player-frame"
          />

          {/* End-screen overlay — hides YT suggestions, provides replay */}
          {isVideoEnded && (
            <div className="vp-endscreen">
              <div className="vp-endscreen-inner">
                <div className="vp-endscreen-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13v4.5l3.5 2-.75 1.32L10 13V7h1z"/>
                  </svg>
                </div>
                <p className="vp-endscreen-title">Video Ended</p>
                <button
                  type="button"
                  className="vp-endscreen-replay"
                  onClick={handleStartOver}
                  aria-label="Replay video"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                  </svg>
                  Watch Again
                </button>
              </div>
            </div>
          )}

          {playerError ? (
            <div className="compact-premium-player-error">
              <span>{playerError}</span>
              <button type="button" className="compact-premium-btn compact-premium-btn-secondary" onClick={handleReloadPlayer}>
                Reload Video
              </button>
            </div>
          ) : null}
          
          {/* ── Custom video player controls ─────────────────── */}
          {isPlayerReady && (
            <div
              className={`vp-overlay${showControls ? '' : ' vp-overlay--out'}`}
              onTouchStart={() => { setShowControls(true); hideControlsDelayed(); }}
            >
              {/* Seekbar row */}
              <div className="vp-seekrow">
                {hoverTime !== null && (
                  <span
                    className="vp-seek-tip"
                    style={{ left: `clamp(18px, ${hoverTime.percent}%, calc(100% - 18px))` }}
                  >
                    {hoverTime.time}
                  </span>
                )}
                <div
                  className="vp-seekbar"
                  ref={progressRef}
                  onClick={handleProgressClick}
                  onMouseMove={handleProgressHover}
                  onMouseLeave={() => setHoverTime(null)}
                >
                  <div className="vp-seekbar-fill" style={{ width: `${progressPercent}%` }}>
                    <div className="vp-seekbar-dot" />
                  </div>
                </div>
              </div>

              {/* Controls row */}
              <div className="vp-row">

                {/* ── Left: skip-back, play, skip-forward, volume, time ── */}
                <div className="vp-group">
                  <button
                    type="button"
                    className="vp-btn vp-skip-btn"
                    onClick={() => handleSkip(-10)}
                    title="Rewind 10s (←)"
                    aria-label="Rewind 10 seconds"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                    </svg>
                    <span className="vp-skip-n">10</span>
                  </button>

                  <button
                    type="button"
                    className="vp-btn vp-play-btn"
                    onClick={handlePlayPause}
                    title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <rect x="6" y="4" width="4" height="16"/>
                        <rect x="14" y="4" width="4" height="16"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    )}
                  </button>

                  <button
                    type="button"
                    className="vp-btn vp-skip-btn vp-skip-fwd"
                    onClick={() => handleSkip(10)}
                    title="Forward 10s (→)"
                    aria-label="Forward 10 seconds"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v4l5-5-5-5v4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2z"/>
                    </svg>
                    <span className="vp-skip-n">10</span>
                  </button>

                  {/* Volume — vertical popup on hover */}
                  <div className="vp-vol-wrap" onMouseEnter={showVol} onMouseLeave={hideVol}>
                    <button
                      type="button"
                      className={`vp-btn${isMuted || volume === 0 ? ' vp-muted' : ''}`}
                      onClick={toggleMute}
                      title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                      aria-label={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted || volume === 0 ? (
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/>
                        </svg>
                      ) : volume < 50 ? (
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                        </svg>
                      )}
                    </button>
                    {/* Vertical volume slider — shown via React state with delayed hide */}
                    {showVolume && (
                      <div
                        ref={volPopupRef}
                        className="vp-vol-popup"
                        role="slider"
                        aria-label="Volume"
                        aria-valuenow={isMuted ? 0 : volume}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        onMouseEnter={showVol}
                        onMouseLeave={hideVol}
                        onPointerDown={handleVolPointerDown}
                        onPointerMove={handleVolPointerMove}
                      >
                        <div className="vp-vol-track" aria-hidden="true">
                          <div
                            className="vp-vol-fill"
                            style={{ height: `${isMuted ? 0 : volume}%` }}
                          />
                          <div
                            className="vp-vol-thumb"
                            style={{ bottom: `${isMuted ? 0 : volume}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Time */}
                  <span className="vp-time">
                    {formatDuration(currentTime)}
                    <span className="vp-dur"> / {formatDuration(duration)}</span>
                  </span>
                </div>

                {/* ── Right: quality, speed, fullscreen ── */}
                <div className="vp-group vp-group-r">

                  {/* Quality popup — always shown once player ready */}
                  {qualityOptions.length > 0 && (
                    <div className="vp-popup-wrap" ref={qualityMenuRef}>
                      <button
                        type="button"
                        className={`vp-pill${activeMenu === 'quality' ? ' vp-pill--on' : ''}`}
                        onClick={() => setActiveMenu((p) => (p === 'quality' ? null : 'quality'))}
                        aria-label="Video quality"
                        aria-expanded={activeMenu === 'quality'}
                        title="Video quality"
                      >
                        <span>{QUALITY_LABELS[currentQuality] || currentQuality}</span>
                        <svg viewBox="0 0 10 6" fill="currentColor" className="vp-caret" aria-hidden="true">
                          <path d="M0 0l5 6 5-6z"/>
                        </svg>
                      </button>
                      {activeMenu === 'quality' && (
                        <div className="vp-popup" role="menu" aria-label="Select quality" ref={qualityPopupRef}>
                          <div className="vp-popup-head">Quality</div>
                          {qualityOptions.map((q, i) => (
                            <button
                              key={q}
                              type="button"
                              role="menuitem"
                              className={`vp-popup-item${q === currentQuality ? ' vp-popup-item--on' : ''}`}
                              onClick={() => { handleQualityChange(q); setActiveMenu(null); }}
                            >
                              <span className="vp-popup-item-label">
                                {QUALITY_LABELS[q] || q}
                                {i === 0 && q !== 'default' && (
                                  <span className="vp-quality-best">Best</span>
                                )}
                              </span>
                              {q === currentQuality && (
                                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Speed popup */}
                  <div className="vp-popup-wrap" ref={speedMenuRef}>
                    <button
                      type="button"
                      className={`vp-pill${activeMenu === 'speed' ? ' vp-pill--on' : ''}`}
                      onClick={() => setActiveMenu((p) => (p === 'speed' ? null : 'speed'))}
                      aria-label="Playback speed"
                      aria-expanded={activeMenu === 'speed'}
                      title="Playback speed"
                    >
                      <span>{playbackSpeed === 1 ? '1×' : `${playbackSpeed}×`}</span>
                      <svg viewBox="0 0 10 6" fill="currentColor" className="vp-caret" aria-hidden="true">
                        <path d="M0 0l5 6 5-6z"/>
                      </svg>
                    </button>
                    {activeMenu === 'speed' && (
                      <div className="vp-popup" role="menu" aria-label="Select speed">
                        <div className="vp-popup-head">Speed</div>
                        {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => (
                          <button
                            key={s}
                            type="button"
                            role="menuitem"
                            className={`vp-popup-item${s === playbackSpeed ? ' vp-popup-item--on' : ''}`}
                            onClick={() => { handleSpeedChange(s); setActiveMenu(null); }}
                          >
                            {s === 1 ? 'Normal (1×)' : `${s}×`}
                            {s === playbackSpeed && (
                              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Fullscreen */}
                  <button
                    type="button"
                    className="vp-btn vp-fs-btn"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  >
                    {isFullscreen ? (
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="compact-premium-video-content">
        <div className="compact-premium-video-header">
          <h3 className="compact-premium-video-title">{video.title}</h3>
          <div className="compact-premium-video-meta">
            <span className="compact-premium-course-tag">{video.category || 'General'}</span>
            {video.module && <span className="compact-premium-module-tag">📚 {video.module}</span>}
            {isCompleted && <span className="compact-premium-completed-badge">✓ Completed</span>}
          </div>
        </div>
        
        {!adminMode && !isMiniMode ? (
          <button
            type="button"
            className="compact-premium-btn compact-premium-btn-details-toggle"
            onClick={() => setShowDetails((prev) => !prev)}
            aria-label={showDetails ? 'Hide details' : 'Show details'}
            title={showDetails ? 'Hide Details' : 'More Details'}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              {showDetails
                ? <path d="M7 14l5-5 5 5z" />
                : <path d="M7 10l5 5 5-5z" />}
            </svg>
            {showDetails ? 'Hide Details' : 'More Details'}
          </button>
        ) : null}

        {shouldShowDetails ? (
          <>
            <p className="compact-premium-video-description">{video.description || 'No description added yet.'}</p>
            
            <div className="compact-premium-video-stats">
              <div className="compact-premium-stat-item">
                <span className="compact-premium-stat-label">Progress</span>
                <div className="compact-premium-progress-ring">
                  <svg className="compact-premium-progress-svg" viewBox="0 0 36 36">
                    <path
                      className="compact-premium-progress-bg"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="compact-premium-progress-fill"
                      strokeDasharray={`${progressPercent}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <span className="compact-premium-progress-text">{Math.round(progressPercent)}%</span>
                </div>
              </div>
              
              <div className="compact-premium-stat-item">
                <span className="compact-premium-stat-label">Duration</span>
                <span className="compact-premium-stat-value">{formatDuration(duration || 0)}</span>
              </div>
            </div>

            <span className="compact-premium-timestamp">Uploaded {new Date(video.uploadedAt).toLocaleString()}</span>
          </>
        ) : null}

        {isMiniMode ? (
          <div className="compact-premium-mini-toolbar" role="toolbar" aria-label="Video quick actions">
            {canPlayInline ? (
              <button
                type="button"
                className={`compact-premium-btn compact-premium-btn-primary compact-premium-btn--icon-only compact-premium-mini-tool has-tooltip ${isPlayerOpen ? 'compact-premium-btn-active' : ''}`}
                onClick={isPlayerOpen ? handleHideVideo : handleWatchResume}
                aria-label={watchButtonLabel}
                title={watchButtonLabel}
                data-tooltip={watchButtonLabel}
              >
                {isPlayerOpen ? (
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
            ) : (
              <a
                className="compact-premium-btn compact-premium-btn-primary compact-premium-btn--icon-only compact-premium-mini-tool has-tooltip"
                href={video.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open video"
                title="Open Video"
                data-tooltip="Open Video"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 19H5V5h7V3H5c-1.11 0-1.99.9-1.99 2H4c-1.1 0-2 .9-2 2h16c1.1 0 2-.9 2-2v-7h-2V7h2V3z"/>
                </svg>
              </a>
            )}

            <button
              type="button"
              className="compact-premium-btn compact-premium-btn-secondary compact-premium-btn--icon-only compact-premium-mini-tool has-tooltip"
              onClick={handleStartOver}
              aria-label="Start over"
              title="Start Over"
              data-tooltip="Start Over"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 5a7 7 0 1 0 7 7h-2a5 5 0 1 1-5-5V5zm-1 0v4.5l3.5 2-.75 1.3L10 10.5V5h1z" />
              </svg>
            </button>

            <button
              type="button"
              className={`compact-premium-btn compact-premium-btn-ghost compact-premium-btn--icon-only compact-premium-mini-tool has-tooltip ${isFavorite ? 'compact-premium-btn-active' : ''}`}
              onClick={() => onToggleFavorite?.(video._id)}
              aria-label={isFavorite ? 'Saved' : 'Save'}
              title={isFavorite ? 'Saved' : 'Save'}
              data-tooltip={isFavorite ? 'Saved' : 'Save'}
            >
              <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={isFavorite ? '0' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
              </svg>
            </button>

            <button
              type="button"
              className={`compact-premium-btn compact-premium-btn-ghost compact-premium-btn--icon-only compact-premium-mini-tool has-tooltip ${isCompleted ? 'compact-premium-btn-active' : ''}`}
              onClick={() => onToggleCompleted?.(video._id, !isCompleted)}
              aria-label={isCompleted ? 'Completed' : 'Mark complete'}
              title={isCompleted ? 'Completed' : 'Mark Complete'}
              data-tooltip={isCompleted ? 'Completed' : 'Mark Complete'}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            </button>

            <button
              type="button"
              className={`compact-premium-btn compact-premium-btn-material-toggle compact-premium-btn--icon-only compact-premium-mini-tool has-tooltip ${showMaterials ? 'compact-premium-btn-active' : ''}`}
              onClick={() => setShowMaterials((prev) => !prev)}
              aria-label={showMaterials ? 'Hide study materials' : 'Show study materials'}
              title={showMaterials ? 'Hide Study Materials' : `Study Materials (${video.materials?.length || 0})`}
              data-tooltip={showMaterials ? 'Hide Study Materials' : `Study Materials (${video.materials?.length || 0})`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8z"/>
                <path d="M14 2v6h6" />
              </svg>
            </button>

            <button
              type="button"
              className="compact-premium-btn compact-premium-btn-details-toggle compact-premium-btn--icon-only compact-premium-mini-tool has-tooltip"
              onClick={() => setShowDetails(true)}
              aria-label="Show details"
              title="More Details"
              data-tooltip="More Details"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </button>
          </div>
        ) : (
        <div className="compact-premium-video-actions">
          <div className="compact-premium-video-actions-top">
            {canPlayInline ? (
              <>
                <button 
                  type="button" 
                  className={`compact-premium-btn compact-premium-btn-primary ${isPlayerOpen ? 'compact-premium-btn-active' : ''}`}
                  onClick={isPlayerOpen ? handleHideVideo : handleWatchResume}
                  aria-label={watchButtonLabel}
                  title={watchButtonLabel}
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
                  className="compact-premium-btn compact-premium-btn-secondary"
                  onClick={handleStartOver}
                  aria-label="Start over"
                  title="Start Over"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 5a7 7 0 1 0 7 7h-2a5 5 0 1 1-5-5V5zm-1 0v4.5l3.5 2-.75 1.3L10 10.5V5h1z" />
                  </svg>
                  Start Over
                </button>
              </>
            ) : (
              <a className="compact-premium-btn compact-premium-btn-primary" href={video.url} target="_blank" rel="noreferrer" aria-label="Open video" title="Open Video">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 19H5V5h7V3H5c-1.11 0-1.99.9-1.99 2H4c-1.1 0-2 .9-2 2h16c1.1 0 2-.9 2-2v-7h-2V7h2V3z"/>
                </svg>
                Open Video
              </a>
            )}
          </div>

          {!adminMode ? (
            <div className="compact-premium-video-actions-bottom">
              <button 
                type="button" 
                className={`compact-premium-btn compact-premium-btn-ghost ${isFavorite ? 'compact-premium-btn-active' : ''}`} 
                onClick={() => onToggleFavorite?.(video._id)}
                aria-label={isFavorite ? 'Saved' : 'Save'}
                title={isFavorite ? 'Saved' : 'Save'}
              >
                <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={isFavorite ? '0' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
                </svg>
                {isFavorite ? 'Saved' : 'Save'}
              </button>
              
              <button 
                type="button" 
                className={`compact-premium-btn compact-premium-btn-ghost ${isCompleted ? 'compact-premium-btn-active' : ''}`} 
                onClick={() => onToggleCompleted?.(video._id, !isCompleted)}
                aria-label={isCompleted ? 'Completed' : 'Mark complete'}
                title={isCompleted ? 'Completed' : 'Mark Complete'}
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                {isCompleted ? 'Completed' : 'Mark Complete'}
              </button>
            </div>
          ) : null}
        </div>
        )}

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
              className="compact-premium-btn compact-premium-btn-danger" 
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
          <>
            {!isMiniMode ? (
              <button
                type="button"
                className={`compact-premium-btn compact-premium-btn-material-toggle ${showMaterials ? 'compact-premium-btn-active' : ''}`}
                onClick={() => setShowMaterials((prev) => !prev)}
                aria-label={showMaterials ? 'Hide study materials' : 'Show study materials'}
                title={showMaterials ? 'Hide Study Materials' : `Study Materials (${video.materials?.length || 0})`}
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8z"/>
                  <path d="M14 2v6h6" />
                </svg>
                {showMaterials ? 'Hide Study Materials' : `Study Materials (${video.materials?.length || 0})`}
              </button>
            ) : null}

            {showMaterials ? (
              <section className="compact-premium-materials-panel">
                <div className="compact-premium-materials-header">
                  <h4>Study Materials</h4>
                  <div className="compact-premium-materials-count">
                    {video.materials?.length || 0} files
                  </div>
                </div>
                {video.materials?.length ? (
                  <div className="compact-premium-materials-grid">
                    {video.materials.map((material) => (
                      <div className="compact-premium-material-item" key={material.filename}>
                        <div className="compact-premium-material-icon">📄</div>
                        <div className="compact-premium-material-info">
                          <span className="compact-premium-material-name">{material.name}</span>
                          {typeof downloadProgress?.[material.filename] === 'number' ? (
                            <ProgressBar percent={downloadProgress[material.filename]} />
                          ) : null}
                        </div>
                        <button 
                          className="compact-premium-download-btn"
                          onClick={() => onDownloadMaterial({ ...material, _videoId: video._id })}
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 9h-4V3H9v6h4l7 7 7-7z"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="compact-premium-materials-empty">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2H4c-1.1 0-2 .9-2 2h16c1.1 0 2-.9 2-2v16c0 1.1-.9 2-2 2z"/>
                    </svg>
                    <span>No materials available for this lecture.</span>
                  </div>
                )}
              </section>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}
