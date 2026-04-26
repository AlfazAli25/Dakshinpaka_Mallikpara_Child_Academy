const admin = require('firebase-admin');

let firebaseInitialized = false;

const normalizePrivateKey = (privateKey = '') => String(privateKey).replace(/\\n/g, '\n');

const parseServiceAccount = () => {
  const rawJson = String(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON || '').trim();

  if (rawJson) {
    const parsed = JSON.parse(rawJson);
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: normalizePrivateKey(parsed.private_key)
    };
  }

  return {
    projectId: String(process.env.FIREBASE_ADMIN_PROJECT_ID || '').trim(),
    clientEmail: String(process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '').trim(),
    privateKey: normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY || '')
  };
};

const ensureFirebaseInitialized = () => {
  if (firebaseInitialized) {
    return;
  }

  const { projectId, clientEmail, privateKey } = parseServiceAccount();

  if (!projectId || !clientEmail || !privateKey) {
    const error = new Error('Firebase Admin credentials are not configured');
    error.statusCode = 500;
    throw error;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });

  firebaseInitialized = true;
};

const getFirebaseMessaging = () => {
  ensureFirebaseInitialized();
  return admin.messaging();
};

module.exports = {
  getFirebaseMessaging
};
