import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { Backdrop, Egg } from "./components/Shell";

import Landing from "./pages/Landing";
import Callback from "./pages/Auth/callback";
import Home from "./pages/Home";
import RoostEvent from "./pages/RoostEvent";
import TheBarn from "./pages/TheBarn";
import ChickenChallenge from "./pages/ChickenChallenge";

import "./styles/floks.css";

function Gate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="page">
        <Backdrop />
        <div className="wrap center" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
          <Egg crack={0} />
        </div>
      </div>
    );
  }
  if (!session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/callback" element={<Callback />} />
          <Route
            path="/home"
            element={
              <Gate>
                <Home />
              </Gate>
            }
          />
          <Route
            path="/roost-event"
            element={
              <Gate>
                <RoostEvent />
              </Gate>
            }
          />
          <Route
            path="/the-barn"
            element={
              <Gate>
                <TheBarn />
              </Gate>
            }
          />
          <Route
            path="/chicken-challenge"
            element={
              <Gate>
                <ChickenChallenge />
              </Gate>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
