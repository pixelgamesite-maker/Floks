-- ═══════════════════════════════════════════════════════════════════
-- FLOKS — full schema
-- Safe to re-run against a live database: existing tables/columns are
-- preserved (IF NOT EXISTS / ALTER ... ADD COLUMN IF NOT EXISTS), and
-- functions/triggers use CREATE OR REPLACE + DROP-then-CREATE.
-- Paste into Supabase → SQL Editor → Run.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists citext;

-- ── Tunables ───────────────────────────────────────────────────────
-- One place to change the numbers everyone keeps asking to tune later,
-- without a code deploy. Update with e.g.:
--   update app_config set value = 5 where key = 'chat_message_points';

create table if not exists app_config (
  key   text primary key,
  value int not null
);

insert into app_config (key, value) values
  ('bp_cap', 2500),               -- hard cap on a resident's total BP balance
  ('chat_cooldown_seconds', 5),  -- min gap between messages, per resident
  ('chat_message_points', 12),    -- BP earned per chat message (capped)
  ('referral_points', 20)         -- BP earned per successful referral (capped)
on conflict (key) do nothing;      -- do nothing: re-running this file must never
                                    -- clobber values you've already tuned by hand

alter table app_config enable row level security;
drop policy if exists "config readable" on app_config;
create policy "config readable" on app_config for select using (true);

-- ── Core tables ────────────────────────────────────────────────────

create table if not exists residents (
  id             uuid primary key references auth.users on delete cascade,
  handle         citext unique,
  name           text,
  avatar_url     text,
  referred_by    uuid references residents(id) on delete set null,
  egg_claimed_at timestamptz,
  created_at     timestamptz not null default now()
);

-- Added across later versions of this schema — ALTER, not baked into the
-- CREATE TABLE above, so this stays safe to run against a live database.
alter table residents add column if not exists is_admin boolean not null default false;
alter table residents add column if not exists muted_until timestamptz;
alter table residents add column if not exists wl_claimed_at timestamptz;
alter table residents add column if not exists wallet_address text;
alter table residents add column if not exists nft_number int unique;

-- is_admin / muted_until / nft_number are never writable by a client, even
-- though RLS lets a resident UPDATE their own row — RLS is row-level only,
-- so without this a resident could `update residents set is_admin = true
-- where id = auth.uid()`, or just pick any NFT number they want instead of
-- going through the sequence. Only the SECURITY DEFINER functions below
-- (admin_mute_resident etc., claim_nft) can touch these columns, because
-- they run with their owner's privileges.
-- is_admin / muted_until / nft_number / wl_claimed_at / wallet_address are
-- never writable by a client, even though RLS lets a resident UPDATE their
-- own row — RLS is row-level only. Without this, a resident could set their
-- own wl_claimed_at directly and claim a WL spot with zero regard for the
-- 4,000-spot cap, which is enforced entirely inside claim_wl() below. Only
-- that function (and the other SECURITY DEFINER functions for is_admin/
-- muted_until) can touch these columns, because they run with their
-- owner's privileges, the same mechanism that lets a table owner bypass RLS.
revoke update (is_admin, muted_until, nft_number, wl_claimed_at, wallet_address) on residents from authenticated, anon;

create table if not exists task_catalog (
  key    text primary key,
  label  text not null,
  points int  not null check (points >= 0),
  active boolean not null default true
);

-- href/opens_at/closes_at power the day-gated task calendar — nullable so
-- the original always-open tasks (follow/like/comment/retweet) are
-- unaffected. A task is open when now() is between opens_at and closes_at;
-- null on either side means unbounded in that direction.
alter table task_catalog add column if not exists href text;
alter table task_catalog add column if not exists opens_at timestamptz;
alter table task_catalog add column if not exists closes_at timestamptz;

create table if not exists market_items (
  key    text primary key,
  name   text not null,
  price  int  not null check (price >= 0),
  active boolean not null default true
);

create table if not exists resident_tasks (
  resident_id uuid not null references residents on delete cascade,
  task_key    text not null references task_catalog(key),
  points      int  not null default 0,
  created_at  timestamptz not null default now(),
  primary key (resident_id, task_key)
);

create table if not exists resident_items (
  resident_id uuid not null references residents on delete cascade,
  item_key    text not null references market_items(key),
  price       int  not null default 0,
  created_at  timestamptz not null default now(),
  primary key (resident_id, item_key)
);

