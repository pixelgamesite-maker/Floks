import { Link } from "react-router-dom";
import { Backdrop, TopBar, Ticker } from "../components/Shell";

/** Flip when the challenge ships. */
export const CHALLENGE_UNLOCKED = false;

const MODES = [
  { icon: "⚡", name: "Chicken Rush", d: "Sixty seconds of clicks, taps and nerve. Fastest flock wins the pot." },
  { icon: "🥊", name: "Head to head", d: "Call out another resident. Winner takes the Barn Points on the table." },
  { icon: "🏆", name: "Daily ladder", d: "Top of the ladder at midnight takes a rare item, free." },
];

const PLACEHOLDER_LADDER = [
  { rank: 1, who: "—", score: "—" },
  { rank: 2, who: "—", score: "—" },
  { rank: 3, who: "—", score: "—" },
];

export default function ChickenChallenge() {
  return (
    <div className="page">
      <Backdrop />
      <TopBar back={{ to: "/home", label: "Coops" }} />

      <div className="wrap stack">
        <div className="stack" style={{ gap: 12 }}>
          <span className="chip chip-soon">🔒 Coming after the Barn</span>
          <h1 className="h-lg" style={{ color: "var(--cream)", textShadow: "4px 4px 0 var(--ink)" }}>
            Chicken <span className="word-yolk">Challenge</span>
          </h1>
          <p className="lede" style={{ color: "var(--cream)" }}>
            The competitive floor of the Barn. Points you earn by contributing, you can also win — or
            lose — against another resident.
          </p>
        </div>

        <div className="panel stack">
          <span className="eyebrow">Modes</span>
          <div className="grid-items">
            {MODES.map((m) => (
              <div className="item" key={m.name} style={{ alignItems: "flex-start" }}>
                <span className="item-icon" aria-hidden="true">{m.icon}</span>
                <div>
                  <b>{m.name}</b>
                  <small style={{ textTransform: "none", letterSpacing: 0, fontSize: "0.75rem", lineHeight: 1.5 }}>
                    {m.d}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel stack">
          <span className="eyebrow">Ladder</span>
          <div className="stack" style={{ gap: 8, opacity: CHALLENGE_UNLOCKED ? 1 : 0.55 }}>
            {PLACEHOLDER_LADDER.map((r) => (
              <div className="item" key={r.rank}>
                <span className="item-icon" aria-hidden="true">
                  {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : "🥉"}
                </span>
                <div>
                  <b>{r.who}</b>
                  <small>No rounds played yet</small>
                </div>
                <span className="task-points">{r.score}</span>
              </div>
            ))}
          </div>
          <button className="btn" disabled>
            {CHALLENGE_UNLOCKED ? "Enter a round" : "Unlocks after the hatch"}
          </button>
        </div>

        <div className="panel center stack" style={{ alignItems: "center" }}>
          <h2 className="h-md">Warm up in the Roost</h2>
          <p className="muted" style={{ maxWidth: "44ch", margin: 0 }}>
            Every point you bank now is a point you can wager here later.
          </p>
          <Link className="btn" to="/roost-event">
            Go to the Roost Event
          </Link>
        </div>
      </div>

      <div className="spacer-lg" />
      <Ticker />
      <div className="spacer-lg" />
    </div>
  );
}
