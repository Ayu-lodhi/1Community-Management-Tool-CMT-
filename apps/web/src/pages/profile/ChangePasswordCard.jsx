import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { Lock, Eye, EyeOff, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';

export const ChangePasswordCard = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const checks = {
    length: newPassword.length >= 8 && newPassword.length <= 72,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    number: /\d/.test(newPassword),
    special: /[^A-Za-z0-9]/.test(newPassword),
    differ: newPassword && oldPassword ? newPassword !== oldPassword : true,
    match: Boolean(newPassword && newPassword === confirmPassword),
  };

  const isFormValid = oldPassword.length > 0 &&
    checks.length &&
    checks.upper &&
    checks.lower &&
    checks.number &&
    checks.special &&
    checks.differ &&
    checks.match;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!isFormValid) {
      if (newPassword === oldPassword) {
        setErrorMsg('New password must differ from current password.');
      } else if (newPassword !== confirmPassword) {
        setErrorMsg('New passwords do not match.');
      } else {
        setErrorMsg('Please ensure all password requirements are satisfied.');
      }
      return;
    }

    setLoading(true);
    const submittedOld = oldPassword;
    const submittedNew = newPassword;

    // Immediately clear sensitive fields from form state
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');

    try {
      await api.post('/auth/change-password', {
        oldPassword: submittedOld,
        newPassword: submittedNew,
      });

      setSuccessMsg('Password changed successfully. Redirecting to login...');
      setTimeout(() => {
        if (logout) logout();
        navigate('/login', {
          replace: true,
          state: { successMessage: 'Password changed, please log in again.' },
        });
      }, 1500);
    } catch (err) {
      const status = err.response?.status;
      const serverMsg = err.response?.data?.message || err.message || '';

      if (status === 429 || /too many/i.test(serverMsg)) {
        setErrorMsg('Too many failed attempts. Please try again after 15 minutes.');
      } else if (/current password/i.test(serverMsg) || /incorrect/i.test(serverMsg) || status === 400) {
        setErrorMsg(serverMsg || 'Current password is incorrect. Please verify and try again.');
      } else if (!window.navigator.onLine || /network/i.test(serverMsg)) {
        setErrorMsg('Network connection error. Please check your internet connection.');
      } else {
        setErrorMsg(serverMsg || 'Unable to update password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 shadow-[5px_5px_0px_0px_#1A1A1A]">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound className="w-5 h-5 text-[#1B5299]" />
        <h2 className="font-['Barlow_Condensed',sans-serif] font-black text-xl uppercase tracking-wide text-[#1A1A1A]">
          Security & Password
        </h2>
      </div>

      <p className="text-xs font-['Space_Mono',monospace] text-slate-600 mb-5">
        Update your account password. Once changed, all other active sessions will be signed out immediately.
      </p>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border-2 border-[#C8322B] rounded-xl flex items-start gap-2 text-xs font-['Space_Mono',monospace] text-[#C8322B]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 bg-emerald-50 border-2 border-emerald-600 rounded-xl flex items-start gap-2 text-xs font-['Space_Mono',monospace] text-emerald-900 font-bold">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Current Password */}
        <div>
          <label
            htmlFor="profile-current-password"
            className="block text-xs font-bold font-['Space_Mono',monospace] uppercase mb-1 text-[#1A1A1A]"
          >
            Current Password *
          </label>
          <div className="relative">
            <input
              id="profile-current-password"
              type={showOld ? 'text' : 'password'}
              name="current-password"
              autoComplete="current-password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full p-2.5 pr-10 text-xs font-['Space_Mono',monospace] border-2 border-[#1A1A1A] rounded-xl focus:outline-none focus:border-[#1B5299]"
            />
            <button
              type="button"
              onClick={() => setShowOld(!showOld)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#1A1A1A] p-1 cursor-pointer"
              aria-label={showOld ? 'Hide current password' : 'Show current password'}
            >
              {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* New Password & Confirm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="profile-new-password"
              className="block text-xs font-bold font-['Space_Mono',monospace] uppercase mb-1 text-[#1A1A1A]"
            >
              New Password *
            </label>
            <div className="relative">
              <input
                id="profile-new-password"
                type={showNew ? 'text' : 'password'}
                name="new-password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full p-2.5 pr-10 text-xs font-['Space_Mono',monospace] border-2 border-[#1A1A1A] rounded-xl focus:outline-none focus:border-[#1B5299]"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#1A1A1A] p-1 cursor-pointer"
                aria-label={showNew ? 'Hide new password' : 'Show new password'}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="profile-confirm-password"
              className="block text-xs font-bold font-['Space_Mono',monospace] uppercase mb-1 text-[#1A1A1A]"
            >
              Confirm New Password *
            </label>
            <div className="relative">
              <input
                id="profile-confirm-password"
                type={showConfirm ? 'text' : 'password'}
                name="confirm-password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full p-2.5 pr-10 text-xs font-['Space_Mono',monospace] border-2 border-[#1A1A1A] rounded-xl focus:outline-none focus:border-[#1B5299]"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#1A1A1A] p-1 cursor-pointer"
                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Requirements Checklist */}
        <div className="p-3 bg-[#FDFBF7] border-2 border-[#1A1A1A] rounded-xl text-[11px] font-['Space_Mono',monospace] space-y-1 text-slate-600">
          <p className="font-bold text-[#1A1A1A] mb-1">Password Requirements:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
            <span className={checks.length ? 'text-[#1A7F37] font-bold' : ''}>
              • 8 to 72 characters
            </span>
            <span className={checks.upper ? 'text-[#1A7F37] font-bold' : ''}>
              • At least 1 uppercase letter
            </span>
            <span className={checks.lower ? 'text-[#1A7F37] font-bold' : ''}>
              • At least 1 lowercase letter
            </span>
            <span className={checks.number ? 'text-[#1A7F37] font-bold' : ''}>
              • At least 1 number (0-9)
            </span>
            <span className={checks.special ? 'text-[#1A7F37] font-bold' : ''}>
              • At least 1 special character
            </span>
            <span className={checks.match ? 'text-[#1A7F37] font-bold' : ''}>
              • Passwords match
            </span>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={loading || !isFormValid}
            className="px-6 py-2.5 bg-[#1B5299] text-white font-['Barlow_Condensed',sans-serif] font-black text-lg uppercase tracking-wider border-[2.5px] border-[#1A1A1A] rounded-xl shadow-[3px_3px_0px_0px_#1A1A1A] hover:bg-[#15427D] hover:shadow-[1px_1px_0px_0px_#1A1A1A] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Changing Password...' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  );
};
