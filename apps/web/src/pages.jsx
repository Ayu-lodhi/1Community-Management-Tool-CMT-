// ====================================================================
// pages.jsx — All Page Components for TBI Management System
// ====================================================================

import React, { useState, createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { Navigate, NavLink, useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, ScrollText, Monitor, Settings, Shield, FileText,
  User as UserIcon, LogOut, Calendar, TrendingUp, UserPlus, Upload,
  UsersRound, Clock, Award, CheckCircle, MessageSquare, Star, Bell,
  Search, Mail, Lock, Plus, X, QrCode, ChevronLeft, AlertTriangle,
  Eye, EyeOff, Key,
  Info, Trash2, Construction, MapPin, Timer, BarChart3, ExternalLink, ChevronRight,
  FileCheck, Download, Check, AlertCircle, Copy, RefreshCw, CheckCircle2, XCircle, Send,
  Menu
} from 'lucide-react';
import api from './lib/api';
import { io } from 'socket.io-client';
import {
  PieChart, Pie, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';

const BACKEND_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? '' : 'http://localhost:5000');
const API_BASE = `${BACKEND_URL}/api/v1`;

// ====================================================================
// AUTH CONTEXT
// ====================================================================
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// ====================================================================
// SOCKET CONTEXT
// ====================================================================
const SocketContext = createContext(null);
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

// ====================================================================
// IDLE TIMEOUT WATCHER — Inactivity auto-logout
// "if user is idle and not making any requests, auto log out from system"
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

// ====================================================================
// SIDEBAR MENUS
// ====================================================================
const MENUS = {
  SUPER_ADMIN: [
    {
      section: 'OVERVIEW', items: [
        { icon: LayoutDashboard, label: 'Dashboard', to: '/super-admin' },
        { icon: TrendingUp, label: 'Analytics', to: '/admin/analytics' },
      ]
    },
    {
      section: 'MANAGEMENT', items: [
        { icon: Users, label: 'Users', to: '/admin/users' },
        { icon: UserPlus, label: 'Add User', to: '/admin/users/new' },
        { icon: Upload, label: 'Bulk Import', to: '/admin/users/bulk' },
      ]
    },
    {
      section: 'OPERATIONS', items: [
        { icon: Calendar, label: 'Events', to: '/admin/events' },
        { icon: UsersRound, label: 'Teams', to: '/admin/teams' },
        { icon: FileCheck, label: 'Approval Requests', to: '/admin/applications' },
        { icon: MessageSquare, label: 'Team Chats', to: '/chat' },
        { icon: Bell, label: 'Announcements', to: '/announcements' },
        { icon: Clock, label: 'Timesheets', to: '/timesheets' },
      ]
    },
    {
      section: 'SYSTEM CONTROL', items: [
        { icon: UserIcon, label: 'Admins', to: '/super-admin/admins' },
        { icon: ScrollText, label: 'Audit Logs', to: '/super-admin/audit' },
        { icon: Monitor, label: 'Sessions', to: '/super-admin/sessions' },
        { icon: UserIcon, label: 'My Profile', to: '/profile' },
        { icon: Settings, label: 'Preferences', to: '/preferences' },
      ]
    },
  ],
  ADMIN: [
    {
      section: 'OVERVIEW', items: [
        { icon: LayoutDashboard, label: 'Dashboard', to: '/admin' },
        { icon: TrendingUp, label: 'Analytics', to: '/admin/analytics' },
      ]
    },
    {
      section: 'MANAGEMENT', items: [
        { icon: Users, label: 'Users', to: '/admin/users' },
        { icon: UserPlus, label: 'Add User', to: '/admin/users/new' },
        { icon: Upload, label: 'Bulk Import', to: '/admin/users/bulk' },
      ]
    },
    {
      section: 'OPERATIONS', items: [
        { icon: Calendar, label: 'Events', to: '/admin/events' },
        { icon: UsersRound, label: 'Teams', to: '/admin/teams' },
        { icon: FileCheck, label: 'Approval Requests', to: '/admin/applications' },
        { icon: MessageSquare, label: 'Team Chats', to: '/chat' },
        { icon: Bell, label: 'Announcements', to: '/announcements' },
        { icon: Clock, label: 'Timesheets', to: '/timesheets' },
      ]
    },
    {
      section: 'ACCOUNT', items: [
        { icon: UserIcon, label: 'My Profile', to: '/profile' },
        { icon: Settings, label: 'Preferences', to: '/preferences' },
      ]
    },
  ],
  T3_EXECUTIVE: [
    {
      section: 'MY WORKSPACE', items: [
        { icon: LayoutDashboard, label: 'Dashboard', to: '/t3' },
        { icon: UsersRound, label: 'My Teams', to: '/t3/teams' },
        { icon: Users, label: 'Team Profiles', to: '/profile/team' },
        { icon: FileCheck, label: 'Approval Requests', to: '/t3/applications' },
        { icon: CheckCircle, label: 'Attendance', to: '/t3/attendance' },
        { icon: Clock, label: 'Timesheets', to: '/timesheets' },
      ]
    },
    {
      section: 'COMMUNICATION', items: [
        { icon: MessageSquare, label: 'Team Chats', to: '/chat' },
        { icon: Bell, label: 'Announcements', to: '/announcements' },
        { icon: Star, label: 'Submit Review', to: '/t3/reviews' },
      ]
    },
    {
      section: 'ACHIEVEMENTS', items: [
        { icon: Award, label: 'Certificates', to: '/t3/certificates' },
        { icon: UserIcon, label: 'My Profile', to: '/profile' },
        { icon: Settings, label: 'Preferences', to: '/preferences' },
      ]
    },
  ],
  T2_ASSOCIATE: [
    {
      section: 'MY WORKSPACE', items: [
        { icon: LayoutDashboard, label: 'Dashboard', to: '/t2' },
        { icon: Calendar, label: 'Browse Events', to: '/t2/events' },
        { icon: FileCheck, label: 'Approval Requests', to: '/t2/applications' },
        { icon: Clock, label: 'My Shifts', to: '/t2/shifts' },
        { icon: Clock, label: 'Timesheets', to: '/timesheets' },
      ]
    },
    {
      section: 'COMMUNICATION', items: [
        { icon: MessageSquare, label: 'Team Chats', to: '/chat' },
        { icon: Bell, label: 'Announcements', to: '/announcements' },
      ]
    },
    {
      section: 'ACHIEVEMENTS', items: [
        { icon: Award, label: 'Certificates', to: '/t2/certificates' },
        { icon: UserIcon, label: 'My Profile', to: '/profile' },
        { icon: Settings, label: 'Preferences', to: '/preferences' },
      ]
    },
  ],
  T1_VOLUNTEER: [
    {
      section: 'MY WORKSPACE', items: [
        { icon: LayoutDashboard, label: 'Dashboard', to: '/t1' },
        { icon: Calendar, label: 'Browse Events', to: '/t1/events' },
        { icon: FileCheck, label: 'Approval Requests', to: '/t1/applications' },
        { icon: QrCode, label: 'QR Check-In', to: '/t1/checkin' },
        { icon: Award, label: 'Certificates', to: '/t1/certificates' },
        { icon: Clock, label: 'Timesheets', to: '/timesheets' },
      ]
    },
    {
      section: 'COMMUNICATION', items: [
        { icon: MessageSquare, label: 'Team Chats', to: '/chat' },
        { icon: Star, label: 'My Reviews', to: '/t1/reviews' },
        { icon: UserIcon, label: 'My Profile', to: '/profile' },
        { icon: Settings, label: 'Preferences', to: '/preferences' },
      ]
    },
  ],
};

// Quick Demo Login Bar (Local development only; tree-shaken from production builds)
const DemoLoginBar = import.meta.env.DEV
  ? ({ onSelect }) => {
      const demoUsers = [
        { key: 'SUPER', label: 'Super', email: import.meta.env.VITE_DEMO_SUPER_EMAIL, pass: import.meta.env.VITE_DEMO_SUPER_PASSWORD, style: 'border-red-700 bg-red-50 text-red-700 hover:bg-red-600 hover:text-white' },
        { key: 'ADMIN', label: 'Admin', email: import.meta.env.VITE_DEMO_ADMIN_EMAIL, pass: import.meta.env.VITE_DEMO_ADMIN_PASSWORD, style: 'border-blue-700 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white' },
        { key: 'T3', label: 'T3 Exec', email: import.meta.env.VITE_DEMO_T3_EMAIL, pass: import.meta.env.VITE_DEMO_T3_PASSWORD, style: 'border-indigo-700 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white' },
        { key: 'T2', label: 'T2 Assoc', email: import.meta.env.VITE_DEMO_T2_EMAIL, pass: import.meta.env.VITE_DEMO_T2_PASSWORD, style: 'border-cyan-700 bg-cyan-50 text-cyan-700 hover:bg-cyan-600 hover:text-white' },
        { key: 'T1', label: 'T1 Vol', email: import.meta.env.VITE_DEMO_T1_EMAIL, pass: import.meta.env.VITE_DEMO_T1_PASSWORD, style: 'border-emerald-700 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white' },
      ];
      if (!demoUsers.some((u) => u.email && u.pass)) return null;

      return (
        <div className="pt-2.5 border-t border-slate-200 mt-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-['Space_Mono',monospace] font-bold text-slate-500 uppercase tracking-wider">
              Quick Role Sign In
            </span>
            <span className="text-[9px] text-slate-400 font-medium">Local Dev Demo Login</span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {demoUsers.map((u) => (
              <button
                key={u.key}
                type="button"
                onClick={() => onSelect(u.email, u.pass)}
                className={`px-1 py-1 text-[10px] font-bold rounded-lg border ${u.style} transition-all shadow-xs text-center truncate`}
                title={`Sign in as ${u.label}`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
      );
    }
  : null;

// ====================================================================
// LOGIN
// ====================================================================
export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showMuralOnMobile, setShowMuralOnMobile] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaContainerRef = useRef(null);
  const captchaWidgetIdRef = useRef(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const logoutReason = new URLSearchParams(location.search).get('reason');
  const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

  // Load reCAPTCHA script and render widget
  useEffect(() => {
    if (!SITE_KEY) return;
    const SCRIPT_ID = 'recaptcha-script';
    const renderWidget = () => {
      if (captchaContainerRef.current && captchaWidgetIdRef.current === null && window.grecaptcha) {
        captchaWidgetIdRef.current = window.grecaptcha.render(captchaContainerRef.current, {
          sitekey: SITE_KEY,
          callback: (token) => setCaptchaToken(token),
          'expired-callback': () => setCaptchaToken(''),
          'error-callback': () => setCaptchaToken(''),
        });
      }
    };
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoad&render=explicit';
      script.async = true;
      script.defer = true;
      window.onRecaptchaLoad = renderWidget;
      document.head.appendChild(script);
    } else if (window.grecaptcha?.render) {
      renderWidget();
    } else {
      window.onRecaptchaLoad = renderWidget;
    }
    return () => {
      // Cleanup: reset widget ref so it can re-render if component re-mounts
      captchaWidgetIdRef.current = null;
    };
  }, [SITE_KEY]);

  const performLogin = async (loginEmail, loginPassword) => {
    setError('');
    setLoading(true);
    try {
      // Reject early if CAPTCHA is enabled but token not yet obtained
      if (SITE_KEY && !captchaToken) {
        setError('Please complete the CAPTCHA before signing in.');
        setLoading(false);
        return;
      }
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
          ...(captchaToken ? { 'g-recaptcha-response': captchaToken } : {}),
        }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('Unable to connect to the server. Please try again shortly.');
      }
      if (!data.success) {
        const err = new Error(data.message || 'Login failed');
        err.status = res.status;
        throw err;
      }
      login(data.data.user, data.data.accessToken);
      navigate(ROLES[data.data.user.role].route);
    } catch (err) {
      const raw = err?.message || '';
      if (err.status === 409 || /already logged in/i.test(raw)) {
        setError(raw || 'This account is already logged in on another device');
      } else if (/invalid|incorrect|credential|password|email/i.test(raw) && !/server|init|import|syntax|failed/i.test(raw)) {
        setError('Invalid username or password. Please verify your credentials.');
      } else if (/rate limit|too many/i.test(raw)) {
        setError('Too many login attempts. Please wait a moment and try again.');
      } else if (/inactive|blocked|disabled|suspended/i.test(raw)) {
        setError('Your account is inactive. Please contact the administrator.');
      } else if (/captcha/i.test(raw)) {
        setError('CAPTCHA verification failed. Please try again.');
      } else {
        setError(raw || 'Unable to sign in right now. Please try again in a few moments.');
      }
      // Reset CAPTCHA widget so user can try again
      if (SITE_KEY && captchaWidgetIdRef.current !== null && window.grecaptcha) {
        window.grecaptcha.reset(captchaWidgetIdRef.current);
        setCaptchaToken('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await performLogin(email, password);
  };

  const emailHasValue = email.trim().length > 0;
  const passHasValue = password.length > 0;

  return (
    <div className="min-h-screen lg:h-screen lg:max-h-screen flex flex-col bg-[#F0EDE6] text-slate-900 select-none overflow-y-auto lg:overflow-hidden">
      {/* ========================================================================= */}
      {/* RETRO TOP NAVIGATION BAR */}
      {/* ========================================================================= */}
      <header className="w-full bg-[#0E2233] h-11 sm:h-12 px-4 sm:px-8 flex items-center justify-between border-b border-[#1E3A52] shadow-md z-30 shrink-0">
        {/* Left: TBI-GEU Brand mark with Logo */}
        <div className="flex items-center gap-2.5">
          <img
            src="/tbi-logo.png"
            alt="TBI-GEU Logo"
            className="w-7 h-7 sm:w-8 sm:h-8 object-contain rounded-full border border-[#E5B558]/40 shadow-[0_0_6px_rgba(229,181,88,0.3)] shrink-0"
          />
          <div className="w-2 h-2 rounded-full bg-[#E5B558] shadow-[0_0_8px_#E5B558] animate-pulse" />
          <span className="font-['Barlow_Condensed',sans-serif] font-black text-xl sm:text-2xl tracking-wider text-[#E5B558] uppercase">
            TBI-GEU
          </span>
        </div>

        {/* Clean right accent / indicator */}
        <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-['Space_Mono',monospace] text-[#8EA0B2] uppercase tracking-wider">
          <span className="hidden sm:inline">PORTAL AUTHENTICATION</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10B981]" title="System Operational" />
        </div>
      </header>
      {/* ========================================================================= */}
      {/* MAIN DUAL-PANEL CONTENT — SEAMLESS CONTIGUOUS TECHNICAL TAPESTRY */}
      {/* ========================================================================= */}
      <main className="flex-1 lg:h-[calc(100vh-48px)] lg:max-h-[calc(100vh-48px)] relative w-full overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row items-center justify-start bg-[#FAF7F0] select-none">
        {/* ----------------------------------------------------------------------- */}
        {/* DESKTOP FULL CONTIGUOUS TAPESTRY BACKGROUND (Quilt, Circuits, AI chip, Gauges, Gears) */}
        {/* ----------------------------------------------------------------------- */}
        <div
          className="hidden lg:block absolute inset-0 w-full h-full pointer-events-none select-none z-0"
          style={{
            backgroundImage: `url('/tbi-tapestry-canvas.jpg')`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />

        {/* ----------------------------------------------------------------------- */}
        {/* MOBILE FALLBACK: Banner Quilt Toggle */}
        {/* ----------------------------------------------------------------------- */}
        <div className="w-full lg:hidden relative flex flex-col items-center justify-start overflow-hidden shrink-0 z-10 p-2">
          <button
            type="button"
            onClick={() => setShowMuralOnMobile(!showMuralOnMobile)}
            className="text-xs font-['Space_Mono',monospace] font-bold text-[#6B5A3E] flex items-center gap-1.5 py-1.5 px-3 rounded bg-[#E4DDD0] border border-[#D5CBB8] shadow-sm cursor-pointer mb-2"
          >
            <span>{showMuralOnMobile ? '▼ Hide' : '▶ View'} Innovation Focus Sectors Mural</span>
          </button>
          {showMuralOnMobile && (
            <img
              src="/tbi-mural-crisp.png"
              alt="TBI Innovation Focus Sectors"
              className="w-full h-auto max-h-[360px] object-contain rounded-lg border border-[#D5CBB8] mb-4"
            />
          )}
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* INTERACTIVE LOGIN CARD: EXACT MATCH TO USER IMAGE SPECIFICATION */}
        {/* ----------------------------------------------------------------------- */}
        <div className="w-full lg:w-auto lg:absolute lg:left-[49.9%] lg:top-1/2 lg:-translate-y-1/2 z-20 flex justify-center items-center px-4 py-4 lg:p-0">
          <div className="w-full max-w-[440px] sm:max-w-[460px] lg:w-[516px] lg:min-h-[488px] bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-5 sm:p-6 shadow-[7px_7px_0px_0px_#1A1A1A] flex flex-col justify-between">
            {/* Header: Vintage TBI Round Seal + Titles */}
            <div className="flex items-center gap-3 sm:gap-3.5 mb-3 sm:mb-3.5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-[2.5px] border-[#1A1A1A] p-1 bg-[#F5F2EB] shadow-[2px_2px_0px_0px_#1A1A1A] shrink-0 flex items-center justify-center">
                <img
                  src="/tbi-logo.png"
                  alt="TBI-GEU Logo"
                  className="w-9 h-9 sm:w-11 sm:h-11 object-contain"
                />
              </div>
              <div className="min-w-0">
                <h1 className="font-['Barlow_Condensed',sans-serif] font-black text-xl sm:text-2xl text-[#1A1A1A] uppercase tracking-tight leading-none">
                  WELCOME, TBI-GEU INNOVATION<br />TEAM!
                </h1>
                <h2 className="font-['Barlow_Condensed',sans-serif] font-bold text-[11px] sm:text-xs text-[#1B5299] uppercase tracking-wider mt-1">
                  EMPLOYEE MANAGEMENT PORTAL ACCESS
                </h2>
              </div>
            </div>

            {/* Focus Sector Integration Panel Yellow Tag & Rule */}
            <div className="mb-3.5 sm:mb-4 flex items-center gap-2">
              <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-['Space_Mono',monospace] font-bold uppercase tracking-wider bg-[#E6B800] text-[#1A1A1A] border-2 border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A]">
                Focus Sector Integration Panel
              </span>
              <div className="flex-1 h-[2px] bg-[#1A1A1A]" />
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-3.5">
              {/* Field 1: Username / Email */}
              <div>
                <label className="block font-['Barlow_Condensed',sans-serif] font-black text-xs sm:text-sm text-[#1A1A1A] uppercase tracking-wide mb-1">
                  Username / Email
                </label>
                <div className="relative flex items-center bg-white border-[2.5px] border-[#1B5299] shadow-[3px_3px_0px_0px_#1A1A1A] rounded-xl transition-all focus-within:shadow-[3px_3px_0px_0px_#1B5299]">
                  <span className="pl-3 text-slate-500 shrink-0">
                    <UserIcon className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  </span>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Username / Email"
                    required

                    className="flex-1 min-w-0 bg-transparent font-['Space_Mono',monospace] text-xs sm:text-sm text-[#1A1A1A] placeholder-[#8A8A8A] outline-none py-2 sm:py-2.5 px-2.5 font-medium"
                  />
                  <div className="pr-3 shrink-0">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full border border-slate-400 ${emailHasValue ? 'bg-[#10B981]' : 'bg-transparent'}`} />
                  </div>
                </div>
              </div>

              {/* Field 2: Password */}
              <div>
                <label className="block font-['Barlow_Condensed',sans-serif] font-black text-xs sm:text-sm text-[#1A1A1A] uppercase tracking-wide mb-1">
                  Password
                </label>
                <div className="relative flex items-center bg-white border-[2.5px] border-[#1A1A1A] shadow-[3px_3px_0px_0px_#1A1A1A] rounded-xl transition-all focus-within:border-[#1B5299] focus-within:shadow-[3px_3px_0px_0px_#1B5299]">
                  <span className="pl-3 text-slate-500 shrink-0">
                    <Lock className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    className="flex-1 min-w-0 bg-transparent font-['Space_Mono',monospace] text-xs sm:text-sm text-[#1A1A1A] placeholder-[#8A8A8A] outline-none py-2 sm:py-2.5 px-2.5 font-medium"
                  />
                  <div className="pr-3 shrink-0">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full border border-slate-400 ${passHasValue ? 'bg-[#10B981]' : 'bg-transparent'}`} />
                  </div>
                </div>
              </div>

              {/* Inactivity & Expiry notices */}
              {logoutReason === 'inactivity' && !error && (
                <div className="p-2.5 bg-amber-50 border-2 border-amber-500 shadow-[2px_2px_0px_0px_#1A1A1A] rounded-lg text-xs text-amber-950 font-['Space_Mono',monospace] font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
                  <span>Logged out due to inactivity. Please sign in again.</span>
                </div>
              )}
              {logoutReason === 'timeout' && !error && (
                <div className="p-2.5 bg-amber-50 border-2 border-amber-500 shadow-[2px_2px_0px_0px_#1A1A1A] rounded-lg text-xs text-amber-950 font-['Space_Mono',monospace] font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
                  <span>Session timed out. Please log in again.</span>
                </div>
              )}
              {logoutReason === 'session_ended' && !error && (
                <div className="p-2.5 bg-red-50 border-2 border-[#C8322B] shadow-[2px_2px_0px_0px_#1A1A1A] rounded-lg text-xs text-red-950 font-['Space_Mono',monospace] font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-[#C8322B] shrink-0" />
                  <span>Session ended. Please log in again.</span>
                </div>
              )}
              {logoutReason === 'session_expired' && !error && (
                <div className="p-2.5 bg-amber-50 border-2 border-amber-500 shadow-[2px_2px_0px_0px_#1A1A1A] rounded-lg text-xs text-amber-950 font-['Space_Mono',monospace] font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Session expired. Please sign in again.</span>
                </div>
              )}

              {/* Error notice */}
              {error && (
                <div className="p-2 bg-red-100 border-2 border-[#C8322B] shadow-[2px_2px_0px_0px_#1A1A1A] rounded-lg text-xs text-[#C8322B] font-['Space_Mono',monospace] font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#C8322B] shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* reCAPTCHA Widget — only rendered when VITE_RECAPTCHA_SITE_KEY is set */}
              {SITE_KEY && (
                <div className="flex justify-center pt-1">
                  <div ref={captchaContainerRef} />
                </div>
              )}

              {/* Primary Action Button */}
              <div className="pt-1 sm:pt-1.5">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#C8322B] hover:bg-[#B32720] text-white font-['Barlow_Condensed',sans-serif] font-black text-xl sm:text-2xl uppercase tracking-wider py-2.5 sm:py-3 px-6 border-[2.5px] border-[#1A1A1A] shadow-[4px_4px_0px_0px_#1A1A1A] hover:shadow-[2px_2px_0px_0px_#1A1A1A] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-center"
                >
                  {loading ? 'Accessing...' : 'Sign In'}
                </button>
              </div>

              {/* Quick Demo Access Bar (Development only) */}
              {DemoLoginBar && (
                <DemoLoginBar
                  onSelect={(e, p) => {
                    setEmail(e || '');
                    setPassword(p || '');
                    void performLogin(e || '', p || '');
                  }}
                />
              )}
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

// ====================================================================
// LAYOUT CONTEXT (Mobile Drawer & Desktop Collapse)
// ====================================================================
export const LayoutContext = createContext({
  collapsed: false,
  setCollapsed: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
});
export const useLayout = () => useContext(LayoutContext);

// ====================================================================
// SIDEBAR
// ====================================================================
export const Sidebar = () => {
  const { user, logout } = useAuth();
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useLayout();
  const navigate = useNavigate();
  const location = useLocation();
  const socket = useSocket();
  const cfg = ROLES[user.role];
  const menus = MENUS[user.role];

  // Dynamic notification counts
  const [badges, setBadges] = useState({
    applications: 0,
    chat: 0,
    announcements: 0,
  });

  const fetchBadges = async () => {
    if (!user) return;
    try {
      // 1. Fetch unread notifications
      const notifsRes = await api.get('/notifications');
      const notifs = notifsRes.data?.data || [];
      const unread = notifs.filter((n) => !n.isRead);

      const unreadChat = unread.filter((n) => n.type === 'chat').length;
      const unreadApp = unread.filter((n) => n.type === 'application').length;
      const unreadAnn = unread.filter((n) => n.type === 'announcement').length;

      // 2. For managers (T3, Admin, Super Admin), fetch pending applications count
      let pendingAppsCount = 0;
      if (['T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
        try {
          const appRes = await api.get('/applications');
          const apps = appRes.data?.data || [];
          pendingAppsCount = apps.filter((a) => a.status === 'pending').length;
        } catch { /* ignore badge fetch error */ }
      }

      setBadges({
        // For managers, pending applications waiting for review is paramount, plus unread updates
        applications: (['T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'].includes(user.role) && pendingAppsCount > 0) ? pendingAppsCount : unreadApp,


        chat: unreadChat,
        announcements: unreadAnn,
      });
    } catch (_) {
      // silent
    }
  };

  useEffect(() => {
    void fetchBadges();
    const interval = setInterval(fetchBadges, 30000);
    const handleCustomRefresh = () => fetchBadges();
    window.addEventListener('app:badge-refresh', handleCustomRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('app:badge-refresh', handleCustomRefresh);
    };
  }, [user]);

  // When route changes: if user navigates to /chat, mark chat notifications as read
  useEffect(() => {
    if (location.pathname === '/chat' && badges.chat > 0) {
      api.patch('/notifications/read-type/chat').catch(() => {});
      setBadges((prev) => ({ ...prev, chat: 0 }));
    }
    void fetchBadges();
  }, [location.pathname]);

  // Real-time socket events
  useEffect(() => {
    if (!socket) return;

    const handleNewNotif = (notif) => {
      setBadges((prev) => {
        const next = { ...prev };
        if (notif.type === 'chat') {
          if (location.pathname !== '/chat') {
            next.chat = (next.chat || 0) + 1;
          }
        } else if (notif.type === 'application') {
          next.applications = (next.applications || 0) + 1;
        } else if (notif.type === 'announcement') {
          next.announcements = (next.announcements || 0) + 1;
        }
        return next;
      });
    };

    const handleChatMsg = () => {
      if (location.pathname !== '/chat') {
        setBadges((prev) => ({ ...prev, chat: (prev.chat || 0) + 1 }));
      }
    };

    socket.on('notification:new', handleNewNotif);
    socket.on('chat:new_message', handleChatMsg);
    return () => {
      socket.off('notification:new', handleNewNotif);
      socket.off('chat:new_message', handleChatMsg);
    };
  }, [socket, location.pathname]);

  const getItemBadge = (item) => {
    if (item.to?.includes('applications')) {
      return badges.applications;
    }
    if (item.to === '/chat') {
      return badges.chat;
    }
    if (item.to === '/announcements') {
      return badges.announcements;
    }
    return item.badge || 0;
  };

  return (
    <aside
      className={`h-screen flex flex-col border-r border-white/10 transition-all duration-300 z-50 ${
        mobileOpen
          ? 'fixed inset-y-0 left-0 w-64 translate-x-0 shadow-2xl'
          : 'fixed -translate-x-full md:relative md:translate-x-0 ' + (collapsed ? 'md:w-16' : 'md:w-64')
      }`}
      style={{ backgroundColor: cfg.sidebarBg }}
    >
      <div className={`h-16 flex items-center border-b border-white/10 relative ${collapsed ? 'justify-between px-3 md:justify-center md:px-2' : 'justify-between px-4'}`}>
        <div
          onClick={() => collapsed && setCollapsed(false)}
          className={`flex items-center gap-2.5 min-w-0 ${collapsed ? 'cursor-pointer' : ''}`}
          title={collapsed ? 'Click to expand sidebar' : 'TBI-GEU'}
        >
          <img
            src="/tbi-geu-logo.png"
            alt="TBI-GEU"
            className="w-8 h-8 rounded-full object-contain bg-white p-0.5 shadow-sm ring-1 ring-white/20 flex-shrink-0"
          />
          {(!collapsed || mobileOpen) && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-white font-bold text-lg tracking-wide">TBI-GEU</span>
              <span className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: cfg.color }} />
            </div>
          )}
        </div>

        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 md:hidden transition-colors"
          title="Close menu"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Desktop collapse toggle */}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="hidden md:block text-gray-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="hidden md:flex absolute -right-3 top-5 w-6 h-6 rounded-full bg-slate-800 border border-white/20 text-gray-300 hover:text-white items-center justify-center shadow-md z-30 transition-transform hover:scale-110"
            title="Expand sidebar"
          >
            <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
          </button>
        )}
      </div>

      {(!collapsed || mobileOpen) && (
        <div className="p-3">
          <div className="rounded-xl p-3 border" style={{ backgroundColor: `${cfg.color}15`, borderColor: `${cfg.color}30` }}>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: cfg.color }}>
                {cfg.code}
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{user.name}</p>
                <span className="text-[10px] text-white/80">{cfg.label}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {menus.map((sec) => (
          <div key={sec.section}>
            {(!collapsed || mobileOpen) && <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-3 pt-5 pb-2">{sec.section}</p>}
            {sec.items.map((item) => {
              const badgeCount = getItemBadge(item);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 h-10 px-3 rounded-lg text-sm transition-all duration-150 relative group ${
                      isActive
                        ? 'text-white font-medium shadow-sm'
                        : 'text-gray-300 hover:bg-white/5 hover:text-white'
                    }`
                  }
                  style={({ isActive }) =>
                    isActive
                      ? {
                          backgroundColor: `${cfg.color}25`,
                          borderLeft: `3px solid ${cfg.color}`,
                        }
                      : {}
                  }
                >
                  <div className="relative flex-shrink-0">
                    <item.icon className="w-5 h-5" />
                    {collapsed && !mobileOpen && badgeCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-slate-900 animate-pulse" />
                    )}
                  </div>
                  {(!collapsed || mobileOpen) && <span className="flex-1 truncate">{item.label}</span>}
                  {(!collapsed || mobileOpen) && badgeCount > 0 && (
                    <span
                      title={`${badgeCount} item${badgeCount > 1 ? 's' : ''}`}
                      className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold text-white flex items-center justify-center bg-rose-500 shadow-sm shadow-rose-900/40 animate-pulse flex-shrink-0"
                    >
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-2 space-y-1">
        <button
          onClick={() => {
            logout();
            navigate('/login?switch=true');
            setMobileOpen(false);
          }}
          title="Switch to another user role"
          className="w-full flex items-center gap-3 h-10 px-3 rounded-lg text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors"
        >
          <Key className="w-4 h-4 shrink-0 text-amber-400" />
          {(!collapsed || mobileOpen) && <span className="truncate">Switch Role</span>}
        </button>
        <button
          onClick={() => { logout(); navigate('/login'); setMobileOpen(false); }}
          className="w-full flex items-center gap-3 h-10 px-3 rounded-lg text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {(!collapsed || mobileOpen) && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
};

// ====================================================================
// TOPBAR
// ====================================================================
export const Topbar = () => {
  const { user } = useAuth();
  const { setMobileOpen } = useLayout();
  const navigate = useNavigate();
  const socket = useSocket();
  const cfg = ROLES[user.role];
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await api.get('/notifications');
        setUnreadCount(res.data.data.filter((n) => !n.isRead).length);
      } catch (err) {
        // silent
      }
    };
    void fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleNew = () => {
      setUnreadCount((prev) => prev + 1);
    };
    socket.on('notification:new', handleNew);
    return () => socket.off('notification:new', handleNew);
  }, [socket]);

  return (
    <header className="h-16 flex items-center justify-between px-3 sm:px-6 bg-white border-b border-gray-200 gap-2 shrink-0">
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 max-w-md">
        {/* Mobile Hamburger Menu Toggle */}
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden p-2 -ml-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          title="Open menu"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile Brand Mark */}
        <div className="flex items-center gap-1.5 md:hidden flex-shrink-0">
          <img
            src="/tbi-geu-logo.png"
            alt="TBI-GEU"
            className="w-7 h-7 rounded-full object-contain"
          />
          <span className="font-bold text-xs sm:text-sm text-gray-900 hidden xs:inline tracking-wide">TBI-GEU</span>
        </div>

        {/* Search Input */}
        <div className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100/70 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20 px-2.5 py-1.5 rounded-lg border border-gray-200/80 transition-all flex-1 min-w-0 max-w-xs md:max-w-md">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full bg-transparent border-none outline-none text-xs sm:text-sm text-gray-800 placeholder-gray-400 min-w-0"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <button
          onClick={() => navigate('/notifications')}
          className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
          title="Notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span
              className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 text-[10px] rounded-full text-white flex items-center justify-center font-bold"
              style={{ backgroundColor: cfg.color }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        <div
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 cursor-pointer p-1 rounded-lg hover:bg-gray-50 transition-colors"
          title="View profile"
        >
          <div
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-xs"
            style={{ backgroundColor: cfg.color }}
          >
            {user.name.charAt(0)}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium text-gray-800 leading-tight truncate max-w-[120px]">{user.name}</p>
            <p className="text-[11px] text-gray-500 leading-tight">{cfg.label}</p>
          </div>
        </div>
      </div>
    </header>
  );
};

// ====================================================================
// LAYOUT
// ====================================================================
export const Layout = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <LayoutContext.Provider value={useMemo(() => ({ collapsed, setCollapsed, mobileOpen, setMobileOpen }), [collapsed, mobileOpen])}>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        {/* Mobile Backdrop Overlay */}
        {mobileOpen && (
          <div
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 md:hidden transition-opacity"
            aria-hidden="true"
          />
        )}

        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-6 bg-slate-50/90 relative">
            {/* Centered Transparent Watermark */}
            <div
              className={`pointer-events-none fixed inset-0 flex items-center justify-center select-none z-0 overflow-hidden transition-all duration-300 opacity-[0.035] ${
                collapsed ? 'pl-0 md:pl-16' : 'pl-0 md:pl-64'
              }`}
              aria-hidden="true"
            >
              <img
                src="/tbi-geu-logo.png"
                alt=""
                className="w-[280px] h-[280px] sm:w-[400px] sm:h-[400px] md:w-[500px] md:h-[500px] max-w-[75vw] max-h-[75vh] object-contain drop-shadow-sm"
              />
            </div>
            <div className="relative z-10 max-w-full min-w-0">
              {children}
            </div>
          </main>
          <AnnouncementPopup />
        </div>
      </div>
    </LayoutContext.Provider>
  );
};

// ====================================================================
// SHARED
// ====================================================================
export const Kpi = ({ label, value, change }) => (
  <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-gray-200 hover:shadow-md transition-shadow min-w-0">
    <p className="text-xs sm:text-sm text-gray-500 truncate">{label}</p>
    <p className="text-xl sm:text-2xl md:text-3xl font-bold mt-1 sm:mt-2 truncate text-gray-900">{value}</p>
    {change && <p className="text-[10px] sm:text-xs text-green-500 mt-1">+{change}</p>}
  </div>
);
export const KPI = Kpi;

// ====================================================================
// ANNOUNCEMENT BANNER — Shows on dashboards when there are new announcements
// ====================================================================
export const AnnouncementBanner = () => {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await api.get('/announcements');
        const recent = (res.data.data || []).filter((a) => {
          const created = new Date(a.createdAt).getTime();
          const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          return created > weekAgo;
        });
        setCount(recent.length);
      } catch (err) {
        // Silent
      }
    };
    void fetchCount();
  }, []);

  if (count === 0) return null;

  return (
    <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-4 flex items-center justify-between text-white">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
          <Bell className="w-5 h-5" />
        </div>
        <div>
          <p className="font-semibold text-sm">
            {count} new announcement{count > 1 ? 's' : ''} this week
          </p>
          <p className="text-xs opacity-90">Check what's happening on the platform</p>
        </div>
      </div>
      <button
        onClick={() => navigate('/announcements')}
        className="px-4 py-2 bg-white text-indigo-600 rounded-lg font-medium text-sm hover:bg-indigo-50 whitespace-nowrap"
      >
        View All
      </button>
    </div>
  );
};

export const Placeholder = ({ title }) => (
  <div className="flex flex-col items-center justify-center h-96 text-center">
    <Construction className="w-16 h-16 text-gray-300 mb-4" />
    <h2 className="text-2xl font-bold mb-2">{title}</h2>
    <p className="text-gray-500">This page is under construction</p>
  </div>
);

export const ProtectedRoute = ({ children, roles }) => {
  const { user, initializing } = useAuth();

  // Wait for storage to be read before deciding
  if (initializing) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  const hasToken = typeof window !== 'undefined' && Boolean(
    sessionStorage.getItem('tbi_token') || localStorage.getItem('tbi_token')
  );

  if (!user || !hasToken) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={ROLES[user.role].route} replace />;
  }
  return <Layout>{children}</Layout>;
};


// ====================================================================
// DASHBOARDS
// ====================================================================
export const AdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [tiers, setTiers] = useState(null);
  const [trend, setTrend] = useState([]);
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [statsRes, tiersRes, trendRes, attendRes] = await Promise.all([
          api.get('/stats/admin'),
          api.get('/stats/users-by-tier'),
          api.get('/stats/applications-trend'),
          api.get('/stats/attendance'),
        ]);
        setStats(statsRes.data.data);
        setTiers(tiersRes.data.data);
        setTrend(trendRes.data.data);
        setAttendance(attendRes.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  const tierPieData = tiers ? [
    { name: 'T1 Volunteers', value: tiers.T1 || 0, color: '#059669', fill: '#059669' },
    { name: 'T2 Associates', value: tiers.T2 || 0, color: '#0284C7', fill: '#0284C7' },
    { name: 'T3 Executives', value: tiers.T3 || 0, color: '#7C3AED', fill: '#7C3AED' },
    { name: 'Admins', value: (tiers.Admin || 0) + (tiers.SuperAdmin || 0), color: '#DC2626', fill: '#DC2626' },
  ].filter((d) => d.value > 0) : [];

  return (
    <div className="space-y-6">
      <AnnouncementBanner />
      <div>
        <h1 className="text-2xl font-bold">Good morning, {user.name.split(' ')[0]}</h1>
        <p className="text-gray-500">Here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi label="Total Users" value={stats?.totalUsers ?? 0} />
        <Kpi label="Active Events" value={stats?.activeEvents ?? 0} />
        <Kpi label="Approval Rate" value={`${stats?.approvalRate ?? 0}%`} />
        <Kpi label="Teams" value={stats?.totalTeams ?? 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 min-w-0 overflow-hidden">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-500" /> Users by Tier
          </h3>
          {tierPieData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-gray-400">
              No users yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={tierPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                />




                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 min-w-0 overflow-hidden">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gray-500" /> Applications (Last 7 Days)
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
              <Line type="monotone" dataKey="count" stroke="#0EA5E9" strokeWidth={3} dot={{ r: 5, fill: '#0EA5E9' }} activeDot={{ r: 7 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-gray-500" /> Attendance Today
          </h3>
          {!attendance || attendance.total === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-gray-400">
              No check-ins today
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={[
                  { status: 'Present', count: attendance.present, fill: '#10B981' },
                  { status: 'Late', count: attendance.late, fill: '#F59E0B' },
                  { status: 'Absent', count: attendance.absent, fill: '#EF4444' },
                ]}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} />




              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-500" /> Application Status
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={[
                { status: 'Pending', count: stats.pendingApplications },
                { status: 'Approved', count: stats.approvedApplications },
                { status: 'Rejected', count: stats.rejectedApplications },
              ]}
              layout="vertical"
              margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis dataKey="status" type="category" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
              <Bar dataKey="count" radius={[0, 8, 8, 0]} fill="#0EA5E9" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export const SuperAdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [tiers, setTiers] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [statsRes, tiersRes, trendRes] = await Promise.all([
          api.get('/stats/super-admin'),
          api.get('/stats/users-by-tier'),
          api.get('/stats/applications-trend'),
        ]);
        setStats(statsRes.data.data);
        setTiers(tiersRes.data.data);
        setTrend(trendRes.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  const tierPieData = tiers ? [
    { name: 'T1', value: tiers.T1 || 0, color: '#059669', fill: '#059669' },
    { name: 'T2', value: tiers.T2 || 0, color: '#0284C7', fill: '#0284C7' },
    { name: 'T3', value: tiers.T3 || 0, color: '#7C3AED', fill: '#7C3AED' },
    { name: 'Admin', value: (tiers.Admin || 0) + (tiers.SuperAdmin || 0), color: '#DC2626', fill: '#DC2626' },
  ].filter((d) => d.value > 0) : [];

  return (
    <div className="space-y-6">
      <AnnouncementBanner />
      <div>
        <h1 className="text-2xl font-bold">Welcome, {user.name}</h1>
        <p className="text-gray-500">Full system overview and admin actions.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi label="Admins" value={stats?.admins ?? 0} />
        <Kpi label="Total Users" value={stats?.totalUsers ?? 0} />
        <Kpi label="Active Events" value={stats?.activeEvents ?? 0} />
        <Kpi label="Check-ins Today" value={stats?.sessionsToday ?? 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 min-w-0 overflow-hidden">
          <h3 className="font-semibold mb-4">Users by Tier</h3>
          {tierPieData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-gray-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={tierPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" />




                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 min-w-0 overflow-hidden">
          <h3 className="font-semibold mb-4">Applications (7 Days)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
              <Bar dataKey="count" fill="#EF4444" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export const T1Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get('/stats/t1');
        setStats(res.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const [myAttendance, setMyAttendance] = useState(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get('/attendance/my-stats?days=30');
        setMyAttendance(res.data.data);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const safeStats = stats || {};
  let todayStatusMessage = 'You have not checked in yet today.';
  if (safeStats.todayCheckedIn) {
    todayStatusMessage = safeStats.todayCheckedOut
      ? 'Your shift is complete for today.'
      : 'You are checked in. Remember to check out.';
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <AnnouncementBanner />
      <div>
        <h1 className="text-2xl font-bold">Hi {user.name.split(' ')[0]}</h1>
        <p className="text-gray-500">
          {todayStatusMessage}




        </p>
      </div>

      {/* Today's status card */}
      {safeStats.todayCheckedIn ? (
        <div className="bg-white rounded-xl border-l-4 border-l-green-500 border border-gray-200 p-6">
          <p className="text-sm font-semibold text-green-600 mb-3">TODAY'S STATUS</p>
          <h3 className="text-xl font-bold mb-2">
            {safeStats.todayCheckedOut ? 'Shift Complete' : 'Checked In'}
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            {safeStats.todayCheckedOut
              ? 'Great work today.'
              : 'Don\'t forget to check out at the end of your shift.'}
          </p>
          {!safeStats.todayCheckedOut && (
            <button
              onClick={() => navigate('/t1/checkin')}
              className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600"
            >
              Check Out
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border-l-4 border-l-blue-500 border border-gray-200 p-6">
          <p className="text-sm font-semibold text-blue-600 mb-3">READY TO CHECK IN?</p>
          <h3 className="text-xl font-bold mb-2">Start Your Shift</h3>
          <p className="text-sm text-gray-600 mb-4">Scan the QR code from your team lead.</p>
          <button
            onClick={() => navigate('/t1/checkin')}
            className="px-4 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600"
          >
            Check In Now
          </button>
        </div>
      )}

      {/* Personal Attendance Card */}
      {myAttendance && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">My Attendance (30 Days)</h3>
            <button onClick={() => navigate('/t1/checkin')} className="text-xs text-blue-500 hover:underline">
              View →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold text-blue-600">{myAttendance.percentage}%</p>
              <p className="text-xs text-gray-500 mt-0.5">Attendance Rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-600">{myAttendance.totalHours}h</p>
              <p className="text-xs text-gray-500 mt-0.5">Total Hours</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-100 text-center">
            <div>
              <p className="text-lg font-bold text-green-600">{myAttendance.present}</p>
              <p className="text-[10px] text-gray-500 uppercase">Present</p>
            </div>
            <div>
              <p className="text-lg font-bold text-amber-600">{myAttendance.late}</p>
              <p className="text-[10px] text-gray-500 uppercase">Late</p>
            </div>
            <div>
              <p className="text-lg font-bold text-red-600">{myAttendance.absent}</p>
              <p className="text-[10px] text-gray-500 uppercase">Absent</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Kpi label="Applications" value={stats.myApplications} />
        <Kpi label="Approved" value={stats.approved} />
        <Kpi label="Certificates" value={stats.certificates} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Kpi label="Pending" value={stats.pending} />
        <Kpi label="Days Attended" value={stats.attendanceDays} />
        <Kpi label="My Teams" value={stats.myTeams} />
      </div>
    </div>
  );
};

// ====================================================================
// USER MANAGEMENT — Connected to real backend
// ====================================================================
const ENFORCED_ADMIN_PERMISSIONS = [
  { key: 'users:read', label: 'View Users (users:read)', desc: 'Access user directory and search' },
  { key: 'users:create', label: 'Create Users (users:create)', desc: 'Add new users manually' },
  { key: 'users:bulk_import', label: 'Bulk Import Users (users:bulk_import)', desc: 'Import users via CSV/spreadsheet' },
  { key: 'users:assign_role', label: 'Assign Roles & Tiers (users:assign_role)', desc: 'Update user profiles, roles, and progression tiers' },
  { key: 'users:deactivate', label: 'Reset User Sessions (users:deactivate)', desc: 'Force-terminate active user sessions' },
];

const ALL_ADMIN_DEFAULT_PERMISSIONS = [
  'users:read', 'users:create', 'users:bulk_import', 'users:deactivate', 'users:reset_password',
  'users:assign_role', 'users:grant_permission',
  'events:read', 'events:create', 'events:update', 'events:close', 'shifts:manage',
  'applications:read_all', 'applications:review',
  'attendance:generate_qr', 'attendance:mark_manual', 'attendance:read',
  'chat:read', 'chat:write', 'chat:moderate',
  'certificates:generate',
  'analytics:platform_read', 'analytics:team_read', 'audit_logs:read'
];

export const UserManagement = () => {
  const { user: currentUser } = useAuth();
  const canManageAccess = currentUser.role === 'SUPER_ADMIN';

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'T1_VOLUNTEER' });
  const [saving, setSaving] = useState(false);
  const [revokeModal, setRevokeModal] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeNotes, setRevokeNotes] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [setPasswordModal, setSetPasswordModal] = useState(null);
  const [targetNewPassword, setTargetNewPassword] = useState('');
  const [targetConfirmPassword, setTargetConfirmPassword] = useState('');
  const [showTargetPwd, setShowTargetPwd] = useState(false);
  const [showTargetConfirmPwd, setShowTargetConfirmPwd] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [setPasswordError, setSetPasswordError] = useState('');
  const [setPasswordSuccess, setSetPasswordSuccess] = useState('');
  const [changeEmailModal, setChangeEmailModal] = useState(null);
  const [targetNewEmail, setTargetNewEmail] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);
  const [changeEmailError, setChangeEmailError] = useState('');
  const [changeEmailSuccess, setChangeEmailSuccess] = useState('');
  const [permissionsModal, setPermissionsModal] = useState(null);
  const [selectedGrants, setSelectedGrants] = useState([]);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [permissionsError, setPermissionsError] = useState('');

  // Fetch users
  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsers();
  }, []);

  // Add user
  const addUser = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/admin/users', form);
      setUsers([res.data.data, ...users]);
      setModal(false);
      setForm({ name: '', email: '', phone: '', role: 'T1_VOLUNTEER' });
      alert(`User created!\n\nAn email with login credentials has been sent to ${res.data.data.email}.`);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  // Reset password (Super Admin only) — sends one-time link
  const handleResetPassword = async (u) => {
    if (!canManageAccess) return;
    if (!confirm(`Send a secure password reset link to ${u.name}?\n\nA one-time link will be emailed to: ${u.email}\nThe link will expire in 1 hour.`)) return;
    try {
      const res = await api.post(`/admin/users/${u._id}/reset-password`);
      const { emailSent } = res.data;
      if (emailSent) {
        alert(`Reset link sent!\n\nA secure one-time password reset link has been emailed to:\n${u.email}\n\nThe link expires in 1 hour and can only be used once.`);
      } else {
        alert(`Reset link generated but email delivery failed.\n\nPlease try again or contact your email provider.`);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to send reset link');
    }
  };

  // Set / Change password directly (Super Admin only)
  const handleSetUserPassword = async (e) => {
    e.preventDefault();
    if (!setPasswordModal) return;
    setSetPasswordError('');
    setSetPasswordSuccess('');

    if (targetNewPassword.length < 8) {
      setSetPasswordError('Password must be at least 8 characters');
      return;
    }
    if (!/[A-Z]/.test(targetNewPassword) || !/[a-z]/.test(targetNewPassword) || !/\d/.test(targetNewPassword) || !/[^A-Za-z0-9]/.test(targetNewPassword)) {
      setSetPasswordError('Password must contain uppercase, lowercase, number, and special character');
      return;
    }
    if (targetNewPassword !== targetConfirmPassword) {
      setSetPasswordError('Passwords do not match');
      return;
    }

    setSettingPassword(true);
    try {
      await api.post(`/admin/users/${setPasswordModal._id}/set-password`, { newPassword: targetNewPassword });
      setSetPasswordSuccess(`Password successfully changed for ${setPasswordModal.name}!`);
      setTimeout(() => {
        setSetPasswordModal(null);
        setSetPasswordSuccess('');
        setTargetNewPassword('');
        setTargetConfirmPassword('');
      }, 1500);
    } catch (err) {
      setSetPasswordError(err.response?.data?.message || err.message || 'Failed to set password');
    } finally {
      setSettingPassword(false);
    }
  };

  // Change user email (Super Admin only)
  const handleAdminChangeEmail = async (e) => {
    e.preventDefault();
    if (!changeEmailModal) return;
    setChangeEmailError('');
    setChangeEmailSuccess('');

    if (!targetNewEmail?.includes('@')) {
      setChangeEmailError('Please enter a valid email address');
      return;
    }

    setChangingEmail(true);
    try {
      const res = await api.post(`/admin/users/${changeEmailModal._id}/change-email`, { newEmail: targetNewEmail });
      setUsers(users.map((u) => u._id === changeEmailModal._id ? { ...u, email: res.data.data.email } : u));
      setChangeEmailSuccess(`Email successfully updated to ${res.data.data.email}!`);
      setTimeout(() => {
        setChangeEmailModal(null);
        setChangeEmailSuccess('');
        setTargetNewEmail('');
      }, 1500);
    } catch (err) {
      setChangeEmailError(err.response?.data?.message || err.message || 'Failed to update email');
    } finally {
      setChangingEmail(false);
    }
  };

  // Reactivate user
  const handleReactivate = async (u) => {
    if (!confirm(`Reactivate ${u.name}'s account?\n\nA new temporary password will be generated and emailed.`)) return;
    try {
      const res = await api.post(`/admin/users/${u._id}/reactivate`);
      setUsers(users.map((x) => x._id === u._id ? { ...x, isActive: true } : x));
      const { tempPassword, emailSent } = res.data;
      if (emailSent !== false) {
        alert(`Account reactivated!\n\nNew credentials emailed to ${u.email}\n\nBackup password:\n${tempPassword}`);
      } else {
        alert(`Account reactivated. Share password manually:\n\n${tempPassword}`);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reactivate');
    }
  };

  // Delete user
  const handleDelete = async () => {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/users/${deleteModal._id}`);
      setUsers(users.filter((u) => u._id !== deleteModal._id));
      setDeleteModal(null);
      alert(`${deleteModal.name} has been permanently deleted.`);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  // Revoke user (Super Admin only)
  const revokeUser = async (e) => {
    e.preventDefault();
    if (!revokeReason) {
      alert('Please select a reason');
      return;
    }
    setRevoking(true);
    try {
      const res = await api.post(`/admin/users/${revokeModal._id}/revoke`, {
        reason: revokeReason,
        notes: revokeNotes,
      });
      setUsers(users.map((u) => u._id === revokeModal._id ? { ...u, isActive: false } : u));
      setRevokeModal(null);
      setRevokeReason('');
      setRevokeNotes('');
      alert(res.data.message || `${revokeModal.name}'s access revoked.`);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to revoke');
    } finally {
      setRevoking(false);
    }
  };


  const openPermissionsModal = (u) => {
    setPermissionsModal(u);
    setPermissionsError('');
    if (u.customGrants === undefined || u.customGrants === null) {
      setSelectedGrants(ENFORCED_ADMIN_PERMISSIONS.map((p) => p.key));
    } else {
      setSelectedGrants(ENFORCED_ADMIN_PERMISSIONS.map((p) => p.key).filter((k) => u.customGrants.includes(k)));
    }
  };

  // Save custom permissions: sends all admin defaults minus unticked enforced permissions
  const handleSavePermissions = async () => {
    if (!permissionsModal) return;
    setSavingPermissions(true);
    setPermissionsError('');
    try {
      const otherDefaults = ALL_ADMIN_DEFAULT_PERMISSIONS.filter(
        (p) => !ENFORCED_ADMIN_PERMISSIONS.some((e) => e.key === p)
      );
      const fullListToSend = [...otherDefaults, ...selectedGrants];
      const res = await api.patch('/admin/users/' + permissionsModal._id + '/permissions', {
        customGrants: fullListToSend,
      });
      setUsers(users.map((u) => u._id === permissionsModal._id ? { ...u, customGrants: res.data.data.customGrants } : u));
      setPermissionsModal(null);
    } catch (err) {
      setPermissionsError(err.response?.data?.message || err.message || 'Failed to update permissions');
    } finally {
      setSavingPermissions(false);
    }
  };

  const handleResetPermissions = async () => {
    if (!permissionsModal) return;
    if (!confirm('Reset this Admin to default permissions? This will remove all custom overrides.')) return;
    setSavingPermissions(true);
    setPermissionsError('');
    try {
      await api.patch('/admin/users/' + permissionsModal._id + '/permissions', {
        customGrants: null,
      });
      setUsers(users.map((u) => u._id === permissionsModal._id ? { ...u, customGrants: undefined } : u));
      setPermissionsModal(null);
    } catch (err) {
      setPermissionsError(err.response?.data?.message || err.message || 'Failed to reset permissions');
    } finally {
      setSavingPermissions(false);
    }
  };

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const roleLabel = { T1_VOLUNTEER: 'T1', T2_ASSOCIATE: 'T2', T3_EXECUTIVE: 'T3', ADMIN: 'AD', SUPER_ADMIN: 'SA' };
  const roleColor = {
    T1_VOLUNTEER: 'bg-green-100 text-green-700',
    T2_ASSOCIATE: 'bg-blue-100 text-blue-700',
    T3_EXECUTIVE: 'bg-purple-100 text-purple-700',
    ADMIN: 'bg-orange-100 text-orange-700',
    SUPER_ADMIN: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-gray-500">
            {canManageAccess
              ? 'Full control over user accounts'
              : 'View and create users. Contact Super Admin for access changes.'}
          </p>
        </div>
        <button onClick={() => setModal(true)} className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600">
          + Add User
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or email..."
            className="flex-1 bg-transparent border-none outline-none text-sm"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Users table */}
      {loading ? (
        <SkeletonTable rows={4} cols={5} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[640px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map((u) => (
                <tr key={u._id} className={`hover:bg-gray-50 ${!u.isActive ? 'opacity-60' : ''}`}>
                  <td className="px-6 py-4 text-sm font-medium">{u.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColor[u.role]}`}>
                      {roleLabel[u.role]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {u.isActive ? (
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-100 text-green-700">
                        Active
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-200 text-gray-600">
                        Revoked
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {!canManageAccess ? (
                      <span className="text-xs text-gray-400 italic">View only</span>
                    ) : !u.isActive ? (
                      // Revoked user — show Reactivate + Delete
                      <div className="flex gap-3 flex-wrap">
                        <button
                          onClick={() => handleReactivate(u)}
                          className="text-green-600 hover:underline text-xs font-medium"
                        >
                          Reactivate
                        </button>
                        <button
                          onClick={() => setDeleteModal(u)}
                          className="text-red-600 hover:underline text-xs font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      // Active user — show Set Password + Reset + Revoke
                      <div className="flex gap-3 flex-wrap">
                        {canManageAccess && u.role !== 'SUPER_ADMIN' && (
                          <>
                            <button
                              onClick={() => {
                                setSetPasswordModal(u);
                                setTargetNewPassword('');
                                setTargetConfirmPassword('');
                                setSetPasswordError('');
                                setSetPasswordSuccess('');
                              }}
                              className="text-blue-600 hover:underline text-xs font-medium"
                            >
                              Set Password
                            </button>
                            <button
                              onClick={() => {
                                setChangeEmailModal(u);
                                setTargetNewEmail(u.email);
                                setChangeEmailError('');
                                setChangeEmailSuccess('');
                              }}
                              className="text-purple-600 hover:underline text-xs font-medium"
                            >
                              Change Email
                            </button>
                            {u.role === 'ADMIN' && (
                              <button
                                onClick={() => openPermissionsModal(u)}
                                className="text-indigo-600 hover:underline text-xs font-medium"
                              >
                                Manage Permissions
                              </button>
                            )}
                          </>
                        )}
                        <button
                          onClick={() => handleResetPassword(u)}
                          className="text-amber-600 hover:underline text-xs font-medium"
                        >
                          Send Reset Password
                        </button>
                        <button
                          onClick={() => setRevokeModal(u)}
                          className="text-red-500 hover:underline text-xs font-medium"
                        >
                          Revoke
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No users match your search
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModal(false)} />
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <h3 className="text-lg font-semibold mb-5">Add New User</h3>
            <form onSubmit={addUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Full Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Email</label>
                <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Phone (optional)</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none">
                  <option value="T1_VOLUNTEER">T1 Volunteer</option>
                  <option value="T2_ASSOCIATE">T2 Associate</option>
                  <option value="T3_EXECUTIVE">T3 Executive</option>
                </select>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-start gap-2">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <span>Login credentials will be emailed to the user automatically.</span>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revoke Modal */}
      {revokeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRevokeModal(null)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Revoke Access — {revokeModal.name}</h3>
                <p className="text-xs text-gray-500">{revokeModal.email}</p>
              </div>
            </div>

            <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
              <p className="text-sm text-red-800 font-medium mb-2">This action will:</p>
              <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                <li>Immediately deactivate the account</li>
                <li>Invalidate their current password</li>
                <li>Log this action for audit</li>
              </ul>
            </div>

            <form onSubmit={revokeUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Reason *</label>
                <select
                  required
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-red-500"
                >
                  <option value="">Select a reason...</option>
                  <option value="Policy Violation">Policy Violation</option>
                  <option value="Security Breach">Security Breach</option>
                  <option value="Role Change">Role Change</option>
                  <option value="Resignation">Resignation</option>
                  <option value="Inactive Account">Inactive Account</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Additional Notes</label>
                <textarea
                  rows={3}
                  value={revokeNotes}
                  onChange={(e) => setRevokeNotes(e.target.value)}
                  placeholder="Optional details..."
                  className="w-full p-3 rounded-lg border border-gray-200 outline-none resize-none focus:border-red-500"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setRevokeModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!revokeReason || revoking}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50"
                >
                  {revoking ? 'Revoking...' : 'Revoke Access'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteModal(null)} />
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Permanently Delete User</h3>
                <p className="text-xs text-gray-500 truncate">{deleteModal.email}</p>
              </div>
            </div>

            <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
              <p className="text-sm text-red-800 font-medium mb-2">This action is permanent and cannot be undone:</p>
              <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                <li>User account will be permanently deleted</li>
                <li>All their applications and attendance records</li>
                <li>Reviews they submitted or received</li>
                <li>Their chat history and messages</li>
                <li>Audit logs will retain this deletion action</li>
              </ul>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
              <p className="text-xs text-amber-800">
                <strong>Tip:</strong> If you only want to restrict access temporarily, use "Revoke" instead.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Trash2 size={14} /> {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set / Change Password Modal (Super Admin) */}
      {setPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSetPasswordModal(null)} />
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Key className="w-5 h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold truncate">Set User Password</h3>
                <p className="text-xs text-gray-500 truncate">{setPasswordModal.name} ({setPasswordModal.email})</p>
              </div>
            </div>

            {setPasswordSuccess && (
              <div className="p-3 mb-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                <span>{setPasswordSuccess}</span>
              </div>
            )}

            {setPasswordError && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{setPasswordError}</span>
              </div>
            )}

            <form onSubmit={handleSetUserPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={showTargetPwd ? 'text' : 'password'}
                    required
                    value={targetNewPassword}
                    onChange={(e) => setTargetNewPassword(e.target.value)}
                    placeholder="Enter new password (min. 8 chars)"
                    className="w-full h-11 px-3 pr-10 rounded-lg border border-gray-200 outline-none focus:border-blue-500 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTargetPwd(!showTargetPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showTargetPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showTargetConfirmPwd ? 'text' : 'password'}
                    required
                    value={targetConfirmPassword}
                    onChange={(e) => setTargetConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full h-11 px-3 pr-10 rounded-lg border border-gray-200 outline-none focus:border-blue-500 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTargetConfirmPwd(!showTargetConfirmPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showTargetConfirmPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-xs text-gray-500 space-y-1">
                <p className="font-semibold text-gray-600">Requirements:</p>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  <span className={targetNewPassword.length >= 8 ? 'text-green-600 font-medium' : ''}>• Min 8 chars</span>
                  <span className={/[A-Z]/.test(targetNewPassword) ? 'text-green-600 font-medium' : ''}>• Uppercase</span>
                  <span className={/[a-z]/.test(targetNewPassword) ? 'text-green-600 font-medium' : ''}>• Lowercase</span>
                  <span className={/\d/.test(targetNewPassword) ? 'text-green-600 font-medium' : ''}>• Number (0-9)</span>
                  <span className={/[^A-Za-z0-9]/.test(targetNewPassword) ? 'text-green-600 font-medium' : ''}>• Special char</span>
                  <span className={targetNewPassword && targetNewPassword === targetConfirmPassword ? 'text-green-600 font-medium' : ''}>• Passwords match</span>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setSetPasswordModal(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settingPassword}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center gap-2"
                >
                  <Key size={14} />
                  {settingPassword ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Change User Email Modal (Super Admin) */}
      {changeEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setChangeEmailModal(null)} />
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Mail className="w-5 h-5 text-purple-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold truncate">Change User Email</h3>
                <p className="text-xs text-gray-500 truncate">{changeEmailModal.name}</p>
              </div>
            </div>

            {changeEmailSuccess && (
              <div className="p-3 mb-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                <span>{changeEmailSuccess}</span>
              </div>
            )}

            {changeEmailError && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{changeEmailError}</span>
              </div>
            )}

            <form onSubmit={handleAdminChangeEmail} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Current Email</label>
                <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-sm font-mono text-gray-600">
                  {changeEmailModal.email}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">New Email Address *</label>
                <input
                  type="email"
                  required
                  value={targetNewEmail}
                  onChange={(e) => setTargetNewEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-purple-500 text-sm"
                />
              </div>

              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100 text-xs text-purple-700">
                <p className="font-semibold mb-1">Important Notice:</p>
                <p>An automated security notification will be dispatched to both the previous email and the new email address.</p>
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setChangeEmailModal(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changingEmail}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 text-sm flex items-center gap-2"
                >
                  <Mail size={14} />
                  {changingEmail ? 'Updating...' : 'Update Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Manage Permissions Modal (Super Admin only) */}
      {permissionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPermissionsModal(null)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Manage Admin Permissions</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure route privileges for {permissionsModal.name} ({permissionsModal.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPermissionsModal(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {permissionsError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{permissionsError}</span>
              </div>
            )}

            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              <span className="font-semibold">Notice:</span> Only permissions enforced on real backend routes are listed below. Unchecking a permission will deny access (HTTP 403) to that specific route.
            </div>

            <div className="space-y-2 mb-6 max-h-64 overflow-y-auto pr-1">
              {ENFORCED_ADMIN_PERMISSIONS.map((perm) => {
                const isChecked = selectedGrants.includes(perm.key);
                return (
                  <label
                    key={perm.key}
                    className="flex items-start p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedGrants([...selectedGrants, perm.key]);
                        } else {
                          setSelectedGrants(selectedGrants.filter((k) => k !== perm.key));
                        }
                      }}
                      className="mt-0.5 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <div className="ml-3">
                      <div className="text-xs font-semibold text-gray-800">{perm.label}</div>
                      <div className="text-[11px] text-gray-500">{perm.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={handleResetPermissions}
                disabled={savingPermissions || permissionsModal.customGrants === undefined}
                className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Reset to Default
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPermissionsModal(null)}
                  className="px-4 py-2 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  disabled={savingPermissions}
                  className="px-4 py-2 text-xs font-medium bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50"
                >
                  {savingPermissions ? 'Saving...' : 'Save Permissions'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ====================================================================
// CHAT
// ====================================================================
const isSafeActionUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    const isAllowed = isLocalhost || host.endsWith('.vercel.app') || (typeof window !== 'undefined' && host === window.location.hostname);
    return (parsed.protocol === 'https:' || (isLocalhost && parsed.protocol === 'http:')) && isAllowed;
  } catch {
    // URL parsing failed; consider untrusted
    return false;
  }
};

export const Chat = () => {
  const { user } = useAuth();
  const socket = useSocket();
  const [rooms, setRooms] = useState([]);
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef(null);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [addMemberModal, setAddMemberModal] = useState(false);
  const [deleteRoomModal, setDeleteRoomModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', memberIds: [] });
  const [memberSearch, setMemberSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [teams, setTeams] = useState([]);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('all');
  const [selectedTeamFilterAdd, setSelectedTeamFilterAdd] = useState('all');

  const canCreateRoom = ['T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'].includes(user.role);

  // Fetch eligible users based on role and map team affiliations
  const fetchEligibleUsers = async () => {
    try {
      // 1. Fetch teams
      let teamsList = [];
      try {
        const teamsEndpoint = ['ADMIN', 'SUPER_ADMIN'].includes(user.role) ? '/teams' : '/teams/me';
        const teamsRes = await api.get(teamsEndpoint);
        teamsList = teamsRes.data?.data || teamsRes.data || [];
        if (!Array.isArray(teamsList)) teamsList = [];
      } catch {
        try {
          const fallback = await api.get('/teams');
          teamsList = fallback.data?.data || fallback.data || [];
        } catch { /* ignore fallback teams endpoint error */ }
      }
      setTeams(teamsList);

      // 2. Fetch users based on role
      const userMap = new Map();

      if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
        const res = await api.get('/admin/users');
        const rawUsers = res.data?.data || [];
        rawUsers.forEach((u) => {
          if (u._id && u._id.toString() !== user._id.toString()) {
            userMap.set(u._id.toString(), { ...u, teamNames: [], teamIds: [] });
          }
        });
      } else if (user.role === 'T3_EXECUTIVE') {
        const [teamRes, eventRes] = await Promise.all([
          api.get('/teams/me/members').catch(() => ({ data: { data: [] } })),
          api.get('/teams/me/event-members').catch(() => ({ data: { data: [] } })),
        ]);

        [...(teamRes.data?.data || []), ...(eventRes.data?.data || [])].forEach((u) => {
          if (u._id && u._id.toString() !== user._id.toString()) {
            userMap.set(u._id.toString(), { ...u, teamNames: [], teamIds: [] });
          }
        });
      }

      // Map team memberships onto users and ensure every team member is captured
      teamsList.forEach((t) => {
        const tIdStr = (t._id || '').toString();
        if (Array.isArray(t.members)) {
          t.members.forEach((m) => {
            const mId = (m?._id || m || '').toString();
            if (!mId || mId === user._id.toString()) return;
            if (userMap.has(mId)) {
              const u = userMap.get(mId);
              if (!u.teamIds.includes(tIdStr)) {
                u.teamIds.push(tIdStr);
                u.teamNames.push(t.name);
              }
            } else if (typeof m === 'object' && m.name) {
              userMap.set(mId, {
                _id: mId,
                name: m.name,
                email: m.email || '',
                role: m.role || 'T1_VOLUNTEER',
                teamNames: [t.name],
                teamIds: [tIdStr],
              });
            }
          });
        }
        if (t.leadId) {
          const leadId = (t.leadId?._id || t.leadId || '').toString();
          if (leadId && leadId !== user._id.toString()) {
            if (userMap.has(leadId)) {
              const u = userMap.get(leadId);
              if (!u.teamIds.includes(tIdStr)) {
                u.teamIds.push(tIdStr);
                u.teamNames.push(t.name);
              }
            } else if (typeof t.leadId === 'object' && t.leadId.name) {
              userMap.set(leadId, {
                _id: leadId,
                name: t.leadId.name,
                email: t.leadId.email || '',
                role: t.leadId.role || 'T3_EXECUTIVE',
                teamNames: [t.name],
                teamIds: [tIdStr],
              });
            }
          }
        }
      });

      setEligibleUsers(Array.from(userMap.values()));
    } catch (err) {
      console.error('Failed to load eligible users:', err);
    }
  };

  // Fetch rooms + users on mount
  useEffect(() => {
    void (async () => {
      try {
        const roomsRes = await api.get('/chat/rooms');
        setRooms(roomsRes.data.data);
        if (roomsRes.data.data.length > 0) {
          setSelectedRoom(roomsRes.data.data[0]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingRooms(false);
      }
    })();

    if (canCreateRoom) void fetchEligibleUsers();
  }, [canCreateRoom]);

  // Auto-refresh eligible users every time modal opens
  useEffect(() => {
    if ((createModal || addMemberModal) && canCreateRoom) {
      void fetchEligibleUsers();
    }
  }, [createModal, addMemberModal]);

  // Auto-refresh eligible users every 30 seconds (background sync)
  useEffect(() => {
    if (!canCreateRoom) return;
    const interval = setInterval(fetchEligibleUsers, 30000);
    return () => clearInterval(interval);
  }, [canCreateRoom]);

  // Fetch messages when room changes + auto-polling fallback
  useEffect(() => {
    if (!selectedRoom) return;
    setLoadingMessages(true);
    let isMounted = true;

    const fetchRoomMessages = async (silent = false) => {
      try {
        const res = await api.get(`/chat/rooms/${selectedRoom._id}/messages`);
        if (!isMounted) return;
        const incoming = res.data?.data || [];
        setMessages((prev) => {
          if (silent && prev.length === incoming.length &&
              prev.at(-1)?._id === incoming.at(-1)?._id) {
            return prev;
          }
          return incoming;
        });
      } catch (err) {
        if (!silent) console.error(err);
      } finally {
        if (!silent && isMounted) setLoadingMessages(false);
      }
    };

    void fetchRoomMessages(false);

    // Reliable 3.5s background polling fallback for serverless environments
    const pollInterval = setInterval(() => {
      void fetchRoomMessages(true);
    }, 3500);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [selectedRoom]);

  // Real-time listener
  useEffect(() => {
    if (!socket || !selectedRoom) return;
    socket.emit('chat:join', selectedRoom._id);

    const handleNewMessage = (msg) => {
      if (!msg || msg.roomId !== selectedRoom._id) return;
      setMessages((prev) => {
        if (prev.some((m) => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
    };

    socket.on('chat:new_message', handleNewMessage);

    return () => {
      socket.emit('chat:leave', selectedRoom._id);
      socket.off('chat:new_message', handleNewMessage);
    };
  }, [socket, selectedRoom]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleMember = (userId) => {
    setForm((f) => ({
      ...f,
      memberIds: f.memberIds.includes(userId)
        ? f.memberIds.filter((id) => id !== userId)
        : [...f.memberIds, userId],
    }));
  };

  const createRoom = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/chat/rooms', form);
      setRooms([res.data.data, ...rooms]);
      setSelectedRoom(res.data.data);
      setCreateModal(false);
      setForm({ name: '', description: '', memberIds: [] });
      setMemberSearch('');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create room');
    } finally {
      setSaving(false);
    }
  };

  const addMemberToRoom = async (userId) => {
    try {
      const res = await api.post(`/chat/rooms/${selectedRoom._id}/members`, { userId });
      setRooms(rooms.map((r) => r._id === selectedRoom._id ? res.data.data : r));
      setSelectedRoom(res.data.data);
      setMemberSearch('');
      alert('Member added');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add member');
    }
  };

  const deleteRoom = async () => {
    if (!selectedRoom) return;
    try {
      await api.delete(`/chat/rooms/${selectedRoom._id}`);
      setRooms(rooms.filter((r) => r._id !== selectedRoom._id));
      setSelectedRoom(rooms.length > 1 ? rooms.find((r) => r._id !== selectedRoom._id) : null);
      setDeleteRoomModal(false);
      setMessages([]);
      alert('Room deleted');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete room');
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !selectedRoom) return;
    const text = message.trim();
    setMessage('');
    try {
      const res = await api.post(`/chat/rooms/${selectedRoom._id}/messages`, { text });
      const newMsg = res.data?.data || res.data;
      if (newMsg && (newMsg._id || newMsg.text)) {
        setMessages((prev) => {
          if (newMsg._id && prev.some((m) => m._id === newMsg._id)) return prev;
          return [...prev, newMsg];
        });
      }
    } catch (err) {
      console.error('Send message error:', err);
      alert('Failed to send');
      setMessage(text);
    }
  };

  // Filter eligible users with team filter support
  const filterUsers = (excludeIds = [], teamFilter = 'all') => {
    return eligibleUsers
      .filter((u) => !excludeIds.map(String).includes(u._id.toString()))
      .filter((u) => {
        if (!teamFilter || teamFilter === 'all') return true;
        return (u.teamIds || []).map(String).includes(teamFilter.toString());
      })
      .filter((u) =>
        (u.name || '').toLowerCase().includes(memberSearch.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(memberSearch.toLowerCase())
      );
  };

  const usersForCreate = filterUsers([user._id], selectedTeamFilter);

  const usersForAdd = selectedRoom
    ? filterUsers(
        [user._id, ...(selectedRoom.members || []).map((m) => m._id || m)],
        selectedTeamFilterAdd
      )
    : [];

  const getTeamMemberCount = (teamId) => {
    if (teamId === 'all') return eligibleUsers.length;
    return eligibleUsers.filter((u) => (u.teamIds || []).map(String).includes(teamId.toString())).length;
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4">
      {/* Sidebar */}
      <div className="w-72 bg-white rounded-xl border border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold">Chat Rooms</h3>
          {canCreateRoom && (
            <button onClick={() => setCreateModal(true)}
              className="w-8 h-8 rounded-lg bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600">
              <Plus size={16} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loadingRooms ? (
            <Skeleton className="h-16 mx-2" />
          ) : rooms.length === 0 ? (
            <div className="text-center py-8 px-4">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No chat rooms yet</p>
              {canCreateRoom && (
                <button onClick={() => setCreateModal(true)} className="mt-3 text-sm text-blue-500 hover:underline">
                  Create first room
                </button>
              )}
            </div>
          ) : rooms.map((r) => (
            <button
              key={r._id}
              onClick={() => setSelectedRoom(r)}
              className={`w-full text-left p-3 rounded-lg mb-1 transition ${selectedRoom?._id === r._id ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'}`}
            >
              <p className="font-medium text-sm truncate">{r.name}</p>
              <p className="text-xs text-gray-500 truncate">{r.memberCount} members</p>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col">
        {!selectedRoom ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Select a room to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="font-semibold truncate">{selectedRoom.name}</h3>
                <p className="text-xs text-gray-500">{selectedRoom.memberCount} members</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {canCreateRoom && (
                  <button onClick={() => setAddMemberModal(true)}
                    className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-1">
                    <UserPlus size={14} /> Add Member
                  </button>
                )}
                {canCreateRoom && (
                  <button onClick={() => setDeleteRoomModal(true)}
                    className="text-xs px-3 py-1.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-1">
                    <Trash2 size={14} /> Delete Room
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMessages ? (
                <Skeleton className="h-8 w-64" />
              ) : messages.length === 0 ? (
                <p className="text-center text-gray-400 text-sm mt-8">No messages yet. Say hello</p>
              ) : messages.map((m, idx) => {
                const own = (m.senderId?._id || m.senderId)?.toString() === (user._id || user.id || user.sub)?.toString();
                return (
                  <div key={m._id || m.createdAt || idx} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-md flex flex-col ${own ? 'items-end' : 'items-start'}`}>
                      {!own && (
                        <p className="text-xs font-medium text-gray-600 mb-1 ml-1">{m.senderName}</p>
                      )}
                      <div className={`px-4 py-2.5 rounded-2xl ${own ? 'bg-blue-600 text-white rounded-tr-sm shadow-sm' : 'bg-gray-100 text-gray-900 rounded-tl-sm border border-gray-200'}`}>
                        <p className="text-sm break-words whitespace-pre-line">{m.text}</p>
                        {m.qrCode && (
                          <div className="mt-2.5 p-3 bg-white text-slate-800 rounded-xl border border-gray-200 shadow-xs flex flex-col items-center">
                            <img src={m.qrCode} alt="Attendance QR Code" className="w-48 h-48 object-contain rounded-lg" />
                            <p className="text-[11px] text-gray-500 font-medium mt-1.5">Scan QR with camera</p>
                            {isSafeActionUrl(m.actionUrl) && (
                              <a
                                href={m.actionUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg text-center shadow-xs transition flex items-center justify-center gap-1.5 no-underline"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Mark Attendance</span>
                              </a>
                            )}
                          </div>
                        )}
                        {!m.qrCode && isSafeActionUrl(m.actionUrl) && (
                          <a
                            href={m.actionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition no-underline"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Mark Attendance</span>
                          </a>
                        )}
                      </div>
                      <p className="text-[10px] mt-0.5 text-gray-400 mx-1">
                        {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-gray-200 flex gap-2">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 h-10 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500"
              />
              <button onClick={sendMessage} className="px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                Send
              </button>
            </div>
          </>
        )}
      </div>

      {/* Create Room Modal */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCreateModal(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold">Create Chat Room</h3>
              <button onClick={() => setCreateModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={createRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Room Name *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Tech Team Announcements"
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Description (optional)</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What's this room for?"
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="text-sm font-semibold text-gray-800">Add Members</label>
                    <p className="text-xs text-gray-500">Filter team-wise or pick individual members</p>
                  </div>
                  <button type="button" onClick={fetchEligibleUsers} className="text-xs text-blue-600 hover:underline font-medium">
                    Refresh
                  </button>
                </div>

                {/* Team Selection Bar */}
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 mb-3 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                      <UsersRound size={14} className="text-blue-600" /> Filter by Team:
                    </span>
                    <select
                      value={selectedTeamFilter}
                      onChange={(e) => setSelectedTeamFilter(e.target.value)}
                      className="text-xs h-9 px-3 rounded-lg border border-gray-300 bg-white font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 sm:max-w-xs"
                    >
                      <option value="all">👥 All Available Members ({eligibleUsers.length})</option>
                      {teams.map((t) => (
                        <option key={t._id} value={t._id}>
                          🏢 {t.name} ({getTeamMemberCount(t._id)} members)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Team Filter Banner */}
                  {selectedTeamFilter !== 'all' && (
                    <div className="flex items-center justify-between bg-blue-50/70 border border-blue-200 rounded-lg px-3 py-2 text-xs">
                      <div className="min-w-0 pr-2">
                        <span className="font-semibold text-blue-900 truncate block">
                          Team: {teams.find((t) => t._id === selectedTeamFilter)?.name}
                        </span>
                        <span className="text-blue-700 text-[11px]">
                          Showing only members in this team ({usersForCreate.length})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {usersForCreate.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const visibleIds = usersForCreate.map((u) => u._id);
                              const allSelected = visibleIds.every((id) => form.memberIds.includes(id));
                              if (allSelected) {
                                setForm((f) => ({
                                  ...f,
                                  memberIds: f.memberIds.filter((id) => !visibleIds.includes(id)),
                                }));
                              } else {
                                setForm((f) => ({
                                  ...f,
                                  memberIds: Array.from(new Set([...f.memberIds, ...visibleIds])),
                                }));
                              }
                            }}
                            className="px-2.5 py-1 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 transition"
                          >
                            {usersForCreate.length > 0 && usersForCreate.every((u) => form.memberIds.includes(u._id))
                              ? 'Deselect Team'
                              : 'Select Entire Team'}
                          </button>
                        )}
                        {!form.name && (
                          <button
                            type="button"
                            onClick={() => {
                              const tName = teams.find((t) => t._id === selectedTeamFilter)?.name;
                              if (tName) setForm((f) => ({ ...f, name: `${tName} Chat` }));
                            }}
                            className="px-2 py-1 bg-white border border-blue-300 text-blue-700 rounded-md text-xs hover:bg-blue-50 transition"
                            title="Auto-fill room name"
                          >
                            Use as Room Name
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Search box */}
                  <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-300 px-3 py-2">
                    <Search size={15} className="text-gray-400" />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder={
                        selectedTeamFilter === 'all'
                          ? 'Search individual users by name or email...'
                          : `Search in this team...`
                      }
                      className="flex-1 bg-transparent border-none outline-none text-xs"
                    />
                    {memberSearch && (
                      <button type="button" onClick={() => setMemberSearch('')} className="text-gray-400 hover:text-gray-600">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Selected members chips */}
                {form.memberIds.length > 0 && (
                  <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-2.5 mb-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-blue-900">
                        Selected Members ({form.memberIds.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, memberIds: [] }))}
                        className="text-[11px] text-blue-600 hover:underline font-medium"
                      >
                        Clear all
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                      {form.memberIds.map((id) => {
                        const u = eligibleUsers.find((user) => user._id === id);
                        if (!u) return null;
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white text-blue-800 border border-blue-200 font-medium shadow-2xs"
                          >
                            <span className="max-w-[130px] truncate">{u.name}</span>
                            <button
                              type="button"
                              onClick={() => toggleMember(id)}
                              className="hover:text-red-500 rounded-full"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Members list */}
                <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white">
                  {usersForCreate.length === 0 ? (
                    <div className="p-6 text-center">
                      <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-700">No members found</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {eligibleUsers.length === 0
                          ? user.role === 'T3_EXECUTIVE'
                            ? 'No team members yet. Ask Admin to assign you to a team.'
                            : 'No users available'
                          : selectedTeamFilter !== 'all'
                          ? 'No other members found in this team'
                          : 'No users match your search'}
                      </p>
                    </div>
                  ) : (
                    usersForCreate.map((u) => {
                      const isChecked = form.memberIds.includes(u._id);
                      return (
                        <label
                          key={u._id}
                          className={`flex items-center gap-3 p-3 transition cursor-pointer ${
                            isChecked ? 'bg-blue-50/40' : 'hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleMember(u._id)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                          />
                          <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {u.name?.charAt(0) || 'U'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                              {u.teamNames && u.teamNames.length > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-normal truncate max-w-[120px]">
                                  {u.teamNames.join(', ')}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 truncate">{u.email}</p>
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                              u.role === 'T1_VOLUNTEER'
                                ? 'bg-green-100 text-green-700'
                                : u.role === 'T2_ASSOCIATE'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            {u.role ? u.role.replace('_', ' ') : 'Member'}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                {form.memberIds.length > 0 && (
                  <p className="text-xs text-blue-600 mt-1 font-medium">{form.memberIds.length} member(s) selected</p>
                )}
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setCreateModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 text-sm shadow-sm">
                  {saving ? 'Creating...' : 'Create Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {addMemberModal && selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAddMemberModal(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold">Add Member</h3>
                <p className="text-sm text-gray-500">to {selectedRoom.name}</p>
              </div>
              <button onClick={() => setAddMemberModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {/* Filter by Team */}
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 mb-3 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                  <UsersRound size={14} className="text-blue-600" /> Filter by Team:
                </span>
                <select
                  value={selectedTeamFilterAdd}
                  onChange={(e) => setSelectedTeamFilterAdd(e.target.value)}
                  className="text-xs h-9 px-3 rounded-lg border border-gray-300 bg-white font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 sm:max-w-xs"
                >
                  <option value="all">👥 All Available Members</option>
                  {teams.map((t) => (
                    <option key={t._id} value={t._id}>
                      🏢 {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-300 px-3 py-1.5">
                <Search size={15} className="text-gray-400" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder={
                    selectedTeamFilterAdd === 'all'
                      ? 'Search individual users by name or email...'
                      : `Search in this team...`
                  }
                  className="flex-1 bg-transparent border-none outline-none text-xs"
                />
                {memberSearch && (
                  <button type="button" onClick={() => setMemberSearch('')} className="text-gray-400 hover:text-gray-600">
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {usersForAdd.length === 0 ? (
                <div className="p-6 text-center">
                  <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-700">No members available</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {eligibleUsers.length === 0
                      ? 'No team members available'
                      : selectedTeamFilterAdd !== 'all'
                      ? 'All members of this team are already in the room'
                      : 'All available members already in this room'}
                  </p>
                </div>
              ) : (
                usersForAdd.map((u) => (
                  <div key={u._id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {u.name?.charAt(0) || 'U'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{u.name}</p>
                          {u.teamNames && u.teamNames.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded truncate max-w-[120px]">
                              {u.teamNames.join(', ')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{u.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => addMemberToRoom(u._id)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 flex-shrink-0 ml-2 shadow-2xs"
                    >
                      Add
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs text-gray-500">Current: {selectedRoom.memberCount} members</span>
              <button onClick={() => setAddMemberModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Room Confirmation */}
      {deleteRoomModal && selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteRoomModal(false)} />
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Delete Chat Room</h3>
                <p className="text-xs text-gray-500 truncate">{selectedRoom.name}</p>
              </div>
            </div>

            <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
              <p className="text-sm text-red-800 font-medium mb-1">This will permanently delete:</p>
              <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                <li>The chat room and all members</li>
                <li>All messages in this room</li>
                <li>This action cannot be undone</li>
              </ul>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteRoomModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg">
                Cancel
              </button>
              <button onClick={deleteRoom} className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 flex items-center gap-2">
                <Trash2 size={14} /> Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ====================================================================
// QR CHECK-IN — T1/T2 self check-in/check-out
// ====================================================================
export const QRCheckIn = () => {
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [todayRecord, setTodayRecord] = useState(null);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [qrCode, setQrCode] = useState('');

  const loadData = async () => {
    try {
      const teamRes = await api.get('/teams/me');
      const teamList = teamRes.data.data;
      setTeams(teamList);
      if (teamList.length > 0 && !selectedTeamId) {
        setSelectedTeamId(teamList[0]._id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTeamData = async () => {
    if (!selectedTeamId) return;
    try {
      const [todayRes, statsRes, histRes] = await Promise.all([
        api.get(`/attendance/today?teamId=${selectedTeamId}`),
        api.get('/attendance/my-stats?days=30'),
        api.get('/attendance/me?days=14'),
      ]);
      setTodayRecord(todayRes.data.data);
      setStats(statsRes.data.data);
      setHistory(histRes.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { void loadData(); }, []);
  useEffect(() => { void loadTeamData(); }, [selectedTeamId]);

  const handleCheckIn = async () => {
    if (!selectedTeamId) return alert('Select a team first');
    setProcessing(true);
    try {
      const res = await api.post('/attendance/check-in', { teamId: selectedTeamId });
      setTodayRecord(res.data.data);
      await loadTeamData();
      alert(`Checked in at ${new Date(res.data.data.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleCheckOut = async () => {
    if (!selectedTeamId) return;
    setProcessing(true);
    try {
      const res = await api.post('/attendance/check-out', { teamId: selectedTeamId });
      setTodayRecord(res.data.data);
      await loadTeamData();
      alert(`Checked out. Duration: ${res.data.data.durationMinutes} min`);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <SkeletonCardGrid count={2} />;

  if (teams.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <UsersRound className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">No teams yet</h2>
          <p className="text-sm text-gray-500">You need to be added to a team before you can check in.</p>
        </div>
      </div>
    );
  }

  const hasCheckedIn = !!todayRecord?.checkInTime;
  const hasCheckedOut = !!todayRecord?.checkOutTime;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Attendance</h1>
        <p className="text-gray-500">Check in for your shift and track your attendance</p>
      </div>

      {/* Team Selector */}
      {teams.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="block text-xs font-medium text-gray-500 uppercase mb-1.5">Select Team</label>
          <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)} className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500">
            {teams.map((t) => (<option key={t._id} value={t._id}>{t.name}{t.eventTitle ? ` — ${t.eventTitle}` : ''}</option>))}
          </select>
        </div>
      )}

      {/* Personal Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500">My Attendance Rate</p>
            <p className="text-3xl font-bold mt-1 text-blue-600">{stats.percentage}%</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500">Present Days</p>
            <p className="text-3xl font-bold mt-1 text-green-600">{stats.present}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500">Late Days</p>
            <p className="text-3xl font-bold mt-1 text-amber-600">{stats.late}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500">Total Hours</p>
            <p className="text-3xl font-bold mt-1 text-purple-600">{stats.totalHours}h</p>
          </div>
        </div>
      )}

      {/* Today's Status */}
      <div className="bg-white rounded-xl border-l-4 border-l-green-500 border border-gray-200 p-6">
        <p className="text-sm font-semibold text-green-600 mb-3">TODAY'S STATUS</p>
        {!hasCheckedIn ? (
          <>
            <h3 className="text-xl font-bold mb-3">Ready to check in?</h3>
            <p className="text-sm text-gray-600 mb-5">Enter your team code or click check-in below.</p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Team Code (optional)</label>
              <input value={qrCode} onChange={(e) => setQrCode(e.target.value.toUpperCase())}
                placeholder="e.g. TBI-ABC123"
                className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500 font-mono text-center tracking-wider" />
            </div>
            <button onClick={handleCheckIn} disabled={processing}
              className="px-6 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 disabled:opacity-50 flex items-center gap-2">
              <CheckCircle size={18} /> {processing ? 'Checking in...' : 'Check In Now'}
            </button>
          </>
        ) : hasCheckedOut ? (
          <>
            <h3 className="text-xl font-bold mb-2 text-green-600">Shift Complete</h3>
            <p className="text-sm text-gray-600">
              You worked {todayRecord.durationMinutes} minutes today.
            </p>
            <p className="text-xs text-gray-400 mt-2">
              In: {new Date(todayRecord.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {' '} / Out: {new Date(todayRecord.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </>
        ) : (
          <>
            <h3 className="text-xl font-bold mb-2 text-green-600">Checked In</h3>
            <p className="text-sm text-gray-600 mb-5">
              at {new Date(todayRecord.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            <button onClick={handleCheckOut} disabled={processing}
              className="px-6 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50 flex items-center gap-2">
              <LogOut size={18} /> {processing ? 'Processing...' : 'Check Out'}
            </button>
          </>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold">Recent Attendance (Last 14 Days)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[560px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Team</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Check In</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Check Out</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Duration</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((h) => (
                <tr key={h._id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm">{h.date}</td>
                  <td className="px-6 py-3 text-sm text-gray-600">{h.teamName}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{h.checkInTime ? new Date(h.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{h.checkOutTime ? new Date(h.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{h.durationMinutes ? `${h.durationMinutes}m` : '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${h.status === 'present' ? 'bg-green-100 text-green-700' :
                        h.status === 'late' ? 'bg-amber-100 text-amber-700' :
                          h.status === 'absent' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                      }`}>{h.status.replace('_', ' ')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
};


// ====================================================================
// EVENTS — With Event Head assignment
// ====================================================================
export const EventsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const canApply = user.role === 'T1_VOLUNTEER' || user.role === 'T2_ASSOCIATE';

  const [events, setEvents] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', date: '', location: '', description: '', headId: '' });
  const [saving, setSaving] = useState(false);
  const [applyModal, setApplyModal] = useState(null);  // event obj
  const [teams, setTeams] = useState([]);
  const [applyForm, setApplyForm] = useState({ teamId: '', role: 'Team Member', notes: '' });
  const [applying, setApplying] = useState(false);
  const [users, setUsers] = useState([]);

  const fetchData = async () => {
    try {
      const promises = [api.get('/events')];
      if (canCreate) promises.push(api.get('/admin/users'));
      if (canApply) promises.push(api.get('/applications/me'));

      const results = await Promise.all(promises);
      setEvents(results[0].data.data);
      if (canCreate) setUsers(results[1].data.data);
      if (canApply) setMyApplications(results[1].data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchData(); }, []);

  // Open apply modal → fetch teams for this event
  const openApplyModal = async (ev) => {
    try {
      const teamsRes = await api.get('/teams');
      const eventTeams = teamsRes.data.data.filter((t) => t.eventId === ev._id || t.eventTitle === ev.title);
      setTeams(eventTeams);
      setApplyForm({ teamId: eventTeams[0]?._id || '', role: 'Team Member', notes: '' });
      setApplyModal(ev);
    } catch (err) {
      console.error('Failed to load teams:', err);
      alert('Failed to load teams');
    }
  };

  // Submit application
  const handleApply = async (e) => {
    e.preventDefault();
    if (!applyForm.teamId) return alert('Please select a team');
    setApplying(true);
    try {
      await api.post('/applications', applyForm);
      setApplyModal(null);
      await fetchData();
      alert('Application submitted. Wait for the team lead to review.');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to apply');
    } finally {
      setApplying(false);
    }
  };

  const addEvent = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        date: form.date,
        location: form.location,
        description: form.description,
      };
      if (form.headId) payload.headId = form.headId;
      const res = await api.post('/events', payload);
      setEvents([res.data.data, ...events]);
      setModal(false);
      setForm({ title: '', date: '', location: '', description: '', headId: '' });
      alert('Event created successfully');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create event');
    } finally {
      setSaving(false);
    }
  };

  const hasApplied = (ev) => myApplications.some((a) => a.eventId === ev._id || a.eventTitle === ev.title);

  if (loading) return <SkeletonCardGrid count={3} />;

  const statusColor = {
    published: 'bg-green-100 text-green-700',
    draft: 'bg-gray-100 text-gray-700',
    closed: 'bg-red-100 text-red-700',
  };

  const eligibleHeads = users.filter((u) =>
    ['T3_EXECUTIVE', 'ADMIN'].includes(u.role) && u._id !== user._id
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-gray-500">
            {canCreate ? 'Create and manage events' : 'Browse and apply to events'}
          </p>
        </div>
        {canCreate && (
          <button onClick={() => setModal(true)} className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600">
            + Create Event
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No events yet</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((ev) => {
            const applied = canApply && hasApplied(ev);
            return (
              <div key={ev._id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-lg">{ev.title}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[ev.status]}`}>{ev.status}</span>
                </div>

                <p className="text-sm text-gray-500 flex items-center gap-1 mb-1"><Calendar size={14} /> {ev.date}</p>
                <p className="text-sm text-gray-500 flex items-center gap-1 mb-3"><MapPin size={14} /> {ev.location}</p>

                {ev.headName && (
                  <div className="flex items-center gap-2 mb-3 p-2 bg-purple-50 rounded-lg">
                    <div className="w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
                      {ev.headName.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] text-purple-600 font-semibold uppercase">Event Head</p>
                      <p className="text-xs text-purple-800 font-medium truncate">{ev.headName}</p>
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-gray-100">
                  {canCreate ? (
                    <button onClick={() => navigate(`/admin/events/${ev._id}`)} className="w-full px-3 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600">
                      View Details
                    </button>
                  ) : applied ? (
                    <div className="text-center py-2">
                      <span className="text-xs text-green-600 font-medium flex items-center justify-center gap-1">
                        <CheckCircle size={14} /> Already Applied
                      </span>
                    </div>
                  ) : (
                    <button onClick={() => openApplyModal(ev)} className="w-full px-3 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600">
                      Apply Now
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Apply Modal */}
      {applyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setApplyModal(null)} />
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <h3 className="text-lg font-semibold mb-1">Apply to Event</h3>
            <p className="text-sm text-gray-500 mb-5">{applyModal.title}</p>

            <form onSubmit={handleApply} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Select Team</label>
                {teams.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg">
                    No teams available for this event yet.
                  </p>
                ) : (
                  <select required value={applyForm.teamId} onChange={(e) => setApplyForm({ ...applyForm, teamId: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500">
                    <option value="">Select a team...</option>
                    {teams.map((t) => (<option key={t._id} value={t._id}>{t.name} — Lead: {t.leadName || 'TBD'}</option>))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Preferred Role</label>
                <input value={applyForm.role} onChange={(e) => setApplyForm({ ...applyForm, role: e.target.value })}
                  placeholder="e.g. Coordinator, Volunteer"
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Notes (optional)</label>
                <textarea rows={3} value={applyForm.notes} onChange={(e) => setApplyForm({ ...applyForm, notes: e.target.value })}
                  placeholder="Why do you want to join?"
                  className="w-full p-3 rounded-lg border border-gray-200 outline-none resize-none focus:border-blue-500" />
              </div>

              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setApplyModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg">Cancel</button>
                <button type="submit" disabled={applying || teams.length === 0}
                  className="px-5 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50">
                  {applying ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Event Modal */}
      {modal && canCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModal(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold">Create Event</h3>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={addEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Event Title *</label>
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Hackathon 2026"
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Date *</label>
                  <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Location *</label>
                  <input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Main Hall"
                    className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Event Head *</label>
                <select required value={form.headId} onChange={(e) => setForm({ ...form, headId: e.target.value })}
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500">
                  <option value="">Select an event head...</option>
                  {eligibleHeads.map((u) => (<option key={u._id} value={u._id}>{u.name} — {u.role.replace('_', ' ')}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Description</label>
                <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full p-3 rounded-lg border border-gray-200 outline-none resize-none focus:border-blue-500" />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ====================================================================
// MY REVIEWS
// ====================================================================
export const MyReviewsPage = () => {
  const reviews = [
    { _id: '1', event: 'Hackathon 2026', rating: 5, feedback: 'Excellent organization. Learned a lot from the mentors.', date: 'Oct 17, 2026' },
    { _id: '2', event: 'Startup Pitch Day', rating: 4, feedback: 'Great event. Would love more networking time.', date: 'Nov 5, 2026' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Reviews</h1>
        <p className="text-gray-500">Feedback you've submitted for events</p>
      </div>
      {reviews.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Star className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No reviews yet</h3>
          <p className="text-gray-500">Attend an event and share your feedback</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r._id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold">{r.event}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Submitted {r.date}</p>
                </div>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={16} className={i < r.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} />
                  ))}
                </div>
              </div>
              <p className="text-sm text-gray-600">{r.feedback}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


// ====================================================================
// APPROVAL REQUEST MODALS & COMPONENTS
// ====================================================================
export const RaiseApprovalModal = ({ isOpen, onClose, onSuccess, initialTeams = [] }) => {
  const [teams, setTeams] = useState(initialTeams);
  const [requestType, setRequestType] = useState('leave'); // 'leave' | 'half_day'
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [teamId, setTeamId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setReason('');
    setRequestType('leave');
    setTargetDate(new Date().toISOString().split('T')[0]);

    void (async () => {
      try {
        const res = await api.get('/teams/my-teams');
        const list = res.data?.data || res.data || [];
        setTeams(list);
        if (list.length > 0) {
          setTeamId((prev) => prev || list[0]._id);
        }
      } catch (err) {
        console.error('Failed to load teams:', err);
      }
    })();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/applications', {
        requestType,
        targetDate,
        teamId: teamId || (teams[0]?._id),
        reason: reason.trim(), // Optional!
      });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      const raw = err.response?.data?.message || err.message || '';
      if (/already have|duplicate|already applied/i.test(raw)) {
        setError(raw);
      } else if (/team.*required/i.test(raw)) {
        setError('Please select a team before submitting.');
      } else if (/date.*required/i.test(raw)) {
        setError('Please choose a valid date for your request.');
      } else {
        setError('Unable to submit your request at this time. Please try again shortly.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 z-10">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Raise Approval Request</h2>
            <p className="text-xs text-gray-500 mt-0.5">Submit a leave or half-day request to your team lead</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Request Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRequestType('leave')}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition ${
                  requestType === 'leave'
                    ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm ring-2 ring-purple-200'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>Full Day Leave</span>
              </button>
              <button
                type="button"
                onClick={() => setRequestType('half_day')}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition ${
                  requestType === 'half_day'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm ring-2 ring-blue-200'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Half Day</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
              Requested Date
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {teams.length > 0 && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Team & Lead
              </label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                {teams.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name} (Lead: {t.leadName || t.leadId?.name || 'T3 Team Lead'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Reason
              </label>
              <span className="text-xs text-gray-400 font-normal">Optional (not mandatory)</span>
            </div>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Personal work, urgent emergency, medical checkup (optional)..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const DenyApprovalModal = ({ isOpen, onClose, onConfirm, app }) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setReason('');
    setError('');
  }, [isOpen]);

  if (!isOpen || !app) return null;

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason for denying this request');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(app._id, reason.trim());
      onClose();
    } catch (err) {
      const raw = err.response?.data?.message || err.message || '';
      if (/not authorized/i.test(raw)) {
        setError('You are not authorized to review this request.');
      } else {
        setError('Unable to process request denial. Please try again shortly.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 z-10">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <h2 className="text-lg font-bold text-gray-900">Deny Approval Request</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mt-3">
          Denying <strong>{app.studentName}</strong>'s {app.requestType === 'half_day' ? 'Half Day' : 'Leave'} request for <strong>{app.targetDate || 'the requested date'}</strong>.
        </p>

        {error && (
          <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleConfirm} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
              Reason for Denial <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please explain why this request is denied (e.g., event rehearsal, urgent shift coverage)..."
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm transition disabled:opacity-50"
            >
              {submitting ? 'Denying...' : 'Confirm Denial'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const renderApplicationTypeBadge = (type) => {
  if (type === 'half_day') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
        <Clock className="w-3 h-3" /> Half Day
      </span>
    );
  }
  if (type === 'leave') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
        <Calendar className="w-3 h-3" /> Full Day Leave
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-gray-50 text-gray-700 border border-gray-200">
      <FileText className="w-3 h-3" /> Application
    </span>
  );
};

// ====================================================================
// APPROVAL REQUESTS — T3 & Admin Management View
// ====================================================================
export const ApplicationsPage = () => {
  const { user } = useAuth();
  const [apps, setApps] = useState([]);
  const [myApps, setMyApps] = useState([]);
  const [teams, setTeams] = useState([]);
  const [activeTab, setActiveTab] = useState('team'); // 'team' | 'my'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'rejected'
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'leave' | 'half_day'
  const [loading, setLoading] = useState(true);
  const [showRaiseModal, setShowRaiseModal] = useState(false);
  const [denyingApp, setDenyingApp] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [teamRes, myRes, teamsRes] = await Promise.all([
        api.get('/applications'),
        api.get('/applications/me'),
        api.get('/teams/my-teams').catch(() => ({ data: { data: [] } })),
      ]);
      setApps(teamRes.data?.data || []);
      setMyApps(myRes.data?.data || []);
      setTeams(teamsRes.data?.data || teamsRes.data || []);
    } catch (err) {
      console.error('Error fetching approval requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const updateStatus = async (id, status, rejectionReason = '') => {
    try {
      await api.patch(`/applications/${id}/status`, { status, rejectionReason });
      setApps((prev) =>
        prev.map((a) =>
          a._id === id
            ? { ...a, status, rejectionReason, reviewedByName: user?.name || 'Team Lead' }
            : a
        )
      );
      setActionSuccess(
        status === 'approved'
          ? 'Request approved! Attendance record updated and notification sent.'
          : 'Request denied with reason. Employee has been notified.'
      );
      window.dispatchEvent(new CustomEvent('app:badge-refresh'));
      setTimeout(() => setActionSuccess(''), 4500);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update request status');
    }
  };

  const handleDownloadSheet = async () => {
    const targetTeamId = teams[0]?._id;
    if (!targetTeamId) {
      alert('No team found for attendance download.');
      return;
    }
    setDownloading(true);
    try {
      const res = await api.get(`/attendance/download?teamId=${targetTeamId}`);
      const { csv, filename } = res.data.data;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `attendance_sheet_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to download attendance sheet');
    } finally {
      setDownloading(false);
    }
  };

  const currentList = activeTab === 'team' ? apps : myApps;
  const filteredApps = currentList.filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (typeFilter !== 'all' && a.requestType !== typeFilter) return false;
    return true;
  });

  const pendingCount = currentList.filter((a) => a.status === 'pending').length;
  const approvedCount = currentList.filter((a) => a.status === 'approved').length;
  const deniedCount = currentList.filter((a) => a.status === 'rejected' || a.status === 'denied').length;

  const statusBadge = (status) => {
    if (status === 'approved') {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">Approved</span>;
    }
    if (status === 'rejected' || status === 'denied') {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">Denied</span>;
    }
    if (status === 'waitlisted') {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Waitlist</span>;
    }
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Pending</span>;
  };

  const typeBadge = renderApplicationTypeBadge;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <SkeletonTable rows={4} cols={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Requests</h1>
          <p className="text-gray-500 text-sm mt-0.5">Review and approve team leave and half-day requests</p>
        </div>
        <div className="flex items-center gap-3">
          {teams.length > 0 && (
            <button
              onClick={handleDownloadSheet}
              disabled={downloading}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-gray-500" />
              <span>{downloading ? 'Exporting...' : 'Download Attendance Sheet'}</span>
            </button>
          )}
          <button
            onClick={() => setShowRaiseModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Raise Request</span>
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess('')} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-1">
        <button
          onClick={() => setActiveTab('team')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
            activeTab === 'team'
              ? 'bg-blue-50 text-blue-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          Team Requests ({apps.length})
        </button>
        <button
          onClick={() => setActiveTab('my')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
            activeTab === 'my'
              ? 'bg-blue-50 text-blue-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          My Raised Requests ({myApps.length})
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Total Requests</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">{currentList.length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-amber-600">Pending Review</p>
          <p className="text-2xl font-bold mt-1 text-amber-600">{pendingCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-green-600">Approved</p>
          <p className="text-2xl font-bold mt-1 text-green-600">{approvedCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-red-600">Denied</p>
          <p className="text-2xl font-bold mt-1 text-red-600">{deniedCount}</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-1">
          {[
            { id: 'all', label: 'All Status' },
            { id: 'pending', label: 'Pending' },
            { id: 'approved', label: 'Approved' },
            { id: 'rejected', label: 'Denied' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setStatusFilter(pill.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === pill.id
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {[
            { id: 'all', label: 'All Types' },
            { id: 'leave', label: 'Leave' },
            { id: 'half_day', label: 'Half Day' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setTypeFilter(pill.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                typeFilter === pill.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Requests List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm divide-y divide-gray-100">
        {filteredApps.length === 0 ? (
          <div className="p-12 text-center">
            <FileCheck className="w-14 h-14 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-800">No approval requests yet</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              {activeTab === 'team'
                ? 'When team members submit leave or half-day requests, they will appear here for your review and attendance marking.'
                : 'You have not submitted any leave or half-day requests. Click "Raise Request" to submit one.'}
            </p>
          </div>
        ) : (
          filteredApps.map((a) => (
            <div key={a._id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-gray-50/75 transition">
              {/* Member & Request Info */}
              <div className="flex items-start gap-4 flex-1">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold shadow-sm flex-shrink-0">
                  {a.studentName?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">{a.studentName}</span>
                    {typeBadge(a.requestType)}
                    {statusBadge(a.status)}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {a.studentEmail} • <span className="font-medium text-gray-700">{a.teamName || 'Team'}</span>
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                    <span className="font-medium text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                      📅 For Date: {a.targetDate || 'Today'}
                    </span>
                    <span className="text-gray-400">
                      Submitted: {new Date(a.appliedAt || Date.now()).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Reason (optional) */}
                  <div className="mt-2 text-xs">
                    {a.reason ? (
                      <p className="text-gray-700 bg-gray-50 border border-gray-200/80 px-3 py-1.5 rounded-lg inline-block">
                        <span className="font-medium text-gray-500">Reason:</span> "{a.reason}"
                      </p>
                    ) : (
                      <span className="text-gray-400 italic">No reason provided (optional)</span>
                    )}
                  </div>

                  {/* Review result feedback */}
                  {a.status === 'approved' && (
                    <div className="mt-2 text-xs text-emerald-700 flex items-center gap-1.5 font-medium">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Approved by {a.reviewedByName || 'Team Lead'} • Automatically marked in attendance</span>
                    </div>
                  )}

                  {(a.status === 'rejected' || a.status === 'denied') && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                      <span className="font-semibold">Reason for Denial:</span> {a.rejectionReason || 'No reason specified'}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions for Pending Requests */}
              {activeTab === 'team' && a.status === 'pending' && (
                <div className="flex items-center gap-2 self-end md:self-center">
                  <button
                    onClick={() => updateStatus(a._id, 'approved')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 shadow-sm transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() => setDenyingApp(a)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 border border-red-300 text-red-600 rounded-xl text-xs font-semibold hover:bg-red-50 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Deny</span>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Raise Request Modal */}
      <RaiseApprovalModal
        isOpen={showRaiseModal}
        onClose={() => setShowRaiseModal(false)}
        onSuccess={() => {
          void fetchData();
          setActionSuccess('Your approval request has been submitted to your team lead!');
          setTimeout(() => setActionSuccess(''), 4500);
        }}
        initialTeams={teams}
      />

      {/* Deny Request Modal */}
      <DenyApprovalModal
        isOpen={!!denyingApp}
        app={denyingApp}
        onClose={() => setDenyingApp(null)}
        onConfirm={(id, reason) => updateStatus(id, 'rejected', reason)}
      />
    </div>
  );
};

// ====================================================================
// ATTENDANCE — T3 view: Generate QR, mark manually, view stats
// ====================================================================
export const AttendancePage = () => {

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('t3_link'); // 't3_link' or 'roster'

  // --- T3 Link & QR Generator State ---
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [countdownMs, setCountdownMs] = useState(null);
  const [copied, setCopied] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [genError, setGenError] = useState('');

  // --- Share to Team Chat State ---
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareTeamId, setShareTeamId] = useState('');
  const [shareCustomNote, setShareCustomNote] = useState('');
  const [sharingToChat, setSharingToChat] = useState(false);
  const [shareSuccess, setShareSuccess] = useState('');
  const [shareError, setShareError] = useState('');

  // --- T3 Today Attendance Panel State ---
  const [panelData, setPanelData] = useState(null);
  const [loadingPanel, setLoadingPanel] = useState(true);


  // --- Team Roster State ---
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [roster, setRoster] = useState([]);
  const [teamInfo, setTeamInfo] = useState(null);
  const [stats, setStats] = useState(null);


  const [saving, setSaving] = useState(false);
  const [manualModal, setManualModal] = useState(null);
  const [manualForm, setManualForm] = useState({ status: 'present', notes: '' });
  const [downloading, setDownloading] = useState(false);

  // Fetch T3 Today Panel Data
  const fetchPanelData = async () => {
    try {
      const res = await api.get('/attendance/t3/panel');
      setPanelData(res.data.data);
      setPanelError('');
    } catch (err) {
      console.warn('Failed to fetch T3 panel:', err.message);
      setPanelError(err.response?.data?.message || err.message);
    } finally {
      setLoadingPanel(false);
    }
  };

  // Poll panel data every 12 seconds
  useEffect(() => {
    void fetchPanelData();
    const interval = setInterval(fetchPanelData, 12000);
    return () => clearInterval(interval);
  }, []);

  // Live countdown timer for active generated link
  useEffect(() => {
    if (!generatedLink?.expiresAt || !generatedLink.active) {
      setCountdownMs(null);
      return;
    }

    const tick = () => {
      const left = Math.max(0, new Date(generatedLink.expiresAt).getTime() - Date.now());
      setCountdownMs(left);
      if (left === 0) {
        setGeneratedLink((prev) => prev ? { ...prev, active: false } : null);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [generatedLink?.expiresAt, generatedLink?.active]);

  // Handle generating new link & QR
  const handleGenerateLink = async (e) => {
    e?.preventDefault();
    setGenerating(true);
    setGenError('');
    try {
      const res = await api.post('/attendance/link/generate', { minutes: durationMinutes });
      setGeneratedLink(res.data.data);
      setCopied(false);
      // Refresh panel in case stats changed
      void fetchPanelData();
    } catch (err) {
      setGenError(err.response?.data?.message || err.message || 'Failed to generate link');
    } finally {
      setGenerating(false);
    }
  };

  // Handle manual deactivation
  const handleDeactivate = async () => {
    if (!generatedLink?.token || deactivating) return;
    setDeactivating(true);
    try {
      await api.post(`/attendance/link/${generatedLink.token}/deactivate`, {});
      setGeneratedLink((prev) => prev ? { ...prev, active: false } : null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to deactivate link');
    } finally {
      setDeactivating(false);
    }
  };

  // Handle sharing active link & QR code to team chat
  const handleShareToTeamChat = async (e) => {
    e?.preventDefault();
    if (!generatedLink?.token) return;
    const targetTeam = shareTeamId || selectedTeamId || (teams[0]?._id);
    if (!targetTeam) {
      setShareError('Please select a target team chat');
      return;
    }
    setSharingToChat(true);
    setShareError('');
    setShareSuccess('');
    try {
      const res = await api.post(`/attendance/link/${generatedLink.token}/share-chat`, {
        teamId: targetTeam,
        customNote: shareCustomNote,
      });
      setShareSuccess(res.data.message || 'Shared to team chat successfully!');
    } catch (err) {
      setShareError(err.response?.data?.message || err.message || 'Failed to share to team chat');
    } finally {
      setSharingToChat(false);
    }
  };

  // Copy link helper
  const handleCopyLink = () => {
    if (!generatedLink?.url) return;
    void navigator.clipboard.writeText(generatedLink.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const formatCountdown = (ms) => {
    if (ms == null) return '00:00';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Load T3's teams for roster view
  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get('/teams/me');
        const list = res.data.data || [];
        setTeams(list);
        if (list.length > 0) setSelectedTeamId(list[0]._id);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingRoster(false);
      }
    })();
  }, []);

  // Load team data when team or date changes
  const loadTeamData = async () => {
    if (!selectedTeamId) return;
    try {
      const [attRes, statsRes] = await Promise.all([
        api.get(`/attendance/team?teamId=${selectedTeamId}&date=${selectedDate}`),
        api.get(`/attendance/team/stats?teamId=${selectedTeamId}&date=${selectedDate}`),

      ]);
      setRoster(attRes.data.data.roster || []);
      setTeamInfo(attRes.data.data.team || null);
      setStats(statsRes.data.data || null);

    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === 'roster') {
      void loadTeamData();
    }
  }, [selectedTeamId, selectedDate, activeTab]);

  // Manual mark
  const submitManual = async (e) => {
    e.preventDefault();
    if (!manualModal) return;
    setSaving(true);
    try {
      await api.post('/attendance/mark', {
        studentId: manualModal.studentId,
        teamId: selectedTeamId,
        date: selectedDate,
        status: manualForm.status,
        notes: manualForm.notes,
      });
      setManualModal(null);
      setManualForm({ status: 'present', notes: '' });
      await loadTeamData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to mark');
    } finally {
      setSaving(false);
    }
  };

  // Download CSV
  const downloadCSV = async () => {
    setDownloading(true);
    try {
      const res = await api.get(`/attendance/download?teamId=${selectedTeamId}`);
      const { csv, filename } = res.data.data;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to download');
    } finally {
      setDownloading(false);
    }
  };

  const statusColor = {
    present: 'bg-green-100 text-green-700',
    late: 'bg-amber-100 text-amber-700',
    absent: 'bg-red-100 text-red-700',
    on_leave: 'bg-purple-100 text-purple-700',
    half_day: 'bg-blue-100 text-blue-700',
    not_marked: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="space-y-6">
      {/* Header with Navigation Tabs */}
      <div className="flex flex-wrap justify-between items-center gap-4 border-b border-gray-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
            <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 border border-indigo-200">
              T3 Executive
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Time-limited link and QR code attendance manager</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('t3_link')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === 't3_link'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Time-Limited Link & QR</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('roster')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === 'roster'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <UsersRound className="w-4 h-4" />
            <span>Team Roster & Records</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: TIME-LIMITED ATTENDANCE LINK & QR + LIVE T3 PANEL (TODAY) */}
      {/* ========================================================================= */}
      {activeTab === 't3_link' && (
        <div className="space-y-6">
          {/* Top Grid: Generator Card + Live Status Card */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Generator Form */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-gray-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                      <Timer className="w-4 h-4" />
                    </div>
                    <h2 className="text-base font-bold text-slate-800">Generate Session QR</h2>
                  </div>
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                    Max 120m
                  </span>
                </div>

                <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                  Creates a secure time-bounded URL and QR code. Valid only during the active window. Attendees must log in to submit attendance.
                </p>

                {genError && (
                  <div className="p-3 mb-4 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{genError}</span>
                  </div>
                )}

                <form onSubmit={handleGenerateLink} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1.5">
                      Valid Duration (Minutes)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(Math.max(1, Math.min(120, Number.parseInt(e.target.value, 10) || 1)))}
                        className="w-full h-11 px-3.5 rounded-xl border border-gray-300 outline-none focus:border-indigo-500 font-semibold text-slate-800"
                      />
                      <div className="flex gap-1">
                        {[5, 10, 15, 30].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setDurationMinutes(mins)}
                            className={`px-2.5 py-2 text-xs font-semibold rounded-lg border transition ${
                              durationMinutes === mins
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            {mins}m
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={generating}
                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition duration-150 disabled:opacity-50 flex items-center justify-center gap-2 text-sm cursor-pointer"
                  >
                    {generating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <QrCode className="w-4 h-4" />
                        <span>Generate Active Link & QR</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                <span>Timezone: Asia/Kolkata</span>
                <span>Team: T3 Only</span>
              </div>
            </div>

            {/* Right: Active QR Code & Live Countdown */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-gray-200 p-6 shadow-xs flex flex-col items-center justify-center min-h-[360px]">
              {generatedLink ? (
                <div className="w-full flex flex-col items-center text-center">
                  {/* Status Banner */}
                  <div className="w-full flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-200 mb-5">
                    <div className="flex items-center gap-2 text-left">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                      <div>
                        <p className="text-xs font-bold text-slate-800">T3 Session Active</p>
                        <p className="text-[11px] text-gray-500">
                          Expires: {new Date(generatedLink.expiresAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>

                    {generatedLink.active && countdownMs > 0 ? (
                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
                          ⏳ {formatCountdown(countdownMs)} remaining
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
                        EXPIRED
                      </span>
                    )}
                  </div>

                  {/* QR Display or Expired State */}
                  {generatedLink.active && countdownMs > 0 ? (
                    <div className="flex flex-col items-center animate-fade-in">
                      <div className="p-3 bg-white border-2 border-indigo-600 rounded-2xl shadow-md mb-3">
                        <img
                          src={generatedLink.qrCode}
                          alt="Attendance QR Code"
                          className="w-56 h-56 object-contain"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mb-4">Scan with camera to open attendance page</p>

                      {/* Link URL with Copy */}
                      <div className="w-full max-w-md flex items-center gap-2 p-1.5 bg-gray-50 rounded-xl border border-gray-200 mb-4">
                        <input
                          type="text"
                          readOnly
                          value={generatedLink.url}
                          className="flex-1 bg-transparent px-2 text-xs font-mono text-gray-700 outline-none select-all"
                        />
                        <button
                          type="button"
                          onClick={handleCopyLink}
                          className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 flex items-center gap-1.5 shadow-xs transition"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copied ? 'Copied!' : 'Copy'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => window.open(generatedLink.url, '_blank')}
                          className="px-2.5 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition"
                          title="Open in new tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Action Buttons: Post to Team Chat & Deactivate */}
                      <div className="w-full max-w-md flex flex-col sm:flex-row items-center gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShareTeamId(selectedTeamId || teams[0]?._id || '');
                            setShareCustomNote('');
                            setShareSuccess('');
                            setShareError('');
                            setShareModalOpen(true);
                          }}
                          className="w-full sm:flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-2 text-xs cursor-pointer"
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span>Post to Team Chat</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleDeactivate}
                          disabled={deactivating}
                          className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition disabled:opacity-50 cursor-pointer"
                        >
                          {deactivating ? 'Deactivating...' : 'Deactivate Early'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 px-6 flex flex-col items-center">
                      <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-3">
                        <XCircle className="w-8 h-8" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-800">Attendance Window Closed</h3>
                      <p className="text-xs text-gray-500 mt-1 max-w-sm">
                        This session link and QR code have expired or been deactivated. Generate a new session link above.
                      </p>
                      <button
                        type="button"
                        onClick={handleGenerateLink}
                        className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition"
                      >
                        Generate New Session
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 px-4 text-gray-400">
                  <div className="w-20 h-20 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center mx-auto mb-3">
                    <QrCode className="w-10 h-10 text-gray-300" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-600">No Active Session Link</h3>
                  <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                    Select the validity minutes on the left and click "Generate Active Link & QR" to begin.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* T3 ATTENDANCE PANEL (TODAY) — AUTO-POLLS EVERY 12 SECONDS */}
          {/* ========================================================================= */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-6">
            {/* Panel Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-slate-900">Today's T3 Attendance Panel</h2>
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Live (12s auto-refresh)</span>
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Date: {panelData?.date || new Date().toISOString().split('T')[0]} (Asia/Kolkata)
                </p>
              </div>

              <button
                type="button"
                onClick={fetchPanelData}
                disabled={loadingPanel}
                className="px-3.5 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 flex items-center gap-1.5 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPanel ? 'animate-spin' : ''}`} />
                <span>Refresh Now</span>
              </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs font-medium text-slate-500">Total T3 Members</p>
                <p className="text-3xl font-extrabold text-slate-900 mt-1">{panelData?.totalCount ?? '—'}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Active team roster</p>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <p className="text-xs font-medium text-emerald-700">Present Today</p>
                <p className="text-3xl font-extrabold text-emerald-600 mt-1">{panelData?.presentCount ?? '0'}</p>
                <p className="text-[11px] text-emerald-600/80 mt-0.5">Verified check-ins</p>
              </div>
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
                <p className="text-xs font-medium text-rose-700">Absent / Pending</p>
                <p className="text-3xl font-extrabold text-rose-600 mt-1">{panelData?.absentCount ?? '0'}</p>
                <p className="text-[11px] text-rose-600/80 mt-0.5">Yet to mark attendance</p>
              </div>
            </div>

            {/* Two Side-by-Side Panels: Present vs Absent Members */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
              {/* Present Members Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-emerald-50/70 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-emerald-950">Present Members ({panelData?.presentMembers?.length || 0})</h3>
                  </div>
                  <span className="text-[11px] text-emerald-700 font-medium">Sorted by time</span>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                  {panelData?.presentMembers?.map((m, idx) => (
                    <div key={m.id || idx} className="p-3.5 flex items-center justify-between hover:bg-gray-50 transition">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">
                          {m.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">{m.name}</p>
                          <p className="text-[11px] text-gray-400">{m.email}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-100 text-emerald-800">
                          {m.markedAt ? new Date(m.markedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Marked'}
                        </span>
                        <p className="text-[10px] text-gray-400 mt-0.5 uppercase">{m.method || 'link'}</p>
                      </div>
                    </div>
                  ))}

                  {(!panelData?.presentMembers || panelData.presentMembers.length === 0) && (
                    <div className="py-8 text-center text-xs text-gray-400">
                      No check-ins recorded yet for today.
                    </div>
                  )}
                </div>
              </div>

              {/* Absent Members List */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-rose-50/70 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <h3 className="text-sm font-bold text-rose-950">Absent Members ({panelData?.absentMembers?.length || 0})</h3>
                  </div>
                  <span className="text-[11px] text-rose-700 font-medium">Pending today</span>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                  {panelData?.absentMembers?.map((m, idx) => (
                    <div key={m.userId || idx} className="p-3.5 flex items-center justify-between hover:bg-gray-50 transition">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 font-bold flex items-center justify-center text-xs">
                          {m.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">{m.name}</p>
                          <p className="text-[11px] text-gray-400">{m.email}</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-700">
                        Absent
                      </span>
                    </div>
                  ))}

                  {(!panelData?.absentMembers || panelData.absentMembers.length === 0) && (
                    <div className="py-8 text-center text-xs text-emerald-600 font-medium">
                      ✓ All T3 members have checked in today!
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TEAM ROSTER & RECORDS (EXISTING VIEW) */}
      {/* ========================================================================= */}
      {activeTab === 'roster' && (
        <div className="space-y-6">
          {teams.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <UsersRound className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No event teams assigned</h3>
              <p className="text-sm text-gray-500">Ask an Admin to assign you as a Team Lead to manage event rosters.</p>
            </div>
          ) : (
            <>
              {/* Header Actions */}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={downloadCSV}
                  disabled={downloading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 text-sm"
                >
                  <Upload size={16} className="rotate-180" /> {downloading ? 'Downloading...' : 'Download CSV'}
                </button>
              </div>

              {/* Team + Date Selector */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1.5">Team</label>
                    <select
                      value={selectedTeamId}
                      onChange={(e) => setSelectedTeamId(e.target.value)}
                      className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500"
                    >
                      {teams.map((t) => (
                        <option key={t._id} value={t._id}>{t.name}{t.eventTitle ? ` — ${t.eventTitle}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1.5">Date</label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Stats Cards */}
              {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-500">Attendance Rate</p>
                    <p className="text-3xl font-bold mt-1 text-blue-600">{stats.percentage}%</p>
                    <p className="text-xs text-gray-400 mt-1">{stats.attended} of {stats.totalMembers} present</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-500">Present</p>
                    <p className="text-3xl font-bold mt-1 text-green-600">{stats.present}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-500">Late</p>
                    <p className="text-3xl font-bold mt-1 text-amber-600">{stats.late}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-500">Absent</p>
                    <p className="text-3xl font-bold mt-1 text-red-600">{stats.absent}</p>
                  </div>
                </div>
              )}

              {/* Roster Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="font-semibold">Team Roster — {teamInfo?.name}</h3>
                  <p className="text-xs text-gray-500">{roster.length} members</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[560px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Member</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Check In</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Method</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {roster.map((r) => (
                      <tr key={r.studentId} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                              {r.studentName.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{r.studentName}</p>
                              <p className="text-xs text-gray-500">{r.studentEmail}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[r.status]}`}>
                            {r.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-400 uppercase">{r.method || '—'}</td>
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            onClick={() => { setManualModal(r); setManualForm({ status: r.status === 'not_marked' ? 'present' : r.status, notes: '' }); }}
                            className="text-xs text-blue-600 hover:underline font-medium cursor-pointer"
                          >
                            {r.status === 'not_marked' ? 'Mark' : 'Update'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {roster.length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">No members in this team yet</td></tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Manual Mark Modal */}
      {manualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setManualModal(null)} />
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                {manualModal.studentName.charAt(0)}
              </div>
              <div>
                <h3 className="text-lg font-semibold">Mark Attendance</h3>
                <p className="text-xs text-gray-500">{manualModal.studentName}</p>
              </div>
            </div>

            <form onSubmit={submitManual} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'present', label: 'Present', color: 'green' },
                    { value: 'late', label: 'Late', color: 'amber' },
                    { value: 'absent', label: 'Absent', color: 'red' },
                    { value: 'on_leave', label: 'On Leave', color: 'purple' },
                    { value: 'half_day', label: 'Half Day', color: 'blue' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setManualForm({ ...manualForm, status: opt.value })}
                      className={`p-3 rounded-lg border-2 text-sm font-medium transition ${
                        manualForm.status === opt.value
                          ? `border-${opt.color}-500 bg-${opt.color}-50`
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Notes (optional)</label>
                <textarea
                  rows={2}
                  value={manualForm.notes}
                  onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                  placeholder="Reason, etc."
                  className="w-full p-3 rounded-lg border border-gray-200 outline-none resize-none focus:border-blue-500"
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setManualModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share QR & Link to Team Chat Modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-md w-full p-6 relative">
            <button
              type="button"
              onClick={() => setShareModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Share to Team Chat</h3>
                <p className="text-xs text-gray-500">Post attendance QR code & live link to team chat</p>
              </div>
            </div>

            {shareSuccess ? (
              <div className="py-6 flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-3">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">Shared Successfully!</h4>
                <p className="text-xs text-gray-500 mt-1 max-w-xs">{shareSuccess}</p>
                <div className="flex gap-2 mt-5">
                  <button
                    type="button"
                    onClick={() => navigate('/chat')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Open Team Chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareModalOpen(false)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleShareToTeamChat} className="space-y-4">
                {shareError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{shareError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1.5">
                    Select Target Team Chat
                  </label>
                  {teams.length === 0 ? (
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-500">
                      No teams available.
                    </div>
                  ) : (
                    <select
                      value={shareTeamId || selectedTeamId || teams[0]?._id}
                      onChange={(e) => setShareTeamId(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-gray-300 outline-none focus:border-indigo-500 text-xs font-semibold text-slate-800 bg-white"
                      required
                    >
                      {teams.map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.name} {t.eventTitle ? `(${t.eventTitle})` : ''} — {t.memberCount || t.members?.length || 0} members
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1.5">
                    Optional Announcement Note
                  </label>
                  <textarea
                    rows={2}
                    value={shareCustomNote}
                    onChange={(e) => setShareCustomNote(e.target.value)}
                    placeholder="e.g. Please mark your attendance now. Session closes in 15 minutes!"
                    className="w-full p-2.5 rounded-xl border border-gray-300 outline-none focus:border-indigo-500 text-xs text-slate-800"
                  />
                </div>

                {/* Preview Thumbnail */}
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center gap-3">
                  <img src={generatedLink?.qrCode} alt="QR Thumbnail" className="w-14 h-14 object-contain rounded-lg border border-gray-200 bg-white p-1" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800">Attendance QR & Link</p>
                    <p className="text-[11px] text-gray-500 truncate">Expires: {new Date(generatedLink?.expiresAt).toLocaleTimeString()}</p>
                    <span className="inline-block mt-1 text-[10px] font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                      Includes Direct Check-In Link
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShareModalOpen(false)}
                    className="px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sharingToChat || teams.length === 0}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-sm transition flex items-center gap-2 cursor-pointer"
                  >
                    {sharingToChat ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Sending to Chat...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send to Team Chat</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ====================================================================
// ATTEND PAGE — Public/Protected landing page for QR/Link attendance (/attend/:token)
// "Do NOT mark attendance on a GET request, because link previews can trigger it."
// ====================================================================
export const AttendPage = () => {
  const { token } = useParams();
  const { user, initializing } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [linkInfo, setLinkInfo] = useState(null);
  const [error, setError] = useState('');
  const [marking, setMarking] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);

  const fetchLink = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/attendance/link/${token}`);
      setLinkInfo(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Invalid or expired attendance link');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initializing) {
      if (user) {
        fetchLink();
      } else {
        setLoading(false);
      }
    }
  }, [token, user, initializing]);

  // Live countdown timer
  useEffect(() => {
    if (!linkInfo?.expiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, new Date(linkInfo.expiresAt).getTime() - Date.now());
      setTimeLeft(remaining);
      if (remaining === 0 && linkInfo.active) {
        setLinkInfo((prev) => prev ? { ...prev, active: false, status: 'expired' } : null);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [linkInfo?.expiresAt]);

  const handleMarkAttendance = async () => {
    if (marking) return;
    setMarking(true);
    setError('');
    try {
      const res = await api.post(`/attendance/link/${token}/mark`, {});
      setSuccessData(res.data.data);
      // Refresh status
      await fetchLink();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to mark attendance');
    } finally {
      setMarking(false);
    }
  };

  const formatRemaining = (ms) => {
    if (ms == null) return '...';
    if (ms <= 0) return '00:00';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (initializing || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">Verifying attendance link...</p>
        </div>
      </div>
    );
  }

  // If user is not logged in, prompt login
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Login Required</h2>
          <p className="text-sm text-slate-600 mb-6">
            You must be logged into your account to mark your attendance.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition shadow-md cursor-pointer"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  const isExpired = linkInfo ? (!linkInfo.active || (timeLeft != null && timeLeft <= 0)) : false;
  const isNotStarted = linkInfo?.status === 'not_started';
  const isAlreadyMarked = linkInfo?.alreadyMarked || !!successData;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 text-white text-center relative">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Clock className="w-7 h-7 text-indigo-400" />
          </div>
          <span className="text-xs uppercase tracking-widest font-mono text-indigo-300 font-bold">
            {linkInfo?.team || 'T3'} Attendance Portal
          </span>
          <h1 className="text-xl font-bold mt-1">Time-Limited Check-in</h1>
          <p className="text-xs text-slate-300 mt-1">Date: {linkInfo?.date || new Date().toISOString().split('T')[0]}</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* User ID card */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <p className="text-xs text-slate-500 font-medium">Logged in as</p>
              <p className="text-sm font-bold text-slate-800">{user.name}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
              {user.role}
            </span>
          </div>

          {/* Feedback Alerts */}
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs font-medium leading-relaxed">
                <p className="font-bold">Cannot Mark Attendance</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {successData && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-emerald-800">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs font-medium leading-relaxed">
                <p className="font-bold">Attendance Verified!</p>
                <p>Your attendance for today was recorded at {new Date(successData.markedAt || Date.now()).toLocaleTimeString()}.</p>
              </div>
            </div>
          )}

          {/* Status Details */}
          {linkInfo && (
            <div className="space-y-3">
              {/* Countdown or status pill */}
              <div className="text-center p-4 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Session Status</p>
                {isExpired ? (
                  <div className="mt-1">
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
                      EXPIRED / INACTIVE
                    </span>
                    <p className="text-xs text-slate-400 mt-1.5">This session window has closed.</p>
                  </div>
                ) : isNotStarted ? (
                  <div className="mt-1">
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                      NOT STARTED YET
                    </span>
                    <p className="text-xs text-slate-500 mt-1.5">Starts at: {new Date(linkInfo.startsAt).toLocaleTimeString()}</p>
                  </div>
                ) : (
                  <div className="mt-1">
                    <div className="text-3xl font-mono font-black text-indigo-600 tracking-wider">
                      {formatRemaining(timeLeft)}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Remaining until link expires at {new Date(linkInfo.expiresAt).toLocaleTimeString()}</p>
                  </div>
                )}
              </div>

              {/* Already marked indicator */}
              {isAlreadyMarked && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center text-xs font-semibold text-emerald-700 flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4" />
                  <span>You have already marked attendance for today!</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="pt-2">
            {!isAlreadyMarked && !isExpired && !isNotStarted && (
              <button
                type="button"
                onClick={handleMarkAttendance}
                disabled={marking}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl transition duration-150 shadow-lg shadow-emerald-900/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer text-base"
              >
                {marking ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Verifying on Server...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>Mark My Attendance</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate('/t3/attendance')}
              className="w-full mt-2.5 py-2.5 px-4 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              Go to T3 Dashboard / Panel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// ====================================================================
// CERTIFICATES PAGE — For T1/T2/T3 only
// Redirects to external certificate portal
// ====================================================================
export const CertificatesPage = () => {
  // Replace with your real certificate portal URL
  const EXTERNAL_CERT_URL = 'https://certificates.tbi.example.com';

  const handleRedirect = () => {
    window.open(EXTERNAL_CERT_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">My Certificates</h1>
        <p className="text-gray-500">Access your earned certificates on the external portal</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Award className="w-10 h-10 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold mb-2">Certificate Portal</h2>
        <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
          Your event certificates are hosted on a dedicated portal. Click below to access,
          download, and verify your earned certificates.
        </p>
        <button
          onClick={handleRedirect}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 inline-flex items-center gap-2"
        >
          <Award size={18} /> Open Certificate Portal
          <ExternalLink size={16} />
        </button>
        <p className="text-xs text-gray-400 mt-4 break-all">{EXTERNAL_CERT_URL}</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">What you'll find there</p>
          <ul className="text-xs space-y-1 list-disc list-inside">
            <li>All certificates earned from TBI events</li>
            <li>QR-verifiable digital certificates</li>
            <li>Downloadable PDF versions</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// ====================================================================
// NOTIFICATIONS
// ====================================================================
export const NotificationsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const socket = useSocket();
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchNotifs = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifs(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifs();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleNew = (notif) => {
      setNotifs((prev) => [notif, ...prev]);
    };
    socket.on('notification:new', handleNew);
    return () => socket.off('notification:new', handleNew);
  }, [socket]);

  const markRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifs(notifs.map((n) => n._id === id ? { ...n, isRead: true } : n));
    } catch (err) { console.error(err); }
  };

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifs(notifs.map((n) => ({ ...n, isRead: true })));
    } catch (err) { console.error(err); }
  };

  const handleNotifClick = async (n) => {
    if (!n.isRead) {
      await markRead(n._id);
    }
    if (n.linkTo) {
      navigate(n.linkTo);
      return;
    }
    if (n.type === 'application') {
      const appRoute =
        user?.role === 'T3_EXECUTIVE'
          ? '/t3/applications'
          : ['ADMIN', 'SUPER_ADMIN'].includes(user?.role)
          ? '/admin/applications'
          : user?.role === 'T2_ASSOCIATE'
          ? '/t2/applications'
          : '/t1/applications';
      navigate(appRoute);
    } else if (n.type === 'chat') {
      navigate('/chat');
    } else if (n.type === 'announcement') {
      navigate('/announcements');
    } else if (n.type === 'attendance') {
      navigate(user?.role === 'T3_EXECUTIVE' ? '/t3/attendance' : '/attendance');
    }
  };

  const filtered = filter === 'all' ? notifs : notifs.filter((n) => !n.isRead);
  const unread = notifs.filter((n) => !n.isRead).length;

  const iconFor = (type) => {
    if (type === 'application') return <FileCheck className="w-5 h-5 text-purple-600" />;
    if (type === 'chat') return <MessageSquare className="w-5 h-5 text-emerald-600" />;
    if (type === 'certificate') return <Award className="w-5 h-5 text-amber-500" />;
    if (type === 'attendance') return <CheckCircle className="w-5 h-5 text-blue-500" />;
    if (type === 'announcement') return <Bell className="w-5 h-5 text-indigo-600" />;
    if (type === 'event') return <Calendar className="w-5 h-5 text-cyan-500" />;
    if (type === 'review') return <Star className="w-5 h-5 text-yellow-500" />;
    return <Bell className="w-5 h-5 text-gray-500" />;
  };

  const isAnnouncement = (type) => type === 'announcement';

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><SkeletonTable rows={5} cols={2} /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-gray-500">{unread} unread / {notifs.length} total</p>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="text-sm text-blue-500 hover:underline">Mark all read</button>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === 'all' ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200'}`}>
          All ({notifs.length})
        </button>
        <button onClick={() => setFilter('unread')} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === 'unread' ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200'}`}>
          Unread ({unread})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No notifications</h3>
          <p className="text-gray-500">{filter === 'unread' ? "You're all caught up" : 'Activities will appear here'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm divide-y divide-gray-100">
          {filtered.map((n) => {
            const isAnn = isAnnouncement(n.type);
            return (
              <div
                key={n._id}
                onClick={() => handleNotifClick(n)}
                className={`p-4 flex gap-4 items-start cursor-pointer transition group ${
                  isAnn
                    ? !n.isRead
                      ? 'bg-indigo-50/70 border-l-4 border-l-indigo-500 hover:bg-indigo-100/70'
                      : 'bg-indigo-50/20 hover:bg-indigo-50/50'
                    : !n.isRead
                    ? 'bg-blue-50/40 border-l-4 border-l-blue-500 hover:bg-blue-50/70'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  n.type === 'application' ? 'bg-purple-100' :
                  n.type === 'chat' ? 'bg-emerald-100' :
                  isAnn ? 'bg-indigo-100' : 'bg-gray-100'
                }`}>
                  {iconFor(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm ${n.isRead ? 'font-normal text-gray-800' : 'font-semibold text-gray-900'} ${isAnn ? 'text-indigo-900' : ''}`}>
                        {n.title}
                      </p>
                      {isAnn && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                          ANNOUNCEMENT
                        </span>
                      )}
                      {n.type === 'application' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                          APPROVAL
                        </span>
                      )}
                      {n.type === 'chat' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                          CHAT
                        </span>
                      )}
                      {!n.isRead && <span className="w-2 h-2 rounded-full bg-rose-500 ring-2 ring-rose-200" />}
                    </div>
                    <span className="text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity font-medium flex items-center gap-0.5">
                      Open <ChevronRight size={14} />
                    </span>
                  </div>
                  <p className={`text-sm mt-0.5 ${isAnn ? 'text-indigo-800' : 'text-gray-600'}`}>
                    {n.message}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(n.createdAt).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ====================================================================
// REVIEWS
// ====================================================================
export const ReviewsPage = () => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ studentName: '', rating: 5, feedback: '' });

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/reviews');
        setReviews(res.data.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  const submitReview = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/reviews', {
        studentId: user._id,
        studentName: form.studentName,
        rating: form.rating,
        feedback: form.feedback,
      });
      setReviews([res.data.data, ...reviews]);
      setModal(false);
      setForm({ studentName: '', rating: 5, feedback: '' });
    } catch (err) { alert(err.response?.data?.message || 'Failed'); }
  };

  if (loading) return <SkeletonTable rows={3} cols={2} />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Reviews</h1>
          <p className="text-gray-500">Submit performance reviews for team members</p>
        </div>
        <button onClick={() => setModal(true)} className="px-4 py-2 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600">+ Submit Review</button>
      </div>
      {reviews.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Star className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No reviews yet</h3>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r._id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold">
                    {r.studentName?.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="font-medium">{r.studentName}</p>
                    <p className="text-xs text-gray-500">By {r.reviewerName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={16} className={i < r.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} />
                  ))}
                </div>
              </div>
              <p className="text-sm text-gray-600">{r.feedback}</p>
            </div>
          ))}
        </div>
      )}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModal(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6">
            <h3 className="text-lg font-semibold mb-5">Submit Review</h3>
            <form onSubmit={submitReview} className="space-y-4">
              <input required placeholder="Student Name" value={form.studentName}
                onChange={(e) => setForm({ ...form, studentName: e.target.value })}
                className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none" />
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setForm({ ...form, rating: n })} className="p-1">
                    <Star size={28} className={n <= form.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} />
                  </button>
                ))}
              </div>
              <textarea required rows={4} value={form.feedback}
                onChange={(e) => setForm({ ...form, feedback: e.target.value })}
                placeholder="Write your feedback..."
                className="w-full p-3 rounded-lg border border-gray-200 outline-none resize-none" />
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setModal(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-purple-500 text-white rounded-lg">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ====================================================================
// AUDIT LOGS
// ====================================================================
export const AuditLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/super-admin/audit-logs');
        setLogs(res.data.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  const actionColor = {
    USER_CREATED: 'bg-green-100 text-green-700',
    ACCESS_REVOKED: 'bg-red-100 text-red-700',
    EVENT_CREATED: 'bg-blue-100 text-blue-700',
    USER_DELETED: 'bg-red-100 text-red-700',
  };

  if (loading) return <SkeletonTable rows={5} cols={6} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-gray-500">Every admin action is permanently logged</p>
      </div>
      {logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <ScrollText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No logs yet</h3>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">By</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Resource</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">IP</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((l) => (
                <tr key={l._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${actionColor[l.action] || 'bg-gray-100 text-gray-700'}`}>{l.action}</span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">{l.performedByName || 'Unknown'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 font-mono text-xs">{l.method} {l.resource}</td>
                  <td className="px-6 py-4 text-sm text-gray-400 font-mono text-xs">{l.ipAddress}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">{new Date(l.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ====================================================================
// ADMIN MANAGEMENT
// ====================================================================
export const AdminManagementPage = () => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/admin/users');
        // Filter to only admin-level accounts
        setAdmins((res.data.data || []).filter((u) =>
          ['ADMIN', 'SUPER_ADMIN'].includes(u.role)
        ));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <SkeletonTable rows={3} cols={4} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Management</h1>
        <p className="text-gray-500">System administrators ({admins.length} total)</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {admins.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Shield className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No admin accounts found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.map((a) => (
                <tr key={a._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium">{a.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{a.email}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${a.role === 'SUPER_ADMIN' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                      }`}>{a.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${a.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                      }`}>{a.isActive ? 'Active' : 'Revoked'}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400 italic text-xs">
                    Manage via User Management
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ====================================================================
// ANALYTICS
// ====================================================================
export const AnalyticsPage = () => {
  const [stats, setStats] = useState(null);
  const [tiers, setTiers] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [top, setTop] = useState([]);
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [statsRes, tiersRes, monthlyRes, topRes, attendRes] = await Promise.all([
          api.get('/stats/admin'),
          api.get('/stats/users-by-tier'),
          api.get('/stats/monthly-applications'),
          api.get('/stats/top-performers'),
          api.get('/stats/attendance'),
        ]);
        setStats(statsRes.data.data);
        setTiers(tiersRes.data.data);
        setMonthly(monthlyRes.data.data);
        setTop(topRes.data.data);
        setAttendance(attendRes.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const tierPieData = [
    { name: 'T1', value: tiers.T1, color: '#059669', fill: '#059669' },
    { name: 'T2', value: tiers.T2, color: '#0284C7', fill: '#0284C7' },
    { name: 'T3', value: tiers.T3, color: '#7C3AED', fill: '#7C3AED' },
    { name: 'Admin', value: tiers.Admin + tiers.SuperAdmin, color: '#DC2626', fill: '#DC2626' },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-gray-500">Insights and trends across the platform</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total Users" value={stats.totalUsers} />
        <Kpi label="Active Events" value={stats.activeEvents} />
        <Kpi label="Approval Rate" value={`${stats.approvalRate}%`} />
        <Kpi label="Today Attendance" value={attendance ? `${attendance.rate}%` : '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200">
          <h3 className="font-semibold mb-4">User Distribution</h3>
          {tierPieData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-gray-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={tierPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value" />




                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 lg:col-span-2">
          <h3 className="font-semibold mb-4">Applications — Last 12 Months</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorApps" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
              <Area type="monotone" dataKey="count" stroke="#0EA5E9" strokeWidth={2.5} fillOpacity={1} fill="url(#colorApps)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200">
          <h3 className="font-semibold mb-4">Today's Attendance</h3>
          {!attendance || attendance.total === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-gray-400">No check-ins today</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Present', value: attendance.present, fill: '#10B981' },
                    { name: 'Late', value: attendance.late, fill: '#F59E0B' },
                    { name: 'Absent', value: attendance.absent, fill: '#EF4444' },
                  ]}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                />




                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200">
          <h3 className="font-semibold mb-4">Top Performers</h3>
          {top.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-gray-400">No performance data yet</div>
          ) : (
            <div className="space-y-3">
              {top.map((u, i) => (
                <div key={u.userId} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-700' : 'bg-blue-500'
                      }`}>{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-xs text-gray-500 truncate">{u.approvedCount} approved / {u.attendanceCount} days present</p>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-amber-600 flex-shrink-0">{u.score} pts</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ====================================================================
// BULK IMPORT
// ====================================================================
export const BulkImportPage = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const parseCSV = (text) => {
    // Strip UTF-8 BOM if present; normalize line endings
    const cleaned = text.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    const lines = cleaned.trim().split('\n');

    const rawHeader = lines[0] || '';
    // Binary detection: header must start with a letter and contain no control characters
    const hasControlChar = (str) => {
      for (let c = 0; c < str.length; c++) {
        const code = str.codePointAt(c);
        if ((code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31)) return true;
      }
      return false;
    };
    if (!/^[a-zA-Z]/.test(rawHeader.trim()) || hasControlChar(rawHeader)) {
      return { rows: [], errs: [{ line: 1, errors: ['Invalid CSV: unrecognized file format or binary content'] }] };
    }

    const headers = rawHeader.split(',').map(h => h.trim().toLowerCase());
    const requiredHeaders = ['name', 'email', 'role'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      return { rows: [], errs: [{ line: 1, errors: [`Invalid CSV: missing required columns: ${missingHeaders.join(', ')}`] }] };
    }

    const MAX_ROWS = 500;
    const dataLines = lines.slice(1).filter(l => l.trim() !== '');

    // Enforce row limit
    if (dataLines.length > MAX_ROWS) {
      return {
        rows: [],
        errs: [{ line: 1, errors: [`Too many rows: limit is ${MAX_ROWS} rows, file has ${dataLines.length}`] }],
      };
    }

    // F: Formula injection — characters that spreadsheets interpret as formula starters
    const FORMULA_STARTERS = new Set(['=', '+', '-', '@', '\t']);
    const hasFormulaInjection = (val) => Boolean(val && FORMULA_STARTERS.has(val.charAt(0)));

    const rows = [];
    const errs = [];
    const seenEmails = new Map(); // email -> first line number (for duplicate detection)

    for (let i = 0; i < dataLines.length; i++) {
      const lineNum = i + 2; // 1-indexed, skipping header (line 1)
      // D: Handle quoted fields with commas (RFC 4180 minimal)
      const parseFields = (line) => {
        const fields = [];
        let cur = '';
        let inQ = false;
        for (let c = 0; c < line.length; c++) {
          const ch = line[c];
          if (inQ) {
            if (ch === '"' && line[c + 1] === '"') { cur += '"'; c++; }
            else if (ch === '"') { inQ = false; }
            else { cur += ch; }
          } else if (ch === '"') { inQ = true; }

            else if (ch === ',') { fields.push(cur.trim()); cur = ''; }
            else { cur += ch; }

        }
        fields.push(cur.trim());
        return fields;
      };

      const values = parseFields(dataLines[i]);
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx] !== undefined ? values[idx] : ''; });

      const rowErrors = [];

      // F: Reject formula injection in name, role (not email — email starts with local-part)
      if (hasFormulaInjection(row.name)) rowErrors.push('Name must not start with =, +, -, @ or tab (formula injection)');
      if (row.phone && ['=', '@', '\t'].includes(row.phone.charAt(0))) rowErrors.push('Phone must not start with =, @ or tab (formula injection)');

      if (!row.name) rowErrors.push('Missing name');
      if (!row.email) rowErrors.push('Missing email');
      // Validate email format
      if (row.email && (row.email.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(row.email))) {
        rowErrors.push('Invalid email');
      }
      // Intra-file duplicate email detection
      if (row.email && !rowErrors.includes('Invalid email')) {
        const emailKey = row.email.toLowerCase();
        if (seenEmails.has(emailKey)) {
          rowErrors.push(`Duplicate email (first seen on line ${seenEmails.get(emailKey)})`);
        } else {
          seenEmails.set(emailKey, lineNum);
        }
      }
      // E: Phone format validation (digits, spaces, +, -, () only; 7-15 digits when stripped)
      if (row.phone && !rowErrors.some(e => e.includes('formula injection'))) {
        const stripped = row.phone.replace(/[\s\-().+]/g, '');
        if (!/^\d{7,15}$/.test(stripped)) {
          rowErrors.push('Invalid phone number format');
        }
      }
      if (!row.role) rowErrors.push('Missing role');
      if (row.role && !['T1_VOLUNTEER', 'T2_ASSOCIATE', 'T3_EXECUTIVE'].includes(row.role.toUpperCase())) {
        rowErrors.push('Invalid role');
      }
      rows.push({ ...row, _line: lineNum, _errors: rowErrors });
      if (rowErrors.length > 0) errs.push({ line: lineNum, errors: rowErrors });
    }
    const validRows = rows.filter(r => r._errors.length === 0);
    return { rows: validRows, preview: rows, errs };
  };

  const handleFile = (f) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      alert('File size exceeds the 2 MB limit');
      return;
    }
    setFile(f);
    setDone(false);
    f.text().then((text) => {

      const { rows, preview: previewRows, errs } = parseCSV(text);
      setPreview(previewRows || rows);
      setErrors(errs);
    }).catch(console.error);

  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    setProgress(0);

    let succeeded = 0;
    const importErrors = [];
    const BATCH_SIZE = 25; // Sized to fit comfortably within Vercel serverless function limits

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const chunk = validRows.slice(i, i + BATCH_SIZE);
      const payloadRows = chunk.map((r) => ({
        name: r.name,
        email: r.email,
        phone: r.phone || '',
        role: (r.role || 'T1_VOLUNTEER').toUpperCase(),
      }));

      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await api.post('/admin/users/bulk', { rows: payloadRows });
        const results = res.data?.results || [];
        results.forEach((resRow, idx) => {
          const origRow = chunk[idx];
          if (resRow.status === 'created') {
            succeeded++;
          } else {
            importErrors.push({ line: origRow._line, error: resRow.error || 'Failed' });
          }
        });
      } catch (err) {
        const errMsg = err.response?.data?.message || err.message;
        chunk.forEach((r) => {
          importErrors.push({ line: r._line, error: errMsg });
        });
      }
      setProgress(Math.min(100, Math.round(((i + chunk.length) / validRows.length) * 100)));
    }

    setImporting(false);
    setDone(true);
    if (importErrors.length > 0) {
      console.warn('Import errors:', importErrors);
    }
    setImportResult({ succeeded, failed: importErrors.length, errors: importErrors });
  };

  const reset = () => {
    setFile(null); setPreview([]); setErrors([]); setDone(false); setProgress(0); setImportResult(null);
  };

  const validRows = preview.filter(r => r._errors.length === 0);
  const invalidRows = preview.filter(r => r._errors.length > 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Bulk Import Users</h1>
        <p className="text-gray-500">Upload a CSV file to create multiple users at once</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">CSV Format Required</p>
          <p className="text-xs mb-2">Header row: <code className="bg-white px-1.5 py-0.5 rounded">name,email,phone,role</code></p>
          <p className="text-xs">Valid roles: <code className="bg-white px-1 rounded">T1_VOLUNTEER</code> <code className="bg-white px-1 rounded">T2_ASSOCIATE</code> <code className="bg-white px-1 rounded">T3_EXECUTIVE</code></p>
        </div>
      </div>

      {!file && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`bg-white rounded-xl border-2 border-dashed transition cursor-pointer p-12 text-center ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'}`}
          onClick={() => document.getElementById('csv-input').click()}
        >
          <input id="csv-input" type="file" accept=".csv,.txt" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="font-medium mb-1">Drop your CSV file here</p>
          <p className="text-sm text-gray-500">or click to browse</p>
        </div>
      )}

      {file && !done && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-gray-500">{preview.length} rows · {validRows.length} valid · {invalidRows.length} errors</p>
              </div>
            </div>
            <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"><X size={14} /> Remove</button>
          </div>

          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm font-medium text-red-800 mb-2 flex items-center gap-2">
                <AlertTriangle size={16} /> {errors.length} rows have errors
              </p>
              <ul className="text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto">
                {errors.slice(0, 5).map((e, i) => <li key={i}>Line {e.line}: {e.errors.join(', ')}</li>)}
                {errors.length > 5 && <li className="italic">...and {errors.length - 5} more</li>}
              </ul>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold">Preview ({preview.length} rows)</h3>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Line</th>
                    <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Phone</th>
                    <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.map((r, i) => (
                    <tr key={i} className={r._errors.length > 0 ? 'bg-red-50' : ''}>
                      <td className="px-4 py-2 text-xs text-gray-500">{r._line}</td>
                      <td className="px-4 py-2 text-sm">{r.name || '—'}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">{r.email || '—'}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">{r.phone || '—'}</td>
                      <td className="px-4 py-2 text-sm"><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{r.role || '—'}</span></td>
                      <td className="px-4 py-2 text-sm">
                        {r._errors.length === 0 ? (
                          <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle size={12} /> Valid</span>
                        ) : (
                          <span className="text-xs text-red-600 flex items-center gap-1"><X size={12} /> Error</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200">
            <div>
              <p className="text-sm font-medium">{validRows.length} valid rows will be imported</p>
              {invalidRows.length > 0 && <p className="text-xs text-gray-500">{invalidRows.length} rows will be skipped</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={reset} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleImport} disabled={validRows.length === 0 || importing}
                className="px-5 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50">
                {importing ? `Importing ${progress}%` : `Import ${validRows.length} Users`}
              </button>
            </div>
          </div>

          {importing && (
            <div className="bg-white p-4 rounded-xl border border-gray-200">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {done && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold mb-2">Import Complete</h3>
          <p className="text-gray-500 mb-6">
            {importResult ? importResult.succeeded : validRows.length} users created successfully
            {importResult && importResult.failed > 0 ? `, ${importResult.failed} failed` : ''}
            {invalidRows.length > 0 ? `, ${invalidRows.length} invalid rows skipped` : ''}
          </p>
          <div className="flex gap-3 justify-center">
            <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Download Report</button>
            <button onClick={reset} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">Import Another</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ====================================================================
// TEAMS — Create teams, add members, view details
// ====================================================================
export const TeamsPage = () => {
  const { user } = useAuth();
  const canManage = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [addMemberModal, setAddMemberModal] = useState(null); // team obj
  const [detailModal, setDetailModal] = useState(null);       // team obj
  const [form, setForm] = useState({ name: '', description: '', leadId: '' });
  const [memberSearch, setMemberSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch teams + users on mount
  useEffect(() => {
    (async () => {
      try {
        const [teamsRes, usersRes] = await Promise.all([
          api.get('/teams'),
          canManage ? api.get('/admin/users') : Promise.resolve({ data: { data: [] } }),
        ]);
        setTeams(teamsRes.data.data);
        setUsers(usersRes.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [canManage]);

  // Create team
  const createTeam = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/teams', {
        name: form.name,
        description: form.description,
        leadId: form.leadId || null,
      });
      setTeams([res.data.data, ...teams]);
      setCreateModal(false);
      setForm({ name: '', description: '', leadId: '' });
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create team');
    } finally {
      setSaving(false);
    }
  };

  // Add member to team
  const addMember = async (teamId, userId) => {
    try {
      const res = await api.post(`/teams/${teamId}/members`, { userId });
      setTeams(teams.map(t => t._id === teamId ? res.data.data : t));
      setMemberSearch('');
      alert('Member added');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add member');
    }
  };

  // Remove member
  const removeMember = async (teamId, userId, userName) => {
    if (!confirm(`Remove ${userName} from this team?\n\nIf they're not in another team of the same event, they'll also be removed from the event.`)) return;
    try {
      const res = await api.delete(`/teams/${teamId}/members/${userId}`);
      setTeams(teams.map(t => t._id === teamId ? res.data.data : t));
      if (detailModal?._id === teamId) setDetailModal(res.data.data);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to remove');
    }
  };

  // Filter users for "add member" — excludes those already in team
  const availableUsers = (team) => {
    if (!team) return [];
    const memberIds = team.members?.map(m => m._id) || [];
    return users.filter(u =>
      !memberIds.includes(u._id) &&
      (u.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(memberSearch.toLowerCase()))
    );
  };

  if (loading) {
    return <div className="space-y-6"><Skeleton className="h-8 w-48" /><SkeletonCardGrid count={3} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="text-gray-500">All active teams and their members</p>
        </div>
        {canManage && (
          <button onClick={() => setCreateModal(true)} className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 flex items-center gap-2">
            <Plus size={16} /> Create Team
          </button>
        )}
      </div>

      {teams.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <UsersRound className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
          <p className="text-gray-500 mb-4">Create your first team to get started</p>
          {canManage && (
            <button onClick={() => setCreateModal(true)} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
              + Create Team
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((t) => (
            <div key={t._id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-lg">{t.name}</h3>
                {t.chatActive && <MessageSquare className="w-4 h-4 text-green-500" />}
              </div>

              {t.description && <p className="text-xs text-gray-500 mb-2">{t.description}</p>}

              <p className="text-sm text-gray-600 mb-3">
                Lead: <span className="font-medium">{t.leadName || t.leadId?.name || 'Not assigned'}</span>
              </p>

              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <Users size={14} /> {t.memberCount || t.members?.length || 0} members
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setDetailModal(t)} className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">
                    View
                  </button>
                  {canManage && (
                    <button onClick={() => setAddMemberModal(t)} className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600">
                      + Member
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- CREATE TEAM MODAL ---------- */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCreateModal(false)} />
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <h3 className="text-lg font-semibold mb-5">Create New Team</h3>
            <form onSubmit={createTeam} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Team Name *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Tech Team"
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Description</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description..."
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Assign Team Lead (Optional)</label>
                <select value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })}
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none">
                  <option value="">Select a lead...</option>
                  {users.filter(u => ['T3_EXECUTIVE', 'T2_ASSOCIATE'].includes(u.role)).map(u => (
                    <option key={u._id} value={u._id}>{u.name} ({u.email})</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Team leads get access to team management</p>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setCreateModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------- ADD MEMBER MODAL ---------- */}
      {addMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAddMemberModal(null)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-lg font-semibold">Add Member</h3>
                <p className="text-sm text-gray-500">to {addMemberModal.name}</p>
              </div>
              <button onClick={() => setAddMemberModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-3">
                <Search className="w-4 h-4 text-gray-400" />
                <input type="text" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search users by name or email..."
                  className="flex-1 bg-transparent border-none outline-none text-sm" />
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2">
              {availableUsers(addMemberModal).length === 0 ? (
                <p className="text-center text-gray-500 py-8 text-sm">No users available to add</p>
              ) : availableUsers(addMemberModal).map((u) => (
                <div key={u._id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{u.name}</p>
                      <p className="text-xs text-gray-500">{u.email} · {u.role.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <button onClick={() => addMember(addMemberModal._id, u._id)}
                    className="px-3 py-1.5 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600">
                    + Add
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs text-gray-500">
                Current members: {addMemberModal.members?.length || 0}
              </span>
              <button onClick={() => setAddMemberModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- TEAM DETAIL MODAL ---------- */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetailModal(null)} />
          <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-xl font-bold">{detailModal.name}</h3>
                {detailModal.description && <p className="text-sm text-gray-500 mt-1">{detailModal.description}</p>}
              </div>
              <button onClick={() => setDetailModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Total Members</p>
                <p className="text-2xl font-bold">{detailModal.members?.length || 0}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Team Lead</p>
                <p className="text-sm font-semibold mt-1">{detailModal.leadName || detailModal.leadId?.name || '—'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Chat Room</p>
                <p className="text-sm font-semibold mt-1 text-green-600 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span> Active
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center mb-3">
              <h4 className="font-semibold">Members</h4>
              {canManage && (
                <button onClick={() => { setDetailModal(null); setAddMemberModal(detailModal); }}
                  className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600">
                  + Add Member
                </button>
              )}
            </div>

            {(!detailModal.members || detailModal.members.length === 0) ? (
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No members yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {detailModal.members.map((m) => (
                  <div key={m._id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                        {m.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{m.name}</p>
                        <p className="text-xs text-gray-500">{m.email}</p>
                      </div>
                      {m._id === (detailModal.leadId?._id || detailModal.leadId) && (
                        <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">LEAD</span>
                      )}
                    </div>
                    {canManage && m._id !== (detailModal.leadId?._id || detailModal.leadId) && (
                      <button onClick={() => removeMember(detailModal._id, m._id, m.name)}
                        className="text-xs text-red-500 hover:underline">
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ====================================================================
// MY SHIFTS
// ====================================================================
export const MyShiftsPage = () => {
  const shifts = [
    { _id: '1', event: 'Annual Tech Fest 2026', role: 'Tech Team', date: 'Oct 15, 2026', time: '9:00 AM - 1:00 PM', status: 'upcoming' },
    { _id: '2', event: 'Startup Pitch Day', role: 'Registration', date: 'Nov 5, 2026', time: '10:00 AM - 4:00 PM', status: 'upcoming' },
    { _id: '3', event: 'Design Sprint', role: 'Media Team', date: 'Sep 20, 2026', time: '2:00 PM - 6:00 PM', status: 'completed' },
  ];
  const statusColor = {
    upcoming: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    missed: 'bg-red-100 text-red-700',
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Shifts</h1>
        <p className="text-gray-500">All your assigned shifts across events</p>
      </div>
      <div className="space-y-3">
        {shifts.map((s) => (
          <div key={s._id} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between hover:shadow-md transition">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="font-semibold">{s.event}</p>
                <p className="text-sm text-gray-500">{s.role}</p>
                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-3">
                  <span className="flex items-center gap-1"><Calendar size={12} /> {s.date}</span>
                  <span className="flex items-center gap-1"><Timer size={12} /> {s.time}</span>
                </p>
              </div>
            </div>
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${statusColor[s.status]}`}>{s.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ====================================================================
// SESSIONS
// ====================================================================
export const SessionsPage = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [terminatingId, setTerminatingId] = useState(null);
  const [msg, setMsg] = useState('');

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/super-admin/sessions');
      setSessions(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load active sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleTerminate = async (id, name) => {
    if (!window.confirm(`Terminate active session for ${name}?`)) return;
    setTerminatingId(id);
    try {
      await api.delete(`/super-admin/sessions/${id}`);
      setMsg(`Terminated session for ${name}`);
      setTimeout(() => setMsg(''), 4000);
      fetchSessions();
    } catch (err) {
      alert(err.message || 'Failed to terminate session');
    } finally {
      setTerminatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Active Sessions</h1>
          <p className="text-gray-500 text-sm">Real-time tracking of authenticated user sessions</p>
        </div>
        <button
          onClick={fetchSessions}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-100 transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-600'}`} />
          <span>Refresh</span>
        </button>
      </div>

      {msg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{msg}</span>
        </div>
      )}

      {loading && sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
          Loading active sessions...
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Monitor className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 mb-1">No Active Sessions</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            There are currently no users logged into the platform with an active session token.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Activity</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {sessions.map((s) => {
                  const isRecent = s.lastActivity && (Date.now() - new Date(s.lastActivity).getTime() < 30 * 60 * 1000);
                  const lastActStr = s.lastActivity
                    ? new Date(s.lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + new Date(s.lastActivity).toLocaleDateString() + ')'
                    : 'Unknown';
                  return (
                    <tr key={s._id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{s.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{s.email}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                          {s.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {isRecent ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3 text-amber-600" /> Idle
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 font-mono">
                        {lastActStr}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleTerminate(s._id, s.name)}
                          disabled={terminatingId === s._id}
                          className="px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors disabled:opacity-50"
                        >
                          {terminatingId === s._id ? 'Revoking...' : 'Revoke Session'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ====================================================================
// MY APPLICATIONS
// ====================================================================
// ====================================================================
// MY APPROVAL REQUESTS — Employee Section (T1/T2/T3)
// ====================================================================
export const MyApplicationsPage = () => {

  const { socket } = useSocket();
  const [apps, setApps] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showRaiseModal, setShowRaiseModal] = useState(false);
  const [successToast, setSuccessToast] = useState('');

  const fetchMyRequests = async () => {
    try {
      const [res, teamsRes] = await Promise.all([
        api.get('/applications/me'),
        api.get('/teams/my-teams').catch(() => ({ data: { data: [] } })),
      ]);
      setApps(res.data?.data || []);
      setTeams(teamsRes.data?.data || teamsRes.data || []);
    } catch (err) {
      console.error('Failed to load my requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyRequests();
  }, []);

  // Live update when team lead approves/denies or new notification arrives
  useEffect(() => {
    if (!socket) return;
    const handleNotification = (notif) => {
      if (notif.type === 'application' || notif.type === 'attendance') {
        fetchMyRequests();
      }
    };
    socket.on('notification:new', handleNotification);
    return () => socket.off('notification:new', handleNotification);
  }, [socket]);

  const filtered = apps.filter((a) => {
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'rejected' ? (a.status === 'rejected' || a.status === 'denied') : a.status === statusFilter);
    const matchesType = typeFilter === 'all' || a.requestType === typeFilter;
    return matchesStatus && matchesType;



  });

  const total = apps.length;
  const pending = apps.filter((a) => a.status === 'pending').length;
  const approved = apps.filter((a) => a.status === 'approved').length;
  const rejected = apps.filter((a) => a.status === 'rejected' || a.status === 'denied').length;

  const statusBadge = (status) => {
    if (status === 'approved') {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">Approved</span>;
    }
    if (status === 'rejected' || status === 'denied') {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">Denied</span>;
    }
    if (status === 'waitlisted') {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Waitlist</span>;
    }
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Pending Review</span>;
  };

  const typeBadge = renderApplicationTypeBadge;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <SkeletonTable rows={4} cols={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Requests</h1>
          <p className="text-gray-500 text-sm mt-0.5">Request leave or half-day and track approval status from your team lead</p>
        </div>
        <button
          onClick={() => setShowRaiseModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>Raise Request</span>
        </button>
      </div>

      {successToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast('')} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Total Submitted</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">{total}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-amber-600">Pending Review</p>
          <p className="text-2xl font-bold mt-1 text-amber-600">{pending}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-green-600">Approved</p>
          <p className="text-2xl font-bold mt-1 text-green-600">{approved}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-red-600">Denied</p>
          <p className="text-2xl font-bold mt-1 text-red-600">{rejected}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-1">
          {[
            { id: 'all', label: 'All Status' },
            { id: 'pending', label: 'Pending' },
            { id: 'approved', label: 'Approved' },
            { id: 'rejected', label: 'Denied' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setStatusFilter(pill.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === pill.id
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {[
            { id: 'all', label: 'All Types' },
            { id: 'leave', label: 'Leave' },
            { id: 'half_day', label: 'Half Day' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setTypeFilter(pill.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                typeFilter === pill.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
            <FileCheck className="w-14 h-14 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-800">No approval requests</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              Need to take a full day off or a half day? Click below to submit a request directly to your T3 team lead.
            </p>
            <button
              onClick={() => setShowRaiseModal(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Raise Request</span>
            </button>
          </div>
        ) : (
          filtered.map((a) => (
            <div
              key={a._id}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    a.requestType === 'half_day' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                  }`}>
                    {a.requestType === 'half_day' ? <Clock className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">
                        {a.requestType === 'half_day' ? 'Half Day Request' : 'Full Day Leave Request'}
                      </span>
                      {typeBadge(a.requestType)}
                      {statusBadge(a.status)}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span className="font-medium text-gray-800">
                        📅 For Date: <strong className="text-gray-900">{a.targetDate || 'Today'}</strong>
                      </span>
                      <span>Team: {a.teamName || 'Assigned Team'}</span>
                      <span>Submitted: {new Date(a.appliedAt || Date.now()).toLocaleDateString()}</span>
                    </div>

                    {/* Reason */}
                    <div className="mt-2 text-xs">
                      {a.reason ? (
                        <p className="text-gray-700 bg-gray-50 border border-gray-200/80 px-3 py-1.5 rounded-lg inline-block">
                          <span className="font-medium text-gray-500">Your Reason:</span> "{a.reason}"
                        </p>
                      ) : (
                        <span className="text-gray-400 italic">No reason specified (optional)</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="self-end sm:self-center">
                  {statusBadge(a.status)}
                </div>
              </div>

              {/* Status Outcome Callouts */}
              {a.status === 'approved' && (
                <div className="mt-3.5 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50/70 p-2.5 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>
                    Approved by <strong>{a.reviewedByName || 'Team Lead'}</strong> • Attendance marked for {a.targetDate}
                  </span>
                </div>
              )}

              {(a.status === 'rejected' || a.status === 'denied') && (
                <div className="mt-3.5 pt-3 border-t border-gray-100 flex items-start gap-2 text-xs text-red-800 bg-red-50/70 p-2.5 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Request Denied by Lead.</span> Reason: "{a.rejectionReason || 'No reason specified'}"
                  </div>
                </div>
              )}

              {a.status === 'pending' && (
                <div className="mt-3.5 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-amber-700">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Awaiting review and decision from your T3 Team Lead.</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Raise Request Modal */}
      <RaiseApprovalModal
        isOpen={showRaiseModal}
        onClose={() => setShowRaiseModal(false)}
        onSuccess={() => {
          fetchMyRequests();
          setSuccessToast('Your request has been submitted to your team lead!');
          setTimeout(() => setSuccessToast(''), 4500);
        }}
        initialTeams={teams}
      />
    </div>
  );
};

// ====================================================================
// MY TEAMS
// ====================================================================
export const MyTeamsPage = () => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [creatingChat, setCreatingChat] = useState(false);

  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTeams = async () => {
    try {
      const res = await api.get('/teams/me');
      setTeams(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  // Create or get chat room for a team
  const createOrGetChat = async (teamId) => {
    setCreatingChat(true);
    try {
      const res = await api.post(`/chat/rooms/team/${teamId}`);
      const room = res.data.data;
      alert(`Chat room ready: "${room.name}"\n\nOpening chat...`);
      navigate('/chat');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create chat');
    } finally {
      setCreatingChat(false);
    }
  };

  if (loading) return <SkeletonCardGrid count={3} />;

  // Detail view
  if (selected) {
    const team = teams.find((t) => t._id === selected);
    if (!team) return null;

    return (
      <div className="space-y-6">
        <button onClick={() => setSelected(null)} className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1">
          <ChevronLeft size={16} /> Back to all teams
        </button>

        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">{team.name}</h1>
            <p className="text-gray-500">{team.eventTitle}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => createOrGetChat(team._id)}
              disabled={creatingChat}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 flex items-center gap-2 disabled:opacity-50"
            >
              <MessageSquare size={16} />
              {creatingChat ? 'Opening...' : 'Create / Add to Chat'}
            </button>
            <button
              onClick={() => navigate('/chat')}
              className="px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 flex items-center gap-2"
            >
              <MessageSquare size={16} /> Open Chat
            </button>
            <button className="px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 flex items-center gap-2">
              <QrCode size={16} /> Generate QR
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200">
            <p className="text-sm text-gray-500">Total Members</p>
            <p className="text-3xl font-bold mt-2">{team.members?.length || 0}</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200">
            <p className="text-sm text-gray-500">Team Lead</p>
            <p className="text-lg font-bold mt-2">{team.leadName || team.leadId?.name || '—'}</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200">
            <p className="text-sm text-gray-500">Chat Status</p>
            <p className="text-lg font-bold mt-2 text-green-600">Active</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold">Members ({team.members?.length || 0})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[500px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Member</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {team.members?.map((m) => (
                <tr key={m._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold">
                        {m.name.charAt(0)}
                      </div>
                      <span className="text-sm font-medium">{m.name}</span>
                      {m._id === (team.leadId?._id || team.leadId) && (
                        <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">
                          LEAD
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{m.email}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${m.role === 'T3_EXECUTIVE' ? 'bg-purple-100 text-purple-700' :
                      m.role === 'T2_ASSOCIATE' ? 'bg-blue-100 text-blue-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                      {m.role.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    );
  }

  // Grid view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Teams</h1>
        <p className="text-gray-500">Teams you lead as T3 Executive</p>
      </div>

      {teams.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <UsersRound className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
          <p className="text-gray-500">Ask Admin to assign you as a team lead</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((t) => (
            <div key={t._id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition cursor-pointer" onClick={() => setSelected(t._id)}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-lg">{t.name}</h3>
                <MessageSquare className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-sm text-gray-500 mb-4">{t.eventTitle}</p>
              <div className="flex justify-between text-sm pt-3 border-t border-gray-100">
                <span className="text-gray-500 flex items-center gap-1">
                  <Users size={14} /> {t.members?.length || 0} members
                </span>
                <span className="text-blue-500 font-medium text-xs">View Details</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ====================================================================
// ENHANCED T3 DASHBOARD
// ====================================================================
export const T3DashboardEnhanced = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [myEvents, setMyEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [eventsRes, statsRes] = await Promise.all([
          api.get('/events/me'),
          api.get('/stats/t3'),
        ]);
        setMyEvents(eventsRes.data.data);
        setStats(statsRes.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const [teamAttendance, setTeamAttendance] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const teamsRes = await api.get('/teams/me');
        const list = teamsRes.data.data;
        const withStats = await Promise.all(
          list.map(async (t) => {
            try {
              const s = await api.get(`/attendance/team/stats?teamId=${t._id}`);
              return { ...t, stats: s.data.data };
            } catch {
              return { ...t, stats: null };
            }
          })
        );
        setTeamAttendance(withStats);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnnouncementBanner />
      <div>
        <h1 className="text-2xl font-bold">Hi {user.name.split(' ')[0]}</h1>
        <p className="text-gray-500">Your events and pending tasks</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi label="My Events" value={stats?.myEvents ?? 0} />
        <Kpi label="As Head" value={stats?.eventsAsHead ?? 0} />
        <Kpi label="Pending Apps" value={stats?.pendingApps ?? 0} />
        <Kpi label="Present Today" value={stats?.attendanceToday ?? 0} />
      </div>

      {/* Team Attendance Percentages */}
      {teamAttendance.length > 0 && (
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 min-w-0 overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg">Team Attendance Today</h3>
            <button onClick={() => navigate('/t3/attendance')} className="text-xs text-purple-500 hover:underline">
              Manage →
            </button>
          </div>
          <div className="space-y-3">
            {teamAttendance.map((t) => {
              const pct = t.stats?.percentage || 0;
              return (
                <div key={t._id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{t.name}</span>
                    <span className={`font-medium ${pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {t.stats && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t.stats.attended} / {t.stats.totalMembers} present today
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Events list */}
      <div className="bg-white p-5 rounded-xl border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">My Events</h3>
          <button onClick={() => navigate('/t3/teams')} className="text-xs text-purple-500 hover:underline">
            View Teams
          </button>
        </div>

        {myEvents.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No events assigned to you yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myEvents.map((ev) => {
              const isHead = ev.headId?._id === user._id || ev.headId === user._id;
              return (
                <div
                  key={ev._id}
                  className={`border rounded-lg p-4 hover:bg-purple-50 transition cursor-pointer ${isHead ? 'border-purple-200 bg-purple-50/30' : 'border-gray-200'}`}
                  onClick={() => navigate(`/t3/events/${ev._id}`)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold truncate">{ev.title}</p>
                        {isHead && (
                          <span className="text-[10px] px-2 py-0.5 bg-purple-500 text-white rounded-full font-semibold">
                            HEAD
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{ev.date} / {ev.location}</p>
                    </div>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium flex-shrink-0">
                      {ev.memberCount || 0} members
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ====================================================================
// ENHANCED T2 DASHBOARD
// ====================================================================
export const T2DashboardEnhanced = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/stats/t2');
        setStats(res.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const [myAttendance, setMyAttendance] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/attendance/my-stats?days=30');
        setMyAttendance(res.data.data);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnnouncementBanner />
      <div>
        <h1 className="text-2xl font-bold">Hey {user.name.split(' ')[0]}</h1>
        <p className="text-gray-500">Here's your activity</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi label="My Applications" value={stats?.myApplications ?? 0} />
        <Kpi label="Approved" value={stats?.approved ?? 0} />
        <Kpi label="My Teams" value={stats?.myTeams ?? 0} />
        <Kpi label="Days Attended" value={stats?.attendanceDays ?? 0} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi label="Pending" value={stats?.pending ?? 0} />
        <Kpi label="Rejected" value={stats?.rejected ?? 0} />
        <Kpi label="Certificates" value={stats?.certificates ?? 0} />
        <div></div>
      </div>

      {/* Personal Attendance Card */}
      {myAttendance && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">My Attendance (30 Days)</h3>
            <button onClick={() => navigate('/t1/checkin')} className="text-xs text-blue-500 hover:underline">
              View →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold text-blue-600">{myAttendance.percentage}%</p>
              <p className="text-xs text-gray-500 mt-0.5">Attendance Rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-600">{myAttendance.totalHours}h</p>
              <p className="text-xs text-gray-500 mt-0.5">Total Hours</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-100 text-center">
            <div>
              <p className="text-lg font-bold text-green-600">{myAttendance.present}</p>
              <p className="text-[10px] text-gray-500 uppercase">Present</p>
            </div>
            <div>
              <p className="text-lg font-bold text-amber-600">{myAttendance.late}</p>
              <p className="text-[10px] text-gray-500 uppercase">Late</p>
            </div>
            <div>
              <p className="text-lg font-bold text-red-600">{myAttendance.absent}</p>
              <p className="text-[10px] text-gray-500 uppercase">Absent</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ====================================================================
// SKELETONS
// ====================================================================
export const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

export const SkeletonCard = () => (
  <div className="bg-white p-5 rounded-xl border border-gray-200">
    <Skeleton className="h-3 w-24 mb-3" />
    <Skeleton className="h-8 w-20" />
  </div>
);

export const SkeletonTable = ({ rows = 5, cols = 4 }) => (
  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
    <div className="bg-gray-50 border-b border-gray-200 p-4 flex gap-4">
      {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-3 flex-1" />)}
    </div>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="p-4 flex gap-4 border-b border-gray-100 last:border-0">
        {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} className="h-4 flex-1" />)}
      </div>
    ))}
  </div>
);

export const SkeletonCardGrid = ({ count = 3 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Skeleton className="h-32 rounded-none" />
        <div className="p-5 space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

export const useFakeLoading = (ms = 600) => {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return loading;
};

// ====================================================================
// EVENT DETAIL — View details + Event Head manages members
// ====================================================================
export const EventDetailPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [addMemberModal, setAddMemberModal] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', date: '', location: '', description: '', headId: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const canManage = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const isEventHead = event?.headId?._id === user._id || event?.headId === user._id;
  const canAddMembers = canManage || isEventHead;

  // Load event + users
  const fetchEvent = async () => {
    try {
      const res = await api.get(`/events/${id}`);
      setEvent(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await fetchEvent();
      if (canAddMembers) {
        try {
          const res = await api.get('/admin/users');
          setUsers(res.data.data);
        } catch (err) { console.error(err); }
      }
    })();
  }, [id, canAddMembers]);

  const addMember = async (userId) => {
    setSaving(true);
    try {
      const res = await api.post(`/events/${id}/members`, { userId });
      setEvent(res.data.data);
      setMemberSearch('');
      alert('Member added');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (userId, userName) => {
    if (!confirm(`Remove ${userName} from this event?`)) return;
    try {
      const res = await api.delete(`/events/${id}/members/${userId}`);
      setEvent(res.data.data);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to remove member');
    }
  };

  // Open edit modal with current values
  const openEditModal = () => {
    setEditForm({
      title: event.title || '',
      date: event.date || '',
      location: event.location || '',
      description: event.description || '',
      headId: event.headId?._id || '',
    });
    setEditModal(true);
  };

  // Save event edits
  const saveEdit = async (e) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const res = await api.patch(`/events/${id}`, editForm);
      setEvent(res.data.data);
      setEditModal(false);
      alert('Event updated successfully');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update event');
    } finally {
      setSavingEdit(false);
    }
  };

  // Filter users — exclude existing members + Event Head + only T1/T2 for non-admins
  const eligibleUsers = users.filter((u) => {
    const isMember = event?.members?.some((m) => m._id === u._id);
    if (isMember) return false;
    if (u._id === user._id) return false;

    // Admin can add anyone except SUPER_ADMIN
    if (canManage) return u.role !== 'SUPER_ADMIN';

    // Event Head (T3) can only add T1/T2
    if (isEventHead) return ['T1_VOLUNTEER', 'T2_ASSOCIATE'].includes(u.role);

    return false;
  }).filter((u) =>
    u.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(memberSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Event not found</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-blue-500 hover:underline flex items-center gap-1 mx-auto">
          <ChevronLeft size={16} /> Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1">
        <ChevronLeft size={16} /> Back to Events
      </button>

      {/* Hero banner */}
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-8 text-white">
        <div className="flex items-start justify-between mb-4">
          <span className="text-xs bg-white/20 backdrop-blur px-3 py-1 rounded-full font-medium">
            {event.status.toUpperCase()}
          </span>
          <Calendar className="w-8 h-8 text-white/60" />
        </div>
        <h1 className="text-3xl font-bold mb-3">{event.title}</h1>
        <div className="flex flex-wrap gap-4 text-sm text-white/90">
          <span className="flex items-center gap-2"><Calendar size={16} /> {event.date}</span>
          <span className="flex items-center gap-2"><MapPin size={16} /> {event.location}</span>
        </div>

        {/* Event Head */}
        {event.headName && (
          <div className="mt-5 pt-5 border-t border-white/20 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-lg">
              {event.headName.charAt(0)}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider opacity-80">Event Head</p>
              <p className="font-semibold text-lg">{event.headName}</p>
              <p className="text-xs opacity-70">{event.headEmail}</p>
            </div>
          </div>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total Members" value={event.memberCount || event.members?.length || 0} />
        <Kpi label="Teams" value={event.teams || 0} />
        <Kpi label="Total Applicants" value={event.applicants || 0} />
        <Kpi label="Status" value={event.status} />
      </div>

      {/* Description */}
      {event.description && (
        <div className="bg-white p-5 rounded-xl border border-gray-200">
          <h3 className="font-semibold mb-3">About this Event</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{event.description}</p>
        </div>
      )}

      {/* MEMBERS SECTION */}
      <div className="bg-white p-5 rounded-xl border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-500" /> Event Members
              <span className="text-sm font-normal text-gray-500">({event.memberCount || event.members?.length || 0})</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {canAddMembers ? 'Manage the event workforce' : 'Members assigned to this event'}
            </p>
          </div>
          {canAddMembers && (
            <button onClick={() => setAddMemberModal(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 flex items-center gap-2">
              <UserPlus size={16} /> Add Member
            </button>
          )}
        </div>

        {(!event.members || event.members.length === 0) ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No members yet</p>
            {canAddMembers && (
              <button onClick={() => setAddMemberModal(true)} className="mt-3 text-sm text-blue-500 hover:underline">
                Add the first member
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {event.members.map((m) => {
              const isHead = event.headId?._id === m._id || event.headId === m._id;
              return (
                <div key={m._id} className={`flex items-center justify-between p-3 border rounded-lg ${isHead ? 'border-purple-200 bg-purple-50' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${isHead ? 'bg-purple-500' : 'bg-blue-500'}`}>
                      {m.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{m.name}</p>
                        {isHead && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-purple-200 text-purple-800 rounded-full font-semibold">
                            HEAD
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{m.email}</p>
                    </div>
                  </div>
                  {canAddMembers && !isHead && (
                    <button onClick={() => removeMember(m._id, m.name)}
                      className="text-xs text-red-500 hover:underline flex-shrink-0 ml-2">
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Admin Actions */}
      {canManage && (
        <div className="bg-white p-5 rounded-xl border border-gray-200">
          <h3 className="font-semibold mb-4">Admin Actions</h3>
          <div className="flex flex-wrap gap-3">
            <button onClick={openEditModal} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 flex items-center gap-2">
              <Settings size={14} /> Edit Event
            </button>
            <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Close Event</button>
            <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Export Report</button>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {addMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAddMemberModal(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold">Add Member</h3>
                <p className="text-sm text-gray-500">to {event.title}</p>
              </div>
              <button onClick={() => setAddMemberModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-3">
                <Search className="w-4 h-4 text-gray-400" />
                <input type="text" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="flex-1 bg-transparent border-none outline-none text-sm" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {eligibleUsers.length === 0 ? (
                <p className="text-center text-gray-500 py-8 text-sm">
                  {memberSearch ? 'No users match your search' : 'No users available to add'}
                </p>
              ) : eligibleUsers.map((u) => (
                <div key={u._id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {u.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${u.role === 'T1_VOLUNTEER' ? 'bg-green-100 text-green-700' :
                      u.role === 'T2_ASSOCIATE' ? 'bg-blue-100 text-blue-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                      {u.role.replace('_', ' ')}
                    </span>
                  </div>
                  <button onClick={() => addMember(u._id)} disabled={saving}
                    className="px-3 py-1.5 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600 disabled:opacity-50 flex-shrink-0 ml-2">
                    + Add
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs text-gray-500">
                Current: {event.memberCount || event.members?.length || 0} members
              </span>
              <button onClick={() => setAddMemberModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT EVENT MODAL */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditModal(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold">Edit Event</h3>
              <button onClick={() => setEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={saveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Event Title *</label>
                <input required value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Date *</label>
                  <input type="date" required value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Location *</label>
                  <input required value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Event Head *</label>
                <select value={editForm.headId} onChange={(e) => setEditForm({ ...editForm, headId: e.target.value })}
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500">
                  <option value="">Select an event head...</option>
                  {users.filter((u) => ['T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'].includes(u.role)).map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name} — {u.role.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Description</label>
                <textarea rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full p-3 rounded-lg border border-gray-200 outline-none resize-none focus:border-blue-500" />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setEditModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg">Cancel</button>
                <button type="submit" disabled={savingEdit}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50">
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ====================================================================
// PROFILE
// ====================================================================
export const ProfilePage = () => {
  const { user, updateUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: '',
    bio: '',
    skills: '',
    availability: '',
  });

  const [emailModal, setEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [showEmailPwd, setShowEmailPwd] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState('');
  const [emailError, setEmailError] = useState('');

  const handleChangeEmail = async (e) => {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');

    if (!newEmail?.includes('@')) {
      setEmailError('Please enter a valid email address');
      return;
    }
    if (newEmail.trim().toLowerCase() === (form.email || '').toLowerCase()) {
      setEmailError('New email must be different from current email');
      return;
    }

    setEmailSaving(true);
    try {
      const res = await api.post('/auth/change-email', {
        newEmail: newEmail.trim(),
        currentPassword: emailPassword,
      });
      const updatedEmail = res.data.data.email;
      setForm((prev) => ({ ...prev, email: updatedEmail }));
      if (updateUser) updateUser({ email: updatedEmail });
      setEmailSuccess('Email updated successfully! Security alerts have been dispatched to both addresses.');
      setTimeout(() => {
        setEmailModal(false);
        setEmailSuccess('');
        setNewEmail('');
        setEmailPassword('');
      }, 2000);
    } catch (err) {
      setEmailError(err.response?.data?.message || err.message || 'Failed to update email');
    } finally {
      setEmailSaving(false);
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/auth/profile');
        if (res.data?.data) {
          const u = res.data.data;
          setForm({
            name: u.name || '',
            email: u.email || '',
            phone: u.phone || '',
            bio: u.bio || '',
            skills: u.skills || '',
            availability: u.availability || '',
          });
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      }
    };
    fetchProfile();
  }, []);

  const [pwdForm, setPwdForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdError, setPwdError] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      await api.patch('/auth/profile', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setSaveError(err.response?.data?.message || err.message || 'Failed to update details');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');

    if (pwdForm.newPassword.length < 8) {
      setPwdError('Password must be at least 8 characters long');
      return;
    }
    if (!/[A-Z]/.test(pwdForm.newPassword) || !/[a-z]/.test(pwdForm.newPassword) || !/\d/.test(pwdForm.newPassword) || !/[^A-Za-z0-9]/.test(pwdForm.newPassword)) {
      setPwdError('Password must contain an uppercase letter, lowercase letter, number, and special character');
      return;
    }
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      setPwdError('New passwords do not match');
      return;
    }
    if (pwdForm.newPassword === pwdForm.oldPassword) {
      setPwdError('New password must differ from current password');
      return;
    }

    setPwdSaving(true);
    try {
      await api.post('/auth/change-password', {
        oldPassword: pwdForm.oldPassword,
        newPassword: pwdForm.newPassword,
      });
      setPwdSuccess('Password updated successfully!');
      setPwdForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPwdSuccess(''), 4000);
    } catch (err) {
      setPwdError(err.response?.data?.message || err.message || 'Failed to update password');
    } finally {
      setPwdSaving(false);
    }
  };

  const cfg = ROLES[user.role];
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="text-gray-500">Manage your account information and security</p>
      </div>

      {user.role === 'ADMIN' && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-800 text-sm">
          <Info className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <span className="font-semibold">Daily Edit Limit Active:</span> As an Administrator, your profile details, password, and email address can each be updated once per 24 hours.
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold" style={{ backgroundColor: cfg.color }}>
            {user.name.charAt(0)}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{user.name}</h2>
            <p className="text-sm text-gray-500">{user.email}</p>
            <span className="inline-block mt-2 text-xs px-2 py-1 rounded-full font-medium text-white" style={{ backgroundColor: cfg.color }}>{cfg.label}</span>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-5">Account Information</h3>

        {saveError && (
          <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Full Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium">Email</label>
                <button
                  type="button"
                  onClick={() => {
                    setEmailModal(true);
                    setNewEmail('');
                    setEmailPassword('');
                    setEmailError('');
                    setEmailSuccess('');
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-semibold hover:underline flex items-center gap-1"
                >
                  <Mail size={13} /> Change Email
                </button>
              </div>
              <input value={form.email} disabled className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none bg-gray-50 text-gray-600 font-mono text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Availability</label>
              <input value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Skills</label>
            <input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Bio</label>
            <textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="w-full p-3 rounded-lg border border-gray-200 outline-none resize-none focus:border-blue-500" />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {saved && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle size={16} /> Saved successfully</span>}
          </div>
        </form>
      </div>

      {/* Security & Change Password Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-1">
          <Key className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-lg">Change Password</h3>
        </div>
        <p className="text-xs text-gray-500 mb-5">Update your password to keep your account secure</p>

        {pwdSuccess && (
          <div className="p-3 mb-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
            <span>{pwdSuccess}</span>
          </div>
        )}

        {pwdError && (
          <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{pwdError}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Current Password</label>
            <div className="relative">
              <input
                type={showOldPwd ? 'text' : 'password'}
                required
                value={pwdForm.oldPassword}
                onChange={(e) => setPwdForm({ ...pwdForm, oldPassword: e.target.value })}
                placeholder="Enter your current password"
                className="w-full h-11 px-3 pr-10 rounded-lg border border-gray-200 outline-none focus:border-blue-500 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowOldPwd(!showOldPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showOldPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">New Password</label>
              <div className="relative">
                <input
                  type={showNewPwd ? 'text' : 'password'}
                  required
                  value={pwdForm.newPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                  placeholder="At least 8 characters"
                  className="w-full h-11 px-3 pr-10 rounded-lg border border-gray-200 outline-none focus:border-blue-500 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd(!showNewPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNewPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirmPwd ? 'text' : 'password'}
                  required
                  value={pwdForm.confirmPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                  placeholder="Re-enter new password"
                  className="w-full h-11 px-3 pr-10 rounded-lg border border-gray-200 outline-none focus:border-blue-500 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-xs text-gray-500 space-y-1">
            <p className="font-semibold text-gray-600">Password requirements:</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className={pwdForm.newPassword.length >= 8 ? 'text-green-600 font-medium' : ''}>• At least 8 characters</span>
              <span className={/[A-Z]/.test(pwdForm.newPassword) ? 'text-green-600 font-medium' : ''}>• Uppercase letter</span>
              <span className={/[a-z]/.test(pwdForm.newPassword) ? 'text-green-600 font-medium' : ''}>• Lowercase letter</span>
              <span className={/\d/.test(pwdForm.newPassword) ? 'text-green-600 font-medium' : ''}>• Number (0-9)</span>
              <span className={/[^A-Za-z0-9]/.test(pwdForm.newPassword) ? 'text-green-600 font-medium' : ''}>• Special character (!@#$%^&*)</span>
              <span className={pwdForm.newPassword && pwdForm.newPassword === pwdForm.confirmPassword ? 'text-green-600 font-medium' : ''}>• Passwords match</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={pwdSaving}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition"
            >
              <Key size={16} />
              {pwdSaving ? 'Updating Password...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Change Email Modal */}
      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEmailModal(false)} />
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold truncate">Change Email Address</h3>
                <p className="text-xs text-gray-500">Update your primary login email</p>
              </div>
            </div>

            {emailSuccess && (
              <div className="p-3 mb-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                <span>{emailSuccess}</span>
              </div>
            )}

            {emailError && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{emailError}</span>
              </div>
            )}

            <form onSubmit={handleChangeEmail} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Current Email</label>
                <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-sm font-mono text-gray-600">
                  {form.email}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">New Email Address *</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="newemail@domain.com"
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Current Password *</label>
                <div className="relative">
                  <input
                    type={showEmailPwd ? 'text' : 'password'}
                    required
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    placeholder="Enter current password to verify"
                    className="w-full h-11 px-3 pr-10 rounded-lg border border-gray-200 outline-none focus:border-blue-500 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEmailPwd(!showEmailPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showEmailPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Required to verify your identity</p>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700">
                <p className="font-semibold mb-1">Security Notice:</p>
                <p>Notification emails will be automatically sent to both your old and new email addresses confirming this update.</p>
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setEmailModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={emailSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center gap-2"
                >
                  <Mail size={14} />
                  {emailSaving ? 'Updating...' : 'Update Email Address'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


export const LandingPage = () => {
  const navigate = useNavigate();

  const features = [
    { icon: Users, title: 'Role-Based Dashboards', desc: 'Separate interfaces for Super Admin, Admin, T3 Executives, T2 Associates, and T1 Volunteers.' },
    { icon: Calendar, title: 'Event Management', desc: 'Create events, assign Event Heads, and manage teams with auto-created chat rooms.' },
    { icon: MessageSquare, title: 'Real-Time Chat', desc: 'Instant team communication with Socket.io. Messages delivered live across all members.' },
    { icon: QrCode, title: 'QR Check-In', desc: 'Fast attendance via QR codes. Verified check-in/check-out tracking for every shift.' },
    { icon: Bell, title: 'Live Notifications', desc: 'Get notified instantly when you are added to teams, approved for shifts, or assigned roles.' },
    { icon: BarChart3, title: 'Analytics Dashboard', desc: 'Track participation, approval rates, team performance, and top performers in real time.' },
  ];

  const stats = [
    { value: '5', label: 'Role Tiers' },
    { value: '30+', label: 'Screens' },
    { value: 'Real-time', label: 'Notifications' },
    { value: '100%', label: 'Secure JWT Auth' },
  ];

  return (
    <div className="min-h-screen bg-white">
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/tbi-geu-logo.png"
              alt="TBI-GEU Logo"
              className="w-8 h-8 rounded-full object-contain shadow-sm border border-gray-200"
            />
            <span className="text-xl font-bold text-gray-900 tracking-wide">TBI-GEU</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-gray-600 hover:text-gray-900">Features</a>
            <a href="#how" className="text-sm text-gray-600 hover:text-gray-900">How It Works</a>
            <a href="#stats" className="text-sm text-gray-600 hover:text-gray-900">Impact</a>
          </div>
          <button onClick={() => navigate('/login')} className="px-5 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition">
            Sign In
          </button>
        </div>
      </nav>

      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-white">
        <div className="max-w-7xl mx-auto px-6 py-20 md:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium mb-6">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span>Workforce Management Platform</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-bold text-gray-900 leading-tight mb-6">
                Manage events.<br />Lead teams.<br /><span className="text-blue-500">Track impact.</span>
              </h1>
              <p className="text-lg text-gray-600 mb-8 max-w-lg">
                A unified platform for TBI student engagement and event workforce management. Replace spreadsheets and WhatsApp groups with a single source of truth.
              </p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => navigate('/login')} className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 inline-flex items-center gap-2 shadow-lg shadow-blue-500/20">
                  Get Started
                  <ChevronRight size={18} />
                </button>
                <a href="#features" className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-white">
                  See Features
                </a>
              </div>
            </div>
            <div className="relative">
              <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-100">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <div className="ml-3 text-xs text-gray-400">TBI Workforce Platform</div>
                </div>
                <div className="space-y-3">
                  <div className="h-8 bg-blue-500 rounded-lg w-1/2" />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-16 bg-blue-50 rounded-lg" />
                    <div className="h-16 bg-green-50 rounded-lg" />
                    <div className="h-16 bg-purple-50 rounded-lg" />
                  </div>
                  <div className="h-32 bg-gray-50 rounded-lg" />
                  <div className="flex gap-2">
                    <div className="h-10 bg-blue-500 rounded-lg flex-1" />
                    <div className="h-10 bg-gray-200 rounded-lg w-24" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="stats" className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-3xl md:text-4xl font-bold mb-2">{s.value}</div>
                <div className="text-sm text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="py-20 md:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">Everything you need to run events</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">Built for real-world workforce management, from onboarding to certificates.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div key={i} className="p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition">
                <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-blue-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="py-20 md:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">How it works</h2>
            <p className="text-lg text-gray-600">Four steps from signup to certificate</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { num: '01', title: 'Admin Creates', desc: 'Set up events and assign Event Heads' },
              { num: '02', title: 'T3 Leads', desc: 'Event Head builds teams and adds members' },
              { num: '03', title: 'Members Work', desc: 'Team members check in via QR and coordinate in chat' },
              { num: '04', title: 'Track & Certify', desc: 'Analytics track performance, certificates issued externally' },
            ].map((s, i) => (
              <div key={i}>
                <div className="text-5xl font-bold text-blue-100 mb-3">{s.num}</div>
                <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-gray-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 bg-gradient-to-br from-blue-500 to-indigo-600">
        <div className="max-w-4xl mx-auto px-6 text-center text-white">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Ready to modernize your event workflow?</h2>
          <p className="text-lg text-white/90 mb-8 max-w-2xl mx-auto">Join TBI Admins, Team Leads, and Volunteers using a single platform.</p>
          <button onClick={() => navigate('/login')} className="px-8 py-4 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100 inline-flex items-center gap-2">
            Sign In to Platform
            <ChevronRight size={20} />
          </button>
        </div>
      </section>

      <footer className="bg-gray-900 text-gray-400 py-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2.5">
              <img
                src="/tbi-geu-logo.png"
                alt="TBI-GEU Logo"
                className="w-6 h-6 rounded-full object-contain bg-white p-0.5"
              />
              <span className="text-white font-bold tracking-wide">TBI-GEU</span>
              <span className="text-sm text-gray-400">Workforce Platform</span>
            </div>
            <p className="text-sm">Built for Technology Business Incubators</p>
          </div>
        </div>
      </footer>
    </div>
  );
};


export const ChangePasswordPage = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const checks = {
    length: newPassword.length >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    number: /\d/.test(newPassword),
    special: /[^A-Za-z0-9]/.test(newPassword),
    match: newPassword && newPassword === confirm,
  };
  const allValid = Object.values(checks).every(Boolean);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!allValid) return setError('Please complete all requirements');
    setLoading(true);
    try {
      await api.post('/auth/change-password', { oldPassword, newPassword });
      alert('Password changed successfully. Please login again.');
      logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold">Password Change Required</h1>
            <p className="text-gray-500 mt-2 text-sm">
              You must set a new password before continuing.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2">Current Password</label>
              <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Your temp password"
                className="w-full h-12 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Strong password"
                className="w-full h-12 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Confirm New Password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat new password"
                className="w-full h-12 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" required />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { key: 'length', label: '8+ characters' },
                { key: 'upper', label: '1 uppercase' },
                { key: 'lower', label: '1 lowercase' },
                { key: 'number', label: '1 number' },
                { key: 'special', label: '1 special char' },
                { key: 'match', label: 'Passwords match' },
              ].map((c) => (
                <div key={c.key} className={`flex items-center gap-1.5 ${checks[c.key] ? 'text-green-600' : 'text-gray-400'}`}>
                  {checks[c.key] ? <CheckCircle size={14} /> : <X size={14} />}
                  <span>{c.label}</span>
                </div>
              ))}
            </div>

            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

            <button type="submit" disabled={loading || !allValid}
              className="w-full h-12 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-medium rounded-lg transition">
              {loading ? 'Updating...' : 'Change Password & Continue'}
            </button>

            <button type="button" onClick={() => { logout(); navigate('/login'); }}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700">
              Cancel and logout
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};


// ====================================================================
// PREFERENCES PAGE — Notification settings
// ====================================================================
export const PreferencesPage = () => {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(null);
  const [original, setOriginal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/preferences/me');
        // Ensure new categories have defaults
        const data = res.data.data;
        if (!data.categories.announcement) data.categories.announcement = true;
        if (!data.categories.review) data.categories.review = true;
        setPrefs(data);
        setOriginal(structuredClone(data));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = (key) => {
    if (key.includes('.')) {
      const [parent, child] = key.split('.');
      setPrefs((p) => ({
        ...p,
        [parent]: { ...p[parent], [child]: !p[parent][child] },
      }));
    } else {
      setPrefs((p) => ({ ...p, [key]: !p[key] }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.patch('/preferences/me', prefs);
      setPrefs(res.data.data);
      setOriginal(structuredClone(res.data.data));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = JSON.stringify(prefs) !== JSON.stringify(original);

  if (loading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!prefs?.categories) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Unable to Load Preferences</h2>
          <button onClick={() => window.location.reload()} className="mt-4 px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ROLE-BASED CATEGORIES
  const getCategoriesForRole = (role) => {
    if (role === 'T1_VOLUNTEER' || role === 'T2_ASSOCIATE') {
      return [
        { key: 'application', label: 'My Applications', desc: 'When your applications are approved, rejected, or waitlisted' },
        { key: 'event', label: 'Events', desc: 'New events published and event updates' },
        { key: 'chat', label: 'Chat Rooms', desc: 'When you are added to a chat room' },
        { key: 'attendance', label: 'Attendance', desc: 'Check-in confirmations and reminders' },
        { key: 'announcement', label: 'Announcements', desc: 'Important messages from leads and admins' },
        { key: 'system', label: 'System', desc: 'Role changes and account updates' },
      ];
    }

    if (role === 'T3_EXECUTIVE') {
      return [
        { key: 'application', label: 'Team Applications', desc: 'New applicants to your teams' },
        { key: 'event', label: 'My Events', desc: 'Updates on events you lead or manage' },
        { key: 'chat', label: 'Team Chats', desc: 'Activity in team chat rooms' },
        { key: 'attendance', label: 'Team Attendance', desc: 'Team check-in activity' },
        { key: 'review', label: 'Reviews', desc: 'When you receive or submit reviews' },
        { key: 'announcement', label: 'Announcements', desc: 'Broadcasts from admins' },
        { key: 'system', label: 'System', desc: 'Role changes and account updates' },
      ];
    }

    // Admin / Super Admin
    return [
      { key: 'application', label: 'Applications', desc: 'Application submissions and approvals' },
      { key: 'event', label: 'Events', desc: 'Event creation, updates, and closures' },
      { key: 'chat', label: 'Chat Activity', desc: 'Chat room creation and deletions' },
      { key: 'announcement', label: 'Announcements', desc: 'Broadcasts and team messages' },
      { key: 'system', label: 'System & Security', desc: 'User provisioning, role changes, revocations' },
    ];
  };

  const categories = getCategoriesForRole(user.role);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Notification Preferences</h1>
        <p className="text-gray-500">Control how and when you receive notifications</p>
      </div>

      {/* Master channels */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-5">Delivery Channels</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">In-App Notifications</p>
              <p className="text-xs text-gray-500">Show notifications in the bell icon</p>
            </div>
            <ToggleSwitch checked={prefs.inApp} onChange={() => toggle('inApp')} />
          </div>
          <div className="flex items-center justify-between py-2 border-t border-gray-100 pt-4">
            <div>
              <p className="text-sm font-medium">Email Notifications</p>
              <p className="text-xs text-gray-500">Receive notifications via email</p>
            </div>
            <ToggleSwitch checked={prefs.email} onChange={() => toggle('email')} />
          </div>
          <div className="flex items-center justify-between py-2 border-t border-gray-100 pt-4">
            <div>
              <p className="text-sm font-medium">SMS Notifications</p>
              <p className="text-xs text-gray-500">Receive critical alerts via SMS</p>
            </div>
            <ToggleSwitch checked={prefs.sms} onChange={() => toggle('sms')} />
          </div>
        </div>
      </div>

      {/* Role-based categories */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-2">Notification Types</h3>
        <p className="text-sm text-gray-500 mb-5">
          Categories available for your role: <span className="font-medium text-gray-700">
            {user.role.replace('_', ' ')}
          </span>
        </p>
        <div className="space-y-3">
          {categories.map((c) => (
            <div key={c.key} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
              <div className="flex-1 pr-4">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-xs text-gray-500">{c.desc}</p>
              </div>
              <ToggleSwitch
                checked={prefs.categories[c.key] !== false}
                onChange={() => toggle(`categories.${c.key}`)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 sticky bottom-4">
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
        {hasChanges && (
          <button onClick={() => setPrefs(structuredClone(original))} className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">
            Reset
          </button>
        )}
        {saved && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle size={16} /> Saved
          </span>
        )}
      </div>
    </div>
  );
};

// ====================================================================
// TOGGLE SWITCH — Reusable toggle component
// ====================================================================
export const ToggleSwitch = ({ checked, onChange }) => (
  <button
    type="button"
    onClick={onChange}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-gray-300'
      }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'
        }`}
    />
  </button>
);


// ====================================================================
// ADD USER PAGE — Dedicated page for creating new users
// ====================================================================
export const AddUserPage = () => {
  const navigate = useNavigate();



  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'T1_VOLUNTEER',
  });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/admin/users', form);
      setCreated({
        name: res.data.data.name,
        email: res.data.data.email,
        role: res.data.data.role,
      });
      setForm({ name: '', email: '', phone: '', role: 'T1_VOLUNTEER' });
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const roleOptions = [
    { value: 'T1_VOLUNTEER', label: 'T1 Volunteer', desc: 'Event helper, applies to shifts', icon: 'T1', color: 'bg-green-100 text-green-700 border-green-300' },
    { value: 'T2_ASSOCIATE', label: 'T2 Associate', desc: 'Team coordinator, assists T1s', icon: 'T2', color: 'bg-blue-100 text-blue-700 border-blue-300' },
    { value: 'T3_EXECUTIVE', label: 'T3 Executive', desc: 'Senior lead, manages teams', icon: 'T3', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  ];

  if (created) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">User Created Successfully</h2>
          <p className="text-gray-500 mb-6">
            An email with login credentials has been sent to <strong>{created.email}</strong>
          </p>

          <div className="bg-gray-50 rounded-lg p-4 text-left mb-6 max-w-md mx-auto">
            <div className="flex justify-between py-1.5 border-b border-gray-200">
              <span className="text-xs text-gray-500">Name</span>
              <span className="text-sm font-medium">{created.name}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-200">
              <span className="text-xs text-gray-500">Email</span>
              <span className="text-sm font-medium">{created.email}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-xs text-gray-500">Role</span>
              <span className="text-sm font-medium">{created.role.replace('_', ' ')}</span>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setCreated(null)}
              className="px-5 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600"
            >
              + Add Another User
            </button>
            <button
              onClick={() => navigate('/admin/users')}
              className="px-5 py-2.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
            >
              View All Users
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <button
          onClick={() => navigate('/admin/users')}
          className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-4"
        >
          <ChevronLeft size={16} /> Back to Users
        </button>
        <h1 className="text-2xl font-bold">Add New User</h1>
        <p className="text-gray-500">Create a new account and send credentials via email</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">Full Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Arjun Mehta"
              className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Email Address *</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="arjun@tbi.org"
                className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Phone (optional)</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91 98765 43210"
                className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Assign Role *</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {roleOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, role: opt.value })}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${form.role === opt.value
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                      : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-bold ${opt.color} mb-2`}>
                    {opt.icon}
                  </span>
                  <p className="text-sm font-semibold">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">What happens next?</p>
              <ul className="text-xs space-y-0.5 list-disc list-inside">
                <li>User account is created with a random temporary password</li>
                <li>Credentials are emailed to the user automatically</li>
                <li>User must set a new password on first login (one-time use)</li>
              </ul>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => navigate('/admin/users')}
              className="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50"
            >
              {saving ? 'Creating User...' : 'Create User & Send Credentials'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ====================================================================
// ANNOUNCEMENTS PAGE
// Admin/SA can broadcast to ALL. T3/T2 can broadcast to their teams.
// ====================================================================
export const AnnouncementsPage = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [teams, setTeams] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', message: '', target: 'ALL', targetTeamId: '', targetEventId: '' });
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role);
  const isT3 = user.role === 'T3_EXECUTIVE';
  const isT2 = user.role === 'T2_ASSOCIATE';
  const canCreate = isAdmin || isT3 || isT2;

  // Load announcements + teams + events
  const fetchAll = async () => {
    try {
      const [annRes, teamsRes, eventsRes] = await Promise.all([
        api.get('/announcements'),
        (isT3 || isT2) ? api.get('/teams/me') : api.get('/teams'),
        (isT3 || isT2) ? api.get('/events/me') : api.get('/events'),
      ]);
      setAnnouncements(annRes.data.data);
      setTeams(teamsRes.data.data);
      setEvents(eventsRes.data.data);
    } catch (err) {
      console.error('Load failed:', err);
      setLoadError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // Default target based on role
  useEffect(() => {
    if (isT3 || isT2) {
      setForm((f) => ({ ...f, target: 'TEAM' }));
    } else if (isAdmin) {
      setForm((f) => ({ ...f, target: 'ALL' }));
    }
  }, [user.role]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        message: form.message.trim(),
        target: form.target,
      };

      if (form.target === 'TEAM') {
        if (!form.targetTeamId) throw new Error('Please select a team');
        payload.targetTeamId = form.targetTeamId;
      }
      if (form.target === 'EVENT') {
        if (!form.targetEventId) throw new Error('Please select an event');
        payload.targetEventId = form.targetEventId;
      }

      await api.post('/announcements', payload);
      setModal(false);
      setForm({ title: '', message: '', target: isAdmin ? 'ALL' : 'TEAM', targetTeamId: '', targetEventId: '' });
      await fetchAll();
      alert('Announcement sent successfully');
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to send');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      await api.delete(`/announcements/${id}`);
      setAnnouncements(announcements.filter((a) => a._id !== id));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed');
    }
  };

  const targetLabel = (ann) => {
    if (ann.target === 'ALL') return 'Everyone';
    if (ann.target === 'TEAM') return `Team: ${ann.targetTeamName || 'Unknown'}`;
    if (ann.target === 'EVENT') return `Event: ${ann.targetEventTitle || 'Unknown'}`;
    return ann.target;
  };

  if (loading) return <SkeletonTable rows={4} cols={3} />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Announcements</h1>
          <p className="text-gray-500">
            {isAdmin ? 'Broadcast messages to everyone or specific events' :
              'Send messages to your team'}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setModal(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 flex items-center gap-2"
          >
            <Plus size={16} /> New Announcement
          </button>
        )}
      </div>

      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          Failed to load: {loadError}
        </div>
      )}

      {announcements.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No announcements yet</h3>
          {canCreate && (
            <button onClick={() => setModal(true)} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
              Send First Announcement
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a._id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold">{a.title}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                      {targetLabel(a)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    By {a.createdByName} ({a.createdByRole.replace('_', ' ')}) / {new Date(a.createdAt).toLocaleString()}
                  </p>
                </div>
                {(a.createdBy === user._id || isAdmin) && (
                  <button onClick={() => handleDelete(a._id)} className="text-red-500 hover:underline text-xs flex-shrink-0 ml-2">
                    Delete
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{a.message}</p>
              <p className="text-xs text-gray-400 mt-3">
                Sent to {a.recipientCount} {a.recipientCount === 1 ? 'person' : 'people'}
              </p>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModal(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold">New Announcement</h3>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Title *</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Shift schedule updated"
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Message *</label>
                <textarea
                  required
                  rows={4}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Type your message..."
                  className="w-full p-3 rounded-lg border border-gray-200 outline-none resize-none focus:border-blue-500"
                />
              </div>

              {/* ADMIN / SUPER ADMIN TARGET OPTIONS */}
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Send To *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, target: 'ALL', targetTeamId: '', targetEventId: '' })}
                      className={`p-4 rounded-lg border-2 text-left transition ${form.target === 'ALL'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      <Users className="w-5 h-5 text-blue-500 mb-2" />
                      <p className="text-sm font-semibold">Everyone</p>
                      <p className="text-xs text-gray-500 mt-0.5">All active users</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, target: 'EVENT', targetTeamId: '', targetEventId: '' })}
                      className={`p-4 rounded-lg border-2 text-left transition ${form.target === 'EVENT'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      <Calendar className="w-5 h-5 text-purple-500 mb-2" />
                      <p className="text-sm font-semibold">Specific Event</p>
                      <p className="text-xs text-gray-500 mt-0.5">Event members only</p>
                    </button>
                  </div>
                </div>
              )}

              {/* EVENT SELECTOR (when target = EVENT) */}
              {isAdmin && form.target === 'EVENT' && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Select Event *</label>
                  <select
                    required
                    value={form.targetEventId}
                    onChange={(e) => setForm({ ...form, targetEventId: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500"
                  >
                    <option value="">Choose an event...</option>
                    {events.map((ev) => (
                      <option key={ev._id} value={ev._id}>
                        {ev.title} {ev.date ? `(${ev.date})` : ''}
                      </option>
                    ))}
                  </select>
                  {events.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">No events available yet</p>
                  )}
                </div>
              )}

              {/* TEAM SELECTOR (for T3/T2) */}
              {(isT3 || isT2) && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Send To Team *</label>
                  <select
                    required
                    value={form.targetTeamId}
                    onChange={(e) => setForm({ ...form, target: 'TEAM', targetTeamId: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500"
                  >
                    <option value="">Select a team...</option>
                    {teams.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name} {t.eventTitle ? `- ${t.eventTitle}` : ''}
                      </option>
                    ))}
                  </select>
                  {teams.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      You aren't part of any team yet. Ask your Admin to add you to a team.
                    </p>
                  )}
                </div>
              )}

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-start gap-2">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <span>Recipients will get an instant in-app notification.</span>
              </div>

              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50"
                >
                  {saving ? 'Sending...' : 'Send Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


// ====================================================================
// ANNOUNCEMENT POPUP — Shows unread announcements on login
// ====================================================================
export const AnnouncementPopup = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;

    const checkKey = `announcements_shown_${user._id}_${new Date().toDateString()}`;
    const alreadyShown = sessionStorage.getItem(checkKey);
    if (alreadyShown) return;

    const fetchUnread = async () => {
      try {
        const res = await api.get('/announcements');
        const list = res.data.data || [];
        // Show only last 24 hours of announcements
        const recent = list.filter((a) => {
          const created = new Date(a.createdAt).getTime();
          const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
          return created > dayAgo;
        }).slice(0, 5);

        if (recent.length > 0) {
          setAnnouncements(recent);
          setCurrentIndex(0);
          setVisible(true);
          sessionStorage.setItem(checkKey, 'true');
        }
      } catch (err) {
        // Silent fail — don't block the app
      }
    };

    // Small delay so the app can load
    setTimeout(fetchUnread, 800);
  }, [user]);

  if (!visible || announcements.length === 0) return null;

  const current = announcements[currentIndex];
  const isLast = currentIndex === announcements.length - 1;

  const handleNext = () => {
    if (isLast) {
      setVisible(false);
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleDismiss = () => setVisible(false);

  const targetLabel = (a) => {
    if (a.target === 'ALL') return 'Everyone';
    if (a.target === 'TEAM') return `Team: ${a.targetTeamName || ''}`;
    if (a.target === 'EVENT') return `Event: ${a.targetEventTitle || ''}`;
    return a.target;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleDismiss} />

      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 text-white">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Bell className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider opacity-90 font-medium">
                  {announcements.length > 1 ? `Announcement ${currentIndex + 1} of ${announcements.length}` : 'Announcement'}
                </p>
                <p className="font-semibold text-lg">You have new updates</p>
              </div>
            </div>
            <button onClick={handleDismiss} className="text-white/70 hover:text-white">
              <X size={20} />
            </button>
          </div>
          <div className="inline-block text-xs bg-white/20 px-2 py-1 rounded-full font-medium">
            {targetLabel(current)}
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-3">{current.title}</h3>

          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line mb-5">
            {current.message}
          </p>

          <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900">{current.createdByName}</p>
              <p className="text-[11px] text-gray-500">
                {current.createdByRole.replace('_', ' ')} / {new Date(current.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between gap-3">
          {/* Dots indicator */}
          {announcements.length > 1 && (
            <div className="flex gap-1.5">
              {announcements.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === currentIndex ? 'w-6 bg-blue-500' : 'w-1.5 bg-gray-300'
                    }`}
                />
              ))}
            </div>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              Dismiss
            </button>
            <button
              onClick={handleNext}
              className="px-5 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 text-sm"
            >
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ====================================================================
// TIMESHEET PAGE — Role-aware (Member submits, T3 reviews, Admin sees all)
// ====================================================================
export const TimesheetPage = () => {
  const { user } = useAuth();
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role);
  const isLead = user.role === 'T3_EXECUTIVE';
  const isMember = ['T1_VOLUNTEER', 'T2_ASSOCIATE', 'T3_EXECUTIVE'].includes(user.role);

  const [tab, setTab] = useState(isMember ? 'my' : 'all');
  const [myTimesheets, setMyTimesheets] = useState([]);
  const [myStats, setMyStats] = useState(null);
  const [reviewTeams, setReviewTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamTimesheets, setTeamTimesheets] = useState([]);
  const [allTimesheets, setAllTimesheets] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    teamId: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    taskDescription: '',
  });
  const [saving, setSaving] = useState(false);

  const totalHoursPreview = (() => {
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    let m = (eh * 60 + em) - (sh * 60 + sm);
    if (m < 0) m += 1440;
    m -= form.breakMinutes || 0;
    return Math.max(0, Math.round((m / 60) * 100) / 100);
  })();

  const fetchMine = async () => {
    try {
      const [listRes, statsRes, teamsRes] = await Promise.all([
        api.get('/timesheets/me?days=30'),
        api.get('/timesheets/my-stats?days=30'),
        api.get('/teams/me'),
      ]);
      setMyTimesheets(listRes.data.data);
      setMyStats(statsRes.data.data);
      setTeams(teamsRes.data.data);
      if (teamsRes.data.data.length > 0 && !form.teamId) {
        setForm((f) => ({ ...f, teamId: teamsRes.data.data[0]._id }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTeam = async () => {
    if (!selectedTeamId) return;
    try {
      const res = await api.get(`/timesheets/team?teamId=${selectedTeamId}`);
      setTeamTimesheets(res.data.data);
    } catch (err) { console.error(err); }
  };

  const fetchAll = async () => {
    try {
      const res = await api.get('/timesheets/all');
      setAllTimesheets(res.data.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    (async () => {
      if (isMember) await fetchMine();
      if (isLead || isAdmin) {
        try {
          const t = await api.get('/timesheets/teams/reviewable');
          setReviewTeams(t.data.data);
          if (t.data.data.length > 0) setSelectedTeamId(t.data.data[0]._id);
        } catch { }
      }
      if (isAdmin) await fetchAll();
      setLoading(false);
    })();
  }, [user.role]);

  useEffect(() => { if (tab === 'team') fetchTeam(); }, [selectedTeamId, tab]);
  useEffect(() => { if (tab === 'all' && isAdmin) fetchAll(); }, [tab]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/timesheets', form);
      setModal(false);
      setForm({
        teamId: teams[0]?._id || '',
        date: new Date().toISOString().split('T')[0],
        startTime: '09:00',
        endTime: '17:00',
        breakMinutes: 30,
        taskDescription: '',
      });
      await fetchMine();
      alert('Timesheet submitted');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id, status) => {
    let rejectionReason;
    if (status === 'rejected') {
      rejectionReason = prompt('Reason for rejection:');
      if (!rejectionReason) return;
    }
    try {
      await api.patch(`/timesheets/${id}/status`, { status, rejectionReason });
      if (tab === 'team') await fetchTeam();
      if (tab === 'all') await fetchAll();
      if (tab === 'my') await fetchMine();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed');
    }
  };

  const deleteEntry = async (id) => {
    if (!confirm('Delete this timesheet?')) return;
    try {
      await api.delete(`/timesheets/${id}`);
      await fetchMine();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed');
    }
  };

  const statusColor = {
    submitted: 'bg-amber-100 text-amber-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    draft: 'bg-gray-100 text-gray-700',
  };

  if (loading) return <SkeletonTable rows={5} cols={6} />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Timesheets</h1>
          <p className="text-gray-500">
            {isMember && 'Log your working hours'}
            {isLead && 'Review your team timesheets'}
            {isAdmin && 'All timesheets across the platform'}
          </p>
        </div>
        {isMember && (
          <button onClick={() => setModal(true)} className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 flex items-center gap-2">
            <Plus size={16} /> Submit Timesheet
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {isMember && (
          <button onClick={() => setTab('my')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'my' ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}>
            My Timesheets
          </button>
        )}
        {isLead && (
          <button onClick={() => setTab('team')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'team' ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}>
            Team Timesheets
          </button>
        )}
        {isAdmin && (
          <button onClick={() => setTab('all')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'all' ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}>
            All Timesheets
          </button>
        )}
      </div>

      {/* ============ MY TAB ============ */}
      {tab === 'my' && isMember && (
        <>
          {myStats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi label="Total Hours (30d)" value={myStats.totalHours} />
              <Kpi label="Approved" value={myStats.approved} />
              <Kpi label="Pending" value={myStats.pending} />
              <Kpi label="Rejected" value={myStats.rejected} />
            </div>
          )}

          {myTimesheets.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No timesheets yet</h3>
              <button onClick={() => setModal(true)} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
                Submit your first
              </button>
            </div>
          ) : (
            <TimesheetTable
              rows={myTimesheets}
              statusColor={statusColor}
              onDelete={deleteEntry}
              showUser={false}
            />
          )}
        </>
      )}

      {/* ============ TEAM TAB ============ */}
      {tab === 'team' && isLead && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1.5">Team</label>
            <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)} className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500">
              {reviewTeams.map((t) => (
                <option key={t._id} value={t._id}>{t.name} — {t.eventTitle}</option>
              ))}
            </select>
          </div>

          {teamTimesheets.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No timesheets from this team yet</p>
            </div>
          ) : (
            <TimesheetTable
              rows={teamTimesheets}
              statusColor={statusColor}
              onApprove={(id) => updateStatus(id, 'approved')}
              onReject={(id) => updateStatus(id, 'rejected')}
              showUser={true}
            />
          )}
        </>
      )}

      {/* ============ ALL TAB (Admin) ============ */}
      {tab === 'all' && isAdmin && (
        <>
          {allTimesheets.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No timesheets yet</p>
            </div>
          ) : (
            <TimesheetTable
              rows={allTimesheets}
              statusColor={statusColor}
              onApprove={(id) => updateStatus(id, 'approved')}
              onReject={(id) => updateStatus(id, 'rejected')}
              showUser={true}
            />
          )}
        </>
      )}

      {/* Submit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModal(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold">Submit Timesheet</h3>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Team</label>
                <select required value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })} className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500">
                  <option value="">Select a team...</option>
                  {teams.map((t) => (<option key={t._id} value={t._id}>{t.name}{t.eventTitle ? ` — ${t.eventTitle}` : ''}</option>))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Date</label>
                <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Start</label>
                  <input type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">End</label>
                  <input type="time" required value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Break (min)</label>
                  <input type="number" min="0" max="480" value={form.breakMinutes} onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) })}
                    className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-blue-500" />
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                <span className="text-sm font-medium text-blue-800">Calculated hours:</span>
                <span className="text-lg font-bold text-blue-700">{totalHoursPreview}h</span>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Task Description *</label>
                <textarea required rows={4} value={form.taskDescription} onChange={(e) => setForm({ ...form, taskDescription: e.target.value })}
                  placeholder="What did you work on?"
                  className="w-full p-3 rounded-lg border border-gray-200 outline-none resize-none focus:border-blue-500" />
              </div>

              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50">
                  {saving ? 'Submitting...' : 'Submit Timesheet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Reusable table
const TimesheetTable = ({ rows, statusColor, showUser, onApprove, onReject, onDelete }) => (
  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
            {showUser && <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">User</th>}
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Time</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Hours</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Task</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((t) => (
            <tr key={t._id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">{t.date}</td>
              {showUser && (
                <td className="px-4 py-3">
                  <p className="text-sm font-medium">{t.userName}</p>
                  <p className="text-xs text-gray-500">{t.userRole?.replace('_', ' ')}</p>
                </td>
              )}
              <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{t.startTime} – {t.endTime}</td>
              <td className="px-4 py-3 text-sm font-medium text-blue-600 whitespace-nowrap">{t.totalHours}h</td>
              <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                <p className="truncate" title={t.taskDescription}>{t.taskDescription}</p>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[t.status]}`}>{t.status}</span>
              </td>
              <td className="px-4 py-3 text-sm">
                <div className="flex gap-2 flex-wrap">
                  {onApprove && t.status === 'submitted' && (
                    <>
                      <button onClick={() => onApprove(t._id)} className="text-xs text-green-600 hover:underline font-medium">Approve</button>
                      <button onClick={() => onReject(t._id)} className="text-xs text-red-600 hover:underline font-medium">Reject</button>
                    </>
                  )}
                  {onDelete && t.status !== 'approved' && (
                    <button onClick={() => onDelete(t._id)} className="text-xs text-red-500 hover:underline font-medium">Delete</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ====================================================================
// RESET PASSWORD PAGE — public page accessed via one-time admin link
// Route: /reset-password?token=xxx&id=xxx
// ====================================================================
export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get('token');
  const id = searchParams.get('id');

  const [status, setStatus] = useState('verifying'); // verifying | valid | invalid | success
  const [userInfo, setUserInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const checks = {
    length: newPassword.length >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    number: /\d/.test(newPassword),
    special: /[^A-Za-z0-9]/.test(newPassword),
    match: newPassword && newPassword === confirmPassword,
  };
  const allValid = Object.values(checks).every(Boolean);

  // Verify token on mount
  React.useEffect(() => {
    if (!token || !id) {
      setStatus('invalid');
      setErrorMsg('This reset link is missing required parameters. Please request a new link from your administrator.');
      return;
    }
    const verify = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/reset-password/verify?token=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (data.success) {
          setUserInfo(data.data);
          setStatus('valid');
        } else {
          setStatus('invalid');
          setErrorMsg(data.message || 'This reset link is invalid or has already been used.');
        }
      } catch {
        setStatus('invalid');
        setErrorMsg('Unable to verify the reset link. Please check your connection and try again.');
      }
    };
    verify();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!allValid) { setFormError('Please meet all password requirements.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/reset-password/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, id, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('success');
      } else {
        setFormError(data.message || 'Failed to reset password. The link may have already been used.');
      }
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ---- Verifying state ----
  if (status === 'verifying') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Verifying your reset link…</p>
        </div>
      </div>
    );
  }

  // ---- Invalid / expired token ----
  if (status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Link Invalid or Expired</h1>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">{errorMsg}</p>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 mb-6">
            Reset links expire after <strong>1 hour</strong> and can only be used <strong>once</strong>. Please ask your administrator to send a new reset link.
          </div>
          <button onClick={() => navigate('/login')}
            className="w-full h-11 bg-gray-900 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors">
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // ---- Success state ----
  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Password Reset Successful!</h1>
          <p className="text-gray-500 text-sm mb-8">
            Your password has been updated. You can now log in with your new password.
          </p>
          <button onClick={() => navigate('/login', { replace: true })}
            className="w-full h-11 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // ---- Valid token — show form ----
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-500 to-red-500 px-8 py-7 text-center">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-white">Reset Your Password</h1>
            {userInfo && (
              <p className="text-white/80 text-sm mt-1">
                Setting new password for <strong>{userInfo.name}</strong>
              </p>
            )}
          </div>

          <div className="px-8 py-7">
            <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>This is a <strong>one-time link</strong>. After submitting, this link will no longer work.</span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                <input
                  id="reset-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
                <input
                  id="reset-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your new password"
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition"
                  required
                />
              </div>

              {/* Password strength checklist */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'length', label: '8+ characters' },
                  { key: 'upper', label: 'Uppercase letter' },
                  { key: 'lower', label: 'Lowercase letter' },
                  { key: 'number', label: 'Number' },
                  { key: 'special', label: 'Special character' },
                  { key: 'match', label: 'Passwords match' },
                ].map((c) => (
                  <div key={c.key} className={`flex items-center gap-1.5 text-xs ${checks[c.key] ? 'text-green-600' : 'text-gray-400'}`}>
                    {checks[c.key] ? <CheckCircle size={13} /> : <X size={13} />}
                    <span>{c.label}</span>
                  </div>
                ))}
              </div>

              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                id="reset-submit-btn"
                disabled={loading || !allValid}
                className="w-full h-11 bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-600 hover:to-red-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-all"
              >
                {loading ? 'Setting Password…' : 'Set New Password'}
              </button>

              <button type="button" onClick={() => navigate('/login')}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition">
                Cancel — go to Login
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
