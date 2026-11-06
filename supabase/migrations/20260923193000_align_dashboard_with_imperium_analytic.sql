-- Align dashboard installed-product totals with the Imperium analytic semantics.
-- CHIP means actual chip products only; COMBO MOVEL no longer increments CHIP.
-- Revenue keeps the official synced total_value and uses product prices only as fallback.

create or replace function public.tv_dashboard_effective_revenue(
  p_total numeric,
  p_summary text,
  p_tipo_valor text
)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $function$
  select round(
    case
      when coalesce(p_total,0)>0 then coalesce(p_total,0)
      when upper(coalesce(p_summary,'')) like '%MUDANÇA DE TECNOLOGIA%'
        or upper(coalesce(p_summary,'')) like '%MUDANCA DE TECNOLOGIA%' then
        coalesce((
          select replace(replace(m[1],'.',''),',','.')::numeric
          from regexp_matches(
            coalesce(p_summary,''),
            'R\\$\\s*([0-9.]+,[0-9]{1,2})',
            'g'
          ) m
          limit 1
        ),0)
      else
        coalesce((
          select sum(replace(replace(m[1],'.',''),',','.')::numeric)
          from regexp_matches(
            coalesce(p_summary,''),
            'R\\$\\s*([0-9.]+,[0-9]{1,2})',
            'g'
          ) m
        ),0)
    end
  ,2)
$function$;

do $migration$
declare
  ddl text;
  old_chip text;
  new_chip text;
begin
  select pg_get_functiondef(p.oid) into ddl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='tv_admin_installation_product_summary'
  limit 1;

  old_chip := $old$
          product_text like '%CHIP CONT%'
          or product_text like '%COMBO MOVEL%'
          or product_text like '%COMBO MÓVEL%'
          or exists(
            select 1
            from public.tv_sale_products sp
            where sp.sale_id=scoped.id
              and (
                upper(coalesce(sp.product_name,'')) like '%CHIP CONT%'
                or upper(coalesce(sp.product_name,'')) like '%COMBO MOVEL%'
                or upper(coalesce(sp.product_name,'')) like '%COMBO MÓVEL%'
              )
          )
$old$;

  new_chip := $new$
          product_text like '%CHIP%'
          or exists(
            select 1
            from public.tv_sale_products sp
            where sp.sale_id=scoped.id
              and upper(coalesce(sp.product_name,'')) like '%CHIP%'
          )
$new$;

  if position(old_chip in ddl)=0 then
    raise exception 'installation summary CHIP anchor not found';
  end if;
  ddl:=replace(ddl,old_chip,new_chip);
  execute ddl;

  select pg_get_functiondef(p.oid) into ddl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='tv_real_product_metrics_scope'
  limit 1;

  if position('when upper(part) like ''%CHIP CONT%'' or upper(part) like ''%COMBO MOVEL%'' or upper(part) like ''%COMBO MÓVEL%'' then ''TELEFONIA MÓVEL''' in ddl)=0 then
    raise exception 'real-product metrics CHIP anchor not found';
  end if;

  ddl:=replace(
    ddl,
    'when upper(part) like ''%CHIP CONT%'' or upper(part) like ''%COMBO MOVEL%'' or upper(part) like ''%COMBO MÓVEL%'' then ''TELEFONIA MÓVEL''',
    'when upper(part) like ''%CHIP%'' then ''TELEFONIA MÓVEL'''
  );
  execute ddl;
end
$migration$;
