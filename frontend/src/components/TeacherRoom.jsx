import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chat,
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

function getDocumentTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme')
    || document.body?.getAttribute('data-theme')
    || 'dark';
}

function getLiveKitTheme(theme) {
  return 'black';
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const BOOT_COUNTDOWN_SECONDS = 60;

function formatCountdown(value) {
  const total = Math.max(0, Number(value || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function createEmptyResults() {
  return { A: 0, B: 0, C: 0, D: 0 };
}

function getPollTimerSeconds(value) {
  const normalized = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return normalized;
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

function createDefaultRoomPolicy() {
  return {
    studentsMuted: false,
    chatDisabled: false
  };
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

function TeacherAudienceControlPanel({ onError, policy, onPolicyChange }) {
  const room = useRoomContext();

  const publishPolicy = useCallback(async (nextPolicy) => {
    if (!room) return;
    try {
      await room.localParticipant.publishData(encoder.encode(JSON.stringify({
        type: 'room-policy',
        policy: nextPolicy
      })), { reliable: true });
    } catch (error) {
      onError?.(error.message || 'Failed to update audience controls.');
    }
  }, [onError, room]);

  useEffect(() => {
    if (!room) return undefined;

    function syncPolicyToNewParticipant() {
      publishPolicy(policy);
    }

    room.on(RoomEvent.ParticipantConnected, syncPolicyToNewParticipant);
    return () => room.off(RoomEvent.ParticipantConnected, syncPolicyToNewParticipant);
  }, [policy, publishPolicy, room]);

  async function handleTogglePolicy(key) {
    const nextPolicy = {
      ...policy,
      [key]: !policy[key]
    };

    onPolicyChange(nextPolicy);
    await publishPolicy(nextPolicy);
  }

  return (
    <section className="card livekit-audience-controls-panel">
      <div className="section-header compact livekit-audience-controls-headline">
        <div>
          <p className="eyebrow">Audience Controls</p>
          <h3>Student room locks</h3>
          <p className="subtitle">Control room-wide student audio and chat access from the studio sidebar.</p>
        </div>
      </div>

      <div className="livekit-audience-controls-grid">
        <article className={`livekit-audience-control-card${policy.studentsMuted ? ' is-active' : ''}`}>
          <div>
            <strong>Mute all students</strong>
            <p>Forces every student mic off and keeps the student mic control locked until you allow it again.</p>
          </div>
          <button type="button" className={`secondary-btn livekit-audience-toggle-btn${policy.studentsMuted ? ' is-active' : ''}`} onClick={() => handleTogglePolicy('studentsMuted')}>
            {policy.studentsMuted ? 'Allow student mics' : 'Mute all now'}
          </button>
        </article>

        <article className={`livekit-audience-control-card${policy.chatDisabled ? ' is-active' : ''}`}>
          <div>
            <strong>Turn off chat</strong>
            <p>Locks the live chat panel so room messaging stays closed until you reopen it.</p>
          </div>
          <button type="button" className={`secondary-btn livekit-audience-toggle-btn${policy.chatDisabled ? ' is-active' : ''}`} onClick={() => handleTogglePolicy('chatDisabled')}>
            {policy.chatDisabled ? 'Turn chat back on' : 'Turn chat off'}
          </button>
        </article>
      </div>
    </section>
  );
}

function TeacherPollConsole({ onError }) {
  const room = useRoomContext();
  const [draft, setDraft] = useState({
    correctOption: 'A',
    timerSeconds: '45'
  });
  const [activePoll, setActivePoll] = useState(null);
  const [activePollTimeRemaining, setActivePollTimeRemaining] = useState(0);
  const [results, setResults] = useState(createEmptyResults());
  const [voteSnapshots, setVoteSnapshots] = useState([]);
  const votesRef = useRef(new Map());

  useEffect(() => {
    if (!activePoll?.closesAt) {
      setActivePollTimeRemaining(0);
      return undefined;
    }

    const syncCountdown = () => {
      setActivePollTimeRemaining(getPollTimeRemaining(activePoll.closesAt));
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
        if (message?.type === 'poll-answer' && activePoll && message?.pollId === activePoll.id) {
          if (activePoll.closesAt && getPollTimeRemaining(activePoll.closesAt) <= 0) {
            return;
          }

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
    const options = {
      A: 'Option A',
      B: 'Option B',
      C: 'Option C',
      D: 'Option D'
    };
    const timerSeconds = getPollTimerSeconds(draft.timerSeconds);
    const closesAt = timerSeconds > 0 ? Date.now() + (timerSeconds * 1000) : null;

    const nextPoll = {
      id: `poll-${Date.now().toString(36)}`,
      question: '',
      options,
      correctOption: draft.correctOption,
      revealed: false,
      timerSeconds,
      closesAt
    };

    votesRef.current = new Map();
    setResults(createEmptyResults());
    setVoteSnapshots([]);
    setActivePoll(nextPoll);
    setActivePollTimeRemaining(timerSeconds);
    await publishDataMessage({ type: 'poll-create', poll: nextPoll });
  }

  async function handleRevealAnswer() {
    if (!activePoll) return;
    const nextPoll = { ...activePoll, revealed: true };
    setActivePoll(nextPoll);
    await publishDataMessage({ type: 'poll-reveal', pollId: activePoll.id, correctOption: activePoll.correctOption });
  }

  async function handleClearPoll() {
    if (!activePoll) return;
    const pollId = activePoll.id;
    votesRef.current = new Map();
    setResults(createEmptyResults());
    setVoteSnapshots([]);
    setActivePoll(null);
    await publishDataMessage({ type: 'poll-clear', pollId });
  }

  const resultRows = useMemo(() => [
    { key: 'A', label: 'Option A', count: results.A },
    { key: 'B', label: 'Option B', count: results.B },
    { key: 'C', label: 'Option C', count: results.C },
    { key: 'D', label: 'Option D', count: results.D }
  ], [results]);

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
  const isPollTimerEnabled = getPollTimerSeconds(draft.timerSeconds) > 0;
  const isActivePollClosed = Boolean(activePoll?.closesAt) && activePollTimeRemaining <= 0;

  return (
    <section className="card livekit-poll-panel">
      <div className="section-header compact livekit-poll-headline">
        <div>
          <p className="eyebrow">Live Polls</p>
          <h3>MCQ Command Deck</h3>
          <p className="subtitle">Show fixed A, B, C, and D choices to students while the question stays on your PPT or shared screen, then reveal the correct option and clear the poll when you are done.</p>
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
        <article className="livekit-poll-summary-card accent-slate">
          <span>Poll Timer</span>
          <strong>
            {activePoll
              ? activePoll.closesAt
                ? formatPollTimer(activePollTimeRemaining)
                : 'No timer'
              : isPollTimerEnabled
                ? formatPollTimer(getPollTimerSeconds(draft.timerSeconds))
                : 'No timer'}
          </strong>
          <p>
            {activePoll
              ? activePoll.closesAt
                ? isActivePollClosed
                  ? 'Voting window has closed for students.'
                  : 'Countdown is running for the live poll.'
                : 'Students can answer until you clear or reveal the poll.'
              : 'Set how long the student answer dock stays open.'}
          </p>
        </article>
      </div>

      <div className="livekit-poll-composer">
        <div className="livekit-poll-fixed-options-strip" aria-label="Student option set preview">
          {['A', 'B', 'C', 'D'].map((key) => (
            <span key={key} className="livekit-poll-fixed-option-pill">Option {key}</span>
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

          <label>
            <span>Poll Timer</span>
            <select
              value={draft.timerSeconds}
              onChange={(event) => setDraft((current) => ({ ...current, timerSeconds: event.target.value }))}
            >
              <option value="0">No timer</option>
              <option value="15">15 seconds</option>
              <option value="30">30 seconds</option>
              <option value="45">45 seconds</option>
              <option value="60">1 minute</option>
              <option value="90">1 minute 30 seconds</option>
              <option value="120">2 minutes</option>
            </select>
          </label>

          <button type="button" className="primary-btn" onClick={handleSendPoll}>
            Show Options
          </button>
          <button type="button" className="secondary-btn" onClick={handleRevealAnswer} disabled={!activePoll || activePoll.revealed}>
            {activePoll?.revealed ? 'Answer Revealed' : 'Reveal Answer'}
          </button>
          <button type="button" className="secondary-btn" onClick={handleClearPoll} disabled={!activePoll}>
            Clear Poll
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
  const [roomPolicy, setRoomPolicy] = useState(createDefaultRoomPolicy);
  const [liveKitTheme, setLiveKitTheme] = useState(() => getLiveKitTheme(getDocumentTheme()));
  const intentionalDisconnectRef = useRef(false);
  const suppressedRoomNameRef = useRef('');
  const autoStartRequestKeyRef = useRef('');
  const serverPollRequestRef = useRef(0);
  const bootCountdownDeadlineRef = useRef(0);

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
    if (!isBooting) {
      bootCountdownDeadlineRef.current = 0;
      if (countdown !== 0) {
        setCountdown(0);
      }
      return undefined;
    }

    const tickCountdown = () => {
      const deadline = Number(bootCountdownDeadlineRef.current || 0);
      if (!deadline) {
        setCountdown(BOOT_COUNTDOWN_SECONDS);
        return;
      }

      const remainingSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setCountdown(remainingSeconds);
    };

    tickCountdown();
    const intervalId = window.setInterval(tickCountdown, 1000);

    return () => window.clearInterval(intervalId);
  }, [isBooting]);

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
      await wait(initialDelay);
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const refreshed = await fetchLiveClassServerStatus().catch(() => null);
      if (refreshed?.server) {
        setServerStatus(refreshed.server);
        const nextState = String(refreshed.server.state || '').trim().toLowerCase();
        if (nextState === 'running') {
          return refreshed.server;
        }
      }

      const remainingAttempts = maxAttempts - attempt - 1;
      if (remainingAttempts <= 0) break;
      // eslint-disable-next-line no-await-in-loop
      await wait(intervalMs);
    }

    const error = new Error('EC2 server did not become ready in time. Please try again.');
    error.statusCode = 504;
    throw error;
  }, []);

  const waitForLiveKitReady = useCallback(async (options = {}) => {
    const { initialDelay = 1500, maxAttempts = 24, intervalMs = 2500 } = options;
    let lastFailureMessage = '';

    if (initialDelay > 0) {
      await wait(initialDelay);
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetchLivekitServiceState().catch(() => null);
      if (response?.ready) {
        setLivekitServiceReady(true);
        return response;
      }

      lastFailureMessage = String(response?.hint || response?.message || '').trim();

      setLivekitServiceReady(false);
      const remainingAttempts = maxAttempts - attempt - 1;
      if (remainingAttempts <= 0) break;
      // eslint-disable-next-line no-await-in-loop
      await wait(intervalMs);
    }

    const error = new Error(lastFailureMessage || 'LiveKit signal service is not ready yet. Please wait a few seconds and try again.');
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
    bootCountdownDeadlineRef.current = Date.now() + (BOOT_COUNTDOWN_SECONDS * 1000);
    setCountdown(BOOT_COUNTDOWN_SECONDS);
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

      setBootStatusMessage('EC2 is ready. Checking the LiveKit signal service...');
      try {
        await waitForLiveKitReady({ maxAttempts: 8, intervalMs: 2000 });
      } catch (error) {
        setLivekitServiceReady(false);
        setBootStatusMessage((error?.message || 'LiveKit readiness check did not confirm the signal service.') + ' Continuing to activate the class and connect...');
      }

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
  }, [classSession, onSessionStarted, serverStatus?.state, waitForLiveKitReady, waitForServerReady]);

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
              <p>Launch MCQ polls instantly and review responses in the command deck placed directly below the teaching stage.</p>
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
          data-lk-theme={liveKitTheme}
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
            <div className="livekit-studio-main-column">
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
                    <p className="subtitle">This panel is your teaching stage. Use the room controls below for microphone, camera, and screen share, then manage live polls from the command deck right underneath the video area.</p>
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

              <TeacherPollConsole onError={setErrorMessage} />
            </div>

            <aside className="livekit-studio-side-column">
              <TeacherAudienceControlPanel onError={setErrorMessage} policy={roomPolicy} onPolicyChange={setRoomPolicy} />
              <section className="card livekit-studio-chat-panel">
                <div className="section-header compact livekit-chat-headline">
                  <div>
                    <p className="eyebrow">Live Chat</p>
                    <h3>Room messages</h3>
                    <p className="subtitle">Send updates to students and follow replies in real time while the class is live.</p>
                  </div>
                </div>
                {roomPolicy.chatDisabled ? (
                  <div className="livekit-chat-disabled-state" role="status" aria-live="polite">
                    <strong>Chat is turned off for the room.</strong>
                    <p>Students cannot use chat until you switch it back on from Audience Controls.</p>
                  </div>
                ) : <Chat />}
              </section>
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