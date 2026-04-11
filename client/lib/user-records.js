import { get } from './api';
import { clearSession, getToken, getUser, isTokenExpired } from './session';

export const getAuthContext = () => {
  const token = getToken();
  if (!token) {
    clearSession();
    return { token: '', user: null };
  }

  if (isTokenExpired(token)) {
    clearSession();
    return { token: '', user: null };
  }

  return {
    token,
    user: getUser()
  };
};

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
