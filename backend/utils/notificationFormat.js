const PUBLIC_API_BASE = String(
  process.env.PUBLIC_API_BASE_URL || process.env.API_BASE_URL || 'https://biomicshub-backend.onrender.com'
).replace(/\/$/, '');

function toAbsoluteAssetUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${PUBLIC_API_BASE}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

/** Strip [b]…[/b] style markup for plain fallback text. */
function stripRichMarkup(text) {
  return String(text || '')
    .replace(/\[(\/)?(b|red|big|h|accent|blue|green)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Convert admin markup to Android HTML for styled system notifications. */
function richMarkupToHtml(text) {
  let s = String(text || '');
  if (!s) return '';

  const replacements = [
    [/\[b\]([\s\S]*?)\[\/b\]/gi, '<b>$1</b>'],
    [/\[red\]([\s\S]*?)\[\/red\]/gi, '<font color="#d64545"><b>$1</b></font>'],
    [/\[blue\]([\s\S]*?)\[\/blue\]/gi, '<font color="#2563eb"><b>$1</b></font>'],
    [/\[green\]([\s\S]*?)\[\/green\]/gi, '<font color="#1f9d57"><b>$1</b></font>'],
    [/\[accent\]([\s\S]*?)\[\/accent\]/gi, '<font color="#0d9488"><b>$1</b></font>'],
    [/\[big\]([\s\S]*?)\[\/big\]/gi, '<big><b>$1</b></big>'],
    [/\[h\]([\s\S]*?)\[\/h\]/gi, '<big><b>$1</b></big>']
  ];

  let prev = '';
  let guard = 0;
  while (prev !== s && guard < 12) {
    prev = s;
    guard += 1;
    replacements.forEach(([pattern, repl]) => {
      s = s.replace(pattern, repl);
    });
  }
  return s.trim();
}

function resolveMessageFields(body) {
  const messageRich = String(body?.messageRich || body?.message || '').trim();
  const plainFromBody = String(body?.message || '').trim();
  const message = plainFromBody || stripRichMarkup(messageRich);
  const messageHtml = richMarkupToHtml(messageRich || message);
  return { message, messageRich: messageRich || message, messageHtml };
}

module.exports = {
  toAbsoluteAssetUrl,
  stripRichMarkup,
  richMarkupToHtml,
  resolveMessageFields,
  PUBLIC_API_BASE
};
