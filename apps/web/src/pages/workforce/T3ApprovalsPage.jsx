import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Check, X, Clock, AlertTriangle, CheckCircle2, ChevronRight, Filter
} from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../pages';

export const T3ApprovalsPage = () => {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('SUBMITTED');
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Reject modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingItem, setRejectingItem] = useState(null);
  const [rejectComment, setRejectComment] = useState('');

  // Detail modal
  const [detailItem, setDetailItem] = useState(null);

  // Tab: 'timesheets' | 'regularizations'
  const [activeTab, setActiveTab] = useState('timesheets');
  const [regularizations, setRegularizations] = useState([]);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const res = await api.get('/teams/me');
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        setTeams(list);
        if (list.length > 0) {
          setSelectedTeamId(list[0]._id);
        }
      } catch (err) {
        setErrorMsg('Failed to load teams: ' + (err.response?.data?.message || err.message));
      } finally {
        setLoading(false);
      }
    };
    fetchTeams();
  }, []);

  const loadTimesheets = useCallback(async () => {
    if (!selectedTeamId) return;
    try {
      const res = await api.get(`/workforce/timesheets/day/team?teamId=${selectedTeamId}&status=${statusFilter === 'ALL' ? '' : statusFilter}`);
      setTimesheets(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load timesheets:', err);
    }
  }, [selectedTeamId, statusFilter]);

  const loadRegularizations = useCallback(async () => {
    if (!selectedTeamId) return;
    try {
      const monthKey = new Date().toISOString().slice(0, 7);
      const res = await api.get(`/workforce/attendance/register?teamId=${selectedTeamId}&month=${monthKey}`);
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      setRegularizations(list.filter((r) => r.regularization && r.regularization.status === 'PENDING'));
    } catch (err) {
      console.error('Failed to load regularizations:', err);
    }
  }, [selectedTeamId]);

  useEffect(() => {
    if (activeTab === 'regularizations') {
      loadRegularizations();
    } else {
      loadTimesheets();
    }
  }, [activeTab, loadTimesheets, loadRegularizations]);

  const handleApprove = async (item) => {
    setActionLoadingId(item._id);
    setErrorMsg('');
    try {
      await api.patch(`/workforce/timesheets/day/${item._id}/review`, {
        status: 'APPROVED',
        comment: 'Approved by team lead',
      });
      setSuccessMsg(`Approved timesheet for ${item.userName} (${item.date})!`);
      await loadTimesheets();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleApproveRegularization = async (item) => {
    setActionLoadingId(item._id);
    setErrorMsg('');
    try {
      await api.patch(`/workforce/attendance/${item._id}/regularize-review`, {
        status: 'APPROVED',
        reviewComment: 'Approved by team lead',
      });
      setSuccessMsg(`Approved attendance correction for ${item.userName} (${item.date})!`);
      await loadRegularizations();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectRegularization = async (item) => {
    const comment = window.prompt('Enter rejection reason for this correction request:');
    if (comment === null) return;
    setActionLoadingId(item._id);
    setErrorMsg('');
    try {
      await api.patch(`/workforce/attendance/${item._id}/regularize-review`, {
        status: 'REJECTED',
        reviewComment: comment || 'Rejected by team lead',
      });
      setSuccessMsg(`Rejected regularization for ${item.userName}`);
      await loadRegularizations();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirmReject = async (e) => {
    e.preventDefault();
    if (!rejectingItem) return;
    setActionLoadingId(rejectingItem._id);
    setErrorMsg('');
    try {
      await api.patch(`/workforce/timesheets/day/${rejectingItem._id}/review`, {
        status: 'REJECTED',
        comment: rejectComment || 'Timesheet rejected by team lead',
      });
      setSuccessMsg(`Rejected timesheet for ${rejectingItem.userName}`);
      setRejectModalOpen(false);
      setRejectingItem(null);
      setRejectComment('');
      await loadTimesheets();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-['Space_Mono',monospace]">Loading approvals inbox...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border-[2.5px] border-[#1A1A1A] shadow-[4px_4px_0px_0px_#1A1A1A] rounded-2xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#E6B800] text-[#1A1A1A] border border-[#1A1A1A]">
              T3 Lead Reviews
            </span>
            <span className="text-xs font-['Space_Mono',monospace] text-slate-500">Approvals Inbox</span>
          </div>
          <h1 className="text-2xl font-black font-['Barlow_Condensed',sans-serif] uppercase tracking-wide text-slate-900">
            Daily Timesheet Approvals
          </h1>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 font-['Space_Mono',monospace] text-xs">
          {teams.length > 1 && (
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="px-3 py-2 font-bold bg-slate-50 border-2 border-[#1A1A1A] rounded-xl outline-none"
            >
              {teams.map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 font-bold bg-white border-2 border-[#1A1A1A] rounded-xl outline-none"
          >
            <option value="SUBMITTED">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="ALL">All Statuses</option>
          </select>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-100 border-2 border-red-700 text-red-700 rounded-xl text-xs font-bold font-['Space_Mono',monospace] flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')}><X className="w-4 h-4" /></button>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-100 border-2 border-emerald-700 text-emerald-800 rounded-xl text-xs font-bold font-['Space_Mono',monospace] flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Switcher: Timesheet Approvals vs Attendance Regularizations */}
      <div className="flex items-center gap-2 bg-white p-2 border-2 border-[#1A1A1A] rounded-xl font-['Space_Mono',monospace] text-xs">
        <button
          onClick={() => setActiveTab('timesheets')}
          className={`px-3 py-1.5 font-bold rounded-lg transition-all cursor-pointer ${
            activeTab === 'timesheets'
              ? 'bg-[#1B5299] text-white border border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A]'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          Timesheet Approvals ({timesheets.filter(t => t.status === 'SUBMITTED').length})
        </button>
        <button
          onClick={() => setActiveTab('regularizations')}
          className={`px-3 py-1.5 font-bold rounded-lg transition-all cursor-pointer ${
            activeTab === 'regularizations'
              ? 'bg-[#1B5299] text-white border border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A]'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          Attendance Regularizations ({regularizations.length})
        </button>
      </div>

      {/* Main List */}
      <div className="bg-white border-[2.5px] border-[#1A1A1A] shadow-[4px_4px_0px_0px_#1A1A1A] rounded-2xl overflow-hidden font-['Space_Mono',monospace]">
        {activeTab === 'regularizations' ? (
          regularizations.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No pending attendance regularization requests for this team.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {regularizations.map((item) => (
                <div key={item._id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{item.userName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">{item.userRole}</span>
                      <span className="text-xs text-slate-500">{item.date}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-bold">
                        Current: {item.status}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300 font-bold">
                        Requested: {item.regularization?.targetStatus || 'PRESENT'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700">
                      Reason: &quot;<span className="font-medium text-slate-900">{item.regularization?.reason}</span>&quot;
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <button
                      onClick={() => handleApproveRegularization(item)}
                      disabled={actionLoadingId === item._id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg border border-[#1A1A1A] cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => handleRejectRegularization(item)}
                      disabled={actionLoadingId === item._id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg border border-[#1A1A1A] cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          timesheets.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No timesheets found matching filter &quot;{statusFilter}&quot;.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {timesheets.map((item) => (
                <div key={item._id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm font-['Space_Mono',monospace]">{item.userName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold font-['Space_Mono',monospace]">{item.userRole}</span>
                      <span className="text-xs text-slate-500 font-['Space_Mono',monospace]">{item.date}</span>
                      {item.isOvertime && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-bold font-['Space_Mono',monospace]">
                          Overtime
                        </span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-['Space_Mono',monospace] ${
                        item.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                        item.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {item.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 font-medium">
                      Total Hours: <span className="font-bold">{item.totalHoursSpent}h</span> (Target Shift: {item.shiftHours}h) • {item.entries?.length || 0} Task Entries
                    </p>

                    {item.entries?.[0] && (
                      <p className="text-xs text-slate-500 truncate max-w-xl font-['Space_Mono',monospace]">
                        Task 1: {item.entries[0].taskTitle} — &quot;{item.entries[0].note}&quot;
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 font-['Space_Mono',monospace] text-xs">
                    <button
                      onClick={() => setDetailItem(item)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg border border-slate-300"
                    >
                      View Breakdown
                    </button>

                    {item.status === 'SUBMITTED' && (
                      <>
                        <button
                          onClick={() => handleApprove(item)}
                          disabled={actionLoadingId === item._id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg border border-[#1A1A1A] cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => {
                            setRejectingItem(item);
                            setRejectModalOpen(true);
                          }}
                          disabled={actionLoadingId === item._id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg border border-[#1A1A1A] cursor-pointer disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* DETAIL MODAL */}
      {detailItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border-[3px] border-[#1A1A1A] shadow-[6px_6px_0px_0px_#1A1A1A] rounded-2xl p-6 w-full max-w-lg font-['Space_Mono',monospace] text-xs">
            <div className="flex items-center justify-between mb-4 border-b pb-3 border-slate-200">
              <div>
                <h2 className="text-xl font-black font-['Barlow_Condensed',sans-serif] uppercase text-slate-900">
                  Timesheet Details
                </h2>
                <p className="text-slate-500">
                  {detailItem.userName} • {detailItem.date}
                </p>
              </div>
              <button onClick={() => setDetailItem(null)}><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto mb-4">
              {detailItem.entries?.map((e, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="flex justify-between items-center font-bold text-slate-900">
                    <span>{e.taskTitle}</span>
                    <span className="text-blue-700">{e.hoursSpent} hrs</span>
                  </div>
                  <p className="text-slate-600 text-[11px] whitespace-pre-wrap">{e.note}</p>
                </div>
              ))}
            </div>

            <div className="p-3 bg-slate-100 rounded-xl flex justify-between font-bold mb-4">
              <span>Total Hours: {detailItem.totalHoursSpent}h</span>
              <span>Target: {detailItem.shiftHours}h</span>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setDetailItem(null)}
                className="px-4 py-2 border-2 border-[#1A1A1A] rounded-xl font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectModalOpen && rejectingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border-[3px] border-[#1A1A1A] shadow-[6px_6px_0px_0px_#1A1A1A] rounded-2xl p-6 w-full max-w-md font-['Space_Mono',monospace] text-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black font-['Barlow_Condensed',sans-serif] uppercase text-red-700">
                Reject Timesheet
              </h2>
              <button onClick={() => setRejectModalOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleConfirmReject} className="space-y-4">
              <p className="text-slate-700">
                Rejecting timesheet for <span className="font-bold">{rejectingItem.userName}</span> on <span className="font-bold">{rejectingItem.date}</span>.
              </p>
              <div>
                <label className="block font-bold mb-1">Rejection Reason</label>
                <textarea
                  rows="3"
                  required
                  placeholder="Explain why this timesheet was rejected so the member can revise it..."
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-[#1A1A1A] rounded-lg outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="px-4 py-2 border-2 border-[#1A1A1A] rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoadingId === rejectingItem._id}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold border-2 border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A] rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {actionLoadingId === rejectingItem._id ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
