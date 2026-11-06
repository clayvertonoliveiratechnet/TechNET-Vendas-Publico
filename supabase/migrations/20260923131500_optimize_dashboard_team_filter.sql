-- Dashboard performance v104.2.
-- Precompute the selected teams once per RPC instead of splitting/canonicalizing
-- the same filter for every sale row in every dashboard query.

do $migration$
declare
  ddl text;
  old_decl text;
  new_decl text;
  init_anchor text;
  init_sql text;
  old_match text;
  new_match text;
begin
  select pg_get_functiondef(p.oid) into ddl
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='tv_admin_dashboard_scope'
  limit 1;

  if ddl is null then
    raise exception 'tv_admin_dashboard_scope not found';
  end if;

  old_decl := 'v_team_filter text := nullif(public.tv_canonical_commercial_team(p_team_name),'''');';
  new_decl := 'v_team_filter text := nullif(btrim(p_team_name),''''); v_team_filters text[];';

  if position(old_decl in ddl)=0 then
    raise exception 'team declaration anchor not found';
  end if;
  ddl := replace(ddl,old_decl,new_decl);

  init_anchor := '  if v_month not between 1 and 12 or v_year not between 2020 and 2100 then raise exception ''invalid period''; end if;';
  init_sql := init_anchor || chr(10) ||
'  if nullif(btrim(p_team_name),'''') is not null then' || chr(10) ||
'    select array_agg(distinct public.tv_canonical_commercial_team(btrim(value))) into v_team_filters' || chr(10) ||
'    from unnest(string_to_array(p_team_name,''|'')) as value' || chr(10) ||
'    where nullif(btrim(value),'''') is not null;' || chr(10) ||
'  end if;';

  if position(init_anchor in ddl)=0 then
    raise exception 'team initialization anchor not found';
  end if;
  ddl := replace(ddl,init_anchor,init_sql);

  old_match := 'public.tv_team_filter_match(p_team_name, public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,'''')))';
  new_match := '(v_team_filters is null or public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,''''))=any(v_team_filters))';

  if position(old_match in ddl)=0 then
    raise exception 'team filter anchor not found';
  end if;
  ddl := replace(ddl,old_match,new_match);

  execute ddl;
end
$migration$;
