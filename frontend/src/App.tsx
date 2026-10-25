import { Navigate, Route, Routes } from "react-router-dom";

import { homePath, RequireAuth, useAuth } from "./auth/AuthContext";
import { AppShell } from "./components/AppShell";
import { AdminStatsPage } from "./pages/AdminStatsPage";
import { AdminTaskDetailPage } from "./pages/AdminTaskDetailPage";
import { AdminTasksPage } from "./pages/AdminTasksPage";
import { AdminVideosPage } from "./pages/AdminVideosPage";
import { AnnotatorTasksPage } from "./pages/AnnotatorTasksPage";
import { ForbiddenPage, NotFoundPage } from "./pages/ErrorPages";
import { LoginPage } from "./pages/LoginPage";
import { WorkspacePage } from "./pages/WorkspacePage";

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homePath(user) : "/login"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/403" element={<ForbiddenPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomeRedirect />} />
        <Route
          path="/tasks"
          element={
            <RequireAuth roles={["ANNOTATOR"]}>
              <AnnotatorTasksPage />
            </RequireAuth>
          }
        />
        <Route
          path="/tasks/:assignmentId"
          element={
            <RequireAuth roles={["ANNOTATOR"]}>
              <WorkspacePage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/tasks"
          element={
            <RequireAuth roles={["PLATFORM_ADMIN", "TENANT_ADMIN"]}>
              <AdminTasksPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/tasks/:taskId"
          element={
            <RequireAuth roles={["PLATFORM_ADMIN", "TENANT_ADMIN"]}>
              <AdminTaskDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/videos"
          element={
            <RequireAuth roles={["PLATFORM_ADMIN", "TENANT_ADMIN"]}>
              <AdminVideosPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/stats"
          element={
            <RequireAuth roles={["PLATFORM_ADMIN", "TENANT_ADMIN"]}>
              <AdminStatsPage />
            </RequireAuth>
          }
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
