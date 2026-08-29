import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { ITEMS, HATCH_TOTAL, eggLevel, useHatchProgress } from "../hooks/useHatchProgress";
import { useSound } from "../hooks/useSound";
import { Backdrop, TopBar, EggArt, Ticker } from "../components/Shell";
import { Market } from "../components/Market";
import { GamblingArena } from "../components/GamblingArena";
import { VoteCard } from "../components/VoteCard";

const FLOKS_X = "https://x.com/FloksRH";
const FLOKS_POST = "https://x.com/FloksRH/status/2090831543329517768";

/** One-time entry task, called out on its own above the repeatable social set. */
const FOLLOW_TASK = { key: "follow", label: "Follow @FloksRH on X", hint: "One-time · unlocks the rest", points: 100, href: FLOKS_X };

const SOCIAL_TASKS = [
  { key: "like", label: "Like the Floks post", points: 25, href: FLOKS_POST },
  { key: "comment", label: "Comment on the Floks post", points: 50, href: FLOKS_POST },
  { key: "retweet", label: "Retweet the Floks post", points: 25, href: FLOKS_POST },
];

const ALL_STATIC_TASKS = [FOLLOW_TASK, ...SOCIAL_TASKS];

type DayTask = {
  key: string;
  label: string;
  points: number;
  href: string | null;
  opens_at: string | null;
  closes_at: string | null;
};

