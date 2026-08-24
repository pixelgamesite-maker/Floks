import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Backdrop, TopBar, Egg, Ticker } from "../components/Shell";

/** Flip to true (or drive it from a Supabase flag) when the 72 hours begin. */
export const BARN_UNLOCKED = false;

const SLOTS = [
  { icon: "🧰", name: "Incubator", cost: 120 },
  { icon: "🌡️", name: "Thermometer", cost: 90 },
  { icon: "🪹", name: "Nest", cost: 150 },
  { icon: "💧", name: "Water", cost: 60 },
  { icon: "💡", name: "Heat Bulb", cost: 180 },
];

export default function TheBarn() {
  const { resident } = useAuth();
  const held = 0; // wire to resident_items once the Barn is live

  return (
    <div className="page">
      <Backdrop />
      <TopBar back={{ to: "/home", label: "Coops" }} />

      <div className="wrap stack">
        <div className="stack" style={{ gap: 12 }}>
          <span className="chip chip-lock">🔒 Locked until the doors move</span>
          <h1 className="h-lg" style={{ color: "var(--cream)", textShadow: "4px 4px 0 var(--ink)" }}>
            The <span className="word-yolk">Barn</span>
          </h1>
          <p className="lede" style={{ color: "var(--cream)" }}>
            72 hours. One egg per resident. Earn Barn Points, buy the five items at the Farmers'
            Market, and hatch before the clock runs out. Everyone who hatches holds mint access.
          </p>
        </div>

        <div
          className="panel"
          style={{ display: "grid", gap: 24, gridTemplateColumns: "minmax(0,0.8fr) minmax(0,1.2fr)", alignItems: "center" }}
        >
          <div style={{ opacity: BARN_UNLOCKED ? 1 : 0.55 }}>
            <Egg crack={0} />
            <p className="center eyebrow" style={{ marginTop: 8 }}>
              {BARN_UNLOCKED ? `@${resident?.handle}'s egg` : "Your egg is waiting"}
            </p>
          </div>

          <div className="stack" style={{ gap: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="eyebrow">Hatch checklist</span>
              <span className="chip">{held} / 5 collected</span>
            </div>

            <div className="stack" style={{ gap: 8 }}>
              {SLOTS.map((s) => (
                <div className="item" key={s.name} style={{ opacity: BARN_UNLOCKED ? 1 : 0.6 }}>
                  <span className="item-icon" aria-hidden="true">{s.icon}</span>
                  <div>
                    <b>{s.name}</b>
                    <small>{s.cost} BP at the market</small>
                  </div>
                  <span className="task-points">{BARN_UNLOCKED ? "Buy" : "🔒"}</span>
                </div>
              ))}
            </div>

            <button className="btn" disabled>
              {BARN_UNLOCKED ? "Hatch your egg" : "Hatching opens with the Barn"}
            </button>
          </div>
        </div>

        <div className="panel stack">
          <span className="eyebrow">Where points come from</span>
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
          <h2 className="h-md">Doors aren't open yet</h2>
          <p className="muted" style={{ maxWidth: "44ch", margin: 0 }}>
            Bank points in the Roost Event now — they carry straight into the Barn, and residents who
            arrive with a balance start buying items on hour one.
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
