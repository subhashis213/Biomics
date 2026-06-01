// Firebase Cloud Messaging (FCM) push sender.
//
// Set ONE of:
//   FIREBASE_SERVICE_ACCOUNT      — full service-account JSON (Render env var)
//   FIREBASE_SERVICE_ACCOUNT_PATH — path to JSON file (local dev)

let admin = null;
let initialized = false;
let initError = '';

function parseServiceAccountJson(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  const attempts = [
    () => JSON.parse(trimmed),
    () => JSON.parse(trimmed.replace(/\\n/g, '\n'))
  ];

  for (const attempt of attempts) {
    try {
      const account = attempt();
      if (account?.private_key) {
        account.private_key = String(account.private_key).replace(/\\n/g, '\n');
      }
      if (account?.client_email && account?.private_key && account?.project_id) {
        return account;
      }
    } catch {
      // try next parse strategy
    }
  }
  throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
}

function loadServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (raw) return parseServiceAccountJson(raw);

  const filePath = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
  if (filePath) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const account = require(require('path').resolve(filePath));
    if (account?.private_key) {
      account.private_key = String(account.private_key).replace(/\\n/g, '\n');
    }
    return account;
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
    initError = '';
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

function getInitError() {
  ensureInitialized();
  return initError;
}

/**
 * Send a notification to many device tokens.
 * Returns { configured, successCount, failureCount, invalidTokens, errors }.
 */
async function sendToTokens(tokens, { title, body, data } = {}) {
  const cleanTokens = Array.from(
    new Set((Array.isArray(tokens) ? tokens : []).map((t) => String(t || '').trim()).filter(Boolean))
  );
  if (!ensureInitialized()) {
    return {
      configured: false,
      reason: initError,
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
      errors: initError ? [{ code: 'init', message: initError }] : []
    };
  }
  if (!cleanTokens.length) {
    return { configured: true, successCount: 0, failureCount: 0, invalidTokens: [], errors: [] };
  }

  const safeTitle = String(title || 'BiomicsHub').trim() || 'BiomicsHub';
  const safeBody = String(body || '').trim();
  const imageUrl = String(data?.imageUrl || '').trim();

  const notification = {
    title: safeTitle,
    body: safeBody
  };
  if (imageUrl) notification.imageUrl = imageUrl;

  const androidNotification = {
    channelId: 'default',
    sound: 'default',
    priority: 'high',
    visibility: 'public',
    defaultSound: true,
    defaultVibrateTimings: true
  };
  if (imageUrl) androidNotification.imageUrl = imageUrl;

  const message = {
    notification,
    data: Object.fromEntries(
      Object.entries({ type: 'announcement', ...(data || {}) }).map(([k, v]) => [String(k), String(v ?? '')])
    ),
    android: {
      priority: 'high',
      notification: androidNotification
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: {
        aps: {
          alert: { title: safeTitle, body: safeBody },
          sound: 'default',
          'content-available': 1,
          'mutable-content': imageUrl ? 1 : 0
        }
      },
      ...(imageUrl ? { fcmOptions: { imageUrl } } : {})
    }
  };

  const invalidTokens = [];
  const errors = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < cleanTokens.length; i += 500) {
    const batch = cleanTokens.slice(i, i + 500);
    try {
      const res = await admin.messaging().sendEachForMulticast({ ...message, tokens: batch });
      successCount += res.successCount;
      failureCount += res.failureCount;
      res.responses.forEach((resp, idx) => {
        if (resp.success) return;
        const code = resp.error?.code ? String(resp.error.code) : 'unknown';
        const msg = resp.error?.message ? String(resp.error.message) : 'Send failed';
        if (errors.length < 8) {
          errors.push({ code, message: msg });
        }
        if (
          code === 'messaging/registration-token-not-registered'
          || code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(batch[idx]);
        }
      });
    } catch (err) {
      failureCount += batch.length;
      if (errors.length < 8) {
        errors.push({
          code: 'batch_error',
          message: err && err.message ? err.message : 'FCM batch send failed.'
        });
      }
    }
  }

  return { configured: true, successCount, failureCount, invalidTokens, errors };
}

module.exports = { isConfigured, getInitError, sendToTokens };
