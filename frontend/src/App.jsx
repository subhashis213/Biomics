import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import AdminDashboard from './pages/AdminDashboard';
import AuthPage from './pages/AuthPage';
import StudentDashboard from './pages/StudentDashboard';
import StudentLecturePage from './pages/StudentLecturePage';
import StudentQuizPage from './pages/StudentQuizPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
    <ScrollToTop />
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
      <Route
        path="/student/quiz/:quizId"
        element={(
          <ProtectedRoute role="user">
            <StudentQuizPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/module/:courseName/:moduleName/lectures"
        element={(
          <ProtectedRoute role="user">
            <StudentLecturePage />
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ErrorBoundary>
  );
}
