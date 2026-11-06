-- Dashboard scopes v103: global TODOS and all commercial cities mapped in Imperium.

create or replace function public.tv_commercial_city_key(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  select trim(both '-' from regexp_replace(
    translate(
      lower(btrim(coalesce(p_value,''))),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    '[^a-z0-9]+','-','g'
  ))
$function$;

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
      public.tv_commercial_city_key(p_filter) as filter_key,
      public.tv_commercial_city_key(p_sale_base) as sale_base,
      public.tv_commercial_city_key(p_city_name) as city_key
  )
  select case
    when filter_key in ('','all','todos') then true
    when filter_key='rdt' then
      sale_base in ('fortaleza','recife')
      or city_key in ('fortaleza','aquiraz','caucaia','eusebio','maracanau','recife','camaragibe','jaboatao-dos-guararapes','olinda','paulista')
    when filter_key='vna' then
      sale_base in ('natal','mossoro')
      or city_key in ('natal','natal-parnamirim','parnamirim','extremoz','macaiba','ceara-mirim','sao-goncalo-do-amarante','mossoro')
    when filter_key='natal' then city_key in ('natal','natal-parnamirim') or (sale_base='natal' and city_key='')
    when filter_key='parnamirim' then city_key='parnamirim'
    when filter_key='fortaleza' then city_key='fortaleza' or (sale_base='fortaleza' and city_key='')
    when filter_key='recife' then city_key='recife' or (sale_base='recife' and city_key='')
    when filter_key='mossoro' then city_key='mossoro' or (sale_base='mossoro' and city_key='')
    else city_key=filter_key
  end
  from normalized
$function$;

do $migration$
declare
  fn oid;
  ddl text;
  old_goal constant text := 'g.base_key=case when v_base=''all'' then null when v_base in (''rdt'',''fortaleza'',''recife'') then ''fortaleza'' when v_base in (''vna'',''natal'',''mossoro'',''parnamirim'') then ''natal'' else v_base end';
  new_goal constant text := 'g.base_key=case when v_base=''all'' then null when v_base in (''rdt'',''fortaleza'',''aquiraz'',''caucaia'',''eusebio'',''maracanau'',''recife'',''camaragibe'',''jaboatao-dos-guararapes'',''olinda'',''paulista'') then ''fortaleza'' when v_base in (''vna'',''natal'',''parnamirim'',''extremoz'',''macaiba'',''ceara-mirim'',''sao-goncalo-do-amarante'',''mossoro'') then ''natal'' else v_base end';
begin
  select p.oid into fn
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='tv_admin_dashboard_scope'
  limit 1;

  if fn is null then raise exception 'tv_admin_dashboard_scope not found'; end if;
  ddl:=pg_get_functiondef(fn);
  if position(old_goal in ddl)=0 then raise exception 'goal scope anchor not found'; end if;
  ddl:=replace(ddl,old_goal,new_goal);
  execute ddl;
end
$migration$;
