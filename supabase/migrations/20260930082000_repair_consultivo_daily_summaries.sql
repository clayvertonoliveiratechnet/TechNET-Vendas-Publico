-- Repair production drift for CONSULTIVO daily tracking summaries.
create table if not exists public.tv_consultivo_daily_summaries (
  day date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.tv_teams(id) on delete set null,
  distance_meters numeric(14,2) not null default 0 check (distance_meters >= 0),
  movement_seconds integer not null default 0 check (movement_seconds >= 0),
  stopped_seconds integer not null default 0 check (stopped_seconds >= 0),
  first_position_at timestamptz,
  last_position_at timestamptz,
  position_count integer not null default 0 check (position_count >= 0),
  gps_quality text,
  computed_at timestamptz not null default now(),
  primary key (day, user_id)
);

create index if not exists idx_consultivo_summaries_team_day
  on public.tv_consultivo_daily_summaries(team_id, day desc);

alter table public.tv_consultivo_daily_summaries enable row level security;

drop policy if exists consultivo_summaries_read on public.tv_consultivo_daily_summaries;
create policy consultivo_summaries_read on public.tv_consultivo_daily_summaries
for select to authenticated
using (
  user_id=auth.uid()
  or public.tv_current_role()='admin'
  or (
    public.tv_current_role()='supervisor'
    and team_id=public.tv_current_team()
  )
);

revoke insert, update, delete on public.tv_consultivo_daily_summaries from authenticated;
grant select on public.tv_consultivo_daily_summaries to authenticated;