/** Just a ticking clock — day-task windows are checked against this, but
 * there's no fixed "everything closes at X" date anymore. That's a manual
 * call (flip each task's `active` to false in task_catalog when you're
 * ready), not a timer. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function RoostEvent() {
  const { resident } = useAuth();
  const { earned, spent, balance, owned, hatchReady, cap, eggClaimed, wlClaimed, loading, refresh, claimEgg, claimWl, buy } =
    useHatchProgress();
  const { play } = useSound();

  const [taskDone, setTaskDone] = useState<Record<string, boolean>>({});
  const [claiming, setClaiming] = useState(false);
  const [claimErr, setClaimErr] = useState("");
  const [showClaim, setShowClaim] = useState(false);
  const [marketMsg, setMarketMsg] = useState("");
  const [justLeveled, setJustLeveled] = useState(false);
  const [dayTasks, setDayTasks] = useState<DayTask[]>([]);
  const [wlClaiming, setWlClaiming] = useState(false);
  const [wlError, setWlError] = useState("");
  const now = useNow();

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

  // Day-gated tasks: fetched once, filtered live against the ticking clock
  // below so a window opening/closing updates the list without a refresh.
  // The DB is still the real gate — resident_tasks_guard rejects a claim
  // outside the window even if this list is stale for a moment.
  useEffect(() => {
    supabase
      .from("task_catalog")
      .select("key, label, points, href, opens_at, closes_at, active")
      .like("key", "day%")
      .eq("active", true)
      .then(({ data }) => setDayTasks((data ?? []) as DayTask[]));
  }, []);

  const openDayTasks = useMemo(
    () =>
      dayTasks.filter((t) => {
        const opens = t.opens_at ? new Date(t.opens_at).getTime() : -Infinity;
        const closes = t.closes_at ? new Date(t.closes_at).getTime() : Infinity;
        return now >= opens && now <= closes;
      }),
    [dayTasks, now]
  );

  const tasksEarned = useMemo(
    () =>
      [...ALL_STATIC_TASKS, ...dayTasks]
        .filter((t) => taskDone[t.key])
        .reduce((sum, t) => sum + t.points, 0),
    [taskDone, dayTasks]
  );

  const followDone = !!taskDone[FOLLOW_TASK.key];
  const level = owned.size;

  // NOTE: marks the task optimistically once the DB confirms it — actual
  // point value and cap enforcement happen server-side in
  // resident_tasks_guard, not here. Before launch, the *completion* itself
  // (did they really follow/quote/etc) still needs a verifying edge
  // function — this can currently be claimed by clicking, honestly.
  async function claimTask(task: { key: string; label: string; points: number; href: string | null }) {
    if (taskDone[task.key] || !resident) return;
    play("select");
    if (task.href) window.open(task.href, "_blank", "noopener");

    const { error } = await supabase
      .from("resident_tasks")
      .upsert({ resident_id: resident.id, task_key: task.key, points: task.points }, { onConflict: "resident_id,task_key" });

    if (error) {
      setMarketMsg(error.message.includes("cap") ? `You're at the ${cap} BP cap — spend some at the market first.` : "That task didn't go through — try again.");
      return;
    }

    setTaskDone((d) => ({ ...d, [task.key]: true }));
    refresh();
  }

  async function onClaimEgg() {
    setClaiming(true);
    setClaimErr("");
    const res = await claimEgg();
    setClaiming(false);
    if (res.ok) {
      play("claim");
      setShowClaim(false);
    } else {
      setClaimErr(res.error ?? "That didn't go through — try again.");
    }
  }

  async function onClaimWl() {
    setWlClaiming(true);
    setWlError("");
    const res = await claimWl();
    setWlClaiming(false);
    if (res.ok) play("levelup");
    else setWlError(res.error ?? "That didn't go through — try again.");
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
      <TopBar />

      {showClaim && !eggClaimed && (
        <div className="modal-scrim">
          <div className="modal-card panel stack center">
            <span className="eyebrow">Your egg has arrived</span>
            <EggArt level={0} size={200} />
            <h2 className="h-md">A Level 1 Egg</h2>
            <p style={{ margin: 0, lineHeight: 1.6, fontSize: "0.95rem", maxWidth: "34ch" }}>
              One per resident, free. Claim it and it stays with you — every item you buy at the
              Farmers' Market levels it up.
            </p>
            <button className="btn" onClick={onClaimEgg} disabled={claiming}>
              {claiming ? "Claiming…" : "Claim your egg 🥚"}
            </button>
            {claimErr && <p className="notice">{claimErr}</p>}
          </div>
        </div>
      )}

      <div className="wrap stack">
        <div className="stack" style={{ gap: 12 }}>
          <span className="chip chip-live">● The Barn is live</span>
          <h1 className="h-lg" style={{ color: "var(--cream)", textShadow: "4px 4px 0 var(--ink)" }}>
            The <span className="word-yolk">Barn</span>
          </h1>
          <p className="lede" style={{ color: "var(--cream)" }}>
            Claim your egg, earn Barn Points, and spend them at the Farmers' Market. Collect all
            five items and claim your WL spot.
          </p>
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
              {!eggClaimed ? "Waiting to be claimed" : hatchReady ? "Ready to hatch" : `Level ${eggLevel(level)} and growing`}
            </h2>
            <p style={{ margin: 0, lineHeight: 1.6, fontSize: "0.95rem" }}>
              {!eggClaimed
                ? "Claim it above to open the Farmers' Market."
                : hatchReady
                ? "All five items collected — claim your WL spot below."
                : "Each item you buy levels the egg up."}
            </p>
            <div className="row">
              <span className="chip">{spent}/{HATCH_TOTAL} BP toward hatch</span>
              <span className="chip">{balance}/{cap} BP</span>
            </div>
            {!eggClaimed && (
              <button className="btn" onClick={() => setShowClaim(true)}>
                Claim your egg 🥚
              </button>
            )}
          </div>
        </div>

        {/* ── WL claim ── */}
        {hatchReady && (
          <div className="panel stack center" style={{ alignItems: "center" }}>
            <span className="eyebrow">Final step</span>
            <h2 className="h-md">{wlClaimed ? "Your WL spot is claimed 🎉" : "Claim your WL spot"}</h2>
            {!wlClaimed && (
              <>
                <p className="muted" style={{ maxWidth: "44ch", margin: 0 }}>
                  All five items collected. This is the last step — once claimed, it can't be undone.
                </p>
                <button className="btn" onClick={onClaimWl} disabled={wlClaiming}>
                  {wlClaiming ? "Claiming…" : "Claim WL spot"}
                </button>
                {wlError && <p className="notice">{wlError}</p>}
              </>
            )}
          </div>
        )}

        {/* ── Tasks ── */}
        <div className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="eyebrow">Tasks</span>
            <span className="chip">{tasksEarned} BP banked</span>
          </div>

          <button className={`task task-hero ${followDone ? "task-done" : ""}`} onClick={() => claimTask(FOLLOW_TASK)} disabled={followDone}>
            <span className="task-box">{followDone ? "✓" : "𝕏"}</span>
            <span>
              <b style={{ fontFamily: "var(--display)", fontSize: "1.05rem", display: "block" }}>{FOLLOW_TASK.label}</b>
              <small className="muted" style={{ fontSize: "0.72rem" }}>{FOLLOW_TASK.hint}</small>
            </span>
            <span className="task-points">+{FOLLOW_TASK.points} BP</span>
          </button>

          <span className="eyebrow" style={{ marginTop: 4 }}>Social tasks</span>
          <div className="stack" style={{ gap: 10 }}>
            {SOCIAL_TASKS.map((t) => (
              <button key={t.key} className={`task ${taskDone[t.key] ? "task-done" : ""}`} onClick={() => claimTask(t)} disabled={taskDone[t.key] || !followDone}>
                <span className="task-box">{taskDone[t.key] ? "✓" : ""}</span>
                <span>{t.label}</span>
                <span className="task-points">+{t.points} BP</span>
              </button>
            ))}
          </div>
          {!followDone && <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>Follow first — the social tasks unlock right after.</p>}

          {openDayTasks.length > 0 && (
            <>
              <span className="eyebrow" style={{ marginTop: 8 }}>Today's tasks</span>
              <div className="stack" style={{ gap: 10 }}>
                {openDayTasks.map((t) => (
                  <button key={t.key} className={`task ${taskDone[t.key] ? "task-done" : ""}`} onClick={() => claimTask(t)} disabled={taskDone[t.key]}>
                    <span className="task-box">{taskDone[t.key] ? "✓" : ""}</span>
                    <span>{t.label}</span>
                    <span className="task-points">+{t.points} BP</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {marketMsg && <p className="notice">{marketMsg}</p>}
        </div>

        {/* ── Farmers' Market ── */}
        <div className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="eyebrow">Farmers' Market</span>
            <span className="chip">{balance} BP to spend</span>
          </div>
          <Market eggClaimed={eggClaimed} owned={owned} balance={balance} earned={earned} spent={spent} message={marketMsg} onBuy={onBuy} />
        </div>

        {/* ── Special task: vote ── */}
        {eggClaimed && <VoteCard onVoted={refresh} />}

        {/* ── Gambling Arena ── */}
        {eggClaimed && <GamblingArena balance={balance} onResolved={refresh} />}
      </div>

      <div className="spacer-lg" />
      <Ticker />
      <div className="spacer-lg" />
    </div>
  );
}
