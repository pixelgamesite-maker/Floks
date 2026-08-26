import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type ItemKey = "nest" | "water" | "thermometer" | "heat_bulb" | "incubator";

export type MarketItem = {
  key: ItemKey;
  name: string;
  price: number;
  icon: string;
  image: string;
};

/** Prices sum to exactly 1,000 BP — that total doubles as the hatch progress denominator. */
export const ITEMS: MarketItem[] = [
  { key: "nest", name: "Nest", price: 100, icon: "🪹", image: "/Nest.png" },
  { key: "water", name: "Water", price: 150, icon: "💧", image: "/Water-.png" },
  { key: "thermometer", name: "Thermometer", price: 175, icon: "🌡️", image: "/Thermometer.png" },
  { key: "heat_bulb", name: "Heat Bulb", price: 200, icon: "💡", image: "/Bulb.png" },
  { key: "incubator", name: "Incubator", price: 375, icon: "🧰", image: "/Incubator.png" },
];

export const HATCH_TOTAL = ITEMS.reduce((sum, i) => sum + i.price, 0); // 1,000

/**
 * Five items, now five pieces of egg art — one level per item owned.
 * Index = number of items owned (0–5).
 */
export const EGG_STAGES = [
  "/Level-1-egg.png", // 0 items — just claimed
  "/Level-1-egg.png", // 1
  "/Level-2-egg.png", // 2
  "/Level-3-egg.png", // 3
  "/Level-4-egg.png", // 4
  "/Level-5-egg.png", // 5 — ready to hatch
];

/** Which of the five art levels (1–5) an item count maps to. */
export function eggLevel(ownedCount: number) {
  return Math.max(1, Math.min(5, ownedCount === 0 ? 1 : ownedCount));
}

type PurchaseResult = { ok: true } | { ok: false; reason: "owned" | "short" | "error" };

export function useHatchProgress(residentId?: string) {
  const [earned, setEarned] = useState(0);
  const [owned, setOwned] = useState<Set<ItemKey>>(new Set());
  const [eggClaimedAt, setEggClaimedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!residentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: tasks }, { data: items }, { data: resident }] = await Promise.all([
      supabase.from("resident_tasks").select("points").eq("resident_id", residentId),
      supabase.from("resident_items").select("item_key").eq("resident_id", residentId),
      supabase.from("residents").select("egg_claimed_at").eq("id", residentId).maybeSingle(),
    ]);
    setEarned((tasks ?? []).reduce((sum, t) => sum + t.points, 0));
    setOwned(new Set((items ?? []).map((i) => i.item_key as ItemKey)));
    setEggClaimedAt(resident?.egg_claimed_at ?? null);
    setLoading(false);
  }, [residentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const spent = ITEMS.filter((i) => owned.has(i.key)).reduce((sum, i) => sum + i.price, 0);
  const balance = earned - spent;
  const progress = Math.min(1, spent / HATCH_TOTAL);
  const hatchReady = owned.size === ITEMS.length;

  async function claimEgg(): Promise<{ ok: boolean }> {
    if (!residentId) return { ok: false };
    if (eggClaimedAt) return { ok: true }; // already claimed — treat as success, not an error

    const now = new Date().toISOString();
    const { error } = await supabase.from("residents").update({ egg_claimed_at: now }).eq("id", residentId);
    if (error) return { ok: false };

    setEggClaimedAt(now);
    return { ok: true };
  }

  // Balance is only checked client-side here — see README "Before launch" note
  // on moving this into a Postgres function before real BP is on the line.
  async function buy(item: MarketItem): Promise<PurchaseResult> {
    if (!residentId) return { ok: false, reason: "error" };
    if (owned.has(item.key)) return { ok: false, reason: "owned" };
    if (balance < item.price) return { ok: false, reason: "short" };

    const { error } = await supabase
      .from("resident_items")
      .insert({ resident_id: residentId, item_key: item.key, price: item.price });

    if (error) return { ok: false, reason: "error" };
    setOwned((prev) => new Set(prev).add(item.key));
    return { ok: true };
  }

  return {
    earned,
    spent,
    balance,
    owned,
    progress,
    hatchReady,
    eggClaimed: !!eggClaimedAt,
    loading,
    refresh,
    claimEgg,
    buy,
  };
}
