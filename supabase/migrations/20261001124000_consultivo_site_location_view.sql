-- Read-optimized latest visible position for the main TechNET Vendas site.
-- SECURITY INVOKER intentionally preserves tv_consultivo_positions RLS:
-- admin sees all visible rows; supervisor sees only the current team.

create or replace function public.tv_consultivo_latest_visible_positions()
returns table (
  user_id uuid,
  team_id uuid,
  device_id uuid,
  recorded_at timestamptz,
  latitude double precision,
  longitude double precision,
  accuracy real,
  speed real,
  heading real,
  battery_level numeric,
  activity_type text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select distinct on (p.user_id)
    p.user_id,
    p.team_id,
    p.device_id,
    p.recorded_at,
    p.latitude,
    p.longitude,
    p.accuracy,
    p.speed,
    p.heading,
    p.battery_level,
    p.activity_type
  from public.tv_consultivo_positions p
  order by p.user_id, p.recorded_at desc;
$$;

revoke all on function public.tv_consultivo_latest_visible_positions() from public;
revoke all on function public.tv_consultivo_latest_visible_positions() from anon;
grant execute on function public.tv_consultivo_latest_visible_positions() to authenticated;

comment on function public.tv_consultivo_latest_visible_positions() is
  'Última posição visível por usuário, respeitando RLS do rastreamento Consultivo.';
