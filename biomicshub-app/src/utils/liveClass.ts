import { CalendarEntry, LiveClass } from '@/src/api/live';

export function isVisibleLiveClass(c: LiveClass | null | undefined) {
  if (!c) return false;
  const status = String(c.status || '').toLowerCase();
  if (status === 'cancelled' || status === 'ended') return false;
  if (c.isActive || status === 'live') return true;

  const now = Date.now();
  const endMs = c.scheduledEndAt || c.endedAt ? new Date(String(c.scheduledEndAt || c.endedAt)).getTime() : NaN;
  if (Number.isFinite(endMs) && endMs < now) return false;

  const startMs = c.scheduledAt || c.startedAt ? new Date(String(c.scheduledAt || c.startedAt)).getTime() : NaN;
  if (!Number.isFinite(startMs)) return status === 'scheduled';
  if (startMs >= now) return true;
  if (Number.isFinite(endMs) && endMs >= now) return true;
  return startMs >= now - 30 * 60 * 1000;
}

export function isVisibleCalendarEntry(entry: CalendarEntry) {
  const status = String(entry.status || '').toLowerCase();
  if (status === 'cancelled' || status === 'ended') return false;
  if (!entry.startsAt) return false;

  const now = Date.now();
  const endMs = entry.endsAt ? new Date(entry.endsAt).getTime() : NaN;
  if (Number.isFinite(endMs) && endMs < now && entry.kind === 'live-class') return false;

  const startMs = new Date(entry.startsAt).getTime();
  if (entry.kind === 'live-class' && Number.isFinite(startMs) && startMs < now - 30 * 60 * 1000) {
    if (!Number.isFinite(endMs) || endMs < now) return false;
  }
  return true;
}
