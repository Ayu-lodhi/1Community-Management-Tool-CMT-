const BACKEND_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? '' : 'http://localhost:5000');
const API_BASE = `${BACKEND_URL}/api/v1`;

// --- Safe In-Memory Client Cache with SWR & Selective Invalidation ---
const SAFE_CACHE_PREFIXES = [
  '/events',
  '/announcements',
  '/teams',
  '/stats',
  '/workforce/shifts/templates',
  '/certificates',
];
const CLIENT_CACHE_FRESH_MS = 30 * 1000;      // 30 seconds fresh
const CLIENT_CACHE_STALE_MS = 5 * 60 * 1000;  // 5 minutes stale-while-revalidate window
const clientCache = new Map();
const inFlightRequests = new Map();

function isSafeToCache(url) {
  if (typeof url !== 'string') return false;
  // Strictly forbid caching any sensitive auth, user, permission, admin, or session data
  if (
    url.startsWith('/auth') ||
    url.startsWith('/super-admin') ||
    url.startsWith('/admin') ||
    url.startsWith('/users') ||
    url.startsWith('/preferences') ||
    /(^|\/)(session|profile|me)(\/|$|\?)/.test(url)
  ) {
    return false;
  }
  return SAFE_CACHE_PREFIXES.some((prefix) => url.startsWith(prefix));
}

const clearClientCache = (url = null) => {
  if (!url || typeof url !== 'string') {
    clientCache.clear();
    return;
  }

  // Selective invalidation: only invalidate cache entries for the mutated resource root
  const pathWithoutQuery = url.split('?')[0];
  const segments = pathWithoutQuery.split('/').filter(Boolean);
  if (segments.length === 0) {
    clientCache.clear();
    return;
  }

  const rootPrefix = `/${segments[0]}`;
  for (const key of clientCache.keys()) {
    if (key.startsWith(rootPrefix)) {
      clientCache.delete(key);
    }
  }

  // If applications, events, or workforce mutate, also invalidate aggregate dashboard stats
  if (rootPrefix === '/applications' || rootPrefix === '/events' || rootPrefix === '/workforce') {
    for (const key of clientCache.keys()) {
      if (key.startsWith('/stats')) {
        clientCache.delete(key);
      }
    }
  }
};

let isRedirectingToLogin = false;

const getToken = () => {
  if (typeof window === 'undefined') return null;
  const token = sessionStorage.getItem('tbi_token') || localStorage.getItem('tbi_token');
  if (!token || token === 'undefined' || token === 'null') return null;
  return token;
};

const touchActivity = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('app:activity'));
  }
};

const handleUnauthorized = (status, message = '') => {
  if (status === 401 && typeof window !== 'undefined') {
    clearClientCache();
    sessionStorage.removeItem('tbi_user');
    sessionStorage.removeItem('tbi_token');
    localStorage.removeItem('tbi_user');
    localStorage.removeItem('tbi_token');

    if (!window.location.pathname.includes('/login') && !isRedirectingToLogin) {
      isRedirectingToLogin = true;
      const msg = String(message || '').toLowerCase();
      const reason = msg.includes('timed out') ? 'timeout' : msg.includes('session ended') ? 'session_ended' : 'session_expired';
      window.location.replace(`/login?reason=${reason}`);
    }
  }
};

const parseResponseJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return { success: false, message: res.statusText || 'API request failed' };
  }
};

const fetchWithRetry = async (url, options = {}, retries = 1) => {
  try {
    const res = await fetch(url, options);
    if (res.status === 503 && retries > 0) {
      await new Promise((r) => setTimeout(r, 800));
      return fetchWithRetry(url, options, retries - 1);
    }
    return res;
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 800));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
};

const fetchNetworkGet = async (url, options = {}, shouldCache = false) => {
  const token = getToken();
  const headers = {
    ...(options.responseType !== 'blob' ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetchWithRetry(`${API_BASE}${url}`, { headers });
  if (!res.ok) {
    const data = await parseResponseJson(res);
    handleUnauthorized(res.status, data?.message);
    const err = new Error(data?.message || 'API request failed');
    err.response = { data, status: res.status };
    throw err;
  }

  if (options.responseType === 'blob') {
    const blobData = await res.blob();
    return { data: blobData };
  }

  const data = await parseResponseJson(res);
  const result = { data };
  if (shouldCache) {
    clientCache.set(url, {
      value: result,
      freshUntil: Date.now() + CLIENT_CACHE_FRESH_MS,
      staleUntil: Date.now() + CLIENT_CACHE_STALE_MS,
    });
  }

  return result;
};

export const api = {
  get: async (url, options = {}) => {
    touchActivity();

    const shouldCache = options.cache !== false && isSafeToCache(url);

    if (shouldCache) {
      const cached = clientCache.get(url);
      if (cached) {
        const now = Date.now();
        // 1. Fresh cache hit: return immediately
        if (now < cached.freshUntil) {
          return cached.value;
        }

        // 2. Stale-While-Revalidate hit: return stale data immediately, revalidate in background
        if (now < cached.staleUntil && options.swr !== false) {
          void fetchNetworkGet(url, options, true).catch(() => {});
          return cached.value;
        }
      }
    }

    // 3. Deduplicate in-flight requests for the exact same URL
    if (inFlightRequests.has(url)) {
      return inFlightRequests.get(url);
    }

    const requestPromise = fetchNetworkGet(url, options, shouldCache);
    inFlightRequests.set(url, requestPromise);
    try {
      return await requestPromise;
    } finally {
      inFlightRequests.delete(url);
    }
  },
  post: async (url, body) => {
    touchActivity();
    clearClientCache(url); // Selectively invalidate cache for this mutated resource
    const token = getToken();
    const res = await fetchWithRetry(`${API_BASE}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await parseResponseJson(res);
    if (!res.ok) {
      handleUnauthorized(res.status, data?.message);
      const err = new Error(data?.message || 'API request failed');
      err.response = { data, status: res.status };
      throw err;
    }
    return { data };
  },
  put: async (url, body) => {
    touchActivity();
    clearClientCache(url); // Selectively invalidate cache for this mutated resource
    const token = getToken();
    const res = await fetchWithRetry(`${API_BASE}${url}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await parseResponseJson(res);
    if (!res.ok) {
      handleUnauthorized(res.status, data?.message);
      const err = new Error(data?.message || 'API request failed');
      err.response = { data, status: res.status };
      throw err;
    }
    return { data };
  },
  patch: async (url, body) => {
    touchActivity();
    clearClientCache(url); // Selectively invalidate cache for this mutated resource
    const token = getToken();
    const res = await fetchWithRetry(`${API_BASE}${url}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await parseResponseJson(res);
    if (!res.ok) {
      handleUnauthorized(res.status, data?.message);
      const err = new Error(data?.message || 'API request failed');
      err.response = { data, status: res.status };
      throw err;
    }
    return { data };
  },
  delete: async (url) => {
    touchActivity();
    clearClientCache(url); // Selectively invalidate cache for this mutated resource
    const token = getToken();
    const res = await fetchWithRetry(`${API_BASE}${url}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await parseResponseJson(res);
    if (!res.ok) {
      handleUnauthorized(res.status, data?.message);
      const err = new Error(data?.message || 'API request failed');
      err.response = { data, status: res.status };
      throw err;
    }
    return { data };
  },
  clearCache: clearClientCache,
};

export default api;
