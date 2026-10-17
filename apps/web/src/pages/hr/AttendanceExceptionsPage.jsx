import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock, AlertTriangle, Calendar, Download, RefreshCw, CheckCircle2,
  UsersRound, AlertCircle, ShieldAlert
} from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../pages';

export const AttendanceExceptionsPage = () => {
  const { user } = useAuth();
  const isSupervisor = ['T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role);

  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [exceptionData, setExceptionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch supervisor teams
  useEffect(() => {
    async function fetchTeams() {
      if (!isSupervisor) return;
      try {
        const res = await api.get('/teams');
        if (res.data?.data && Array.isArray(res.data.data)) {
          setTeams(res.data.data);
          if (res.data.data.length > 0) {
            setSelectedTeamId(res.data.data[0]._id);
          }
        }
      } catch (err) {
        setErrorMsg('Failed to load teams: ' + err.message);
      }
    }
    fetchTeams();
  }, [isSupervisor]);

  // Load team monthly exceptions
  const loadExceptions = useCallback(async () => {
    if (!selectedTeamId || !month) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.get(`/hr/attendance/exceptions/team/${selectedTeamId}?month=${month}`);
      if (res.data?.data) {
        setExceptionData(res.data.data);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to load attendance exceptions');
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId, month]);

  useEffect(() => {
    loadExceptions();
  }, [loadExceptions]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-50 text-red-600 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Attendance Exception Register</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Tracks late coming, early departures, penalty days, and chronic tardiness infractions.
            </p>
          </div>
        </div>

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

          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700"
          />

          <button
            onClick={loadExceptions}
            className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-sm">
          {errorMsg}
        </div>
      )}

      {/* Policy Notification Strip */}
      {exceptionData?.policy && (
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex flex-wrap justify-between items-center gap-3 text-sm text-blue-900 font-medium">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            <span>
              Active Threshold Rule: Every <strong>{exceptionData.policy.lateComingThreshold} late arrivals</strong> incur a{' '}
              <strong>{exceptionData.policy.penaltyDaysPerThreshold} day</strong> attendance penalty.
            </span>
          </div>
          <span className="text-xs uppercase tracking-wide bg-blue-200/60 px-2.5 py-1 rounded-md text-blue-800 font-bold">
            Policy: GLOBAL
          </span>
        </div>
      )}

      {/* Roster Exceptions Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {exceptionData?.teamName || 'Team'} — {month} Roster Infractions
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-gray-50/80 border-b border-gray-100 text-xs uppercase font-semibold text-gray-500">
              <tr>
                <th className="py-3.5 px-4">Member</th>
                <th className="py-3.5 px-3 text-center">Days Present</th>
                <th className="py-3.5 px-3 text-center">Late Arrivals</th>
                <th className="py-3.5 px-3 text-center">Early Exits</th>
                <th className="py-3.5 px-3 text-center">Penalty Days</th>
                <th className="py-3.5 px-3 text-center">Net Attended Days</th>
                <th className="py-3.5 px-4 text-center">Compliance Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400 text-sm">
                    Loading attendance exceptions...
                  </td>
                </tr>
              ) : !exceptionData?.members || exceptionData.members.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400 text-sm">
                    No attendance records logged for this team and month.
                  </td>
                </tr>
              ) : (
                exceptionData.members.map((entry) => (
                  <tr key={entry.member._id} className="hover:bg-gray-50/60 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-gray-900">{entry.member.name}</div>
                      <div className="text-xs text-gray-400">{entry.member.email}</div>
                    </td>

                    <td className="py-3.5 px-3 text-center font-medium text-gray-800">
                      {entry.daysPresent} d
                    </td>

                    <td className="py-3.5 px-3 text-center">
                      <span
                        className={`font-semibold ${
                          entry.lateCount > 0 ? 'text-amber-600' : 'text-gray-500'
                        }`}
                      >
                        {entry.lateCount}
                      </span>
                    </td>

                    <td className="py-3.5 px-3 text-center text-gray-500">
                      {entry.earlyExitCount}
                    </td>

                    <td className="py-3.5 px-3 text-center font-mono font-semibold text-red-600">
                      {entry.penaltyDays > 0 ? `-${entry.penaltyDays} d` : '0 d'}
                    </td>

                    <td className="py-3.5 px-3 text-center font-mono font-bold text-blue-600">
                      {entry.netAttendedDays} d
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {entry.isChronicTardy ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-md">
                          <ShieldAlert className="w-3.5 h-3.5" /> Chronic Tardiness
                        </span>
                      ) : entry.lateCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md">
                          Minor Tardiness
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Clean Record
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
