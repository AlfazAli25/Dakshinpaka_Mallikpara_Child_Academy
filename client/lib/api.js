const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';

const handleUnauthorized = () => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem('sms_token');
    localStorage.removeItem('sms_user');
  } catch (_error) {
    // no-op
  }

  const onAuthPage = window.location.pathname === '/login' || window.location.pathname === '/register';
  if (!onAuthPage) {
    window.location.assign('/login');
  }
};

const buildHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

const buildAuthHeaders = (token) => ({
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

const request = async (path, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const json = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
      throw new Error('Session expired. Please login again.');
    }
    throw new Error(json.message || 'Request failed');
  }

  return json;
};

export const get = async (path, token) =>
  request(path, {
    method: 'GET',
    headers: buildHeaders(token),
    cache: 'no-store'
  });

export const post = async (path, data, token) =>
  request(path, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify(data)
  });

export const put = async (path, data, token) =>
  request(path, {
    method: 'PUT',
    headers: buildHeaders(token),
    body: JSON.stringify(data)
  });

export const del = async (path, token) =>
  request(path, {
    method: 'DELETE',
    headers: buildHeaders(token)
  });

export const postForm = async (path, formData, token) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: formData
  });

  const json = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
      throw new Error('Session expired. Please login again.');
    }
    throw new Error(json.message || 'Request failed');
  }

  return json;
};

export const getBlob = async (path, token) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: buildAuthHeaders(token),
    cache: 'no-store'
  });

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
      throw new Error('Session expired. Please login again.');
    }
    let message = 'Request failed';
    try {
      const json = await response.json();
      message = json.message || message;
    } catch (_error) {
      // no-op
    }
    throw new Error(message);
  }

  return response.blob();
};