import React, { useState, useEffect } from 'react';
import { Clock, Download, RefreshCw, AlertCircle, FileText } from 'lucide-react';
import api from '../../lib/api';

export const ExceptionsTab = ({ canExport = false }) => {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchExceptions = async (m) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/hr/attendance-exceptions?month=${m}`);
      setExceptions(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load attendance exceptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExceptions(month);
  }, [month]);

  const handleExportCsv = async () => {
    try {
      const res = await api.get(`/hr/export/attendance-exceptions?month=${month}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance_exceptions_${month}.csv`);
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

      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-bold text-slate-800">Select Month:</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-white border border-slate-300 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600 font-mono font-semibold"
          />
        </div>

        {canExport && (
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 hover:bg-slate-100 bg-white text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Exception CSV</span>
          </button>
        )}
      </div>

      <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-[11px] text-blue-800 flex items-center gap-2">
        <FileText className="w-4 h-4 text-blue-600 shrink-0" />
        <span>
          Read-only summary of workforce attendance exceptions for {month}.
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-8 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          <span className="text-xs">Calculating monthly exception tallies...</span>
        </div>
      ) : exceptions.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500">No attendance exceptions found for {month}.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-xs">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-2.5">Student Member</th>
                <th className="px-4 py-2.5">Month</th>
                <th className="px-4 py-2.5">Late Arrivals</th>
                <th className="px-4 py-2.5">Absences</th>
                <th className="px-4 py-2.5">On Leave</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exceptions.map((ex) => (
                <tr key={ex.employeeId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-slate-900">{ex.employeeName}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{ex.month}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full font-mono font-bold text-[11px] ${
                        ex.lateCount > 0 ? 'bg-amber-100 text-amber-800' : 'text-slate-400'
                      }`}
                    >
                      {ex.lateCount}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full font-mono font-bold text-[11px] ${
                        ex.absentCount > 0 ? 'bg-rose-100 text-rose-800' : 'text-slate-400'
                      }`}
                    >
                      {ex.absentCount}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full font-mono font-bold text-[11px] ${
                        ex.onLeaveCount > 0 ? 'bg-blue-100 text-blue-800' : 'text-slate-400'
                      }`}
                    >
                      {ex.onLeaveCount}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
