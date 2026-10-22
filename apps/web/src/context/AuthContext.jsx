import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { Clock } from 'lucide-react';

const BACKEND_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? '' : 'http://localhost:5000');
const API_BASE = `${BACKEND_URL}/api/v1`;

// ====================================================================
// AUTH CONTEXT
// ====================================================================
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// ====================================================================
// SOCKET CONTEXT
// ====================================================================
export const SocketContext = createContext(null);
export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const token = typeof window !== 'undefined' ? (sessionStorage.getItem('tbi_token') || localStorage.getItem('tbi_token')) : null;
    if (!token) return;

    const newSocket = io(BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : ''), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    newSocket.on('connect', () => {
      console.log('Real-time connected');
    });

    newSocket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err.message);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
};

// ====================================================================
// IDLE TIMEOUT WATCHER — Inactivity auto-logout
// ====================================================================
const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes of inactivity
const WARNING_WINDOW_MS = 60 * 1000;          // 60 seconds warning countdown

export const IdleTimeoutWatcher = ({ logout }) => {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const lastActivityRef = useRef(Date.now());

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
  }, []);

  useEffect(() => {
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'wheel'];
    events.forEach((ev) => window.addEventListener(ev, handleActivity, { passive: true }));
    window.addEventListener('app:activity', handleActivity);

    const interval = setInterval(() => {
      const timeoutLimit =
        (typeof window !== 'undefined' && window.__IDLE_TIMEOUT_MS) || DEFAULT_IDLE_TIMEOUT_MS;
      const warningThreshold = Math.min(WARNING_WINDOW_MS, Math.floor(timeoutLimit / 2));
      const idleTime = Date.now() - lastActivityRef.current;
      const timeLeft = timeoutLimit - idleTime;

      if (timeLeft <= 0) {
        clearInterval(interval);
        setShowWarning(false);
        if (logout) logout();
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('tbi_user');
          sessionStorage.removeItem('tbi_token');
          window.location.href = '/login?reason=inactivity';
        }
      } else if (timeLeft <= warningThreshold) {
        setShowWarning(true);
        setSecondsRemaining(Math.max(1, Math.ceil(timeLeft / 1000)));
      } else {
        setShowWarning(false);
      }
    }, 1000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleActivity));
      window.removeEventListener('app:activity', handleActivity);
      clearInterval(interval);
    };
  }, [logout]);

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-2xl border-2 border-amber-400 p-6 text-center animate-fade-in">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-3 text-amber-600 shadow-inner">
          <Clock className="w-7 h-7 animate-pulse" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Session Inactivity Warning</h3>
        <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
          You have been idle for a while. To protect your account, your session will automatically end in:
        </p>
        <div className="inline-flex items-center justify-center px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl mb-5">
          <span className="text-2xl font-mono font-black text-amber-700">
            {secondsRemaining}s
          </span>
        </div>
        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={() => {
              if (logout) logout();
              window.location.href = '/login?reason=manual';
            }}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition cursor-pointer"
          >
            Log Out Now
          </button>
          <button
            type="button"
            onClick={resetActivity}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
};

// ====================================================================
// ROLES
// ====================================================================
export const ROLES = {
  SUPER_ADMIN: { label: 'Super Admin', code: 'SA', color: '#DC2626', sidebarBg: '#0B1120', route: '/super-admin' },
  ADMIN: { label: 'Admin', code: 'AD', color: '#0B5CAD', sidebarBg: '#0B1120', route: '/admin' },
  T3_EXECUTIVE: { label: 'T3 Executive', code: 'T3', color: '#2563EB', sidebarBg: '#0B1120', route: '/t3' },
  T2_ASSOCIATE: { label: 'T2 Associate', code: 'T2', color: '#0284C7', sidebarBg: '#0B1120', route: '/t2' },
  T1_VOLUNTEER: { label: 'T1 Volunteer', code: 'T1', color: '#DC2626', sidebarBg: '#0B1120', route: '/t1' },
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  // Restore session from sessionStorage on mount (tab-isolated)
  useEffect(() => {
    try {
      // If URL explicitly requests a fresh session, clear this tab's auth
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('new_session') === 'true') {
          sessionStorage.removeItem('tbi_user');
          sessionStorage.removeItem('tbi_token');
          localStorage.removeItem('tbi_user');
          localStorage.removeItem('tbi_token');
          setInitializing(false);
          return;
        }
      }

      let storedUser = typeof window !== 'undefined' ? sessionStorage.getItem('tbi_user') : null;
      let storedToken = typeof window !== 'undefined' ? sessionStorage.getItem('tbi_token') : null;

      // Backward compatibility: migrate legacy single-session from localStorage to current tab's sessionStorage
      if (!storedUser || !storedToken) {
        const legacyUser = typeof window !== 'undefined' ? localStorage.getItem('tbi_user') : null;
        const legacyToken = typeof window !== 'undefined' ? localStorage.getItem('tbi_token') : null;
        if (legacyUser && legacyToken) {
          storedUser = legacyUser;
          storedToken = legacyToken;
          sessionStorage.setItem('tbi_user', legacyUser);
          sessionStorage.setItem('tbi_token', legacyToken);
        }
        // Remove from localStorage so subsequent new tabs start fresh with independent sessions
        if (typeof window !== 'undefined') {
          localStorage.removeItem('tbi_user');
          localStorage.removeItem('tbi_token');
        }
      }

      if (storedUser && storedToken) {
        setUser(JSON.parse(storedUser));
      }
    } catch (err) {
      console.error('Failed to restore session:', err);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('tbi_user');
        sessionStorage.removeItem('tbi_token');
        localStorage.removeItem('tbi_user');
        localStorage.removeItem('tbi_token');
      }
    } finally {
      setInitializing(false);
    }
  }, []);

  const login = (u, t) => {
    setUser(u);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('tbi_user', JSON.stringify(u));
      sessionStorage.setItem('tbi_token', t);
      // Clean localStorage so new tabs are not automatically forced into this account
      localStorage.removeItem('tbi_user');
      localStorage.removeItem('tbi_token');
    }
  };

  const logout = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? (sessionStorage.getItem('tbi_token') || localStorage.getItem('tbi_token')) : null;
      if (token) {
        fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }).catch(() => {});
      }
    } catch {}
    setUser(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('tbi_user');
      sessionStorage.removeItem('tbi_token');
      localStorage.removeItem('tbi_user');
      localStorage.removeItem('tbi_token');
    }
  }, []);

  const updateUser = (updatedFields) => {
    setUser((prev) => {
      const next = { ...prev, ...updatedFields };
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('tbi_user', JSON.stringify(next));
      }
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, initializing, updateUser }}>
      {children}
      {user && <IdleTimeoutWatcher logout={logout} />}
    </AuthContext.Provider>
  );
};
