// Helpers for converting between ISO/UTC dates and the value format expected
// by `<input type="datetime-local">` ("YYYY-MM-DDTHH:mm").
//
// Bug context: previously the admin "edit exam" form populated the field via
// `new Date(value).toISOString().slice(0, 16)`. That returns UTC time but
// `datetime-local` interprets its value as LOCAL time. So an exam saved at
// 21:00 IST (15:30 UTC) was shown as 15:30 in the form, and re-saving the form
// silently rewrote the exam to 10:00 UTC (15:30 IST = 3:30 PM) — which is
// exactly what students were seeing.

/**
 * Convert any Date/ISO string into a value safe to plug into a
 * `<input type="datetime-local">` field. The output represents the user's
 * local wall-clock time, which is what the input expects.
 */
export function toDateTimeLocalInputValue(value) {
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Convert a `<input type="datetime-local">` value (local wall-clock time)
 * into a UTC ISO string suitable for sending to the API. Returns `null` for
 * empty / invalid input so callers can decide between "no value" and "error".
 */
export function fromDateTimeLocalInputValue(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
  }
  const parsed = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || 0),
    0
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
