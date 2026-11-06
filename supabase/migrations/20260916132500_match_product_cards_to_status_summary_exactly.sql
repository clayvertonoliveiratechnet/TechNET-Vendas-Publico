-- Ajuste final: exclui registros legados sem tipo de venda das métricas de produto,
-- usando exatamente o mesmo critério do painel Produção por status.
create or replace function public.tv_real_product_metrics_scope(
  p_base text default null,
  p_month integer default null,
  p_year integer default null,
  p_sale_type text default null,
  p_day_from integer default 1,
  p_day_to integer default 31,
  p_team_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_now date:=(now() at time zone 'America/Fortaleza')::date;
  v_month int:=coalesce(p_month,extract(month from v_now)::int);
  v_year int:=coalesce(p_year,extract(year from v_now)::int);
  v_month_start date:=make_date(v_year,v_month,1);
  v_month_next date;
  v_start date;
  v_next date;
  v_last_day int;
  v_from int;
  v_to int;
  v_base text:=coalesce(nullif(lower(trim(p_base)),''),'all');
  v_type text:=coalesce(nullif(upper(trim(p_sale_type)),''),'ALL');
  v_team_filter text:=nullif(public.tv_canonical_commercial_team(p_team_name),'');
  v_total numeric:=0;
  v_sales bigint:=0;
  v_items bigint:=0;
  v_groups jsonb:='[]'::jsonb;
  v_products jsonb:='[]'::jsonb;
begin
  if public.tv_current_role()<>'admin' then raise exception 'admin required'; end if;
  v_month_next:=(v_month_start+interval '1 month')::date;
  v_last_day:=extract(day from (v_month_next-1))::int;
  v_from:=greatest(1,least(coalesce(p_day_from,1),v_last_day));
  v_to:=greatest(v_from,least(coalesce(p_day_to,v_last_day),v_last_day));
  v_start:=make_date(v_year,v_month,v_from);
  v_next:=make_date(v_year,v_month,v_to)+1;

  with scoped as (
    select s.id,s.sale_type,s.real_product_summary,s.total_value,s.imperium_raw->>'TipoValor' tipo_valor
    from public.tv_sales s
    left join public.tv_teams t on t.id=s.team_id
    where coalesce(s.sold_at,s.created_at)>=v_start::timestamp at time zone 'America/Fortaleza'
      and coalesce(s.sold_at,s.created_at)<v_next::timestamp at time zone 'America/Fortaleza'
      and (v_base='all' or lower(coalesce(s.imperium_base_key,''))=v_base)
      and (v_type='ALL' or upper(coalesce(s.sale_type,s.product_summary,''))=v_type)
      and (v_team_filter is null or public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,''))=v_team_filter)
      and upper(btrim(coalesce(s.imperium_status,''))) in ('INSTALADA','PENDENTE INSTALAÇÃO','PENDENTE INSTALACAO')
  ), itemized as (
    select sc.id,btrim(part) product_name,
      case
        when upper(part) like '%VIRTUA%' or upper(part) like '%FIBRA%' then 'BANDA LARGA'
        when upper(part) like '%CHIP CONT%' or upper(part) like '%COMBO MOVEL%' or upper(part) like '%COMBO MÓVEL%' then 'TELEFONIA MÓVEL'
        when upper(part) like '%TV BOX%' then 'TV'
        when upper(part) like '%CANAIS OPCIONAIS%' or upper(part) like '%TELECINE%' or upper(part) like '%HBO%' then 'TV CANAIS OPCIONAIS'
        when upper(part) like '%FONE%' or upper(part) like '%TELEFONE%' then 'TELEFONE'
        else 'OUTROS'
      end product_group,
      coalesce(nullif(replace(replace((regexp_match(part,'R\$\s*([0-9.]+(?:,[0-9]{1,2})?)','i'))[1],'.',''),',','.'),'')::numeric,0) item_value
    from scoped sc
    cross join lateral regexp_split_to_table(coalesce(sc.real_product_summary,''),'\s+\|\s+(?!R\$)') part
    where btrim(part)<>'' and nullif(btrim(coalesce(sc.sale_type,'')),'') is not null
  )
  select coalesce(sum(public.tv_dashboard_effective_revenue(sc.total_value,sc.real_product_summary,sc.tipo_valor)),0),
         count(*) filter(where public.tv_dashboard_effective_revenue(sc.total_value,sc.real_product_summary,sc.tipo_valor)>0),
         coalesce((select count(*) from itemized),0)
  into v_total,v_sales,v_items
  from scoped sc;

  with scoped as (
    select s.id,s.sale_type,s.real_product_summary
    from public.tv_sales s left join public.tv_teams t on t.id=s.team_id
    where coalesce(s.sold_at,s.created_at)>=v_start::timestamp at time zone 'America/Fortaleza'
      and coalesce(s.sold_at,s.created_at)<v_next::timestamp at time zone 'America/Fortaleza'
      and (v_base='all' or lower(coalesce(s.imperium_base_key,''))=v_base)
      and (v_type='ALL' or upper(coalesce(s.sale_type,s.product_summary,''))=v_type)
      and (v_team_filter is null or public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,''))=v_team_filter)
      and upper(btrim(coalesce(s.imperium_status,''))) in ('INSTALADA','PENDENTE INSTALAÇÃO','PENDENTE INSTALACAO')
  ), itemized as (
    select sc.id,btrim(part) product_name,
      case
        when upper(part) like '%VIRTUA%' or upper(part) like '%FIBRA%' then 'BANDA LARGA'
        when upper(part) like '%CHIP CONT%' or upper(part) like '%COMBO MOVEL%' or upper(part) like '%COMBO MÓVEL%' then 'TELEFONIA MÓVEL'
        when upper(part) like '%TV BOX%' then 'TV'
        when upper(part) like '%CANAIS OPCIONAIS%' or upper(part) like '%TELECINE%' or upper(part) like '%HBO%' then 'TV CANAIS OPCIONAIS'
        when upper(part) like '%FONE%' or upper(part) like '%TELEFONE%' then 'TELEFONE'
        else 'OUTROS'
      end product_group,
      coalesce(nullif(replace(replace((regexp_match(part,'R\$\s*([0-9.]+(?:,[0-9]{1,2})?)','i'))[1],'.',''),',','.'),'')::numeric,0) item_value
    from scoped sc
    cross join lateral regexp_split_to_table(coalesce(sc.real_product_summary,''),'\s+\|\s+(?!R\$)') part
    where btrim(part)<>'' and nullif(btrim(coalesce(sc.sale_type,'')),'') is not null
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order,x.revenue desc),'[]'::jsonb)
  into v_groups
  from (
    select product_group,count(*)::int items,count(distinct id)::int sales,round(sum(item_value),2) revenue,
      case product_group when 'BANDA LARGA' then 1 when 'TELEFONIA MÓVEL' then 2 when 'TV' then 3 when 'TV CANAIS OPCIONAIS' then 4 when 'TELEFONE' then 5 else 9 end sort_order
    from itemized
    where product_group<>'OUTROS'
    group by product_group
  ) x;

  with scoped as (
    select s.id,s.sale_type,s.real_product_summary
    from public.tv_sales s left join public.tv_teams t on t.id=s.team_id
    where coalesce(s.sold_at,s.created_at)>=v_start::timestamp at time zone 'America/Fortaleza'
      and coalesce(s.sold_at,s.created_at)<v_next::timestamp at time zone 'America/Fortaleza'
      and (v_base='all' or lower(coalesce(s.imperium_base_key,''))=v_base)
      and (v_type='ALL' or upper(coalesce(s.sale_type,s.product_summary,''))=v_type)
      and (v_team_filter is null or public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,''))=v_team_filter)
      and upper(btrim(coalesce(s.imperium_status,''))) in ('INSTALADA','PENDENTE INSTALAÇÃO','PENDENTE INSTALACAO')
  ), itemized as (
    select sc.id,btrim(part) product_name,
      case
        when upper(part) like '%VIRTUA%' or upper(part) like '%FIBRA%' then 'BANDA LARGA'
        when upper(part) like '%CHIP CONT%' or upper(part) like '%COMBO MOVEL%' or upper(part) like '%COMBO MÓVEL%' then 'TELEFONIA MÓVEL'
        when upper(part) like '%TV BOX%' then 'TV'
        when upper(part) like '%CANAIS OPCIONAIS%' or upper(part) like '%TELECINE%' or upper(part) like '%HBO%' then 'TV CANAIS OPCIONAIS'
        when upper(part) like '%FONE%' or upper(part) like '%TELEFONE%' then 'TELEFONE'
        else 'OUTROS'
      end product_group,
      coalesce(nullif(replace(replace((regexp_match(part,'R\$\s*([0-9.]+(?:,[0-9]{1,2})?)','i'))[1],'.',''),',','.'),'')::numeric,0) item_value
    from scoped sc
    cross join lateral regexp_split_to_table(coalesce(sc.real_product_summary,''),'\s+\|\s+(?!R\$)') part
    where btrim(part)<>'' and nullif(btrim(coalesce(sc.sale_type,'')),'') is not null
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sales desc,x.revenue desc),'[]'::jsonb)
  into v_products
  from (
    select product_name,product_group,count(distinct id)::int sales,round(avg(item_value),2) avg_value,round(sum(item_value),2) revenue
    from itemized
    group by product_name,product_group
    order by count(distinct id) desc,sum(item_value) desc
    limit 20
  ) x;

  return jsonb_build_object('revenue',v_total,'sales_with_value',v_sales,'items',v_items,'avg_ticket',round(v_total/greatest(v_sales,1),2),'groups',v_groups,'products',v_products,'source','imperium_status_and_real_products');
end
$function$;

revoke all on function public.tv_real_product_metrics_scope(text,integer,integer,text,integer,integer,text) from public;
grant execute on function public.tv_real_product_metrics_scope(text,integer,integer,text,integer,integer,text) to authenticated;