-- Dashboard performance v104.1.
-- Region-wide filters are resolved by Imperium base key, avoiding repeated
-- city comparisons for every row while preserving city-level filtering.

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

    when 'rdt' then lower(btrim(coalesce(p_sale_base,''))) in ('fortaleza','recife')
    when 'vna' then lower(btrim(coalesce(p_sale_base,''))) in ('natal','mossoro')

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
