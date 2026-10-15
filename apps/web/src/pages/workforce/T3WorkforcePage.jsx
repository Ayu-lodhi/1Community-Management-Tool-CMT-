import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Clock, UsersRound, Plus, X, ChevronLeft, ChevronRight,
  CheckCircle2, Download, AlertCircle, RefreshCw, Check, FileText
} from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../pages';

export const T3WorkforcePage = () => {
  const { user } = useAuth();
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);

  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('calendar'); // 'calendar' | 'register'
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Week navigation (Monday start)
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diff));
    mon.setHours(0, 0, 0, 0);
    return mon;
  });

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  // Data states
  const [members, setMembers] = useState([]);
  const [shiftTemplates, setShiftTemplates] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [registerRecords, setRegisterRecords] = useState([]);

  // Modals
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [manualMarkModalOpen, setManualMarkModalOpen] = useState(false);

  // Forms
  const [shiftForm, setShiftForm] = useState({ name: '', startTime: '09:00', endTime: '17:00', breakMinutes: 30, weekdays: [1, 2, 3, 4, 5] });
  const [taskForm, setTaskForm] = useState({ title: '', description: '', dueDate: '', priority: 'MEDIUM' });
  const [assignForm, setAssignForm] = useState({ userId: '', shiftTemplateId: '', date: '', taskIds: [], repeatWeekly: false });
  const [markForm, setMarkForm] = useState({ userId: '', userName: '', date: '', status: 'PRESENT', reason: '' });
  const [actionLoading, setActionLoading] = useState(false);

  // Inline Custom Task state inside Assign Shift modal
  const [showCustomTask, setShowCustomTask] = useState(false);
  const [customTaskTitle, setCustomTaskTitle] = useState('');
  const [customTaskDesc, setCustomTaskDesc] = useState('');
  const [savingCustomTask, setSavingCustomTask] = useState(false);
  const [customTaskError, setCustomTaskError] = useState('');

  // 1. Fetch available teams
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

  // 2. Fetch team members, templates, tasks, assignments, and register
  const loadTeamData = useCallback(async () => {
    if (!selectedTeamId) return;
    try {
      const [templatesRes, tasksRes, assignRes, teamRes] = await Promise.all([
        api.get(`/workforce/shifts/templates?teamId=${selectedTeamId}`),
        api.get(`/workforce/tasks?teamId=${selectedTeamId}`),
        api.get(`/workforce/assignments/team?teamId=${selectedTeamId}&startDate=${weekDays[0]}&endDate=${weekDays[6]}`),
        api.get(`/teams/${selectedTeamId}`),
      ]);

      setShiftTemplates(templatesRes.data?.data || []);
      setTasks(tasksRes.data?.data || []);
      setAssignments(assignRes.data?.data || []);

      const teamData = teamRes.data?.data || {};
      const teamMembers = Array.isArray(teamData.members) ? teamData.members : [];
      setMembers(teamMembers);

      if (activeView === 'register') {
        const monthKey = weekDays[0].slice(0, 7);
        const regRes = await api.get(`/workforce/attendance/register?teamId=${selectedTeamId}&month=${monthKey}`);
        setRegisterRecords(regRes.data?.data || []);
      }
    } catch (err) {
      console.error('Failed to load team workforce data:', err);
    }
  }, [selectedTeamId, weekDays[0], activeView]);

  useEffect(() => {
    loadTeamData();
  }, [loadTeamData]);

  // Week navigation handlers
  const handlePrevWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    setCurrentWeekStart(d);
  };

  const handleNextWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    setCurrentWeekStart(d);
  };

  const handleThisWeek = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diff));
    mon.setHours(0, 0, 0, 0);
    setCurrentWeekStart(mon);
  };

  // Create Shift Template
  const handleCreateShift = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMsg('');
    try {
      await api.post('/workforce/shifts/templates', {
        ...shiftForm,
        teamId: selectedTeamId,
      });
      setSuccessMsg('Shift template created!');
      setShiftModalOpen(false);
      setShiftForm({ name: '', startTime: '09:00', endTime: '17:00', breakMinutes: 30, weekdays: [1, 2, 3, 4, 5] });
      await loadTeamData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Create Task
  const handleCreateTask = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMsg('');
    try {
      await api.post('/workforce/tasks', {
        ...taskForm,
        teamId: selectedTeamId,
      });
      setSuccessMsg('Task created!');
      setTaskModalOpen(false);
      setTaskForm({ title: '', description: '', dueDate: '', priority: 'MEDIUM' });
      await loadTeamData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Save inline custom task inside Assign Shift modal
  const handleSaveCustomTask = async () => {
    if (!customTaskTitle.trim()) {
      setCustomTaskError('Task title is required');
      return;
    }
    setSavingCustomTask(true);
    setCustomTaskError('');
    try {
      const res = await api.post('/workforce/tasks', {
        title: customTaskTitle.trim(),
        description: customTaskDesc.trim(),
        teamId: selectedTeamId,
        source: 'assign_modal',
      });
      const newTask = res.data?.data;
      if (newTask?._id) {
        setTasks((prev) => {
          if (prev.some((t) => t._id === newTask._id)) return prev;
          return [newTask, ...prev];
        });
        setAssignForm((prev) => ({
          ...prev,
          taskIds: prev.taskIds.includes(newTask._id) ? prev.taskIds : [...prev.taskIds, newTask._id],
        }));
        setCustomTaskTitle('');
        setCustomTaskDesc('');
        setShowCustomTask(false);
      }
    } catch (err) {
      setCustomTaskError(err.response?.data?.message || err.message || 'Failed to save task');
    } finally {
      setSavingCustomTask(false);
    }
  };

  // Create Shift Assignment
  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMsg('');
    try {
      await api.post('/workforce/assignments', {
        ...assignForm,
        teamId: selectedTeamId,
      });
      setSuccessMsg('Shift assigned successfully!');
      setAssignModalOpen(false);
      setAssignForm({ userId: '', shiftTemplateId: '', date: '', taskIds: [], repeatWeekly: false });
      setShowCustomTask(false);
      setCustomTaskTitle('');
      setCustomTaskDesc('');
      setCustomTaskError('');
      await loadTeamData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      const hasTasks = assignForm.taskIds && assignForm.taskIds.length > 0;
      const baseErr = err.response?.data?.message || err.message;
      if (hasTasks) {
        setErrorMsg(`${baseErr}. Note: Newly saved tasks remain available in your task checklist.`);
      } else {
        setErrorMsg(baseErr);
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Manual Attendance Mark
  const handleManualMark = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMsg('');
    try {
      await api.post('/workforce/attendance/manual', {
        userId: markForm.userId,
        teamId: selectedTeamId,
        date: markForm.date,
        status: markForm.status,
        reason: markForm.reason,
      });
      setSuccessMsg(`Attendance marked as ${markForm.status}!`);
      setManualMarkModalOpen(false);
      await loadTeamData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // CSV Export
  const handleExportCSV = async () => {
    const monthKey = weekDays[0].slice(0, 7);
    try {
      const res = await api.get(`/workforce/export/monthly-register?teamId=${selectedTeamId}&month=${monthKey}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance-${selectedTeamId}-${monthKey}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Export failed: ' + (err.response?.data?.message || err.message));
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 font-['Space_Mono',monospace]">
        Loading workforce portal...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Heading */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 border-[2.5px] border-[#1A1A1A] shadow-[4px_4px_0px_0px_#1A1A1A] rounded-2xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#E6B800] text-[#1A1A1A] border border-[#1A1A1A]">
              T3 Executive Lead
            </span>
            <span className="text-xs font-['Space_Mono',monospace] text-slate-500">Workforce Manager</span>
          </div>
          <h1 className="text-2xl font-black font-['Barlow_Condensed',sans-serif] uppercase tracking-wide text-slate-900">
            Shift Schedule & Attendance Register
          </h1>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {teams.length > 1 && (
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="px-3 py-2 text-xs font-bold font-['Space_Mono',monospace] bg-slate-50 border-2 border-[#1A1A1A] rounded-xl outline-none"
            >
              {teams.map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => setShiftModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold text-xs uppercase tracking-wider border-2 border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A] rounded-xl cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Shift Template
          </button>

          <button
            onClick={() => setTaskModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold text-xs uppercase tracking-wider border-2 border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A] rounded-xl cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> New Task
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#E4DDD0] hover:bg-[#D5CBB8] text-slate-900 font-bold text-xs uppercase tracking-wider border-2 border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A] rounded-xl cursor-pointer"
            title="Download CSV Register"
          >
            <Download className="w-3.5 h-3.5" /> CSV Export
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
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

      {/* View Switcher & Week Navigator */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 border-2 border-[#1A1A1A] rounded-xl">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveView('calendar')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
              activeView === 'calendar'
                ? 'bg-[#1B5299] text-white border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A]'
                : 'bg-slate-50 text-slate-700 border-transparent hover:bg-slate-100'
            }`}
          >
            Shift Calendar
          </button>
          <button
            onClick={() => setActiveView('register')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
              activeView === 'register'
                ? 'bg-[#1B5299] text-white border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A]'
                : 'bg-slate-50 text-slate-700 border-transparent hover:bg-slate-100'
            }`}
          >
            Attendance Register
          </button>
        </div>

        {/* Date Navigator */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevWeek}
            className="p-1.5 rounded-lg border border-[#1A1A1A] hover:bg-slate-100"
            title="Previous Week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-['Space_Mono',monospace] font-bold text-xs text-slate-800">
            {weekDays[0]} – {weekDays[6]}
          </span>
          <button
            onClick={handleNextWeek}
            className="p-1.5 rounded-lg border border-[#1A1A1A] hover:bg-slate-100"
            title="Next Week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleThisWeek}
            className="px-2 py-1 text-[11px] font-bold font-['Space_Mono',monospace] bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md"
          >
            Today
          </button>
        </div>
      </div>

      {/* Main Grid: Responsive Card/Table Stack */}
      <div className="bg-white border-[2.5px] border-[#1A1A1A] shadow-[4px_4px_0px_0px_#1A1A1A] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-800 border-collapse">
            <thead className="bg-[#F5F2EB] border-b-2 border-[#1A1A1A] font-['Barlow_Condensed',sans-serif] text-xs uppercase tracking-wider font-black">
              <tr>
                <th className="py-3 px-4 border-r-2 border-[#1A1A1A] min-w-[160px]">Team Member</th>
                {weekDays.map((day) => {
                  const dateObj = new Date(day + 'T00:00:00');
                  const weekdayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                  const dayNum = day.slice(8);
                  const isToday = day === new Date().toISOString().split('T')[0];

                  return (
                    <th
                      key={day}
                      className={`py-2 px-2 text-center border-r border-slate-200 min-w-[120px] ${
                        isToday ? 'bg-amber-100 text-[#1B5299]' : ''
                      }`}
                    >
                      <div className="text-[10px] text-slate-500 font-['Space_Mono',monospace]">{weekdayName}</div>
                      <div className="text-sm font-black">{dayNum}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-['Space_Mono',monospace] text-xs">
              {members.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No members assigned to this team yet.
                  </td>
                </tr>
              ) : (
                members.map((member) => {
                  const mId = member._id ? member._id.toString() : member.toString();
                  const mName = member.name || 'Member';
                  const mRole = member.role || 'T1';

                  return (
                    <tr key={mId} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 border-r-2 border-[#1A1A1A] bg-white font-medium">
                        <div className="font-bold text-slate-900 truncate">{mName}</div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600 font-bold">
                          {mRole.replace('T1_VOLUNTEER', 'T1').replace('T2_ASSOCIATE', 'T2').replace('T3_EXECUTIVE', 'T3')}
                        </span>
                      </td>

                      {/* Day Columns */}
                      {weekDays.map((day) => {
                        const assignment = assignments.find(
                          (a) => a.userId.toString() === mId && a.date === day
                        );
                        const reg = registerRecords.find(
                          (r) => r.userId.toString() === mId && r.date === day
                        );

                        return (
                          <td key={day} className="py-2 px-2 border-r border-slate-200 align-top">
                            {assignment ? (
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-1.5 space-y-1">
                                <div className="font-bold text-blue-900 text-[11px] truncate">
                                  {assignment.shiftName}
                                </div>
                                <div className="text-[10px] text-blue-700 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  <span>{assignment.startTime}–{assignment.endTime}</span>
                                </div>

                                {/* Status Badge (click to mark in register view) */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMarkForm({
                                      userId: mId,
                                      userName: mName,
                                      date: day,
                                      status: reg?.status || 'PRESENT',
                                      reason: '',
                                    });
                                    setManualMarkModalOpen(true);
                                  }}
                                  className={`w-full mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-center border cursor-pointer ${
                                    reg?.status === 'PRESENT'
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                      : reg?.status === 'LATE'
                                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                                      : reg?.status === 'ABSENT'
                                      ? 'bg-red-100 text-red-800 border-red-300'
                                      : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                  }`}
                                  title="Click to mark attendance"
                                >
                                  {reg?.status || 'Mark Attendance'}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setAssignForm({
                                    userId: mId,
                                    shiftTemplateId: shiftTemplates[0]?._id || '',
                                    date: day,
                                    taskIds: [],
                                    repeatWeekly: false,
                                  });
                                  setShowCustomTask(false);
                                  setCustomTaskTitle('');
                                  setCustomTaskDesc('');
                                  setCustomTaskError('');
                                  setAssignModalOpen(true);
                                }}
                                className="w-full h-full py-4 text-center text-slate-300 hover:text-blue-600 hover:bg-blue-50/50 rounded-lg border border-dashed border-slate-200 transition-colors cursor-pointer"
                                title={`Assign shift to ${mName} on ${day}`}
                              >
                                <Plus className="w-4 h-4 mx-auto" />
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Create Shift Template */}
      {shiftModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border-[3px] border-[#1A1A1A] shadow-[6px_6px_0px_0px_#1A1A1A] rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black font-['Barlow_Condensed',sans-serif] uppercase text-slate-900">
                New Shift Template
              </h2>
              <button onClick={() => setShiftModalOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateShift} className="space-y-4 font-['Space_Mono',monospace] text-xs">
              <div>
                <label className="block font-bold mb-1">Shift Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Morning Ops, Registration Desk"
                  value={shiftForm.name}
                  onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-[#1A1A1A] rounded-lg outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={shiftForm.startTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[#1A1A1A] rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={shiftForm.endTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[#1A1A1A] rounded-lg outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold mb-1">Break (Minutes)</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={shiftForm.breakMinutes}
                  onChange={(e) => setShiftForm({ ...shiftForm, breakMinutes: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border-2 border-[#1A1A1A] rounded-lg outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShiftModalOpen(false)}
                  className="px-4 py-2 border-2 border-[#1A1A1A] rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-[#1B5299] hover:bg-[#15427C] text-white font-bold border-2 border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A] rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Create Task */}
      {taskModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border-[3px] border-[#1A1A1A] shadow-[6px_6px_0px_0px_#1A1A1A] rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black font-['Barlow_Condensed',sans-serif] uppercase text-slate-900">
                New Team Task
              </h2>
              <button onClick={() => setTaskModalOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-4 font-['Space_Mono',monospace] text-xs">
              <div>
                <label className="block font-bold mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Stage Sound Coordination"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-[#1A1A1A] rounded-lg outline-none"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Description</label>
                <textarea
                  rows="3"
                  placeholder="Specific instructions or deliverables..."
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-[#1A1A1A] rounded-lg outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Due Date</label>
                  <input
                    type="date"
                    value={taskForm.dueDate}
                    onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[#1A1A1A] rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Priority</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[#1A1A1A] rounded-lg outline-none bg-white"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTaskModalOpen(false)}
                  className="px-4 py-2 border-2 border-[#1A1A1A] rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-[#1B5299] hover:bg-[#15427C] text-white font-bold border-2 border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A] rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Assign Shift to Calendar Cell */}
      {assignModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border-[3px] border-[#1A1A1A] shadow-[6px_6px_0px_0px_#1A1A1A] rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black font-['Barlow_Condensed',sans-serif] uppercase text-slate-900">
                Assign Shift ({assignForm.date})
              </h2>
              <button onClick={() => setAssignModalOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateAssignment} className="space-y-4 font-['Space_Mono',monospace] text-xs">
              <div>
                <label className="block font-bold mb-1">Select Shift Template</label>
                {shiftTemplates.length === 0 ? (
                  <p className="text-red-600">No shift templates created yet. Please create a shift template first.</p>
                ) : (
                  <select
                    required
                    value={assignForm.shiftTemplateId}
                    onChange={(e) => setAssignForm({ ...assignForm, shiftTemplateId: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[#1A1A1A] rounded-lg outline-none bg-white"
                  >
                    <option value="">-- Choose Shift --</option>
                    {shiftTemplates.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name} ({t.startTime} - {t.endTime}, {t.durationHours}h)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block font-bold mb-1">Associate Tasks (Optional)</label>
                {tasks.length > 0 ? (
                  <div className="max-h-32 overflow-y-auto border border-slate-300 rounded-lg p-2 space-y-1">
                    {tasks.map((task) => {
                      const checked = assignForm.taskIds.includes(task._id);
                      return (
                        <label key={task._id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAssignForm({ ...assignForm, taskIds: [...assignForm.taskIds, task._id] });
                              } else {
                                setAssignForm({ ...assignForm, taskIds: assignForm.taskIds.filter((id) => id !== task._id) });
                              }
                            }}
                          />
                          <span className="truncate">{task.title}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">No tasks created yet for this team.</p>
                )}

                {/* Inline Add Custom Task */}
                <div className="pt-2">
                  {!showCustomTask ? (
                    <button
                      type="button"
                      onClick={() => { setShowCustomTask(true); setCustomTaskError(''); }}
                      className="text-[11px] font-bold text-[#1B5299] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add custom task
                    </button>
                  ) : (
                    <div className="p-3 bg-slate-50 border border-slate-300 rounded-xl space-y-2 mt-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] text-slate-700">New Custom Task</span>
                        <button
                          type="button"
                          disabled={savingCustomTask}
                          onClick={() => { setShowCustomTask(false); setCustomTaskError(''); }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {customTaskError && (
                        <p className="text-[10px] text-red-600 font-bold">{customTaskError}</p>
                      )}
                      <div>
                        <input
                          type="text"
                          maxLength={100}
                          placeholder="Task title (required, max 100 chars)"
                          value={customTaskTitle}
                          onChange={(e) => setCustomTaskTitle(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs outline-none"
                        />
                        <div className="text-[9px] text-slate-400 text-right mt-0.5">{customTaskTitle.length}/100</div>
                      </div>
                      <div>
                        <textarea
                          rows="2"
                          maxLength={500}
                          placeholder="Task description (optional, max 500 chars)"
                          value={customTaskDesc}
                          onChange={(e) => setCustomTaskDesc(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs outline-none"
                        />
                        <div className="text-[9px] text-slate-400 text-right mt-0.5">{customTaskDesc.length}/500</div>
                      </div>
                      <div className="flex justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          disabled={savingCustomTask}
                          onClick={() => { setShowCustomTask(false); setCustomTaskError(''); }}
                          className="px-2.5 py-1 text-[11px] border border-slate-300 rounded-lg hover:bg-slate-100 font-bold cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={savingCustomTask || !customTaskTitle.trim()}
                          onClick={handleSaveCustomTask}
                          className="px-3 py-1 text-[11px] bg-[#1B5299] hover:bg-[#15427C] text-white rounded-lg font-bold cursor-pointer disabled:opacity-50"
                        >
                          {savingCustomTask ? 'Saving...' : 'Save task'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Repeat Weekly Option */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <label className="flex items-center gap-2 font-bold cursor-pointer text-amber-900">
                  <input
                    type="checkbox"
                    checked={assignForm.repeatWeekly}
                    onChange={(e) => setAssignForm({ ...assignForm, repeatWeekly: e.target.checked })}
                  />
                  <span>Repeat weekly for next 4 weeks</span>
                </label>
                <p className="text-[10px] text-amber-700 mt-1">
                  Automatically assigns this member to this shift on this day for the next 4 consecutive weeks.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="px-4 py-2 border-2 border-[#1A1A1A] rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !assignForm.shiftTemplateId}
                  className="px-4 py-2 bg-[#1B5299] hover:bg-[#15427C] text-white font-bold border-2 border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A] rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Manual Attendance Marking */}
      {manualMarkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border-[3px] border-[#1A1A1A] shadow-[6px_6px_0px_0px_#1A1A1A] rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-black font-['Barlow_Condensed',sans-serif] uppercase text-slate-900">
                  Mark Attendance
                </h2>
                <p className="text-xs text-slate-500 font-['Space_Mono',monospace]">
                  {markForm.userName} ({markForm.date})
                </p>
              </div>
              <button onClick={() => setManualMarkModalOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleManualMark} className="space-y-4 font-['Space_Mono',monospace] text-xs">
              <div>
                <label className="block font-bold mb-1">Status</label>
                <select
                  value={markForm.status}
                  onChange={(e) => setMarkForm({ ...markForm, status: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-[#1A1A1A] rounded-lg outline-none bg-white font-bold"
                >
                  <option value="PRESENT">PRESENT</option>
                  <option value="LATE">LATE</option>
                  <option value="HALF_DAY">HALF DAY</option>
                  <option value="ABSENT">ABSENT</option>
                  <option value="ON_LEAVE">ON LEAVE</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">Reason / Notes</label>
                <textarea
                  rows="2"
                  placeholder="e.g. Arrived on time, confirmed by lead"
                  value={markForm.reason}
                  onChange={(e) => setMarkForm({ ...markForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-[#1A1A1A] rounded-lg outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setManualMarkModalOpen(false)}
                  className="px-4 py-2 border-2 border-[#1A1A1A] rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-[#1B5299] hover:bg-[#15427C] text-white font-bold border-2 border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A] rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Save Attendance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
