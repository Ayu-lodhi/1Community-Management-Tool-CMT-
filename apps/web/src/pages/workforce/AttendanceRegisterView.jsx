import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  QrCode, UserCheck, AlertCircle, CheckCircle2, Clock, X,
  FileCheck, Shield, ChevronLeft, ChevronRight, HelpCircle
} from 'lucide-react';
import api from '../../lib/api';

const STATUS_CONFIG = {
  PRESENT: { label: 'Present', short: 'P', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  LATE: { label: 'Late', short: 'L', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
  HALF_DAY: { label: 'Half Day', short: 'HD', bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  ABSENT: { label: 'Absent', short: 'A', bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  ON_LEAVE: { label: 'On Leave', short: 'LVE', bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
  WEEKLY_OFF: { label: 'Off', short: 'OFF', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300' },
};

export const AttendanceRegisterView = ({
  selectedTeamId,
  weekDays,
  user,
}) => {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [registerData, setRegisterData] = useState({ members: [], attendance: [], assignments: [] });
  const [monthLock, setMonthLock] = useState({ isLocked: false });

  // Marking Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [markStatus, setMarkStatus] = useState('PRESENT');
  const [markNote, setMarkNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState('');

  // Bulk mark loading state
  const [bulkLoadingDay, setBulkLoadingDay] = useState(null);

  const todayIST = useMemo(() => {
    return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split('T')[0];
  }, []);

  const monthKey = weekDays[0]?.slice(0, 7);

  const loadData = useCallback(async () => {
    if (!selectedTeamId || !weekDays[0]) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const [regRes, lockRes] = await Promise.all([
        api.get(`/workforce/attendance/register?teamId=${selectedTeamId}&startDate=${weekDays[0]}&endDate=${weekDays[6]}`),
        api.get(`/workforce/month-lock/status?month=${monthKey}`).catch(() => ({ data: { data: { isLocked: false } } })),
      ]);
      setRegisterData(regRes.data?.data || { members: [], attendance: [], assignments: [] });
      setMonthLock(lockRes.data?.data || { isLocked: false });
    } catch (err) {
      setErrorMsg('Failed to load register: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId, weekDays[0], monthKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Lookup maps for fast cell rendering
  const { attendanceMap, assignmentMap } = useMemo(() => {
    const aMap = new Map();
    const sMap = new Map();
    for (const a of (registerData.attendance || [])) {
      aMap.set(`${a.userId}_${a.date}`, a);
    }
    for (const s of (registerData.assignments || [])) {
      sMap.set(`${s.userId}_${s.date}`, s);
    }
    return { attendanceMap: aMap, assignmentMap: sMap };
  }, [registerData]);

  // Calculate Column Totals (Present count for day)
  const columnTotals = useMemo(() => {
    const totals = {};
    for (const day of weekDays) {
      let count = 0;
      for (const m of (registerData.members || [])) {
        const att = attendanceMap.get(`${m.userId}_${day}`);
        if (att && att.status === 'PRESENT') count++;
      }
      totals[day] = count;
    }
    return totals;
  }, [weekDays, registerData.members, attendanceMap]);

  // Calculate Row Totals per member
  const rowTotals = useMemo(() => {
    const totals = {};
    for (const m of (registerData.members || [])) {
      let present = 0;
      let late = 0;
      let absent = 0;
      for (const day of weekDays) {
        const att = attendanceMap.get(`${m.userId}_${day}`);
        if (att) {
          if (att.status === 'PRESENT') present++;
          else if (att.status === 'LATE') late++;
          else if (att.status === 'ABSENT') absent++;
        }
      }
      totals[m.userId] = { present, late, absent };
    }
    return totals;
  }, [weekDays, registerData.members, attendanceMap]);

  // Cell click handler
  const handleCellClick = (member, day, att, isFuture, isLocked, isLeadRow) => {
    if (isFuture || isLocked || isLeadRow) return;

    setSelectedCell({
      member,
      day,
      existingAtt: att,
      isQrOverride: Boolean(att?.rawPunchId),
    });
    setMarkStatus(att?.status || 'PRESENT');
    setMarkNote(att?.note || '');
    setDialogError('');
    setDialogOpen(true);
  };

  // Submit manual mark
  const handleSaveAttendance = async (e) => {
    e.preventDefault();
    if (!selectedCell) return;
    setSubmitting(true);
    setDialogError('');

    try {
      await api.post('/workforce/attendance/manual', {
        userId: selectedCell.member.userId,
        date: selectedCell.day,
        status: markStatus,
        note: markNote,
      });
      setSuccessMsg(`Marked ${selectedCell.member.name} as ${markStatus} for ${selectedCell.day}`);
      setDialogOpen(false);
      await loadData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setDialogError(err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Column header action: Mark All Present
  const handleMarkAllPresent = async (day) => {
    if (!window.confirm(`Mark all eligible members of this team present for ${day}?`)) return;
    setBulkLoadingDay(day);
    setErrorMsg('');
    try {
      const res = await api.post('/workforce/attendance/mark-all-present', {
        date: day,
        teamId: selectedTeamId,
      });
      setSuccessMsg(`Bulk mark: ${res.data?.message || 'Completed'}`);
      await loadData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message);
    } finally {
      setBulkLoadingDay(null);
    }
  };

  if (loading && !registerData.members.length) {
    return (
      <div className="p-8 text-center text-slate-500 font-['Space_Mono',monospace]">
        Loading attendance register...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Legend & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 border-2 border-[#1A1A1A] rounded-xl font-['Space_Mono',monospace] text-xs">
        {/* Status Legend */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-600 uppercase text-[10px]">Legend:</span>
          {Object.entries(STATUS_CONFIG).slice(0, 5).map(([key, cfg]) => (
            <span key={key} className={`px-2 py-0.5 rounded font-bold border text-[10px] ${cfg.bg} ${cfg.text} ${cfg.border}`}>
              {cfg.short} = {cfg.label}
            </span>
          ))}
          <span className="flex items-center gap-1 text-[10px] text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
            <QrCode className="w-3 h-3 text-blue-600" /> QR
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
            <UserCheck className="w-3 h-3 text-emerald-600" /> Manual
          </span>
        </div>

        {/* Month Lock Badge */}
        {monthLock?.isLocked && (
          <div className="flex items-center gap-1 text-red-700 bg-red-100 border border-red-300 px-2 py-0.5 rounded font-bold text-[10px]">
            <Shield className="w-3 h-3" /> Month {monthKey} Finalized & Locked
          </div>
        )}
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

      {/* Register Matrix Grid */}
      <div className="bg-white border-[2.5px] border-[#1A1A1A] shadow-[4px_4px_0px_0px_#1A1A1A] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-800 border-collapse">
            <thead className="bg-[#F5F2EB] border-b-2 border-[#1A1A1A] font-['Barlow_Condensed',sans-serif] text-xs uppercase tracking-wider font-black">
              <tr>
                {/* Sticky Member Column */}
                <th className="py-3 px-4 border-r-2 border-[#1A1A1A] min-w-[200px] sticky left-0 bg-[#F5F2EB] z-20 shadow-[2px_0px_0px_0px_#1A1A1A]">
                  Team Member (Identifier)
                </th>

                {/* Day Columns */}
                {weekDays.map((day) => {
                  const dateObj = new Date(day + 'T00:00:00');
                  const weekdayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                  const dayNum = day.slice(8);
                  const isToday = day === todayIST;
                  const isFuture = day > todayIST;
                  const isLocked = monthLock?.isLocked;
                  const count = columnTotals[day] || 0;

                  return (
                    <th
                      key={day}
                      className={`py-2 px-2 text-center border-r border-slate-200 min-w-[130px] ${
                        isToday ? 'bg-amber-100 text-[#1B5299]' : ''
                      }`}
                    >
                      <div className="text-[10px] text-slate-500 font-['Space_Mono',monospace]">{weekdayName}</div>
                      <div className="text-sm font-black">{dayNum}</div>
                      <div className="text-[10px] text-slate-600 font-['Space_Mono',monospace] mt-0.5">
                        {count} P
                      </div>

                      {/* Header Column Action: Mark All Present */}
                      {!isFuture && !isLocked && (
                        <button
                          type="button"
                          onClick={() => handleMarkAllPresent(day)}
                          disabled={bulkLoadingDay === day}
                          className="mt-1 px-1.5 py-0.5 bg-[#1B5299] hover:bg-[#15427C] text-white rounded text-[9px] font-bold font-['Space_Mono',monospace] transition cursor-pointer disabled:opacity-50"
                          title={`Mark all eligible members present for ${day}`}
                        >
                          {bulkLoadingDay === day ? '...' : 'Mark all P'}
                        </button>
                      )}
                    </th>
                  );
                })}

                {/* Row Totals Column */}
                <th className="py-3 px-3 text-center min-w-[120px] bg-[#F5F2EB] font-['Space_Mono',monospace] text-[10px]">
                  Week Totals
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 font-['Space_Mono',monospace] text-xs">
              {registerData.members.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No members found for this team.
                  </td>
                </tr>
              ) : (
                registerData.members.map((member) => {
                  const totals = rowTotals[member.userId] || { present: 0, late: 0, absent: 0 };
                  const isLeadRow = Boolean(member.isLead);

                  return (
                    <tr key={member.userId} className="hover:bg-slate-50/70">
                      {/* Sticky Member Column */}
                      <td className="py-3 px-4 border-r-2 border-[#1A1A1A] bg-white sticky left-0 z-10 shadow-[2px_0px_0px_0px_#1A1A1A]">
                        <div className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                          <span>{member.name}</span>
                          {isLeadRow && (
                            <span className="text-[9px] px-1 py-0.2 bg-amber-100 text-amber-800 rounded font-bold">LEAD</span>
                          )}
                        </div>
                        {/* Display User ID or Email to tell duplicate names apart */}
                        <div className="text-[10px] text-slate-500 font-mono truncate">
                          {member.userIdentifier || member.email}
                        </div>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-bold uppercase">
                          {member.role?.replace('T1_VOLUNTEER', 'T1').replace('T2_ASSOCIATE', 'T2').replace('T3_EXECUTIVE', 'T3')}
                        </span>
                      </td>

                      {/* Day Cells */}
                      {weekDays.map((day) => {
                        const att = attendanceMap.get(`${member.userId}_${day}`);
                        const shift = assignmentMap.get(`${member.userId}_${day}`);
                        const isFuture = day > todayIST;
                        const isLocked = monthLock?.isLocked;
                        const statusCfg = att ? STATUS_CONFIG[att.status] || STATUS_CONFIG.PRESENT : null;

                        return (
                          <td
                            key={day}
                            onClick={() => handleCellClick(member, day, att, isFuture, isLocked, isLeadRow)}
                            className={`py-2 px-2 border-r border-slate-200 align-top transition-colors ${
                              isFuture || isLocked || isLeadRow
                                ? 'bg-slate-50/60 cursor-not-allowed opacity-80'
                                : 'cursor-pointer hover:bg-blue-50/60'
                            }`}
                            title={
                              isFuture
                                ? 'Cannot mark future dates'
                                : isLocked
                                ? 'Month is locked'
                                : isLeadRow
                                ? 'Lead row is read-only (anti-self-marking)'
                                : `Click to mark attendance for ${member.name}`
                            }
                          >
                            {att ? (
                              <div className="space-y-1">
                                {/* Status Chip & Source Icon */}
                                <div className="flex items-center justify-between gap-1">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border truncate ${statusCfg?.bg} ${statusCfg?.text} ${statusCfg?.border}`}>
                                    {statusCfg?.short || att.status}
                                  </span>
                                  {att.source === 'qr' ? (
                                    <span title="Source: QR Scan"><QrCode className="w-3 h-3 text-blue-600 shrink-0" /></span>
                                  ) : (
                                    <span title={`Source: Manual (${att.markedMethod})`}><UserCheck className="w-3 h-3 text-emerald-600 shrink-0" /></span>
                                  )}
                                </div>

                                {/* Shift Time & Task Count on Second Line */}
                                {shift ? (
                                  <div className="text-[9px] text-slate-500 truncate flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5 text-slate-400" />
                                    <span>{shift.startTime}–{shift.endTime}</span>
                                    {shift.taskCount > 0 && <span className="text-blue-600">({shift.taskCount}t)</span>}
                                  </div>
                                ) : (
                                  <div className="text-[9px] text-slate-400">No shift</div>
                                )}

                                {/* Pending Correction Badge */}
                                {att.pendingCorrection && (
                                  <span className="block text-center px-1 py-0.2 bg-amber-100 text-amber-800 border border-amber-300 rounded text-[8px] font-bold">
                                    CORR PENDING
                                  </span>
                                )}
                              </div>
                            ) : shift ? (
                              <div className="space-y-1">
                                <span className="block text-center py-1 bg-slate-100 border border-dashed border-slate-300 rounded text-[10px] text-slate-500 font-bold">
                                  Unmarked
                                </span>
                                <div className="text-[9px] text-slate-500 truncate text-center">
                                  {shift.startTime}–{shift.endTime}
                                </div>
                              </div>
                            ) : (
                              <div className="py-3 text-center text-slate-300 font-mono text-[10px]">
                                --
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* Row Totals Column */}
                      <td className="py-2 px-3 text-center bg-slate-50/80 font-mono text-[11px] font-bold">
                        <span className="text-emerald-700">{totals.present}P</span>
                        <span className="text-slate-300 mx-1">|</span>
                        <span className="text-amber-700">{totals.late}L</span>
                        <span className="text-slate-300 mx-1">|</span>
                        <span className="text-red-700">{totals.absent}A</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MARKING DIALOG / BOTTOM SHEET ON MOBILE */}
      {dialogOpen && selectedCell && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white border-t-[3px] sm:border-[3px] border-[#1A1A1A] shadow-[0px_-4px_0px_0px_#1A1A1A] sm:shadow-[6px_6px_0px_0px_#1A1A1A] rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full max-w-md font-['Space_Mono',monospace] text-xs">
            <div className="flex items-center justify-between mb-4 border-b pb-3 border-slate-200">
              <div>
                <h2 className="text-xl font-black font-['Barlow_Condensed',sans-serif] uppercase text-slate-900">
                  Mark Attendance
                </h2>
                <p className="text-slate-500 text-[11px]">
                  {selectedCell.member.name} • {selectedCell.day}
                </p>
              </div>
              <button onClick={() => setDialogOpen(false)}><X className="w-5 h-5 text-slate-700" /></button>
            </div>

            {dialogError && (
              <p className="p-2 mb-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-[11px] font-bold">
                {dialogError}
              </p>
            )}

            <form onSubmit={handleSaveAttendance} className="space-y-4">
              {/* Status Selector Chips */}
              <div>
                <label className="block font-bold mb-2 text-slate-700">Select Status</label>
                <div className="grid grid-cols-3 gap-2">
                  {['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE'].map((st) => {
                    const cfg = STATUS_CONFIG[st];
                    const isSelected = markStatus === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setMarkStatus(st)}
                        className={`py-2 px-2 rounded-lg font-bold text-center border text-xs transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#1B5299] text-white border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A]'
                            : `${cfg.bg} ${cfg.text} ${cfg.border} hover:opacity-80`
                        }`}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Note / Reason Field */}
              <div>
                <label className="block font-bold mb-1 text-slate-700">
                  Note / Reason {(['LATE', 'ABSENT'].includes(markStatus) || selectedCell.isQrOverride) && <span className="text-red-600">* (Required)</span>}
                </label>
                <textarea
                  rows="3"
                  maxLength={500}
                  placeholder={
                    selectedCell.isQrOverride
                      ? 'Explaining why this QR-scanned punch is being overridden...'
                      : ['LATE', 'ABSENT'].includes(markStatus)
                      ? 'Reason required for absent/late attendance...'
                      : 'Optional notes...'
                  }
                  value={markNote}
                  onChange={(e) => setMarkNote(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg outline-none bg-white text-xs"
                />
                <div className="text-[10px] text-slate-400 text-right mt-0.5">{markNote.length}/500</div>
              </div>

              {/* Audit history notice */}
              {selectedCell.existingAtt && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-500 space-y-1">
                  <div>Previous status: <span className="font-bold text-slate-700">{selectedCell.existingAtt.status}</span></div>
                  <div>Marked by: {selectedCell.existingAtt.markedMethod}</div>
                  {selectedCell.existingAtt.note && <div>Previous note: &quot;{selectedCell.existingAtt.note}&quot;</div>}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setDialogOpen(false)}
                  className="px-4 py-2 border-2 border-[#1A1A1A] rounded-xl font-bold cursor-pointer hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || ((['LATE', 'ABSENT'].includes(markStatus) || selectedCell.isQrOverride) && !markNote.trim())}
                  className="px-4 py-2 bg-[#1B5299] hover:bg-[#15427C] text-white font-bold border-2 border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A] rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Attendance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
