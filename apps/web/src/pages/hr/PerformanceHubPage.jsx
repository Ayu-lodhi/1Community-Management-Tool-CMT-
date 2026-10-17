import React, { useState, useEffect, useCallback } from 'react';
import {
  Award, TrendingUp, Calendar, Download, RefreshCw, CheckCircle2,
  AlertCircle, ShieldCheck, UserCheck, Star
} from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../pages';

export const PerformanceHubPage = () => {
  const { user } = useAuth();
  const isSupervisor = ['T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role);

  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [factors, setFactors] = useState([]);
  const [members, setMembers] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [personalReviews, setPersonalReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState({});
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Load factors & teams
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [factorRes, teamsRes] = await Promise.all([
        api.get('/hr/factors'),
        isSupervisor ? api.get('/teams') : Promise.resolve({ data: { data: [] } }),
      ]);

      if (factorRes.data?.data) {
        setFactors(factorRes.data.data);
      }

      if (teamsRes.data?.data && Array.isArray(teamsRes.data.data)) {
        setTeams(teamsRes.data.data);
        if (teamsRes.data.data.length > 0 && !selectedTeamId) {
          setSelectedTeamId(teamsRes.data.data[0]._id);
        }
      }

      // If regular student/volunteer, load personal history
      if (!isSupervisor) {
        const histRes = await api.get(`/hr/reviews/member/${user?._id || user?.sub}`);
        if (histRes.data?.data) {
          setPersonalReviews(histRes.data.data);
        }
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to load initial data');
    } finally {
      setLoading(false);
    }
  }, [isSupervisor, selectedTeamId, user]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Load team roster and existing reviews when selected team changes
  const loadTeamData = useCallback(async () => {
    if (!selectedTeamId || !isSupervisor) return;
    try {
      const [reviewsRes, teamRes] = await Promise.all([
        api.get(`/hr/reviews/team/${selectedTeamId}?fromDate=${fromDate}&toDate=${toDate}`),
        api.get(`/teams/${selectedTeamId}`),
      ]);

      if (reviewsRes.data?.data?.reviews) {
        setReviews(reviewsRes.data.data.reviews);
      }

      if (teamRes.data?.data?.members) {
        setMembers(teamRes.data.data.members);
      }
    } catch (err) {
      console.warn('Team reviews fetch note:', err.message);
    }
  }, [selectedTeamId, fromDate, toDate, isSupervisor]);

  useEffect(() => {
    loadTeamData();
  }, [loadTeamData]);

  const handleScoreChange = (memberId, factorId, val) => {
    setScores((prev) => ({
      ...prev,
      [`${memberId}_${factorId}`]: Number(val),
    }));
  };

  const handleNoteChange = (memberId, val) => {
    setNotes((prev) => ({
      ...prev,
      [memberId]: val,
    }));
  };

  // Computes weighted score percentage
  const computeMemberScore = (memberId) => {
    let max = 0;
    let obt = 0;
    for (const factor of factors) {
      const bench = factor.benchmarkScore || 10;
      const weight = factor.weight || 1;
      const scored = scores[`${memberId}_${factor._id}`] ?? bench;
      max += bench * weight;
      obt += Math.min(bench, Math.max(0, scored)) * weight;
    }
    if (max === 0) return 0;
    return Math.round((obt / max) * 100 * 100) / 100;
  };

  const handleSubmitReview = async (member) => {
    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const factorScores = factors.map((f) => ({
        factorId: f._id,
        factorName: f.name,
        benchmarkScore: f.benchmarkScore,
        weight: f.weight,
        obtainedScore: scores[`${member._id}_${f._id}`] ?? f.benchmarkScore,
      }));

      await api.post('/hr/reviews', {
        employeeId: member._id,
        fromDate,
        toDate,
        factorScores,
        notes: notes[member._id] || '',
      });

      setSuccessMsg(`Evaluation submitted successfully for ${member.name}`);
      loadTeamData();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCsv = async () => {
    if (!selectedTeamId) return;
    try {
      const res = await api.get(`/hr/export/reviews/${selectedTeamId}?fromDate=${fromDate}&toDate=${toDate}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `reviews_${selectedTeamId}_${fromDate}_to_${toDate}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setErrorMsg('Failed to export CSV: ' + err.message);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Performance Review Hub</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Multi-factor weighted evaluation for team members and founder milestones.
              </p>
            </div>
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
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Date Window Controls */}
      {isSupervisor && (
        <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span>Evaluation Window:</span>
          </div>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="p-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="p-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
          />
        </div>
      )}

      {/* Supervisor Review Matrix */}
      {isSupervisor ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-base font-bold text-gray-900">Member Performance Matrix</h2>
            <span className="text-xs text-gray-400 font-medium">
              {factors.length} active factors configured
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-700">
              <thead className="bg-gray-50/80 border-b border-gray-100 text-xs uppercase font-semibold text-gray-500">
                <tr>
                  <th className="py-3.5 px-4">Member Name</th>
                  {factors.map((f) => (
                    <th key={f._id} className="py-3.5 px-3 text-center">
                      <div>{f.name}</div>
                      <div className="text-[10px] text-gray-400 font-normal">
                        Max: {f.benchmarkScore} (x{f.weight})
                      </div>
                    </th>
                  ))}
                  <th className="py-3.5 px-3">Notes</th>
                  <th className="py-3.5 px-3 text-right">Weighted Score</th>
                  <th className="py-3.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={factors.length + 4} className="py-8 text-center text-gray-400 text-sm">
                      No members assigned to this team.
                    </td>
                  </tr>
                ) : (
                  members.map((member) => {
                    const percentage = computeMemberScore(member._id);

                    return (
                      <tr key={member._id} className="hover:bg-gray-50/60 transition">
                        <td className="py-3.5 px-4 font-medium text-gray-900">
                          <div>{member.name}</div>
                          <div className="text-xs text-gray-400 font-normal">{member.email}</div>
                        </td>

                        {factors.map((f) => (
                          <td key={f._id} className="py-3.5 px-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max={f.benchmarkScore}
                              value={scores[`${member._id}_${f._id}`] ?? f.benchmarkScore}
                              onChange={(e) => handleScoreChange(member._id, f._id, e.target.value)}
                              className="w-16 p-1.5 border border-gray-200 rounded-lg text-center text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                        ))}

                        <td className="py-3.5 px-3">
                          <input
                            type="text"
                            placeholder="Feedback note..."
                            value={notes[member._id] || ''}
                            onChange={(e) => handleNoteChange(member._id, e.target.value)}
                            className="w-36 p-1.5 border border-gray-200 rounded-lg text-xs"
                          />
                        </td>

                        <td className="py-3.5 px-3 text-right font-mono font-bold">
                          <span
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                              percentage >= 80
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : percentage >= 60
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}
                          >
                            {percentage.toFixed(2)}%
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => handleSubmitReview(member)}
                            disabled={submitting}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition disabled:opacity-50"
                          >
                            Save
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Regular Student/Volunteer Self-Service View */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">My Performance Evaluation History</h2>
          <div className="space-y-3">
            {personalReviews.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                No performance evaluations on record yet.
              </div>
            ) : (
              personalReviews.map((rev) => (
                <div key={rev._id} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 flex justify-between items-center">
                  <div>
                    <div className="text-xs text-gray-400 font-medium">
                      Period: {rev.fromDate} to {rev.toDate}
                    </div>
                    <div className="text-sm font-semibold text-gray-800 mt-1">
                      Evaluated by {rev.reviewerName}
                    </div>
                    {rev.notes && <p className="text-xs text-gray-600 mt-1 italic">"{rev.notes}"</p>}
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-bold font-mono text-blue-600">
                      {rev.netScorePercentage.toFixed(2)}%
                    </span>
                    <div className="text-[11px] text-gray-400 font-medium">
                      {rev.obtainedWeightedScore} / {rev.maxWeightedScore} pts
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
