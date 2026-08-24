import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { Backdrop, TopBar, Ticker } from "../components/Shell";

/** When the Barn's 72-hour routine begins. Move this and everything reflows. */
export const BARN_OPENS_AT = new Date("2026-09-08T16:00:00Z");

const ITEMS = [
  { icon: "🧰", name: "Incubator", note: "Keeps the heat honest" },
  { icon: "🌡️", name: "Thermometer", note: "Reads the roost" },
  { icon: "🪹", name: "Nest", note: "Somewhere to sit" },
  { icon: "💧", name: "Water", note: "Non-negotiable" },
  { icon: "💡", name: "Heat Bulb", note: "The last 10%" },
];

const TASKS = [
  { key: "follow", label: "Follow @floks on X", points: 25, href: "https://x.com/floks" },
  { key: "quote", label: "Quote the pinned post with your favourite Flok", points: 40, href: "https://x.com/floks" },
  { key: "chat", label: "Say gYolk in the Global Farmers Chat", points: 30, href: "" },
  { key: "invite", label: "Bring one fren to the Barn", points: 50, href: "" },
];

const CHAPTERS = [
  {
    title: "The problem with WL",
    body: "Whitelist is how you reach the mint, and right now it's the weakest link on Robinhood Chain. Forms are ineffective. Applications get botted. Allocations come out lopsided. Twenty thousand bots can drop a wallet and walk away with a spot.",
  },
  {
    title: "So the Barn asks for work",
    body: "72 hours of contribution instead of a form. Sign in with X, arrive at the Barn, and you're handed your own egg. Your job is to hatch it — which means collecting everything a hatch needs first.",
  },
  {
    title: "Points, then items",
    body: "Barn Points come from the Global Farmers Chat, social tasks, Floks-specific tasks, community activities, and whatever else the Flock cooks up. Spend them at the Farmers' Market on the five items. Collect all five and your egg is ready.",
  },
  {
    title: "Hatch, then mint",
    body: "Complete the hatch and you hold access to the mint. That's the whole deal — no lottery, no clout check, no screenshot of a form submission.",
  },
  {
    title: "Collaborations",
    body: "Six communities from Ethereum and Robinhood will join the Flock. We answer DMs. Requirements aren't size or clout, they're eagerness to be part of it. Nothing decided yet.",
  },
];

const FACTS: [string, string][] = [
  ["4,900", "Total supply"],
  ["Robinhood", "Chain"],
  ["TBA", "Mint price"],
  ["OpenSea", "Launchpad"],
];

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = Math.max(0, target.getTime() - now);
  return {
    done: ms === 0,
    d: Math.floor(ms / 86400000),
    h: Math.floor(ms / 3600000) % 24,
    m: Math.floor(ms / 60000) % 60,
    s: Math.floor(ms / 1000) % 60,
  };
}

export default function RoostEvent() {
  const { resident } = useAuth();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(0);
  const clock = useCountdown(BARN_OPENS_AT);

  // Load which starter tasks this resident already cleared.
  useEffect(() => {
    if (!resident) return;
    supabase
      .from("resident_tasks")
      .select("task_key")
      .eq("resident_id", resident.id)
      .then(({ data }) => {
        if (data) setDone(Object.fromEntries(data.map((r) => [r.task_key, true])));
      });
  }, [resident]);

  const earned = useMemo(
    () => TASKS.filter((t) => done[t.key]).reduce((sum, t) => sum + t.points, 0),
    [done]
  );

  // NOTE: this marks the task optimistically. Before launch, move the award into
  // an edge function that actually verifies the follow/quote — otherwise points
  // are trivial to fake from the console.
  async function claim(task: (typeof TASKS)[number]) {
    if (done[task.key]) return;
    if (task.href) window.open(task.href, "_blank", "noopener");
    setDone((d) => ({ ...d, [task.key]: true }));
    if (resident) {
      await supabase
        .from("resident_tasks")
        .upsert(
          { resident_id: resident.id, task_key: task.key, points: task.points },
          { onConflict: "resident_id,task_key" }
        );
    }
  }

  return (
    <div className="page">
      <Backdrop />
      <TopBar back={{ to: "/home", label: "Coops" }} />

      <div className="wrap stack">
        <div className="stack" style={{ gap: 12 }}>
          <span className="chip chip-live">● Roost Event live</span>
          <h1 className="h-lg" style={{ color: "var(--cream)", textShadow: "4px 4px 0 var(--ink)" }}>
            The <span className="word-yolk">Roost</span> Event
          </h1>
          <p className="lede" style={{ color: "var(--cream)" }}>
            Everything that happens before the Barn opens happens here. Read the plan, bank your first
            Barn Points, and be standing in the right place when the doors move.
          </p>
        </div>

        <div className="panel stack">
          <span className="eyebrow">The Barn opens in</span>
          <div className="clock">
            {[
              [clock.d, "Days"],
              [clock.h, "Hours"],
              [clock.m, "Mins"],
              [clock.s, "Secs"],
            ].map(([v, l]) => (
              <div className="clock-cell" key={l as string}>
                <b>{String(v).padStart(2, "0")}</b>
                <span>{l}</span>
              </div>
            ))}
          </div>
          {clock.done && <p className="notice">Doors are open. Head to The Barn.</p>}
        </div>

        {/* Starter tasks */}
        <div className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="eyebrow">Starter tasks</span>
            <span className="chip">{earned} BP banked</span>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {TASKS.map((t) => (
              <button
                key={t.key}
                className={`task ${done[t.key] ? "task-done" : ""}`}
                onClick={() => claim(t)}
                disabled={done[t.key]}
              >
                <span className="task-box">{done[t.key] ? "✓" : ""}</span>
                <span>{t.label}</span>
                <span className="task-points">+{t.points} BP</span>
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
            Points carry into the Barn and spend at the Farmers' Market.
          </p>
        </div>

        {/* The briefing, as openable chapters */}
        <div className="panel stack">
          <span className="eyebrow">The briefing</span>
          <div className="stack" style={{ gap: 10 }}>
            {CHAPTERS.map((c, i) => (
              <div key={c.title} style={{ border: "3px solid var(--ink)", borderRadius: 14, overflow: "hidden" }}>
                <button
                  className="task"
                  style={{ border: 0, borderRadius: 0, boxShadow: "none", background: open === i ? "var(--yolk)" : "var(--shell)" }}
                  onClick={() => setOpen(open === i ? -1 : i)}
                  aria-expanded={open === i}
                >
                  <span className="task-box">{open === i ? "–" : "+"}</span>
                  <b style={{ fontFamily: "var(--display)", fontSize: "1.05rem" }}>{c.title}</b>
                </button>
                {open === i && (
                  <p style={{ margin: 0, padding: "6px 18px 18px", lineHeight: 1.65, fontSize: "0.95rem" }}>
                    {c.body}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Five items preview */}
        <div className="panel stack">
          <span className="eyebrow">What a hatch needs</span>
          <h2 className="h-md">Five items, no substitutes</h2>
          <div className="grid-items">
            {ITEMS.map((it) => (
              <div className="item" key={it.name}>
                <span className="item-icon" aria-hidden="true">{it.icon}</span>
                <div>
                  <b>{it.name}</b>
                  <small>{it.note}</small>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="stat-strip">
          {FACTS.map(([v, l]) => (
            <div className="stat" key={l}>
              <b>{v}</b>
              <span>{l}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="spacer-lg" />
      <Ticker />
      <div className="spacer-lg" />
    </div>
  );
}
