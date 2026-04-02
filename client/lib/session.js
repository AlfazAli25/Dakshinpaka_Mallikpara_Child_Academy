export const saveSession = (token, user) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('sms_token', token);
  localStorage.setItem('sms_user', JSON.stringify(user));
};

export const clearSession = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('sms_token');
  localStorage.removeItem('sms_user');
};

export const getToken = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('sms_token') || '';
};

export const getUser = () => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('sms_user');
  return raw ? JSON.parse(raw) : null;
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
  if (!payload?.exp) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now;
};