-- One row per successful referral (not per click) — the referred person can
-- only ever trigger this once, enforced by the primary key on referred_id.
create table if not exists referral_rewards (
  referrer_id uuid not null references residents on delete cascade,
  referred_id uuid primary key references residents on delete cascade,
  points      int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists chat_messages (
  id                bigint generated always as identity primary key,
  resident_id       uuid not null references residents on delete cascade,
  body              text not null check (char_length(trim(body)) between 1 and 240),
  requested_amount  int check (requested_amount is null or requested_amount > 0),
  created_at        timestamptz not null default now()
);
-- CREATE TABLE IF NOT EXISTS is a no-op against a table that already
-- exists — it does not diff or add missing columns. requested_amount was
-- added after chat_messages already existed on a live deployment, so it
-- needs this explicit ALTER TABLE too, same as every other post-launch
-- column elsewhere in this file (is_admin, wl_claimed_at, wallet_address).
alter table chat_messages add column if not exists requested_amount int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_messages_requested_amount_check'
  ) then
    alter table chat_messages add constraint chat_messages_requested_amount_check
      check (requested_amount is null or requested_amount > 0);
  end if;
end $$;

-- One row per message that actually earned BP. Absence of a row for a given
-- message just means it was sent while already at the cap — the message
-- itself always goes through regardless of whether it earned anything.
create table if not exists chat_rewards (
  message_id  bigint primary key references chat_messages(id) on delete cascade,
  resident_id uuid not null references residents on delete cascade,
  points      int  not null default 0,
  created_at  timestamptz not null default now()
);

-- No SELECT policy on purpose: RLS enabled + zero policies denies all client
-- reads. Nobody browsing the site can see what words are filtered — only
-- the moderation trigger (running as table owner, which bypasses RLS) can.
create table if not exists banned_words (
  word text primary key
);
alter table banned_words enable row level security;

-- One row per resident, ever — "each user can only gamble once" enforced by
-- the primary key, not just app logic.
create table if not exists gamble_results (
  resident_id uuid primary key references residents on delete cascade,
  wager       int  not null,
  outcome     text not null check (outcome in ('win', 'lose')),
  delta       int  not null,
  created_at  timestamptz not null default now()
);

-- One vote per resident, ever — no update/delete policy makes it final.
-- Points come from task_catalog('vote_reveal') — 100 BP — editable the same
-- way as every other task: update task_catalog set points = X where key = 'vote_reveal';
create table if not exists votes (
  resident_id uuid primary key references residents on delete cascade,
  choice      text not null check (choice in ('instant', '24h')),
  created_at  timestamptz not null default now()
);

create table if not exists vote_rewards (
  resident_id uuid primary key references residents on delete cascade,
  points      int  not null default 0,
  created_at  timestamptz not null default now()
);

-- Manual BP adjustments — bonuses, compensation, corrections, or docking
-- someone for moderation. Deliberately NOT clamped to the 2,500 cap: this is
-- an explicit admin override, not an earning source, so it does exactly what
-- you tell it to (see admin_adjust_balance() further down, near the other
-- admin actions — the table has to live up here since barn_balance() below
-- references it, and Postgres validates table refs at CREATE FUNCTION time
-- for `language sql` functions, unlike plpgsql).
create table if not exists resident_adjustments (
  id          bigint generated always as identity primary key,
  resident_id uuid not null references residents on delete cascade,
  amount      int  not null,
  reason      text,
  created_by  uuid references residents(id),
  created_at  timestamptz not null default now()
);

