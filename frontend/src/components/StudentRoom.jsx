import { useEffect, useMemo, useRef, useState } from 'react';
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

function StudentStageConference({ isFullscreen, onToggleFullscreen }) {
  const [screenShareZoom, setScreenShareZoom] = useState(1);
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
    }
  }, [screenShareTrack]);

  const hasScreenShare = Boolean(screenShareTrack);
  const canZoomOut = screenShareZoom > 1;
  const canZoomIn = screenShareZoom < 2.5;

  function handleZoomIn() {
    setScreenShareZoom((current) => Math.min(2.5, Number((current + 0.25).toFixed(2))));
  }

  function handleZoomOut() {
    setScreenShareZoom((current) => Math.max(1, Number((current - 0.25).toFixed(2))));
  }

  function handleZoomReset() {
    setScreenShareZoom(1);
  }

  return (
    <div className="student-video-conference student-video-conference--custom">
      <div className="student-video-conference-toolbar">
        <div className="student-video-conference-status">
          <span className="student-video-conference-status-pill">Classroom Focus</span>
          <strong>{screenShareTrack ? 'Teacher screen is being shared' : 'Teacher stage is pinned for mobile view'}</strong>
        </div>
        <button type="button" className="student-room-fullscreen-btn" onClick={onToggleFullscreen}>
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      </div>

      <div className={`student-video-conference-stage${supportingTracks.length ? '' : ' is-single'}${hasScreenShare ? ' has-screen-share' : ''}${isFullscreen ? ' is-fullscreen' : ''}`}>
        {primaryTrack ? (
          <div className={`student-video-conference-primary${hasScreenShare ? ' is-screen-share' : ''}`}>
            {hasScreenShare ? (
              <>
                <div className="student-screen-share-toolbar">
                  <div className="student-screen-share-copy">
                    <span className="student-screen-share-badge">Shared screen mode</span>
                    <strong>
                      {isFullscreen
                        ? 'Rotate or zoom if the shared slide looks cropped.'
                        : 'Use zoom controls when the shared question needs a closer look.'}
                    </strong>
                  </div>
                  <div className="student-screen-share-zoom-controls" role="group" aria-label="Screen share zoom controls">
                    <button type="button" className="student-screen-share-zoom-btn" onClick={handleZoomOut} disabled={!canZoomOut}>
                      -
                    </button>
                    <button type="button" className="student-screen-share-zoom-btn student-screen-share-zoom-btn--reset" onClick={handleZoomReset} disabled={screenShareZoom === 1}>
                      {Math.round(screenShareZoom * 100)}%
                    </button>
                    <button type="button" className="student-screen-share-zoom-btn" onClick={handleZoomIn} disabled={!canZoomIn}>
                      +
                    </button>
                  </div>
                </div>

                <div className="student-screen-share-viewport">
                  <div
                    className="student-screen-share-canvas"
                    style={{ '--student-screen-share-scale': screenShareZoom }}
                  >
                    <ParticipantTile trackRef={primaryTrack} className="student-video-conference-focus-tile student-screen-share-tile" />
                  </div>
                </div>

                <p className="student-screen-share-footnote">
                  {screenShareZoom > 1
                    ? 'Drag the shared screen to inspect hidden corners and detailed text.'
                    : 'If rotation makes the teacher slide look small, zoom in here without affecting the rest of the room.'}
                </p>
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
          <div className={`student-video-conference-support-rail${hasScreenShare ? ' has-screen-share' : ''}${isFullscreen ? ' is-fullscreen' : ''}`}>
            <TrackLoop tracks={supportingTracks}>
              <ParticipantTile />
            </TrackLoop>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StudentRoomControls({ policy, onError, onLeave, isChatOpen, onToggleChat }) {
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
      await room.localParticipant.setMicrophoneEnabled(nextEnabled);
      setIsMicEnabled(nextEnabled);
    } catch (error) {
      onError?.(error.message || 'Failed to update microphone state.');
    }
  }

  function handleLeaveRoom() {
    room?.disconnect();
    onLeave?.();
  }

  return (
    <div className="student-room-controls" aria-label="Student room controls">
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

function StudentRoomChatPanel({ policy, isOpen, onClose }) {
  if (policy.chatDisabled) {
    return (
      <section className="student-room-chat-panel is-disabled" aria-live="polite">
        <div className="student-room-chat-panel-head">
          <div>
            <p className="eyebrow">Class Chat</p>
            <strong>Chat is turned off</strong>
          </div>
        </div>
        <p className="student-room-chat-disabled-copy">The teacher has locked chat for this live class. You can use it again when they reopen it.</p>
      </section>
    );
  }

  return (
    <section className={`student-room-chat-panel${isOpen ? ' is-open' : ''}`} aria-live="polite">
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
  );
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
  const [roomPolicy, setRoomPolicy] = useState(createDefaultRoomPolicy);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [liveKitTheme, setLiveKitTheme] = useState(() => getLiveKitTheme(getDocumentTheme()));
  const roomShellRef = useRef(null);

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

    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const syncChatState = (event) => {
      setIsChatOpen(!event.matches);
    };

    syncChatState(mediaQuery);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncChatState);
      return () => mediaQuery.removeEventListener('change', syncChatState);
    }

    mediaQuery.addListener(syncChatState);
    return () => mediaQuery.removeListener(syncChatState);
  }, []);

  useEffect(() => {
    if (!roomPolicy.chatDisabled) return;
    setIsChatOpen(false);
  }, [roomPolicy.chatDisabled]);

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
        return;
      }

      if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen();
      }
    } catch (error) {
      setErrorMessage(error?.message || 'Fullscreen mode is not available on this device.');
    }
  }

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
    <section ref={roomShellRef} className="card livekit-conference-card student-room-shell">
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
        <StudentStageConference isFullscreen={isFullscreen} onToggleFullscreen={handleToggleFullscreen} />
        <StudentRoomStatusOverlay />
        <RoomAudioRenderer />
        <StudentRoomControls
          policy={roomPolicy}
          onError={setErrorMessage}
          isChatOpen={isChatOpen}
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
        />
        <StudentPollOverlay participantIdentity={`student-${session?.username || 'viewer'}-${classSession?._id || 'room'}`} onError={setErrorMessage} />
      </LiveKitRoom>
    </section>
  );
}