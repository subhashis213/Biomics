// Firebase Cloud Messaging (FCM) — data-only pushes rendered on-device via Notifee (HTML bold/color + poster).

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
 * Send FCM push. Poster alerts use a native Android notification payload (big picture on lock screen).
 * Text-only alerts stay data-only and render styled HTML via Notifee on-device.
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
  const pushBody = String(body || data?.message || '').trim();
  const posterUrl = String(data?.imageUrl || '').trim();
  const payloadData = Object.fromEntries(
    Object.entries({
      type: 'announcement',
      title: safeTitle,
      message: pushBody,
      ...(data || {})
    }).map(([k, v]) => [String(k), String(v ?? '')])
  );

  if (posterUrl) {
    payloadData.nativePoster = '1';
  }

  const android = {
    priority: 'high',
    ttl: 86400000
  };

  if (posterUrl) {
    android.notification = {
      channelId: 'biomicshub_alerts_v2',
      title: safeTitle,
      body: pushBody || safeTitle,
      imageUrl: posterUrl,
      icon: 'notification_icon',
      color: '#3dd6c6',
      defaultSound: true,
      defaultVibrateTimings: true,
      visibility: 'PUBLIC',
      notificationCount: 1
    };
  }

  const message = {
    data: payloadData,
    android,
    apns: {
      headers: { 'apns-priority': '10' },
      payload: {
        aps: {
          alert: { title: safeTitle, body: pushBody },
          sound: 'default',
          'content-available': 1,
          ...(posterUrl ? { 'mutable-content': 1 } : {})
        }
      },
      ...(posterUrl ? { fcmOptions: { imageUrl: posterUrl } } : {})
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
