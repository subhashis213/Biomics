import { useEffect, useState } from 'react';
import { LiveKitRoom, RoomAudioRenderer, VideoConference, useRoomContext } from '@livekit/components-react';
import { RoomEvent, Track } from 'livekit-client';
import '@livekit/components-styles';
import { fetchStudentLivekitToken } from '../api';
import { getSession } from '../session';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
            <strong>Classroom question</strong>
          </div>
          <div className="livekit-student-poll-head-meta">
            <span className="livekit-student-poll-badge">Answer once</span>
            <span className="livekit-student-poll-meta-pill">{optionEntries.length} options</span>
          </div>
        </div>
        <div className="livekit-student-poll-question-card">
          <span className="livekit-student-poll-question-label">Question</span>
          <h3>{activePoll.question}</h3>
        </div>
        <div className="livekit-student-poll-options">
          {optionEntries.map(([key, label]) => {
            const isSelected = selectedAnswer === key;
            const isCorrect = activePoll.revealed && activePoll.correctOption === key;
            return (
              <button
                key={key}
                type="button"
                className={`livekit-student-poll-option${isSelected ? ' is-selected' : ''}${isCorrect ? ' is-correct' : ''}`}
                onClick={() => handleVote(key)}
                disabled={Boolean(selectedAnswer)}
              >
                <span className="livekit-student-poll-option-key">{key}</span>
                <span className="livekit-student-poll-option-copy">
                  <strong>Option {key}</strong>
                  <span>{label}</span>
                </span>
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
                : 'Choose one option to submit instantly.'}
          </strong>
          <p className="subtitle">
            {activePoll.revealed
              ? 'The teacher has revealed the correct answer for everyone in the room.'
              : selectedAnswer
                ? 'Waiting for teacher to reveal answer.'
                : 'Tap the answer card that best matches the question.'}
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

export default function StudentRoom({ classSession, onSessionRemoved }) {
  const session = getSession();
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

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
    <section className="card livekit-conference-card student-room-shell">
      <LiveKitRoom
        token={connectionInfo.token}
        serverUrl={connectionInfo.livekitUrl}
        connect
        audio
        video={false}
        data-lk-theme="default"
        onDisconnected={(reason) => {
          const rawReason = String(reason || '').trim();
          if (isRemovedFromSessionMessage(rawReason)) {
            setConnectionInfo(null);
            setErrorMessage('You were removed from the current live session by the admin.');
            onSessionRemoved?.('You were removed from the current live session by the admin.');
          }
        }}
      >
        <StudentRoomStatusOverlay />
        <VideoConference />
        <RoomAudioRenderer />
        <StudentPollOverlay participantIdentity={`student-${session?.username || 'viewer'}-${classSession?._id || 'room'}`} onError={setErrorMessage} />
      </LiveKitRoom>
    </section>
  );
}