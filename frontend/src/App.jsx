import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './auth/ProtectedRoute.jsx';

const AccountPage = lazy(() => import('./pages/AccountPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const DocumentFormPage = lazy(() => import('./pages/DocumentFormPage.jsx'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage.jsx'));
const NotificationHistoryPage = lazy(() => import('./pages/NotificationHistoryPage.jsx'));
const ReminderSettingsPage = lazy(() => import('./pages/ReminderSettingsPage.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.jsx'));
const DestinationChecklistPage = lazy(() => import('./pages/DestinationChecklistPage.jsx'));
const TravelHistoryPage = lazy(() => import('./pages/TravelHistoryPage.jsx'));
const TripFormPage = lazy(() => import('./pages/TripFormPage.jsx'));

export default function App() {
  return (
    <Suspense fallback={<div className="page-status" role="status">Loading page…</div>}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/new" element={<DocumentFormPage />} />
          <Route path="/documents/:kind/:id/edit" element={<DocumentFormPage />} />
          <Route path="/reminders" element={<ReminderSettingsPage />} />
          <Route path="/notifications" element={<NotificationHistoryPage />} />
          <Route path="/travel-history" element={<TravelHistoryPage />} />
          <Route path="/travel-history/new" element={<TripFormPage />} />
          <Route path="/travel-history/:id/edit" element={<TripFormPage />} />
          <Route path="/destinations" element={<DestinationChecklistPage />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
