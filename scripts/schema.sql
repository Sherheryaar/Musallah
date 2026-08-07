-- Supabase schema for the Masjid Locator app. Run this ONCE in the SQL
-- editor of a fresh Supabase project, then seed with scripts/seed-places.sql.
--
-- SECURITY MODEL (load-bearing — do not skip):
-- The anon key ships inside the app bundle by design, so anyone can extract
-- it. Row Level Security is the only thing standing between that key and
-- the data. The policies below allow exactly two things and nothing else:
--   1. anyone may READ places
--   2. anyone may INSERT into submissions (never read/update/delete them)

create table if not exists public.places (
  id            text primary key,
  name          text not null check (char_length(name) between 1 and 200),
  type          text not null check (type in ('masjid', 'musalla', 'multi_faith_room')),
  address       text not null default '',
  lat           double precision not null check (lat between -90 and 90),
  lng           double precision not null check (lng between -180 and 180),
  facilities    jsonb not null default '{}'::jsonb,
  jumuah_only   boolean not null default false,
  jumuah_times  jsonb,
  jamaat        jsonb,
  notes         text,
  last_verified text,
  source        text,
  phone         text,
  website       text,
  facebook      text,
  instagram     text,
  confidence    text check (confidence in ('verified', 'community', 'unverified'))
);

create table if not exists public.submissions (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind       text not null check (kind in ('edit', 'new_place')),
  place_id   text,
  -- Length cap mirrors MAX_MESSAGE_LENGTH in src/lib/feedback.ts: the anon
  -- key is public, so the database must reject unbounded payloads itself.
  message    text not null check (char_length(message) between 1 and 2000)
);

alter table public.places enable row level security;
alter table public.submissions enable row level security;

-- Public read on places (and nothing else: no insert/update/delete policy
-- exists, so RLS denies those by default).
create policy "public read places"
  on public.places for select
  to anon, authenticated
  using (true);

-- Insert-only on submissions. Deliberately NO select policy: submitted
-- suggestions may contain contact details and must not be publicly readable.
create policy "public insert submissions"
  on public.submissions for insert
  to anon, authenticated
  with check (true);

-- Abuse guard: the anon key ships in the app bundle by design, so the
-- insert-only policy above has no limit on its own for how many rows one
-- caller can write with it. Per-caller (e.g. per-IP) throttling needs
-- infrastructure a plain RLS policy doesn't have access to, but a global
-- rate cap needs nothing extra and is enough to stop a naive flood script
-- from filling the table. security definer is required: RLS gives this
-- role no SELECT on submissions (by design, above), so the count would
-- otherwise always read zero rows.
create or replace function public.limit_submission_rate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (
    select count(*) from public.submissions
    where created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'Too many submissions right now — please try again in a minute.';
  end if;
  return new;
end;
$$;

drop trigger if exists submissions_rate_limit on public.submissions;
create trigger submissions_rate_limit
  before insert on public.submissions
  for each row execute function public.limit_submission_rate();

-- Live updates in the app (PlacesContext subscribes to postgres_changes)
-- require the table in the realtime publication. Errors harmlessly if the
-- table was already added.
alter publication supabase_realtime add table public.places;
