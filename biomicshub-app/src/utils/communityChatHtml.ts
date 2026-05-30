import type { CommunityChatToken } from '@/src/api/chat';
import type { ThemeMode } from '@/src/theme/theme';
import { colorsForMode } from '@/src/theme/theme';

export function buildCommunityChatHtml(config: CommunityChatToken, mode: ThemeMode = 'dark') {
  const colors = colorsForMode(mode);
  const cfg = JSON.stringify(config);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <script src="https://cdn.jsdelivr.net/npm/stream-chat@8.40.0/dist/browser.full-bundle.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: ${colors.bg}; color: ${colors.text}; }
    #app { display: flex; flex-direction: column; height: 100%; }
    #header { padding: 14px 16px; background: ${colors.card}; border-bottom: 1px solid ${colors.border}; }
    #header h1 { font-size: 16px; font-weight: 800; color: ${colors.text}; }
    #header p { font-size: 12px; color: ${colors.muted}; margin-top: 4px; }
    #msgs { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; background: ${colors.bg}; }
    .msg { max-width: 88%; padding: 10px 12px; border-radius: 14px; line-height: 1.4; font-size: 14px; word-break: break-word; }
    .msg.me { align-self: flex-end; background: ${colors.accent}; color: ${colors.accentText}; border-bottom-right-radius: 4px; }
    .msg.them { align-self: flex-start; background: ${colors.cardAlt}; border: 1px solid ${colors.border}; color: ${colors.text}; border-bottom-left-radius: 4px; }
    .meta { font-size: 11px; opacity: 0.75; margin-bottom: 4px; font-weight: 700; }
    .time { font-size: 10px; opacity: 0.6; margin-top: 4px; }
    #status { padding: 10px 16px; color: ${colors.muted}; font-size: 13px; text-align: center; }
    #form { display: flex; gap: 8px; padding: 12px 16px; background: ${colors.card}; border-top: 1px solid ${colors.border}; }
    #input { flex: 1; border: 1px solid ${colors.border}; background: ${colors.cardAlt}; color: ${colors.text}; border-radius: 12px; padding: 12px 14px; font-size: 15px; outline: none; }
    #send { border: 0; background: ${colors.accent}; color: ${colors.accentText}; font-weight: 800; border-radius: 12px; padding: 0 18px; font-size: 14px; }
    .err { color: ${colors.danger}; padding: 16px; text-align: center; }
  </style>
</head>
<body>
  <div id="app">
    <div id="header"><h1>Biomics Community</h1><p id="sub">Connecting…</p></div>
    <div id="status">Loading chat…</div>
    <div id="msgs"></div>
    <form id="form" style="display:none">
      <input id="input" placeholder="Type a message…" autocomplete="off" />
      <button id="send" type="submit">Send</button>
    </form>
  </div>
  <script>
    const CONFIG = ${cfg};
    const MY_ID = CONFIG.user.id;
    const msgsEl = document.getElementById('msgs');
    const statusEl = document.getElementById('status');
    const subEl = document.getElementById('sub');
    const form = document.getElementById('form');
    const input = document.getElementById('input');
    let channel = null;

    function fmtTime(d) {
      try { return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
    }

    function renderMessage(m) {
      const mine = m.user && m.user.id === MY_ID;
      const div = document.createElement('div');
      div.className = 'msg ' + (mine ? 'me' : 'them');
      div.innerHTML = '<div class="meta">' + (mine ? 'You' : (m.user?.name || 'Member')) + '</div>'
        + '<div>' + (m.text || '').replace(/</g,'&lt;') + '</div>'
        + '<div class="time">' + fmtTime(m.created_at) + '</div>';
      msgsEl.appendChild(div);
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function showError(msg) {
      statusEl.innerHTML = '<span class="err">' + msg + '</span>';
      form.style.display = 'none';
    }

    async function init() {
      if (!window.StreamChat) throw new Error('Chat SDK failed to load.');
      const client = StreamChat.getInstance(CONFIG.apiKey);
      await client.connectUser(CONFIG.user, CONFIG.token);
      channel = client.channel(CONFIG.channel.type, CONFIG.channel.id);
      await channel.watch({ state: true, presence: true });
      await channel.markRead().catch(function(){});
      const members = Object.keys(channel.state.members || {}).length;
      subEl.textContent = members + ' member' + (members === 1 ? '' : 's') + ' · live';
      statusEl.style.display = 'none';
      form.style.display = 'flex';
      (channel.state.messages || []).forEach(renderMessage);
      channel.on('message.new', function(e) { if (e.message) renderMessage(e.message); });
      form.addEventListener('submit', async function(ev) {
        ev.preventDefault();
        const text = (input.value || '').trim();
        if (!text) return;
        input.value = '';
        try { await channel.sendMessage({ text }); } catch (e) { alert(e.message || 'Send failed'); }
      });
    }
    init().catch(function(e) { showError(e.message || 'Failed to connect.'); });
  </script>
</body>
</html>`;
}
