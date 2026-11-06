-- Dashboard performance v105.
-- Rewrites daily series as lateral index range scans to keep the complete dashboard
-- comfortably below the authenticated 8s statement timeout.

do $migration$
declare
  ddl text;
  p_daily int;
  p_virtua int;
  p_after int;
  new_daily text;
  new_virtua text;
begin
  select pg_get_functiondef(p.oid) into ddl
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='tv_admin_dashboard_scope'
  limit 1;

  if ddl is null then raise exception 'tv_admin_dashboard_scope not found'; end if;

  p_daily := position('  select coalesce(jsonb_agg(to_jsonb(x) order by x.sale_day),''[]''::jsonb) into v_daily from (' in ddl);
  p_virtua := position('  select coalesce(jsonb_agg(to_jsonb(x) order by x.sale_day),''[]''::jsonb) into v_daily_virtua from (' in ddl);
  p_after := position('  select coalesce(jsonb_agg(to_jsonb(x) order by x.installed desc,x.generated desc),''[]''::jsonb) into v_consult from (' in ddl);

  if p_daily=0 or p_virtua=0 or p_after=0 or not (p_daily<p_virtua and p_virtua<p_after) then
    raise exception 'daily block anchors not found';
  end if;

  new_daily := $sql$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sale_day),'[]'::jsonb) into v_daily from (
    select d::date sale_day,
      coalesce(m.generated,0)::int generated,
      coalesce(m.installed,0)::int installed,
      coalesce(m.cancelled,0)::int cancelled
    from generate_series(v_start,v_next-1,'1 day') d
    left join lateral (
      select count(s.id)::int generated,
        count(s.id) filter(where s.status='synced' or upper(coalesce(s.imperium_status,''))='INSTALADA')::int installed,
        count(s.id) filter(where s.status='cancelled' or upper(coalesce(s.imperium_status,'')) in ('CANCELADA','NÃO UTILIZAR','NAO UTILIZAR'))::int cancelled
      from public.tv_sales s
      left join public.tv_teams t on t.id=s.team_id
      where coalesce(s.sold_at,s.created_at)>=(d::date::timestamp at time zone 'America/Fortaleza')
        and coalesce(s.sold_at,s.created_at)<(((d::date+1)::timestamp) at time zone 'America/Fortaleza')
        and public.tv_commercial_scope_filter_match(v_base,s.imperium_base_key,s.city_name)
        and (v_type='ALL' or upper(coalesce(s.sale_type,s.product_summary,''))=v_type)
        and (v_team_filters is null or public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,''))=any(v_team_filters))
    ) m on true
  ) x;

$sql$;

  new_virtua := $sql$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sale_day),'[]'::jsonb) into v_daily_virtua from (
    select d::date sale_day,
      coalesce(m.generated,0)::int generated,
      coalesce(m.installed,0)::int installed,
      coalesce(m.pending,0)::int pending
    from generate_series(v_start,v_next-1,'1 day') d
    left join lateral (
      select count(s.id)::int generated,
        count(s.id) filter(where s.status='synced' or upper(coalesce(s.imperium_status,''))='INSTALADA')::int installed,
        count(s.id) filter(where public.tv_is_pending_installation(s.status,s.imperium_status))::int pending
      from public.tv_sales s
      left join public.tv_teams t on t.id=s.team_id
      where coalesce(s.sold_at,s.created_at)>=(d::date::timestamp at time zone 'America/Fortaleza')
        and coalesce(s.sold_at,s.created_at)<(((d::date+1)::timestamp) at time zone 'America/Fortaleza')
        and public.tv_commercial_scope_filter_match(v_base,s.imperium_base_key,s.city_name)
        and (v_type='ALL' or upper(coalesce(s.sale_type,s.product_summary,''))=v_type)
        and public.tv_is_virtua_product(s.real_product_summary,s.product_summary,s.product_group_summary)
        and upper(coalesce(s.imperium_team_name,'')) not like '%MDU%'
        and upper(coalesce(s.imperium_consultant_name,s.commercial_seller_name,'')) not like 'MDU - %'
        and (v_team_filters is null or public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,''))=any(v_team_filters))
        and upper(coalesce(t.name,s.imperium_team_name,'')) not like '%MDU%'
    ) m on true
  ) x;

$sql$;

  ddl := substr(ddl,1,p_daily-1) || new_daily || new_virtua || substr(ddl,p_after);
  execute ddl;
end
$migration$;
