// Firebase / Google Cloud OAuth Web client for biomicshub.com (client_type 3).
export const BIOMICS_GOOGLE_WEB_CLIENT_ID =
  '430984155371-9cgkt3u37sh40bfo0mu82c5f62829o37.apps.googleusercontent.com';

export function getGoogleWebClientId() {
  const fromEnv = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  // Ignore stale client IDs from another Google Cloud project.
  if (fromEnv.startsWith('430984155371-')) return fromEnv;
  return BIOMICS_GOOGLE_WEB_CLIENT_ID;
}
