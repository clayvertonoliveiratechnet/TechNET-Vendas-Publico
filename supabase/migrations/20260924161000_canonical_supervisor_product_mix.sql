-- Canonical supervisor product mix v117
-- Align MULTI/TV/FONE with the official Imperium installed-product report.
-- MULTI means CHIP products (not generic "COMBO MOVEL").
-- Product mix counts only rows whose Imperium status is INSTALADA.

create or replace function public.tv_count_commercial_product(
  p_products text,
  p_kind text
)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $function$
  with parts as (
    select upper(btrim(x)) as item
    from regexp_split_to_table(coalesce(p_products,''), E'\\s*\\|\\s*') x
    where btrim(x)<>''
  )
  select count(*)::int
  from parts
  where case upper(coalesce(p_kind,''))
    when 'MULTI' then item like '%CHIP%'
    when 'MOBILE' then item like '%CHIP%'
    when 'TV' then item like '%TV BOX%'
    when 'FONE' then item like '%FONE%' or item like '%TELEFONE%'
    when 'PHONE' then item like '%FONE%' or item like '%TELEFONE%'
    else false
  end
$function$;

create or replace function public.tv_supervisor_team_pulse(
  p_base text default null,
  p_sale_type text default null,
  p_month integer default null,
  p_year integer default null,
  p_day_from integer default 1,
  p_day_to integer default 31
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text := public.tv_current_role();
  v_month integer := coalesce(p_month,extract(month from (now() at time zone 'America/Fortaleza'))::int);
  v_year integer := coalesce(p_year,extract(year from (now() at time zone 'America/Fortaleza'))::int);
  v_base text := coalesce(nullif(lower(btrim(p_base)),''),'all');
  v_type text := coalesce(nullif(upper(btrim(p_sale_type)),''),'ALL');
  v_month_start date;
  v_month_next date;
  v_last_day integer;
  v_from integer;
  v_to integer;
  v_start date;
  v_period_end date;
  v_next date;
  v_today date := (now() at time zone 'America/Fortaleza')::date;
  v_elapsed_end date;
  v_work_elapsed integer := 0;
  v_work_total integer := 0;
  v_work_remaining integer := 0;
  v_supervisor_name text;
  v_team_id uuid;
  v_team_name text;
  v_virtua_target integer := 0;
  v_revenue_target numeric := 0;
  v_installed_sales integer := 0;
  v_virtua integer := 0;
  v_mobile integer := 0;
  v_tv integer := 0;
  v_phone integer := 0;
  v_revenue numeric := 0;
  v_consultants jsonb := '[]'::jsonb;
begin
  if v_role<>'supervisor' then raise exception 'supervisor required'; end if;
  if v_month not between 1 and 12 or v_year not between 2020 and 2100 then raise exception 'invalid period'; end if;

  v_month_start:=make_date(v_year,v_month,1);
  v_month_next:=(v_month_start+interval '1 month')::date;
  v_last_day:=extract(day from (v_month_next-1))::int;
  v_from:=greatest(1,least(coalesce(p_day_from,1),v_last_day));
  v_to:=greatest(v_from,least(coalesce(p_day_to,v_last_day),v_last_day));
  v_start:=make_date(v_year,v_month,v_from);
  v_period_end:=make_date(v_year,v_month,v_to);
  v_next:=v_period_end+1;
  v_elapsed_end:=least(v_period_end,v_today);

  select p.full_name,
         coalesce(
           p.team_id,
           (select t.id
              from public.tv_teams t
             where t.active=true
               and public.tv_canonical_commercial_team(t.name)=public.tv_canonical_commercial_team(p.full_name)
             order by t.name
             limit 1)
         )
    into v_supervisor_name,v_team_id
    from public.tv_profiles p
   where p.user_id=auth.uid()
     and p.active=true
     and p.role='supervisor'
   limit 1;

  if v_supervisor_name is null then raise exception 'supervisor profile not found'; end if;

  select coalesce(t.name,v_supervisor_name)
    into v_team_name
    from (select 1) seed
    left join public.tv_teams t on t.id=v_team_id;

  select coalesce(g.virtua_target,0),coalesce(g.revenue_target,0)
    into v_virtua_target,v_revenue_target
    from public.tv_team_goals g
   where g.team_id=v_team_id
     and g.year=v_year
     and g.month=v_month
   limit 1;

  if not found then
    v_virtua_target:=0;
    v_revenue_target:=0;
  end if;

  select count(*)::int
    into v_work_total
    from generate_series(v_month_start,v_month_next-1,interval '1 day') d
   where extract(dow from d)::int<>0;

  if v_elapsed_end>=v_start then
    select count(*)::int
      into v_work_elapsed
      from generate_series(v_start,v_elapsed_end,interval '1 day') d
     where extract(dow from d)::int<>0;
  end if;

  if v_elapsed_end<v_month_next-1 then
    select count(*)::int
      into v_work_remaining
      from generate_series(greatest(v_elapsed_end+1,v_month_start),v_month_next-1,interval '1 day') d
     where extract(dow from d)::int<>0;
  end if;

  with scoped_sales as (
    select
      s.id,
      public.tv_commercial_consultant_name(
        s.imperium_consultant_name,
        s.commercial_seller_name,
        p.full_name
      ) as consultant,
      coalesce(s.total_value,0)::numeric as revenue,
      case when public.tv_is_virtua_product(
        s.real_product_summary,
        s.product_summary,
        s.product_group_summary
      ) then 1 else 0 end as virtua,
      upper(btrim(coalesce(s.imperium_status,'')))='INSTALADA' as imperium_installed,
      coalesce(
        nullif(btrim(s.real_product_summary),''),
        nullif(btrim(s.imperium_raw->>'Produtos'),''),
        ''
      ) as products_text
    from public.tv_sales s
    left join public.tv_profiles p on p.user_id=s.consultant_id
    where coalesce(s.sold_at,s.created_at)>=v_start::timestamp at time zone 'America/Fortaleza'
      and coalesce(s.sold_at,s.created_at)<v_next::timestamp at time zone 'America/Fortaleza'
      and (s.status='synced' or upper(coalesce(s.imperium_status,''))='INSTALADA')
      and public.tv_supervisor_sale_in_scope(s.supervisor_id,s.team_id,s.imperium_team_name)
      and public.tv_commercial_scope_filter_match(v_base,s.imperium_base_key,s.city_name)
      and (v_type='ALL' or upper(coalesce(s.sale_type,s.product_summary,''))=v_type)
  ),
  product_by_sale as (
    select
      ss.id,
      ss.consultant,
      ss.revenue,
      ss.virtua,
      case when ss.imperium_installed then
        case when btrim(ss.products_text)<>'' then public.tv_count_commercial_product(ss.products_text,'MULTI')
        else coalesce((
          select sum(greatest(coalesce(sp.quantity,1),1))::int
          from public.tv_sale_products sp
          where sp.sale_id=ss.id
            and upper(coalesce(sp.product_name,'')) like '%CHIP%'
        ),0) end
      else 0 end as mobile,
      case when ss.imperium_installed then
        case when btrim(ss.products_text)<>'' then public.tv_count_commercial_product(ss.products_text,'TV')
        else coalesce((
          select sum(greatest(coalesce(sp.quantity,1),1))::int
          from public.tv_sale_products sp
          where sp.sale_id=ss.id
            and (
              upper(coalesce(sp.product_name,'')) like '%TV BOX%'
              or upper(trim(coalesce(sp.product_group,'')))='TV'
            )
        ),0) end
      else 0 end as tv,
      case when ss.imperium_installed then
        case when btrim(ss.products_text)<>'' then public.tv_count_commercial_product(ss.products_text,'FONE')
        else coalesce((
          select sum(greatest(coalesce(sp.quantity,1),1))::int
          from public.tv_sale_products sp
          where sp.sale_id=ss.id
            and (
              upper(coalesce(sp.product_name,'')) like '%FONE%'
              or upper(coalesce(sp.product_name,'')) like '%TELEFONE%'
              or upper(trim(coalesce(sp.product_group,''))) in ('TELEFONIA FIXA','TELEFONE FIXO','FONE','TELEFONE')
            )
        ),0) end
      else 0 end as phone
    from scoped_sales ss
  ),
  consultant_metrics as (
    select
      consultant,
      count(*)::int as installed_sales,
      coalesce(sum(virtua),0)::int as virtua,
      coalesce(sum(mobile),0)::int as mobile,
      coalesce(sum(tv),0)::int as tv,
      coalesce(sum(phone),0)::int as phone,
      round(coalesce(sum(revenue),0)::numeric,2) as revenue
    from product_by_sale
    group by consultant
  )
  select
    coalesce(sum(installed_sales),0)::int,
    coalesce(sum(virtua),0)::int,
    coalesce(sum(mobile),0)::int,
    coalesce(sum(tv),0)::int,
    coalesce(sum(phone),0)::int,
    round(coalesce(sum(revenue),0)::numeric,2),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'consultant',consultant,
          'installed_sales',installed_sales,
          'virtua',virtua,
          'mobile',mobile,
          'tv',tv,
          'phone',phone,
          'revenue',revenue,
          'daily_virtua',case when v_work_elapsed>0 then round(virtua::numeric/v_work_elapsed,1) else 0 end,
          'trend_virtua',case when v_work_elapsed>0 then round(virtua::numeric/v_work_elapsed*v_work_total,1) else 0 end
        )
        order by virtua desc,revenue desc,consultant
      ),
      '[]'::jsonb
    )
    into v_installed_sales,v_virtua,v_mobile,v_tv,v_phone,v_revenue,v_consultants
    from consultant_metrics;

  return jsonb_build_object(
    'team',jsonb_build_object(
      'supervisor_name',v_supervisor_name,
      'team_id',v_team_id,
      'team_name',coalesce(v_team_name,v_supervisor_name)
    ),
    'period',jsonb_build_object(
      'year',v_year,
      'month',v_month,
      'day_from',v_from,
      'day_to',v_to,
      'start',v_start,
      'end',v_period_end,
      'workdays_elapsed',v_work_elapsed,
      'workdays_total',v_work_total,
      'workdays_remaining',v_work_remaining
    ),
    'goal',jsonb_build_object(
      'virtua_target',v_virtua_target,
      'revenue_target',v_revenue_target
    ),
    'summary',jsonb_build_object(
      'installed_sales',v_installed_sales,
      'virtua',v_virtua,
      'mobile',v_mobile,
      'tv',v_tv,
      'phone',v_phone,
      'revenue',v_revenue,
      'virtua_remaining',greatest(v_virtua_target-v_virtua,0),
      'revenue_remaining',greatest(v_revenue_target-v_revenue,0),
      'virtua_need_day',case when v_work_remaining>0 then round(greatest(v_virtua_target-v_virtua,0)::numeric/v_work_remaining,1) else 0 end,
      'revenue_need_day',case when v_work_remaining>0 then round(greatest(v_revenue_target-v_revenue,0)::numeric/v_work_remaining,2) else 0 end,
      'daily_virtua',case when v_work_elapsed>0 then round(v_virtua::numeric/v_work_elapsed,1) else 0 end,
      'trend_virtua',case when v_work_elapsed>0 then round(v_virtua::numeric/v_work_elapsed*v_work_total,1) else 0 end
    ),
    'consultants',v_consultants
  );
end
$function$;

revoke all on function public.tv_count_commercial_product(text,text) from public;
grant execute on function public.tv_count_commercial_product(text,text) to authenticated;

revoke all on function public.tv_supervisor_team_pulse(text,text,integer,integer,integer,integer) from public;
revoke all on function public.tv_supervisor_team_pulse(text,text,integer,integer,integer,integer) from anon;
grant execute on function public.tv_supervisor_team_pulse(text,text,integer,integer,integer,integer) to authenticated;
