# Floks — site scaffold

React + TypeScript + Vite + Supabase. Sign in with X, land on the coop picker, one coop open.

## Files

```
src/
  App.tsx                     routes + auth gate
  main.tsx                    entry
  styles/floks.css            all design tokens and component styles
  lib/supabase.ts             client (PKCE flow)
  hooks/
    useAuth.tsx                AuthProvider, useAuth, signInWithX, signOut, referral capture
    useHatchProgress.ts         shared BP balance / owned items / egg-claim / buy()
  components/Shell.tsx        Backdrop, TopBar, ProfileMenu, Ticker, Egg, XGlyph
  pages/
    Landing.tsx                hero + "Continue with X", captures ?ref=
    Auth/callback.tsx           /callback — finishes the OAuth handshake
    Home.tsx                    the three hanging coop cards
    RoostEvent.tsx               OPEN — countdown, egg claim, Farmers' Market, briefing, tasks
    TheBarn.tsx                 LOCKED — real checklist fed by useHatchProgress
    ChickenChallenge.tsx        LOCKED — modes + ladder preview
```

## Assets to drop in `/public`

`Flok-background.png`, `Card-1.png`, `Card-2.png`, `Card-3.png`, the five market items —
`Nest.png`, `Water-.png` (note the trailing dash), `Thermometer.png`, `Bulb.png`, `Incubator.png` —
and the five eggs: `Level-1-egg.png` through `Level-5-egg.png`.
Cards render at 3:4 — crop them portrait or the art gets cut off.

## Sounds — files you need to add

No package to install; it's plain `<audio>` via `hooks/useSound.ts`. Create a `/public/sounds/`
folder and drop in **two** clips with exactly these names:

```
public/sounds/select.mp3     short UI blip — the "game select" click
public/sounds/levelup.mp3    brighter reward chime
```

The UI asks for five different sounds; they're all these two, pitch- and volume-shifted
(`VOICES` map at the top of `useSound.ts`):

| Event | Clip | Rate | Effect |
|---|---|---|---|
| Task tap, accordion | select | 1.0 | the blip as-is |
| Market buy | select | 1.25 | same blip, brighter |
| Not enough BP | select | 0.72 | same blip, dropped low — reads as a "no" |
| Egg levels up | levelup | 1.0 | the chime as-is |
| Egg claimed | levelup | 0.9 | fuller, slower |

Pitch tracks the rate (`preservesPitch = false`), which is what makes one clip read as several.
Tune the numbers in `VOICES` to taste — that's the only place they live.

Keep both clips under ~1 second. `.mp3` is safest; for `.ogg`/`.wav` just change the paths in
`FILES`. There's a mute toggle in the profile menu, persisted to `localStorage`.

Browsers block audio until the user has interacted with the page, so the very first sound may
not fire — that's expected and handled silently.

## Egg levels

Five items, five pieces of art — one level per item, so the egg visibly changes on (almost)
every purchase (`EGG_STAGES` in `useHatchProgress.ts`):

| Items owned | Egg art |
|---|---|
| 0 | Level-1-egg.png — just claimed |
| 1 | Level-1-egg.png |
| 2 | Level-2-egg.png |
| 3 | Level-3-egg.png |
| 4 | Level-4-egg.png |
| 5 | Level-5-egg.png — ready to hatch |

The first purchase (0→1) doesn't change the art — claiming already put them at Level 1 — so
that one plays the regular `purchase` sound rather than `levelup`. Every purchase after that
bumps the level and plays `levelup`.

## Tasks

| Task | BP | Notes |
|---|---|---|
| Follow @FloksRH | 100 | One-time, highlighted separately, gates the rest |
| Like the post | 25 | |
| Comment on the post | 50 | |
| Retweet the post | 25 | |

That's 200 BP available against a 1,000 BP hatch — the remaining 800 needs to come from the
chat/community/Floks-specific activities mentioned in the article. Worth adding more tasks
before launch, or residents will stall at the Nest and Water.

## Env

`.env.local`

```
VITE_SUPABASE_URL=…
VITE_SUPABASE_ANON_KEY=…
```

## Supabase

