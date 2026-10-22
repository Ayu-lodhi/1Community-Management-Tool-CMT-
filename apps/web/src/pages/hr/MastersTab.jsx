import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '../../lib/api';

const MASTER_TYPES = [
  { id: 'departments', label: 'Departments' },
  { id: 'posts', label: 'Posts / Job Titles' },
  { id: 'employee-categories', label: 'Employee Categories' },
  { id: 'performance-factors', label: 'Performance Factors' },
];

export const MastersTab = ({ canManage = false }) => {
  const [activeType, setActiveType] = useState('departments');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modal form state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '', benchmarkScore: 10, weight: 1 });
  const [submitting, setSubmitting] = useState(false);

  const fetchItems = async (type) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/hr/masters/${type}`);
      setItems(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load master records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems(activeType);
  }, [activeType]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ name: '', description: '', benchmarkScore: 10, weight: 1 });
    setModalOpen(true);
  };

  const handleOpenEdit = (item) => {
    setEditingId(item._id);
    setFormData({
      name: item.name,
      description: item.description || '',
      benchmarkScore: item.benchmarkScore || 10,
      weight: item.weight || 1,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
      };
      if (activeType === 'performance-factors') {
        payload.benchmarkScore = Number(formData.benchmarkScore);
        payload.weight = Number(formData.weight);
      }

      if (editingId) {
        await api.patch(`/hr/masters/${activeType}/${editingId}`, payload);
        setSuccess('Master record updated successfully.');
      } else {
        await api.post(`/hr/masters/${activeType}`, payload);
        setSuccess('Master record created successfully.');
      }
      setModalOpen(false);
      fetchItems(activeType);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save master record');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to deactivate "${name}"?`)) return;
    try {
      await api.delete(`/hr/masters/${activeType}/${id}`);
      setSuccess('Record deactivated successfully.');
      fetchItems(activeType);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete record');
    }
  };

  return (
    <div className="space-y-4">
      {/* Type navigation tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {MASTER_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveType(t.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeType === t.id
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

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
        <h3 className="text-sm font-bold text-slate-800">
          {MASTER_TYPES.find((t) => t.id === activeType)?.label}
        </h3>
        {canManage && (
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-8 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          <span className="text-xs">Loading records...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500">No records found for this master type.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-xs">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Description</th>
                {activeType === 'performance-factors' && (
                  <>
                    <th className="px-4 py-2.5">Benchmark</th>
                    <th className="px-4 py-2.5">Weight</th>
                  </>
                )}
                {canManage && <th className="px-4 py-2.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item._id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{item.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{item.description || '—'}</td>
                  {activeType === 'performance-factors' && (
                    <>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{item.benchmarkScore}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{item.weight}x</td>
                    </>
                  )}
                  {canManage && (
                    <td className="px-4 py-2.5 text-right space-x-2">
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="text-slate-500 hover:text-blue-600 transition"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5 inline" />
                      </button>
                      <button
                        onClick={() => handleDelete(item._id, item.name)}
                        className="text-slate-500 hover:text-red-600 transition"
                        title="Deactivate"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Dialog */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-slate-200">
            <h4 className="text-sm font-bold text-slate-900 mb-3">
              {editingId ? 'Edit Record' : 'Add New Record'}
            </h4>
            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
                />
              </div>
              {activeType === 'performance-factors' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Benchmark Score</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={formData.benchmarkScore}
                      onChange={(e) => setFormData({ ...formData, benchmarkScore: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-blue-600 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Weight</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={formData.weight}
                      onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-blue-600 font-mono"
                    />
                  </div>
                </div>
              )}
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
                  disabled={submitting}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs transition disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
