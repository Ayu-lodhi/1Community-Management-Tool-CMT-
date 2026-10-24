import React, { useState, useEffect } from 'react';
import {
  Award, Calendar, CheckCircle2, AlertCircle, Clock,
  RefreshCw, User, Briefcase, FileText, ChevronRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';

export const MyScorecardPage = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');

  const fetchScorecard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/hr/my-scorecard');
      const payload = res.data?.data || null;
      setData(payload);
      if (payload?.reviews?.length > 0) {
        setSelectedPeriod(payload.reviews[0].period);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load your scorecard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScorecard();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mb-3 text-blue-600" />
        <span className="text-xs font-semibold">Loading your scorecard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-2xl max-w-lg mx-auto text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-sm font-bold text-slate-900">Scorecard Unavailable</h3>
        <p className="text-xs text-red-600">{error}</p>
        <button
          onClick={fetchScorecard}
          className="px-4 py-2 bg-white border border-red-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-red-100 transition cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  const reviews = data?.reviews || [];
  const activeReview = reviews.find((r) => r.period === selectedPeriod) || reviews[0] || null;
  const attendance = data?.attendanceSummary || {
    totalRecords: 0,
    presentCount: 0,
    lateCount: 0,
    absentCount: 0,
    onLeaveCount: 0,
    attendanceRate: 100,
  };
  const profile = data?.profile || {};

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page Header & Student Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight font-['Barlow_Condensed',sans-serif] uppercase">
              My Student Scorecard
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              {user?.role === 'T1_VOLUNTEER' ? 'T1 Volunteer' : user?.role === 'T2_ASSOCIATE' ? 'T2 Associate' : user?.role}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            View your monthly performance appraisals, manager feedback, and attendance record.
          </p>
        </div>

        {/* Member Profile Quick Meta */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 bg-slate-50 border border-slate-200/80 p-3 rounded-xl">
          <div className="flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-blue-600" />
            <span>Wing: <strong className="text-slate-800">{profile.department || 'General'}</strong></span>
          </div>
          <span className="text-slate-300">•</span>
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-blue-600" />
            <span>Role: <strong className="text-slate-800">{profile.post || 'Member'}</strong></span>
          </div>
          {profile.joiningDate && (
            <>
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Joined: <strong className="text-slate-800 font-mono">{profile.joiningDate}</strong></span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* High-level KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Latest Evaluation Score */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold">Performance Score</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 font-['Space_Mono',monospace]">
              {activeReview ? `${activeReview.netScorePercentage.toFixed(1)}%` : '—'}
            </span>
            {activeReview && (
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  activeReview.netScorePercentage >= 80
                    ? 'bg-emerald-100 text-emerald-800'
                    : activeReview.netScorePercentage >= 60
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {activeReview.netScorePercentage >= 80 ? 'Exemplary' : activeReview.netScorePercentage >= 60 ? 'Good' : 'Needs Focus'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {activeReview ? `Period: ${activeReview.period}` : 'No evaluation on record'}
          </p>
        </div>

        {/* Overall Attendance Rate */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold">Attendance Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 font-['Space_Mono',monospace]">
              {attendance.attendanceRate}%
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              ({attendance.presentCount + attendance.lateCount}/{attendance.totalRecords} sessions)
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {attendance.lateCount > 0 ? `${attendance.lateCount} late arrival(s) recorded` : 'Perfect punctuality'}
          </p>
        </div>

        {/* Evaluation History Count */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold">Appraisals Completed</span>
            <FileText className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 font-['Space_Mono',monospace]">
              {reviews.length}
            </span>
            <span className="text-[11px] text-slate-500 font-medium">months</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Reviewed by student management leads
          </p>
        </div>
      </div>

      {/* Main Review Details */}
      {reviews.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center space-y-2 shadow-xs">
          <Award className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">No Appraisals Recorded Yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Your team manager has not submitted a monthly performance evaluation yet. Check back at the end of the monthly period.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Period Selector Tabs */}
          <div className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-bold text-slate-800">Select Month:</span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {reviews.map((rev) => (
                <button
                  key={rev.period}
                  onClick={() => setSelectedPeriod(rev.period)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    selectedPeriod === rev.period
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {rev.period} ({rev.netScorePercentage.toFixed(0)}%)
                </button>
              ))}
            </div>
          </div>

          {activeReview && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-6">
              {/* Review Overview Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Monthly Performance Appraisal: {activeReview.period}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Evaluated by: <strong className="text-slate-800">{activeReview.reviewerName || 'Team Manager'}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="block text-[10px] text-slate-400 uppercase font-semibold">Total Score</span>
                    <span className="text-lg font-black text-blue-600 font-mono">
                      {activeReview.obtainedWeightedScore} / {activeReview.maxWeightedScore} pts
                    </span>
                  </div>
                </div>
              </div>

              {/* Detailed Evaluation Criteria Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                  Evaluation Criteria Breakdown
                </h4>
                {activeReview.items?.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No factor breakdowns logged for this review.</p>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="px-4 py-2.5">Criteria</th>
                          <th className="px-4 py-2.5">Weight</th>
                          <th className="px-4 py-2.5">Max Benchmark</th>
                          <th className="px-4 py-2.5">Score Awarded</th>
                          <th className="px-4 py-2.5 w-1/4">Progress</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeReview.items.map((item, idx) => {
                          const pct = item.benchmarkScore > 0 ? Math.round((item.obtainedScore / item.benchmarkScore) * 100) : 0;
                          return (
                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                              <td className="px-4 py-2.5 font-bold text-slate-900">{item.factorName}</td>
                              <td className="px-4 py-2.5 font-mono text-slate-500">x{item.weight || 1}</td>
                              <td className="px-4 py-2.5 font-mono text-slate-500">{item.benchmarkScore} pts</td>
                              <td className="px-4 py-2.5 font-mono font-bold text-slate-800">
                                {item.obtainedScore} pts
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : 'bg-amber-500'
                                      }`}
                                      style={{ width: `${Math.min(100, pct)}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-400 shrink-0 w-8 text-right">
                                    {pct}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Manager Feedback Note Card */}
              {activeReview.notes && (
                <div className="p-4 bg-blue-50/60 border border-blue-200/80 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-2 text-blue-900 text-xs font-bold">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>Manager Feedback & Notes</span>
                  </div>
                  <p className="text-xs text-blue-950 leading-relaxed font-sans">
                    "{activeReview.notes}"
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Attendance Record Footer */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          <span className="font-bold text-slate-800">Overall Attendance Breakdown:</span>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-semibold">
            Present: {attendance.presentCount}
          </span>
          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg font-semibold">
            Late: {attendance.lateCount}
          </span>
          <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg font-semibold">
            Absent: {attendance.absentCount}
          </span>
          <span className="px-2.5 py-1 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg font-semibold">
            On Leave: {attendance.onLeaveCount}
          </span>
        </div>
      </div>
    </div>
  );
};
