import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ASSETS } from "../lib/assets";
import { COMMUNITIES, ELIGIBILITY_SHEET_CSV_URL, type Community } from "../lib/communities";

const TOTAL_SPOTS = 1000;

/**
 * Small hand-rolled CSV parser instead of a new npm dependency — handles
 * quoted fields (including embedded commas/quotes) and both \n and \r\n
 * line endings, which covers what a Google Sheets CSV export actually
 * produces. If your sheet does something more exotic, this is the one
 * place to fix.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

/** Finds a column by trying a few common header spellings, case-insensitively. */
function findColumn(header: string[], candidates: string[]): number {
  const lower = header.map((h) => h.trim().toLowerCase());
  for (const cand of candidates) {
    const idx = lower.indexOf(cand.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

type EligibilityRow = { wallet: string; community: string };

export default function Claim() {
  const [sheetRows, setSheetRows] = useState<EligibilityRow[] | null>(null);
  const [sheetError, setSheetError] = useState("");
  const [claimedCount, setClaimedCount] = useState<number | null>(null);
  const [byCommunity, setByCommunity] = useState<Record<string, number>>({});

  const [active, setActive] = useState<Community | null>(null);
  const [wallet, setWallet] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; spot?: number } | null>(null);

  // Fetch + parse the eligibility sheet once on load.
  useEffect(() => {
    fetch(ELIGIBILITY_SHEET_CSV_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Sheet fetch failed: ${r.status}`);
        return r.text();
      })
      .then((text) => {
        const rows = parseCsv(text);
        if (rows.length < 2) throw new Error("Sheet looks empty");
        const header = rows[0];
        const walletCol = findColumn(header, ["wallet", "wallet address", "evm wallet", "address"]);
        const communityCol = findColumn(header, ["community", "group", "team", "project"]);
        if (walletCol === -1 || communityCol === -1) {
          throw new Error(`Couldn't find wallet/community columns. Header was: ${header.join(", ")}`);
        }
        const parsed: EligibilityRow[] = rows.slice(1).map((r) => ({
          wallet: (r[walletCol] ?? "").trim().toLowerCase(),
          community: (r[communityCol] ?? "").trim().toLowerCase(),
        }));
        setSheetRows(parsed);
      })
      .catch((err) => {
        console.error("Eligibility sheet load failed:", err);
        setSheetError("Couldn't load the eligibility list. Try refreshing.");
      });
  }, []);

  // Live counts, kept current via Realtime. Fetches every row's community
  // column once (capped at 1,000 rows total, trivial to aggregate client-
  // side) rather than needing a separate SQL view just for group counts.
  useEffect(() => {
    supabase
      .from("community_claims")
      .select("community")
      .then(({ data }) => {
        const rows = data ?? [];
        setClaimedCount(rows.length);
        const counts: Record<string, number> = {};
        for (const r of rows) counts[r.community] = (counts[r.community] ?? 0) + 1;
        setByCommunity(counts);
      });

    const channel = supabase
      .channel("community-claims-tally")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_claims" }, (payload) => {
        setClaimedCount((c) => (c ?? 0) + 1);
        const community = payload.new.community as string;
        setByCommunity((prev) => ({ ...prev, [community]: (prev[community] ?? 0) + 1 }));
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

  const eligible = useMemo(() => {
    if (!active || !sheetRows) return null;
    const w = wallet.trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(w)) return null;
    return sheetRows.some((r) => r.wallet === w && r.community === active.sheetName.toLowerCase());
  }, [active, sheetRows, wallet]);

  async function confirm() {
    if (!active) return;
    const trimmed = wallet.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      setResult({ ok: false, message: "That doesn't look like a valid EVM address." });
      return;
    }
    if (!sheetRows) {
      setResult({ ok: false, message: "Still loading the eligibility list — try again in a moment." });
      return;
    }
    if (!eligible) {
      setResult({ ok: false, message: `This wallet isn't on the list for ${active.displayName}.` });
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.rpc("claim_community_spot", {
      wallet_in: trimmed,
      community_in: active.sheetName,
    });
    setBusy(false);

    if (error) {
      console.error("claim_community_spot failed:", error);
      setResult({ ok: false, message: error.message });
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
            1,000 spots shared across all 16 communities, first come, first served, no login
            needed. Pick your community, paste your wallet, and if you're on the list, it's yours.
          </p>
          {claimedCount != null && <span className="chip">{claimedCount} / {TOTAL_SPOTS} claimed</span>}
          {sheetError && <p className="notice">{sheetError}</p>}
        </div>

        <div className="community-grid">
          {COMMUNITIES.map((c) => (
            <button key={c.key} className="community-tile" onClick={() => openCommunity(c)}>
              <img src={c.image} alt={c.displayName} />
              <span>{c.displayName}</span>
              <span className="community-count">{byCommunity[c.sheetName] ?? 0} claimed</span>
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
                <button className="btn" onClick={confirm} disabled={busy || !sheetRows}>
                  {busy ? "Checking…" : !sheetRows ? "Loading list…" : "Confirm"}
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
