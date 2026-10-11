import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { User, Users, ExternalLink, AlertCircle, ArrowRight } from 'lucide-react';

export const TeamProfilesPage = () => {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTeam = async () => {
      try {
        setLoading(true);
        const res = await api.get('/profile/team');
        if (res.data?.success) {
          setMembers(res.data.data || []);
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load team member profiles');
      } finally {
        setLoading(false);
      }
    };
    fetchTeam();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1B5299]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#1A1A1A] p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-6 shadow-[6px_6px_0px_0px_#1A1A1A]">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#E6B800] border-2 border-[#1A1A1A] rounded-xl shadow-[2px_2px_0px_0px_#1A1A1A]">
              <Users className="w-6 h-6 text-[#1A1A1A]" />
            </div>
            <div>
              <h1 className="font-['Barlow_Condensed',sans-serif] font-black text-2xl sm:text-3xl uppercase tracking-tight">
                My Team Profiles
              </h1>
              <p className="font-['Space_Mono',monospace] text-xs text-slate-600">
                T3 Executive Team Members Roster & Work Profiles
              </p>
            </div>
          </div>
          <span className="px-3 py-1 font-['Space_Mono',monospace] font-bold text-xs bg-[#1B5299] text-white border-2 border-[#1A1A1A] rounded-xl">
            {members.length} {members.length === 1 ? 'Member' : 'Members'}
          </span>
        </div>

        {error && (
          <div className="p-4 bg-[#FFE5E5] text-[#C8322B] border-2 border-[#1A1A1A] rounded-xl font-['Space_Mono',monospace] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Member Cards Grid */}
        {members.length === 0 ? (
          <div className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-10 text-center shadow-[4px_4px_0px_0px_#1A1A1A]">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="font-['Space_Mono',monospace] text-xs text-slate-500">
              No team members assigned to teams led by your account.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {members.map(({ user, profile }) => (
              <div
                key={user.id}
                className="bg-white border-[3px] border-[#1A1A1A] rounded-2xl p-5 shadow-[5px_5px_0px_0px_#1A1A1A] flex flex-col justify-between hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0px_0px_#1A1A1A] transition"
              >
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl border-2 border-[#1A1A1A] bg-[#F5F2EB] overflow-hidden flex items-center justify-center shrink-0">
                      {profile?.avatarUrl ? (
                        <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-['Barlow_Condensed',sans-serif] font-black text-lg uppercase truncate">
                        {user.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-['Space_Mono',monospace] font-bold bg-[#E6B800] px-1.5 py-0.5 rounded border border-[#1A1A1A]">
                          Tier {user.tier || 'T1'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="font-['Space_Mono',monospace] text-xs text-slate-600 line-clamp-2 mb-3">
                    {profile?.headline || 'No headline specified'}
                  </p>

                  {/* Skills badges */}
                  {profile?.skills && profile.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {profile.skills.slice(0, 3).map((s) => (
                        <span key={s} className="px-2 py-0.5 text-[10px] font-['Space_Mono',monospace] bg-[#F5F2EB] border border-[#1A1A1A] rounded">
                          {s}
                        </span>
                      ))}
                      {profile.skills.length > 3 && (
                        <span className="text-[10px] font-['Space_Mono',monospace] text-slate-500 self-center">
                          +{profile.skills.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <Link
                  to={`/profile/${user.id}`}
                  className="flex items-center justify-center gap-2 w-full py-2 bg-[#1B5299] text-white font-['Barlow_Condensed',sans-serif] font-black uppercase text-sm rounded-xl border-2 border-[#1A1A1A] shadow-[2px_2px_0px_0px_#1A1A1A] hover:bg-[#143e75]"
                >
                  <span>View Member Profile</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
