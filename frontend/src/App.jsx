import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import AdminContentLibraryPage from './pages/AdminContentLibraryPage';
import AdminAnnouncementsWorkspacePage from './pages/AdminAnnouncementsWorkspacePage';
import AdminAuditLogPage from './pages/AdminAuditLogPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminMockExamPage from './pages/AdminMockExamPage';
import AdminPricingWorkspacePage from './pages/AdminPricingWorkspacePage';
import AdminQuizBuilderPage from './pages/AdminQuizBuilderPage';
import AdminRecoveryCenterPage from './pages/AdminRecoveryCenterPage';
import AdminRevenueTrackingPage from './pages/AdminRevenueTrackingPage';
import AdminVoucherWorkspacePage from './pages/AdminVoucherWorkspacePage';
import AuthPage from './pages/AuthPage';
import StudentDashboard from './pages/StudentDashboard';
import StudentLecturePage from './pages/StudentLecturePage';
import StudentMockExamPage from './pages/StudentMockExamPage';
import StudentQuizPage from './pages/StudentQuizPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === 'POP') {
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, navigationType]);
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
        path="/admin/announcements-workspace"
        element={(
          <ProtectedRoute role="admin">
            <AdminAnnouncementsWorkspacePage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/content-library"
        element={(
          <ProtectedRoute role="admin">
            <AdminContentLibraryPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/quiz-builder"
        element={(
          <ProtectedRoute role="admin">
            <AdminQuizBuilderPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/mock-exams"
        element={(
          <ProtectedRoute role="admin">
            <AdminMockExamPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/pricing-workspace"
        element={(
          <ProtectedRoute role="admin">
            <AdminPricingWorkspacePage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/voucher-workspace"
        element={(
          <ProtectedRoute role="admin">
            <AdminVoucherWorkspacePage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/revenue-tracking"
        element={(
          <ProtectedRoute role="admin">
            <AdminRevenueTrackingPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/audit-log"
        element={(
          <ProtectedRoute role="admin">
            <AdminAuditLogPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/recovery-center"
        element={(
          <ProtectedRoute role="admin">
            <AdminRecoveryCenterPage />
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
      <Route
        path="/student/mock-exam/:examId"
        element={(
          <ProtectedRoute role="user">
            <StudentMockExamPage />
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ErrorBoundary>
  );
}
