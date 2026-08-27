import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ITEMS, eggLevel, useHatchProgress } from "../hooks/useHatchProgress";
import { Backdrop, TopBar, EggArt, Ticker } from "../components/Shell";

/** Flip to true when this next phase actually opens. */
export const ROOST_EVENT_UNLOCKED = false;

export default function TheBarn() {
  const { resident } = useAuth();
  const { owned, eggClaimed, hatchReady } = useHatchProgress(resident?.id);

  return (
    <div className="page">
      <Backdrop />
      <TopBar back={{ to: "/home", label: "Coops" }} />

      <div className="wrap stack">
        <div className="stack" style={{ gap: 12 }}>
          <span className="chip chip-lock">🔒 Coming next</span>
          <h1 className="h-lg" style={{ color: "var(--cream)", textShadow: "4px 4px 0 var(--ink)" }}>
            The <span className="word-yolk">Roost</span> Event
          </h1>
          <p className="lede" style={{ color: "var(--cream)" }}>
            What's next once the Barn's contribution window wraps. Everything you earn and collect
            there carries straight in — nothing resets.
          </p>
        </div>

        <div className="panel split">
          <div style={{ opacity: eggClaimed ? 1 : 0.55 }}>
            <EggArt
              level={owned.size}
              label={
                eggClaimed
                  ? `@${resident?.handle} · Level ${eggLevel(owned.size)}`
                  : "Claim your egg in The Barn first"
              }
            />
          </div>

          <div className="stack" style={{ gap: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="eyebrow">Your Barn progress</span>
              <span className="chip">{owned.size} / 5 collected</span>
            </div>

            <div className="stack" style={{ gap: 8 }}>
              {ITEMS.map((s) => {
                const has = owned.has(s.key);
                return (
                  <div className={`item ${has ? "task-done" : ""}`} key={s.key}>
                    <img
                      src={s.image}
                      alt=""
                      className={has ? "" : "art-locked"}
                      style={{ width: 32, height: 32, objectFit: "contain", flexShrink: 0 }}
                    />
                    <div>
                      <b>{s.name}</b>
                      <small>{s.price} BP at the market</small>
                    </div>
                    <span className="task-points">{has ? "✓" : "—"}</span>
                  </div>
                );
              })}
            </div>

            <button className="btn" disabled={!ROOST_EVENT_UNLOCKED || !hatchReady}>
              {!ROOST_EVENT_UNLOCKED
                ? "Locked for now"
                : hatchReady
                ? "Hatch your egg"
                : "Collect all five items first"}
            </button>
          </div>
        </div>

        <div className="panel stack">
          <span className="eyebrow">Where points come from, in the Barn</span>
          <div className="grid-items">
            {[
              ["💬", "Global Farmers Chat", "Show up and talk"],
              ["🐣", "Floks tasks", "Collection-specific work"],
              ["📣", "Social tasks", "Posts, quotes, raids"],
              ["🤝", "Community", "Collabs and events"],
            ].map(([i, n, d]) => (
              <div className="item" key={n}>
                <span className="item-icon" aria-hidden="true">{i}</span>
                <div>
                  <b>{n}</b>
                  <small>{d}</small>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel center stack" style={{ alignItems: "center" }}>
          <h2 className="h-md">Not open yet</h2>
          <p className="muted" style={{ maxWidth: "44ch", margin: 0 }}>
            The Barn is where the actual work happens right now — claim your egg and shop the
            Farmers' Market there.
          </p>
          <Link className="btn" to="/roost-event">
            Go to The Barn
          </Link>
        </div>
      </div>

      <div className="spacer-lg" />
      <Ticker />
      <div className="spacer-lg" />
    </div>
  );
}
