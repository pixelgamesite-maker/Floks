import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, captureReferral } from "../hooks/useAuth";
import { Backdrop, EggArt, XGlyph } from "../components/Shell";

export default function Landing() {
  const { signInWithX, session, loading } = useAuth();
  const [excited, setExcited] = useState(false);
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
    setExcited(true);
    try {
      await signInWithX();
    } catch {
      setBusy(false);
      setExcited(false);
      setError("X didn't hand us a session. Check your pop-up blocker and try again.");
    }
  }

  return (
    <div className="page">
      <Backdrop />

      <div
        className="wrap center stack"
        style={{ minHeight: "100vh", justifyContent: "center", alignItems: "center", gap: 28 }}
      >
        <EggArt level={0} size={240} energized={excited} />

        <h1 className="h-xl center" style={{ color: "var(--cream)", textShadow: "5px 5px 0 var(--ink)" }}>
          Welcome to the <span className="word-yolk">Barn</span>
        </h1>

        <button
          className="btn"
          onClick={enter}
          disabled={busy}
          onMouseEnter={() => !busy && setExcited(true)}
          onMouseLeave={() => !busy && setExcited(false)}
          onFocus={() => !busy && setExcited(true)}
          onBlur={() => !busy && setExcited(false)}
        >
          <XGlyph />
          {busy ? "Opening X…" : "Enter"}
        </button>

        {error && <p className="notice">{error}</p>}
      </div>
    </div>
  );
}
