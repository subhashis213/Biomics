import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar, Style } from '@capacitor/status-bar';
import {
  Chat,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  TrackLoop,
  useRoomContext,
  useTracks
} from '@livekit/components-react';
import { isTrackReference } from '@livekit/components-core';
import { RoomEvent, Track } from 'livekit-client';
import '@livekit/components-styles';
import { fetchStudentLivekitToken } from '../api';
import { getSession } from '../session';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getDocumentTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme')
    || document.body?.getAttribute('data-theme')
    || 'dark';
}

function getLiveKitTheme(theme) {
  return theme === 'light' ? 'default' : 'black';
}

function isRemovedFromSessionMessage(value) {
  return /removed from the current live session|participant removed|removed by the admin|removed/i.test(String(value || ''));
}

function participantHasVisibleVideo(participant) {
  const publications = Array.from(participant?.trackPublications?.values?.() || []);
  return publications.some((publication) => {
    const source = publication?.source;
    return !publication?.isMuted && (source === Track.Source.Camera || source === Track.Source.ScreenShare);
  });
}

function getTrackIdentity(trackReference) {
  if (!trackReference) return '';
  const trackSid = String(trackReference?.publication?.trackSid || '').trim();
  if (trackSid) return trackSid;
  return `${String(trackReference?.participant?.identity || '').trim()}::${String(trackReference?.source || '').trim()}`;
}

function trackHasVisibleVideo(trackReference) {
  if (!isTrackReference(trackReference)) return false;
  if (trackReference.publication?.source !== Track.Source.Camera) return false;
  if (!trackReference.publication?.isSubscribed || trackReference.publication?.isMuted) return false;
  return participantHasVisibleVideo(trackReference.participant);
}

function createDefaultRoomPolicy() {
  return {
    studentsMuted: false,
    chatDisabled: false
  };
}

function getPollTimeRemaining(closesAt) {
  const deadline = Number(closesAt || 0);
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

function formatPollTimer(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function isLocalMicEnabled(room) {
  const publications = Array.from(room?.localParticipant?.trackPublications?.values?.() || []);
  return publications.some((publication) => publication?.source === Track.Source.Microphone && !publication?.isMuted);
}

async function ensureMicrophonePermission() {
  if (typeof navigator === 'undefined') return;
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') return;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch (_) {
      // Ignore track cleanup failures.
    }
  });
}

function isMicrophonePermissionError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('permission') || message.includes('denied') || message.includes('notallowed');
}

function isNativeMobileApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch (_) {
    return false;
  }
}

async function enterImmersiveMobilePresentation() {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.add('student-room-fullscreen-active');
    document.body?.classList.add('student-room-fullscreen-active');
  }

  try {
    if (typeof window !== 'undefined' && window.screen?.orientation?.lock) {
      await window.screen.orientation.lock('landscape');
    }
  } catch (_) {
    // Mobile browsers may reject orientation locks outside supported fullscreen contexts.
  }

  if (!isNativeMobileApp()) return;

  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
  } catch (_) {
    // Ignore unsupported overlay operations.
  }

  try {
    await StatusBar.setStyle({ style: Style.Dark });
  } catch (_) {
    // Ignore style adjustment failures.
  }

  try {
    await StatusBar.hide();
  } catch (_) {
    // Ignore hide failures on unsupported platforms.
  }

  try {
    await ScreenOrientation.lock({ orientation: 'landscape' });
  } catch (_) {
    // Ignore orientation failures when the plugin/platform cannot lock.
  }
}

async function exitImmersiveMobilePresentation() {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('student-room-fullscreen-active');
    document.body?.classList.remove('student-room-fullscreen-active');
  }

  try {
    if (typeof window !== 'undefined' && window.screen?.orientation?.unlock) {
      window.screen.orientation.unlock();
    }
  } catch (_) {
    // Ignore browser orientation unlock failures.
  }

  if (!isNativeMobileApp()) return;

  try {
    await ScreenOrientation.unlock();
  } catch (_) {
    // Ignore unlock failures.
  }

  try {
    await StatusBar.show();
  } catch (_) {
    // Ignore show failures on unsupported platforms.
  }

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch (_) {
    // Ignore unsupported overlay operations.
  }
}

