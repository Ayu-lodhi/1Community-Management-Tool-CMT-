import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Clock, CheckCircle2, AlertCircle, FileText, Plus, Trash2, X, ChevronLeft, ChevronRight
} from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../pages';

export const MyWorkforcePage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Current week navigation
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

  const [myAssignments, setMyAssignments] = useState([]);
  const [myTimesheets, setMyTimesheets] = useState([]);
  const [myAttendance, setMyAttendance] = useState([]);

  // Timesheet Modal
  const [timesheetModalOpen, setTimesheetModalOpen] = useState(false);
  const [selectedDayAssignment, setSelectedDayAssignment] = useState(null);
  const [formDate, setFormDate] = useState('');
  const [formTeamId, setFormTeamId] = useState('');
  const [entries, setEntries] = useState([
    { taskTitle: '', hoursSpent: 4, note: '' },
  ]);
  const [actionLoading, setActionLoading] = useState(false);

  // Attendance Regularization state
  const [regularizeModalOpen, setRegularizeModalOpen] = useState(false);
  const [regularizeForm, setRegularizeForm] = useState({ attendanceId: '', date: '', targetStatus: 'PRESENT', reason: '' });

  const loadData = useCallback(async () => {
    try {
      const [assignRes, timesheetRes, attendRes] = await Promise.all([
        api.get(`/workforce/assignments/me?startDate=${weekDays[0]}&endDate=${weekDays[6]}`),
        api.get(`/workforce/timesheets/day/me?startDate=${weekDays[0]}&endDate=${weekDays[6]}`),
        api.get(`/attendance/me?days=14`),
      ]);
      setMyAssignments(assignRes.data?.data || []);
      setMyTimesheets(timesheetRes.data?.data || []);
      setMyAttendance(attendRes.data?.data || []);
    } catch (err) {
      setErrorMsg('Failed to load schedule: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  }, [weekDays[0]]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const openTimesheetModal = (dayStr, assignment) => {
    setFormDate(dayStr);
    setFormTeamId(assignment?.teamId || '');
    setSelectedDayAssignment(assignment);

    const existing = myTimesheets.find((t) => t.date === dayStr);
    if (existing) {
      setEntries(existing.entries.map((e) => ({
        taskId: e.taskId || '',
        taskTitle: e.taskTitle,
        hoursSpent: e.hoursSpent,
        note: e.note,
      })));
    } else {
      setEntries([
        { taskTitle: assignment ? assignment.shiftName : 'General Shift Tasks', hoursSpent: assignment?.durationHours || 4, note: '' },
      ]);
    }
    setTimesheetModalOpen(true);
  };

  const totalLoggedHours = entries.reduce((sum, item) => sum + (Number(item.hoursSpent) || 0), 0);
  const shiftHours = selectedDayAssignment?.durationHours || 4;
  const isOvertime = totalLoggedHours > shiftHours;

  const openRegularizeModal = (dayStr, att) => {
    setRegularizeForm({
      attendanceId: att?._id || '',
      date: dayStr,
      targetStatus: 'PRESENT',
      reason: '',
    });
    setRegularizeModalOpen(true);
  };

  const handleRegularizeSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMsg('');
    try {
      await api.post('/workforce/attendance/regularize', regularizeForm);
      setSuccessMsg('Regularization request submitted to your lead!');
      setRegularizeModalOpen(false);
      await loadData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitTimesheet = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMsg('');
    try {
      await api.post('/workforce/timesheets/day', {
        date: formDate,
        teamId: formTeamId || selectedDayAssignment?.teamId,
        entries,
      });
      setSuccessMsg('Timesheet submitted successfully!');
      setTimesheetModalOpen(false);
      await loadData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-['Space_Mono',monospace]">Loading your schedule...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border-[2.5px] border-[#1A1A1A] shadow-[4px_4px_0px_0px_#1A1A1A] rounded-2xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#10B981] text-white border border-[#1A1A1A]">
              My Schedule
            </span>
            <span className="text-xs font-['Space_Mono',monospace] text-slate-500">{user?.name} ({user?.role})</span>
          </div>
          <h1 className="text-2xl font-black font-['Barlow_Condensed',sans-serif] uppercase tracking-wide text-slate-900">
            Assigned Shifts & Timesheets
          </h1>
        </div>

        {/* Date Navigator */}
        <div className="flex items-center gap-2">
          <button onClick={handlePrevWeek} className="p-1.5 rounded-lg border border-[#1A1A1A] hover:bg-slate-100"><ChevronLeft className="w-4 h-4" /></button>
          <span className="font-['Space_Mono',monospace] font-bold text-xs text-slate-800">{weekDays[0]} – {weekDays[6]}</span>
          <button onClick={handleNextWeek} className="p-1.5 rounded-lg border border-[#1A1A1A] hover:bg-slate-100"><ChevronRight className="w-4 h-4" /></button>
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

      {/* Week Day Schedule Cards (Responsive Stack) */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {weekDays.map((day) => {
          const dateObj = new Date(day + 'T00:00:00');
          const weekdayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
          const isToday = day === new Date().toISOString().split('T')[0];
          const isPast = day <= new Date().toISOString().split('T')[0];

          const assignment = myAssignments.find((a) => a.date === day);
          const timesheet = myTimesheets.find((t) => t.date === day);
          const attendance = myAttendance.find((att) => att.date === day);

          return (
            <div
              key={day}
              className={`bg-white border-[2.5px] border-[#1A1A1A] rounded-2xl p-4 shadow-[3px_3px_0px_0px_#1A1A1A] flex flex-col justify-between ${
                isToday ? 'ring-2 ring-[#1B5299]' : ''
              }`}
            >
              <div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                  <span className="font-['Space_Mono',monospace] text-xs font-bold text-slate-500 uppercase">{weekdayName}</span>
                  <span className={`text-xs font-black font-['Space_Mono',monospace] ${isToday ? 'text-[#1B5299]' : 'text-slate-800'}`}>{day.slice(8)}</span>
                </div>

                {assignment ? (
                  <div className="space-y-2 mb-3">
                    <div className="font-bold text-slate-900 text-xs font-['Space_Mono',monospace]">{assignment.shiftName}</div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-600 font-['Space_Mono',monospace]">
                      <Clock className="w-3 h-3 text-blue-600" />
                      <span>{assignment.startTime}–{assignment.endTime}</span>
                    </div>

                    {/* Attendance status */}
                    <div className="pt-1">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase font-['Space_Mono',monospace] ${
                        attendance?.status === 'present' ? 'bg-emerald-100 text-emerald-800' :
                        attendance?.status === 'late' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {attendance ? attendance.status : 'No Check-In'}
                      </span>
                      {isPast && attendance && attendance.status !== 'present' && (
                        <button
                          type="button"
                          onClick={() => openRegularizeModal(day, attendance)}
                          className="block text-[10px] text-[#1B5299] hover:underline font-bold mt-1 cursor-pointer"
                        >
                          Request Correction
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-slate-400 font-['Space_Mono',monospace] text-xs">
                    No shift assigned
                  </div>
                )}
              </div>

              {/* Action: Fill / View Timesheet */}
              <div className="pt-3 border-t border-slate-100">
                {timesheet ? (
                  <div className="space-y-1">
                    <span className={`block text-center px-2 py-1 rounded text-[10px] font-bold uppercase font-['Space_Mono',monospace] ${
                      timesheet.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                      timesheet.status === 'REJECTED' ? 'bg-red-100 text-red-800 border border-red-300' :
                      'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}>
                      {timesheet.status} ({timesheet.totalHoursSpent}h)
                    </span>
                    {timesheet.status !== 'APPROVED' && isPast && (
                      <button
                        onClick={() => openTimesheetModal(day, assignment)}
                        className="w-full text-center text-[10px] text-[#1B5299] hover:underline font-bold font-['Space_Mono',monospace]"
                      >
                        Edit Log
                      </button>
                    )}
                  </div>
                ) : isPast && assignment ? (
                  <button
                    onClick={() => openTimesheetModal(day, assignment)}
                    className="w-full py-1.5 px-2 bg-[#1B5299] hover:bg-[#15427C] text-white font-bold text-[11px] rounded-lg border border-[#1A1A1A] font-['Space_Mono',monospace] cursor-pointer"
                  >
                    Log Timesheet
                  </button>
                ) : (
                  <span className="block text-center text-[10px] text-slate-400 font-['Space_Mono',monospace]">
                    --
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL: Submit Day Timesheet */}
      {timesheetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border-[3px] border-[#1A1A1A] shadow-[6px_6px_0px_0px_#1A1A1A] rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4 border-b pb-3 border-slate-200">
              <div>
                <h2 className="text-xl font-black font-['Barlow_Condensed',sans-serif] uppercase text-slate-900">
                  Daily Timesheet ({formDate})
                </h2>
                <p className="text-xs text-slate-500 font-['Space_Mono',monospace]">
                  Shift Target: {shiftHours} Hours
                </p>
              </div>
              <button onClick={() => setTimesheetModalOpen(false)}><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSubmitTimesheet} className="space-y-4 font-['Space_Mono',monospace] text-xs">
              <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
                {entries.map((entry, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">Task Item #{idx + 1}</span>
                      {entries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setEntries(entries.filter((_, i) => i !== idx))}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <input
                          type="text"
                          required
                          placeholder="Task title (e.g. Stage setup)"
                          value={entry.taskTitle}
                          onChange={(e) => {
                            const newEntries = [...entries];
                            newEntries[idx].taskTitle = e.target.value;
                            setEntries(newEntries);
                          }}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none bg-white font-medium"
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          step="0.25"
                          min="0.25"
                          max="24"
                          required
                          placeholder="Hours"
                          value={entry.hoursSpent}
                          onChange={(e) => {
                            const newEntries = [...entries];
                            newEntries[idx].hoursSpent = parseFloat(e.target.value) || 0;
                            setEntries(newEntries);
                          }}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none bg-white font-bold text-center"
                        />
                      </div>
                    </div>
                    <textarea
                      rows="2"
                      required
                      placeholder="Detailed notes of tasks executed (minimum 10 characters)..."
                      value={entry.note}
                      onChange={(e) => {
                        const newEntries = [...entries];
                        newEntries[idx].note = e.target.value;
                        setEntries(newEntries);
                      }}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none bg-white"
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setEntries([...entries, { taskTitle: '', hoursSpent: 1, note: '' }])}
                className="flex items-center gap-1.5 text-xs font-bold text-[#1B5299] hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Add Task Entry
              </button>

              {/* Total Hours Summary */}
              <div className="p-3 bg-slate-100 rounded-xl flex items-center justify-between font-bold">
                <span>Total Logged Hours:</span>
                <span className={`text-sm ${isOvertime ? 'text-amber-600' : 'text-slate-900'}`}>
                  {totalLoggedHours}h / {shiftHours}h {isOvertime && '(Overtime)'}
                </span>
              </div>

              {isOvertime && (
                <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                  Note: Total hours exceed the standard shift duration. This will be marked as overtime for your lead to review.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setTimesheetModalOpen(false)}
                  className="px-4 py-2 border-2 border-[#1A1A1A] rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-[#1B5299] hover:bg-[#15427C] text-white font-bold border-2 border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A] rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Submitting...' : 'Submit to Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Request Attendance Regularization */}
      {regularizeModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border-[3px] border-[#1A1A1A] shadow-[6px_6px_0px_0px_#1A1A1A] rounded-2xl p-6 w-full max-w-md font-['Space_Mono',monospace] text-xs">
            <div className="flex items-center justify-between mb-4 border-b pb-3 border-slate-200">
              <h2 className="text-xl font-black font-['Barlow_Condensed',sans-serif] uppercase text-slate-900">
                Attendance Correction ({regularizeForm.date})
              </h2>
              <button onClick={() => setRegularizeModalOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleRegularizeSubmit} className="space-y-4">
              <div>
                <label className="block font-bold mb-1">Requested Status</label>
                <select
                  value={regularizeForm.targetStatus}
                  onChange={(e) => setRegularizeForm({ ...regularizeForm, targetStatus: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-[#1A1A1A] rounded-lg outline-none bg-white font-bold"
                >
                  <option value="PRESENT">PRESENT</option>
                  <option value="HALF_DAY">HALF DAY</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">Reason for Request</label>
                <textarea
                  rows="3"
                  required
                  placeholder="Explain why your check-in was missed or late (minimum 10 characters)..."
                  value={regularizeForm.reason}
                  onChange={(e) => setRegularizeForm({ ...regularizeForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-[#1A1A1A] rounded-lg outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-500">
                Limit: Maximum 3 regularization requests permitted per calendar month within a 7-day window.
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setRegularizeModalOpen(false)}
                  className="px-4 py-2 border-2 border-[#1A1A1A] rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !regularizeForm.reason.trim()}
                  className="px-4 py-2 bg-[#1B5299] hover:bg-[#15427C] text-white font-bold border-2 border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A] rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
