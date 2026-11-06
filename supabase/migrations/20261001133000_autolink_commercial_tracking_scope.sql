-- Keep commercial hierarchy, GPS ingestion and RLS team scope aligned.
-- Supervisors are linked to the canonical team with the same commercial name.
-- Consultants inherit the active supervisor of their assigned team when missing.

create or replace function public.tv_profiles_autolink_commercial_team()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team_id uuid;
  v_supervisor_id uuid;
begin
  if new.role='supervisor'
     and new.team_id is null
     and nullif(btrim(new.full_name),'') is not null then
    select t.id
      into v_team_id
    from public.tv_teams t
    where t.active=true
      and public.tv_canonical_commercial_team(t.name)
          = public.tv_canonical_commercial_team(new.full_name)
    order by t.created_at nulls last, t.id
    limit 1;

    if v_team_id is not null then
      new.team_id:=v_team_id;
    end if;
  end if;

  if new.role='consultant'
     and new.team_id is not null
     and new.supervisor_id is null then
    select p.user_id
      into v_supervisor_id
    from public.tv_profiles p
    where p.active=true
      and p.role='supervisor'
      and p.team_id=new.team_id
      and p.user_id<>new.user_id
    order by p.created_at nulls last, p.user_id
    limit 1;

    if v_supervisor_id is not null then
      new.supervisor_id:=v_supervisor_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tv_profiles_autolink_commercial_team on public.tv_profiles;
create trigger tv_profiles_autolink_commercial_team
before insert or update of full_name,role,team_id,supervisor_id
on public.tv_profiles
for each row
execute function public.tv_profiles_autolink_commercial_team();

with supervisor_team as (
  select p.user_id,t.id as team_id
  from public.tv_profiles p
  join public.tv_teams t
    on t.active=true
   and public.tv_canonical_commercial_team(t.name)
       = public.tv_canonical_commercial_team(p.full_name)
  where p.active=true
    and p.role='supervisor'
    and p.team_id is null
)
update public.tv_profiles p
set team_id=s.team_id,
    updated_at=now()
from supervisor_team s
where p.user_id=s.user_id
  and p.team_id is null;

update public.tv_profiles c
set supervisor_id=s.user_id,
    updated_at=now()
from public.tv_profiles s
where c.active=true
  and c.role='consultant'
  and c.team_id is not null
  and c.supervisor_id is null
  and s.active=true
  and s.role='supervisor'
  and s.team_id=c.team_id;

comment on function public.tv_profiles_autolink_commercial_team() is
  'Mantém supervisor/equipe e consultor/supervisor alinhados ao escopo comercial.';
