import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from '@/components/Layout';
import { NotFound } from '@/components/NotFound';
import LoginPage from '@/features/auth/LoginPage';
import RegisterPage from '@/features/auth/RegisterPage';
import TestPage from '@/features/test/TestPage';
import { useApplySettings } from '@/store/useApplySettings';
import { RequirePermission } from '@/features/admin/components/RequirePermission';

// These pull in chart.js later, so keep them out of the first bundle.
const AccountPage = lazy(() => import('@/features/account/AccountPage'));
const LeaderboardPage = lazy(() => import('@/features/leaderboard/LeaderboardPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
const RaceLobbyPage = lazy(() => import('@/features/race/RaceLobbyPage'));
const RaceRoomPage = lazy(() => import('@/features/race/RaceRoomPage'));
const LearnPage = lazy(() => import('@/features/learn/LearnPage'));
// The admin panel: a shell with nested pages. Each page is its own chunk.
const AdminLayout = lazy(() => import('@/features/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('@/features/admin/pages/DashboardPage'));
const AdminUsers = lazy(() => import('@/features/admin/pages/UsersPage'));
const AdminUserDetail = lazy(() => import('@/features/admin/pages/UserDetailPage'));
const AdminGroups = lazy(() => import('@/features/admin/pages/GroupsPage'));
const AdminGroupDetail = lazy(() => import('@/features/admin/pages/GroupDetailPage'));
const AdminPermissions = lazy(() => import('@/features/admin/pages/PermissionsPage'));
const AdminReports = lazy(() => import('@/features/admin/pages/ReportsPage'));
const AdminResults = lazy(() => import('@/features/admin/pages/ResultsPage'));
const AdminQuotes = lazy(() => import('@/features/admin/pages/QuotesPage'));
const AdminRaces = lazy(() => import('@/features/admin/pages/RacesPage'));
const AdminAudit = lazy(() => import('@/features/admin/pages/AuditPage'));

export default function App() {
  useApplySettings();

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<TestPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route
            path="account"
            element={
              <Suspense fallback={null}>
                <AccountPage />
              </Suspense>
            }
          />
          <Route
            path="leaderboard"
            element={
              <Suspense fallback={null}>
                <LeaderboardPage />
              </Suspense>
            }
          />
          <Route
            path="u/:name"
            element={
              <Suspense fallback={null}>
                <ProfilePage />
              </Suspense>
            }
          />
          <Route
            path="race"
            element={
              <Suspense fallback={null}>
                <RaceLobbyPage />
              </Suspense>
            }
          />
          <Route
            path="race/:id"
            element={
              <Suspense fallback={null}>
                <RaceRoomPage />
              </Suspense>
            }
          />
          <Route
            path="learn"
            element={
              <Suspense fallback={null}>
                <LearnPage />
              </Suspense>
            }
          />
          <Route
            path="admin"
            element={
              <Suspense fallback={null}>
                <AdminLayout />
              </Suspense>
            }
          >
            <Route index element={<RequirePermission perm="admin.access"><AdminDashboard /></RequirePermission>} />
            <Route path="users" element={<RequirePermission perm="users.read"><AdminUsers /></RequirePermission>} />
            <Route path="users/:id" element={<RequirePermission perm="users.read"><AdminUserDetail /></RequirePermission>} />
            <Route path="groups" element={<RequirePermission perm="groups.read"><AdminGroups /></RequirePermission>} />
            <Route path="groups/:id" element={<RequirePermission perm="groups.read"><AdminGroupDetail /></RequirePermission>} />
            <Route path="permissions" element={<RequirePermission perm="groups.read"><AdminPermissions /></RequirePermission>} />
            <Route path="reports" element={<RequirePermission perm="reports.read"><AdminReports /></RequirePermission>} />
            <Route path="results" element={<RequirePermission perm="results.read"><AdminResults /></RequirePermission>} />
            <Route path="quotes" element={<RequirePermission perm="quotes.read"><AdminQuotes /></RequirePermission>} />
            <Route path="races" element={<RequirePermission perm="races.read"><AdminRaces /></RequirePermission>} />
            <Route path="audit" element={<RequirePermission perm="audit.read"><AdminAudit /></RequirePermission>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
