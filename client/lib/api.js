import { clearSession, getToken, isTokenExpired } from './session';
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
const REQUEST_TIMEOUT_MS = 15000;
const GET_CACHE_TTL_MS = 12000;
const DEFAULT_GET_RETRY_COUNT = 1;
const DEFAULT_GET_RETRY_DELAY_MS = 300;
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

const mergeAbortSignals = (signals = []) => {
  const activeSignals = signals.filter(Boolean);
  if (activeSignals.length === 0) {
    return null;
  }

  if (activeSignals.length === 1) {
    return activeSignals[0];
  }

  const controller = new AbortController();
  const onAbort = () => {
    controller.abort();
  };

  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }

    signal.addEventListener('abort', onAbort, { once: true });
  }

  return controller.signal;
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const { signal, cleanup } = withTimeoutSignal(timeoutMs);
  const mergedSignal = mergeAbortSignals([signal, options.signal]);

  try {
    return await fetch(url, { ...options, signal: mergedSignal });
  } finally {
    cleanup();
  }
};

const wait = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));

const isRetryableStatusCode = (statusCode) => statusCode === 408 || statusCode === 429 || statusCode >= 500;

const shouldRetryError = (error) => {
  if (error?.name === 'AbortError') {
    return false;
  }

  if (typeof error?.statusCode === 'number') {
    return isRetryableStatusCode(error.statusCode);
  }

  return true;
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
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;

  try {
    const response = await fetchWithTimeout(`${BASE_URL}${path}`, fetchOptions, timeoutMs);
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

const requestWithRetry = async (
  path,
  options,
  { retryCount = 0, retryDelayMs = DEFAULT_GET_RETRY_DELAY_MS } = {}
) => {
  let attempt = 0;
  while (attempt <= retryCount) {
    try {
      return await request(path, options);
    } catch (error) {
      if (!shouldRetryError(error) || attempt >= retryCount) {
        throw error;
      }

      attempt += 1;
      await wait(retryDelayMs * attempt);
    }
  }

  return request(path, options);
};

export const get = async (path, token, options = {}) => {
  const {
    cacheTtlMs = GET_CACHE_TTL_MS,
    forceRefresh = false,
    retryCount = DEFAULT_GET_RETRY_COUNT,
    retryDelayMs = DEFAULT_GET_RETRY_DELAY_MS,
    timeoutMs = REQUEST_TIMEOUT_MS,
    signal,
    useStaleCacheOnError = true
  } = options;
  const normalizedPath = String(path || '').toLowerCase();
  const effectiveCacheTtlMs = normalizedPath.includes('/attendance') ? 0 : cacheTtlMs;
  const cacheKey = `${token || 'public'}::${path}`;
  const staleCacheEntry = getCache.get(cacheKey);
  const canUseInFlightDedupe = !forceRefresh && !signal;

  if (!forceRefresh) {
    const cached = getCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    if (canUseInFlightDedupe && inFlightGetRequests.has(cacheKey)) {
      return inFlightGetRequests.get(cacheKey);
    }
  }

  const requestPromise = requestWithRetry(
    path,
    {
      method: 'GET',
      headers: buildHeaders(token),
      cache: 'no-store',
      timeoutMs,
      signal
    },
    {
      retryCount,
      retryDelayMs
    }
  )
    .then((data) => {
      if (effectiveCacheTtlMs > 0) {
        getCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + effectiveCacheTtlMs
        });
      }
      return data;
    })
    .catch((error) => {
      if (useStaleCacheOnError && staleCacheEntry?.data) {
        return staleCacheEntry.data;
      }

      throw error;
    })
    .finally(() => {
      if (canUseInFlightDedupe) {
        inFlightGetRequests.delete(cacheKey);
      }
    });

  if (canUseInFlightDedupe) {
    inFlightGetRequests.set(cacheKey, requestPromise);
  }

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

export const patch = async (path, data, token) => {
  const response = await request(path, {
    method: 'PATCH',
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