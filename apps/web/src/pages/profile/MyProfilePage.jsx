import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../pages';
import api from '../../api';
import {
  User, Mail, Phone, MapPin, Briefcase, GraduationCap, Award,
  ExternalLink, CheckCircle2, AlertCircle, Sparkles, TrendingUp,
  Camera, Plus, Trash2, Edit3, ShieldCheck
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

export const MyProfilePage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const [profileData, setProfileData] = useState({
    headline: '',
    university: '',
    city: '',
    gender: '',
    birthday: '',
    mobile: '',
    linkedinUrl: '',
    avatarUrl: '',
    bio: '',
    skills: [],
    education: [],
    projects: [],
  });

  const [completion, setCompletion] = useState({ percent: 0, missing: [] });
  const [progress, setProgress] = useState({ score: 0, level: 'Beginner', breakdown: {} });

  // Skill input state
  const [newSkill, setNewSkill] = useState('');

  // Education modal state
  const [eduModal, setEduModal] = useState(false);
  const [eduForm, setEduForm] = useState({ institution: '', degree: '', fieldOfStudy: '', startYear: '', endYear: '' });

  // Project modal state
  const [projModal, setProjModal] = useState(false);
  // Avatar file upload state
  const fileInputRef = useRef(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handleAvatarFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setFeedback({ type: 'error', message: 'Please select a valid image file (JPEG, PNG, or WebP)' });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'Image size must be less than 10MB' });
      return;
    }

    setAvatarUploading(true);
    setFeedback({ type: '', message: '' });

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = async () => {
        try {
          // Client-side canvas compression: scale to max 500x500 to keep avatars lightweight and fast
          const maxDim = 500;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Export as JPEG with 0.85 quality
          const base64Data = canvas.toDataURL('image/jpeg', 0.85);

          const res = await api.post('/profile/me/avatar', { avatarUrl: base64Data });
          if (res.data?.success) {
            setProfileData((prev) => ({ ...prev, avatarUrl: res.data.data.avatarUrl }));
            if (res.data.data.completion) {
              setCompletion(res.data.data.completion);
            }
            setFeedback({ type: 'success', message: 'Profile picture updated successfully!' });
          } else {
            setFeedback({ type: 'error', message: res.data?.message || 'Failed to update avatar' });
          }
        } catch (uploadErr) {
          setFeedback({ type: 'error', message: uploadErr.response?.data?.message || 'Failed to upload image' });
        } finally {
          setAvatarUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      img.onerror = () => {
        setFeedback({ type: 'error', message: 'Failed to process image' });
        setAvatarUploading(false);
      };
      img.src = readerEvent.target.result;
    };
    reader.onerror = () => {
      setFeedback({ type: 'error', message: 'Failed to read image file' });
      setAvatarUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await api.get('/profile/me');
      if (res.data?.success) {
        const p = res.data.data.profile || {};
        let normalizedGender = (p.gender || '').toLowerCase().trim();
        if (normalizedGender === 'non-binary') normalizedGender = 'other';
        if (normalizedGender === 'prefer not to say') normalizedGender = 'prefer_not_to_say';

        let formattedBirthday = '';
        if (p.birthday) {
          const bdayDate = new Date(p.birthday);
          if (!isNaN(bdayDate.getTime())) {
            formattedBirthday = bdayDate.toISOString().split('T')[0];
          }
        }

        setProfileData({
          headline: p.headline || '',
          university: p.university || '',
          city: p.city || '',
          gender: normalizedGender,
          birthday: formattedBirthday,
          mobile: p.mobile || '',
          linkedinUrl: p.linkedinUrl || '',
          avatarUrl: p.avatarUrl || '',
          bio: p.bio || '',
          skills: p.skills || [],
          education: (p.education || []).map((e) => ({
            institution: e.institution || '',
            degree: e.degree || '',
            fieldOfStudy: e.fieldOfStudy || e.field || '',
            startYear: e.startYear || '',
            endYear: e.endYear || '',
          })),
          projects: (p.projects || []).map((proj) => ({
            title: proj.title || '',
            description: proj.description || '',
            url: proj.url || '',
          })),
        });
        setCompletion(res.data.data.completion || { percent: 0, missing: [] });
        setProgress(res.data.data.progress || { score: 0, level: 'Beginner', breakdown: {} });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.response?.data?.message || 'Failed to load profile' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setFeedback({ type: '', message: '' });

    try {
      // Exclude avatarUrl from PATCH /profile/me to prevent multi-megabyte payloads
      const { avatarUrl, ...saveData } = profileData;

      // Auto-prefix https:// if user entered linkedin.com without protocol
      if (saveData.linkedinUrl && !/^https?:\/\//i.test(saveData.linkedinUrl.trim())) {
        saveData.linkedinUrl = 'https://' + saveData.linkedinUrl.trim();
      }

      // Cast education years cleanly to numbers or null
      if (Array.isArray(saveData.education)) {
        saveData.education = saveData.education.map((edu) => ({
          ...edu,
          startYear: edu.startYear ? (Number(edu.startYear) || null) : null,
          endYear: edu.endYear ? (Number(edu.endYear) || null) : null,
        }));
      }

      const res = await api.patch('/profile/me', saveData);
      if (res.data?.success) {
        setCompletion(res.data.data.completion);
        setFeedback({ type: 'success', message: 'Profile updated successfully!' });
        setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.response?.data?.message || 'Failed to save changes' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddSkill = (e) => {
    e.preventDefault();
    const trimmed = newSkill.trim();
    if (!trimmed || profileData.skills.includes(trimmed)) return;
    setProfileData((prev) => ({ ...prev, skills: [...prev.skills, trimmed] }));
    setNewSkill('');
  };

  const handleRemoveSkill = (skillToRemove) => {
    setProfileData((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skillToRemove),
    }));
  };

  const handleAddEducation = () => {
    if (!eduForm.institution.trim()) return;
    setProfileData((prev) => ({
      ...prev,
      education: [...prev.education, { ...eduForm }],
    }));
    setEduForm({ institution: '', degree: '', fieldOfStudy: '', startYear: '', endYear: '' });
    setEduModal(false);
  };

  const handleRemoveEducation = (index) => {
    setProfileData((prev) => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index),
    }));
  };

  const handleAddProject = () => {
    if (!projForm.title.trim()) return;
    setProfileData((prev) => ({
      ...prev,
      projects: [...prev.projects, { ...projForm }],
    }));
    setProjForm({ title: '', description: '', url: '' });
    setProjModal(false);
  };

  const handleRemoveProject = (index) => {
    setProfileData((prev) => ({
      ...prev,
      projects: prev.projects.filter((_, i) => i !== index),
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#C8322B]" />
      </div>
    );
  }

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (completion.percent / 100) * circumference;

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#1A1A1A] p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Alerts & Feedback */}
        {feedback.message && (
          <div
            className={`p-4 rounded-xl border-[2.5px] border-[#1A1A1A] font-['Space_Mono',monospace] text-sm flex items-center gap-3 shadow-[4px_4px_0px_0px_#1A1A1A] ${
              feedback.type === 'error' ? 'bg-[#FFE5E5] text-[#C8322B]' : 'bg-[#E5F9E7] text-[#1A7F37]'
            }`}
          >
            {feedback.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* 1. Header Card (Naukri-style) */}
        <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 sm:p-8 shadow-[7px_7px_0px_0px_#1A1A1A] relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="relative group">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-[2.5px] border-[#1A1A1A] bg-[#F5F2EB] shadow-[3px_3px_0px_0px_#1A1A1A] overflow-hidden flex items-center justify-center">
                  {profileData.avatarUrl ? (
                    <img src={profileData.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-12 h-12 text-slate-400" />
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAvatarFile}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute -bottom-2 -right-2 p-2 bg-[#E6B800] border-2 border-[#1A1A1A] rounded-xl shadow-[2px_2px_0px_0px_#1A1A1A] hover:bg-[#d4a800] transition cursor-pointer disabled:opacity-50"
                  title="Upload profile picture from device"
                >
                  <Camera className={`w-4 h-4 text-[#1A1A1A] ${avatarUploading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-['Barlow_Condensed',sans-serif] font-black text-2xl sm:text-3xl uppercase tracking-tight text-[#1A1A1A]">
                    {user?.name || 'TBI Member'}
                  </h1>
                  <span className="px-2 py-0.5 text-xs font-['Space_Mono',monospace] font-bold bg-[#1B5299] text-white rounded-md border border-[#1A1A1A]">
                    {ROLE_LABELS[user?.role] || user?.role || 'Member'}
                  </span>
                  <span className="px-2 py-0.5 text-xs font-['Space_Mono',monospace] font-bold bg-[#E6B800] text-[#1A1A1A] rounded-md border border-[#1A1A1A]">
                    Tier {getDisplayTier(user?.role, user?.tier)}
                  </span>
                </div>

                <p className="font-['Space_Mono',monospace] text-sm text-slate-600 mt-1">
                  {profileData.headline || 'Add your headline / course (e.g. MCA, B.Tech CSE)'}
                </p>

                <div className="flex flex-wrap items-center gap-4 mt-3 text-xs font-['Space_Mono',monospace] text-slate-700">
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[#1B5299]" />
                    <span>{user?.email}</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-[#1A7F37]" title="Verified Email" />
                  </div>
                  {profileData.mobile && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-[#1B5299]" />
                      <span>{profileData.mobile}</span>
                      <span className="text-[10px] bg-slate-100 border border-slate-300 px-1.5 rounded">Verify</span>
                    </div>
                  )}
                  {profileData.city && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#C8322B]" />
                      <span>{profileData.city}</span>
                    </div>
                  )}
                  {profileData.linkedinUrl && (
                    <a
                      href={profileData.linkedinUrl}
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

            {/* Completion Ring */}
            <div className="flex items-center gap-4 bg-[#F5F2EB] p-4 rounded-xl border-2 border-[#1A1A1A] shadow-[3px_3px_0px_0px_#1A1A1A] self-stretch md:self-auto justify-between md:justify-start">
              <div className="relative w-20 h-20 shrink-0">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="40" cy="40" r={radius} stroke="#E2DCD2" strokeWidth="8" fill="transparent" />
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    stroke="#C8322B"
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-['Barlow_Condensed',sans-serif] font-black text-xl text-[#1A1A1A]">
                  {completion.percent}%
                </div>
              </div>
              <div>
                <div className="font-['Barlow_Condensed',sans-serif] font-black text-lg uppercase text-[#1A1A1A]">
                  Profile Strength
                </div>
                <div className="text-xs font-['Space_Mono',monospace] text-slate-600">
                  {completion.percent >= 80 ? 'Excellent profile strength' : 'Add missing details for more points'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Grid: Missing Details (Naukri style) + Progress Activity Score */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Missing Details Box */}
          <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 shadow-[5px_5px_0px_0px_#1A1A1A]">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-[#E6B800]" />
              <h2 className="font-['Barlow_Condensed',sans-serif] font-black text-xl uppercase tracking-wide">
                Missing Details to Complete Profile
              </h2>
            </div>
            {completion.missing.length === 0 ? (
              <div className="p-4 bg-[#E5F9E7] border border-[#1A7F37] rounded-xl text-xs font-['Space_Mono',monospace] text-[#1A7F37] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Your profile is 100% complete! Outstanding job.</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {completion.missing.slice(0, 4).map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between p-3 bg-[#FDFBF7] border-2 border-[#1A1A1A] rounded-xl shadow-[2px_2px_0px_0px_#1A1A1A]"
                  >
                    <span className="font-['Space_Mono',monospace] text-xs font-bold text-[#1A1A1A]">
                      {item.label}
                    </span>
                    <span className="px-2 py-0.5 text-[11px] font-bold bg-[#E6B800] text-[#1A1A1A] rounded border border-[#1A1A1A]">
                      +{item.points}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Real Activity Progress Score Card */}
          <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 shadow-[5px_5px_0px_0px_#1A1A1A]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#1B5299]" />
                <h2 className="font-['Barlow_Condensed',sans-serif] font-black text-xl uppercase tracking-wide">
                  Activity & Engagement Score
                </h2>
              </div>
              <span className="px-3 py-1 font-['Barlow_Condensed',sans-serif] font-black text-sm uppercase bg-[#1B5299] text-white rounded-lg border border-[#1A1A1A]">
                {progress.level}
              </span>
            </div>

            <div className="flex items-baseline gap-2 mb-4">
              <span className="font-['Barlow_Condensed',sans-serif] font-black text-4xl text-[#1A1A1A]">
                {progress.score}
              </span>
              <span className="font-['Space_Mono',monospace] text-xs text-slate-500">/ 100 score (90-day activity)</span>
            </div>

            <div className="space-y-2 text-xs font-['Space_Mono',monospace]">
              {progress.breakdown.attendance && (
                <div>
                  <div className="flex justify-between mb-1">
                    <span>Attendance Rate (40%)</span>
                    <span className="font-bold">{progress.breakdown.attendance.score} pts</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-300">
                    <div
                      className="h-full bg-[#1B5299]"
                      style={{ width: `${Math.min(100, (progress.breakdown.attendance.score / 40) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {progress.breakdown.events && (
                <div>
                  <div className="flex justify-between mb-1">
                    <span>Events Participated (20%)</span>
                    <span className="font-bold">{progress.breakdown.events.score} pts</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-300">
                    <div
                      className="h-full bg-[#E6B800]"
                      style={{ width: `${Math.min(100, (progress.breakdown.events.score / 20) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {progress.breakdown.teamParticipation && (
                <div>
                  <div className="flex justify-between mb-1">
                    <span>Team Participation (15%)</span>
                    <span className="font-bold">{progress.breakdown.teamParticipation.score} pts</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-300">
                    <div
                      className="h-full bg-[#1A7F37]"
                      style={{ width: `${Math.min(100, (progress.breakdown.teamParticipation.score / 15) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3. Main Edit Form: Personal, Bio, Skills, Education, Projects */}
        <form onSubmit={handleSaveProfile} className="space-y-6">
          {/* Personal Details */}
          <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 shadow-[5px_5px_0px_0px_#1A1A1A]">
            <h2 className="font-['Barlow_Condensed',sans-serif] font-black text-xl uppercase tracking-wide mb-4">
              Personal & Academic Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold font-['Space_Mono',monospace] uppercase mb-1">Course / Headline</label>
                <input
                  type="text"
                  placeholder="e.g. MCA 2nd Year, AI Researcher"
                  value={profileData.headline}
                  onChange={(e) => setProfileData({ ...profileData, headline: e.target.value })}
                  className="w-full p-2.5 text-xs font-['Space_Mono',monospace] border-2 border-[#1A1A1A] rounded-xl focus:outline-none focus:border-[#1B5299]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-['Space_Mono',monospace] uppercase mb-1">University / Institute</label>
                <input
                  type="text"
                  placeholder="e.g. Graphic Era University"
                  value={profileData.university}
                  onChange={(e) => setProfileData({ ...profileData, university: e.target.value })}
                  className="w-full p-2.5 text-xs font-['Space_Mono',monospace] border-2 border-[#1A1A1A] rounded-xl focus:outline-none focus:border-[#1B5299]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-['Space_Mono',monospace] uppercase mb-1">City</label>
                <input
                  type="text"
                  placeholder="e.g. Dehradun"
                  value={profileData.city}
                  onChange={(e) => setProfileData({ ...profileData, city: e.target.value })}
                  className="w-full p-2.5 text-xs font-['Space_Mono',monospace] border-2 border-[#1A1A1A] rounded-xl focus:outline-none focus:border-[#1B5299]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-['Space_Mono',monospace] uppercase mb-1">Gender</label>
                <select
                  value={profileData.gender}
                  onChange={(e) => setProfileData({ ...profileData, gender: e.target.value })}
                  className="w-full p-2.5 text-xs font-['Space_Mono',monospace] border-2 border-[#1A1A1A] rounded-xl focus:outline-none focus:border-[#1B5299]"
                >
                  <option value="">Select Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other / Non-Binary</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold font-['Space_Mono',monospace] uppercase mb-1">Birthday</label>
                <input
                  type="date"
                  value={profileData.birthday}
                  onChange={(e) => setProfileData({ ...profileData, birthday: e.target.value })}
                  className="w-full p-2.5 text-xs font-['Space_Mono',monospace] border-2 border-[#1A1A1A] rounded-xl focus:outline-none focus:border-[#1B5299]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-['Space_Mono',monospace] uppercase mb-1">Mobile Number</label>
                <input
                  type="text"
                  placeholder="+91..."
                  value={profileData.mobile}
                  onChange={(e) => setProfileData({ ...profileData, mobile: e.target.value })}
                  className="w-full p-2.5 text-xs font-['Space_Mono',monospace] border-2 border-[#1A1A1A] rounded-xl focus:outline-none focus:border-[#1B5299]"
                />
              </div>

              <div className="sm:col-span-2 md:col-span-3">
                <label className="block text-xs font-bold font-['Space_Mono',monospace] uppercase mb-1">LinkedIn Profile URL</label>
                <input
                  type="url"
                  placeholder="https://www.linkedin.com/in/your-profile"
                  value={profileData.linkedinUrl}
                  onChange={(e) => setProfileData({ ...profileData, linkedinUrl: e.target.value })}
                  className="w-full p-2.5 text-xs font-['Space_Mono',monospace] border-2 border-[#1A1A1A] rounded-xl focus:outline-none focus:border-[#1B5299]"
                />
              </div>

              <div className="sm:col-span-2 md:col-span-3">
                <label className="block text-xs font-bold font-['Space_Mono',monospace] uppercase mb-1">About / Bio</label>
                <textarea
                  rows="3"
                  placeholder="Tell your team about your interests, focus sector, and goals..."
                  value={profileData.bio}
                  onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                  className="w-full p-2.5 text-xs font-['Space_Mono',monospace] border-2 border-[#1A1A1A] rounded-xl focus:outline-none focus:border-[#1B5299]"
                />
              </div>
            </div>
          </div>

          {/* Skills Section */}
          <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 shadow-[5px_5px_0px_0px_#1A1A1A]">
            <h2 className="font-['Barlow_Condensed',sans-serif] font-black text-xl uppercase tracking-wide mb-3">
              Skills & Expertise
            </h2>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Add skill (e.g. Python, DeepTech, Robotics)"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                className="flex-1 p-2.5 text-xs font-['Space_Mono',monospace] border-2 border-[#1A1A1A] rounded-xl focus:outline-none focus:border-[#1B5299]"
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="px-4 py-2 bg-[#E6B800] border-2 border-[#1A1A1A] rounded-xl font-['Barlow_Condensed',sans-serif] font-black uppercase text-sm shadow-[2px_2px_0px_0px_#1A1A1A] hover:bg-[#d4a800] cursor-pointer"
              >
                Add Skill
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {profileData.skills.length === 0 ? (
                <span className="text-xs font-['Space_Mono',monospace] text-slate-400">No skills added yet.</span>
              ) : (
                profileData.skills.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F5F2EB] border-2 border-[#1A1A1A] rounded-lg text-xs font-['Space_Mono',monospace] font-bold shadow-[2px_2px_0px_0px_#1A1A1A]"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(s)}
                      className="text-[#C8322B] hover:text-[#9e1f18] cursor-pointer font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Education Section */}
          <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 shadow-[5px_5px_0px_0px_#1A1A1A]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-['Barlow_Condensed',sans-serif] font-black text-xl uppercase tracking-wide">
                Education
              </h2>
              <button
                type="button"
                onClick={() => setEduModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1B5299] text-white border-2 border-[#1A1A1A] rounded-xl font-['Barlow_Condensed',sans-serif] font-black text-sm uppercase shadow-[2px_2px_0px_0px_#1A1A1A] hover:bg-[#143e75] cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Education
              </button>
            </div>
            {profileData.education.length === 0 ? (
              <p className="text-xs font-['Space_Mono',monospace] text-slate-400">No education entries added.</p>
            ) : (
              <div className="space-y-3">
                {profileData.education.map((edu, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between p-3.5 bg-[#FDFBF7] border-2 border-[#1A1A1A] rounded-xl shadow-[2px_2px_0px_0px_#1A1A1A]"
                  >
                    <div>
                      <h3 className="font-bold text-sm text-[#1A1A1A]">{edu.institution}</h3>
                      <p className="text-xs font-['Space_Mono',monospace] text-slate-600">
                        {edu.degree} {(edu.fieldOfStudy || edu.field) ? `in ${edu.fieldOfStudy || edu.field}` : ''}
                      </p>
                      {(edu.startYear || edu.endYear) && (
                        <p className="text-[11px] font-['Space_Mono',monospace] text-slate-500 mt-1">
                          {edu.startYear || ''} - {edu.endYear || 'Present'}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveEducation(idx)}
                      className="text-slate-400 hover:text-[#C8322B] p-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Projects Section */}
          <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 shadow-[5px_5px_0px_0px_#1A1A1A]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-['Barlow_Condensed',sans-serif] font-black text-xl uppercase tracking-wide">
                Projects
              </h2>
              <button
                type="button"
                onClick={() => setProjModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1B5299] text-white border-2 border-[#1A1A1A] rounded-xl font-['Barlow_Condensed',sans-serif] font-black text-sm uppercase shadow-[2px_2px_0px_0px_#1A1A1A] hover:bg-[#143e75] cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Project
              </button>
            </div>
            {profileData.projects.length === 0 ? (
              <p className="text-xs font-['Space_Mono',monospace] text-slate-400">No projects added yet.</p>
            ) : (
              <div className="space-y-3">
                {profileData.projects.map((proj, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between p-3.5 bg-[#FDFBF7] border-2 border-[#1A1A1A] rounded-xl shadow-[2px_2px_0px_0px_#1A1A1A]"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-[#1A1A1A]">{proj.title}</h3>
                        {proj.url && (
                          <a
                            href={proj.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#1B5299] hover:underline"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      {proj.description && (
                        <p className="text-xs font-['Space_Mono',monospace] text-slate-600 mt-1">
                          {proj.description}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveProject(idx)}
                      className="text-slate-400 hover:text-[#C8322B] p-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-8 py-3 bg-[#C8322B] text-white font-['Barlow_Condensed',sans-serif] font-black text-xl uppercase tracking-wider border-[2.5px] border-[#1A1A1A] rounded-xl shadow-[4px_4px_0px_0px_#1A1A1A] hover:bg-[#b02923] hover:shadow-[2px_2px_0px_0px_#1A1A1A] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving Profile...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Education Modal */}
      {eduModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 max-w-md w-full shadow-[7px_7px_0px_0px_#1A1A1A]">
            <h3 className="font-['Barlow_Condensed',sans-serif] font-black text-xl uppercase mb-3">Add Education</h3>
            <div className="space-y-3 font-['Space_Mono',monospace] text-xs">
              <div>
                <label className="block font-bold mb-1">Institution *</label>
                <input
                  type="text"
                  placeholder="e.g. Graphic Era University"
                  value={eduForm.institution}
                  onChange={(e) => setEduForm({ ...eduForm, institution: e.target.value })}
                  className="w-full p-2 border-2 border-[#1A1A1A] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Degree</label>
                <input
                  type="text"
                  placeholder="e.g. Master of Computer Applications"
                  value={eduForm.degree}
                  onChange={(e) => setEduForm({ ...eduForm, degree: e.target.value })}
                  className="w-full p-2 border-2 border-[#1A1A1A] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Field of Study</label>
                <input
                  type="text"
                  placeholder="e.g. Computer Science / Information Technology"
                  value={eduForm.fieldOfStudy}
                  onChange={(e) => setEduForm({ ...eduForm, fieldOfStudy: e.target.value })}
                  className="w-full p-2 border-2 border-[#1A1A1A] rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">Start Year</label>
                  <input
                    type="number"
                    placeholder="2022"
                    value={eduForm.startYear}
                    onChange={(e) => setEduForm({ ...eduForm, startYear: e.target.value })}
                    className="w-full p-2 border-2 border-[#1A1A1A] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">End Year</label>
                  <input
                    type="number"
                    placeholder="2024"
                    value={eduForm.endYear}
                    onChange={(e) => setEduForm({ ...eduForm, endYear: e.target.value })}
                    className="w-full p-2 border-2 border-[#1A1A1A] rounded-lg"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setEduModal(false)}
                className="px-4 py-2 border-2 border-[#1A1A1A] rounded-lg font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddEducation}
                className="px-4 py-2 bg-[#1B5299] text-white border-2 border-[#1A1A1A] rounded-lg font-bold text-xs"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Modal */}
      {projModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 max-w-md w-full shadow-[7px_7px_0px_0px_#1A1A1A]">
            <h3 className="font-['Barlow_Condensed',sans-serif] font-black text-xl uppercase mb-3">Add Project</h3>
            <div className="space-y-3 font-['Space_Mono',monospace] text-xs">
              <div>
                <label className="block font-bold mb-1">Project Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Employee Portal"
                  value={projForm.title}
                  onChange={(e) => setProjForm({ ...projForm, title: e.target.value })}
                  className="w-full p-2 border-2 border-[#1A1A1A] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Description</label>
                <textarea
                  rows="2"
                  placeholder="Brief summary of your project..."
                  value={projForm.description}
                  onChange={(e) => setProjForm({ ...projForm, description: e.target.value })}
                  className="w-full p-2 border-2 border-[#1A1A1A] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Project Link (optional)</label>
                <input
                  type="url"
                  placeholder="https://github.com/..."
                  value={projForm.url}
                  onChange={(e) => setProjForm({ ...projForm, url: e.target.value })}
                  className="w-full p-2 border-2 border-[#1A1A1A] rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setProjModal(false)}
                className="px-4 py-2 border-2 border-[#1A1A1A] rounded-lg font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddProject}
                className="px-4 py-2 bg-[#1B5299] text-white border-2 border-[#1A1A1A] rounded-lg font-bold text-xs"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
