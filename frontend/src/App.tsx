import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import SetList from "./pages/SetList";
import Onboarding from "./pages/Onboarding";
import CreateSet from "./pages/CreateSet";
import SetDetail from "./pages/SetDetail";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <SetList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sets/new"
        element={
          <ProtectedRoute>
            <CreateSet />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sets/:setId"
        element={
          <ProtectedRoute>
            <SetDetail />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}