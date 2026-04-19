import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import AdminContentLibraryPage from './pages/AdminContentLibraryPage';
import AdminCourseWorkspacePage from './pages/AdminCourseWorkspacePage';
import AdminAnnouncementsWorkspacePage from './pages/AdminAnnouncementsWorkspacePage';
import AdminAuditLogPage from './pages/AdminAuditLogPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminMockExamPage from './pages/AdminMockExamPage';
import AdminPricingWorkspacePage from './pages/AdminPricingWorkspacePage';
import AdminQuizBuilderPage from './pages/AdminQuizBuilderPage';
import AdminLearnerInsightsPage from './pages/AdminLearnerInsightsPage';
import AdminLiveClassesPage from './pages/AdminLiveClassesPage';
import AdminRegisteredLearnersPage from './pages/AdminRegisteredLearnersPage';
import AdminRecoveryCenterPage from './pages/AdminRecoveryCenterPage';
import AdminRevenueTrackingPage from './pages/AdminRevenueTrackingPage';
import AdminStorageMonitorPage from './pages/AdminStorageMonitorPage';
import AdminVoucherWorkspacePage from './pages/AdminVoucherWorkspacePage';
import AdminTestSeriesHubPage from './pages/AdminTestSeriesHubPage';
import AdminTopicTestBuilderPage from './pages/AdminTopicTestBuilderPage';
import AdminTopicTestCatalogPage from './pages/AdminTopicTestCatalogPage';
import AdminFullMockTestBuilderPage from './pages/AdminFullMockTestBuilderPage';
import SessionActivityTracker from './components/SessionActivityTracker';
import AuthPage from './pages/AuthPage';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const CommunityChatPage = lazy(() => import('./pages/CommunityChatPage'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));
const StudentLiveClassesPage = lazy(() => import('./pages/StudentLiveClassesPage'));
const StudentLecturePage = lazy(() => import('./pages/StudentLecturePage'));
const StudentModuleDetailsPage = lazy(() => import('./pages/StudentModuleDetailsPage'));
const StudentMockExamPage = lazy(() => import('./pages/StudentMockExamPage'));
const StudentModuleQuizPage = lazy(() => import('./pages/StudentModuleQuizPage'));
const StudentQuizPage = lazy(() => import('./pages/StudentQuizPage'));
const StudentTestSeriesPage = lazy(() => import('./pages/StudentTestSeriesPage'));
const StudentTopicTestCatalogPage = lazy(() => import('./pages/StudentTopicTestCatalogPage'));
const StudentCourseModulesPage = lazy(() => import('./pages/StudentCourseModulesPage'));
const StudentInsightsPage = lazy(() => import('./pages/StudentInsightsPage'));
const StudentQuizPerformancePage = lazy(() => import('./pages/StudentQuizPerformancePage'));
const StudentTestSeriesPerformancePage = lazy(() => import('./pages/StudentTestSeriesPerformancePage'));

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
    <SessionActivityTracker />
    <ScrollToTop />
    <Routes>
      <Route path="/" element={<Suspense fallback={null}><LandingPage /></Suspense>} />
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/admin"
        element={(
          <ProtectedRoute role="admin">
            <AdminDashboard />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/course-workspace/:courseName"
        element={(
          <ProtectedRoute role="admin">
            <AdminCourseWorkspacePage />
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
        path="/admin/live-classes"
        element={(
          <ProtectedRoute role="admin">
            <AdminLiveClassesPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/live-classes/:classId/studio"
        element={(
          <ProtectedRoute role="admin">
            <AdminLiveClassesPage />
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
        path="/admin/community-chat"
        element={(
          <ProtectedRoute role="admin">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading community chat...</div>}>
              <CommunityChatPage />
            </Suspense>
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
        path="/admin/registered-learners"
        element={(
          <ProtectedRoute role="admin">
            <AdminRegisteredLearnersPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/registered-learners/:username"
        element={(
          <ProtectedRoute role="admin">
            <AdminLearnerInsightsPage />
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
        path="/admin/storage-monitor"
        element={(
          <ProtectedRoute role="admin">
            <AdminStorageMonitorPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/test-series"
        element={(
          <ProtectedRoute role="admin">
            <AdminTestSeriesHubPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/test-series/topic-tests"
        element={(
          <ProtectedRoute role="admin">
            <AdminTopicTestBuilderPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/test-series/topic-tests/catalog"
        element={(
          <ProtectedRoute role="admin">
            <AdminTopicTestCatalogPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/test-series/full-mocks"
        element={(
          <ProtectedRoute role="admin">
            <AdminFullMockTestBuilderPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student"
        element={(
          <ProtectedRoute role="user">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading student dashboard...</div>}>
              <StudentDashboard />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/live-classes"
        element={(
          <ProtectedRoute role="user">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading live classes...</div>}>
              <StudentLiveClassesPage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/live-classes/:classId"
        element={(
          <ProtectedRoute role="user">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading live classes...</div>}>
              <StudentLiveClassesPage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/community-chat"
        element={(
          <ProtectedRoute role="user">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading community chat...</div>}>
              <CommunityChatPage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/quiz/:quizId"
        element={(
          <ProtectedRoute role="user">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading quiz page...</div>}>
              <StudentQuizPage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/course/:courseName/modules"
        element={(
          <ProtectedRoute role="user">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading course modules...</div>}>
              <StudentCourseModulesPage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/module/:courseName/:moduleName"
        element={(
          <ProtectedRoute role="user">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading module details...</div>}>
              <StudentModuleDetailsPage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/module/:courseName/:moduleName/lectures"
        element={(
          <ProtectedRoute role="user">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading lecture workspace...</div>}>
              <StudentLecturePage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/module/:courseName/:moduleName/quizzes"
        element={(
          <ProtectedRoute role="user">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading module quizzes...</div>}>
              <StudentModuleQuizPage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/mock-exam/:examId"
        element={(
          <ProtectedRoute role="user">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading mock exam...</div>}>
              <StudentMockExamPage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/test-series"
        element={(
          <ProtectedRoute role="user">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading test series...</div>}>
              <StudentTestSeriesPage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/test-series/topic-tests/catalog"
        element={(
          <ProtectedRoute role="user">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading topic test organizer...</div>}>
              <StudentTopicTestCatalogPage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/insights"
        element={(
          <ProtectedRoute role="user">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading student insights...</div>}>
              <StudentInsightsPage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/quiz-performance"
        element={(
          <ProtectedRoute role="user">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading quiz performance...</div>}>
              <StudentQuizPerformancePage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/test-series-performance"
        element={(
          <ProtectedRoute role="user">
            <Suspense fallback={<div style={{ padding: 24 }}>Loading test series performance...</div>}>
              <StudentTestSeriesPerformancePage />
            </Suspense>
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    
    </Routes>
    </ErrorBoundary>
  );
}
