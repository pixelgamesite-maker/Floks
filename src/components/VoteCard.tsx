import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useSound } from "../hooks/useSound";

type Choice = "instant" | "24h";
type Tally = Record<Choice, number>;

/**
 * One-time vote on reveal style. Points come from task_catalog('vote_reveal')
 * via a DB trigger (schema.sql) — this component just casts the vote and
 * shows a live tally; it never decides or sends the point value itself.
 */
export function VoteCard({ onVoted }: { onVoted?: () => void }) {
  const { resident } = useAuth();
  const { play } = useSound();
  const [myChoice, setMyChoice] = useState<Choice | null>(null);
  const [tally, setTally] = useState<Tally>({ instant: 0, "24h": 0 });
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadTally() {
    const { data } = await supabase.from("votes").select("choice");
    const next: Tally = { instant: 0, "24h": 0 };
    (data ?? []).forEach((r) => { next[r.choice as Choice] += 1; });
    setTally(next);
  }

  useEffect(() => {
    if (!resident) return;
    Promise.all([
      supabase.from("votes").select("choice").eq("resident_id", resident.id).maybeSingle(),
      loadTally(),
    ]).then(([mine]) => {
      setMyChoice((mine.data?.choice as Choice) ?? null);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resident]);

  async function vote(choice: Choice) {
    if (!resident || myChoice || voting) return;
    setVoting(true);
    setError("");
    const { error: err } = await supabase.from("votes").insert({ resident_id: resident.id, choice });
    setVoting(false);

    if (err) {
      setError("That didn't go through, try again.");
      return;
    }
    setMyChoice(choice);
    play("levelup");
    loadTally();
    onVoted?.();
  }

  const total = tally.instant + tally["24h"] || 1;

  return (
    <div className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="eyebrow">Special task · your call on the art</span>
        <span className="chip">One vote, final</span>
      </div>
      <h2 className="h-md">Instant reveal, or wait 24 hours?</h2>
      <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.55 }}>
        {myChoice
          ? "Your vote is locked in, here's how the Flock is leaning so far."
          : "Pick one. Can't be changed once cast."}
      </p>

      <div className="grid-items">
        {(["instant", "24h"] as Choice[]).map((c) => {
          const pct = Math.round((tally[c] / total) * 100);
          const picked = myChoice === c;
          return (
            <button
              key={c}
              className={`task ${picked ? "task-done" : ""}`}
              onClick={() => vote(c)}
              disabled={!!myChoice || voting || loading}
              style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}
            >
              <b style={{ fontFamily: "var(--display)", fontSize: "1.05rem" }}>
                {c === "instant" ? "Instant reveal" : "Reveal after 24h"}
              </b>
              {myChoice && (
                <>
                  <div className="progress-track" style={{ width: "100%" }}>
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="muted" style={{ fontSize: "0.75rem" }}>{pct}% · {tally[c]} votes</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {error && <p className="notice">{error}</p>}
    </div>
  );
}
