-- Daily dashboard series v98: expose only Virtua/Banda Larga production for the daily-average card.

do $migration$
declare
  fn oid;
  ddl text;
  declaration_old text;
  declaration_new text;
  daily_anchor text;
  daily_virtua_sql text;
  return_old text;
  return_new text;
begin
  select p.oid into fn
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='tv_admin_dashboard_scope'
  limit 1;

  if fn is null then raise exception 'tv_admin_dashboard_scope not found'; end if;
  ddl:=pg_get_functiondef(fn);

  declaration_old:='v_daily jsonb:=''[]''; v_consult jsonb:=''[]''; v_consult_virtua jsonb:=''[]'';';
  declaration_new:='v_daily jsonb:=''[]''; v_daily_virtua jsonb:=''[]''; v_consult jsonb:=''[]''; v_consult_virtua jsonb:=''[]'';';
  if position(declaration_old in ddl)=0 then raise exception 'daily declaration anchor not found'; end if;
  ddl:=replace(ddl,declaration_old,declaration_new);

  daily_anchor:='  select coalesce(jsonb_agg(to_jsonb(x) order by x.installed desc,x.generated desc),''[]''::jsonb) into v_consult from (';

  daily_virtua_sql:=
'  select coalesce(jsonb_agg(to_jsonb(x) order by x.sale_day),''[]''::jsonb) into v_daily_virtua from ('||chr(10)||
'    select d::date sale_day,count(s.id)::int generated,'||chr(10)||
'      count(s.id) filter(where s.status=''synced'' or upper(coalesce(s.imperium_status,''''))=''INSTALADA'')::int installed,'||chr(10)||
'      count(s.id) filter(where public.tv_is_pending_installation(s.status,s.imperium_status))::int pending'||chr(10)||
'    from generate_series(v_start,v_next-1,''1 day'') d'||chr(10)||
'    left join public.tv_sales s on (coalesce(s.sold_at,s.created_at) at time zone ''America/Fortaleza'')::date=d::date'||chr(10)||
'      and public.tv_commercial_base_filter_match(v_base,s.imperium_base_key)'||chr(10)||
'      and (v_type=''ALL'' or upper(coalesce(s.sale_type,s.product_summary,''''))=v_type)'||chr(10)||
'      and public.tv_is_virtua_product(s.real_product_summary,s.product_summary,s.product_group_summary)'||chr(10)||
'      and upper(coalesce(s.imperium_team_name,'''')) not like ''%MDU%'''||chr(10)||
'      and upper(coalesce(s.imperium_consultant_name,s.commercial_seller_name,'''')) not like ''MDU - %'''||chr(10)||
'    left join public.tv_teams t on t.id=s.team_id'||chr(10)||
'    where (s.id is null or ('||chr(10)||
'      public.tv_team_filter_match(p_team_name, public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,'''')))'||chr(10)||
'      and upper(coalesce(t.name,s.imperium_team_name,'''')) not like ''%MDU%'''||chr(10)||
'    ))'||chr(10)||
'    group by d'||chr(10)||
'  ) x;'||chr(10)||chr(10);

  if position(daily_anchor in ddl)=0 then raise exception 'daily series insertion anchor not found'; end if;
  ddl:=replace(ddl,daily_anchor,daily_virtua_sql||daily_anchor);

  return_old:='''daily'',v_daily,''consultants'',v_consult,''consultants_virtua'',v_consult_virtua';
  return_new:='''daily'',v_daily,''daily_virtua'',v_daily_virtua,''consultants'',v_consult,''consultants_virtua'',v_consult_virtua';
  if position(return_old in ddl)=0 then raise exception 'return daily anchor not found'; end if;
  ddl:=replace(ddl,return_old,return_new);

  execute ddl;
end
$migration$;
