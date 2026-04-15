const TOKEN_KEY = 'sms_token';
const USER_KEY = 'sms_user';
const LOGIN_SESSION_KEY = 'sms_login_session_id';

const createLoginSessionId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const saveSession = (token, user) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(LOGIN_SESSION_KEY, createLoginSessionId());
};

export const clearSession = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LOGIN_SESSION_KEY);
};

export const getToken = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(TOKEN_KEY) || '';
};

export const getLoginSessionId = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(LOGIN_SESSION_KEY) || '';
};

export const getUser = () => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (_error) {
      localStorage.removeItem(USER_KEY);
    }
  }

  const token = getToken();
  const payload = decodeTokenPayload(token);
  if (!payload?.role) {
    return null;
  }

  const restoredUser = {
    id: payload.id || payload._id || '',
    name: payload.name || '',
    email: payload.email || '',
    role: payload.role
  };

  try {
    localStorage.setItem(USER_KEY, JSON.stringify(restoredUser));
  } catch (_error) {
    // no-op
  }

  return restoredUser;
};

const decodeTokenPayload = (token = '') => {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) {
      return null;
    }

    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const normalized = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
    const payload = atob(normalized);
    return JSON.parse(payload);
  } catch (_error) {
    return null;
  }
};

export const isTokenExpired = (token = '') => {
  if (!token) {
    return true;
  }

  const payload = decodeTokenPayload(token);
  if (!payload) {
    return true;
  }

  if (!payload?.exp) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now;
};