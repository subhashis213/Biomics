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
    .attachment img { max-width: 220px; border-radius: 10px; margin-top: 6px; display: block; }
    .attachment a { color: inherit; text-decoration: underline; font-weight: 700; display: inline-block; margin-top: 6px; }
    #status { padding: 10px 16px; color: ${colors.muted}; font-size: 13px; text-align: center; }
    #form { display: flex; gap: 8px; padding: 12px 16px; background: ${colors.card}; border-top: 1px solid ${colors.border}; align-items: center; }
    #attach { border: 1px solid ${colors.border}; background: ${colors.cardAlt}; color: ${colors.text}; font-weight: 800; border-radius: 12px; width: 44px; height: 44px; font-size: 20px; line-height: 1; }
    #input { flex: 1; border: 1px solid ${colors.border}; background: ${colors.cardAlt}; color: ${colors.text}; border-radius: 12px; padding: 12px 14px; font-size: 15px; outline: none; }
    #send { border: 0; background: ${colors.accent}; color: ${colors.accentText}; font-weight: 800; border-radius: 12px; padding: 0 18px; font-size: 14px; height: 44px; }
    .err { color: ${colors.danger}; padding: 16px; text-align: center; }
    .uploading { font-size: 11px; opacity: 0.7; margin-top: 4px; }
  </style>
</head>
<body>
  <div id="app">
    <div id="header"><h1>Biomics Community</h1><p id="sub">Connecting…</p></div>
    <div id="status">Loading chat…</div>
    <div id="msgs"></div>
    <form id="form" style="display:none">
      <button id="attach" type="button" aria-label="Attach file">📎</button>
      <input id="input" placeholder="Type a message…" autocomplete="off" />
      <button id="send" type="submit">Send</button>
    </form>
  </div>
  <script>
    const CONFIG = ${cfg};
    const MY_ID = CONFIG.user.id;
    const API_BASE = CONFIG.apiBase || '';
    const msgsEl = document.getElementById('msgs');
    const statusEl = document.getElementById('status');
    const subEl = document.getElementById('sub');
    const form = document.getElementById('form');
    const input = document.getElementById('input');
    const attachBtn = document.getElementById('attach');
    let channel = null;
    let pendingAttachment = null;

    function assetUrl(path) {
      if (!path) return '';
      if (/^https?:\\/\\//i.test(path)) return path;
      return API_BASE + path;
    }

    function fmtTime(d) {
      try { return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
    }

    function escapeHtml(value) {
      return String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function renderAttachments(attachments) {
      if (!attachments || !attachments.length) return '';
      return attachments.map(function(att) {
        const type = String(att.type || '').toLowerCase();
        const url = assetUrl(att.asset_url || att.image_url || att.thumb_url || '');
        const title = escapeHtml(att.title || att.fallback || 'Attachment');
        if (type === 'image' && url) {
          return '<div class="attachment"><img src="' + escapeHtml(url) + '" alt="' + title + '" /></div>';
        }
        if (url) {
          return '<div class="attachment"><a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + title + '</a></div>';
        }
        return '';
      }).join('');
    }

    function renderMessage(m) {
      const mine = m.user && m.user.id === MY_ID;
      const div = document.createElement('div');
      div.className = 'msg ' + (mine ? 'me' : 'them');
      div.innerHTML = '<div class="meta">' + (mine ? 'You' : escapeHtml(m.user?.name || 'Member')) + '</div>'
        + (m.text ? '<div>' + escapeHtml(m.text) + '</div>' : '')
        + renderAttachments(m.attachments)
        + '<div class="time">' + fmtTime(m.created_at) + '</div>';
      msgsEl.appendChild(div);
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function showError(msg) {
      statusEl.innerHTML = '<span class="err">' + escapeHtml(msg) + '</span>';
      form.style.display = 'none';
    }

    function updateMemberSubtitle() {
      const count = Math.max(0, Number(CONFIG.registeredMemberCount || 0));
      subEl.textContent = count + ' registered member' + (count === 1 ? '' : 's') + ' · live';
    }

    async function sendCurrentMessage() {
      const text = (input.value || '').trim();
      if (!text && !pendingAttachment) return;
      const payload = { text: text || undefined };
      if (pendingAttachment) {
        payload.attachments = [pendingAttachment];
      }
      input.value = '';
      pendingAttachment = null;
      try {
        await channel.sendMessage(payload);
      } catch (e) {
        alert(e.message || 'Send failed');
      }
    }

    async function uploadAttachmentViaApi(filePayload) {
      const token = CONFIG.authToken || '';
      if (!token) throw new Error('Missing auth token for upload.');
      const formData = new FormData();
      formData.append('attachment', filePayload);
      const response = await fetch(API_BASE + '/chat/community/attachments', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: formData
      });
      const data = await response.json().catch(function() { return {}; });
      if (!response.ok) {
        throw new Error(data.error || 'Attachment upload failed.');
      }
      const url = data.absoluteUrl || assetUrl(data.url);
      const mime = String(data.mime || filePayload.type || '').toLowerCase();
      const isImage = mime.startsWith('image/') || data.type === 'image';
      return {
        type: isImage ? 'image' : 'file',
        asset_url: url,
        thumb_url: isImage ? url : undefined,
        title: data.name || filePayload.name || 'Attachment',
        mime_type: mime
      };
    }

    window.__onNativeAttachmentUploaded = function(payload) {
      if (!payload || !payload.url) return;
      const mime = String(payload.mime || '').toLowerCase();
      const isImage = mime.startsWith('image/') || payload.type === 'image';
      pendingAttachment = {
        type: isImage ? 'image' : 'file',
        asset_url: payload.url,
        thumb_url: isImage ? payload.url : undefined,
        title: payload.name || 'Attachment',
        mime_type: mime
      };
      input.placeholder = 'Add a caption (optional) and send';
      input.focus();
    };

    attachBtn.addEventListener('click', function() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_ATTACHMENT' }));
        return;
      }
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = 'image/*,application/pdf';
      picker.onchange = async function() {
        const file = picker.files && picker.files[0];
        if (!file) return;
        try {
          attachBtn.disabled = true;
          pendingAttachment = await uploadAttachmentViaApi(file);
          input.placeholder = 'Add a caption (optional) and send';
          input.focus();
        } catch (e) {
          alert(e.message || 'Upload failed');
        } finally {
          attachBtn.disabled = false;
        }
      };
      picker.click();
    });

    async function init() {
      if (!window.StreamChat) throw new Error('Chat SDK failed to load.');
      const client = StreamChat.getInstance(CONFIG.apiKey);
      await client.connectUser(CONFIG.user, CONFIG.token);
      channel = client.channel(CONFIG.channel.type, CONFIG.channel.id);
      await channel.watch({ state: true, presence: true });
      await channel.markRead().catch(function(){});
      updateMemberSubtitle();
      statusEl.style.display = 'none';
      form.style.display = 'flex';
      (channel.state.messages || []).forEach(renderMessage);
      channel.on('message.new', function(e) { if (e.message) renderMessage(e.message); });
      form.addEventListener('submit', async function(ev) {
        ev.preventDefault();
        await sendCurrentMessage();
      });
    }
    init().catch(function(e) { showError(e.message || 'Failed to connect.'); });
  </script>
</body>
</html>`;
}
