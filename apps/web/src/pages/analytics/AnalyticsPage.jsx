import React, { useState, useEffect } from 'react';
import {
  PieChart, Pie, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import api from '../../lib/api';
import { Kpi, Skeleton, SkeletonCard } from '../../components/common/CommonUI';

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
    { name: 'T1', value: tiers?.T1 || 0, color: '#059669', fill: '#059669' },
    { name: 'T2', value: tiers?.T2 || 0, color: '#0284C7', fill: '#0284C7' },
    { name: 'T3', value: tiers?.T3 || 0, color: '#7C3AED', fill: '#7C3AED' },
    { name: 'Admin', value: (tiers?.Admin || 0) + (tiers?.SuperAdmin || 0), color: '#DC2626', fill: '#DC2626' },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-gray-500">Insights and trends across the platform</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total Users" value={stats?.totalUsers ?? 0} />
        <Kpi label="Active Events" value={stats?.activeEvents ?? 0} />
        <Kpi label="Approval Rate" value={`${stats?.approvalRate ?? 0}%`} />
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

export default AnalyticsPage;
