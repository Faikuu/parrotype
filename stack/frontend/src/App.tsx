import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from '@/components/Layout';
import { NotFound } from '@/components/NotFound';
import LoginPage from '@/features/auth/LoginPage';
import RegisterPage from '@/features/auth/RegisterPage';
import TestPage from '@/features/test/TestPage';
import { useApplySettings } from '@/store/useApplySettings';

// These pull in chart.js later, so keep them out of the first bundle.
const AccountPage = lazy(() => import('@/features/account/AccountPage'));
const LeaderboardPage = lazy(() => import('@/features/leaderboard/LeaderboardPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
const RaceLobbyPage = lazy(() => import('@/features/race/RaceLobbyPage'));
const RaceRoomPage = lazy(() => import('@/features/race/RaceRoomPage'));
const LearnPage = lazy(() => import('@/features/learn/LearnPage'));
const AdminPage = lazy(() => import('@/features/admin/AdminPage'));

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
                <AdminPage />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
