import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { ASSETS } from "../lib/assets";

export type ItemKey = "nest" | "water" | "thermometer" | "heat_bulb" | "incubator";

export type MarketItem = {
  key: ItemKey;
  name: string;
  price: number;
  icon: string;
  image: string;
};

/** Prices match the current spec. Total is 1,500 — below the 2,500 BP cap on
 * purpose, leaving room to gamble or keep earning after a full hatch. */
export const ITEMS: MarketItem[] = [
  { key: "nest", name: "Nest", price: 100, icon: "🪹", image: ASSETS.items.nest },
  { key: "water", name: "Water", price: 150, icon: "💧", image: ASSETS.items.water },
  { key: "thermometer", name: "Thermometer", price: 350, icon: "🌡️", image: ASSETS.items.thermometer },
  { key: "heat_bulb", name: "Bulb", price: 300, icon: "💡", image: ASSETS.items.heat_bulb },
  { key: "incubator", name: "Incubator", price: 600, icon: "🧰", image: ASSETS.items.incubator },
];

export const HATCH_TOTAL = ITEMS.reduce((sum, i) => sum + i.price, 0); // 1,500

/** Five items, five pieces of egg art — one level per item owned. */
export const EGG_STAGES = ASSETS.eggStages;

export function eggLevel(ownedCount: number) {
  return Math.max(1, Math.min(5, ownedCount === 0 ? 1 : ownedCount));
}

type PurchaseResult = { ok: true } | { ok: false; reason: "owned" | "short" | "error" };

type HatchValue = {
  earned: number;
  spent: number;
  balance: number;
  owned: Set<ItemKey>;
  progress: number;
  hatchReady: boolean;
  cap: number;
  eggClaimed: boolean;
  wlClaimed: boolean;
  walletAddress: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  claimEgg: () => Promise<{ ok: boolean; error?: string }>;
  claimWl: (wallet: string) => Promise<{ ok: boolean; error?: string }>;
  buy: (item: MarketItem) => Promise<PurchaseResult>;
};

const HatchContext = createContext<HatchValue | null>(null);

/**
 * Wrap the authenticated part of the app once (App.tsx). Every consumer —
 * the profile menu, the market, the floating chat widget, the gambling
 * arena — reads and mutates the same state, so a chat message sent from
 * one page updates the BP chip shown on a completely different one.
 */
export function HatchProvider({ children }: { children: ReactNode }) {
  const { resident } = useAuth();
  const residentId = resident?.id;

  const [balance, setBalance] = useState(0);
  const [owned, setOwned] = useState<Set<ItemKey>>(new Set());
  const [eggClaimedAt, setEggClaimedAt] = useState<string | null>(null);
  const [wlClaimedAt, setWlClaimedAt] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [cap, setCap] = useState(2500);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!residentId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // Balance comes from the authoritative barn_balance() RPC — the one
    // place tasks, referrals, chat, gambling, and spending are all summed,
    // so this always matches what the cap/purchase guards see server-side.
    const [{ data: bal }, { data: items }, { data: res }, { data: config }] = await Promise.all([
      supabase.rpc("barn_balance", { target: residentId }),
      supabase.from("resident_items").select("item_key").eq("resident_id", residentId),
      supabase.from("residents").select("egg_claimed_at, wl_claimed_at, wallet_address").eq("id", residentId).maybeSingle(),
      supabase.from("app_config").select("value").eq("key", "bp_cap").maybeSingle(),
    ]);

    setBalance(typeof bal === "number" ? bal : 0);
    setOwned(new Set((items ?? []).map((i) => i.item_key as ItemKey)));
    setEggClaimedAt(res?.egg_claimed_at ?? null);
    setWlClaimedAt(res?.wl_claimed_at ?? null);
    setWalletAddress(res?.wallet_address ?? null);
    if (config?.value) setCap(config.value);
    setLoading(false);
  }, [residentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const spent = ITEMS.filter((i) => owned.has(i.key)).reduce((sum, i) => sum + i.price, 0);
  const earned = balance + spent;
  const progress = Math.min(1, spent / HATCH_TOTAL);
  const hatchReady = owned.size === ITEMS.length;

  async function claimEgg(): Promise<{ ok: boolean; error?: string }> {
    if (!residentId) return { ok: false, error: "Still loading your profile — wait a moment and try again." };
    if (eggClaimedAt) return { ok: true };

    const now = new Date().toISOString();
    const { error } = await supabase.from("residents").update({ egg_claimed_at: now }).eq("id", residentId);
    if (error) {
      // Logged so the real Postgres error is visible in devtools even though
      // the UI only shows a friendly version of it.
      console.error("claimEgg failed:", error);
      return { ok: false, error: error.message };
    }

    setEggClaimedAt(now);
    return { ok: true };
  }

  async function claimWl(wallet: string): Promise<{ ok: boolean; error?: string }> {
    if (!residentId) return { ok: false, error: "Still loading your profile — wait a moment and try again." };

    const trimmed = wallet.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      return { ok: false, error: "That doesn't look like a valid EVM address (0x + 40 hex characters)." };
    }

    // Backfill path: this resident already claimed WL before wallet
    // collection existed, so wl_claimed_at is set but wallet_address isn't.
    // Submit just the wallet, don't touch wl_claimed_at at all.
    if (wlClaimedAt) {
      if (walletAddress) return { ok: true };
      const { error } = await supabase.from("residents").update({ wallet_address: trimmed }).eq("id", residentId);
      if (error) {
        console.error("claimWl (wallet-only backfill) failed:", error);
        return { ok: false, error: error.message };
      }
      setWalletAddress(trimmed);
      return { ok: true };
    }

    if (!hatchReady) return { ok: false, error: "Collect all five items first." };

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("residents")
      .update({ wl_claimed_at: now, wallet_address: trimmed })
      .eq("id", residentId);
    if (error) {
      console.error("claimWl failed:", error);
      return { ok: false, error: error.message };
    }

    setWlClaimedAt(now);
    setWalletAddress(trimmed);
    return { ok: true };
  }

  async function buy(item: MarketItem): Promise<PurchaseResult> {
    if (!residentId) return { ok: false, reason: "error" };
    if (owned.has(item.key)) return { ok: false, reason: "owned" };
    if (balance < item.price) return { ok: false, reason: "short" };

    const { error } = await supabase
      .from("resident_items")
      .insert({ resident_id: residentId, item_key: item.key, price: item.price });

    if (error) return { ok: false, reason: "error" };
    setOwned((prev) => new Set(prev).add(item.key));
    setBalance((b) => b - item.price);
    return { ok: true };
  }

  const value: HatchValue = {
    earned,
    spent,
    balance,
    owned,
    progress,
    hatchReady,
    cap,
    eggClaimed: !!eggClaimedAt,
    wlClaimed: !!wlClaimedAt,
    walletAddress,
    loading,
    refresh,
    claimEgg,
    claimWl,
    buy,
  };

  return <HatchContext.Provider value={value}>{children}</HatchContext.Provider>;
}

export function useHatchProgress() {
  const ctx = useContext(HatchContext);
  if (!ctx) throw new Error("useHatchProgress must be used inside <HatchProvider>");
  return ctx;
}
