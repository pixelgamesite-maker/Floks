import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSound } from "../hooks/useSound";
import { Backdrop, TopBar, Ticker } from "../components/Shell";

type Coop = {
  to: string;
  art: string;
  name: string;
  sub: string;
  status: "open" | "locked";
  tag: string;
};

const COOPS: Coop[] = [
  {
    to: "/roost-event",
    art: "/Card-1.png",
    name: "Roost Event",
    sub: "Read the plan, take the first tasks",
    status: "open",
    tag: "Open",
  },
  {
    to: "/the-barn",
    art: "/Card-2.png",
    name: "The Barn",
    sub: "72 hours · earn points, hatch your egg",
    status: "locked",
    tag: "Locked",
  },
  {
    to: "/chicken-challenge",
    art: "/Card-3.png",
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
