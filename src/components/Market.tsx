import { ITEMS, HATCH_TOTAL, type ItemKey, type MarketItem } from "../hooks/useHatchProgress";

type MarketProps = {
  eggClaimed: boolean;
  owned: Set<ItemKey>;
  balance: number;
  earned: number;
  spent: number;
  message: string;
  onBuy: (item: MarketItem) => void;
};

/**
 * The Farmers' Market grid. Purely presentational — balance math, purchase
 * logic, and sound orchestration all live in the caller (currently
 * RoostEvent.tsx) via useHatchProgress. This just renders what it's handed.
 */
export function Market({ eggClaimed, owned, balance, earned, spent, message, onBuy }: MarketProps) {
  if (!eggClaimed) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Claim your egg to open the market. Stock is unlimited — the only thing that gates a
        purchase is your BP balance.
      </p>
    );
  }

  return (
    <>
      <div className="market-grid">
        {ITEMS.map((item) => {
          const isOwned = owned.has(item.key);
          const canAfford = balance >= item.price;
          return (
            <div className={`market-item ${isOwned ? "market-owned" : ""}`} key={item.key}>
              <img className={`market-art ${isOwned ? "" : "art-locked"}`} src={item.image} alt="" />
              <div className="market-body">
                <b style={{ fontFamily: "var(--display)", fontSize: "1rem" }}>
                  {item.icon} {item.name}
                </b>
                <span className="market-price">{item.price} BP</span>
                <button
                  className="btn btn-sm"
                  style={{ marginTop: "auto" }}
                  onClick={() => onBuy(item)}
                  disabled={isOwned || !canAfford}
                >
                  {isOwned ? "Collected ✓" : canAfford ? "Buy" : "Need more BP"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {message && <p className="notice">{message}</p>}

      <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
        Earned {earned} BP · Spent {spent} BP · {Math.max(0, HATCH_TOTAL - spent)} BP left to a
        full hatch.
      </p>
    </>
  );
}
