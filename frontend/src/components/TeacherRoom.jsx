import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ControlBar,
  FocusLayout,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  TrackLoop,
  useRoomContext,
  useTracks
} from '@livekit/components-react';
import { isTrackReference } from '@livekit/components-core';
import { RoomEvent } from 'livekit-client';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import {
  endLivekitClass,
  fetchTeacherLivekitToken,
  fetchLiveClassServerStatus,
  fetchLivekitServiceState,
  startLiveClassServer,
  startLivekitClass
} from '../api';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitWithCountdown(totalMs, setCountdown) {
  const duration = Math.max(0, Number(totalMs || 0));
  if (!duration) {
    setCountdown(0);
    return;
  }

  const deadline = Date.now() + duration;
  while (true) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    setCountdown(Math.ceil(remainingMs / 1000));
    // eslint-disable-next-line no-await-in-loop
    await wait(Math.min(1000, remainingMs));
  }

  setCountdown(0);
}

function formatCountdown(value) {
  const total = Math.max(0, Number(value || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function createEmptyResults() {
  return { A: 0, B: 0, C: 0, D: 0 };
}

function formatParticipantLabel(participantIdentity) {
  const raw = String(participantIdentity || '').trim();
  if (!raw) return 'Anonymous student';

  if (raw.startsWith('student-')) {
    const withoutPrefix = raw.slice('student-'.length);
    const lastSeparator = withoutPrefix.lastIndexOf('-');
    const username = lastSeparator > 0 ? withoutPrefix.slice(0, lastSeparator) : withoutPrefix;
    return username.replace(/[_-]+/g, ' ').trim() || 'Student';
  }

  return raw.replace(/[_-]+/g, ' ').trim();
}

function formatDisconnectReason(reason) {
  const raw = String(reason || '').trim();
  if (!raw) return '';
  return raw
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, (value) => value.toUpperCase());
}

function getTrackIdentity(trackReference) {
  if (!trackReference) return '';
  const trackSid = String(trackReference?.publication?.trackSid || '').trim();
  if (trackSid) return trackSid;
  return `${String(trackReference?.participant?.identity || '').trim()}::${String(trackReference?.source || '').trim()}`;
}

function TeacherStageConference() {
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

  const primaryTrack = useMemo(() => {
    if (screenShareTrack) return screenShareTrack;
    return tracks.find((trackReference) => isTrackReference(trackReference)) || tracks[0] || null;
  }, [screenShareTrack, tracks]);

  const supportingTracks = useMemo(() => {
    if (!primaryTrack) return tracks;
    const primaryIdentity = getTrackIdentity(primaryTrack);
    return tracks.filter((trackReference) => getTrackIdentity(trackReference) !== primaryIdentity);
  }, [primaryTrack, tracks]);

  return (
    <div className="teacher-video-conference teacher-video-conference--custom">
      <div className="teacher-video-conference-stage">
        {primaryTrack ? (
          <div className="teacher-video-conference-primary">
            <FocusLayout trackRef={primaryTrack} className="teacher-video-conference-focus-tile" />
          </div>
        ) : (
          <div className="teacher-video-conference-grid-wrapper">
            <GridLayout tracks={tracks}>
              <ParticipantTile />
            </GridLayout>
          </div>
        )}

        {primaryTrack && supportingTracks.length ? (
          <div className="teacher-video-conference-support-rail">
            <TrackLoop tracks={supportingTracks}>
              <ParticipantTile />
            </TrackLoop>
          </div>
        ) : null}
      </div>

      <ControlBar controls={{ chat: false, settings: false }} />
    </div>
  );
}

function TeacherPollConsole({ onError }) {
  const room = useRoomContext();
  const [draft, setDraft] = useState({
    question: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correctOption: 'A'
  });
  const [activePoll, setActivePoll] = useState(null);
  const [results, setResults] = useState(createEmptyResults());
  const [voteSnapshots, setVoteSnapshots] = useState([]);
  const votesRef = useRef(new Map());

  useEffect(() => {
    if (!room) return undefined;

    function handleData(payload) {
      try {
        const message = JSON.parse(decoder.decode(payload));
        if (message?.type === 'poll-answer' && activePoll && message?.pollId === activePoll.id) {
          const participantKey = String(message.participantIdentity || '').trim();
          const answer = String(message.answer || '').trim().toUpperCase();
          if (!participantKey || !['A', 'B', 'C', 'D'].includes(answer)) return;

          votesRef.current.set(participantKey, answer);
          const nextResults = createEmptyResults();
          votesRef.current.forEach((value) => {
            if (nextResults[value] !== undefined) nextResults[value] += 1;
          });
          setResults(nextResults);
          setVoteSnapshots(Array.from(votesRef.current.entries()).map(([identity, value]) => ({ identity, value })));
        }
      } catch (_) {
        // Ignore malformed payloads.
      }
    }

    room.on(RoomEvent.DataReceived, handleData);
    return () => room.off(RoomEvent.DataReceived, handleData);
  }, [room, activePoll]);

  async function publishDataMessage(message) {
    if (!room) return;
    try {
      await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable: true });
    } catch (error) {
      onError?.(error.message || 'Failed to publish live poll data.');
    }
  }

  async function handleSendPoll() {
    const question = String(draft.question || '').trim();
    const options = {
      A: String(draft.optionA || '').trim(),
      B: String(draft.optionB || '').trim(),
      C: String(draft.optionC || '').trim(),
      D: String(draft.optionD || '').trim()
    };

    if (!question || Object.values(options).some((value) => !value)) {
      onError?.('Complete the poll question and all four options before sending the poll.');
      return;
    }

    const nextPoll = {
      id: `poll-${Date.now().toString(36)}`,
      question,
      options,
      correctOption: draft.correctOption,
      revealed: false
    };

    votesRef.current = new Map();
    setResults(createEmptyResults());
    setVoteSnapshots([]);
    setActivePoll(nextPoll);
    await publishDataMessage({ type: 'poll-create', poll: nextPoll });
  }

  async function handleRevealAnswer() {
    if (!activePoll) return;
    const nextPoll = { ...activePoll, revealed: true };
    setActivePoll(nextPoll);
    await publishDataMessage({ type: 'poll-reveal', pollId: activePoll.id, correctOption: activePoll.correctOption });
  }

  const resultRows = useMemo(() => [
    { key: 'A', label: draft.optionA || activePoll?.options?.A || 'Option A', count: results.A },
    { key: 'B', label: draft.optionB || activePoll?.options?.B || 'Option B', count: results.B },
    { key: 'C', label: draft.optionC || activePoll?.options?.C || 'Option C', count: results.C },
    { key: 'D', label: draft.optionD || activePoll?.options?.D || 'Option D', count: results.D }
  ], [draft.optionA, draft.optionB, draft.optionC, draft.optionD, activePoll, results]);

  const totalResponses = useMemo(
    () => resultRows.reduce((sum, item) => sum + item.count, 0),
    [resultRows]
  );

  const topChoice = useMemo(() => {
    if (!totalResponses) return null;
    return [...resultRows].sort((left, right) => right.count - left.count)[0] || null;
  }, [resultRows, totalResponses]);

  const optionVoters = useMemo(() => {
    const grouped = { A: [], B: [], C: [], D: [] };
    voteSnapshots.forEach(({ identity, value }) => {
      if (grouped[value]) {
        grouped[value].push(formatParticipantLabel(identity));
      }
    });
    return grouped;
  }, [voteSnapshots]);

  const maxVotes = Math.max(...resultRows.map((item) => item.count), 1);

  return (
    <section className="card livekit-poll-panel">
      <div className="section-header compact livekit-poll-headline">
        <div>
          <p className="eyebrow">Live Polls</p>
          <h3>MCQ Command Deck</h3>
          <p className="subtitle">Launch a four-option poll instantly, watch response momentum build live, and reveal the correct answer when the class is ready.</p>
        </div>
      </div>

      <div className="livekit-poll-summary-grid">
        <article className="livekit-poll-summary-card accent-cyan">
          <span>Total Responses</span>
          <strong>{totalResponses}</strong>
          <p>{totalResponses ? 'Students who have answered the current poll.' : 'Waiting for the first response.'}</p>
        </article>
        <article className="livekit-poll-summary-card accent-amber">
          <span>Top Choice</span>
          <strong>{topChoice ? `${topChoice.key} · ${topChoice.label}` : 'No top choice yet'}</strong>
          <p>{topChoice ? `${Math.round((topChoice.count / totalResponses) * 100)}% of students currently prefer this option.` : 'Percent share appears after students vote.'}</p>
        </article>
        <article className="livekit-poll-summary-card accent-emerald">
          <span>Correct Answer</span>
          <strong>{activePoll?.correctOption ? `Option ${activePoll.correctOption}` : `Option ${draft.correctOption}`}</strong>
          <p>{activePoll?.revealed ? 'Revealed to students.' : 'Hidden from students until you reveal it.'}</p>
        </article>
      </div>

      <div className="livekit-poll-composer">
        <label>
          <span>Question</span>
          <input
            type="text"
            value={draft.question}
            onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))}
            placeholder="Ask the class a quick MCQ"
          />
        </label>

        <div className="livekit-poll-option-grid">
          {['A', 'B', 'C', 'D'].map((key) => (
            <label key={key}>
              <span>Option {key}</span>
              <input
                type="text"
                value={draft[`option${key}`]}
                onChange={(event) => setDraft((current) => ({ ...current, [`option${key}`]: event.target.value }))}
                placeholder={`Option ${key}`}
              />
            </label>
          ))}
        </div>

        <div className="livekit-poll-actions">
          <label>
            <span>Correct Answer</span>
            <select
              value={draft.correctOption}
              onChange={(event) => setDraft((current) => ({ ...current, correctOption: event.target.value }))}
            >
              <option value="A">Option A</option>
              <option value="B">Option B</option>
              <option value="C">Option C</option>
              <option value="D">Option D</option>
            </select>
          </label>

          <button type="button" className="primary-btn" onClick={handleSendPoll}>
            Send Poll
          </button>
          <button type="button" className="secondary-btn" onClick={handleRevealAnswer} disabled={!activePoll || activePoll.revealed}>
            {activePoll?.revealed ? 'Answer Revealed' : 'Reveal Correct Answer'}
          </button>
        </div>
      </div>

      <div className="livekit-poll-results">
        {resultRows.map((item) => (
          <article key={item.key} className={`livekit-poll-result-card${activePoll?.revealed && activePoll.correctOption === item.key ? ' is-correct' : ''}`}>
            <div className="livekit-poll-result-head">
              <div className="livekit-poll-result-title">
                <strong>{item.key}</strong>
                <span>{item.label}</span>
              </div>
              <div className="livekit-poll-result-metrics">
                <strong>{item.count}</strong>
                <small>{totalResponses ? `${Math.round((item.count / totalResponses) * 100)}% avg share` : '0% avg share'}</small>
              </div>
            </div>
            <div className="livekit-poll-result-track">
              <div className="livekit-poll-result-fill" style={{ width: `${(item.count / maxVotes) * 100}%` }} />
            </div>
            <div className="livekit-poll-voter-list">
              {optionVoters[item.key]?.length ? optionVoters[item.key].map((name) => (
                <span key={`${item.key}-${name}`} className="livekit-poll-voter-chip">{name}</span>
              )) : <span className="livekit-poll-voter-empty">No students picked this option yet.</span>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function TeacherRoom({ classSession, onSessionStarted, onSessionEnded, autoStart = false }) {
  const [serverStatus, setServerStatus] = useState(null);
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [bootStatusMessage, setBootStatusMessage] = useState('');
  const [isBooting, setIsBooting] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [connectionState, setConnectionState] = useState('idle');
  const [disconnectMessage, setDisconnectMessage] = useState('');
  const [shouldConnect, setShouldConnect] = useState(false);
  const [optimisticLiveClassId, setOptimisticLiveClassId] = useState('');
  const [isStartingClass, setIsStartingClass] = useState(false);
  const [livekitServiceReady, setLivekitServiceReady] = useState(false);
  const intentionalDisconnectRef = useRef(false);
  const suppressedRoomNameRef = useRef('');
  const autoStartRequestKeyRef = useRef('');
  const serverPollRequestRef = useRef(0);

  const pollServerStatusUntilStopped = useCallback(async (options = {}) => {
    const { initialDelay = 4000, maxAttempts = 18, intervalMs = 5000 } = options;
    const requestId = serverPollRequestRef.current + 1;
    serverPollRequestRef.current = requestId;

    if (initialDelay > 0) {
      await wait(initialDelay);
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (serverPollRequestRef.current !== requestId) return;

      const refreshed = await fetchLiveClassServerStatus().catch(() => null);
      if (serverPollRequestRef.current !== requestId) return;

      if (refreshed?.server) {
        setServerStatus(refreshed.server);
        const nextState = String(refreshed.server.state || '').trim().toLowerCase();
        if (nextState === 'stopped') {
          setDisconnectMessage('Live class ended and the EC2 server stopped successfully.');
          return;
        }

        if (nextState && nextState !== 'stopping' && nextState !== 'shutting-down') {
          return;
        }
      }

      await wait(intervalMs);
    }

    if (serverPollRequestRef.current === requestId) {
      setDisconnectMessage('Live class ended. EC2 shutdown is still in progress. Refresh to check the latest server state.');
    }
  }, []);

  const waitForServerReady = useCallback(async (options = {}) => {
    const { initialDelay = 2500, maxAttempts = 18, intervalMs = 5000 } = options;

    if (initialDelay > 0) {
      await waitWithCountdown(initialDelay, setCountdown);
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const refreshed = await fetchLiveClassServerStatus().catch(() => null);
      if (refreshed?.server) {
        setServerStatus(refreshed.server);
        const nextState = String(refreshed.server.state || '').trim().toLowerCase();
        if (nextState === 'running') {
          setCountdown(0);
          return refreshed.server;
        }
      }

      const remainingAttempts = maxAttempts - attempt - 1;
      if (remainingAttempts <= 0) break;
      // eslint-disable-next-line no-await-in-loop
      await waitWithCountdown(intervalMs, setCountdown);
    }

    setCountdown(0);
    const error = new Error('EC2 server did not become ready in time. Please try again.');
    error.statusCode = 504;
    throw error;
  }, []);

  const waitForLiveKitReady = useCallback(async (options = {}) => {
    const { initialDelay = 1500, maxAttempts = 24, intervalMs = 2500 } = options;

    if (initialDelay > 0) {
      await waitWithCountdown(initialDelay, setCountdown);
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetchLivekitServiceState().catch(() => null);
      if (response?.ready) {
        setLivekitServiceReady(true);
        setCountdown(0);
        return response;
      }

      setLivekitServiceReady(false);
      const remainingAttempts = maxAttempts - attempt - 1;
      if (remainingAttempts <= 0) break;
      // eslint-disable-next-line no-await-in-loop
      await waitWithCountdown(intervalMs, setCountdown);
    }

    setCountdown(0);
    const error = new Error('LiveKit signal service is not ready yet. Please wait a few seconds and try again.');
    error.statusCode = 504;
    throw error;
  }, []);

  useEffect(() => {
    const currentClassId = String(classSession?._id || '').trim();
    const liveStatus = String(classSession?.status || '').trim().toLowerCase();
    if (currentClassId && liveStatus === 'live' && optimisticLiveClassId === currentClassId) {
      setOptimisticLiveClassId('');
    }
  }, [classSession?._id, classSession?.status, optimisticLiveClassId]);

  useEffect(() => {
    let cancelled = false;
    const currentRoomName = String(classSession?.roomName || '').trim();
    const currentClassId = String(classSession?._id || '').trim();
    const classStatus = String(classSession?.status || '').trim().toLowerCase();
    const classIsLive = classStatus === 'live'
      || (currentClassId && optimisticLiveClassId === currentClassId);

    if (!classSession?._id) {
      setConnectionInfo(null);
      setConnectionState('idle');
      setDisconnectMessage('');
      setErrorMessage('');
      setShouldConnect(false);
      setOptimisticLiveClassId('');
      suppressedRoomNameRef.current = '';
      return undefined;
    }

    if (!classIsLive) {
      setConnectionInfo(null);
      setConnectionState('idle');
      setDisconnectMessage('');
      setShouldConnect(false);
      if (suppressedRoomNameRef.current === currentRoomName) {
        suppressedRoomNameRef.current = '';
      }
      return undefined;
    }

    if (suppressedRoomNameRef.current && suppressedRoomNameRef.current === currentRoomName) {
      setConnectionInfo(null);
      setConnectionState('idle');
      setShouldConnect(false);
      return undefined;
    }

    const connectedRoomName = String(connectionInfo?.roomName || '').trim();
    if (connectionInfo?.token && connectedRoomName === currentRoomName) {
      setShouldConnect(true);
      return undefined;
    }

    if (classStatus !== 'live' || isBooting || isStartingClass) {
      return undefined;
    }

    intentionalDisconnectRef.current = false;
    fetchTeacherLivekitToken(classSession._id)
      .then((data) => {
        if (!cancelled) {
          setConnectionInfo(data);
          setConnectionState('connecting');
          setDisconnectMessage('');
          setShouldConnect(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error.message || 'Failed to reconnect to the teacher studio.');
          setShouldConnect(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [classSession?._id, classSession?.status, classSession?.roomName, connectionInfo?.roomName, connectionInfo?.token, optimisticLiveClassId, isBooting, isStartingClass]);

  useEffect(() => {
    fetchLiveClassServerStatus()
      .then((data) => {
        setServerStatus(data?.server || null);
        if (String(data?.server?.state || '').trim().toLowerCase() === 'stopping') {
          setDisconnectMessage((current) => current || 'Live class ended. Waiting for the EC2 server to stop...');
          pollServerStatusUntilStopped({ initialDelay: 2500 });
        }
      })
      .catch(() => {});

    fetchLivekitServiceState()
      .then((data) => setLivekitServiceReady(Boolean(data?.ready)))
      .catch(() => setLivekitServiceReady(false));
  }, []);

  const handleStartClass = useCallback(async () => {
    if (!classSession?._id) {
      setErrorMessage('Create or select a live class session first.');
      return;
    }

    setErrorMessage('');
    setIsBooting(true);
    setIsStartingClass(true);
    setConnectionState('connecting');
    setDisconnectMessage('');
    setBootStatusMessage('Checking EC2 and preparing the teacher studio...');
    serverPollRequestRef.current += 1;
    intentionalDisconnectRef.current = false;
    suppressedRoomNameRef.current = '';
    setShouldConnect(true);

    try {
      setOptimisticLiveClassId(String(classSession._id || '').trim());
      const existingServerState = String(serverStatus?.state || '').trim().toLowerCase();
      const serverResponse = await startLiveClassServer();
      const nextServerState = String(serverResponse?.server?.state || '').trim();
      setServerStatus(serverResponse?.server || null);

      if (nextServerState.toLowerCase() === 'running' || existingServerState === 'running') {
        setBootStatusMessage('EC2 is already running. Activating the live classroom...');
      } else {
        setBootStatusMessage('EC2 start requested. Waiting for the live class server to become ready...');
        await waitForServerReady();
      }

      setBootStatusMessage('EC2 is ready. Waiting for the LiveKit signal service to come online...');
      await waitForLiveKitReady();

      setBootStatusMessage('LiveKit is ready. Activating the live class and fetching teacher access...');
      const startResponse = await startLivekitClass(classSession._id);
      const tokenResponse = await fetchTeacherLivekitToken(classSession._id);
      setConnectionInfo(tokenResponse);
      setLivekitServiceReady(true);
      setBootStatusMessage('Teacher studio is ready. Connecting to the room...');
      onSessionStarted?.(startResponse?.liveClass || classSession || null);
    } catch (error) {
      setOptimisticLiveClassId('');
      setShouldConnect(false);
      setLivekitServiceReady(false);
      setErrorMessage(error.message || 'Failed to start the live class studio.');
    } finally {
      setCountdown(0);
      setBootStatusMessage('');
      setIsStartingClass(false);
      setIsBooting(false);
    }
  }, [classSession, onSessionStarted, serverStatus?.state, waitForServerReady]);

  const handleEndClass = useCallback(async () => {
    if (!classSession?._id) return;
    setIsShuttingDown(true);
    setErrorMessage('');
    setDisconnectMessage('');
    setBootStatusMessage('');
    setIsStartingClass(false);
    serverPollRequestRef.current += 1;
    intentionalDisconnectRef.current = true;
    setOptimisticLiveClassId('');
    suppressedRoomNameRef.current = String(classSession?.roomName || '').trim();
    setShouldConnect(false);

    try {
      const endResponse = await endLivekitClass(classSession._id);
      setConnectionInfo(null);
      setConnectionState('idle');
      if (endResponse?.server) {
        setServerStatus(endResponse.server);
        if (String(endResponse.server.state || '').trim().toLowerCase() === 'stopping') {
          setDisconnectMessage('Live class ended. Waiting for the EC2 server to stop...');
          pollServerStatusUntilStopped();
        } else if (String(endResponse.server.state || '').trim().toLowerCase() === 'stopped') {
          setDisconnectMessage('Live class ended and the EC2 server stopped successfully.');
        }
      } else {
        const refreshedServer = await fetchLiveClassServerStatus().catch(() => null);
        setServerStatus(refreshedServer?.server || null);
        if (String(refreshedServer?.server?.state || '').trim().toLowerCase() === 'stopping') {
          setDisconnectMessage('Live class ended. Waiting for the EC2 server to stop...');
          pollServerStatusUntilStopped();
        }
      }
      onSessionEnded?.(classSession?._id);
    } catch (error) {
      intentionalDisconnectRef.current = false;
      setErrorMessage(error.message || 'Failed to end the live class.');
    } finally {
      setIsShuttingDown(false);
    }
  }, [classSession, onSessionEnded, pollServerStatusUntilStopped]);

  const handleReconnectStudio = useCallback(async () => {
    if (!classSession?._id) return;
    setErrorMessage('');
    setConnectionState('connecting');
    setDisconnectMessage('');
    intentionalDisconnectRef.current = false;
    suppressedRoomNameRef.current = '';
    setOptimisticLiveClassId(String(classSession?._id || '').trim());
    setShouldConnect(true);
    try {
      const tokenResponse = await fetchTeacherLivekitToken(classSession._id);
      setConnectionInfo(tokenResponse);
      setLivekitServiceReady(true);
    } catch (error) {
      setOptimisticLiveClassId('');
      setShouldConnect(false);
      setErrorMessage(error.message || 'Failed to reconnect to the teacher studio.');
    }
  }, [classSession?._id]);

  useEffect(() => {
    if (!autoStart || !classSession?._id || classSession?.status === 'live' || isBooting || isShuttingDown) {
      return;
    }

    const requestKey = String(classSession._id);
    if (autoStartRequestKeyRef.current === requestKey) {
      return;
    }

    autoStartRequestKeyRef.current = requestKey;
    handleStartClass();
  }, [autoStart, classSession?._id, classSession?.status, handleStartClass, isBooting, isShuttingDown]);

  function handleLeaveStudio() {
    if (!classSession?._id) return;

    intentionalDisconnectRef.current = true;
    suppressedRoomNameRef.current = String(classSession?.roomName || '').trim();
    setShouldConnect(false);
    setConnectionInfo(null);
    setConnectionState('idle');
    setErrorMessage('');
    setBootStatusMessage('');
    setIsStartingClass(false);
    setOptimisticLiveClassId('');
    setDisconnectMessage('You left the studio. Press Reconnect to join again.');
  }

  const normalizedServerState = String(serverStatus?.state || 'unknown').toLowerCase();
  const normalizedConnectionState = String(connectionState || 'idle').toLowerCase();
  const accessLabel = String(classSession?.course ? `${classSession.course} course access` : 'Course-based access').trim();

  return (
    <div className="livekit-room-shell teacher-room-shell">
      <section className="card livekit-room-toolbar">
        <div>
          <p className="eyebrow">Teacher Studio</p>
          <h3>{classSession?.title || 'Live class studio'}</h3>
          <p className="subtitle">A dedicated studio for camera, microphone, live poll control, and course-based classroom access. Eligible students can discover the live session from their dashboard and join when the class goes live.</p>
        </div>

        <div className="livekit-room-toolbar-actions">
          <button type="button" className="primary-btn" onClick={handleStartClass} disabled={isBooting || isShuttingDown || !classSession?._id}>
            {isBooting ? `Booting ${formatCountdown(countdown)}` : 'Start Class'}
          </button>
          <button type="button" className="secondary-btn" onClick={handleReconnectStudio} disabled={isBooting || !classSession?._id}>
            Reconnect
          </button>
          <button type="button" className="secondary-btn" onClick={handleLeaveStudio} disabled={isBooting || isShuttingDown || !connectionInfo?.token}>
            Leave Studio
          </button>
          <button type="button" className="danger-btn" onClick={handleEndClass} disabled={isShuttingDown || !classSession?._id}>
            {isShuttingDown ? 'Ending...' : 'End Class'}
          </button>
        </div>

        <div className="livekit-server-status-strip">
          <span className={`livekit-server-pill state-${String(serverStatus?.state || 'unknown').toLowerCase()}`}>{serverStatus?.state || 'unknown'}</span>
          <span className={`livekit-server-pill connection-${normalizedConnectionState}`}>{connectionState}</span>
          <span className={`livekit-server-pill ${livekitServiceReady ? 'connection-connected' : 'connection-connecting'}`}>Signal {livekitServiceReady ? 'ready' : 'booting'}</span>
          <span>EC2: {serverStatus?.instanceId || 'Not configured'}</span>
          <span>Room: {classSession?.roomName || 'Not assigned'}</span>
          <span>{accessLabel}</span>
        </div>

        <div className="livekit-studio-toolbar-grid" aria-label="Teacher studio quick overview">
          <article className="livekit-studio-toolbar-card">
            <span className="livekit-studio-toolbar-icon" aria-hidden="true">🎬</span>
            <div>
              <strong>Broadcast Stage</strong>
              <p>Run camera, mic, and screen share from one focused studio room.</p>
            </div>
          </article>
          <article className="livekit-studio-toolbar-card">
            <span className="livekit-studio-toolbar-icon" aria-hidden="true">🛰️</span>
            <div>
              <strong>Connection Chain</strong>
              <p>EC2 boot, teacher token, and LiveKit room status stay visible while you teach.</p>
            </div>
          </article>
          <article className="livekit-studio-toolbar-card">
            <span className="livekit-studio-toolbar-icon" aria-hidden="true">🗳️</span>
            <div>
              <strong>Live Poll Control</strong>
              <p>Launch MCQ polls instantly and watch vote bars update inside the studio sidebar.</p>
            </div>
          </article>
        </div>

        {errorMessage ? <p className="banner error">{errorMessage}</p> : null}
        {disconnectMessage ? <p className="banner warning">{disconnectMessage}</p> : null}
      </section>

      {isBooting ? (
        <section className="card livekit-boot-card">
          <div className="livekit-spinner" aria-hidden="true" />
          <strong>Preparing LiveKit on AWS EC2</strong>
          <p>{bootStatusMessage || 'The class server is booting. Connecting automatically as soon as the backend reports the server is ready.'}</p>
          {countdown > 0 ? <span>{formatCountdown(countdown)} remaining</span> : <span>Working...</span>}
        </section>
      ) : null}

      {connectionInfo?.token && connectionInfo?.livekitUrl ? (
        <LiveKitRoom
          token={connectionInfo.token}
          serverUrl={connectionInfo.livekitUrl}
          connect={shouldConnect}
          audio
          video
          data-lk-theme="black"
          onConnected={() => {
            intentionalDisconnectRef.current = false;
            setConnectionState('connected');
            setDisconnectMessage('');
          }}
          onDisconnected={(reason) => {
            if (intentionalDisconnectRef.current) {
              setConnectionState('idle');
              setDisconnectMessage('');
              setErrorMessage('');
              return;
            }

            setConnectionState('disconnected');
            const formattedReason = formatDisconnectReason(reason);
            if (isStartingClass && /client initiated disconnect/i.test(formattedReason)) {
              setDisconnectMessage('Studio is switching into the live room. Reconnecting automatically...');
              return;
            }
            setShouldConnect(false);
            setDisconnectMessage(formattedReason ? `Studio disconnected: ${formattedReason}. Press Reconnect to join again.` : 'Studio disconnected. Press Reconnect to join again.');
          }}
          onError={(error) => {
            setConnectionState('error');
            setShouldConnect(false);
            setErrorMessage(error?.message || 'Teacher studio failed to connect.');
          }}
        >
          <div className="livekit-studio-grid">
            <section className="card livekit-conference-card livekit-studio-room-panel">
              <div className="livekit-studio-room-head">
                <div className="livekit-studio-room-copy">
                  <div className="livekit-stage-title-band">
                    <span className="livekit-stage-live-indicator">
                      <span className="livekit-stage-live-dot" aria-hidden="true" />
                      Live Broadcast
                    </span>
                    <p className="eyebrow">Live Room</p>
                  </div>
                  <h4>Teacher broadcast and classroom stage</h4>
                  <p className="subtitle">This panel is your teaching stage. Use the room controls below for microphone, camera, and screen share while polls and class operations stay in the studio sidebar.</p>
                </div>
                <div className="livekit-studio-room-pills">
                  <span className={`livekit-server-pill state-${normalizedServerState}`}>{serverStatus?.state || 'unknown'}</span>
                  <span className={`livekit-server-pill connection-${normalizedConnectionState}`}>{connectionState}</span>
                </div>
              </div>
              <div className="livekit-teacher-stage-shell">
                <div className="livekit-teacher-stage-toolbar" aria-hidden="true">
                  <span className="livekit-teacher-stage-chip">Mic</span>
                  <span className="livekit-teacher-stage-chip">Camera</span>
                  <span className="livekit-teacher-stage-chip">Share Screen</span>
                </div>
                <TeacherStageConference />
              </div>
              <div className="livekit-teacher-stage-note">
                <strong>Room controls stay visible at the bottom of the stage.</strong>
                <span>Use them to mute or unmute, start video, pick devices, and share your screen during class.</span>
              </div>
              <RoomAudioRenderer />
            </section>

            <aside className="livekit-studio-side-column">
              <TeacherPollConsole onError={setErrorMessage} />
            </aside>
          </div>
        </LiveKitRoom>
      ) : (
        <section className="card livekit-empty-room-card">
          <strong>Teacher room not connected yet</strong>
          <p>Press Start Class to boot the EC2 instance, activate the scheduled live class, fetch the teacher token, and open the dedicated studio layout.</p>
        </section>
      )}
    </div>
  );
}