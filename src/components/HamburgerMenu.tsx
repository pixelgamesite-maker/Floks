import { useState } from "react";

const CHAPTERS = [
  {
    title: "The problem with WL",
    body: "Whitelist is how you reach the mint, and right now it's the weakest link on Robinhood Chain. Forms are ineffective. Applications get botted. Allocations come out lopsided. Twenty thousand bots can drop a wallet and walk away with a spot.",
  },
  {
    title: "So the Barn asks for work",
    body: "A contribution routine instead of a form. Sign in with X, and you're handed your own egg. Your job is to hatch it — which means collecting everything a hatch needs first.",
  },
  {
    title: "Points, then items",
    body: "Barn Points come from tasks, the Global Farmers Chat, referrals, and community activity — every source is capped at 2,500 BP total. Spend them at the Farmers' Market on the five items. Every item you buy levels up your egg.",
  },
  {
    title: "Hatch, then claim WL",
    body: "Collect all five items and you can claim your WL spot directly from the Barn. That's the whole deal — no lottery, no clout check, no screenshot of a form submission.",
  },
];

const FAQ = [
  { q: "What is Floks?", a: "A 4,900 supply collection on Robinhood Chain, with a Barn Points economy deciding whitelist access." },
  { q: "How many communities get spots?", a: "Ten partner communities, claiming 1,000+ spots between them." },
  { q: "What's the BP cap?", a: "2,500 BP per resident. Once you hit it, tasks and referrals stop adding until you spend some at the market." },
  { q: "Can I gamble more than once?", a: "No — Double or Nothing in the Gambling Arena is a one-time shot per resident." },
  { q: "Is this financial advice?", a: "No. Floks is a digital collectible. Do your own research." },
];

export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"how" | "faq">("how");

  return (
    <>
      <button className="hamburger-btn" onClick={() => setOpen(true)} aria-label="Open menu">
        <span />
        <span />
        <span />
      </button>

      {open && (
        <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="drawer panel">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="row" style={{ gap: 6 }}>
                <button className={`btn btn-sm ${tab === "how" ? "" : "btn-ghost"}`} onClick={() => setTab("how")}>
                  How it works
                </button>
                <button className={`btn btn-sm ${tab === "faq" ? "" : "btn-ghost"}`} onClick={() => setTab("faq")}>
                  FAQ
                </button>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            <div className="stack" style={{ gap: 10, marginTop: 14, maxHeight: "60vh", overflowY: "auto" }}>
              {tab === "how"
                ? CHAPTERS.map((c) => (
                    <div key={c.title} className="item" style={{ alignItems: "flex-start", flexDirection: "column", gap: 6 }}>
                      <b style={{ fontFamily: "var(--display)", fontSize: "1rem" }}>{c.title}</b>
                      <span style={{ fontSize: "0.88rem", lineHeight: 1.55 }}>{c.body}</span>
                    </div>
                  ))
                : FAQ.map((f) => (
                    <div key={f.q} className="item" style={{ alignItems: "flex-start", flexDirection: "column", gap: 4 }}>
                      <b style={{ fontFamily: "var(--display)", fontSize: "0.95rem" }}>{f.q}</b>
                      <span style={{ fontSize: "0.85rem", lineHeight: 1.5, opacity: 0.75 }}>{f.a}</span>
                    </div>
                  ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
