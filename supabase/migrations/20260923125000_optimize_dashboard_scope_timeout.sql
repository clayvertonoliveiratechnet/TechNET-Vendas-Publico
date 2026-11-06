-- Dashboard performance v104.
-- Removes the expensive per-row regexp normalization introduced in v103 and
-- makes day filters index-friendly so the API does not hit statement_timeout.

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
  select case lower(btrim(coalesce(p_filter,'')))
    when '' then true
    when 'all' then true
    when 'todos' then true

    when 'rdt' then
      lower(btrim(coalesce(p_sale_base,''))) in ('fortaleza','recife')
      or lower(btrim(coalesce(p_city_name,''))) in (
        'fortaleza','aquiraz','caucaia','eusébio','eusebio','maracanaú','maracanau',
        'recife','camaragibe','jaboatão dos guararapes','jaboatao dos guararapes','olinda','paulista'
      )

    when 'vna' then
      lower(btrim(coalesce(p_sale_base,''))) in ('natal','mossoro')
      or lower(btrim(coalesce(p_city_name,''))) in (
        'natal','natal / parnamirim','parnamirim','extremoz','macaíba','macaiba',
        'ceará-mirim','ceara-mirim','são gonçalo do amarante','sao goncalo do amarante',
        'mossoró','mossoro'
      )

    when 'fortaleza' then
      lower(btrim(coalesce(p_city_name,'')))='fortaleza'
      or (lower(btrim(coalesce(p_sale_base,'')))='fortaleza' and btrim(coalesce(p_city_name,''))='')
    when 'aquiraz' then lower(btrim(coalesce(p_city_name,'')))='aquiraz'
    when 'caucaia' then lower(btrim(coalesce(p_city_name,'')))='caucaia'
    when 'eusebio' then lower(btrim(coalesce(p_city_name,''))) in ('eusébio','eusebio')
    when 'maracanau' then lower(btrim(coalesce(p_city_name,''))) in ('maracanaú','maracanau')

    when 'recife' then
      lower(btrim(coalesce(p_city_name,'')))='recife'
      or (lower(btrim(coalesce(p_sale_base,'')))='recife' and btrim(coalesce(p_city_name,''))='')
    when 'camaragibe' then lower(btrim(coalesce(p_city_name,'')))='camaragibe'
    when 'jaboatao-dos-guararapes' then lower(btrim(coalesce(p_city_name,''))) in ('jaboatão dos guararapes','jaboatao dos guararapes')
    when 'olinda' then lower(btrim(coalesce(p_city_name,'')))='olinda'
    when 'paulista' then lower(btrim(coalesce(p_city_name,'')))='paulista'

    when 'natal' then
      lower(btrim(coalesce(p_city_name,''))) in ('natal','natal / parnamirim')
      or (lower(btrim(coalesce(p_sale_base,'')))='natal' and btrim(coalesce(p_city_name,''))='')
    when 'parnamirim' then lower(btrim(coalesce(p_city_name,'')))='parnamirim'
    when 'extremoz' then lower(btrim(coalesce(p_city_name,'')))='extremoz'
    when 'macaiba' then lower(btrim(coalesce(p_city_name,''))) in ('macaíba','macaiba')
    when 'ceara-mirim' then lower(btrim(coalesce(p_city_name,''))) in ('ceará-mirim','ceara-mirim')
    when 'sao-goncalo-do-amarante' then lower(btrim(coalesce(p_city_name,''))) in ('são gonçalo do amarante','sao goncalo do amarante')
    when 'mossoro' then
      lower(btrim(coalesce(p_city_name,''))) in ('mossoró','mossoro')
      or (lower(btrim(coalesce(p_sale_base,'')))='mossoro' and btrim(coalesce(p_city_name,''))='')

    else false
  end
$function$;

do $migration$
declare
  ddl text;
  old_daily text;
  new_daily text;
  old_day text;
  new_day text;
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

  old_daily := '(coalesce(s.sold_at,s.created_at) at time zone ''America/Fortaleza'')::date=d::date';
  new_daily := 'coalesce(s.sold_at,s.created_at)>=(d::date::timestamp at time zone ''America/Fortaleza'') and coalesce(s.sold_at,s.created_at)<(((d::date+1)::timestamp) at time zone ''America/Fortaleza'')';

  if position(old_daily in ddl)=0 then
    raise exception 'daily date anchor not found';
  end if;

  ddl := replace(ddl,old_daily,new_daily);

  old_day := '(coalesce(s.sold_at,s.created_at) at time zone ''America/Fortaleza'')::date=v_day';
  new_day := 'coalesce(s.sold_at,s.created_at)>=(v_day::timestamp at time zone ''America/Fortaleza'') and coalesce(s.sold_at,s.created_at)<(((v_day+1)::timestamp) at time zone ''America/Fortaleza'')';

  if position(old_day in ddl)=0 then
    raise exception 'single-day date anchor not found';
  end if;

  ddl := replace(ddl,old_day,new_day);

  execute ddl;
end
$migration$;
