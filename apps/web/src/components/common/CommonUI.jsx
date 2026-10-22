import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Construction } from 'lucide-react';
import api from '../../lib/api';

export const Kpi = ({ label, value, change }) => (
  <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-gray-200 hover:shadow-md transition-shadow min-w-0">
    <p className="text-xs sm:text-sm text-gray-500 truncate">{label}</p>
    <p className="text-xl sm:text-2xl md:text-3xl font-bold mt-1 sm:mt-2 truncate text-gray-900">{value}</p>
    {change && <p className="text-[10px] sm:text-xs text-green-500 mt-1">+{change}</p>}
  </div>
);
export const KPI = Kpi;

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
          <p className="font-semibold text-sm">New Announcements</p>
          <p className="text-xs text-indigo-100">You have {count} unread announcement{count > 1 ? 's' : ''}</p>
        </div>
      </div>
      <button
        onClick={() => navigate('/announcements')}
        className="px-3 py-1.5 bg-white text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-50 transition"
      >
        View
      </button>
    </div>
  );
};

export const Placeholder = ({ title }) => (
  <div className="p-12 text-center">
    <Construction className="w-16 h-16 text-gray-300 mb-4" />
    <h2 className="text-2xl font-bold mb-2">{title}</h2>
    <p className="text-gray-500">This page is under construction</p>
  </div>
);

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
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-white p-5 rounded-xl border border-gray-200 space-y-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>
    ))}
  </div>
);
