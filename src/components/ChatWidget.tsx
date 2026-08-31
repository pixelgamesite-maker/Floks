import { useState } from "react";
import { createPortal } from "react-dom";
import { GlobalChat } from "./GlobalChat";

/**
 * A slim tab fixed to the right edge, vertically centered — same idea as a
 * browser's collapsed side-panel handle. Clicking it slides a full-height
 * chat panel in from the right, portalled straight into <body> so it's
 * never at risk of a `backdrop-filter` ancestor (TopBar has one) turning
 * its `position: fixed` into something relative to that ancestor instead
 * of the viewport — the exact bug that broke the hamburger drawer earlier.
 */
export function ChatWidget({ onSent }: { onSent?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="chat-tab"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-label="Open Global Farmers Chat"
        style={{ display: open ? "none" : "flex" }}
      >
        <span>‹</span>
        <span className="chat-tab-label">💬</span>
      </button>

      {open &&
        createPortal(
          <div className="nav-scrim" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div className="chat-panel-drawer">
              <div className="row" style={{ justifyContent: "space-between", padding: "18px 20px 12px" }}>
                <span className="eyebrow">Global Farmers Chat</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close chat">
                  ✕
                </button>
              </div>
              <div className="chat-panel-body">
                <GlobalChat onSent={onSent} />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
