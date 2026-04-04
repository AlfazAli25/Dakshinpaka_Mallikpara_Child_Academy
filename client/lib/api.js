import { clearSession, getToken, isTokenExpired } from './session';
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
const REQUEST_TIMEOUT_MS = 15000;
const GET_CACHE_TTL_MS = 12000;
const TECHNICAL_MESSAGE_REGEX =
  /internal server error|server initialization failed|failed to fetch|networkerror|timed out|timeout|econn|mongodb|mongoose|duplicate key|jwt|token malformed|unexpected token|cannot read properties|stack|syntaxerror/i;

const getCache = new Map();
const inFlightGetRequests = new Map();

const clearGetCache = () => {
  getCache.clear();
  inFlightGetRequests.clear();
};

const parseJsonSafely = async (response) => {
  try {
    const text = await response.text();
    if (!text) {
      return null;
    }

    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
};

const mapStatusToFriendlyMessage = (statusCode) => {
  if (statusCode === 400) {
    return 'Some details are missing or incorrect. Please check and try again.';
  }
  if (statusCode === 401) {
    return 'Session expired. Please login again.';
  }
  if (statusCode === 403) {
    return 'You do not have permission to do this action.';
  }
  if (statusCode === 404) {
    return 'We could not find what you are looking for.';
  }
  if (statusCode === 409) {
    return 'This information already exists. Please use a different value.';
  }
  if (statusCode === 413) {
    return 'The uploaded file is too large. Please choose a smaller file.';
  }
  if (statusCode === 429) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (statusCode >= 500) {
    return 'Something went wrong on our side. Please try again in a minute.';
  }

  return 'Something went wrong. Please try again.';
};

const toFriendlyMessage = (rawMessage, statusCode) => {
  const normalized = String(rawMessage || '').trim();
  if (!normalized) {
    return mapStatusToFriendlyMessage(statusCode);
  }

  if (TECHNICAL_MESSAGE_REGEX.test(normalized)) {
    return mapStatusToFriendlyMessage(statusCode);
  }

  if (normalized.length > 180) {
    return mapStatusToFriendlyMessage(statusCode);
  }

  return normalized;
};

const buildApiError = ({ statusCode = 0, rawMessage = '' }) => {
  const friendlyMessage =
    statusCode === 0
      ? 'Unable to connect right now. Please check your internet and try again.'
      : toFriendlyMessage(rawMessage, statusCode);

  const error = new Error(friendlyMessage);
  error.statusCode = statusCode;
  error.rawMessage = String(rawMessage || '').trim();
  return error;
};

const withTimeoutSignal = (timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId)
  };
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const { signal, cleanup } = withTimeoutSignal(timeoutMs);

  try {
    return await fetch(url, { ...options, signal });
  } finally {
    cleanup();
  }
};

const handleUnauthorized = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const token = getToken();
  const shouldInvalidateSession = !token || isTokenExpired(token);
  if (!shouldInvalidateSession) {
    return;
  }

  try {
    clearSession();
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
  try {
    const response = await fetchWithTimeout(`${BASE_URL}${path}`, options);
    const json = await parseJsonSafely(response);

    if (!response.ok) {
      const rawMessage = json?.message || '';
      if (response.status === 401) {
        handleUnauthorized();
      }

      throw buildApiError({ statusCode: response.status, rawMessage });
    }

    return json || {};
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('This is taking longer than expected. Please try again.');
    }

    if (typeof error?.statusCode === 'number') {
      throw error;
    }

    throw buildApiError({ statusCode: 0, rawMessage: error?.message });
  }
};

export const get = async (path, token, options = {}) => {
  const { cacheTtlMs = GET_CACHE_TTL_MS, forceRefresh = false } = options;
  const cacheKey = `${token || 'public'}::${path}`;

  if (!forceRefresh) {
    const cached = getCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    if (inFlightGetRequests.has(cacheKey)) {
      return inFlightGetRequests.get(cacheKey);
    }
  }

  const requestPromise = request(path, {
    method: 'GET',
    headers: buildHeaders(token),
    cache: 'no-store'
  })
    .then((data) => {
      if (cacheTtlMs > 0) {
        getCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + cacheTtlMs
        });
      }
      return data;
    })
    .finally(() => {
      inFlightGetRequests.delete(cacheKey);
    });

  inFlightGetRequests.set(cacheKey, requestPromise);
  return requestPromise;
};

export const post = async (path, data, token) => {
  const response = await request(path, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify(data)
  });

  clearGetCache();
  return response;
};

export const put = async (path, data, token) => {
  const response = await request(path, {
    method: 'PUT',
    headers: buildHeaders(token),
    body: JSON.stringify(data)
  });

  clearGetCache();
  return response;
};

export const del = async (path, token) => {
  const response = await request(path, {
    method: 'DELETE',
    headers: buildHeaders(token)
  });

  clearGetCache();
  return response;
};

export const postForm = async (path, formData, token) => {
  const response = await request(path, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: formData
  });

  clearGetCache();
  return response;
};

export const getBlob = async (path, token) => {
  try {
    const response = await fetchWithTimeout(`${BASE_URL}${path}`, {
      method: 'GET',
      headers: buildAuthHeaders(token),
      cache: 'no-store'
    });

    if (!response.ok) {
      const json = await parseJsonSafely(response);
      const rawMessage = json?.message || '';

      if (response.status === 401) {
        handleUnauthorized();
      }

      throw buildApiError({ statusCode: response.status, rawMessage });
    }

    return response.blob();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('This is taking longer than expected. Please try again.');
    }

    if (typeof error?.statusCode === 'number') {
      throw error;
    }

    throw buildApiError({ statusCode: 0, rawMessage: error?.message });
  }
};