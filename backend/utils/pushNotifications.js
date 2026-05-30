// Firebase Cloud Messaging (FCM) push sender.
//
// This module is *graceful*: if Firebase credentials are not configured the rest
// of the app keeps working (announcements are still saved) and push sends become
// no-ops that report `{ configured: false }`.
//
// To enable real pushes, set ONE of:
//   - FIREBASE_SERVICE_ACCOUNT      : the full service-account JSON as a string
//   - FIREBASE_SERVICE_ACCOUNT_PATH : path to the service-account JSON file
//
// Get the file from Firebase Console → Project Settings → Service accounts →
// "Generate new private key".

let admin = null;
let initialized = false;
let initError = '';

function loadServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
    }
  }
  const filePath = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
  if (filePath) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(require('path').resolve(filePath));
  }
  return null;
}

function ensureInitialized() {
  if (initialized) return Boolean(admin);
  initialized = true;
  try {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      initError = 'Firebase service account not configured.';
      return false;
    }
    // eslint-disable-next-line global-require
    admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    return true;
  } catch (err) {
    admin = null;
    initError = err && err.message ? err.message : 'Firebase init failed.';
    return false;
  }
}

function isConfigured() {
  return ensureInitialized();
}

/**
 * Send a notification to many device tokens.
 * Returns { configured, successCount, failureCount, invalidTokens }.
 */
async function sendToTokens(tokens, { title, body, data } = {}) {
  const cleanTokens = Array.from(
    new Set((Array.isArray(tokens) ? tokens : []).map((t) => String(t || '').trim()).filter(Boolean))
  );
  if (!ensureInitialized()) {
    return { configured: false, reason: initError, successCount: 0, failureCount: 0, invalidTokens: [] };
  }
  if (!cleanTokens.length) {
    return { configured: true, successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  const message = {
    notification: { title: String(title || ''), body: String(body || '') },
    data: Object.fromEntries(
      Object.entries(data || {}).map(([k, v]) => [String(k), String(v)])
    ),
    android: {
      priority: 'high',
      notification: { channelId: 'default', sound: 'default' }
    }
  };

  const invalidTokens = [];
  let successCount = 0;
  let failureCount = 0;

  // Chunk to FCM's 500-token limit per multicast.
  for (let i = 0; i < cleanTokens.length; i += 500) {
    const batch = cleanTokens.slice(i, i + 500);
    try {
      const res = await admin.messaging().sendEachForMulticast({ ...message, tokens: batch });
      successCount += res.successCount;
      failureCount += res.failureCount;
      res.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = resp.error && resp.error.code ? resp.error.code : '';
          if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
            invalidTokens.push(batch[idx]);
          }
        }
      });
    } catch (err) {
      failureCount += batch.length;
    }
  }

  return { configured: true, successCount, failureCount, invalidTokens };
}

module.exports = { isConfigured, sendToTokens };
