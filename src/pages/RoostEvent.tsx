import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { ITEMS, HATCH_TOTAL, eggLevel, useHatchProgress } from "../hooks/useHatchProgress";
import { useSound } from "../hooks/useSound";
import { Backdrop, TopBar, EggArt, XGlyph } from "../components/Shell";
import { Market } from "../components/Market";
import { GamblingArena } from "../components/GamblingArena";
import { VoteCard } from "../components/VoteCard";
import { ASSETS } from "../lib/assets";

const FLOKS_X = "https://x.com/FloksRH";
const SHARE_TEXT = "I just secured my spot on the @FloksRH Barn 🐔\n\nJoin here → https://floks.fun";

/** One-time entry task, called out on its own above the day-gated set. */
const FOLLOW_TASK = { key: "follow", label: "Follow @FloksRH on X", hint: "One-time · unlocks the rest", points: 100, href: FLOKS_X };

const ALL_STATIC_TASKS = [FOLLOW_TASK];

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
  const { earned, spent, balance, owned, hatchReady, cap, eggClaimed, wlClaimed, walletAddress, nftNumber, loading, refresh, claimEgg, claimWl, buy } =
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
  const [walletInput, setWalletInput] = useState("");
  const [showWalletModal, setShowWalletModal] = useState(false);
  const now = useNow();

  useEffect(() => {
    if (!loading && !eggClaimed) setShowClaim(true);
  }, [loading, eggClaimed]);

  // Auto-prompt the wallet/WL claim the moment hatchReady is true and it
  // isn't fully done yet (covers a fresh claim and every backfill state —
  // WL claimed but no wallet, or wallet set but no NFT number somehow).
  // Only ever flips this true, never false — closing happens by the user.
  useEffect(() => {
    if (!loading && hatchReady && !(wlClaimed && walletAddress && nftNumber)) setShowWalletModal(true);
  }, [loading, hatchReady, wlClaimed, walletAddress, nftNumber]);

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
  // outside any opens_at/closes_at window even if this list is stale for a
  // moment. No key-naming convention required — any active row here except
  // follow/vote_reveal (each shown elsewhere) just shows up.
  useEffect(() => {
    supabase
      .from("task_catalog")
      .select("key, label, points, href, opens_at, closes_at, active")
      .not("key", "in", "(follow,vote_reveal)")
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
    const res = await claimWl(walletInput || walletAddress || "");
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

      {showWalletModal && (
        <div
          className="modal-scrim"
          onClick={(e) => e.target === e.currentTarget && !wlClaiming && setShowWalletModal(false)}
        >
          <div className="modal-card panel stack center">
            {wlClaimed && walletAddress && nftNumber ? (
              <>
                <span className="eyebrow">Congratulations</span>
                <h2 className="h-md">Floks #{nftNumber} is yours 🎉</h2>
                <img
                  src={ASSETS.nft(nftNumber)}
                  alt={`Floks #${nftNumber}`}
                  style={{ width: "min(240px, 60vw)", borderRadius: 16, border: "3px solid var(--ink)", boxShadow: "var(--pop)" }}
                />
                <p className="muted" style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", margin: 0 }}>
                  {walletAddress}
                </p>
                <button className="btn" onClick={() => setShowWalletModal(false)}>
                  OK
                </button>
              </>
            ) : wlClaimed && walletAddress && !nftNumber ? (
              <>
                <span className="eyebrow">Almost there</span>
                <h2 className="h-md">Claim your Floks NFT number</h2>
                <p style={{ margin: 0, lineHeight: 1.6, fontSize: "0.95rem", maxWidth: "34ch" }}>
                  Your WL spot and wallet are already locked in — this just assigns your numbered
                  piece, if one's still available.
                </p>
                <button className="btn" onClick={onClaimWl} disabled={wlClaiming}>
                  {wlClaiming ? "Claiming…" : "Claim your Floks NFT"}
                </button>
                {wlError && <p className="notice">{wlError}</p>}
              </>
            ) : (
              <>
                <span className="eyebrow">{wlClaimed ? "One more thing" : "Final step"}</span>
                <h2 className="h-md">{wlClaimed ? "Submit your wallet" : "🎉 Your egg has hatched!"}</h2>
                <p className="muted" style={{ maxWidth: "40ch", margin: 0 }}>
                  {wlClaimed
                    ? "We just need the wallet to tie your spot to. It locks in immediately."
                    : "Submit the EVM wallet you want your spot tied to — first 4,000 residents to do this get one of the numbered Floks. Once claimed, it's locked in and can't be changed."}
                </p>
                <input
                  className="ref-input"
                  style={{ width: "min(380px, 100%)", textAlign: "center" }}
                  placeholder="0x..."
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  disabled={wlClaiming}
                />
                <button
                  className="btn"
                  onClick={onClaimWl}
                  disabled={wlClaiming || !/^0x[0-9a-fA-F]{40}$/.test(walletInput.trim())}
                >
                  {wlClaiming ? "Submitting…" : wlClaimed ? "Submit wallet" : "Claim WL spot"}
                </button>
                {wlError && <p className="notice">{wlError}</p>}
              </>
            )}
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

        {/* ── Your egg, or — once fully hatched — congrats + WL claim ── */}
        <div className={`panel ${hatchReady ? "stack center" : "split"}`} style={hatchReady ? { alignItems: "center" } : undefined}>
          {hatchReady ? (
            nftNumber ? (
              <>
                <img
                  src={ASSETS.nft(nftNumber)}
                  alt={`Floks #${nftNumber}`}
                  style={{ width: "min(260px, 60vw)", borderRadius: 16, border: "3px solid var(--ink)", boxShadow: "var(--pop)" }}
                />
                <p className="eyebrow" style={{ marginTop: 4 }}>Floks #{nftNumber}</p>

                <a
                  className="btn btn-ink"
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <XGlyph /> Share on X
                </a>

                <button className="btn" onClick={() => setShowWalletModal(true)}>
                  {wlClaimed && walletAddress ? "WL Claimed ✓" : wlClaimed ? "Submit Wallet" : "Claim WL"}
                </button>
              </>
            ) : (
              <>
                <span className="eyebrow">Final step</span>
                <h2 className="h-md">🎉 Your egg has hatched!</h2>
                <button className="btn" onClick={() => setShowWalletModal(true)}>
                  Claim your WL spot
                </button>
              </>
            )
          ) : (
            <>
              <div className={justLeveled ? "egg-levelup" : ""}>
                {eggClaimed ? (
                  <EggArt level={level} label={`Level ${eggLevel(level)} · ${level}/5 items`} />
                ) : (
                  <EggArt level={0} label="Unclaimed" />
                )}
              </div>
              <div className="stack" style={{ gap: 10 }}>
                <span className="eyebrow">Your egg</span>
                <h2 className="h-md">{!eggClaimed ? "Waiting to be claimed" : `Level ${eggLevel(level)} and growing`}</h2>
                <p style={{ margin: 0, lineHeight: 1.6, fontSize: "0.95rem" }}>
                  {!eggClaimed ? "Claim it above to open the Farmers' Market." : "Each item you buy levels the egg up."}
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
            </>
          )}
        </div>

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

          {!followDone && (
            <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
              Follow first — today's tasks unlock right after.
            </p>
          )}

          {openDayTasks.length > 0 && (
            <>
              <span className="eyebrow" style={{ marginTop: 8 }}>More tasks</span>
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
    </div>
  );
}