Enable **Twitter** under Authentication → Providers, and add
`https://yourdomain.com/callback` (plus `http://localhost:5173/callback`) to the redirect allow-list.

```sql
create table residents (
  id uuid primary key references auth.users on delete cascade,
  handle text,
  name text,
  avatar_url text,
  referred_by uuid references residents(id),
  egg_claimed_at timestamptz,
  created_at timestamptz default now()
);

create table resident_tasks (
  resident_id uuid references residents on delete cascade,
  task_key text not null,
  points int not null default 0,
  created_at timestamptz default now(),
  primary key (resident_id, task_key)
);

create table resident_items (
  resident_id uuid references residents on delete cascade,
  item_key text not null,
  price int not null,
  created_at timestamptz default now(),
  primary key (resident_id, item_key)
);

alter table residents enable row level security;
alter table resident_tasks enable row level security;
alter table resident_items enable row level security;

-- Reads are public: the referral counter and the "claim your egg" flow both
-- need to look up other residents' rows (by handle, or by referred_by = me).
-- Nothing in this table is sensitive.
create policy "residents readable" on residents
  for select using (true);

create policy "residents insert own" on residents
  for insert with check (auth.uid() = id);

create policy "residents update own" on residents
  for update using (auth.uid() = id);

-- Tasks and items are personal — only the owner can read or write their own rows.
create policy "own tasks" on resident_tasks
  for all using (auth.uid() = resident_id) with check (auth.uid() = resident_id);

create policy "own items" on resident_items
  for all using (auth.uid() = resident_id) with check (auth.uid() = resident_id);
```

## How the pieces fit together

- **Profile menu** — click the avatar in the top bar. Shows a hatch-progress bar (BP spent /
  1,000), a copyable referral link (`?ref=<handle>`), a live count of residents who signed up
  through that link, and sign out.
- **Referrals** — `Landing.tsx` reads `?ref=` and stashes it in `localStorage` before the X
  redirect (`captureReferral()` in `useAuth.tsx`). On a resident's *first* login only, `useAuth`
  looks up that handle and writes `residents.referred_by`. Later logins never touch the column,
  so re-signing-in can't reassign someone's referrer.
- **Egg claim** — `Roost Event` shows an uncracked egg with a **Claim your egg** button. Claiming
  sets `residents.egg_claimed_at` and reveals the Farmers' Market underneath it.
- **Farmers' Market** — five items, unlimited stock for everyone. The only gate is BP balance
  (`earned − spent`, computed live from `resident_tasks` and `resident_items`). Buying an item
  you already own, or can't afford, is a no-op with a message — not an error state.
- **`useHatchProgress`** is the single source of truth for balance/owned items/egg status. The
  profile menu, Roost Event's market, and The Barn's checklist all read from it, so they can never
  drift out of sync with each other.

## Before launch

- Starter tasks in `RoostEvent.tsx` are marked complete client-side — anyone with a console can
  award themselves points. Move the award into an edge function that verifies the follow/quote
  against the X API before writing `resident_tasks`.
- Market purchases in `useHatchProgress.buy()` check the BP balance client-side too. That's fine
  while points are cosmetic, but before real allocation value is riding on them, move the
  balance check into a Postgres function (`security definer`, does the earned/spent math and the
  insert in one transaction) and call it via `.rpc()` instead of a direct `insert`.

## Flags

- `BARN_OPENS_AT` in `RoostEvent.tsx` — drives the countdown
- `BARN_UNLOCKED` in `TheBarn.tsx` — flips on the actual "Hatch your egg" button
- `CHALLENGE_UNLOCKED` in `ChickenChallenge.tsx`

## Design notes

Ink `#141210`, cream `#fff3d6`, yolk `#ffc42e`, comb red `#e2453a`, mint `#3fd9c0`, straw `#cbb188`.
Baloo 2 (display) / Space Grotesk (body) / JetBrains Mono (data). Hard offset shadows, 3px
outlines, no blur — same construction as the NFT art.

The signature: the three coops hang from a rail by two wires each, drift at rest, and swing when
you hover. Locked ones are desaturated with a straw-coloured stamp. Rail and swing drop away
under 820px, where the cards stack.
