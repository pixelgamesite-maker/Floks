// supabase/functions/claim-community-spot/index.ts
//
// This is what closes the gap that let something claim 601 spots directly
// against the database. The eligibility check against the Google Sheet used
// to live in the browser (src/pages/Claim.tsx) — meaning anything that
// skipped the actual page and called the database function directly also
// skipped the eligibility check. That's exactly what happened twice.
//
// Now: this function runs on Supabase's servers, not in anyone's browser.
// It fetches and checks the sheet itself, then — only if eligible — calls
// the database using the SERVICE ROLE key, which is never sent to any
// client and isn't in the JS bundle. Combined with revoking direct
// anon/authenticated execute on claim_community_spot() in schema.sql, this
// is now the only path that can ever create a row in community_claims.
//
// Deploy with (note the --no-verify-jwt — this page has no login, so there
// is no JWT to verify):
//   supabase functions deploy claim-community-spot --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ELIGIBILITY_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTeEe2jePaZ_c9YJyfL7cc4hWiVCsOp9rXZq_MlOnUKN89cBHB7MSmvdVgRYpnCaa7yB-eaoXTHmLPk/pub?output=csv";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Same parser as the frontend used to have — handles quoted fields and both line-ending styles. */
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

function findColumn(header: string[], candidates: string[]): number {
  const lower = header.map((h) => h.trim().toLowerCase());
  for (const cand of candidates) {
    const idx = lower.indexOf(cand.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { wallet?: string; community?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const wallet = String(body.wallet ?? "").trim().toLowerCase();
  const community = String(body.community ?? "").trim();

  if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
    return json({ error: "Enter a valid EVM wallet address (0x followed by 40 hex characters)." }, 400);
  }
  if (!community) {
    return json({ error: "Missing community." }, 400);
  }

  // The actual fix: fetch and check the sheet here, server-side, where it
  // can't be skipped by calling the database directly.
  let sheetText: string;
  try {
    const res = await fetch(ELIGIBILITY_SHEET_CSV_URL);
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
    sheetText = await res.text();
  } catch (err) {
    console.error("Eligibility sheet fetch failed:", err);
    return json({ error: "Could not load the eligibility list — try again shortly." }, 502);
  }

  const rows = parseCsv(sheetText);
  if (rows.length < 2) return json({ error: "Eligibility sheet looks empty." }, 500);

  const header = rows[0];
  const walletCol = findColumn(header, ["wallet", "wallet address", "evm wallet", "address"]);
  const communityCol = findColumn(header, ["community", "group", "team", "project"]);
  if (walletCol === -1 || communityCol === -1) {
    console.error("Sheet header not recognized:", header);
    return json({ error: "Eligibility sheet format not recognized." }, 500);
  }

  const eligible = rows.slice(1).some(
    (r) =>
      (r[walletCol] ?? "").trim().toLowerCase() === wallet &&
      (r[communityCol] ?? "").trim().toLowerCase() === community.toLowerCase()
  );

  if (!eligible) {
    return json({ error: `This wallet isn't on the list for ${community}.` }, 403);
  }

  // Only reachable after a real eligibility check passed. Uses the service
  // role key — set automatically by Supabase for every Edge Function, never
  // exposed to any client — which is what lets this call succeed even
  // though anon/authenticated no longer have direct execute on the
  // function (see schema.sql).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error } = await supabase.rpc("claim_community_spot", {
    wallet_in: wallet,
    community_in: community,
  });

  if (error) {
    console.error("claim_community_spot failed:", error);
    return json({ error: error.message }, 400);
  }

  return json({ spot_number: (data as { spot_number: number })?.spot_number });
});
