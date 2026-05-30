import type { ThemeMode } from '@/src/theme/theme';
import { colorsForMode } from '@/src/theme/theme';

export type LiveRoomConfig = {
  role: 'teacher' | 'student';
  displayName: string;
  livekitUrl: string;
  token: string;
  roomName: string;
  classTitle?: string;
};

export function buildLiveClassRoomHtml(config: LiveRoomConfig, mode: ThemeMode = 'light') {
  const colors = colorsForMode(mode);
  const cfg = JSON.stringify(config);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <script src="https://cdn.jsdelivr.net/npm/livekit-client@2.7.0/dist/livekit-client.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: ${colors.bg}; color: ${colors.text}; overflow: hidden; }
    #app { display: flex; flex-direction: column; height: 100%; }
    #header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; background: ${colors.card}; border-bottom: 1px solid ${colors.border}; }
    #header h1 { font-size: 15px; font-weight: 800; }
    #header p { font-size: 11px; color: ${colors.muted}; margin-top: 2px; }
    .pill { display: inline-flex; align-items: center; gap: 6px; background: ${colors.accentSoft}; color: ${colors.accent}; font-size: 10px; font-weight: 800; padding: 5px 10px; border-radius: 999px; white-space: nowrap; }
    .live-dot { width: 7px; height: 7px; border-radius: 50%; background: #ef4444; animation: pulse 1.4s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
    #main { flex: 1; display: flex; min-height: 0; position: relative; }
    #stage-wrap { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #050505; position: relative; }
    #status { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 2; font-size: 13px; color: #cbd5e1; text-align: center; padding: 0 20px; }
    #stage { flex: 1; position: relative; overflow: hidden; background: #000; }
    #primary-slot, #pip-slot { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
    #primary-slot video, #pip-slot video { width: 100%; height: 100%; object-fit: contain; background: #000; }
    #pip-slot { inset: auto; right: 12px; bottom: 12px; width: 112px; height: 156px; border-radius: 14px; overflow: hidden; border: 2px solid rgba(255,255,255,.85); box-shadow: 0 12px 32px rgba(0,0,0,.45); z-index: 5; touch-action: none; }
    #pip-slot.hidden { display: none; }
    #pip-label { position: absolute; left: 8px; bottom: 8px; font-size: 9px; font-weight: 800; color: #fff; background: rgba(0,0,0,.55); padding: 3px 6px; border-radius: 999px; z-index: 6; pointer-events: none; }
    #share-badge { position: absolute; top: 12px; left: 12px; z-index: 4; background: rgba(13,148,136,.92); color: #fff; font-size: 10px; font-weight: 800; padding: 6px 10px; border-radius: 999px; display: none; }
    #share-badge.show { display: inline-flex; align-items: center; gap: 6px; }
    #chat-panel { width: 0; overflow: hidden; background: ${colors.card}; border-left: 1px solid ${colors.border}; display: flex; flex-direction: column; transition: width .22s ease; }
    #chat-panel.open { width: min(320px, 88vw); }
    #chat-head { padding: 12px 14px; border-bottom: 1px solid ${colors.border}; display: flex; align-items: center; justify-content: space-between; }
    #chat-head strong { font-size: 14px; }
    #chat-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .chat-msg { max-width: 92%; padding: 8px 10px; border-radius: 12px; font-size: 13px; line-height: 1.35; word-break: break-word; }
    .chat-msg.me { align-self: flex-end; background: ${colors.accent}; color: ${colors.accentText}; border-bottom-right-radius: 4px; }
    .chat-msg.them { align-self: flex-start; background: ${colors.cardAlt}; color: ${colors.text}; border-bottom-left-radius: 4px; }
    .chat-meta { font-size: 10px; opacity: .75; margin-bottom: 3px; font-weight: 700; }
    #chat-disabled { padding: 16px; color: ${colors.muted}; font-size: 13px; text-align: center; display: none; }
    #chat-form { display: flex; gap: 8px; padding: 10px; border-top: 1px solid ${colors.border}; }
    #chat-input { flex: 1; border: 1px solid ${colors.border}; background: ${colors.cardAlt}; color: ${colors.text}; border-radius: 10px; padding: 10px 12px; font-size: 14px; }
    #chat-send { border: 0; border-radius: 10px; padding: 10px 14px; font-weight: 800; font-size: 13px; background: ${colors.accent}; color: ${colors.accentText}; }
    #controls { display: none; gap: 8px; padding: 10px 12px; background: ${colors.card}; border-top: 1px solid ${colors.border}; flex-wrap: wrap; justify-content: center; align-items: center; }
    #controls.show { display: flex; }
    button.ctrl { border: 0; border-radius: 999px; padding: 11px 16px; font-weight: 800; font-size: 12px; background: ${colors.cardAlt}; color: ${colors.text}; border: 1px solid ${colors.border}; min-width: 72px; }
    button.ctrl.on { background: ${colors.accentSoft}; color: ${colors.accent}; border-color: ${colors.accent}; }
    button.ctrl.danger { background: ${colors.danger}; color: #fff; border-color: ${colors.danger}; }
    button.ctrl.primary { background: ${colors.accent}; color: ${colors.accentText}; border-color: ${colors.accent}; }
    .err { color: ${colors.danger}; }
  </style>
</head>
<body>
  <div id="app">
    <div id="header">
      <div>
        <h1 id="title">Live class</h1>
        <p id="sub">Connecting…</p>
      </div>
      <span class="pill"><span class="live-dot"></span><span id="role-pill">Live</span></span>
    </div>
    <div id="main">
      <div id="stage-wrap">
        <div id="status">Preparing room…</div>
        <div id="stage">
          <div id="share-badge">📺 Screen share</div>
          <div id="primary-slot"></div>
          <div id="pip-slot" class="hidden"><span id="pip-label">Teacher</span></div>
        </div>
      </div>
      <aside id="chat-panel">
        <div id="chat-head">
          <div><p style="font-size:10px;font-weight:800;color:${colors.muted};letter-spacing:.08em">CLASS CHAT</p><strong>Messages</strong></div>
          <button type="button" id="chat-close" class="ctrl" style="min-width:auto;padding:8px 12px">✕</button>
        </div>
        <div id="chat-disabled">Chat is locked by the teacher.</div>
        <div id="chat-messages"></div>
        <form id="chat-form">
          <input id="chat-input" type="text" maxlength="500" placeholder="Type a message…" autocomplete="off" />
          <button id="chat-send" type="submit">Send</button>
        </form>
      </aside>
    </div>
    <div id="controls">
      <button type="button" id="chat-btn" class="ctrl primary">Chat</button>
      <button type="button" id="mic-btn" class="ctrl">Mic</button>
      <button type="button" id="cam-btn" class="ctrl" style="display:none">Camera</button>
      <button type="button" id="share-btn" class="ctrl" style="display:none">Share</button>
      <button type="button" id="leave-btn" class="ctrl danger">Leave</button>
    </div>
  </div>
  <script>
    const CONFIG = ${cfg};
    const LK = window.LivekitClient;
    const statusEl = document.getElementById('status');
    const subEl = document.getElementById('sub');
    const titleEl = document.getElementById('title');
    const rolePill = document.getElementById('role-pill');
    const controls = document.getElementById('controls');
    const primarySlot = document.getElementById('primary-slot');
    const pipSlot = document.getElementById('pip-slot');
    const shareBadge = document.getElementById('share-badge');
    const chatPanel = document.getElementById('chat-panel');
    const chatMessages = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatDisabled = document.getElementById('chat-disabled');
    const chatBtn = document.getElementById('chat-btn');
    const chatClose = document.getElementById('chat-close');
    const micBtn = document.getElementById('mic-btn');
    const camBtn = document.getElementById('cam-btn');
    const shareBtn = document.getElementById('share-btn');
    const leaveBtn = document.getElementById('leave-btn');

    let room = null;
    let micOn = false;
    let camOn = false;
    let shareOn = false;
    let chatOpen = false;
    let chatDisabledFlag = false;
    let studentsMuted = false;
    let primaryTrackSid = '';
    let pipTrackSid = '';
    const attached = new Map();
    const chatLog = [];

    titleEl.textContent = CONFIG.classTitle || 'Live class';
    subEl.textContent = CONFIG.displayName;
    rolePill.textContent = CONFIG.role === 'teacher' ? 'Teacher' : 'Student';
    if (CONFIG.role === 'teacher') { camBtn.style.display = 'inline-block'; shareBtn.style.display = 'inline-block'; }

    function showError(msg) {
      statusEl.innerHTML = '<span class="err">' + msg + '</span>';
      controls.classList.remove('show');
    }

    function hideStatus() { statusEl.style.display = 'none'; }

    function isTeacherParticipant(p) {
      if (!p) return false;
      const id = String(p.identity || '').toLowerCase();
      return CONFIG.role === 'teacher' ? p.isLocal : !id.startsWith('student-') || id.includes('admin') || id.includes('teacher');
    }

    function findTeacherParticipant() {
      if (!room) return null;
      if (CONFIG.role === 'teacher') return room.localParticipant;
      const remotes = Array.from(room.remoteParticipants.values());
      return remotes.find(isTeacherParticipant) || remotes[0] || null;
    }

    function getPublication(participant, source) {
      if (!participant) return null;
      const pubs = participant.trackPublications || participant.videoTrackPublications;
      if (pubs && typeof pubs.values === 'function') {
        for (const pub of pubs.values()) {
          if (pub.source === source && pub.track) return pub;
        }
      }
      return participant.getTrackPublication ? participant.getTrackPublication(source) : null;
    }

    function clearSlot(slot) {
      while (slot.firstChild) slot.removeChild(slot.firstChild);
    }

    function mountTrack(track, slot, sid) {
      clearSlot(slot);
      const el = track.attach();
      el.playsInline = true;
      el.autoplay = true;
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.objectFit = slot === pipSlot ? 'cover' : 'contain';
      slot.appendChild(el);
      attached.set(sid, { track, slot, el });
    }

    function detachSid(sid) {
      const entry = attached.get(sid);
      if (!entry) return;
      try { entry.track.detach().forEach(function(n){ n.remove(); }); } catch(e) {}
      attached.delete(sid);
    }

    function layoutTracks() {
      const teacher = findTeacherParticipant();
      const screenPub = getPublication(teacher, LK.Track.Source.ScreenShare);
      const camPub = getPublication(teacher, LK.Track.Source.Camera);
      const hasScreen = Boolean(screenPub && screenPub.track && !screenPub.isMuted);
      const hasCam = Boolean(camPub && camPub.track && !camPub.isMuted);

      shareBadge.classList.toggle('show', hasScreen);

      if (hasScreen && screenPub.track) {
        const sid = screenPub.trackSid || screenPub.track.sid || 'screen';
        if (primaryTrackSid !== sid) { detachSid(primaryTrackSid); primaryTrackSid = sid; mountTrack(screenPub.track, primarySlot, sid); }
        if (hasCam && camPub.track) {
          const psid = camPub.trackSid || camPub.track.sid || 'cam';
          pipSlot.classList.remove('hidden');
          if (pipTrackSid !== psid) { detachSid(pipTrackSid); pipTrackSid = psid; mountTrack(camPub.track, pipSlot, psid); }
        } else {
          pipSlot.classList.add('hidden');
          if (pipTrackSid) { detachSid(pipTrackSid); pipTrackSid = ''; }
        }
      } else if (hasCam && camPub.track) {
        pipSlot.classList.add('hidden');
        if (pipTrackSid) { detachSid(pipTrackSid); pipTrackSid = ''; }
        const sid = camPub.trackSid || camPub.track.sid || 'cam-main';
        if (primaryTrackSid !== sid) { detachSid(primaryTrackSid); primaryTrackSid = sid; mountTrack(camPub.track, primarySlot, sid); }
      } else {
        shareBadge.classList.remove('show');
        pipSlot.classList.add('hidden');
      }
    }

    function subscribeParticipant(participant) {
      if (!participant) return;
      participant.trackPublications.forEach(function(pub) {
        pub.on('subscribed', function() { layoutTracks(); });
        pub.on('unsubscribed', function() { layoutTracks(); });
        pub.on('muted', function() { layoutTracks(); });
        pub.on('unmuted', function() { layoutTracks(); });
      });
      layoutTracks();
    }

    function formatName(participant) {
      const id = String(participant?.identity || participant?.name || 'Guest');
      if (id.startsWith('student-')) return id.slice(8).split('-')[0].replace(/[_-]+/g, ' ') || 'Student';
      return id.replace(/[_-]+/g, ' ').trim() || 'Teacher';
    }

    function renderChat() {
      chatMessages.innerHTML = '';
      chatLog.forEach(function(item) {
        const wrap = document.createElement('div');
        wrap.className = 'chat-msg ' + (item.me ? 'me' : 'them');
        wrap.innerHTML = '<div class="chat-meta">' + item.name + '</div><div>' + item.text.replace(/</g,'&lt;') + '</div>';
        chatMessages.appendChild(wrap);
      });
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function pushChat(text, participant, isLocal) {
      chatLog.push({ text: text, name: isLocal ? 'You' : formatName(participant), me: isLocal });
      if (chatLog.length > 120) chatLog.shift();
      renderChat();
    }

    function setChatOpen(open) {
      chatOpen = open;
      chatPanel.classList.toggle('open', open);
      chatBtn.classList.toggle('on', open);
    }

    function syncChatUi() {
      const locked = chatDisabledFlag;
      chatDisabled.style.display = locked ? 'block' : 'none';
      chatForm.style.display = locked ? 'none' : 'flex';
      chatInput.disabled = locked;
      if (locked) chatInput.value = '';
    }

    function setupPipDrag() {
      let dragging = false;
      let startX = 0, startY = 0, origX = 0, origY = 0;
      pipSlot.addEventListener('pointerdown', function(e) {
        dragging = true;
        startX = e.clientX; startY = e.clientY;
        const rect = pipSlot.getBoundingClientRect();
        const stageRect = document.getElementById('stage').getBoundingClientRect();
        origX = rect.left - stageRect.left;
        origY = rect.top - stageRect.top;
        pipSlot.setPointerCapture(e.pointerId);
      });
      pipSlot.addEventListener('pointermove', function(e) {
        if (!dragging) return;
        const stageRect = document.getElementById('stage').getBoundingClientRect();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const maxX = stageRect.width - pipSlot.offsetWidth - 8;
        const maxY = stageRect.height - pipSlot.offsetHeight - 8;
        const x = Math.min(Math.max(8, origX + dx), maxX);
        const y = Math.min(Math.max(8, origY + dy), maxY);
        pipSlot.style.right = 'auto';
        pipSlot.style.bottom = 'auto';
        pipSlot.style.left = x + 'px';
        pipSlot.style.top = y + 'px';
      });
      pipSlot.addEventListener('pointerup', function() { dragging = false; });
    }

    async function connectRoom() {
      if (!LK) throw new Error('LiveKit client failed to load.');
      room = new LK.Room({ adaptiveStream: true, dynacast: true });

      room.on(LK.RoomEvent.TrackSubscribed, function() { layoutTracks(); });
      room.on(LK.RoomEvent.TrackUnsubscribed, function() { layoutTracks(); });
      room.on(LK.RoomEvent.ParticipantConnected, function(p) { subscribeParticipant(p); });
      room.on(LK.RoomEvent.ParticipantDisconnected, function() { layoutTracks(); });
      room.on(LK.RoomEvent.LocalTrackPublished, function() { layoutTracks(); });
      room.on(LK.RoomEvent.LocalTrackUnpublished, function() { layoutTracks(); });
      room.on(LK.RoomEvent.TrackMuted, function() { layoutTracks(); });
      room.on(LK.RoomEvent.TrackUnmuted, function() { layoutTracks(); });

      room.on(LK.RoomEvent.ChatMessage, function(msg, participant) {
        pushChat(String(msg.message || ''), participant, participant?.isLocal);
      });

      room.on(LK.RoomEvent.DataReceived, function(payload) {
        try {
          const message = JSON.parse(new TextDecoder().decode(payload));
          if (message?.type === 'room-policy' && message.policy) {
            chatDisabledFlag = Boolean(message.policy.chatDisabled);
            studentsMuted = Boolean(message.policy.studentsMuted);
            syncChatUi();
            if (studentsMuted && CONFIG.role === 'student' && room) {
              room.localParticipant.setMicrophoneEnabled(false);
              micOn = false;
              micBtn.textContent = 'Mic off';
              micBtn.classList.remove('on');
            }
          }
        } catch(e) {}
      });

      statusEl.textContent = 'Joining live room…';
      await room.connect(CONFIG.livekitUrl, CONFIG.token);
      room.remoteParticipants.forEach(function(p) { subscribeParticipant(p); });

      if (CONFIG.role === 'teacher') {
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);
        micOn = true; camOn = true;
        micBtn.textContent = 'Mic on'; micBtn.classList.add('on');
        camBtn.textContent = 'Camera on'; camBtn.classList.add('on');
      } else {
        micBtn.textContent = 'Mic off';
      }

      hideStatus();
      controls.classList.add('show');
      subEl.textContent = 'Connected · ' + room.remoteParticipants.size + ' online';
      layoutTracks();
      setupPipDrag();
      syncChatUi();
    }

    chatBtn.addEventListener('click', function() { setChatOpen(!chatOpen); });
    chatClose.addEventListener('click', function() { setChatOpen(false); });

    chatForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      if (!room || chatDisabledFlag) return;
      const text = String(chatInput.value || '').trim();
      if (!text) return;
      chatInput.value = '';
      try {
        await room.localParticipant.sendChatMessage(text);
        pushChat(text, room.localParticipant, true);
      } catch(err) {
        pushChat('Could not send message.', room.localParticipant, true);
      }
    });

    micBtn.addEventListener('click', async function() {
      if (!room || (CONFIG.role === 'student' && studentsMuted)) return;
      micOn = !micOn;
      await room.localParticipant.setMicrophoneEnabled(micOn);
      micBtn.textContent = micOn ? 'Mic on' : 'Mic off';
      micBtn.classList.toggle('on', micOn);
    });

    camBtn.addEventListener('click', async function() {
      if (!room || CONFIG.role !== 'teacher') return;
      camOn = !camOn;
      await room.localParticipant.setCameraEnabled(camOn);
      camBtn.textContent = camOn ? 'Camera on' : 'Camera off';
      camBtn.classList.toggle('on', camOn);
      layoutTracks();
    });

    shareBtn.addEventListener('click', async function() {
      if (!room || CONFIG.role !== 'teacher') return;
      try {
        shareOn = !shareOn;
        await room.localParticipant.setScreenShareEnabled(shareOn, { audio: false });
        shareBtn.textContent = shareOn ? 'Stop share' : 'Share';
        shareBtn.classList.toggle('on', shareOn);
        layoutTracks();
      } catch(err) {
        shareOn = false;
        shareBtn.textContent = 'Share';
        alert('Screen share is not available on this device.');
      }
    });

    leaveBtn.addEventListener('click', async function() {
      try { if (room) await room.disconnect(); } catch(e) {}
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'leave' }));
    });

    connectRoom().catch(function(e) { showError(e.message || 'Failed to join live class.'); });
  </script>
</body>
</html>`;
}