async function exitBrowserFullscreen(target) {
  if (typeof document === 'undefined') return;

  const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || null;
  if (fullscreenElement && (!target || fullscreenElement === target)) {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

function StudentStageConference({ isFullscreen, onStageInteract, isMobileViewport, isMobileLandscape }) {
  const [screenShareZoom, setScreenShareZoom] = useState(1);
  const [floatingPreviewPosition, setFloatingPreviewPosition] = useState({ x: 16, y: 16 });
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);
  const stageRef = useRef(null);
  const previewRef = useRef(null);
  const previewDragRef = useRef(null);
  const screenShareViewportRef = useRef(null);
  const screenShareCanvasRef = useRef(null);
  const pinchGestureRef = useRef(null);
  const screenShareZoomRef = useRef(1);
  const screenShareZoomFrameRef = useRef(0);
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false }
  );

  const screenShareTrack = useMemo(
    () => tracks.find((trackReference) => isTrackReference(trackReference)
      && trackReference.publication.source === Track.Source.ScreenShare
      && trackReference.publication.isSubscribed) || null,
    [tracks]
  );

  const remoteCameraTrack = useMemo(
    () => tracks.find((trackReference) => isTrackReference(trackReference)
      && trackReference.publication.source === Track.Source.Camera
      && !trackReference.participant?.isLocal) || null,
    [tracks]
  );

  const teacherPreviewTrack = useMemo(
    () => (trackHasVisibleVideo(remoteCameraTrack) ? remoteCameraTrack : null),
    [remoteCameraTrack]
  );

  const primaryTrack = useMemo(() => {
    if (screenShareTrack) return screenShareTrack;
    if (remoteCameraTrack) return remoteCameraTrack;
    return tracks.find((trackReference) => isTrackReference(trackReference)) || tracks[0] || null;
  }, [remoteCameraTrack, screenShareTrack, tracks]);

  const supportingTracks = useMemo(() => {
    if (screenShareTrack) {
      return teacherPreviewTrack ? [teacherPreviewTrack] : [];
    }

    if (!primaryTrack) return tracks;
    const primaryIdentity = getTrackIdentity(primaryTrack);
    return tracks.filter((trackReference) => getTrackIdentity(trackReference) !== primaryIdentity);
  }, [primaryTrack, screenShareTrack, teacherPreviewTrack, tracks]);

  useEffect(() => {
    if (!screenShareTrack) {
      setScreenShareZoom(1);
      screenShareZoomRef.current = 1;
      pinchGestureRef.current = null;
    }
  }, [screenShareTrack]);

  useEffect(() => () => {
    if (screenShareZoomFrameRef.current) {
      window.cancelAnimationFrame(screenShareZoomFrameRef.current);
    }
  }, []);

  const hasScreenShare = Boolean(screenShareTrack);
  const showImmersiveStage = hasScreenShare && isFullscreen;
  const showFloatingPreview = Boolean(supportingTracks.length) && (isMobileViewport || showImmersiveStage);

  useEffect(() => {
    if (!showFloatingPreview) {
      setFloatingPreviewPosition({ x: 16, y: 16 });
      setIsDraggingPreview(false);
      previewDragRef.current = null;
    }
  }, [showFloatingPreview]);

  useEffect(() => {
    if (!isDraggingPreview) return undefined;

    function clampPreviewPosition(clientX, clientY) {
      const stageRect = stageRef.current?.getBoundingClientRect();
      const previewRect = previewRef.current?.getBoundingClientRect();
      const dragState = previewDragRef.current;
      if (!stageRect || !previewRect || !dragState) return null;

      const maxX = Math.max(8, stageRect.width - previewRect.width - 8);
      const maxY = Math.max(8, stageRect.height - previewRect.height - 8);
      return {
        x: Math.min(Math.max(8, clientX - stageRect.left - dragState.offsetX), maxX),
        y: Math.min(Math.max(8, clientY - stageRect.top - dragState.offsetY), maxY)
      };
    }

    function handlePointerMove(event) {
      const nextPosition = clampPreviewPosition(event.clientX, event.clientY);
      if (!nextPosition) return;
      setFloatingPreviewPosition(nextPosition);
    }

    function handleTouchMove(event) {
      const touch = event.touches?.[0];
      if (!touch) return;
      const nextPosition = clampPreviewPosition(touch.clientX, touch.clientY);
      if (!nextPosition) return;
      setFloatingPreviewPosition(nextPosition);
      event.preventDefault();
    }

    function handlePointerUp() {
      setIsDraggingPreview(false);
      previewDragRef.current = null;
    }

    function handleTouchEnd() {
      setIsDraggingPreview(false);
      previewDragRef.current = null;
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isDraggingPreview]);

  function clampScreenShareZoom(nextScale) {
    return Math.min(3, Math.max(1, Number(nextScale.toFixed(2))));
  }

  function renderScreenShareZoom(nextScale, immediate = false) {
    const applyZoom = () => {
      screenShareZoomFrameRef.current = 0;
      const normalizedScale = clampScreenShareZoom(nextScale);
      screenShareCanvasRef.current?.style.setProperty('--student-screen-share-scale', String(normalizedScale));
      screenShareViewportRef.current?.classList.toggle('is-zoomed', normalizedScale > 1.01);
    };

    if (immediate) {
      applyZoom();
      return;
    }

    if (screenShareZoomFrameRef.current) {
      window.cancelAnimationFrame(screenShareZoomFrameRef.current);
    }

    screenShareZoomFrameRef.current = window.requestAnimationFrame(applyZoom);
  }

  function applyScreenShareZoom(nextScale, { commit = false, immediate = false } = {}) {
    const normalizedScale = clampScreenShareZoom(nextScale);
    screenShareZoomRef.current = normalizedScale;
    renderScreenShareZoom(normalizedScale, immediate);
    if (commit) {
      setScreenShareZoom(normalizedScale);
    }
  }

  useEffect(() => {
    applyScreenShareZoom(1, { commit: true, immediate: true });
  }, [screenShareTrack]);

  function getTouchDistance(touchA, touchB) {
    return Math.hypot(touchA.clientX - touchB.clientX, touchA.clientY - touchB.clientY);
  }

  function handlePreviewPointerDown(event) {
    if (!showFloatingPreview || !previewRef.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const previewRect = previewRef.current.getBoundingClientRect();
    previewDragRef.current = {
      offsetX: event.clientX - previewRect.left,
      offsetY: event.clientY - previewRect.top
    };
    setIsDraggingPreview(true);
    event.preventDefault();
  }

  function handlePreviewTouchStart(event) {
    if (!showFloatingPreview || !previewRef.current) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const previewRect = previewRef.current.getBoundingClientRect();
    previewDragRef.current = {
      offsetX: touch.clientX - previewRect.left,
      offsetY: touch.clientY - previewRect.top
    };
    setIsDraggingPreview(true);
    event.preventDefault();
  }

  function handleScreenShareTouchStart(event) {
    if (event.touches.length !== 2) return;
    pinchGestureRef.current = {
      distance: getTouchDistance(event.touches[0], event.touches[1]),
      scale: screenShareZoomRef.current
    };
  }

  function handleScreenShareTouchMove(event) {
    if (event.touches.length !== 2 || !pinchGestureRef.current) return;

    const nextDistance = getTouchDistance(event.touches[0], event.touches[1]);
    if (!nextDistance) return;

    const nextScale = clampScreenShareZoom((nextDistance / pinchGestureRef.current.distance) * pinchGestureRef.current.scale);
    applyScreenShareZoom(nextScale);
    event.preventDefault();
  }

  function handleScreenShareTouchEnd(event) {
    if (event.touches.length < 2) {
      setScreenShareZoom(screenShareZoomRef.current);
      pinchGestureRef.current = null;
    }
  }

  return (
    <div className="student-video-conference student-video-conference--custom">
      {!isFullscreen ? (
        <div className="student-video-conference-toolbar">
          <div className="student-video-conference-status">
            <span className="student-video-conference-status-pill">Classroom Focus</span>
            <strong>{screenShareTrack ? 'Teacher screen is being shared' : 'Teacher stage is pinned for mobile view'}</strong>
          </div>
        </div>
      ) : null}

      <div
        ref={stageRef}
        className={`student-video-conference-stage${supportingTracks.length ? '' : ' is-single'}${hasScreenShare ? ' has-screen-share' : ''}${isFullscreen ? ' is-fullscreen' : ''}${showImmersiveStage ? ' is-immersive-stage' : ''}${isMobileViewport ? ' is-mobile-view' : ''}${isMobileLandscape ? ' is-mobile-landscape' : ''}`}
        onPointerDownCapture={isFullscreen ? onStageInteract : undefined}
        onPointerMoveCapture={isFullscreen ? onStageInteract : undefined}
        onTouchStart={isFullscreen ? onStageInteract : undefined}
      >
        {primaryTrack ? (
          <div className={`student-video-conference-primary${hasScreenShare ? ' is-screen-share' : ''}`}>
            {hasScreenShare ? (
              <>
                {!showImmersiveStage ? (
                  <div className="student-screen-share-toolbar">
                    <div className="student-screen-share-copy">
                      <span className="student-screen-share-badge">Shared screen mode</span>
                      <strong>
                        Use pinch in and pinch out on the shared screen when the question needs a closer look.
                      </strong>
                    </div>
                    <span className="student-screen-share-gesture-pill">Pinch to zoom</span>
                  </div>
                ) : (
                  <div className="student-screen-share-floating-actions" role="group" aria-label="Screen share controls">
                    <span className="student-screen-share-floating-chip">Pinch to zoom</span>
                  </div>
                )}

                <div
                  ref={screenShareViewportRef}
                  className="student-screen-share-viewport"
                  onTouchStart={handleScreenShareTouchStart}
                  onTouchMove={handleScreenShareTouchMove}
                  onTouchEnd={handleScreenShareTouchEnd}
                  onTouchCancel={handleScreenShareTouchEnd}
                >
                  <div
                    ref={screenShareCanvasRef}
                    className="student-screen-share-canvas"
                  >
                    <ParticipantTile trackRef={primaryTrack} className="student-video-conference-focus-tile student-screen-share-tile" />
                  </div>
                </div>

                {!showImmersiveStage ? (
                  <p className="student-screen-share-footnote">
                    {screenShareZoom > 1
                      ? 'Drag the shared screen to inspect hidden corners and detailed text.'
                      : 'Use a two-finger pinch on the shared content to zoom without affecting the rest of the room.'}
                  </p>
                ) : null}
              </>
            ) : (
              <ParticipantTile trackRef={primaryTrack} className="student-video-conference-focus-tile" />
            )}
          </div>
        ) : (
          <div className="student-video-conference-grid-wrapper">
            <GridLayout tracks={tracks}>
              <ParticipantTile />
            </GridLayout>
          </div>
        )}

        {primaryTrack && supportingTracks.length ? (
          <div
            ref={previewRef}
            className={`student-video-conference-support-rail${hasScreenShare ? ' has-screen-share' : ''}${isFullscreen ? ' is-fullscreen' : ''}${showFloatingPreview ? ' is-floating-overlay is-draggable' : ''}${isDraggingPreview ? ' is-dragging' : ''}`}
            style={showFloatingPreview ? { '--student-preview-left': `${floatingPreviewPosition.x}px`, '--student-preview-top': `${floatingPreviewPosition.y}px` } : undefined}
            onPointerDown={handlePreviewPointerDown}
            onTouchStart={handlePreviewTouchStart}
          >
            <TrackLoop tracks={supportingTracks}>
              <ParticipantTile />
            </TrackLoop>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StudentRoomControls({
  policy,
  onError,
  onLeave,
  isChatOpen,
  onToggleChat,
  isImmersive,
  isOverlayVisible,
  isMobileViewport,
  isMobileLandscape
}) {
  const room = useRoomContext();
  const [isMicEnabled, setIsMicEnabled] = useState(false);

  useEffect(() => {
    if (!room) return undefined;

    function syncMicState() {
      setIsMicEnabled(isLocalMicEnabled(room));
    }

    syncMicState();
    room.on(RoomEvent.LocalTrackPublished, syncMicState);
    room.on(RoomEvent.LocalTrackUnpublished, syncMicState);
    room.on(RoomEvent.TrackMuted, syncMicState);
    room.on(RoomEvent.TrackUnmuted, syncMicState);

    return () => {
      room.off(RoomEvent.LocalTrackPublished, syncMicState);
      room.off(RoomEvent.LocalTrackUnpublished, syncMicState);
      room.off(RoomEvent.TrackMuted, syncMicState);
      room.off(RoomEvent.TrackUnmuted, syncMicState);
    };
  }, [room]);

  useEffect(() => {
    if (!room || !policy.studentsMuted) return;

    room.localParticipant.setMicrophoneEnabled(false)
      .then(() => setIsMicEnabled(false))
      .catch((error) => onError?.(error.message || 'Failed to mute microphone.'));
  }, [onError, policy.studentsMuted, room]);

  async function handleToggleMic() {
    if (!room || policy.studentsMuted) return;

    try {
      const nextEnabled = !isMicEnabled;
      if (nextEnabled) {
        await ensureMicrophonePermission();
      }
      await room.localParticipant.setMicrophoneEnabled(nextEnabled);
      setIsMicEnabled(nextEnabled);
    } catch (error) {
      if (isMicrophonePermissionError(error)) {
        onError?.('Microphone access is blocked. Allow the mic permission for Biomics Hub on this device, then try again.');
        return;
      }
      onError?.(error.message || 'Failed to update microphone state.');
    }
  }

  async function handleLeaveRoom() {
    await exitBrowserFullscreen();
    room?.disconnect();
    onLeave?.();
  }

  const isImmersiveOverlay = isImmersive;

  return (
    <div
      className={`student-room-controls${isImmersiveOverlay ? ' is-immersive-overlay' : ''}${isOverlayVisible ? ' is-visible' : ''}${isMobileViewport ? ' is-mobile-view' : ''}${isMobileLandscape ? ' is-mobile-landscape' : ''}`}
      aria-label="Student room controls"
    >
      <div className="student-room-controls-status">
        {policy.studentsMuted ? <span className="student-room-control-pill is-alert">Mic locked by teacher</span> : null}
        {policy.chatDisabled ? <span className="student-room-control-pill">Chat off for all</span> : null}
      </div>
      <div className="student-room-controls-actions">
        <button type="button" className={`student-room-control-btn${isMicEnabled ? ' is-live' : ''}`} onClick={handleToggleMic} disabled={policy.studentsMuted}>
          {policy.studentsMuted ? 'Muted by teacher' : isMicEnabled ? 'Mute mic' : 'Unmute mic'}
        </button>
        <button
          type="button"
          className={`student-room-control-btn${isChatOpen ? ' is-live' : ''}`}
          onClick={onToggleChat}
        >
          {policy.chatDisabled ? 'Chat locked' : isChatOpen ? 'Hide chat' : 'Open chat'}
        </button>
        <button type="button" className="student-room-control-btn student-room-control-btn--ghost" onClick={handleLeaveRoom}>
          Leave class
        </button>
      </div>
    </div>
  );
}

function StudentRoomChatPanel({ policy, isOpen, onClose, openedAt, isMobileViewport, isMobileLandscape }) {
  const isDisabled = policy.chatDisabled;
  const [isBackdropInteractive, setIsBackdropInteractive] = useState(false);
  const shouldShowBackdrop = isMobileViewport && (isOpen || isDisabled);

  function handleCloseRequest(event) {
    event?.stopPropagation?.();
    if (isOpen && Date.now() - Number(openedAt || 0) < 320) {
      return;
    }
    onClose?.();
  }

  useEffect(() => {
    if (!shouldShowBackdrop) {
      setIsBackdropInteractive(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setIsBackdropInteractive(true);
    }, 240);

    return () => window.clearTimeout(timeoutId);
  }, [shouldShowBackdrop]);

  const panel = (
    <>
      {isMobileViewport ? (
        <button
          type="button"
          className={`student-room-chat-backdrop${shouldShowBackdrop ? ' is-open' : ''}${isBackdropInteractive ? ' is-interactive' : ''}`}
          aria-label="Close chat"
          onClick={handleCloseRequest}
        />
      ) : null}
      {isDisabled ? (
        <section className={`student-room-chat-panel is-disabled${isMobileViewport ? ' is-mobile-drawer' : ''}${isMobileLandscape ? ' is-mobile-landscape' : ''}`} aria-live="polite" onClick={(event) => event.stopPropagation()}>
          <div className="student-room-chat-panel-head">
            <div>
              <p className="eyebrow">Class Chat</p>
              <strong>Chat is turned off</strong>
            </div>
            {isMobileViewport ? (
              <button type="button" className="student-room-chat-close-btn" onClick={handleCloseRequest}>
                Close
              </button>
            ) : null}
          </div>
          <p className="student-room-chat-disabled-copy">The teacher has locked chat for this live class. You can use it again when they reopen it.</p>
        </section>
      ) : (
        <section className={`student-room-chat-panel${isOpen ? ' is-open' : ''}${isMobileViewport ? ' is-mobile-drawer' : ''}${isMobileLandscape ? ' is-mobile-landscape' : ''}`} aria-live="polite" onClick={(event) => event.stopPropagation()}>
          <div className="student-room-chat-panel-head">
            <div>
              <p className="eyebrow">Class Chat</p>
              <strong>Messages</strong>
            </div>
            <button type="button" className="student-room-chat-close-btn" onClick={handleCloseRequest}>
              Close
            </button>
          </div>
          <Chat />
        </section>
      )}
    </>
  );

  if (isMobileViewport && typeof document !== 'undefined') {
    return createPortal(
      <div className={`livekit-student-page student-room-chat-portal${isOpen ? ' is-open' : ''}${isDisabled ? ' is-disabled' : ''}${isMobileLandscape ? ' is-mobile-landscape' : ' is-mobile-portrait'}`}>
        {panel}
      </div>,
      document.body
    );
  }

  return panel;
}

function StudentRoomPolicySync({ onPolicyChange }) {
  const room = useRoomContext();

  useEffect(() => {
    if (!room) return undefined;

    function handleData(payload) {
      try {
        const message = JSON.parse(decoder.decode(payload));
        if (message?.type !== 'room-policy' || !message?.policy) return;

        onPolicyChange({
          studentsMuted: Boolean(message.policy.studentsMuted),
          chatDisabled: Boolean(message.policy.chatDisabled)
        });
      } catch (_) {
        // Ignore malformed payloads.
      }
    }

    room.on(RoomEvent.DataReceived, handleData);
    return () => room.off(RoomEvent.DataReceived, handleData);
  }, [onPolicyChange, room]);

  return null;
}

function StudentRoomStatusOverlay() {
  const room = useRoomContext();
  const [teacherVideoVisible, setTeacherVideoVisible] = useState(false);

  useEffect(() => {
    if (!room) return undefined;

    function syncTeacherVideoState() {
      const participants = Array.from(room.remoteParticipants.values());
      setTeacherVideoVisible(participants.some(participantHasVisibleVideo));
    }

    syncTeacherVideoState();

    room.on(RoomEvent.ParticipantConnected, syncTeacherVideoState);
    room.on(RoomEvent.ParticipantDisconnected, syncTeacherVideoState);
    room.on(RoomEvent.TrackPublished, syncTeacherVideoState);
    room.on(RoomEvent.TrackUnpublished, syncTeacherVideoState);
    room.on(RoomEvent.TrackMuted, syncTeacherVideoState);
    room.on(RoomEvent.TrackUnmuted, syncTeacherVideoState);

    return () => {
      room.off(RoomEvent.ParticipantConnected, syncTeacherVideoState);
      room.off(RoomEvent.ParticipantDisconnected, syncTeacherVideoState);
      room.off(RoomEvent.TrackPublished, syncTeacherVideoState);
      room.off(RoomEvent.TrackUnpublished, syncTeacherVideoState);
      room.off(RoomEvent.TrackMuted, syncTeacherVideoState);
      room.off(RoomEvent.TrackUnmuted, syncTeacherVideoState);
    };
  }, [room]);

  if (teacherVideoVisible) return null;

  return (
    <div className="livekit-student-video-overlay" aria-live="polite">
      <strong>Teacher camera is off right now</strong>
      <p>The classroom is connected, but no live camera feed is being published yet. Ask the teacher to turn on their camera in the studio.</p>
    </div>
  );
}

function StudentPollOverlay({ participantIdentity, onError }) {
  const room = useRoomContext();
  const [activePoll, setActivePoll] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [isClosingPoll, setIsClosingPoll] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const optionEntries = Object.entries(activePoll?.options || {});

  useEffect(() => {
    if (!activePoll?.closesAt) {
      setTimeRemaining(0);
      return undefined;
    }

    const syncCountdown = () => {
      setTimeRemaining(getPollTimeRemaining(activePoll.closesAt));
    };

    syncCountdown();
    const timerId = window.setInterval(syncCountdown, 1000);
    return () => window.clearInterval(timerId);
  }, [activePoll?.closesAt]);

  useEffect(() => {
    if (!room) return undefined;

    function handleData(payload) {
      try {
        const message = JSON.parse(decoder.decode(payload));
        if (message?.type === 'poll-create' && message?.poll) {
          setActivePoll(message.poll);
          setSelectedAnswer('');
          setIsClosingPoll(false);
        }
        if (message?.type === 'poll-reveal' && activePoll && message?.pollId === activePoll.id) {
          setActivePoll((current) => current ? ({ ...current, revealed: true, correctOption: message.correctOption }) : current);
        }
        if (message?.type === 'poll-clear' && activePoll && message?.pollId === activePoll.id) {
          setIsClosingPoll(true);
          window.setTimeout(() => {
            setActivePoll(null);
            setSelectedAnswer('');
            setIsClosingPoll(false);
          }, 220);
        }
      } catch (_) {
        // Ignore invalid payloads.
      }
    }

    room.on(RoomEvent.DataReceived, handleData);
    return () => room.off(RoomEvent.DataReceived, handleData);
  }, [room, activePoll]);

  async function handleVote(optionKey) {
    if (!room || !activePoll || selectedAnswer) return;
    if (activePoll.closesAt && getPollTimeRemaining(activePoll.closesAt) <= 0) return;
    setSelectedAnswer(optionKey);
    try {
      await room.localParticipant.publishData(encoder.encode(JSON.stringify({
        type: 'poll-answer',
        pollId: activePoll.id,
        answer: optionKey,
        participantIdentity
      })), { reliable: true });
    } catch (error) {
      setSelectedAnswer('');
      onError?.(error.message || 'Failed to send poll answer.');
    }
  }

  function handleDismissPoll() {
    setIsClosingPoll(true);
    window.setTimeout(() => {
      setActivePoll(null);
      setSelectedAnswer('');
      setIsClosingPoll(false);
    }, 220);
  }

  if (!activePoll) return null;

  const isTimerEnabled = Boolean(activePoll.closesAt);
  const isPollClosed = isTimerEnabled && timeRemaining <= 0;

  return (
    <div className="livekit-student-poll-layer" aria-live="polite">
      <aside
        className={`livekit-student-poll-popup${selectedAnswer ? ' is-answered' : ''}${activePoll.revealed ? ' is-revealed' : ''}${isClosingPoll ? ' is-closing' : ''}`}
        role="dialog"
        aria-live="polite"
        aria-label="Live poll"
      >
        <div className="livekit-student-poll-head">
          <div className="livekit-student-poll-head-copy">
            <span className="livekit-student-poll-badge">Live poll</span>
            <strong>Answer from shared screen</strong>
          </div>
          <div className="livekit-student-poll-head-meta">
            {isTimerEnabled ? (
              <span className={`livekit-student-poll-meta-pill livekit-student-poll-meta-pill--timer${isPollClosed ? ' is-closed' : ''}`}>
                <span className="livekit-student-poll-meta-pill-label">Timer</span>
                <span className="livekit-student-poll-meta-pill-value">{isPollClosed ? 'Time up' : formatPollTimer(timeRemaining)}</span>
              </span>
            ) : null}
          </div>
        </div>
        <div className="livekit-student-poll-options">
          {optionEntries.map(([key]) => {
            const isSelected = selectedAnswer === key;
            const isCorrect = activePoll.revealed && activePoll.correctOption === key;
            const isIncorrect = activePoll.revealed && isSelected && !isCorrect;
            return (
              <button
                key={key}
                type="button"
                className={`livekit-student-poll-option${isSelected ? ' is-selected' : ''}${isCorrect ? ' is-correct' : ''}${isIncorrect ? ' is-incorrect' : ''}`}
                onClick={() => handleVote(key)}
                disabled={Boolean(selectedAnswer) || isPollClosed}
                aria-label={`Option ${key}`}
              >
                <span className="livekit-student-poll-option-key">{key}</span>
                <strong className="livekit-student-poll-option-label">Option {key}</strong>
              </button>
            );
          })}
        </div>
        <div className="livekit-student-poll-footer">
          <strong>
            {activePoll.revealed
              ? `Correct answer: ${activePoll.correctOption}. Your choice: ${selectedAnswer || 'Not answered'}.`
              : isPollClosed
                ? `Time up. Your choice: ${selectedAnswer || 'Not answered'}.`
                : selectedAnswer
                  ? `Locked: Option ${selectedAnswer}`
                  : 'Tap A, B, C, or D'}
          </strong>
          {!activePoll.revealed ? <p className="subtitle">Question stays on the teacher screen.</p> : null}
        </div>
        {selectedAnswer && !activePoll.revealed && !isPollClosed ? (
          <p className="livekit-poll-answer-pending">Waiting for teacher to reveal answer.</p>
        ) : null}
        {isPollClosed && !activePoll.revealed ? (
          <p className="livekit-poll-answer-pending livekit-poll-answer-pending--closed">Poll timer finished. Voting is locked.</p>
        ) : null}
        {activePoll.revealed ? (
          <>
            <p className="livekit-poll-answer-reveal">Correct answer: Option {activePoll.correctOption}</p>
            <div className="livekit-student-poll-dismiss-row">
              <button type="button" className="livekit-student-poll-dismiss-btn" onClick={handleDismissPoll}>
                Close poll
              </button>
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}

export default function StudentRoom({ classSession, onSessionRemoved, onLeave, autoEnterImmersive = false }) {
  const session = getSession();
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isImmersiveFallback, setIsImmersiveFallback] = useState(() => Boolean(autoEnterImmersive));
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [roomPolicy, setRoomPolicy] = useState(createDefaultRoomPolicy);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [lastChatOpenedAt, setLastChatOpenedAt] = useState(0);
  const [isFullscreenControlsVisible, setIsFullscreenControlsVisible] = useState(false);
  const [liveKitTheme, setLiveKitTheme] = useState(() => getLiveKitTheme(getDocumentTheme()));
  const [viewportMetrics, setViewportMetrics] = useState(() => ({
    width: typeof window !== 'undefined' ? Math.round(window.visualViewport?.width || window.innerWidth || 0) : 0,
    height: typeof window !== 'undefined' ? Math.round(window.visualViewport?.height || window.innerHeight || 0) : 0
  }));
  const roomShellRef = useRef(null);
  const hasInitializedViewportRef = useRef(false);
  const hasAttemptedAutoFullscreenRef = useRef(false);
  const isImmersive = isFullscreen || isImmersiveFallback;
  const isMobileLandscape = isMobileViewport && viewportMetrics.width > viewportMetrics.height;
  const isMobilePortrait = isMobileViewport && !isMobileLandscape;

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return undefined;

    const syncTheme = () => setLiveKitTheme(getLiveKitTheme(getDocumentTheme()));
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (document.body) {
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const compactQuery = window.matchMedia('(max-width: 900px)');
    const coarsePointerQuery = window.matchMedia('(pointer: coarse)');

    const syncViewportState = () => {
      const nextIsMobile = compactQuery.matches || coarsePointerQuery.matches;
      setIsMobileViewport(nextIsMobile);
      setIsChatOpen((current) => {
        if (!hasInitializedViewportRef.current) {
          hasInitializedViewportRef.current = true;
          return nextIsMobile ? false : true;
        }
        return nextIsMobile ? current : true;
      });
      if (!nextIsMobile) {
        setIsFullscreenControlsVisible(false);
      }
    };

    syncViewportState();

    if (typeof compactQuery.addEventListener === 'function') {
      compactQuery.addEventListener('change', syncViewportState);
      coarsePointerQuery.addEventListener('change', syncViewportState);
      window.addEventListener('resize', syncViewportState);
      return () => {
        compactQuery.removeEventListener('change', syncViewportState);
        coarsePointerQuery.removeEventListener('change', syncViewportState);
        window.removeEventListener('resize', syncViewportState);
      };
    }

    compactQuery.addListener(syncViewportState);
    coarsePointerQuery.addListener(syncViewportState);
    window.addEventListener('resize', syncViewportState);
    return () => {
      compactQuery.removeListener(syncViewportState);
      coarsePointerQuery.removeListener(syncViewportState);
      window.removeEventListener('resize', syncViewportState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncViewportMetrics = () => {
      const nextWidth = Math.round(window.visualViewport?.width || window.innerWidth || 0);
      const nextHeight = Math.round(window.visualViewport?.height || window.innerHeight || 0);
      setViewportMetrics({ width: nextWidth, height: nextHeight });

      const target = roomShellRef.current;
      if (target) {
        target.style.setProperty('--student-room-live-vw', `${nextWidth}px`);
        target.style.setProperty('--student-room-live-vh', `${nextHeight}px`);
      }
    };

    syncViewportMetrics();
    window.visualViewport?.addEventListener('resize', syncViewportMetrics);
    window.visualViewport?.addEventListener('scroll', syncViewportMetrics);
    window.addEventListener('resize', syncViewportMetrics);
    window.addEventListener('orientationchange', syncViewportMetrics);

    return () => {
      window.visualViewport?.removeEventListener('resize', syncViewportMetrics);
      window.visualViewport?.removeEventListener('scroll', syncViewportMetrics);
      window.removeEventListener('resize', syncViewportMetrics);
      window.removeEventListener('orientationchange', syncViewportMetrics);
      roomShellRef.current?.style.removeProperty('--student-room-live-vw');
      roomShellRef.current?.style.removeProperty('--student-room-live-vh');
    };
  }, []);

  useEffect(() => {
    if (!isMobileViewport) return undefined;
    const shell = roomShellRef.current;
    if (!shell) return undefined;

    function allowInternalScreenSharePinch(target) {
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest('.student-screen-share-viewport, .student-screen-share-canvas, .student-screen-share-tile'));
    }

    function handleShellTouchMove(event) {
      if ((event.touches?.length || 0) < 2) return;
      if (allowInternalScreenSharePinch(event.target)) return;
      event.preventDefault();
    }

    function blockGestureZoom(event) {
      if (allowInternalScreenSharePinch(event.target)) return;
      event.preventDefault();
    }

    shell.addEventListener('touchmove', handleShellTouchMove, { passive: false });
    shell.addEventListener('gesturestart', blockGestureZoom);
    shell.addEventListener('gesturechange', blockGestureZoom);

    return () => {
      shell.removeEventListener('touchmove', handleShellTouchMove);
      shell.removeEventListener('gesturestart', blockGestureZoom);
      shell.removeEventListener('gesturechange', blockGestureZoom);
    };
  }, [isMobileViewport]);

  useEffect(() => {
    if (!roomPolicy.chatDisabled) return;
    setIsChatOpen(false);
  }, [roomPolicy.chatDisabled]);

  useEffect(() => {
    if (!isMobileViewport) return;
    if (isMobileLandscape && isChatOpen) {
      setIsFullscreenControlsVisible(false);
    }
  }, [isChatOpen, isMobileLandscape, isMobileViewport]);

  useEffect(() => {
    if (!autoEnterImmersive) return;
    setIsImmersiveFallback(true);
    setIsFullscreenControlsVisible(true);
  }, [autoEnterImmersive]);

  useEffect(() => {
    if (!(isImmersive && isFullscreenControlsVisible) || isChatOpen) return undefined;

    const timeoutId = window.setTimeout(() => {
      setIsFullscreenControlsVisible(false);
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [isChatOpen, isFullscreenControlsVisible, isImmersive]);

  useEffect(() => {
    if (isImmersive) {
      setIsFullscreenControlsVisible(true);
      return;
    }

    setIsFullscreenControlsVisible(false);
  }, [isImmersive, isMobileViewport]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const targets = [document.documentElement, document.body].filter(Boolean);
    targets.forEach((target) => target.classList.toggle('student-room-immersive', isImmersive));

    return () => {
      targets.forEach((target) => target.classList.remove('student-room-immersive'));
    };
  }, [isImmersive]);

  useEffect(() => {
    let active = true;

    (async () => {
      if (!active) return;
      if (isImmersive) {
        await enterImmersiveMobilePresentation();
      } else {
        await exitImmersiveMobilePresentation();
      }
    })();

    return () => {
      active = false;
    };
  }, [isImmersive]);

  useEffect(() => {
    function syncFullscreenState() {
      const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || null;
      setIsFullscreen(Boolean(fullscreenElement && roomShellRef.current && fullscreenElement === roomShellRef.current));
    }

    document.addEventListener('fullscreenchange', syncFullscreenState);
    document.addEventListener('webkitfullscreenchange', syncFullscreenState);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      document.removeEventListener('webkitfullscreenchange', syncFullscreenState);
    };
  }, []);

  async function handleToggleFullscreen() {
    const target = roomShellRef.current;
    if (!target) return;

    try {
      const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || null;
      if (fullscreenElement === target) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
        setIsImmersiveFallback(false);
        setIsFullscreenControlsVisible(false);
        return;
      }

      if (isImmersiveFallback) {
        setIsImmersiveFallback(false);
        setIsFullscreenControlsVisible(false);
        return;
      }

      if (target.requestFullscreen) {
        await target.requestFullscreen();
        setIsFullscreenControlsVisible(true);
      } else if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen();
        setIsFullscreenControlsVisible(true);
      } else {
        setIsImmersiveFallback(true);
        setIsFullscreenControlsVisible(true);
      }
    } catch (error) {
      setIsImmersiveFallback(true);
      setIsFullscreenControlsVisible(true);
      setErrorMessage('Browser fullscreen is limited on this device. Immersive mode is enabled instead.');
    }
  }

  function handleOpenChat() {
    setLastChatOpenedAt(Date.now());
    setIsChatOpen(true);
    setIsFullscreenControlsVisible(true);
  }

  function handleCloseChat() {
    setIsChatOpen(false);
    if (isImmersive) {
      setIsFullscreenControlsVisible(true);
    }
  }

  function handleToggleChat() {
    if (isChatOpen) {
      handleCloseChat();
      return;
    }
    handleOpenChat();
  }

  useEffect(() => {
    if (!autoEnterImmersive || hasAttemptedAutoFullscreenRef.current) return;
    if (loading || !connectionInfo?.token || !connectionInfo?.livekitUrl) return;

    hasAttemptedAutoFullscreenRef.current = true;

    const target = roomShellRef.current;
    if (!target) return;

    const requestFullscreen = target.requestFullscreen || target.webkitRequestFullscreen;
    if (typeof requestFullscreen !== 'function') return;

    Promise.resolve(requestFullscreen.call(target))
      .then(() => {
        setIsFullscreenControlsVisible(true);
      })
      .catch(() => {
        // Browsers commonly block non-gesture fullscreen. Keep immersive viewport fallback active.
      });
  }, [autoEnterImmersive, connectionInfo?.livekitUrl, connectionInfo?.token, loading]);

  function handleStageInteract() {
    if (!isImmersive) return;
    setIsFullscreenControlsVisible((current) => (current ? current : true));
  }

  useEffect(() => () => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.remove('student-room-immersive');
    document.documentElement.classList.remove('student-room-fullscreen-active');
    document.body?.classList.remove('student-room-immersive');
    document.body?.classList.remove('student-room-fullscreen-active');
    exitImmersiveMobilePresentation();
    exitBrowserFullscreen(roomShellRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!classSession?._id) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    fetchStudentLivekitToken(classSession._id)
      .then((data) => {
        if (!cancelled) setConnectionInfo(data);
      })
      .catch((error) => {
        if (!cancelled) {
          const nextMessage = error.message || 'Unable to join the live class right now.';
          setErrorMessage(nextMessage);
          if (isRemovedFromSessionMessage(nextMessage)) {
            onSessionRemoved?.('You were removed from the current live session by the admin.');
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [classSession?._id]);

  if (loading) {
    return (
      <section className="card livekit-empty-room-card">
        <strong>Connecting to the live class</strong>
        <p>Fetching your student token and joining the live classroom automatically.</p>
      </section>
    );
  }

  if (errorMessage) {
    return <p className="banner error">{errorMessage}</p>;
  }

  if (!connectionInfo?.token || !connectionInfo?.livekitUrl) {
    return (
      <section className="card livekit-empty-room-card">
        <strong>No active room is available yet</strong>
        <p>Your live classroom will appear here automatically when the admin starts the room.</p>
      </section>
    );
  }

  return (
    <section ref={roomShellRef} className={`card livekit-conference-card student-room-shell${isImmersive ? ' is-immersive' : ''}${isChatOpen ? ' has-chat-open' : ''}${isMobileViewport ? ' is-mobile-view' : ''}${isMobileLandscape ? ' is-mobile-landscape' : ''}${isMobilePortrait ? ' is-mobile-portrait' : ''}`}>
      <LiveKitRoom
        token={connectionInfo.token}
        serverUrl={connectionInfo.livekitUrl}
        connect
        audio
        video={false}
        data-lk-theme={liveKitTheme}
        onDisconnected={(reason) => {
          const rawReason = String(reason || '').trim();
          if (isRemovedFromSessionMessage(rawReason)) {
            setConnectionInfo(null);
            setErrorMessage('You were removed from the current live session by the admin.');
            onSessionRemoved?.('You were removed from the current live session by the admin.');
          }
        }}
      >
        <StudentRoomPolicySync onPolicyChange={setRoomPolicy} />
        <StudentStageConference isFullscreen={isImmersive} onStageInteract={handleStageInteract} isMobileViewport={isMobileViewport} isMobileLandscape={isMobileLandscape} />
        <StudentRoomStatusOverlay />
        <RoomAudioRenderer />
        <StudentRoomControls
          policy={roomPolicy}
          onError={setErrorMessage}
          isChatOpen={isChatOpen}
          isImmersive={isImmersive}
          isMobileViewport={isMobileViewport}
          isMobileLandscape={isMobileLandscape}
          isOverlayVisible={!isImmersive || isFullscreenControlsVisible}
          onToggleChat={handleToggleChat}
          onLeave={() => {
            setConnectionInfo(null);
            setRoomPolicy(createDefaultRoomPolicy());
            setIsChatOpen(false);
            setErrorMessage('');
            onLeave?.();
          }}
        />
        <StudentRoomChatPanel
          policy={roomPolicy}
          isOpen={isChatOpen}
          onClose={handleCloseChat}
          openedAt={lastChatOpenedAt}
          isMobileViewport={isMobileViewport}
          isMobileLandscape={isMobileLandscape}
        />
        <StudentPollOverlay participantIdentity={`student-${session?.username || 'viewer'}-${classSession?._id || 'room'}`} onError={setErrorMessage} />
      </LiveKitRoom>
    </section>
  );
}