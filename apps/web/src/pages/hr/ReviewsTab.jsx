import React, { useState, useEffect } from 'react';
import { Award, Plus, Download, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';

export const ReviewsTab = ({ canExport = false }) => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Dropdown data
  const [employees, setEmployees] = useState([]);
  const [factors, setFactors] = useState([]);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    employeeId: '',
    period: new Date().toISOString().slice(0, 7), // YYYY-MM
    notes: '',
  });
  const [scores, setScores] = useState({}); // factorId -> obtainedScore

  const fetchReviews = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/hr/reviews');
      setReviews(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load performance reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();

    const userEndpoint = user?.role === 'T3_EXECUTIVE' ? '/teams/me/members' : '/admin/users';
    const currentUserId = user?.sub || user?._id || user?.id;

    Promise.all([
      api.get(userEndpoint).catch(() => ({ data: { data: [] } })),
      api.get('/hr/masters/performance-factors').catch(() => ({ data: { data: [] } })),
    ]).then(([empRes, factRes]) => {
      const rawEmps = Array.isArray(empRes.data?.data) ? empRes.data.data : [];
      const emps = rawEmps.filter((e) => (e._id || e.id)?.toString() !== currentUserId?.toString());
      const facts = factRes.data?.data || [];
      setEmployees(emps);
      setFactors(facts);
      if (emps.length > 0) {
        setReviewForm((prev) => ({ ...prev, employeeId: emps[0]._id || emps[0].id }));
      }
      const initialScores = {};
      for (const f of facts) {
        initialScores[f._id] = f.benchmarkScore; // default to full benchmark
      }
      setScores(initialScores);
    });
  }, [user]);

  // Live score calculation
  const calculateLiveScore = () => {
    let max = 0;
    let obt = 0;
    for (const f of factors) {
      const bench = Number(f.benchmarkScore) || 0;
      const weight = Number(f.weight) || 1;
      const val = Math.min(bench, Math.max(0, Number(scores[f._id]) || 0));
      max += bench * weight;
      obt += val * weight;
    }
    if (max === 0) return 0;
    return Math.round((obt / max) * 10000) / 100;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const items = factors.map((f) => ({
        factorId: f._id,
        factorName: f.name,
        benchmarkScore: f.benchmarkScore,
        weight: f.weight,
        obtainedScore: Math.min(f.benchmarkScore, Math.max(0, Number(scores[f._id]) || 0)),
      }));

      await api.post('/hr/reviews', {
        employeeId: reviewForm.employeeId,
        period: reviewForm.period,
        items,
        notes: reviewForm.notes.trim(),
      });

      setSuccess('Performance review submitted successfully.');
      setModalOpen(false);
      fetchReviews();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const res = await api.get('/hr/export/reviews', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'performance_reviews.csv');
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
        <h3 className="text-sm font-bold text-slate-800">Performance Reviews</h3>
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
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Submit Review</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-8 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          <span className="text-xs">Loading performance reviews...</span>
        </div>
      ) : reviews.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500">No performance reviews recorded.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-xs">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-2.5">Student Member</th>
                <th className="px-4 py-2.5">Period</th>
                <th className="px-4 py-2.5">Score</th>
                <th className="px-4 py-2.5">Max Score</th>
                <th className="px-4 py-2.5">Obtained</th>
                <th className="px-4 py-2.5">Reviewer</th>
                <th className="px-4 py-2.5">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reviews.map((rev) => (
                <tr key={rev._id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-slate-900">{rev.employeeName}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-600">{rev.period}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-black ${
                        rev.netScorePercentage >= 80
                          ? 'bg-emerald-100 text-emerald-800'
                          : rev.netScorePercentage >= 60
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {rev.netScorePercentage.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{rev.maxWeightedScore}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{rev.obtainedWeightedScore}</td>
                  <td className="px-4 py-2.5 text-slate-600">{rev.reviewerName}</td>
                  <td className="px-4 py-2.5 text-slate-500 truncate max-w-xs">{rev.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Submit Review Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-blue-600" />
              <span>Submit Performance Review</span>
            </h4>
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Student Member</label>
                  <select
                    required
                    value={reviewForm.employeeId}
                    onChange={(e) => setReviewForm({ ...reviewForm, employeeId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600"
                  >
                    {employees.map((emp) => (
                      <option key={emp._id || emp.id} value={emp._id || emp.id}>
                        {emp.name} ({emp.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Period (Month)</label>
                  <input
                    type="month"
                    required
                    value={reviewForm.period}
                    onChange={(e) => setReviewForm({ ...reviewForm, period: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600 font-mono"
                  />
                </div>
              </div>

              {/* Factors Scoring List */}
              <div className="space-y-2 border-t border-b border-slate-100 py-3">
                <label className="block text-slate-700 font-bold uppercase text-[10px] tracking-wider mb-2">
                  Factor Benchmarks & Scores
                </label>
                {factors.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">No active factors configured in Masters.</p>
                ) : (
                  factors.map((f) => (
                    <div
                      key={f._id}
                      className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{f.name}</div>
                        <div className="text-[10px] text-slate-500">
                          Benchmark: {f.benchmarkScore} pts | Weight: {f.weight}x
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={f.benchmarkScore}
                          value={scores[f._id] ?? f.benchmarkScore}
                          onChange={(e) =>
                            setScores({ ...scores, [f._id]: Number(e.target.value) })
                          }
                          className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-md font-mono text-center font-bold text-slate-800 outline-none focus:border-blue-600"
                        />
                        <span className="text-slate-400 font-mono">/ {f.benchmarkScore}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Live Preview Score */}
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 p-3 rounded-xl">
                <span className="font-bold text-blue-900">Weighted Score Preview:</span>
                <span className="text-base font-black font-mono text-blue-700">
                  {calculateLiveScore()}%
                </span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Feedback Notes</label>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={reviewForm.notes}
                  onChange={(e) => setReviewForm({ ...reviewForm, notes: e.target.value })}
                  placeholder="Review observations, achievements, guidance..."
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || factors.length === 0}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs transition disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Save Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
