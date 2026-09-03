import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ASSETS } from "../lib/assets";
import { COMMUNITIES, type Community } from "../lib/communities";

const TOTAL_SPOTS = 1000;

/**
 * Public claim page — no X login at all. Eligibility (is this wallet on the
 * sheet for this community) is checked entirely inside the
 * claim-community-spot Edge Function now, not here — this component just
 * collects a wallet and shows the result. See that function's file for why:
 * a client-side check here could always be skipped by calling the database
 * directly, which is exactly what happened before this was moved.
 */
export default function Claim() {
  const [claimedCount, setClaimedCount] = useState<number | null>(null);
  const [byCommunity, setByCommunity] = useState<Record<string, number>>({});

  const [active, setActive] = useState<Community | null>(null);
  const [wallet, setWallet] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; spot?: number } | null>(null);

  // Live counts, kept current via Realtime. Keyed by lowercase community
  // name so a claim always shows up on its card regardless of exactly how
  // the string was cased when it was stored.
  useEffect(() => {
    supabase
      .from("community_claims")
      .select("community")
      .then(({ data }) => {
        const rows = data ?? [];
        setClaimedCount(rows.length);
        const counts: Record<string, number> = {};
        for (const r of rows) {
          const key = r.community.toLowerCase();
          counts[key] = (counts[key] ?? 0) + 1;
        }
        setByCommunity(counts);
      });

    const channel = supabase
      .channel("community-claims-tally")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_claims" }, (payload) => {
        setClaimedCount((c) => (c ?? 0) + 1);
        const key = (payload.new.community as string).toLowerCase();
        setByCommunity((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function openCommunity(c: Community) {
    setActive(c);
    setWallet("");
    setResult(null);
  }

  function close() {
    if (busy) return;
    setActive(null);
  }

  async function confirm() {
    if (!active) return;
    const trimmed = wallet.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      setResult({ ok: false, message: "That doesn't look like a valid EVM address." });
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.functions.invoke("claim-community-spot", {
      body: { wallet: trimmed, community: active.sheetName },
    });
    setBusy(false);

    // supabase-js surfaces a non-2xx Edge Function response as `error`, but
    // the actual message we want to show is in the response body — which
    // lands in `error.context` for a FunctionsHttpError. Fall back sensibly
    // either way rather than showing a raw/blank error.
    if (error || (data as { error?: string })?.error) {
      const message =
        (data as { error?: string })?.error ??
        (error as { context?: { error?: string } })?.context?.error ??
        error?.message ??
        "That didn't go through — try again.";
      setResult({ ok: false, message });
      return;
    }

    setResult({ ok: true, message: "Spot claimed!", spot: (data as { spot_number: number })?.spot_number });
  }

  return (
    <div className="page">
      <div className="flok-bg" style={{ backgroundImage: `url("${ASSETS.background}")` }} aria-hidden="true" />

      <header className="topbar">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            <img src={ASSETS.logo} alt="" />
          </span>
          Floks
        </span>
      </header>

      <div className="wrap stack">
        <div className="stack" style={{ gap: 10 }}>
          <span className="chip chip-live">● Claim open</span>
          <h1 className="h-lg" style={{ color: "var(--cream)", textShadow: "4px 4px 0 var(--ink)" }}>
            Claim your <span className="word-yolk">spot</span>
          </h1>
          <p className="lede" style={{ color: "var(--cream)" }}>
            1,000 spots shared across all 16 communities first come, first served, no login
            needed. Pick your community, paste your wallet, and if you're on the list, it's yours.
          </p>
          {claimedCount != null && <span className="chip">{claimedCount} / {TOTAL_SPOTS} claimed</span>}
        </div>

        <div className="community-grid">
          {COMMUNITIES.map((c) => (
            <button key={c.key} className="community-tile" onClick={() => openCommunity(c)}>
              <img src={c.image} alt={c.displayName} />
              <span>{c.displayName}</span>
              <span className="community-count">{byCommunity[c.sheetName.toLowerCase()] ?? 0} claimed</span>
            </button>
          ))}
        </div>
      </div>

      {active && (
        <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="modal-card panel stack center">
            {result?.ok ? (
              <>
                <span className="eyebrow">Claimed</span>
                <h2 className="h-md">Spot #{result.spot} is yours 🎉</h2>
                <p className="muted" style={{ maxWidth: "34ch", margin: 0 }}>
                  {active.displayName} — {wallet.trim()}
                </p>
                <button className="btn" onClick={close}>
                  Done
                </button>
              </>
            ) : (
              <>
                <img
                  src={active.image}
                  alt={active.displayName}
                  style={{ width: 96, height: 96, borderRadius: 16, border: "3px solid var(--ink)", objectFit: "cover" }}
                />
                <span className="eyebrow">{active.displayName}</span>
                <h2 className="h-md">Submit your wallet</h2>
                <p className="muted" style={{ maxWidth: "34ch", margin: 0 }}>
                  We'll check it against the eligibility list for this community before claiming.
                </p>
                <input
                  className="ref-input"
                  style={{ width: "min(380px, 100%)", textAlign: "center" }}
                  placeholder="0x..."
                  value={wallet}
                  onChange={(e) => {
                    setWallet(e.target.value);
                    setResult(null);
                  }}
                  disabled={busy}
                />
                <button className="btn" onClick={confirm} disabled={busy}>
                  {busy ? "Checking…" : "Confirm"}
                </button>
                {result && !result.ok && <p className="notice">{result.message}</p>}
              </>
            )}
          </div>
        </div>
      )}

      <div className="spacer-lg" />
    </div>
  );
}
