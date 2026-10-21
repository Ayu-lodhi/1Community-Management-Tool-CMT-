import React, { useState, useEffect } from 'react';
import { User, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../pages';
import api from '../../lib/api';

export const ProfilesTab = ({ canManage = false }) => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Masters options
  const [departments, setDepartments] = useState([]);
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);

  // Form
  const [formData, setFormData] = useState({
    department: '',
    post: '',
    category: '',
    joiningDate: '',
    notes: '',
  });

  // Fetch employees list
  useEffect(() => {
    const fetchEmployeesAndMasters = async () => {
      try {
        const userEndpoint = user?.role === 'T3_EXECUTIVE' ? '/teams/me/members' : '/admin/users';
        const currentUserId = user?.sub || user?._id || user?.id;
        const [empRes, deptRes, postRes, catRes] = await Promise.all([
          api.get(userEndpoint).catch(() => ({ data: { data: [] } })),
          api.get('/hr/masters/departments').catch(() => ({ data: { data: [] } })),
          api.get('/hr/masters/posts').catch(() => ({ data: { data: [] } })),
          api.get('/hr/masters/employee-categories').catch(() => ({ data: { data: [] } })),
        ]);

        const rawEmps = Array.isArray(empRes.data?.data) ? empRes.data.data : [];
        const emps = rawEmps.filter((e) => (e._id || e.id)?.toString() !== currentUserId?.toString());
        setEmployees(emps);
        if (emps.length > 0) setSelectedUserId(emps[0]._id || emps[0].id);

        setDepartments(deptRes.data?.data || []);
        setPosts(postRes.data?.data || []);
        setCategories(catRes.data?.data || []);
      } catch (err) {
        setError('Failed to load initial data');
      }
    };
    fetchEmployeesAndMasters();
  }, [user]);

  // Fetch profile when selected user changes
  useEffect(() => {
    if (!selectedUserId) return;
    const fetchProfile = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get(`/hr/profiles/${selectedUserId}`);
        const data = res.data?.data || {};
        setFormData({
          department: data.department?._id || data.department || '',
          post: data.post?._id || data.post || '',
          category: data.category?._id || data.category || '',
          joiningDate: data.joiningDate || '',
          notes: data.notes || '',
        });
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [selectedUserId]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        department: formData.department || null,
        post: formData.post || null,
        category: formData.category || null,
        joiningDate: formData.joiningDate || null,
        notes: formData.notes || '',
      };
      await api.put(`/hr/profiles/${selectedUserId}`, payload);
      setSuccess('HR profile updated successfully.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save HR profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Employee Selector */}
      <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
        <label className="text-xs font-semibold text-slate-700 shrink-0">Select Member:</label>
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="bg-white border border-slate-300 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600 max-w-xs w-full"
        >
          {employees.map((emp) => (
            <option key={emp._id || emp.id} value={emp._id || emp.id}>
              {emp.name} ({emp.role})
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-8 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          <span className="text-xs">Loading employee HR profile...</span>
        </div>
      ) : (
        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4 max-w-xl">
          <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            <span>Employee HR Details</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Department</label>
              <select
                disabled={!canManage}
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600 disabled:opacity-60"
              >
                <option value="">— Unassigned —</option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Post / Job Title</label>
              <select
                disabled={!canManage}
                value={formData.post}
                onChange={(e) => setFormData({ ...formData, post: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600 disabled:opacity-60"
              >
                <option value="">— Unassigned —</option>
                {posts.map((p) => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Category</label>
              <select
                disabled={!canManage}
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600 disabled:opacity-60"
              >
                <option value="">— Unassigned —</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Joining Date</label>
              <input
                type="date"
                disabled={!canManage}
                value={formData.joiningDate}
                onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600 font-mono disabled:opacity-60"
              />
            </div>
          </div>

          <div className="text-xs">
            <label className="block text-slate-700 font-semibold mb-1">Internal HR Notes</label>
            <textarea
              rows={3}
              disabled={!canManage}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Private notes (skills, performance tags, background)..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600 disabled:opacity-60"
            />
          </div>

          {canManage && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};
