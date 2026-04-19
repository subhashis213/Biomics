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

function StudentStageConference({ isFullscreen, onToggleFullscreen, onStageInteract }) {
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

  useEffect(() => {
    if (!(screenShareTrack && isFullscreen)) {
      setFloatingPreviewPosition({ x: 16, y: 16 });
      setIsDraggingPreview(false);
      previewDragRef.current = null;
    }
  }, [isFullscreen, screenShareTrack]);

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

    function handlePointerUp() {
      setIsDraggingPreview(false);
      previewDragRef.current = null;
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDraggingPreview]);

  const hasScreenShare = Boolean(screenShareTrack);
  const showImmersiveStage = hasScreenShare && isFullscreen;

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
    if (!showImmersiveStage || !previewRef.current) return;
    const previewRect = previewRef.current.getBoundingClientRect();
    previewDragRef.current = {
      offsetX: event.clientX - previewRect.left,
      offsetY: event.clientY - previewRect.top
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
      {!showImmersiveStage ? (
        <div className="student-video-conference-toolbar">
          <div className="student-video-conference-status">
            <span className="student-video-conference-status-pill">Classroom Focus</span>
            <strong>{screenShareTrack ? 'Teacher screen is being shared' : 'Teacher stage is pinned for mobile view'}</strong>
          </div>
          <button type="button" className="student-room-fullscreen-btn" onClick={onToggleFullscreen}>
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      ) : null}

      <div
        ref={stageRef}
        className={`student-video-conference-stage${supportingTracks.length ? '' : ' is-single'}${hasScreenShare ? ' has-screen-share' : ''}${isFullscreen ? ' is-fullscreen' : ''}${showImmersiveStage ? ' is-immersive-stage' : ''}`}
        onPointerDownCapture={showImmersiveStage ? onStageInteract : undefined}
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
                    <button type="button" className="student-screen-share-floating-btn student-screen-share-floating-btn--exit" onClick={onToggleFullscreen}>
                      Exit
                    </button>
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
            className={`student-video-conference-support-rail${hasScreenShare ? ' has-screen-share' : ''}${isFullscreen ? ' is-fullscreen' : ''}${showImmersiveStage ? ' is-draggable' : ''}${isDraggingPreview ? ' is-dragging' : ''}`}
            style={showImmersiveStage ? { '--student-preview-left': `${floatingPreviewPosition.x}px`, '--student-preview-top': `${floatingPreviewPosition.y}px` } : undefined}
            onPointerDown={handlePreviewPointerDown}
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
  isMobileViewport,
  isOverlayVisible
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

  function handleLeaveRoom() {
    room?.disconnect();
    onLeave?.();
  }

  const isImmersiveOverlay = isImmersive && isMobileViewport;

  return (
    <div
      className={`student-room-controls${isImmersiveOverlay ? ' is-immersive-overlay' : ''}${isOverlayVisible ? ' is-visible' : ''}`}
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
          disabled={policy.chatDisabled}
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

function StudentRoomChatPanel({ policy, isOpen, onClose, isMobileViewport }) {
  const isDisabled = policy.chatDisabled;
  const shouldShowBackdrop = isMobileViewport && (isOpen || isDisabled);
  const panel = (
    <>
      {isMobileViewport ? (
        <button
          type="button"
          className={`student-room-chat-backdrop${shouldShowBackdrop ? ' is-open' : ''}`}
          aria-label="Close chat"
          onClick={onClose}
        />
      ) : null}
      {isDisabled ? (
        <section className={`student-room-chat-panel is-disabled${isMobileViewport ? ' is-mobile-sheet' : ''}`} aria-live="polite">
          <div className="student-room-chat-panel-head">
            <div>
              <p className="eyebrow">Class Chat</p>
              <strong>Chat is turned off</strong>
            </div>
            {isMobileViewport ? (
              <button type="button" className="student-room-chat-close-btn" onClick={onClose}>
                Close
              </button>
            ) : null}
          </div>
          <p className="student-room-chat-disabled-copy">The teacher has locked chat for this live class. You can use it again when they reopen it.</p>
        </section>
      ) : (
        <section className={`student-room-chat-panel${isOpen ? ' is-open' : ''}${isMobileViewport ? ' is-mobile-sheet' : ''}`} aria-live="polite">
          <div className="student-room-chat-panel-head">
            <div>
              <p className="eyebrow">Class Chat</p>
              <strong>Messages</strong>
            </div>
            <button type="button" className="student-room-chat-close-btn" onClick={onClose}>
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
      <div className={`livekit-student-page student-room-chat-portal${isOpen ? ' is-open' : ''}${isDisabled ? ' is-disabled' : ''}`}>
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
  const optionEntries = Object.entries(activePoll?.options || {});

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

  return (
    <div className="livekit-student-poll-layer" aria-live="polite">
      <aside
        className={`livekit-student-poll-popup${selectedAnswer ? ' is-answered' : ''}${activePoll.revealed ? ' is-revealed' : ''}${isClosingPoll ? ' is-closing' : ''}`}
        role="dialog"
        aria-live="polite"
        aria-label="Live poll"
      >
        <div className="livekit-student-poll-head">
          <div>
            <p className="eyebrow">Live Poll</p>
            <strong>Choose the matching option</strong>
          </div>
          <div className="livekit-student-poll-head-meta">
            <span className="livekit-student-poll-badge">Answer once</span>
            <span className="livekit-student-poll-meta-pill">{optionEntries.length} options</span>
            <span className="livekit-student-poll-meta-pill">Question on teacher screen</span>
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
                disabled={Boolean(selectedAnswer)}
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
              ? `Results are in. You selected option ${selectedAnswer || 'not answered'}.`
              : selectedAnswer
                ? `You selected option ${selectedAnswer}.`
                : 'Tap one option to submit instantly.'}
          </strong>
          <p className="subtitle">
            {activePoll.revealed
              ? 'The teacher has revealed the correct answer for everyone in the room.'
              : selectedAnswer
                ? 'Waiting for teacher to reveal answer.'
                : 'Read the question from the shared PPT or teacher screen, then choose A, B, C, or D.'}
          </p>
        </div>
        {selectedAnswer && !activePoll.revealed ? (
          <p className="livekit-poll-answer-pending">Waiting for teacher to reveal answer.</p>
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

export default function StudentRoom({ classSession, onSessionRemoved, onLeave }) {
  const session = getSession();
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isImmersiveFallback, setIsImmersiveFallback] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [roomPolicy, setRoomPolicy] = useState(createDefaultRoomPolicy);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isFullscreenControlsVisible, setIsFullscreenControlsVisible] = useState(false);
  const [liveKitTheme, setLiveKitTheme] = useState(() => getLiveKitTheme(getDocumentTheme()));
  const roomShellRef = useRef(null);
  const hasInitializedViewportRef = useRef(false);
  const isImmersive = isFullscreen || isImmersiveFallback;

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
    if (!roomPolicy.chatDisabled) return;
    setIsChatOpen(false);
  }, [roomPolicy.chatDisabled]);

  useEffect(() => {
    if (!(isImmersive && isMobileViewport && isFullscreenControlsVisible)) return undefined;

    const timeoutId = window.setTimeout(() => {
      setIsFullscreenControlsVisible(false);
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [isFullscreenControlsVisible, isImmersive, isMobileViewport]);

  useEffect(() => {
    if (isImmersive && isMobileViewport) {
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

  function handleStageInteract() {
    if (!(isImmersive && isMobileViewport)) return;
    setIsFullscreenControlsVisible(true);
  }

  useEffect(() => () => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.remove('student-room-immersive');
    document.documentElement.classList.remove('student-room-fullscreen-active');
    document.body?.classList.remove('student-room-immersive');
    document.body?.classList.remove('student-room-fullscreen-active');
    exitImmersiveMobilePresentation();
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
    <section ref={roomShellRef} className={`card livekit-conference-card student-room-shell${isImmersive ? ' is-immersive' : ''}${isChatOpen ? ' has-chat-open' : ''}`}>
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
        <StudentStageConference isFullscreen={isImmersive} onToggleFullscreen={handleToggleFullscreen} onStageInteract={handleStageInteract} />
        <StudentRoomStatusOverlay />
        <RoomAudioRenderer />
        <StudentRoomControls
          policy={roomPolicy}
          onError={setErrorMessage}
          isChatOpen={isChatOpen}
          isImmersive={isImmersive}
          isMobileViewport={isMobileViewport}
          isOverlayVisible={!isImmersive || !isMobileViewport || isFullscreenControlsVisible}
          onToggleChat={() => setIsChatOpen((current) => !current)}
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
          onClose={() => setIsChatOpen(false)}
          isMobileViewport={isMobileViewport}
        />
        <StudentPollOverlay participantIdentity={`student-${session?.username || 'viewer'}-${classSession?._id || 'room'}`} onError={setErrorMessage} />
      </LiveKitRoom>
    </section>
  );
}