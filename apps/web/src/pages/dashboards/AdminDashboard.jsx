import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserPlus, Upload, Calendar, CheckCircle, Users, TrendingUp, FileText
} from 'lucide-react';
import {
  PieChart, Pie, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { AnnouncementBanner, Kpi, Skeleton, SkeletonCard } from '../../components/common/CommonUI';

export const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Good morning, {user?.name ? user.name.split(' ')[0] : 'Admin'}</h1>
          <p className="text-gray-500">Here's what's happening today.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate('/admin/users/new')}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
          >
            <UserPlus size={14} /> Add User
          </button>
          <button
            onClick={() => navigate('/admin/users/bulk')}
            className="px-3.5 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Upload size={14} /> Bulk Import
          </button>
          <button
            onClick={() => navigate('/t3/workforce')}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Calendar size={14} /> Workforce Shifts
          </button>
          <button
            onClick={() => navigate('/t3/approvals')}
            className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <CheckCircle size={14} /> Approvals
          </button>
        </div>
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
                { status: 'Pending', count: stats?.pendingApplications || 0 },
                { status: 'Approved', count: stats?.approvedApplications || 0 },
                { status: 'Rejected', count: stats?.rejectedApplications || 0 },
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

export default AdminDashboard;
