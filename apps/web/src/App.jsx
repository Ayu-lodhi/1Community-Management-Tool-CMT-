import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, ROLES, SocketProvider } from './context/AuthContext';
import { ProtectedRoute } from './pages';
import { Placeholder } from './components/common/CommonUI';
import { ErrorBoundary } from './ErrorBoundary';

// Public / Auth
const Login = lazy(() => import('./pages').then(m => ({ default: m.Login })));
const ChangePasswordPage = lazy(() => import('./pages').then(m => ({ default: m.ChangePasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages').then(m => ({ default: m.ResetPasswordPage })));
const AttendPage = lazy(() => import('./pages').then(m => ({ default: m.AttendPage })));

// Dashboards (Charts decoupled)
const AdminDashboard = lazy(() => import('./pages/dashboards/AdminDashboard'));
const SuperAdminDashboard = lazy(() => import('./pages/dashboards/SuperAdminDashboard'));
const AnalyticsPage = lazy(() => import('./pages/analytics/AnalyticsPage'));

// Workforce (modular chunks)
const T3WorkforcePage = lazy(() => import('./pages/workforce/T3WorkforcePage').then(m => ({ default: m.T3WorkforcePage })));
const MyWorkforcePage = lazy(() => import('./pages/workforce/MyWorkforcePage').then(m => ({ default: m.MyWorkforcePage })));
const T3ApprovalsPage = lazy(() => import('./pages/workforce/T3ApprovalsPage').then(m => ({ default: m.T3ApprovalsPage })));

// HR (modular chunks)
const HrPage = lazy(() => import('./pages/hr/HrPage').then(m => ({ default: m.HrPage })));
const MyScorecardPage = lazy(() => import('./pages/hr/MyScorecardPage').then(m => ({ default: m.MyScorecardPage })));

// Profile (modular chunks)
const MyProfilePage = lazy(() => import('./pages/profile/MyProfilePage').then(m => ({ default: m.MyProfilePage })));
const UserProfileView = lazy(() => import('./pages/profile/UserProfileView').then(m => ({ default: m.UserProfileView })));
const TeamProfilesPage = lazy(() => import('./pages/profile/TeamProfilesPage').then(m => ({ default: m.TeamProfilesPage })));

// Role Dashboards & Feature Pages
const T3DashboardEnhanced = lazy(() => import('./pages').then(m => ({ default: m.T3DashboardEnhanced })));
const T2DashboardEnhanced = lazy(() => import('./pages').then(m => ({ default: m.T2DashboardEnhanced })));
const T1Dashboard = lazy(() => import('./pages').then(m => ({ default: m.T1Dashboard })));
const UserManagement = lazy(() => import('./pages').then(m => ({ default: m.UserManagement })));
const AddUserPage = lazy(() => import('./pages').then(m => ({ default: m.AddUserPage })));
const BulkImportPage = lazy(() => import('./pages').then(m => ({ default: m.BulkImportPage })));
const EventsPage = lazy(() => import('./pages').then(m => ({ default: m.EventsPage })));
const EventDetailPage = lazy(() => import('./pages').then(m => ({ default: m.EventDetailPage })));
const ApplicationsPage = lazy(() => import('./pages').then(m => ({ default: m.ApplicationsPage })));
const MyApplicationsPage = lazy(() => import('./pages').then(m => ({ default: m.MyApplicationsPage })));
const AttendancePage = lazy(() => import('./pages').then(m => ({ default: m.AttendancePage })));
const CertificatesPage = lazy(() => import('./pages').then(m => ({ default: m.CertificatesPage })));
const TeamsPage = lazy(() => import('./pages').then(m => ({ default: m.TeamsPage })));
const MyTeamsPage = lazy(() => import('./pages').then(m => ({ default: m.MyTeamsPage })));
const MyShiftsPage = lazy(() => import('./pages').then(m => ({ default: m.MyShiftsPage })));
const AdminManagementPage = lazy(() => import('./pages').then(m => ({ default: m.AdminManagementPage })));
const AuditLogsPage = lazy(() => import('./pages').then(m => ({ default: m.AuditLogsPage })));
const SessionsPage = lazy(() => import('./pages').then(m => ({ default: m.SessionsPage })));
const Chat = lazy(() => import('./pages').then(m => ({ default: m.Chat })));
const NotificationsPage = lazy(() => import('./pages').then(m => ({ default: m.NotificationsPage })));
const ReviewsPage = lazy(() => import('./pages').then(m => ({ default: m.ReviewsPage })));
const MyReviewsPage = lazy(() => import('./pages').then(m => ({ default: m.MyReviewsPage })));
const QRCheckIn = lazy(() => import('./pages').then(m => ({ default: m.QRCheckIn })));
const ProfilePage = lazy(() => import('./pages').then(m => ({ default: m.ProfilePage })));
const PreferencesPage = lazy(() => import('./pages').then(m => ({ default: m.PreferencesPage })));
const AnnouncementsPage = lazy(() => import('./pages').then(m => ({ default: m.AnnouncementsPage })));
const TimesheetPage = lazy(() => import('./pages').then(m => ({ default: m.TimesheetPage })));

const PageSpinner = () => (
  <div className="min-h-[50vh] flex items-center justify-center">
    <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

const RootRedirect = () => {
  const { user, initializing } = useAuth();
  if (initializing) return null;
  if (!user) return <Navigate to="/login" replace />;
  const roleConfig = ROLES[user?.role] || ROLES.T1_VOLUNTEER;
  return <Navigate to={roleConfig?.route || '/login'} replace />;
};

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <SocketProvider>
            <Suspense fallback={<PageSpinner />}>
              <Routes>
                {/* Public / Auth */}
                <Route path="/login" element={<Login />} />
                <Route path="/change-password" element={<ChangePasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/attend/:token" element={<AttendPage />} />
                <Route path="/" element={<RootRedirect />} />

                {/* Super Admin */}
                <Route path="/super-admin" element={<ProtectedRoute roles={['SUPER_ADMIN']}><SuperAdminDashboard /></ProtectedRoute>} />
                <Route path="/super-admin/admins" element={<ProtectedRoute roles={['SUPER_ADMIN']}><AdminManagementPage /></ProtectedRoute>} />
                <Route path="/super-admin/audit" element={<ProtectedRoute roles={['SUPER_ADMIN']}><AuditLogsPage /></ProtectedRoute>} />
                <Route path="/super-admin/sessions" element={<ProtectedRoute roles={['SUPER_ADMIN']}><SessionsPage /></ProtectedRoute>} />
                <Route path="/super-admin/config" element={<ProtectedRoute roles={['SUPER_ADMIN']}><Placeholder title="System Config" /></ProtectedRoute>} />
                <Route path="/super-admin/permissions" element={<ProtectedRoute roles={['SUPER_ADMIN']}><Placeholder title="Permissions" /></ProtectedRoute>} />

                {/* Admin */}
                <Route path="/admin" element={<ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><AdminDashboard /></ProtectedRoute>} />
                <Route path="/admin/users" element={<ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><UserManagement /></ProtectedRoute>} />
                <Route path="/admin/users/new" element={<ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><AddUserPage /></ProtectedRoute>} />
                <Route path="/admin/users/bulk" element={<ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><BulkImportPage /></ProtectedRoute>} />
                <Route path="/admin/analytics" element={<ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><AnalyticsPage /></ProtectedRoute>} />
                <Route path="/admin/events" element={<ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><EventsPage /></ProtectedRoute>} />
                <Route path="/admin/events/:id" element={<ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><EventDetailPage /></ProtectedRoute>} />
                <Route path="/admin/teams" element={<ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><TeamsPage /></ProtectedRoute>} />

                {/* T3 */}
                <Route path="/t3" element={<ProtectedRoute roles={['T3_EXECUTIVE']}><T3DashboardEnhanced /></ProtectedRoute>} />
                <Route path="/t3/workforce" element={<ProtectedRoute roles={['T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN']}><T3WorkforcePage /></ProtectedRoute>} />
                <Route path="/hr" element={<ProtectedRoute roles={['T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN']}><HrPage /></ProtectedRoute>} />
                <Route path="/t3/approvals" element={<ProtectedRoute roles={['T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN']}><T3ApprovalsPage /></ProtectedRoute>} />
                <Route path="/t3/teams" element={<ProtectedRoute roles={['T3_EXECUTIVE']}><MyTeamsPage /></ProtectedRoute>} />
                <Route path="/t3/events/:id" element={<ProtectedRoute roles={['T3_EXECUTIVE']}><EventDetailPage /></ProtectedRoute>} />
                <Route path="/t3/applications" element={<ProtectedRoute roles={['T3_EXECUTIVE']}><ApplicationsPage /></ProtectedRoute>} />
                <Route path="/t3/attendance" element={<ProtectedRoute roles={['T3_EXECUTIVE']}><AttendancePage /></ProtectedRoute>} />
                <Route path="/t3/reviews" element={<ProtectedRoute roles={['T3_EXECUTIVE']}><ReviewsPage /></ProtectedRoute>} />
                <Route path="/t3/certificates" element={<ProtectedRoute roles={['T3_EXECUTIVE']}><CertificatesPage /></ProtectedRoute>} />

                {/* T2 */}
                <Route path="/t2" element={<ProtectedRoute roles={['T2_ASSOCIATE']}><T2DashboardEnhanced /></ProtectedRoute>} />
                <Route path="/t2/events" element={<ProtectedRoute roles={['T2_ASSOCIATE']}><EventsPage /></ProtectedRoute>} />
                <Route path="/t2/applications" element={<ProtectedRoute roles={['T2_ASSOCIATE']}><MyApplicationsPage /></ProtectedRoute>} />
                <Route path="/t2/shifts" element={<ProtectedRoute roles={['T2_ASSOCIATE']}><MyShiftsPage /></ProtectedRoute>} />
                <Route path="/t2/certificates" element={<ProtectedRoute roles={['T2_ASSOCIATE']}><CertificatesPage /></ProtectedRoute>} />

                {/* T1 */}
                <Route path="/t1" element={<ProtectedRoute roles={['T1_VOLUNTEER']}><T1Dashboard /></ProtectedRoute>} />
                <Route path="/t1/checkin" element={<ProtectedRoute roles={['T1_VOLUNTEER']}><QRCheckIn /></ProtectedRoute>} />
                <Route path="/t1/events" element={<ProtectedRoute roles={['T1_VOLUNTEER']}><EventsPage /></ProtectedRoute>} />
                <Route path="/t1/applications" element={<ProtectedRoute roles={['T1_VOLUNTEER']}><MyApplicationsPage /></ProtectedRoute>} />
                <Route path="/t1/shifts" element={<ProtectedRoute roles={['T1_VOLUNTEER']}><MyShiftsPage /></ProtectedRoute>} />
                <Route path="/t1/certificates" element={<ProtectedRoute roles={['T1_VOLUNTEER']}><CertificatesPage /></ProtectedRoute>} />
                <Route path="/t1/reviews" element={<ProtectedRoute roles={['T1_VOLUNTEER']}><MyReviewsPage /></ProtectedRoute>} />

                {/* Shared & Profile */}
                <Route path="/scorecard" element={<ProtectedRoute><MyScorecardPage /></ProtectedRoute>} />
                <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
                <Route path="/announcements" element={<ProtectedRoute><AnnouncementsPage /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><MyProfilePage /></ProtectedRoute>} />
                <Route path="/profile/team" element={<ProtectedRoute roles={['T3_EXECUTIVE']}><TeamProfilesPage /></ProtectedRoute>} />
                <Route path="/profile/:userId" element={<ProtectedRoute><UserProfileView /></ProtectedRoute>} />
                <Route path="/preferences" element={<ProtectedRoute><PreferencesPage /></ProtectedRoute>} />
                <Route path="/timesheets" element={<ProtectedRoute><TimesheetPage /></ProtectedRoute>} />
                <Route path="/my-workforce" element={<ProtectedRoute><MyWorkforcePage /></ProtectedRoute>} />
                <Route path="/admin/applications" element={<ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><ApplicationsPage /></ProtectedRoute>} />
                <Route path="/approval-requests" element={<ProtectedRoute><ApplicationsPage /></ProtectedRoute>} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </SocketProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
