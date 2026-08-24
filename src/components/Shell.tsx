import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

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
  const { resident, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="topbar">
      {back ? (
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(back.to)}>
          ← {back.label}
        </button>
      ) : (
        <Link to="/home" className="brand">
          <span className="brand-mark" aria-hidden="true">🐔</span>
          Floks
        </Link>
      )}

      {resident && (
        <div className="who">
          <img src={resident.avatar} alt="" />
          <div>
            <div className="who-handle">@{resident.handle}</div>
            <div className="who-handle muted">{resident.barnPoints} BP</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </header>
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
 * The egg. `crack` (0–1) widens the shell fracture — Landing drives it from
 * button hover so the sign-in gesture literally starts the hatch.
 */
export function Egg({ crack = 0 }: { crack?: number }) {
  return (
    <div className="egg-stage">
      <svg className="egg" viewBox="0 0 200 250" role="img" aria-label="A speckled egg">
        <ellipse cx="100" cy="238" rx="62" ry="10" fill="rgba(20,18,16,0.35)" />
        <path
          d="M100 12c46 0 78 62 78 118 0 62-35 108-78 108s-78-46-78-108C22 74 54 12 100 12Z"
          fill="var(--shell)"
          stroke="var(--ink)"
          strokeWidth="6"
        />
        <g fill="var(--straw)" opacity="0.85">
          <ellipse cx="66" cy="96" rx="9" ry="7" />
          <ellipse cx="128" cy="70" rx="6" ry="5" />
          <ellipse cx="132" cy="150" rx="10" ry="8" />
          <ellipse cx="74" cy="176" rx="6" ry="5" />
        </g>
        <g
          className="egg-crack"
          style={{ opacity: crack, transform: `scale(${0.9 + crack * 0.1})`, transformOrigin: "100px 120px" }}
        >
          <path
            d="M30 118l24-14 18 16 22-20 20 18 24-16 26 14"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path d="M100 118v34l-14 12" fill="none" stroke="var(--ink)" strokeWidth="5" strokeLinecap="round" />
        </g>
        <g style={{ opacity: crack }}>
          <circle cx="82" cy="150" r="7" fill="var(--ink)" />
          <circle cx="118" cy="150" r="7" fill="var(--ink)" />
          <path d="M92 172h20l-10 12z" fill="var(--beak)" stroke="var(--ink)" strokeWidth="4" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}
