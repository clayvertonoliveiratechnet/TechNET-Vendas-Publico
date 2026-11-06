-- Dashboard region/city scopes v99.
-- RDT => Fortaleza + Recife.
-- VNA => Natal + Mossoro + Parnamirim.
-- Existing RPC signatures remain unchanged: p_base carries either the region token
-- (rdt/vna) or the selected city token.

create or replace function public.tv_commercial_scope_filter_match(
  p_filter text,
  p_sale_base text,
  p_city_name text
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $function$
  with normalized as (
    select
      lower(btrim(coalesce(p_filter,''))) as filter_key,
      lower(btrim(coalesce(p_sale_base,''))) as sale_base,
      translate(
        lower(btrim(coalesce(p_city_name,''))),
        'áàâãéêíóôõúç',
        'aaaaeeiooouc'
      ) as city_key
  )
  select case
    when filter_key in ('','all') then true
    when filter_key='rdt'
      then sale_base in ('fortaleza','recife') or city_key in ('fortaleza','recife')
    when filter_key='vna'
      then sale_base in ('natal','mossoro')
        or city_key in ('natal','mossoro','parnamirim','natal / parnamirim')
    when filter_key='fortaleza'
      then sale_base='fortaleza' or city_key='fortaleza'
    when filter_key='recife'
      then sale_base='recife' or city_key='recife'
    when filter_key='mossoro'
      then sale_base='mossoro' or city_key='mossoro'
    when filter_key='parnamirim'
      then city_key='parnamirim'
    when filter_key='natal'
      then city_key in ('natal','natal / parnamirim')
        or (sale_base='natal' and city_key='')
    else sale_base=filter_key
  end
  from normalized
$function$;

do $migration$
declare
  r record;
  ddl text;
  old_filter constant text := 'public.tv_commercial_base_filter_match(v_base,s.imperium_base_key)';
  new_filter constant text := 'public.tv_commercial_scope_filter_match(v_base,s.imperium_base_key,s.city_name)';
  old_goal constant text := 'g.base_key=case when v_base=''all'' then null else v_base end';
  new_goal constant text := 'g.base_key=case when v_base=''all'' then null when v_base in (''rdt'',''fortaleza'',''recife'') then ''fortaleza'' when v_base in (''vna'',''natal'',''mossoro'',''parnamirim'') then ''natal'' else v_base end';
begin
  for r in
    select p.oid,p.proname
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and p.proname in (
        'tv_admin_consultant_options_scope',
        'tv_admin_dashboard_scope',
        'tv_admin_installation_product_summary',
        'tv_admin_supervisor_ranking_scope',
        'tv_real_product_metrics_scope'
      )
  loop
    ddl:=pg_get_functiondef(r.oid);
    if position(old_filter in ddl)=0 then
      raise exception 'base filter anchor not found in %',r.proname;
    end if;
    ddl:=replace(ddl,old_filter,new_filter);

    if r.proname='tv_admin_dashboard_scope' and position(old_goal in ddl)>0 then
      ddl:=replace(ddl,old_goal,new_goal);
    end if;

    execute ddl;
  end loop;
end
$migration$;
