create or replace function public.tv_admin_installation_product_summary(
  p_base text default null,
  p_sale_type text default null,
  p_month integer default null,
  p_year integer default null,
  p_day_from integer default 1,
  p_day_to integer default 31,
  p_team_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_month int := coalesce(p_month,extract(month from (now() at time zone 'America/Fortaleza'))::int);
  v_year int := coalesce(p_year,extract(year from (now() at time zone 'America/Fortaleza'))::int);
  v_month_start date;
  v_month_next date;
  v_last_day int;
  v_from int;
  v_to int;
  v_start date;
  v_next date;
  v_base text := coalesce(nullif(lower(trim(p_base)),''),'all');
  v_type text := coalesce(nullif(upper(trim(p_sale_type)),''),'ALL');
  v_team_filter text := nullif(public.tv_canonical_commercial_team(p_team_name),'');
  v_result jsonb;
begin
  if public.tv_current_role()<>'admin' then raise exception 'admin required'; end if;
  if v_month not between 1 and 12 or v_year not between 2020 and 2100 then raise exception 'invalid period'; end if;
  v_month_start:=make_date(v_year,v_month,1);
  v_month_next:=(v_month_start+interval '1 month')::date;
  v_last_day:=extract(day from (v_month_next-1))::int;
  v_from:=greatest(1,least(coalesce(p_day_from,1),v_last_day));
  v_to:=greatest(v_from,least(coalesce(p_day_to,v_last_day),v_last_day));
  v_start:=make_date(v_year,v_month,v_from);
  v_next:=make_date(v_year,v_month,v_to)+1;

  with scoped as (
    select s.id,s.total_value,
      case
        when s.status='synced' or upper(coalesce(s.imperium_status,''))='INSTALADA' then 'installed'
        when s.status='sync_pending' or upper(coalesce(s.imperium_status,'')) in ('PENDENTE INSTALAÇÃO','PENDENTE INSTALACAO') then 'pending'
        else null
      end bucket
    from public.tv_sales s
    left join public.tv_teams t on t.id=s.team_id
    where coalesce(s.sold_at,s.created_at)>=v_start::timestamp at time zone 'America/Fortaleza'
      and coalesce(s.sold_at,s.created_at)<v_next::timestamp at time zone 'America/Fortaleza'
      and (v_base='all' or lower(coalesce(s.imperium_base_key,''))=v_base)
      and (v_type='ALL' or upper(coalesce(s.sale_type,s.product_summary,''))=v_type)
      and (v_team_filter is null or public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,''))=v_team_filter)
  ),
  product_counts as (
    select sc.bucket,
      coalesce(sum(case when upper(trim(coalesce(sp.product_group,'')))='BANDA LARGA' then greatest(coalesce(sp.quantity,1),1) else 0 end),0)::int virtua,
      coalesce(sum(case when upper(trim(coalesce(sp.product_group,'')))='TV' then greatest(coalesce(sp.quantity,1),1) else 0 end),0)::int tv,
      coalesce(sum(case when upper(trim(coalesce(sp.product_group,''))) in ('TELEFONIA MÓVEL','TELEFONIA MOVEL','DEPENDENTE MÓVEL','DEPENDENTE MOVEL') then greatest(coalesce(sp.quantity,1),1) else 0 end),0)::int chip
    from scoped sc
    left join public.tv_sale_products sp on sp.sale_id=sc.id
    where sc.bucket is not null
    group by sc.bucket
  ),
  revenue as (
    select bucket,count(*)::int sales,coalesce(sum(total_value),0)::numeric revenue
    from scoped where bucket is not null group by bucket
  ),
  metrics as (
    select b.bucket,
      coalesce(pc.virtua,0) virtua,
      coalesce(pc.tv,0) tv,
      coalesce(pc.chip,0) chip,
      coalesce(r.revenue,0) revenue,
      coalesce(r.sales,0) sales
    from (values ('installed'::text),('pending'::text)) b(bucket)
    left join product_counts pc on pc.bucket=b.bucket
    left join revenue r on r.bucket=b.bucket
  )
  select jsonb_build_object(
    'installed',(select to_jsonb(m) - 'bucket' from metrics m where bucket='installed'),
    'pending',(select to_jsonb(m) - 'bucket' from metrics m where bucket='pending'),
    'total',jsonb_build_object(
      'virtua',(select sum(virtua) from metrics),
      'tv',(select sum(tv) from metrics),
      'chip',(select sum(chip) from metrics),
      'revenue',(select sum(revenue) from metrics),
      'sales',(select sum(sales) from metrics)
    ),
    'period',jsonb_build_object('start',v_start,'end',v_next-1)
  ) into v_result;

  return v_result;
end
$$;

revoke all on function public.tv_admin_installation_product_summary(text,text,integer,integer,integer,integer,text) from public;
grant execute on function public.tv_admin_installation_product_summary(text,text,integer,integer,integer,integer,text) to authenticated;
