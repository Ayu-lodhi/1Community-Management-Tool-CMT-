import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, ROLES, ProtectedRoute, SocketProvider } from './pages';
import {
  Login, SuperAdminDashboard, AdminDashboard,
  T3DashboardEnhanced, T2DashboardEnhanced, T1Dashboard,
  UserManagement, AddUserPage, BulkImportPage, EventsPage, ApplicationsPage, MyApplicationsPage,
  AttendancePage, CertificatesPage, TeamsPage, MyTeamsPage, MyShiftsPage,
  AdminManagementPage, AuditLogsPage, SessionsPage, AnalyticsPage,
  Chat, NotificationsPage, ReviewsPage, QRCheckIn, Placeholder,
  EventDetailPage, ProfilePage, MyReviewsPage,
  ChangePasswordPage, ResetPasswordPage, PreferencesPage, AnnouncementsPage,
  TimesheetPage, AttendPage
} from './pages';
import { MyProfilePage } from './pages/profile/MyProfilePage';
import { UserProfileView } from './pages/profile/UserProfileView';
import { TeamProfilesPage } from './pages/profile/TeamProfilesPage';

const RootRedirect = () => {
  const { user, initializing } = useAuth();
  if (initializing) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={ROLES[user.role].route} replace />;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
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
            <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
            <Route path="/announcements" element={<ProtectedRoute><AnnouncementsPage /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><MyProfilePage /></ProtectedRoute>} />
            <Route path="/profile/team" element={<ProtectedRoute roles={['T3_EXECUTIVE']}><TeamProfilesPage /></ProtectedRoute>} />
            <Route path="/profile/:userId" element={<ProtectedRoute><UserProfileView /></ProtectedRoute>} />
            <Route path="/preferences" element={<ProtectedRoute><PreferencesPage /></ProtectedRoute>} />
            <Route path="/timesheets" element={<ProtectedRoute><TimesheetPage /></ProtectedRoute>} />
            <Route path="/admin/applications" element={<ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><ApplicationsPage /></ProtectedRoute>} />
            <Route path="/approval-requests" element={<ProtectedRoute><ApplicationsPage /></ProtectedRoute>} />


            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;