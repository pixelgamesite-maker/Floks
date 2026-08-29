import { useState } from "react";
import { GlobalChat } from "./GlobalChat";

/**
 * Floating "message" button, bottom-right, on every authenticated page.
 * Clicking it slides up a panel with GlobalChat inside. Mount this once,
 * high up in the tree (App.tsx's Gate) — not per-page.
 */
export function ChatWidget({ onSent }: { onSent?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="chat-fab"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close chat" : "Open Global Farmers Chat"}
      >
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div className="chat-drawer panel">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <span className="eyebrow">Global Farmers Chat</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          <GlobalChat onSent={onSent} />
        </div>
      )}
    </>
  );
}
