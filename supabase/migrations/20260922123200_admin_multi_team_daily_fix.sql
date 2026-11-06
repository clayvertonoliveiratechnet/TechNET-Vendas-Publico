-- Complements 20260922122500_admin_multi_team_filter.sql.
-- The dashboard daily series uses a LEFT JOIN guard and therefore has a
-- slightly different predicate than the other scoped queries.

do $migration$
declare
  fn oid;
  ddl text;
  needle constant text :=
    '(s.id is null or v_team_filter is null or public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,''''))=v_team_filter)';
  replacement constant text :=
    '(s.id is null or public.tv_team_filter_match(p_team_name, public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,''''))))';
begin
  select p.oid
    into fn
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'tv_admin_dashboard_scope'
  limit 1;

  if fn is null then
    raise exception 'tv_admin_dashboard_scope not found';
  end if;

  ddl := pg_get_functiondef(fn);
  if position(needle in ddl) = 0 then
    raise exception 'Expected daily team filter predicate not found';
  end if;

  ddl := replace(ddl, needle, replacement);
  execute ddl;
end
$migration$;
