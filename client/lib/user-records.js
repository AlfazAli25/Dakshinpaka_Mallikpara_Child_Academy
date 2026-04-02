import { get } from './api';
import { clearSession, getToken, getUser, isTokenExpired } from './session';

export const getAuthContext = () => ({
  token: (() => {
    const token = getToken();
    if (token && isTokenExpired(token)) {
      clearSession();
      return '';
    }
    return token;
  })(),
  user: (() => {
    const token = getToken();
    if (token && isTokenExpired(token)) {
      return null;
    }
    return getUser();
  })()
});

export const getCurrentStudentRecord = async () => {
  const { token } = getAuthContext();
  if (!token) {
    return null;
  }

  const response = await get('/students/me/profile', token);
  return response.data || null;
};

export const getCurrentTeacherRecord = async () => {
  const { token } = getAuthContext();
  if (!token) {
    return null;
  }

  const response = await get('/teachers/me/profile', token);
  return response.data || null;
};
