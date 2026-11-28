-- FORGED redesign: additive migration. Nothing is dropped or rewritten; existing rows keep working.

-- Private per-user app data (journal entries, highlights, notes, memory progress, preferences).
alter table public.progress add column if not exists data jsonb not null default '{}';

-- What a man shares with his crew (default: share whether he read today; never journals or prayers)
alter table public.profiles add column if not exists share_checkins boolean not null default true;

-- Crew details and meetings
alter table public.crews add column if not exists description text not null default '';
alter table public.crews add column if not exists meeting_day int check (meeting_day between 0 and 6);
alter table public.crews add column if not exists meeting_time text;     -- "19:00" in the leader's time zone
alter table public.crews add column if not exists meeting_tz text;

-- Crew posts: discussion, encouragement, testimony, announcement (announcements: leader only)
create table if not exists public.crew_posts (
  id bigint generated always as identity primary key,
  crew_id uuid not null references public.crews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'discussion' check (kind in ('discussion','encourage','testimony','announcement')),
  week int,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists crew_posts_crew on public.crew_posts (crew_id, created_at desc);
alter table public.crew_posts enable row level security;
drop policy if exists "crew reads posts" on public.crew_posts;
create policy "crew reads posts" on public.crew_posts for select using (public.in_crew(crew_id));
drop policy if exists "member posts" on public.crew_posts;
create policy "member posts" on public.crew_posts for insert with check (
  user_id = auth.uid() and public.in_crew(crew_id)
  and (kind <> 'announcement' or exists (select 1 from public.crews c where c.id = crew_id and c.owner = auth.uid())));
drop policy if exists "author or leader deletes post" on public.crew_posts;
create policy "author or leader deletes post" on public.crew_posts for delete using (
  user_id = auth.uid() or exists (select 1 from public.crews c where c.id = crew_id and c.owner = auth.uid()));

-- Prayer requests a man chooses to share with his crew (private prayers stay on his device / private data)
create table if not exists public.prayer_requests (
  id bigint generated always as identity primary key,
  crew_id uuid not null references public.crews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  answered boolean not null default false,
  answer_note text,
  prayed_count int not null default 0,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists prayer_requests_crew on public.prayer_requests (crew_id, created_at desc);
alter table public.prayer_requests enable row level security;
drop policy if exists "crew reads prayers" on public.prayer_requests;
create policy "crew reads prayers" on public.prayer_requests for select using (public.in_crew(crew_id));
drop policy if exists "member shares prayer" on public.prayer_requests;
create policy "member shares prayer" on public.prayer_requests for insert with check (user_id = auth.uid() and public.in_crew(crew_id));
drop policy if exists "author updates prayer" on public.prayer_requests;
create policy "author updates prayer" on public.prayer_requests for update using (user_id = auth.uid());
drop policy if exists "author or leader deletes prayer" on public.prayer_requests;
create policy "author or leader deletes prayer" on public.prayer_requests for delete using (
  user_id = auth.uid() or exists (select 1 from public.crews c where c.id = crew_id and c.owner = auth.uid()));

-- "I prayed" counter that any crew member can bump without editing the request
create or replace function public.pray_for(req bigint) returns int
language plpgsql security definer set search_path = public as $$
declare n int; c uuid;
begin
  select crew_id into c from prayer_requests where id = req;
  if c is null or not public.in_crew(c) then raise exception 'not in crew'; end if;
  update prayer_requests set prayed_count = prayed_count + 1 where id = req returning prayed_count into n;
  return n;
end $$;

-- Leader removes a member (cannot remove himself; use leave instead)
create or replace function public.remove_member(c uuid, member uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from crews where id = c and owner = auth.uid()) then raise exception 'Only the crew leader can remove members'; end if;
  if member = auth.uid() then raise exception 'Leaders leave by handing off or deleting the crew'; end if;
  delete from crew_members where crew_id = c and user_id = member;
end $$;

-- Leader deletes the whole crew
drop policy if exists "owner deletes crew" on public.crews;
create policy "owner deletes crew" on public.crews for delete using (owner = auth.uid());

-- Crew status respects each man's sharing choice. No streaks or rankings are exposed.
drop function if exists public.crew_status(uuid);
create or replace function public.crew_status(c uuid) returns table(user_id uuid, name text, shares boolean, read_today boolean, week_days int, is_me boolean, is_leader boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.in_crew(c) then raise exception 'not in crew'; end if;
  return query
  with base as (
    select m.user_id as uid, coalesce(nullif(p.name,''),'Brother') as nm, coalesce(p.share_checkins, true) as sh,
           coalesce(pr.done,'{}'::int[]) as dn,
           greatest(1, least(364, ((now() at time zone coalesce(pr.tz,'America/Detroit'))::date - coalesce(pr.start_date, current_date)) + 1))::int as d
    from crew_members m left join profiles p on p.id = m.user_id left join progress pr on pr.user_id = m.user_id
    where m.crew_id = c
  )
  select b.uid, b.nm, b.sh,
         case when b.sh or b.uid = auth.uid() then (b.d = any(b.dn)) else null end,
         case when b.sh or b.uid = auth.uid() then (select count(*)::int from unnest(b.dn) x where x between ((b.d - 1) / 7) * 7 + 1 and ((b.d - 1) / 7) * 7 + 7) else null end,
         b.uid = auth.uid(),
         exists (select 1 from crews cc where cc.id = c and cc.owner = b.uid)
  from base b order by b.nm;
end $$;

-- Notification preferences per device subscription
alter table public.push_subs add column if not exists prefs jsonb not null default '{"reading":true,"memory":true,"prayer":false,"mission":true,"encourage":true,"meeting":true,"discussion":true,"prayers":true}';
alter table public.push_subs add column if not exists last_weekly date;

grant execute on function public.pray_for(bigint), public.remove_member(uuid, uuid), public.crew_status(uuid) to authenticated;
