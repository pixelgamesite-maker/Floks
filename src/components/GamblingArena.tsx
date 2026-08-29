import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useSound } from "../hooks/useSound";

type Result = { outcome: "win" | "lose"; delta: number; new_balance: number };

/**
 * One-time double-or-nothing on the resident's whole current balance.
 * play_double_or_nothing() in schema.sql does the coin flip and the
 * bookkeeping — this component only calls it and shows what came back.
 * Each resident can only ever play once, enforced server-side.
 */
export function GamblingArena({ balance, onResolved }: { balance: number; onResolved?: () => void }) {
  const { resident } = useAuth();
  const { play } = useSound();
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!resident) return;
    supabase
      .from("gamble_results")
      .select("outcome, delta")
      .eq("resident_id", resident.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAlreadyPlayed(true);
          setResult({ outcome: data.outcome as "win" | "lose", delta: data.delta, new_balance: balance });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resident]);

  async function gamble() {
    setPlaying(true);
    setError("");
    const { data, error: err } = await supabase.rpc("play_double_or_nothing");
    setPlaying(false);

    if (err) {
      setError(err.message.includes("already used") ? "You already took your shot." : err.message.includes("positive") ? "You need BP to gamble with." : "That didn't go through — try again.");
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      setResult(row as Result);
      setAlreadyPlayed(true);
      play(row.outcome === "win" ? "levelup" : "select");
      onResolved?.();
    }
  }

  return (
    <div className="gamble-card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="eyebrow">Farmers Gambling Arena</span>
        <span className="chip">One shot only</span>
      </div>
      <p style={{ margin: "8px 0", fontSize: "0.9rem", lineHeight: 1.55 }}>
        Double or nothing on your whole balance. Win, and it's doubled — up to the cap. Lose, and
        it's gone. You only get to do this once, ever.
      </p>

      {result ? (
        <div className={`gamble-result ${result.outcome}`}>
          <b>{result.outcome === "win" ? "You doubled it 🎉" : "You lost it all 💀"}</b>
          <span>{result.outcome === "win" ? `+${result.delta}` : result.delta} BP</span>
        </div>
      ) : (
        <button className="btn" onClick={gamble} disabled={playing || alreadyPlayed || balance <= 0}>
          {playing ? "Flipping…" : balance <= 0 ? "Need BP to play" : `Wager ${balance} BP`}
        </button>
      )}
      {error && <p className="notice" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
