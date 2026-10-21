import React, { useState, useEffect } from 'react';
import {
  AlertTriangle, Plus, CheckCircle, Trash2, Download,
  RefreshCw, AlertCircle, CheckCircle2, FileText, X
} from 'lucide-react';
import { useAuth } from '../../pages';
import api from '../../lib/api';

export const IncidentsTab = ({ canExport = false }) => {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Employees for dropdown
  const [employees, setEmployees] = useState([]);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [activeIncidentId, setActiveIncidentId] = useState(null);

  // Forms
  const [createForm, setCreateForm] = useState({
    employeeId: '',
    feedbackType: 'POSITIVE',
    severity: 'LOW',
    title: '',
    narrative: '',
  });
  const [resolveNotes, setResolveNotes] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchIncidents = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/hr/incidents');
      setIncidents(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
    // Load members for dropdown based on user role
    const userEndpoint = user?.role === 'T3_EXECUTIVE' ? '/teams/me/members' : '/admin/users';
    const currentUserId = user?.sub || user?._id || user?.id;
    api.get(userEndpoint)
      .then((res) => {
        const rawEmps = Array.isArray(res.data?.data) ? res.data.data : [];
        const emps = rawEmps.filter((e) => (e._id || e.id)?.toString() !== currentUserId?.toString());
        setEmployees(emps);
        if (emps.length > 0) {
          setCreateForm((prev) => ({ ...prev, employeeId: emps[0]._id || emps[0].id }));
        }
      })
      .catch(() => {});
  }, [user]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/hr/incidents', {
        employeeId: createForm.employeeId,
        feedbackType: createForm.feedbackType,
        severity: createForm.severity,
        title: createForm.title.trim(),
        narrative: createForm.narrative.trim(),
      });
      setSuccess('Incident report logged successfully.');
      setCreateModalOpen(false);
      setCreateForm((prev) => ({ ...prev, title: '', narrative: '' }));
      fetchIncidents();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to log incident report');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError('');
    try {
      await api.post(`/hr/incidents/${activeIncidentId}/resolve`, {
        resolutionNotes: resolveNotes.trim(),
      });
      setSuccess('Incident resolved successfully.');
      setResolveModalOpen(false);
      setResolveNotes('');
      fetchIncidents();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resolve incident');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError('');
    try {
      await api.delete(`/hr/incidents/${activeIncidentId}`, {
        data: { deletedReason: deleteReason.trim() },
      });
      setSuccess('Incident record deleted.');
      setDeleteModalOpen(false);
      setDeleteReason('');
      fetchIncidents();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete incident');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const res = await api.get('/hr/export/incidents', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'incidents.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Failed to download CSV export');
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

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">Incident & Quick Feedback Reports</h3>
        <div className="flex items-center gap-2">
          {canExport && (
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          )}
          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Incident</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-8 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          <span className="text-xs">Loading incident reports...</span>
        </div>
      ) : incidents.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500">No incident reports recorded.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map((inc) => (
            <div
              key={inc._id}
              className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2 text-xs"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        inc.feedbackType === 'POSITIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : inc.feedbackType === 'NEGATIVE'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {inc.feedbackType}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        inc.severity === 'CRITICAL'
                          ? 'bg-red-600 text-white'
                          : inc.severity === 'HIGH'
                          ? 'bg-orange-500 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {inc.severity}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">{inc.date}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">{inc.title}</h4>
                  <p className="text-slate-500 text-[11px]">
                    Member: <strong className="text-slate-700">{inc.employeeName}</strong> | Logged by:{' '}
                    {inc.loggedByName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {inc.isResolved ? (
                    <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Resolved</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setActiveIncidentId(inc._id);
                        setResolveNotes('');
                        setResolveModalOpen(true);
                      }}
                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold transition cursor-pointer"
                    >
                      Resolve
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setActiveIncidentId(inc._id);
                      setDeleteReason('');
                      setDeleteModalOpen(true);
                    }}
                    className="p-1 text-slate-400 hover:text-red-600 transition"
                    title="Delete record"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">
                {inc.narrative}
              </p>

              {inc.isResolved && inc.resolutionNotes && (
                <div className="bg-emerald-50/60 border border-emerald-100 p-2 rounded-lg text-[11px] text-emerald-900">
                  <strong>Resolution note:</strong> {inc.resolutionNotes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Log Incident Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 border border-slate-200">
            <h4 className="text-sm font-bold text-slate-900 mb-3">Log Incident or Feedback</h4>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Student / Member</label>
                <select
                  required
                  value={createForm.employeeId}
                  onChange={(e) => setCreateForm({ ...createForm, employeeId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600"
                >
                  {employees.map((emp) => (
                    <option key={emp._id || emp.id} value={emp._id || emp.id}>
                      {emp.name} ({emp.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Feedback Type</label>
                  <select
                    value={createForm.feedbackType}
                    onChange={(e) => setCreateForm({ ...createForm, feedbackType: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600"
                  >
                    <option value="POSITIVE">Positive</option>
                    <option value="NEGATIVE">Negative</option>
                    <option value="NEUTRAL">Neutral</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Severity</label>
                  <select
                    value={createForm.severity}
                    onChange={(e) => setCreateForm({ ...createForm, severity: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Title</label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="Short descriptive summary"
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Narrative (Max 2000 chars)</label>
                <textarea
                  rows={4}
                  required
                  maxLength={2000}
                  value={createForm.narrative}
                  onChange={(e) => setCreateForm({ ...createForm, narrative: e.target.value })}
                  placeholder="Detailed factual observation..."
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs transition disabled:opacity-50"
                >
                  {actionLoading ? 'Logging...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {resolveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-slate-200">
            <h4 className="text-sm font-bold text-slate-900 mb-2">Resolve Incident</h4>
            <form onSubmit={handleResolve} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Resolution Notes</label>
                <textarea
                  rows={3}
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  placeholder="Actions taken, agreement reached, counseling completed..."
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResolveModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs transition disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Mark Resolved'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Soft Delete Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-slate-200">
            <h4 className="text-sm font-bold text-slate-900 mb-2 text-rose-600">Delete Incident Report</h4>
            <p className="text-[11px] text-slate-500 mb-3">
              Incident reports are append-only audit records. Deletion requires an audit reason.
            </p>
            <form onSubmit={handleDelete} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Deletion Reason (Required)</label>
                <textarea
                  rows={2}
                  required
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="e.g. Logged under wrong person, duplicate entry..."
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-red-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || deleteReason.trim().length < 3}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg shadow-xs transition disabled:opacity-50"
                >
                  {actionLoading ? 'Deleting...' : 'Confirm Soft Delete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
