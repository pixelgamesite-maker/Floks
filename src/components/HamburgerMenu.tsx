import { useState } from "react";
import { createPortal } from "react-dom";

const FAQ = [
  { q: "What is Floks?", a: "A 4,900 supply collection on Robinhood Chain, with a Barn Points economy deciding whitelist access." },
  { q: "How many communities get spots?", a: "Ten partner communities, claiming 1,000+ spots between them." },
  { q: "What's the BP cap?", a: "2,500 BP per resident. Once you hit it, tasks and referrals stop adding until you spend some at the market." },
  { q: "Can I gamble more than once?", a: "No — Double or Nothing in the Gambling Arena is a one-time shot per resident." },
  { q: "Is this financial advice?", a: "No. Floks is a digital collectible. Do your own research." },
];

export function HamburgerMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="hamburger-btn" onClick={() => setOpen(true)} aria-label="Open menu">
        <span />
        <span />
        <span />
      </button>

      {open &&
        createPortal(
          // Rendered straight into <body> — TopBar has backdrop-filter, which
          // creates a new containing block for any `position: fixed`
          // descendant. Without the portal, this "full-screen" overlay would
          // actually be fixed relative to the topbar strip instead of the
          // viewport, squishing it into a thin sliver at the top.
          <div className="nav-scrim" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
            <nav className="nav-drawer">
              <div className="row" style={{ justifyContent: "space-between", padding: "18px 20px" }}>
                <span className="brand" style={{ fontSize: "1.2rem" }}>FAQ</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close menu">
                  ✕
                </button>
              </div>

              <div className="nav-drawer-body stack" style={{ gap: 10 }}>
                {FAQ.map((f) => (
                  <div key={f.q} className="item" style={{ alignItems: "flex-start", flexDirection: "column", gap: 4 }}>
                    <b style={{ fontFamily: "var(--display)", fontSize: "0.95rem" }}>{f.q}</b>
                    <span style={{ fontSize: "0.85rem", lineHeight: 1.5, opacity: 0.75 }}>{f.a}</span>
                  </div>
                ))}
              </div>
            </nav>
          </div>,
          document.body
        )}
    </>
  );
}