-- Peer-to-peer BP transfers. Both sides show up here — a sender's row is a
-- debit, a recipient's is a credit — same ledger, filtered two different
-- ways in barn_balance() below. No self-gifting (checked in gift_bp()).
create table if not exists bp_gifts (
  id            bigint generated always as identity primary key,
  sender_id     uuid not null references residents on delete cascade,
  recipient_id  uuid not null references residents on delete cascade,
  amount        int  not null check (amount > 0),
  message_id    bigint references chat_messages(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- At most one gift per chat request, ever. This is the actual guarantee —
-- the "already fulfilled" check inside gift_bp() is just a friendlier error
-- message; without this index, two people clicking Gift on the same request
-- within the same instant could both succeed.
create unique index if not exists bp_gifts_message_id_once
  on bp_gifts (message_id)
  where message_id is not null;

create index if not exists residents_referred_by_idx on residents (referred_by);
create index if not exists resident_tasks_resident_idx on resident_tasks (resident_id);
create index if not exists resident_items_resident_idx on resident_items (resident_id);
create index if not exists chat_messages_created_idx on chat_messages (created_at desc);
create index if not exists referral_rewards_referrer_idx on referral_rewards (referrer_id);
create index if not exists chat_rewards_resident_idx on chat_rewards (resident_id);

-- ── Seed the catalogs ──────────────────────────────────────────────

insert into task_catalog (key, label, points) values
  ('follow',  'Follow @FloksRH on X',          100),
  ('like',    'Like the Floks post',            25),
  ('comment', 'Comment on the Floks post',      50),
  ('retweet', 'Retweet the Floks post',         25)
on conflict (key) do update
  set label = excluded.label, points = excluded.points;

update task_catalog set href = 'https://x.com/FloksRH' where key = 'follow';
update task_catalog set href = 'https://x.com/FloksRH/status/2090831543329517768'
  where key in ('like', 'comment', 'retweet');

-- Superseded by per-message chat_rewards below — deactivated, not deleted,
-- so residents who already earned this keep their BP (deleting the catalog
-- row would also need to delete their resident_tasks row via FK cascade,
-- silently clawing back BP they'd already earned).
update task_catalog set active = false where key = 'chat';

-- Also superseded — these were the original evergreen social tasks, now
-- replaced by the rotating per-tweet task sets below (quote/tag2/like_rt
-- etc.). Same non-destructive deactivation, same reasoning as 'chat' above.
update task_catalog set active = false where key in ('like', 'comment', 'retweet');

-- Day-gated tasks ("Today's Tasks" in the UI) are entirely yours to create —
-- nothing is pre-seeded here. RoostEvent.tsx fetches whatever rows exist
-- with a key starting "day" and shows them if the current time falls
-- between opens_at/closes_at, so adding a real task is just an insert:
--
--   insert into task_catalog (key, label, points, href, opens_at, closes_at)
--   values (
--     'day1_quote',                          -- any unique key
--     'Quote the pinned tweet',               -- what shows in the app
--     70,                                     -- BP awarded
--     'https://x.com/FloksRH/status/...',     -- the real tweet
--     '2026-08-31 18:00+00',                  -- opens (UTC)
--     '2026-09-01 09:00+00'                   -- closes (UTC)
--   );
--
-- Leave opens_at/closes_at null for a task that's just always available.
-- To edit or retire one later:
--   update task_catalog set points = 100 where key = 'day1_quote';
--   update task_catalog set active = false where key = 'day1_quote';

-- Special task: voting is worth 100 BP — tune with the one-liner in the
-- comment above votes/vote_rewards, no code change needed.
insert into task_catalog (key, label, points) values
  ('vote_reveal', 'Vote: instant reveal or reveal after 24 hours', 100)
on conflict (key) do update
  set label = excluded.label, points = excluded.points;

-- Item prices — update via the same upsert if these change again.
insert into market_items (key, name, price) values
  ('nest',        'Nest',        100),
  ('water',       'Water',       150),
  ('thermometer', 'Thermometer', 350),
  ('heat_bulb',   'Bulb',        300),
  ('incubator',   'Incubator',   600)
on conflict (key) do update
  set name = excluded.name, price = excluded.price;

-- ── Balance ────────────────────────────────────────────────────────
-- Every BP source and sink in one function. Add a new source? Add it here
-- and the cap/UI/purchase-guard all pick it up automatically.

create or replace function barn_balance(target uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select
      coalesce((select sum(points) from resident_tasks       where resident_id = target), 0)
    + coalesce((select sum(points) from referral_rewards     where referrer_id = target), 0)
    + coalesce((select sum(points) from chat_rewards         where resident_id = target), 0)
    + coalesce((select points      from vote_rewards         where resident_id = target), 0)
    + coalesce((select sum(delta)  from gamble_results       where resident_id = target), 0)
    + coalesce((select sum(amount) from resident_adjustments where resident_id = target), 0)
    + coalesce((select sum(amount) from bp_gifts             where recipient_id = target), 0)
    - coalesce((select sum(amount) from bp_gifts             where sender_id = target), 0)
    - coalesce((select sum(price)  from resident_items       where resident_id = target), 0);
$$;

grant execute on function barn_balance(uuid) to authenticated;

-- ── Integrity triggers ─────────────────────────────────────────────

-- Referrals and egg/WL claims are write-once. WL claim additionally
-- requires all five items already collected.
create or replace function residents_guard()
returns trigger
language plpgsql
as $$
begin
  if new.referred_by = new.id then
    raise exception 'A resident cannot refer themselves';
  end if;

  if tg_op = 'UPDATE' then
    if old.referred_by is not null and new.referred_by is distinct from old.referred_by then
      raise exception 'Referral is already attributed and cannot be changed';
    end if;

    if old.egg_claimed_at is not null and new.egg_claimed_at is distinct from old.egg_claimed_at then
      raise exception 'Egg is already claimed';
    end if;
    if old.egg_claimed_at is null and new.egg_claimed_at is not null then
      new.egg_claimed_at := now();
    end if;

    if old.wl_claimed_at is not null and new.wl_claimed_at is distinct from old.wl_claimed_at then
      raise exception 'WL spot is already claimed';
    end if;
    -- Wallet address is locked the moment it's first set, whether or not
    -- wl_claimed_at changes in the same statement — this covers both a
    -- normal claim (both fields set together) and a resident who already
    -- claimed before wallet collection existed submitting one after the
    -- fact (wl_claimed_at unchanged, only wallet_address going null -> set).
    if old.wallet_address is not null and new.wallet_address is distinct from old.wallet_address then
      raise exception 'Wallet address is already locked in and cannot be changed';
    end if;
    if old.wallet_address is null and new.wallet_address is not null
       and new.wallet_address !~* '^0x[0-9a-f]{40}$' then
      raise exception 'Enter a valid EVM wallet address (0x followed by 40 hex characters)';
    end if;

    if old.wl_claimed_at is null and new.wl_claimed_at is not null then
      if (select count(*) from resident_items where resident_id = new.id) < 5 then
        raise exception 'Collect all five items before claiming your WL spot';
      end if;
      if new.wallet_address is null then
        raise exception 'Enter a valid EVM wallet address (0x followed by 40 hex characters)';
      end if;
      new.wl_claimed_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists residents_guard_trg on residents;
create trigger residents_guard_trg
  before insert or update on residents
  for each row execute function residents_guard();

-- ── NFT number assignment ──────────────────────────────────────────
-- 4,000 numbers exist (nft_1.png … nft_4000.png in Storage — started at
-- 2,000, raised once more were uploaded; the sequence's MAXVALUE was
-- adjusted live with `alter sequence nft_number_seq maxvalue 4000`, which
-- doesn't reset the counter, just raises the ceiling). A Postgres sequence
-- is what actually makes "no two residents ever get the same number" true
-- even under concurrent claims — nextval() is atomic at the database
-- level, so two people hatching in the same instant still get two
-- different numbers, and the (cap+1)th claim fails cleanly instead of
-- silently reusing one.
create sequence if not exists nft_number_seq as int minvalue 1 maxvalue 4000 start 1;
-- CREATE SEQUENCE IF NOT EXISTS is a no-op against a sequence that already
-- exists — it won't apply a new maxvalue to an existing one. This explicit
-- ALTER is what actually raises the cap on a re-run; it doesn't touch or
-- reset the current counter, only the ceiling.
alter sequence nft_number_seq maxvalue 4000;

-- The ONLY way wl_claimed_at, wallet_address, or nft_number ever get set.
-- Deliberately one function, not two — an earlier version split "claim your
-- NFT number" (at hatch time) from "claim WL" (at wallet time), which meant
-- someone could take one of the 4,000 numbers and never submit a wallet,
-- wasting a slot on someone who never actually finished. Now a slot is only
-- ever consumed by someone who has both 5 items AND a valid wallet, in the
-- same transaction — the two can't be split apart again.
--
-- Also handles the backfill case: residents who claimed WL before this
-- function existed (wl_claimed_at already set) either still need a wallet,
-- still need an NFT number, or both — calling this again for them fills in
-- whatever's missing without re-validating or re-charging anything already
-- done, and without ever raising "already claimed" at them.
drop function if exists claim_nft();
drop function if exists claim_wl(text);
create or replace function claim_wl(wallet text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me            uuid := auth.uid();
  existing_wl   timestamptz;
  existing_addr text;
  existing_nft  int;
  n             int;
begin
  if me is null then
    raise exception 'Sign in required';
  end if;
  if wallet !~* '^0x[0-9a-f]{40}$' then
    raise exception 'Enter a valid EVM wallet address (0x followed by 40 hex characters)';
  end if;

  select wl_claimed_at, wallet_address, nft_number
  into existing_wl, existing_addr, existing_nft
  from residents where id = me;

  -- Backfill: WL already claimed (from before this function existed).
  -- Fill in whatever's missing; never touch what's already set.
  if existing_wl is not null then
    if existing_addr is null then
      update residents set wallet_address = wallet where id = me;
    end if;
    if existing_nft is null then
      begin
        n := nextval('nft_number_seq');
        update residents set nft_number = n where id = me;
        existing_nft := n;
      exception when others then
        null; -- pool exhausted — this resident just doesn't get a number, nothing else to do
      end;
    end if;
    return jsonb_build_object('nft_number', existing_nft);
  end if;

  -- Fresh claim: needs 5 items, a slot in the 4,000, and hasn't claimed yet.
  if (select count(*) from resident_items where resident_id = me) < 5 then
    raise exception 'Collect all five items first';
  end if;

  begin
    n := nextval('nft_number_seq');
  exception when others then
    raise exception 'All 4,000 spots have already been claimed';
  end;

  update residents set wl_claimed_at = now(), wallet_address = wallet, nft_number = n where id = me;

  return jsonb_build_object('nft_number', n);
end;
$$;
grant execute on function claim_wl(text) to authenticated;

-- Award the referrer once their referral actually completes signup. Runs
-- once per new resident row that has referred_by set.
create or replace function grant_referral_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pts       int;
  cap       int;
  remaining int;
begin
  if new.referred_by is null then
    return new;
  end if;

  select value into pts from app_config where key = 'referral_points';
  select value into cap from app_config where key = 'bp_cap';
  remaining := cap - barn_balance(new.referred_by);

  -- Silent skip if the referrer is at the cap: the referral relationship
  -- still counts (the profile menu's referral counter reads residents,
  -- not this table), it just doesn't add BP right now.
  if remaining >= pts then
    insert into referral_rewards (referrer_id, referred_id, points)
    values (new.referred_by, new.id, pts)
    on conflict (referred_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists grant_referral_reward_trg on residents;
create trigger grant_referral_reward_trg
  after insert on residents
  for each row execute function grant_referral_reward();

-- Task points always come from the catalog, and only inside the task's
-- open window, and only if it wouldn't push the resident over the cap.
create or replace function resident_tasks_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cat       task_catalog%rowtype;
  cap       int;
  remaining int;
begin
  select * into cat from task_catalog where key = new.task_key and active;

  if cat.key is null then
    raise exception 'Unknown or inactive task: %', new.task_key;
  end if;

  if cat.opens_at is not null and now() < cat.opens_at then
    raise exception 'This task is not open yet';
  end if;
  if cat.closes_at is not null and now() > cat.closes_at then
    raise exception 'This task has closed';
  end if;

  select value into cap from app_config where key = 'bp_cap';
  remaining := cap - barn_balance(new.resident_id);

  if remaining < cat.points then
    raise exception 'You are at the % BP cap — spend some at the market to keep earning', cap;
  end if;

  new.points := cat.points;
  return new;
end;
$$;

drop trigger if exists resident_tasks_guard_trg on resident_tasks;
create trigger resident_tasks_guard_trg
  before insert or update on resident_tasks
  for each row execute function resident_tasks_guard();

-- Purchases: price from the catalog, egg must be claimed, balance must cover it.
create or replace function resident_items_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  catalog_price int;
  claimed       timestamptz;
  available     int;
begin
  select price into catalog_price
  from market_items
  where key = new.item_key and active;

  if catalog_price is null then
    raise exception 'Unknown or inactive item: %', new.item_key;
  end if;

  select egg_claimed_at into claimed
  from residents
  where id = new.resident_id;

  if claimed is null then
    raise exception 'Claim your egg before shopping the market';
  end if;

  new.price := catalog_price;

  available := barn_balance(new.resident_id);
  if available < catalog_price then
    raise exception 'Not enough BP: have %, need %', available, catalog_price;
  end if;

  return new;
end;
$$;

drop trigger if exists resident_items_guard_trg on resident_items;
create trigger resident_items_guard_trg
  before insert on resident_items
  for each row execute function resident_items_guard();

create or replace function no_deletes()
returns trigger language plpgsql as $$
begin
  raise exception 'Purchases are final';
end;
$$;

drop trigger if exists resident_items_no_delete_trg on resident_items;
create trigger resident_items_no_delete_trg
  before delete or update on resident_items
  for each row execute function no_deletes();

-- Chat: mute check, link block, word filter, and a configurable cooldown —
-- all in one BEFORE INSERT trigger.
create or replace function chat_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_muted   boolean;
  hit        text;
  cooldown_s int;
begin
  select (muted_until is not null and muted_until > now())
  into is_muted
  from residents
  where id = new.resident_id;

  if is_muted then
    raise exception 'You are temporarily muted from chat';
  end if;

  if new.body ~* '(https?://|www\.)' then
    raise exception 'Links are not allowed in chat';
  end if;

  select word into hit
  from banned_words
  where new.body ~* ('(^|[^a-zA-Z0-9])' || word || '($|[^a-zA-Z0-9])')
  limit 1;

  if hit is not null then
    raise exception 'That message is not allowed here';
  end if;

  select value into cooldown_s from app_config where key = 'chat_cooldown_seconds';

  if exists (
    select 1 from chat_messages
    where resident_id = new.resident_id
      and created_at > now() - (cooldown_s || ' seconds')::interval
  ) then
    raise exception 'Slow down — wait a moment before sending another message';
  end if;

  return new;
end;
$$;

drop trigger if exists chat_moderation_trg on chat_messages;
create trigger chat_moderation_trg
  before insert on chat_messages
  for each row execute function chat_moderation();

-- Per-message reward, decoupled from sending: the message above always
-- succeeds (subject to the checks in chat_moderation); this separately and
-- silently awards up to chat_message_points, clamped to whatever room is
-- left under the cap. Zero room = message sent, no reward row, no error.
create or replace function grant_chat_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pts       int;
  cap       int;
  remaining int;
begin
  select value into pts from app_config where key = 'chat_message_points';
  select value into cap from app_config where key = 'bp_cap';
  remaining := cap - barn_balance(new.resident_id);

  if remaining <= 0 then
    return new;
  end if;

  insert into chat_rewards (message_id, resident_id, points)
  values (new.id, new.resident_id, least(pts, remaining));

  return new;
end;
$$;

drop trigger if exists grant_chat_reward_trg on chat_messages;
create trigger grant_chat_reward_trg
  after insert on chat_messages
  for each row execute function grant_chat_reward();

-- Voting awards once, same cap-aware pattern as chat/referral rewards above.
create or replace function grant_vote_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pts       int;
  cap       int;
  remaining int;
begin
  select points into pts from task_catalog where key = 'vote_reveal' and active;
  pts := coalesce(pts, 0);

  select value into cap from app_config where key = 'bp_cap';
  remaining := cap - barn_balance(new.resident_id);

  if pts > 0 and remaining >= pts then
    insert into vote_rewards (resident_id, points)
    values (new.resident_id, pts)
    on conflict (resident_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists grant_vote_reward_trg on votes;
create trigger grant_vote_reward_trg
  after insert on votes
  for each row execute function grant_vote_reward();

-- ── Admin actions ──────────────────────────────────────────────────
-- Only ways is_admin, muted_until, or a chat_messages row can change once
-- created. Each checks the caller is already an admin. Bootstrap your first
-- admin from the SQL editor directly — see README.

create or replace function admin_mute_resident(target uuid, minutes int default 60)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean;
begin
  select is_admin into caller_is_admin from residents where id = auth.uid();
  if not coalesce(caller_is_admin, false) then
    raise exception 'Admins only';
  end if;

  update residents set muted_until = now() + (minutes || ' minutes')::interval where id = target;
end;
$$;
grant execute on function admin_mute_resident(uuid, int) to authenticated;

-- A "ban" is just a mute with no end date. Unban uses admin_unmute_resident
-- below — there's no separate function, muted_until = null covers both.
create or replace function admin_ban_resident(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean;
begin
  select is_admin into caller_is_admin from residents where id = auth.uid();
  if not coalesce(caller_is_admin, false) then
    raise exception 'Admins only';
  end if;

  update residents set muted_until = 'infinity'::timestamptz where id = target;
end;
$$;
grant execute on function admin_ban_resident(uuid) to authenticated;

create or replace function admin_unmute_resident(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean;
begin
  select is_admin into caller_is_admin from residents where id = auth.uid();
  if not coalesce(caller_is_admin, false) then
    raise exception 'Admins only';
  end if;

  update residents set muted_until = null where id = target;
end;
$$;
grant execute on function admin_unmute_resident(uuid) to authenticated;

create or replace function admin_delete_message(msg_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean;
begin
  select is_admin into caller_is_admin from residents where id = auth.uid();
  if not coalesce(caller_is_admin, false) then
    raise exception 'Admins only';
  end if;

  delete from chat_messages where id = msg_id;
end;
$$;
grant execute on function admin_delete_message(bigint) to authenticated;

create or replace function admin_adjust_balance(target uuid, delta int, reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean;
begin
  select is_admin into caller_is_admin from residents where id = auth.uid();
  if not coalesce(caller_is_admin, false) then
    raise exception 'Admins only';
  end if;

  insert into resident_adjustments (resident_id, amount, reason, created_by)
  values (target, delta, reason, auth.uid());
end;
$$;
grant execute on function admin_adjust_balance(uuid, int, text) to authenticated;

-- ── Peer-to-peer gifting ──────────────────────────────────────────────
-- Anyone can send BP to anyone else. The sender only ever loses what
-- actually transfers — if the recipient is close to the cap, the gift is
-- clamped down to their remaining headroom rather than rejected outright,
-- so a well-meaning gift never gets wasted by asking for too much.
-- Explicit drop, not just CREATE OR REPLACE — Postgres refuses to rename a
-- parameter via REPLACE (this function's third parameter used to be called
-- message_id), so a rename needs the old signature actually dropped first.
drop function if exists gift_bp(uuid, int, bigint);
create or replace function gift_bp(recipient uuid, amount int, msg_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me           uuid := auth.uid();
  sender_bal   int;
  cap          int;
  headroom     int;
  actual       int;
begin
  if me is null then
    raise exception 'Sign in required';
  end if;
  if recipient = me then
    raise exception 'You cannot gift yourself';
  end if;
  if amount is null or amount <= 0 then
    raise exception 'Enter a positive amount';
  end if;
  if not exists (select 1 from residents where id = recipient) then
    raise exception 'That resident does not exist';
  end if;

  -- A request can only ever be fulfilled once, by whoever gets there first.
  -- This check is a friendly early exit; the unique index below (not this
  -- check) is what actually prevents two simultaneous gifts from both
  -- succeeding — a plain "exists" check alone has a race window between two
  -- concurrent calls.
  if msg_id is not null and exists (select 1 from bp_gifts where bp_gifts.message_id = msg_id) then
    raise exception 'This request has already been fulfilled';
  end if;

  sender_bal := barn_balance(me);
  if sender_bal < amount then
    raise exception 'You only have % BP', sender_bal;
  end if;

  select value into cap from app_config where key = 'bp_cap';
  headroom := cap - barn_balance(recipient);
  if headroom <= 0 then
    raise exception 'Recipient is already at the BP cap and can''t receive more';
  end if;

  actual := least(amount, headroom);

  insert into bp_gifts (sender_id, recipient_id, amount, message_id)
  values (me, recipient, actual, msg_id);

  return jsonb_build_object('sent', actual, 'requested', amount);
end;
$$;
grant execute on function gift_bp(uuid, int, bigint) to authenticated;

-- ── Community wallet claims — public page, no login ───────────────────
-- floks.fun/claim is not behind X auth at all, so there's no auth.uid() to
-- key anything off. One row per wallet, ever (a wallet can only claim once,
-- regardless of which community it clicks), and a shared pool of 1,000
-- spots across all 16 communities combined — same sequence-based "no two
-- claims can ever collide, no cap can ever be exceeded" pattern as
-- nft_number_seq above, just without the resident/auth layer.
--
-- ⚠️ IMPORTANT GAP: this function does NOT check the published Google Sheet
-- for wallet+community eligibility — Postgres can't reach an external URL
-- without extra setup (the http/pg_net extension), and docs.google.com
-- isn't something I could verify or wire up from here. Eligibility is
-- checked client-side (src/pages/Claim.tsx fetches and parses the sheet
-- before calling this) and NOT re-verified here. This means a technically
-- capable person could skip the eligibility check and claim a spot for a
-- wallet/community that was never actually on the list — the 1,000 cap and
-- one-claim-per-wallet rule are still fully enforced, but "is this wallet
-- actually eligible" currently relies on the client behaving honestly.
-- Closing this properly means either a Supabase Edge Function that fetches
-- and checks the sheet server-side, or enabling the `http` extension and
-- doing it in Postgres directly.
create table if not exists community_claims (
  wallet      text primary key,  -- normalized lowercase — enforces one claim per wallet
  community   text not null,
  spot_number int  not null unique,
  created_at  timestamptz not null default now()
);

create sequence if not exists community_claim_seq as int minvalue 1 maxvalue 1000 start 1;
alter sequence community_claim_seq maxvalue 1000; -- see the nft_number_seq comment above for why this line, not just CREATE, is what actually applies a cap change

alter table community_claims enable row level security;

drop policy if exists "community claims readable" on community_claims;
create policy "community claims readable" on community_claims
  for select using (true);
-- No insert/update/delete policy — only claim_community_spot below writes this.

create or replace function claim_community_spot(wallet_in text, community_in text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  norm_wallet text := lower(trim(wallet_in));
  n int;
begin
  if norm_wallet !~* '^0x[0-9a-f]{40}$' then
    raise exception 'Enter a valid EVM wallet address (0x followed by 40 hex characters)';
  end if;
  if community_in is null or length(trim(community_in)) = 0 then
    raise exception 'Missing community';
  end if;

  if exists (select 1 from community_claims where wallet = norm_wallet) then
    raise exception 'This wallet has already claimed a spot';
  end if;

  begin
    n := nextval('community_claim_seq');
  exception when others then
    raise exception 'All 1,000 spots have already been claimed';
  end;

  insert into community_claims (wallet, community, spot_number)
  values (norm_wallet, trim(community_in), n);

  return jsonb_build_object('spot_number', n);
end;
$$;

-- Granted to anon, not just authenticated — this page has no session at all.
-- This, not the earlier grant, is what actually matters. Postgres grants
-- EXECUTE to PUBLIC by default on every new function unless told otherwise
-- — so simply not writing a "grant ... to anon" line was never enough on
-- its own. This explicit revoke removes it from anon, authenticated, AND
-- public, so the only way left to call this function is the service role
-- key inside supabase/functions/claim-community-spot/index.ts — which
-- checks the eligibility sheet server-side before ever calling this, and
-- is never sent to any client. This is what makes the direct-call bypass
-- (which produced both the 78-row and 601-row incidents) impossible now,
-- not just discouraged.
revoke execute on function claim_community_spot(text, text) from public, anon, authenticated;
grant select on community_claims to anon, authenticated;

-- ── Farmers Gambling Arena — one-time double or nothing ──────────────
-- Wagers the resident's entire current balance. Win doubles it (clamped to
-- the cap); lose zeroes it. Each resident can only ever call this once —
-- enforced by the primary key on gamble_results, not just app logic.

create or replace function play_double_or_nothing()
returns table(outcome text, delta int, new_balance int)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_bal int;
  cap         int;
  won         boolean;
  gain        int;
begin
  if exists (select 1 from gamble_results where resident_id = auth.uid()) then
    raise exception 'You already used your one shot at Double or Nothing';
  end if;

  current_bal := barn_balance(auth.uid());
  if current_bal <= 0 then
    raise exception 'You need a positive BP balance to gamble';
  end if;

  select value into cap from app_config where key = 'bp_cap';
  won := random() < 0.5;

  if won then
    gain := least(current_bal, greatest(0, cap - current_bal));
    insert into gamble_results (resident_id, wager, outcome, delta)
    values (auth.uid(), current_bal, 'win', gain);
  else
    insert into gamble_results (resident_id, wager, outcome, delta)
    values (auth.uid(), current_bal, 'lose', -current_bal);
  end if;

  return query
    select
      case when won then 'win' else 'lose' end,
      case when won then gain else -current_bal end,
      barn_balance(auth.uid());
end;
$$;
grant execute on function play_double_or_nothing() to authenticated;

-- ── Row level security ─────────────────────────────────────────────

alter table residents         enable row level security;
alter table resident_tasks    enable row level security;
alter table resident_items    enable row level security;
alter table task_catalog      enable row level security;
alter table market_items      enable row level security;
alter table chat_messages     enable row level security;
alter table referral_rewards  enable row level security;
alter table chat_rewards      enable row level security;
alter table gamble_results    enable row level security;
alter table votes             enable row level security;
alter table vote_rewards      enable row level security;
alter table resident_adjustments enable row level security;
alter table bp_gifts             enable row level security;

-- Residents publicly readable: referral counter needs to count rows where
-- referred_by = me, and signup needs to resolve a ?ref= handle to an id.
-- Nothing in the table is sensitive (handle + avatar are already public).
drop policy if exists "residents readable" on residents;
create policy "residents readable" on residents for select using (true);

drop policy if exists "residents insert own" on residents;
create policy "residents insert own" on residents for insert with check (auth.uid() = id);

drop policy if exists "residents update own" on residents;
create policy "residents update own" on residents
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own tasks" on resident_tasks;
create policy "own tasks" on resident_tasks
  for all using (auth.uid() = resident_id) with check (auth.uid() = resident_id);

drop policy if exists "own items" on resident_items;
create policy "own items" on resident_items
  for all using (auth.uid() = resident_id) with check (auth.uid() = resident_id);

drop policy if exists "catalog readable" on task_catalog;
create policy "catalog readable" on task_catalog for select using (true);

drop policy if exists "market readable" on market_items;
create policy "market readable" on market_items for select using (true);

drop policy if exists "chat readable" on chat_messages;
create policy "chat readable" on chat_messages for select using (true);

drop policy if exists "chat insert own" on chat_messages;
create policy "chat insert own" on chat_messages for insert with check (auth.uid() = resident_id);
-- No update/delete policy: only admin_delete_message (SECURITY DEFINER) can remove a message.

drop policy if exists "referral rewards readable" on referral_rewards;
create policy "referral rewards readable" on referral_rewards
  for select using (auth.uid() = referrer_id);
-- No insert policy: only grant_referral_reward (SECURITY DEFINER) writes this.

drop policy if exists "chat rewards readable" on chat_rewards;
create policy "chat rewards readable" on chat_rewards
  for select using (auth.uid() = resident_id);
-- No insert policy: only grant_chat_reward (SECURITY DEFINER) writes this.

drop policy if exists "gamble results readable" on gamble_results;
create policy "gamble results readable" on gamble_results
  for select using (auth.uid() = resident_id);
-- No insert policy: only play_double_or_nothing (SECURITY DEFINER) writes this.

drop policy if exists "adjustments readable own" on resident_adjustments;
create policy "adjustments readable own" on resident_adjustments
  for select using (auth.uid() = resident_id);
-- No insert policy: only admin_adjust_balance (SECURITY DEFINER) writes this.

drop policy if exists "gifts readable to both sides" on bp_gifts;
drop policy if exists "gifts readable" on bp_gifts;
create policy "gifts readable" on bp_gifts
  for select using (true);
-- Public, matching chat_messages — anyone in the (public) chat needs to see
-- "this request is already fulfilled by @x", not just the two people
-- involved. Amounts and who-gifted-whom were never private information
-- here; only the write path (gift_bp, SECURITY DEFINER) is restricted.

-- Public read so a live tally can be shown; insert-own-only and no update
-- policy at all makes a vote final the moment it's cast.
drop policy if exists "votes readable" on votes;
create policy "votes readable" on votes for select using (true);

drop policy if exists "votes insert own" on votes;
create policy "votes insert own" on votes for insert with check (auth.uid() = resident_id);

drop policy if exists "vote rewards readable" on vote_rewards;
create policy "vote rewards readable" on vote_rewards
  for select using (auth.uid() = resident_id);
-- No insert policy: only grant_vote_reward (SECURITY DEFINER) writes this.

-- Enable Realtime for chat (safe to re-run — skips if already added).
-- Database → Replication in the dashboard does the same thing as a toggle.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table chat_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'bp_gifts'
  ) then
    alter publication supabase_realtime add table bp_gifts;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'community_claims'
  ) then
    alter publication supabase_realtime add table community_claims;
  end if;
end $$;
