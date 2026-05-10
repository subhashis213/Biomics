// Server-side date formatting helpers.
//
// Production servers commonly run in UTC, so calling `Date#toLocaleString()`
// without an explicit `timeZone` returns UTC strings — that's how an exam
// scheduled for 9:00 PM IST (15:30 UTC) ends up rendered as "3:30 PM" in
// API error messages. These helpers always format in Asia/Kolkata (IST) so
// student-facing strings match what the admin entered.

const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'Asia/Kolkata';
const APP_LOCALE = process.env.APP_LOCALE || 'en-IN';

function toDate(value) {
  if (value instanceof Date) return value;
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Format a date for human-readable display in app-local time (IST by default).
 * Returns an empty string for invalid input so callers can chain safely.
 */
function formatAppDateTime(value, overrides = {}) {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleString(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...overrides
  });
}

function formatAppDate(value) {
  return formatAppDateTime(value, { hour: undefined, minute: undefined, hour12: undefined });
}

module.exports = {
  APP_TIME_ZONE,
  APP_LOCALE,
  formatAppDateTime,
  formatAppDate
};
