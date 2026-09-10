import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ASSETS } from "../lib/assets";

/**
 * ⚠️ The countdown target — a plain hardcoded date, not read from any
 * database. This used to fetch its target from Supabase's app_config
 * table; that table no longer exists (the whole schema was intentionally
 * dropped moving to an on-chain-only setup), which is exactly why the
 * button was stuck on "Locked" with no visible timer at all — the fetch
 * returned nothing, so the countdown never had a value to count down from.
 *
 * Set to roughly 72 hours from when this was written. Adjust this one line
 * to the actual moment you want the site to unlock — nothing else needs to
 * change, this is the only place the target lives now.
 */
const UNLOCK_AT = new Date("2026-09-12T18:00:00Z");

/**
 * Landing is the countdown gate, not a sign-in screen — the timer IS the
 * lock. Connect Wallet only becomes clickable once UNLOCK_AT passes.
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

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const msLeft = Math.max(0, UNLOCK_AT.getTime() - now);
  const unlocked = msLeft === 0;
  const d = Math.floor(msLeft / 86400000);
  const h = Math.floor(msLeft / 3600000) % 24;
  const m = Math.floor(msLeft / 60000) % 60;
  const s = Math.floor(msLeft / 1000) % 60;

  return (
    <div className="page">
      <div
        className="flok-bg"
        style={{ backgroundImage: `url("${ASSETS.landingBackground}")` }}
        aria-hidden="true"
      />

      <div
        className="wrap center stack"
        style={{ minHeight: "100vh", justifyContent: "center", alignItems: "center", gap: 24 }}
      >
        <h1 className="h-xl center" style={{ color: "var(--cream)", textShadow: "5px 5px 0 var(--ink)" }}>
          Welcome to the <span className="word-yolk">Barn</span>
        </h1>

        {!unlocked && (
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
