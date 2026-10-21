import React, { useState } from 'react';
import {
  Users, Award, AlertTriangle, FileText, Settings, ShieldAlert
} from 'lucide-react';
import { useAuth } from '../../pages';
import { MastersTab } from './MastersTab';
import { ProfilesTab } from './ProfilesTab';
import { IncidentsTab } from './IncidentsTab';
import { ReviewsTab } from './ReviewsTab';
import { ExceptionsTab } from './ExceptionsTab';

export const HrPage = () => {
  const { user } = useAuth();
  const role = user?.role;
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isAdmin = role === 'ADMIN';
  const isT3 = role === 'T3_EXECUTIVE';

  const [activeTab, setActiveTab] = useState(isT3 ? 'reviews' : 'masters');

  useEffect(() => {
    if (isT3) {
      setActiveTab('reviews');
    } else if (isSuperAdmin || isAdmin) {
      setActiveTab('masters');
    }
  }, [isT3, isSuperAdmin, isAdmin]);

  // Permission check for ADMIN customGrants
  const hasHrPerm = (perm) => {
    if (isSuperAdmin) return true;
    if (isT3) return true; // T3 access is verified server-side per led-team
    if (isAdmin) {
      if (!user?.customGrants || !Array.isArray(user.customGrants) || user.customGrants.length === 0) {
        return true; // Defaults include HR permissions
      }
      return user.customGrants.includes(perm);
    }
    return false;
  };

  const hasAnyHrAccess = isSuperAdmin || isT3 || (isAdmin && (
    hasHrPerm('hr:masters_manage') ||
    hasHrPerm('hr:incidents_manage') ||
    hasHrPerm('hr:reviews_manage') ||
    hasHrPerm('hr:export')
  ));

  if (!hasAnyHrAccess) {
    return (
      <div className="p-8 text-center bg-white border border-rose-200 rounded-2xl max-w-md mx-auto my-12 shadow-xs">
        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center mx-auto mb-3">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900 mb-1">Access Restricted</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Your account does not currently have permissions to view or manage HR modules.
        </p>
      </div>
    );
  }

  const TABS = [
    { id: 'masters',    label: 'Masters',             icon: Settings,      show: !isT3 },
    { id: 'profiles',   label: isT3 ? 'Team Profiles' : 'Profiles', icon: Users, show: true },
    { id: 'incidents',  label: isT3 ? 'Incident Notes': 'Incidents', icon: AlertTriangle, show: true },
    { id: 'reviews',    label: isT3 ? 'Student Reviews': 'Reviews', icon: Award, show: true },
    { id: 'exceptions', label: 'Attendance Exceptions', icon: FileText, show: true },
  ];

  const canManageMasters = isSuperAdmin || (isAdmin && hasHrPerm('hr:masters_manage'));
  const canExport = isSuperAdmin || isT3 || (isAdmin && hasHrPerm('hr:export'));

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight font-['Barlow_Condensed',sans-serif] uppercase">
            {isT3 ? 'Team Performance & Evaluations' : 'Member Performance & Operations'}
          </h1>
          <p className="text-xs text-slate-500">
            {isT3
              ? 'Evaluate student team members, log observation notes, and review attendance exceptions.'
              : 'Community masters, student profiles, incident logs, and performance evaluations.'}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex overflow-x-auto gap-1 border-b border-slate-200 pb-px">
        {TABS.filter((tab) => tab.show).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t border-x shrink-0 ${
                isActive
                  ? 'bg-white text-blue-600 border-slate-200 border-b-transparent shadow-xs'
                  : 'bg-transparent text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-100/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content Container */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs min-h-[400px]">
        {activeTab === 'masters' && <MastersTab canManage={canManageMasters} />}
        {activeTab === 'profiles' && <ProfilesTab canManage={canManageMasters} />}
        {activeTab === 'incidents' && <IncidentsTab canExport={canExport} />}
        {activeTab === 'reviews' && <ReviewsTab canExport={canExport} />}
        {activeTab === 'exceptions' && <ExceptionsTab canExport={canExport} />}
      </div>
    </div>
  );
};
