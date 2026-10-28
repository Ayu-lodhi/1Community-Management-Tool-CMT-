import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Key, ScrollText, Calendar, Lock
} from 'lucide-react';
import {
  PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { AnnouncementBanner, Kpi, Skeleton, SkeletonCard } from '../../components/common/CommonUI';

export const SuperAdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [tiers, setTiers] = useState(null);
  const [trend, setTrend] = useState([]);
  const [monthLock, setMonthLock] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const [statsRes, tiersRes, trendRes, lockRes] = await Promise.all([
          api.get('/stats/super-admin'),
          api.get('/stats/users-by-tier'),
          api.get('/stats/applications-trend'),
          api.get(`/workforce/month-lock/status?month=${currentMonth}`).catch(() => ({ data: { data: null } })),
        ]);
        setStats(statsRes.data.data);
        setTiers(tiersRes.data.data);
        setTrend(trendRes.data.data);
        setMonthLock(lockRes?.data?.data || null);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {user?.name || 'Super Admin'}</h1>
          <p className="text-gray-500">Full system governance, security, and workforce overview.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate('/super-admin/admins')}
            className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
          >
            <Shield size={14} /> System Admins
          </button>
          <button
            onClick={() => navigate('/super-admin/sessions')}
            className="px-3.5 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Key size={14} /> Active Sessions
          </button>
          <button
            onClick={() => navigate('/super-admin/audit')}
            className="px-3.5 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <ScrollText size={14} /> Audit Trail
          </button>
          <button
            onClick={() => navigate('/t3/workforce')}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Calendar size={14} /> Workforce Engine
          </button>
        </div>
      </div>

      {/* Central Month Lock Sentinel */}
      <div className="bg-slate-900 text-white rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${monthLock?.isLocked ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Central Month Lock Status</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${monthLock?.isLocked ? 'bg-red-900/60 text-red-300 border border-red-700/50' : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'}`}>
                {monthLock?.isLocked ? 'LOCKED' : 'OPEN / ACTIVE'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Cycle ({new Date().toISOString().slice(0, 7)}): {monthLock?.isLocked ? `Locked against retroactive changes by ${monthLock.lockedByName || 'Super Admin'}` : 'Attendance and timesheets are editable by leads and team members.'}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/t3/workforce')}
          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
        >
          Manage Lock & Shifts →
        </button>
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

export default SuperAdminDashboard;
