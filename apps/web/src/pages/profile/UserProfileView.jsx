import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../pages';
import api from '../../api';
import {
  User, Mail, Phone, MapPin, Briefcase, GraduationCap,
  ExternalLink, CheckCircle2, AlertCircle, ArrowLeft, Shield, Award
} from 'lucide-react';

const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  T3_EXECUTIVE: 'T3 Executive',
  T2_ASSOCIATE: 'T2 Associate',
  T1_VOLUNTEER: 'T1 Volunteer',
  STUDENT: 'Student',
  EMPLOYEE: 'Employee',
};

const getDisplayTier = (role, tier) => {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'T3_EXECUTIVE') {
    return tier && tier !== 'T1' ? tier : 'T3';
  }
  return tier || 'T1';
};

export const UserProfileView = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [targetUser, setTargetUser] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Tier change state (for Admin / Super Admin)
  const [selectedTier, setSelectedTier] = useState('T1');
  const [tierReason, setTierReason] = useState('');
  const [tierModal, setTierModal] = useState(false);
  const [updatingTier, setUpdatingTier] = useState(false);

  const isAdminOrSuperAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN';

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/profile/${userId}`);
      if (res.data?.success) {
        setTargetUser(res.data.data.user || null);
        setProfile(res.data.data.profile || null);
        setCompletion(res.data.data.completion || null);
        setProgress(res.data.data.progress || null);
        if (res.data.data.user?.tier) {
          setSelectedTier(res.data.data.user.tier);
        }
      }
    } catch (err) {
      if (err.response?.status === 403) {
        setError('403 Forbidden: You do not have permission to view this user’s profile.');
      } else if (err.response?.status === 404) {
        setError('404 Not Found: The requested user profile does not exist.');
      } else {
        setError(err.response?.data?.message || 'Failed to load user profile');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) fetchProfile();
  }, [userId]);

  const handleChangeTier = async (e) => {
    e.preventDefault();
    setUpdatingTier(true);
    setError('');
    setSuccess('');

    try {
      const res = await api.patch(`/admin/users/${userId}/tier`, {
        tier: selectedTier,
        reason: tierReason.trim(),
      });
      if (res.data?.success) {
        setSuccess(`User tier successfully updated to ${selectedTier}!`);
        setTierModal(false);
        setTierReason('');
        if (targetUser) setTargetUser({ ...targetUser, tier: selectedTier });
        setTimeout(() => setSuccess(''), 4000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user tier');
    } finally {
      setUpdatingTier(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1B5299]" />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] p-6 flex items-center justify-center">
        <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-8 max-w-lg w-full text-center shadow-[7px_7px_0px_0px_#1A1A1A]">
          <AlertCircle className="w-12 h-12 text-[#C8322B] mx-auto mb-3" />
          <h2 className="font-['Barlow_Condensed',sans-serif] font-black text-2xl uppercase mb-2">Access Notice</h2>
          <p className="font-['Space_Mono',monospace] text-xs text-slate-600 mb-6">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2.5 bg-[#1B5299] text-white font-['Barlow_Condensed',sans-serif] font-black uppercase tracking-wider rounded-xl border-2 border-[#1A1A1A] shadow-[3px_3px_0px_0px_#1A1A1A] hover:bg-[#143e75]"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#1A1A1A] p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Navigation back */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 font-['Space_Mono',monospace] text-xs font-bold text-[#1B5299] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        {/* Notifications */}
        {success && (
          <div className="p-4 bg-[#E5F9E7] text-[#1A7F37] border-2 border-[#1A1A1A] rounded-xl font-['Space_Mono',monospace] text-xs shadow-[3px_3px_0px_0px_#1A1A1A] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{success}</span>
          </div>
        )}

        {/* Profile Card */}
        <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 sm:p-8 shadow-[7px_7px_0px_0px_#1A1A1A] relative">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-[2.5px] border-[#1A1A1A] bg-[#F5F2EB] shadow-[3px_3px_0px_0px_#1A1A1A] overflow-hidden flex items-center justify-center">
                {profile?.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-slate-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-['Barlow_Condensed',sans-serif] font-black text-2xl sm:text-3xl uppercase tracking-tight text-[#1A1A1A]">
                    {targetUser?.name || 'User Profile'}
                  </h1>
                  <span className="px-2 py-0.5 text-xs font-['Space_Mono',monospace] font-bold bg-[#1B5299] text-white rounded-md border border-[#1A1A1A]">
                    {ROLE_LABELS[targetUser?.role] || targetUser?.role || 'Member'}
                  </span>
                  <span className="px-2 py-0.5 text-xs font-['Space_Mono',monospace] font-bold bg-[#E6B800] text-[#1A1A1A] rounded-md border border-[#1A1A1A]">
                    Tier {getDisplayTier(targetUser?.role, targetUser?.tier)}
                  </span>
                </div>
                <p className="font-['Space_Mono',monospace] text-xs text-slate-600 mt-1">
                  {profile?.headline || 'No headline provided'}
                </p>

                {/* Contact info (only visible if permitted by scope) */}
                <div className="flex flex-wrap items-center gap-4 mt-3 text-xs font-['Space_Mono',monospace] text-slate-700">
                  {targetUser?.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-[#1B5299]" />
                      <span>{targetUser.email}</span>
                    </div>
                  )}
                  {targetUser?.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-[#1B5299]" />
                      <span>{targetUser.phone}</span>
                    </div>
                  )}
                  {profile?.city && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#C8322B]" />
                      <span>{profile.city}</span>
                    </div>
                  )}
                  {profile?.linkedinUrl && (
                    <a
                      href={profile.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="flex items-center gap-1 text-[#1B5299] underline hover:text-[#0f3468] font-bold"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>LinkedIn Profile</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Admin Tier Change Action Button */}
            {isAdminOrSuperAdmin && (
              <button
                type="button"
                onClick={() => setTierModal(true)}
                className="px-4 py-2.5 bg-[#E6B800] text-[#1A1A1A] font-['Barlow_Condensed',sans-serif] font-black text-sm uppercase tracking-wider border-2 border-[#1A1A1A] rounded-xl shadow-[3px_3px_0px_0px_#1A1A1A] hover:bg-[#d4a800] cursor-pointer shrink-0"
              >
                Change Tier (T1 / T2 / T3)
              </button>
            )}
          </div>
        </div>

        {/* Bio */}
        {profile?.bio && (
          <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 shadow-[5px_5px_0px_0px_#1A1A1A]">
            <h2 className="font-['Barlow_Condensed',sans-serif] font-black text-xl uppercase tracking-wide mb-2">
              About / Bio
            </h2>
            <p className="font-['Space_Mono',monospace] text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
              {profile.bio}
            </p>
          </div>
        )}

        {/* Skills */}
        {profile?.skills && profile.skills.length > 0 && (
          <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 shadow-[5px_5px_0px_0px_#1A1A1A]">
            <h2 className="font-['Barlow_Condensed',sans-serif] font-black text-xl uppercase tracking-wide mb-3">
              Skills & Expertise
            </h2>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((s) => (
                <span
                  key={s}
                  className="px-3 py-1 bg-[#F5F2EB] border-2 border-[#1A1A1A] rounded-lg text-xs font-['Space_Mono',monospace] font-bold shadow-[2px_2px_0px_0px_#1A1A1A]"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {profile?.education && profile.education.length > 0 && (
          <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 shadow-[5px_5px_0px_0px_#1A1A1A]">
            <h2 className="font-['Barlow_Condensed',sans-serif] font-black text-xl uppercase tracking-wide mb-3">
              Education
            </h2>
            <div className="space-y-3">
              {profile.education.map((edu, idx) => (
                <div key={idx} className="p-3 bg-[#FDFBF7] border-2 border-[#1A1A1A] rounded-xl shadow-[2px_2px_0px_0px_#1A1A1A]">
                  <h3 className="font-bold text-sm text-[#1A1A1A]">{edu.institution}</h3>
                  <p className="text-xs font-['Space_Mono',monospace] text-slate-600">
                    {edu.degree} {(edu.fieldOfStudy || edu.field) ? `in ${edu.fieldOfStudy || edu.field}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects */}
        {profile?.projects && profile.projects.length > 0 && (
          <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 shadow-[5px_5px_0px_0px_#1A1A1A]">
            <h2 className="font-['Barlow_Condensed',sans-serif] font-black text-xl uppercase tracking-wide mb-3">
              Projects
            </h2>
            <div className="space-y-3">
              {profile.projects.map((proj, idx) => (
                <div key={idx} className="p-3 bg-[#FDFBF7] border-2 border-[#1A1A1A] rounded-xl shadow-[2px_2px_0px_0px_#1A1A1A]">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-[#1A1A1A]">{proj.title}</h3>
                    {proj.url && (
                      <a href={proj.url} target="_blank" rel="noopener noreferrer" className="text-[#1B5299]">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                  {proj.description && (
                    <p className="text-xs font-['Space_Mono',monospace] text-slate-600 mt-1">{proj.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Admin Tier Change Modal */}
      {tierModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleChangeTier} className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 max-w-md w-full shadow-[7px_7px_0px_0px_#1A1A1A]">
            <h3 className="font-['Barlow_Condensed',sans-serif] font-black text-2xl uppercase mb-2">Change User Tier</h3>
            <p className="font-['Space_Mono',monospace] text-xs text-slate-600 mb-4">
              Select tier level for <strong className="text-[#1A1A1A]">{targetUser?.name}</strong>.
            </p>

            <div className="space-y-3 font-['Space_Mono',monospace] text-xs">
              <div>
                <label className="block font-bold mb-1">Target Tier</label>
                <select
                  value={selectedTier}
                  onChange={(e) => setSelectedTier(e.target.value)}
                  className="w-full p-2.5 border-2 border-[#1A1A1A] rounded-xl font-bold bg-[#FDFBF7]"
                >
                  <option value="T1">T1 (Volunteer)</option>
                  <option value="T2">T2 (Associate)</option>
                  <option value="T3">T3 (Executive)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1">Reason / Notes (Optional)</label>
                <textarea
                  rows="2"
                  placeholder="Reason for promotion or tier change..."
                  value={tierReason}
                  onChange={(e) => setTierReason(e.target.value)}
                  className="w-full p-2 border-2 border-[#1A1A1A] rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setTierModal(false)}
                className="px-4 py-2 border-2 border-[#1A1A1A] rounded-xl font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updatingTier}
                className="px-5 py-2 bg-[#E6B800] text-[#1A1A1A] font-['Barlow_Condensed',sans-serif] font-black text-sm uppercase border-2 border-[#1A1A1A] rounded-xl shadow-[2px_2px_0px_0px_#1A1A1A] hover:bg-[#d4a800] cursor-pointer disabled:opacity-50"
              >
                {updatingTier ? 'Updating...' : 'Confirm Tier Change'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
