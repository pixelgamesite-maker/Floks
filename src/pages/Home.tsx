import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSound } from "../hooks/useSound";
import { Backdrop, TopBar, Ticker } from "../components/Shell";
import { ASSETS } from "../lib/assets";

type Coop = {
  to: string;
  art: string;
  name: string;
  sub: string;
  status: "open" | "locked";
  tag: string;
};

// NOTE: routes are unchanged (/roost-event, /the-barn) but the labels are
// swapped from the original build — the egg-claim/tasks/market page that
// lives at /roost-event is the actual "Barn" from the article (the 72-hour
// contribution routine), so it's labelled The Barn and left open. The
// locked teaser at /the-barn is labelled Roost Event instead.
const COOPS: Coop[] = [
  {
    to: "/roost-event",
    art: ASSETS.cards.barn,
    name: "The Barn",
    sub: "Claim your egg, earn points, hatch",
    status: "open",
    tag: "Open",
  },
  {
    to: "/the-barn",
    art: ASSETS.cards.roost,
    name: "Roost Event",
    sub: "Coming soon",
    status: "locked",
    tag: "Locked",
  },
  {
    to: "/chicken-challenge",
    art: ASSETS.cards.challenge,
    name: "Chicken Challenge",
    sub: "Head-to-head, for bragging rights",
    status: "locked",
    tag: "Locked",
  },
];

export default function Home() {
  const { resident } = useAuth();
  const { play } = useSound();
  const navigate = useNavigate();

  function openCoop(c: Coop) {
    play("select");
    navigate(c.to);
  }

  return (
    <div className="page">
      <Backdrop />
      <TopBar />

      <div className="wrap stack">
        <div className="stack" style={{ gap: 10 }}>
          <span className="eyebrow" style={{ color: "var(--yolk)" }}>
            Welcome back, @{resident?.handle ?? "flok"}
          </span>
          <h1 className="h-lg" style={{ color: "var(--cream)", textShadow: "4px 4px 0 var(--ink)" }}>
            Pick your <span className="word-yolk">coop</span>
          </h1>
          <p className="lede" style={{ color: "var(--cream)" }}>
            One is open. The other two unlock as the Flock grows. Nothing here is a form — everything
            here is something you do.
          </p>
        </div>

        <div className="rail-wrap">
          <div className="rail" aria-hidden="true" />
          <div className="coops">
            {COOPS.map((c) => (
              <button
                key={c.name}
                className={`coop ${c.status === "locked" ? "coop-locked" : ""}`}
                onClick={() => openCoop(c)}
                aria-label={`${c.name} — ${c.status === "open" ? "open" : "locked"}`}
              >
                <div className="coop-card">
                  <span className={`stamp ${c.status === "locked" ? "stamp-lock" : ""}`}>
                    {c.status === "locked" ? "🔒 " : "● "}
                    {c.tag}
                  </span>
                  <img className="coop-art" src={c.art} alt="" />
                  <div className="coop-foot">
                    <div>
                      <div className="coop-name">{c.name}</div>
                      <p className="coop-sub">{c.sub}</p>
                    </div>
                    <span aria-hidden="true" style={{ fontSize: "1.3rem" }}>
                      {c.status === "open" ? "→" : "🔒"}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="spacer-lg" />
      <Ticker />
      <div className="spacer-lg" />
    </div>
  );
}
