import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { useHatchProgress, HATCH_TOTAL, EGG_STAGES, eggLevel, ITEMS, type ItemKey } from "../hooks/useHatchProgress";
import { useSound } from "../hooks/useSound";

/** Fixed site background (Flok-background.png) + darkening scrim. */
export function Backdrop() {
  return <div className="flok-bg" aria-hidden="true" />;
}

export function XGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-4.71-6.23-5.4 6.23H2.75l7.73-8.84L1.25 2.25h6.83l4.26 5.63 5.9-5.63Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
    </svg>
  );
}

export function TopBar({ back }: { back?: { to: string; label: string } }) {
  const navigate = useNavigate();

  return (
    <header className="topbar">
      {back ? (
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(back.to)}>
          ← {back.label}
        </button>
      ) : (
        <Link to="/home" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <img src="/Floks-logo.jpg" alt="" />
          </span>
          Floks
        </Link>
      )}
      <ProfileMenu />
    </header>
  );
}

function ProfileMenu() {
  const { resident, signOut } = useAuth();
  const { spent, balance, owned, progress, hatchReady } = useHatchProgress(resident?.id);
  const { muted, toggleMute } = useSound();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [referrals, setReferrals] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !resident) return;
    supabase
      .from("residents")
      .select("id", { count: "exact", head: true })
      .eq("referred_by", resident.id)
      .then(({ count }) => setReferrals(count ?? 0));
  }, [open, resident]);

  if (!resident) return null;

  const link = `${window.location.origin}/?ref=${resident.handle}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the input is still selectable for manual copy */
    }
  }

  return (
    <div className="profile-wrap">
      <button className="who" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true">
        <img src={resident.avatar} alt="" />
        <div>
          <div className="who-handle">@{resident.handle}</div>
          <div className="who-handle muted">{balance} BP</div>
        </div>
      </button>

      {open && (
        <>
          <button className="scrim" aria-label="Close profile menu" onClick={() => setOpen(false)} />
          <div className="profile-card panel stack">
            <div className="row" style={{ gap: 12 }}>
              <img
                src={resident.avatar}
                alt=""
                style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid var(--ink)", objectFit: "cover" }}
              />
              <div>
                <b style={{ fontFamily: "var(--display)", fontSize: "1.05rem" }}>@{resident.handle}</b>
                <div className="muted" style={{ fontSize: "0.78rem" }}>{resident.name}</div>
              </div>
            </div>

            <div className="stack" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="eyebrow">Hatch progress</span>
                <span className="chip">{spent}/{HATCH_TOTAL} BP</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="muted" style={{ fontSize: "0.78rem", margin: 0 }}>
                {hatchReady ? "All five items collected 🎉" : `${balance} BP ready to spend at the market`}
              </p>
            </div>

            <div className="stack" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="eyebrow">Your items</span>
                <span className="chip">{owned.size}/5</span>
              </div>
              <ItemStrip owned={owned} />
            </div>

            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">Your referral link</span>
              <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                <input readOnly value={link} className="ref-input" onFocus={(e) => e.currentTarget.select()} />
                <button className="btn btn-sm" onClick={copyLink}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              {referrals !== null && (
                <p className="muted" style={{ fontSize: "0.78rem", margin: 0 }}>
                  {referrals} {referrals === 1 ? "resident" : "residents"} joined via you
                </p>
              )}
            </div>

            <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
              <button className="btn btn-ghost btn-sm" onClick={toggleMute} style={{ flex: 1 }}>
                {muted ? "🔇 Sound off" : "🔊 Sound on"}
              </button>
              <button className="btn btn-ink btn-sm" onClick={signOut} style={{ flex: 1 }}>
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const TICKER_LINE = [
  "gYolk 🐔",
  "The Barn opens soon",
  "4,900 Floks",
  "No forms · no bots",
  "Hatch to enter",
];

export function Ticker() {
  const line = [...TICKER_LINE, ...TICKER_LINE];
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {line.map((t, i) => (
          <span key={i}>{t} ·</span>
        ))}
      </div>
    </div>
  );
}

/**
 * The levelled egg. Idles quietly, wiggles roughly every 16 seconds, pops
 * when `level` changes, and — when `energized` — glows and shakes faster.
 * Landing drives `energized` from the sign-in button hover.
 */
export function EggArt({
  level,
  size = 220,
  label,
  energized = false,
}: {
  level: number;
  size?: number;
  label?: string;
  energized?: boolean;
}) {
  const src = EGG_STAGES[Math.min(level, EGG_STAGES.length - 1)];
  return (
    <div className="egg-stage">
      <img
        key={src}
        className={`egg-img ${energized ? "egg-charged" : ""}`}
        src={src}
        alt={label ?? `Egg, level ${eggLevel(level)}`}
        style={{ width: `min(${size}px, 60vw)` }}
      />
      {label && <p className="center eyebrow" style={{ marginTop: 10 }}>{label}</p>}
    </div>
  );
}

/**
 * The five hatch items as a compact strip — greyed out until owned, full
 * colour once collected. Used in the profile menu and on The Barn.
 */
export function ItemStrip({ owned }: { owned: Set<ItemKey> }) {
  return (
    <div className="item-strip">
      {ITEMS.map((item) => {
        const has = owned.has(item.key);
        return (
          <div className={`item-pip ${has ? "item-pip-on" : ""}`} key={item.key} title={item.name}>
            <img src={item.image} alt={item.name} />
            <span>{has ? item.name : "???"}</span>
          </div>
        );
      })}
    </div>
  );
}
