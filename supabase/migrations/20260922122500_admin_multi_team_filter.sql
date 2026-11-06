-- Multi-team/supervisor dashboard filter.
-- Keeps the existing RPC signatures compatible: p_team_name now accepts
-- either one team name or a pipe-delimited list (TEAM A|TEAM B).

create or replace function public.tv_team_filter_match(
  p_filter text,
  p_team text
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $function$
  select case
    when nullif(btrim(p_filter),'') is null then true
    else exists (
      select 1
      from unnest(string_to_array(p_filter,'|')) as value
      where nullif(btrim(value),'') is not null
        and public.tv_canonical_commercial_team(btrim(value))
          = public.tv_canonical_commercial_team(p_team)
    )
  end
$function$;

do $migration$
declare
  r record;
  ddl text;
  needle constant text :=
    '(v_team_filter is null or public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,''''))=v_team_filter)';
  replacement constant text :=
    'public.tv_team_filter_match(p_team_name, public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,'''')))';
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'tv_admin_dashboard_scope',
        'tv_admin_supervisor_ranking_scope',
        'tv_real_product_metrics_scope',
        'tv_admin_installation_product_summary'
      )
  loop
    ddl := pg_get_functiondef(r.oid);
    if position(needle in ddl) = 0 then
      raise exception 'Expected team filter predicate not found in %', r.proname;
    end if;
    ddl := replace(ddl, needle, replacement);
    execute ddl;
  end loop;
end
$migration$;
