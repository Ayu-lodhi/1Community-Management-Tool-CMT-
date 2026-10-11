const BACKEND_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? '' : 'http://localhost:5000');
const API_BASE = `${BACKEND_URL}/api/v1`;

// --- Safe In-Memory Client Cache ---
const SAFE_CACHE_PREFIXES = ['/events', '/announcements', '/teams'];
const CLIENT_CACHE_TTL_MS = 30 * 1000; // 30 seconds
const clientCache = new Map();

function isSafeToCache(url) {
  if (typeof url !== 'string') return false;
  // Strictly forbid caching any auth, user, permission, admin, or session data
  if (
    url.startsWith('/auth') ||
    url.startsWith('/super-admin') ||
    url.startsWith('/admin') ||
    url.startsWith('/users') ||
    url.startsWith('/preferences') ||
    url.includes('session') ||
    url.includes('profile') ||
    url.includes('me')
  ) {
    return false;
  }
  return SAFE_CACHE_PREFIXES.some((prefix) => url.startsWith(prefix));
}

const clearClientCache = () => {
  clientCache.clear();
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

export const api = {
  get: async (url, options = {}) => {
    touchActivity();

    // Check safe client cache
    const shouldCache = options.cache !== false && isSafeToCache(url);
    if (shouldCache) {
      const cached = clientCache.get(url);
      if (cached && Date.now() < cached.expiry) {
        return cached.value;
      }
    }

    const token = getToken();
    const res = await fetchWithRetry(`${API_BASE}${url}`, {
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

    const result = { data };
    if (shouldCache) {
      clientCache.set(url, {
        value: result,
        expiry: Date.now() + CLIENT_CACHE_TTL_MS,
      });
    }

    return result;
  },
  post: async (url, body) => {
    touchActivity();
    clearClientCache(); // Mutating request invalidates safe cache
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
  patch: async (url, body) => {
    touchActivity();
    clearClientCache();
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
    clearClientCache();
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
