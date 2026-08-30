import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, captureReferral } from "../hooks/useAuth";
import { Backdrop, XGlyph } from "../components/Shell";

export default function Landing() {
  const { signInWithX, session, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    captureReferral();
  }, []);

  useEffect(() => {
    if (!loading && session) navigate("/roost-event", { replace: true });
  }, [loading, session, navigate]);

  async function enter() {
    setBusy(true);
    setError("");
    try {
      await signInWithX();
    } catch {
      setBusy(false);
      setError("X didn't hand us a session. Check your pop-up blocker and try again.");
    }
  }

  return (
    <div className="page">
      <Backdrop />

      <div
        className="wrap center stack"
        style={{ minHeight: "100vh", justifyContent: "center", alignItems: "center", gap: 20 }}
      >
        <h1 className="h-xl center" style={{ color: "var(--cream)", textShadow: "5px 5px 0 var(--ink)" }}>
          <span className="word-yolk">Floks</span>
        </h1>

        <p className="lede center" style={{ color: "var(--cream)", margin: 0 }}>
          Step into the Barn
        </p>

        <button className="btn" onClick={enter} disabled={busy} style={{ marginTop: 12 }}>
          <XGlyph />
          {busy ? "Opening X…" : "Enter"}
        </button>

        {error && <p className="notice">{error}</p>}
      </div>
    </div>
  );
}
