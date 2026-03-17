import { Navigate, Route, Routes } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import AdminDashboard from './pages/AdminDashboard';
import AuthPage from './pages/AuthPage';
import StudentDashboard from './pages/StudentDashboard';

export default function App() {
  return (
    <ErrorBoundary>
    <Routes>
      <Route path="/" element={<AuthPage />} />
      <Route
        path="/admin"
        element={(
          <ProtectedRoute role="admin">
            <AdminDashboard />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student"
        element={(
          <ProtectedRoute role="user">
            <StudentDashboard />
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ErrorBoundary>
  );
}
