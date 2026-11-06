-- Repair missing supervisor -> team links using the canonical commercial team name.
-- This keeps Team, Map and RLS-backed reads aligned with the scoped dashboard.

with unique_matches as (
  select p.user_id, t.id as team_id
  from public.tv_profiles p
  join public.tv_teams t
    on public.tv_canonical_commercial_team(t.name)
       = public.tv_canonical_commercial_team(p.full_name)
  where p.role='supervisor'
    and p.active=true
    and p.team_id is null
    and not exists (
      select 1
      from public.tv_teams t2
      where t2.id<>t.id
        and public.tv_canonical_commercial_team(t2.name)
            = public.tv_canonical_commercial_team(p.full_name)
    )
)
update public.tv_profiles p
set team_id=m.team_id,
    updated_at=now()
from unique_matches m
where p.user_id=m.user_id
  and p.team_id is null;
