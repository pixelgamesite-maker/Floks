import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { supabase } from "../lib/supabase";
import { ASSETS } from "../lib/assets";

/**
 * Landing is now the countdown gate, not the X sign-in screen — the timer
 * IS the lock. Everything past this page is meant to stay closed until
 * unlock_at_epoch (app_config, schema.sql) passes; Connect Wallet only
 * becomes clickable once it does.
 *
 * What happens after a successful connect is deliberately not built yet —
 * the holdings board depends on confirming whether the NFT contract
 * supports ERC721Enumerable (can't tell "which tokens does this wallet
 * hold" without it, or without a separate indexer). This page shows the
 * connected address as proof the wallet layer works, and stops there.
 */
export default function Landing() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const [unlockAt, setUnlockAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    supabase
      .from("app_config")
      .select("value")
      .eq("key", "unlock_at_epoch")
      .maybeSingle()
      .then(({ data }) => setUnlockAt(data ? data.value * 1000 : null));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const msLeft = unlockAt != null ? Math.max(0, unlockAt - now) : null;
  const unlocked = msLeft === 0;
  const d = msLeft != null ? Math.floor(msLeft / 86400000) : 0;
  const h = msLeft != null ? Math.floor(msLeft / 3600000) % 24 : 0;
  const m = msLeft != null ? Math.floor(msLeft / 60000) % 60 : 0;
  const s = msLeft != null ? Math.floor(msLeft / 1000) % 60 : 0;

  return (
    <div className="page">
      <div
        className="flok-bg"
        style={{ backgroundImage: `url("${ASSETS.chickenRush}")` }}
        aria-hidden="true"
      />

      <div
        className="wrap center stack"
        style={{ minHeight: "100vh", justifyContent: "center", alignItems: "center", gap: 24 }}
      >
        <h1 className="h-xl center" style={{ color: "var(--cream)", textShadow: "5px 5px 0 var(--ink)" }}>
          Welcome to the <span className="word-yolk">Barn</span>
        </h1>

        {msLeft !== null && !unlocked && (
          <div className="stack" style={{ gap: 10, alignItems: "center" }}>
            <span className="eyebrow" style={{ color: "var(--cream)" }}>Unlocking in</span>
            <div className="clock">
              {[[d, "Days"], [h, "Hours"], [m, "Mins"], [s, "Secs"]].map(([v, l]) => (
                <div className="clock-cell" key={l as string}>
                  <b>{String(v).padStart(2, "0")}</b>
                  <span>{l}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isConnected ? (
          <div className="panel center stack" style={{ alignItems: "center" }}>
            <span className="eyebrow">Connected</span>
            <p className="muted" style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", margin: 0 }}>
              {address}
            </p>
            <p className="muted" style={{ fontSize: "0.85rem", margin: 0, maxWidth: "34ch" }}>
              The Barn Yard dashboard is next — not built yet, pending confirmation on how your
              holdings actually get read from the contract.
            </p>
          </div>
        ) : (
          <button
            className="btn"
            disabled={!unlocked}
            onClick={openConnectModal}
          >
            {!unlocked ? "Locked" : "Connect Wallet"}
          </button>
        )}
      </div>
    </div>
  );
}
