import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { ITEMS, HATCH_TOTAL, eggLevel, useHatchProgress } from "../hooks/useHatchProgress";
import { useSound } from "../hooks/useSound";
import { Backdrop, TopBar, EggArt, Ticker } from "../components/Shell";
import { Market } from "../components/Market";

/** When the Barn's 72-hour routine begins. Move this and everything reflows. */
export const BARN_OPENS_AT = new Date("2026-09-08T16:00:00Z");

const FLOKS_X = "https://x.com/FloksRH";
const FLOKS_POST = "https://x.com/FloksRH/status/2090831543329517768";

/** One-time entry task, called out on its own above the repeatable social set. */
const FOLLOW_TASK = {
  key: "follow",
  label: "Follow @FloksRH on X",
  hint: "One-time · unlocks the rest",
  points: 100,
  href: FLOKS_X,
};

const SOCIAL_TASKS = [
  { key: "like", label: "Like the Floks post", points: 25, href: FLOKS_POST },
  { key: "comment", label: "Comment on the Floks post", points: 50, href: FLOKS_POST },
  { key: "retweet", label: "Retweet the Floks post", points: 25, href: FLOKS_POST },
];

const ALL_TASKS = [FOLLOW_TASK, ...SOCIAL_TASKS];

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
    body: "Barn Points come from the Global Farmers Chat, social tasks, Floks-specific tasks, community activities, and whatever else the Flock cooks up. Spend them at the Farmers' Market on the five items. Every item you buy levels up your egg.",
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
  const { earned, spent, balance, owned, hatchReady, eggClaimed, loading, refresh, claimEgg, buy } =
    useHatchProgress(resident?.id);
  const { play } = useSound();

  const [taskDone, setTaskDone] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [marketMsg, setMarketMsg] = useState("");
  const [justLeveled, setJustLeveled] = useState(false);
  const clock = useCountdown(BARN_OPENS_AT);

  // The egg pops up for claiming the moment an unclaimed resident lands here.
  useEffect(() => {
    if (!loading && !eggClaimed) setShowClaim(true);
  }, [loading, eggClaimed]);

  useEffect(() => {
    if (!resident) return;
    supabase
      .from("resident_tasks")
      .select("task_key")
      .eq("resident_id", resident.id)
      .then(({ data }) => {
        if (data) setTaskDone(Object.fromEntries(data.map((r) => [r.task_key, true])));
      });
  }, [resident]);

  const tasksEarned = useMemo(
    () => ALL_TASKS.filter((t) => taskDone[t.key]).reduce((sum, t) => sum + t.points, 0),
    [taskDone]
  );

  const followDone = !!taskDone[FOLLOW_TASK.key];
  const level = owned.size;

  // NOTE: marks the task optimistically — see README before launch.
  async function claimTask(task: (typeof ALL_TASKS)[number]) {
    if (taskDone[task.key] || !resident) return;
    play("select");
    if (task.href) window.open(task.href, "_blank", "noopener");
    setTaskDone((d) => ({ ...d, [task.key]: true }));
    await supabase
      .from("resident_tasks")
      .upsert(
        { resident_id: resident.id, task_key: task.key, points: task.points },
        { onConflict: "resident_id,task_key" }
      );
    refresh();
  }

  async function onClaimEgg() {
    setClaiming(true);
    await claimEgg();
    play("claim");
    setClaiming(false);
    setShowClaim(false);
  }

  async function onBuy(item: (typeof ITEMS)[number]) {
    setMarketMsg("");
    const before = owned.size;
    const res = await buy(item);
    if (res.ok) {
      const nextLevel = eggLevel(before + 1);
      if (nextLevel !== eggLevel(before)) {
        play("levelup");
        setJustLeveled(true);
        setTimeout(() => setJustLeveled(false), 900);
      } else {
        play("purchase");
      }
      return;
    }
    play("error");
    if (res.reason === "short") setMarketMsg(`Not enough BP for ${item.name} yet — you need ${item.price - balance} more.`);
    if (res.reason === "error") setMarketMsg("The market didn't take that one — try again.");
  }

  return (
    <div className="page">
      <Backdrop />
      <TopBar back={{ to: "/home", label: "Coops" }} />

      {/* ── Egg claim popup ── */}
      {showClaim && !eggClaimed && (
        <div className="modal-scrim">
          <div className="modal-card panel stack center">
            <span className="eyebrow">Your egg has arrived</span>
            <EggArt level={0} size={200} />
            <h2 className="h-md">A Level 1 Egg</h2>
            <p style={{ margin: 0, lineHeight: 1.6, fontSize: "0.95rem", maxWidth: "34ch" }}>
              One per resident, free. Claim it and it stays on your Roost — every item you buy at the
              Farmers' Market levels it up.
            </p>
            <button className="btn" onClick={onClaimEgg} disabled={claiming}>
              {claiming ? "Claiming…" : "Claim your egg 🥚"}
            </button>
          </div>
        </div>
      )}

      <div className="wrap stack">
        <div className="stack" style={{ gap: 12 }}>
          <span className="chip chip-live">● Roost Event live</span>
          <h1 className="h-lg" style={{ color: "var(--cream)", textShadow: "4px 4px 0 var(--ink)" }}>
            The <span className="word-yolk">Roost</span> Event
          </h1>
          <p className="lede" style={{ color: "var(--cream)" }}>
            Claim your egg, earn Barn Points, and spend them at the Farmers' Market. Five items, five
            levels of egg, one hatch.
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

        {/* ── Your egg ── */}
        <div className="panel split">
          <div className={justLeveled ? "egg-levelup" : ""}>
            {eggClaimed ? (
              <EggArt level={level} label={`Level ${eggLevel(level)} · ${level}/5 items`} />
            ) : (
              <EggArt level={0} label="Unclaimed" />
            )}
          </div>

          <div className="stack" style={{ gap: 10 }}>
            <span className="eyebrow">Your egg</span>
            <h2 className="h-md">
              {!eggClaimed
                ? "Waiting to be claimed"
                : hatchReady
                ? "Ready to hatch"
                : `Level ${eggLevel(level)} and growing`}
            </h2>
            <p style={{ margin: 0, lineHeight: 1.6, fontSize: "0.95rem" }}>
              {!eggClaimed
                ? "Claim it above to open the Farmers' Market."
                : hatchReady
                ? "All five items collected. The hatch itself opens with the Barn."
                : "Each item you buy levels the egg up. Five items takes it to the top."}
            </p>
            <div className="row">
              <span className="chip">{spent}/{HATCH_TOTAL} BP toward hatch</span>
              <span className="chip">{balance} BP to spend</span>
            </div>
            {!eggClaimed && (
              <button className="btn" onClick={() => setShowClaim(true)}>
                Claim your egg 🥚
              </button>
            )}
          </div>
        </div>

        {/* ── Tasks (below the egg) ── */}
        <div className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="eyebrow">Tasks</span>
            <span className="chip">{tasksEarned} BP banked</span>
          </div>

          {/* One-time entry task */}
          <button
            className={`task task-hero ${followDone ? "task-done" : ""}`}
            onClick={() => claimTask(FOLLOW_TASK)}
            disabled={followDone}
          >
            <span className="task-box">{followDone ? "✓" : "𝕏"}</span>
            <span>
              <b style={{ fontFamily: "var(--display)", fontSize: "1.05rem", display: "block" }}>
                {FOLLOW_TASK.label}
              </b>
              <small className="muted" style={{ fontSize: "0.72rem" }}>{FOLLOW_TASK.hint}</small>
            </span>
            <span className="task-points">+{FOLLOW_TASK.points} BP</span>
          </button>

          <span className="eyebrow" style={{ marginTop: 4 }}>Social tasks</span>
          <div className="stack" style={{ gap: 10 }}>
            {SOCIAL_TASKS.map((t) => (
              <button
                key={t.key}
                className={`task ${taskDone[t.key] ? "task-done" : ""}`}
                onClick={() => claimTask(t)}
                disabled={taskDone[t.key] || !followDone}
              >
                <span className="task-box">{taskDone[t.key] ? "✓" : ""}</span>
                <span>{t.label}</span>
                <span className="task-points">+{t.points} BP</span>
              </button>
            ))}
          </div>
          {!followDone && (
            <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
              Follow first — the social tasks unlock right after.
            </p>
          )}
        </div>

        {/* ── Farmers' Market ── */}
        <div className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="eyebrow">Farmers' Market</span>
            <span className="chip">{balance} BP to spend</span>
          </div>
          <Market
            eggClaimed={eggClaimed}
            owned={owned}
            balance={balance}
            earned={earned}
            spent={spent}
            message={marketMsg}
            onBuy={onBuy}
          />
        </div>

        {/* ── Briefing ── */}
        <div className="panel stack">
          <span className="eyebrow">The briefing</span>
          <div className="stack" style={{ gap: 10 }}>
            {CHAPTERS.map((c, i) => (
              <div key={c.title} style={{ border: "3px solid var(--ink)", borderRadius: 14, overflow: "hidden" }}>
                <button
                  className="task"
                  style={{ border: 0, borderRadius: 0, boxShadow: "none", background: open === i ? "var(--yolk)" : "var(--shell)" }}
                  onClick={() => {
                    play("select");
                    setOpen(open === i ? -1 : i);
                  }}
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
