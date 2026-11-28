-- Forged52 backend schema (Supabase / Postgres)
-- Users sign in anonymously by default; they can attach an email later to sync across devices.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  route text not null default 'topical' check (route in ('topical','chrono')),
  start_date date not null default current_date,
  done int[] not null default '{}',
  missions int[] not null default '{}',     -- weeks whose family mission is done
  journal jsonb not null default '{}',      -- {"196": "Where I saw God..."}  (private)
  tz text not null default 'America/Detroit',
  updated_at timestamptz not null default now()
);

create table if not exists public.crews (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.crew_members (
  crew_id uuid not null references public.crews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);

create table if not exists public.nudges (
  id bigint generated always as identity primary key,
  crew_id uuid not null references public.crews(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  hour int not null default 6 check (hour between 0 and 23),
  tz text not null default 'America/Detroit',
  last_sent date,
  created_at timestamptz not null default now()
);

create table if not exists public.words (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null default '',
  audio_url text,
  video_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.nudges enable row level security;
alter table public.push_subs enable row level security;
alter table public.words enable row level security;

-- helper: is the caller in this crew?
create or replace function public.in_crew(c uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from crew_members where crew_id = c and user_id = auth.uid()) $$;

-- profiles: own row; crewmates can read names
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "crewmate names" on public.profiles;
create policy "crewmate names" on public.profiles for select using (
  exists (select 1 from crew_members a join crew_members b on a.crew_id = b.crew_id
          where a.user_id = auth.uid() and b.user_id = profiles.id));

-- progress: only your own row (crew status goes through crew_status())
drop policy if exists "own progress" on public.progress;
create policy "own progress" on public.progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- crews: members can read; anyone signed in can create one they own
drop policy if exists "read my crews" on public.crews;
create policy "read my crews" on public.crews for select using (public.in_crew(id) or owner = auth.uid());
drop policy if exists "create crew" on public.crews;
create policy "create crew" on public.crews for insert with check (owner = auth.uid());
drop policy if exists "owner edits crew" on public.crews;
create policy "owner edits crew" on public.crews for update using (owner = auth.uid());

-- crew_members: see members of your crews; leave yourself (joining goes through join_crew())
drop policy if exists "see crewmates" on public.crew_members;
create policy "see crewmates" on public.crew_members for select using (public.in_crew(crew_id));
drop policy if exists "leave crew" on public.crew_members;
create policy "leave crew" on public.crew_members for delete using (user_id = auth.uid());

-- nudges: send to crewmates, read your own
drop policy if exists "send nudge" on public.nudges;
create policy "send nudge" on public.nudges for insert with check (from_user = auth.uid() and public.in_crew(crew_id));
drop policy if exists "read my nudges" on public.nudges;
create policy "read my nudges" on public.nudges for select using (to_user = auth.uid() or from_user = auth.uid());

-- push subscriptions: your own
drop policy if exists "own push" on public.push_subs;
create policy "own push" on public.push_subs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- words: everyone can read; writes only through the post-word function (service role)
drop policy if exists "read words" on public.words;
create policy "read words" on public.words for select using (true);

-- create a crew with a short invite code and join it
create or replace function public.create_crew(crew_name text) returns json
language plpgsql security definer set search_path = public as $$
declare c crews; new_code text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  loop
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 31), 1), '') into new_code
      from (select extensions.gen_random_bytes(6) as b) r, generate_series(0, 5) i;
    exit when not exists (select 1 from crews where code = new_code);
  end loop;
  insert into crews(code, name, owner) values (new_code, left(coalesce(nullif(trim(crew_name),''),'My crew'),40), auth.uid()) returning * into c;
  insert into crew_members(crew_id, user_id) values (c.id, auth.uid());
  return json_build_object('id', c.id, 'code', c.code, 'name', c.name);
end $$;

create or replace function public.join_crew(invite text) returns json
language plpgsql security definer set search_path = public as $$
declare c crews;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into c from crews where code = upper(trim(invite));
  if c.id is null then raise exception 'No crew found with that code'; end if;
  if (select count(*) from crew_members where crew_id = c.id) >= 12 then raise exception 'That crew is full (12 max)'; end if;
  insert into crew_members(crew_id, user_id) values (c.id, auth.uid()) on conflict do nothing;
  return json_build_object('id', c.id, 'code', c.code, 'name', c.name);
end $$;

-- crew status: for each member, name, today's day number, read today?, streak, total read
create or replace function public.crew_status(c uuid) returns table(user_id uuid, name text, day int, read_today boolean, streak int, total int, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.in_crew(c) then raise exception 'not in crew'; end if;
  return query
  with base as (
    select m.user_id as uid, coalesce(nullif(p.name,''),'Brother') as nm, coalesce(pr.done,'{}'::int[]) as dn,
           greatest(1, least(364, ((now() at time zone coalesce(pr.tz,'America/Detroit'))::date - coalesce(pr.start_date, current_date)) + 1))::int as d
    from crew_members m left join profiles p on p.id = m.user_id left join progress pr on pr.user_id = m.user_id
    where m.crew_id = c
  ), x as (
    select *, (d = any(dn)) as rt, case when d = any(dn) then d else d - 1 end as e from base
  )
  select uid, nm, d, rt,
         greatest(0, e - coalesce((select max(t) from generate_series(1, greatest(e,1)) t where not (t = any(dn))), 0))::int,
         coalesce(cardinality(dn),0), uid = auth.uid()
  from x order by rt desc, nm;
end $$;

grant execute on function public.create_crew(text), public.join_crew(text), public.crew_status(uuid), public.in_crew(uuid) to authenticated;

-- one-time codes for moving your account to another device
create table if not exists public.transfer_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.transfer_codes enable row level security;  -- no policies: only server functions touch it

-- once-a-day limit on nudges
create unique index if not exists nudges_once_a_day on public.nudges (from_user, to_user, ((created_at at time zone 'UTC')::date));

-- public bucket for the weekly word audio
insert into storage.buckets (id, name, public) values ('words', 'words', true) on conflict (id) do nothing;

create extension if not exists pg_cron;
create extension if not exists pg_net;
