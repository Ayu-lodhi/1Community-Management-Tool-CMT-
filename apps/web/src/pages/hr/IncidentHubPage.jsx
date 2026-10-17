import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, MessageSquare, Plus, CheckCircle2, X, Download,
  Filter, Check, User
} from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../pages';

export const IncidentHubPage = () => {
  const { user } = useAuth();
  const isSupervisor = ['T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role);

  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [members, setMembers] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form modal state
  const [showModal, setShowModal] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const [form, setForm] = useState({
    employeeId: '',
    date: new Date().toISOString().split('T')[0],
    feedbackType: 'POSITIVE',
    title: '',
    narrative: '',
    severity: 'LOW',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      if (isSupervisor) {
        const teamsRes = await api.get('/teams');
        if (teamsRes.data?.data && Array.isArray(teamsRes.data.data)) {
          setTeams(teamsRes.data.data);
          const defaultTeam = selectedTeamId || teamsRes.data.data[0]?._id;
          if (defaultTeam) {
            setSelectedTeamId(defaultTeam);
            const [teamRes, incRes] = await Promise.all([
              api.get(`/teams/${defaultTeam}`),
              api.get(`/hr/incidents/team/${defaultTeam}`),
            ]);
            if (teamRes.data?.data?.members) setMembers(teamRes.data.data.members);
            if (incRes.data?.data) setIncidents(incRes.data.data);
          }
        }
      } else {
        const personalRes = await api.get(`/hr/incidents/member/${user?._id || user?.sub}`);
        if (personalRes.data?.data) setIncidents(personalRes.data.data);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to load incident data');
    } finally {
      setLoading(false);
    }
  }, [isSupervisor, selectedTeamId, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmitIncident = async (e) => {
    e.preventDefault();
    if (!form.employeeId || !form.title || !form.narrative) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.post('/hr/incidents', {
        ...form,
        teamId: selectedTeamId,
      });
      setSuccessMsg('Incident note logged successfully');
      setShowModal(false);
      setForm({
        employeeId: '',
        date: new Date().toISOString().split('T')[0],
        feedbackType: 'POSITIVE',
        title: '',
        narrative: '',
        severity: 'LOW',
      });
      loadData();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to create incident report');
    }
  };

  const handleConfirmResolve = async () => {
    if (!resolvingId) return;
    try {
      await api.patch(`/hr/incidents/${resolvingId}/resolve`, { resolutionNotes });
      setSuccessMsg('Incident marked resolved');
      setResolvingId(null);
      setResolutionNotes('');
      loadData();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to resolve incident');
    }
  };

  const handleExportCsv = async () => {
    if (!selectedTeamId) return;
    try {
      const res = await api.get(`/hr/export/incidents/${selectedTeamId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `incidents_${selectedTeamId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setErrorMsg('Failed to export CSV: ' + err.message);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Incident & Quick Feedback Hub</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Supervisor observations, standup kudos, and disciplinary tracking.
            </p>
          </div>
        </div>

        {isSupervisor && (
          <div className="flex flex-wrap items-center gap-3">
            {teams.length > 0 && (
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700"
              >
                {teams.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition"
            >
              <Plus className="w-4 h-4" /> Log Note
            </button>

            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-sm">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm">
          {successMsg}
        </div>
      )}

      {/* Incidents List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="text-base font-bold text-gray-900">Logged Reports ({incidents.length})</h2>

        <div className="space-y-3">
          {incidents.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No incident notes recorded.
            </div>
          ) : (
            incidents.map((item) => (
              <div
                key={item._id}
                className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white transition"
              >
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-bold rounded-md ${
                          item.feedbackType === 'POSITIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : item.feedbackType === 'NEGATIVE'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}
                      >
                        {item.feedbackType}
                      </span>
                      <span className="text-xs font-semibold text-gray-500 uppercase">{item.severity}</span>
                      <span className="text-xs text-gray-400">• {item.date}</span>
                    </div>

                    <h3 className="text-base font-bold text-gray-900 mt-1">{item.title}</h3>
                    <p className="text-xs text-blue-600 font-medium">Member: {item.employeeName}</p>
                  </div>

                  {item.isResolved ? (
                    <span className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md">
                      Resolved
                    </span>
                  ) : isSupervisor ? (
                    <button
                      onClick={() => setResolvingId(item._id)}
                      className="px-2.5 py-1 text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-md shadow-sm transition"
                    >
                      Resolve
                    </button>
                  ) : (
                    <span className="px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md">
                      Pending Review
                    </span>
                  )}
                </div>

                <p className="text-sm text-gray-700 mt-2">{item.narrative}</p>

                {item.isResolved && item.resolutionNotes && (
                  <div className="mt-3 p-2.5 bg-emerald-50/50 border border-emerald-100 rounded-lg text-xs text-emerald-800">
                    <strong>Resolution Note:</strong> {item.resolutionNotes}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Log Note Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Log Supervisor Feedback Note</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitIncident} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Team Member</label>
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  className="w-full mt-1 p-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50"
                  required
                >
                  <option value="">Select Member...</option>
                  {members.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Feedback Type</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {['POSITIVE', 'NEGATIVE', 'NEUTRAL'].map((type) => (
                    <button
                      type="button"
                      key={type}
                      onClick={() => setForm({ ...form, feedbackType: type })}
                      className={`py-2 text-xs font-semibold rounded-lg border transition ${
                        form.feedbackType === type
                          ? type === 'POSITIVE'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : type === 'NEGATIVE'
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-gray-800 text-white border-gray-800'
                          : 'bg-gray-50 text-gray-600 border-gray-200'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full mt-1 p-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Severity</label>
                  <select
                    value={form.severity}
                    onChange={(e) => setForm({ ...form, severity: e.target.value })}
                    className="w-full mt-1 p-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Headline Title</label>
                <input
                  type="text"
                  placeholder="Summary of accomplishment or issue..."
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full mt-1 p-2.5 border border-gray-200 rounded-xl text-sm"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Detailed Narrative</label>
                <textarea
                  rows={3}
                  placeholder="Context, specific actions observed, and follow-ups..."
                  value={form.narrative}
                  onChange={(e) => setForm({ ...form, narrative: e.target.value })}
                  className="w-full mt-1 p-2.5 border border-gray-200 rounded-xl text-sm"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm"
                >
                  Save Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolution Dialog */}
      {resolvingId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Resolve Incident Note</h3>
            <textarea
              rows={3}
              placeholder="Action taken or resolution summary..."
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              className="w-full p-2.5 border border-gray-200 rounded-xl text-sm"
              required
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setResolvingId(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmResolve}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm"
              >
                Confirm Resolution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
