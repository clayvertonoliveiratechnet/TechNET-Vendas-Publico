-- Supervisor dashboard isolation v108.
-- Prevent auxiliary team_cards from exposing other supervisors and report the effective scope.

do $migration$
declare
  fn oid;
  ddl text;
  old_scope text;
  new_scope text;
  old_cards text;
  new_cards text;
begin
  select p.oid into fn
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='tv_admin_dashboard_scope'
  limit 1;

  if fn is null then
    raise exception 'tv_admin_dashboard_scope not found';
  end if;

  ddl := pg_get_functiondef(fn);

  old_scope := '  p_team_name := public.tv_dashboard_effective_team_filter(p_team_name);';
  new_scope := old_scope || chr(10) ||
               '  v_team_filter := nullif(btrim(p_team_name),'''');';

  if position(new_scope in ddl)=0 then
    if position(old_scope in ddl)=0 then
      raise exception 'effective supervisor scope anchor not found';
    end if;
    ddl := replace(ddl,old_scope,new_scope);
  end if;

  old_cards :=
    '      and (v_type=''ALL'' or upper(coalesce(s.sale_type,s.product_summary,''''))=v_type)' || chr(10) ||
    '      and public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,''''))=any(array[''MEIRE KALIANE'',''ALDACELIA BARBOSA'',''ANDREZA DE ARAUJO'',''MARLLON BORGES'',''ROBSON SILVA'',''ROMILDO DA SILVA''])';

  new_cards :=
    '      and (v_type=''ALL'' or upper(coalesce(s.sale_type,s.product_summary,''''))=v_type)' || chr(10) ||
    '      and (v_team_filters is null or public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,''''))=any(v_team_filters))' || chr(10) ||
    '      and public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,''''))=any(array[''MEIRE KALIANE'',''ALDACELIA BARBOSA'',''ANDREZA DE ARAUJO'',''MARLLON BORGES'',''ROBSON SILVA'',''ROMILDO DA SILVA''])';

  if position(new_cards in ddl)=0 then
    if position(old_cards in ddl)=0 then
      raise exception 'team cards supervisor scope anchor not found';
    end if;
    ddl := replace(ddl,old_cards,new_cards);
  end if;

  execute ddl;
end
$migration$;
