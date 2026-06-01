const PUBLIC_API_BASE = String(
  process.env.PUBLIC_API_BASE_URL || process.env.API_BASE_URL || 'https://biomicshub-backend.onrender.com'
).replace(/\/$/, '');

function toAbsoluteAssetUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${PUBLIC_API_BASE}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

/** Strip [b]…[/b] style markup for plain FCM notification body. */
function stripRichMarkup(text) {
  return String(text || '')
    .replace(/\[(\/)?(b|red|big|h|accent|blue|green)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveMessageFields(body) {
  const messageRich = String(body?.messageRich || body?.message || '').trim();
  const plainFromBody = String(body?.message || '').trim();
  const message = plainFromBody || stripRichMarkup(messageRich);
  return { message, messageRich: messageRich || message };
}

module.exports = { toAbsoluteAssetUrl, stripRichMarkup, resolveMessageFields, PUBLIC_API_BASE };
