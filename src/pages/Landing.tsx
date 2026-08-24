import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Backdrop, Egg, Ticker, XGlyph } from "../components/Shell";

const STATS: [string, string][] = [
  ["4,900", "Supply"],
  ["Robinhood", "Chain"],
  ["OpenSea", "Launchpad"],
  ["$YOLK", "Token"],
];

const BEATS = [
  { k: "Sign in", d: "One tap with X. No form, no wallet drop, no allocation for bots." },
  { k: "Contribute", d: "Chat, tasks and community work pay out Barn Points across 72 hours." },
  { k: "Hatch", d: "Spend points on the five items, hatch your egg, keep your mint access." },
];

export default function Landing() {
  const { signInWithX, session, loading } = useAuth();
  const [crack, setCrack] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate("/home", { replace: true });
  }, [loading, session, navigate]);

  async function enter() {
    setBusy(true);
    setError("");
    setCrack(1);
    try {
      await signInWithX();
    } catch {
      setBusy(false);
      setCrack(0);
      setError("X didn't hand us a session. Check your pop-up blocker and try again.");
    }
  }

  return (
    <div className="page">
      <Backdrop />

      <div className="wrap" style={{ display: "grid", gap: "clamp(24px,5vw,56px)", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,0.85fr)", alignItems: "center", minHeight: "88vh" }}>
        <div className="stack">
          <span className="chip chip-live">🥚 Roost Event live</span>

          <h1 className="h-xl" style={{ color: "var(--cream)", textShadow: "5px 5px 0 var(--ink)" }}>
            Become a part
            <br />
            of the <span className="word-yolk">Barn</span>
          </h1>

          <p className="lede" style={{ color: "var(--cream)" }}>
            Floks is 4,900 chickens on Robinhood Chain, and a 72-hour contribution system that decides
            who mints. Whitelist forms get botted. Eggs don't hatch themselves.
          </p>

          <div className="row">
            <button
              className="btn"
              onClick={enter}
              disabled={busy}
              onMouseEnter={() => !busy && setCrack(0.55)}
              onMouseLeave={() => !busy && setCrack(0)}
              onFocus={() => !busy && setCrack(0.55)}
              onBlur={() => !busy && setCrack(0)}
            >
              <XGlyph />
              {busy ? "Opening X…" : "Continue with X"}
            </button>
            <a className="btn btn-ink" href="#how">
              How the Barn works
            </a>
          </div>

          <p className="eyebrow" style={{ color: "var(--cream)", opacity: 0.75 }}>
            We read your handle and avatar. Nothing else, ever.
          </p>

          {error && <p className="notice">{error}</p>}
        </div>

        <Egg crack={crack} />
      </div>

      <Ticker />

      <div className="wrap" id="how">
        <div className="panel stack">
          <span className="eyebrow">The routine · 72 hours</span>
          <h2 className="h-lg">Three moves, one egg</h2>
          <div className="grid-items">
            {BEATS.map((b) => (
              <div key={b.k} className="item" style={{ alignItems: "flex-start", flexDirection: "column", gap: 6 }}>
                <b style={{ fontSize: "1.15rem" }}>{b.k}</b>
                <span style={{ fontSize: "0.9rem", lineHeight: 1.55 }}>{b.d}</span>
              </div>
            ))}
          </div>

          <div className="stat-strip" style={{ marginTop: 8 }}>
            {STATS.map(([v, l]) => (
              <div className="stat" key={l}>
                <b>{v}</b>
                <span>{l}</span>
              </div>
            ))}
          </div>

          <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
            Mint price, mint date and $YOLK timing are still TBA. Floks is a digital collectible, not
            financial advice.
          </p>
        </div>
      </div>

      <div className="spacer-lg" />
    </div>
  );
}
