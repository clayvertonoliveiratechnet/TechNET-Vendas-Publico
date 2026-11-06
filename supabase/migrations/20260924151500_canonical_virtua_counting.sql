-- Canonical Virtua counting v114
-- One installed/pending sale identified as Virtua/Fibra/Banda Larga counts as one Virtua.
-- All dashboards, team goals and supervisor Team Pulse use tv_is_virtua_product as the single source of truth.

create or replace function public.tv_team_goal_dashboard(
  p_month integer default null,
  p_year integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_role text := public.tv_current_role();
  v_month integer := coalesce(p_month,extract(month from (now() at time zone 'America/Fortaleza'))::int);
  v_year integer := coalesce(p_year,extract(year from (now() at time zone 'America/Fortaleza'))::int);
  v_start date;
  v_next date;
  v_supervisor_team uuid;
  v_rows jsonb;
begin
  if v_role not in ('admin','backoffice','supervisor') then raise exception 'role not allowed'; end if;
  if v_month not between 1 and 12 or v_year not between 2020 and 2100 then raise exception 'invalid period'; end if;
  v_start:=make_date(v_year,v_month,1);
  v_next:=(v_start+interval '1 month')::date;

  if v_role='supervisor' then
    select coalesce(p.team_id,
      (select t.id from public.tv_teams t
       where t.active=true
         and public.tv_canonical_commercial_team(t.name)=public.tv_canonical_commercial_team(p.full_name)
       order by t.name limit 1))
      into v_supervisor_team
    from public.tv_profiles p
    where p.user_id=auth.uid() and p.active
    limit 1;
  end if;

  with visible_teams as (
    select t.id,t.name
    from public.tv_teams t
    where t.active=true
      and (v_role in ('admin','backoffice') or t.id=v_supervisor_team)
  ), sales_scope as (
    select s.id,
      public.tv_canonical_commercial_team(coalesce(nullif(btrim(s.imperium_team_name),''),t.name,'')) team_name,
      coalesce(s.total_value,0)::numeric revenue,
      s.real_product_summary,
      s.product_summary,
      s.product_group_summary
    from public.tv_sales s
    left join public.tv_teams t on t.id=s.team_id
    where coalesce(s.sold_at,s.created_at)>=v_start::timestamp at time zone 'America/Fortaleza'
      and coalesce(s.sold_at,s.created_at)<v_next::timestamp at time zone 'America/Fortaleza'
      and (s.status='synced' or upper(coalesce(s.imperium_status,''))='INSTALADA')
  ), sales_metrics as (
    select team_name,count(*)::int installed_sales,coalesce(sum(revenue),0)::numeric installed_revenue
    from sales_scope group by team_name
  ), virtua_metrics as (
    select sc.team_name,
      count(*) filter(
        where public.tv_is_virtua_product(
          sc.real_product_summary,
          sc.product_summary,
          sc.product_group_summary
        )
      )::int installed_virtua
    from sales_scope sc
    group by sc.team_name
  ), rows as (
    select vt.id team_id,vt.name team_name,
      coalesce(g.virtua_target,0)::int virtua_target,
      coalesce(g.revenue_target,0)::numeric revenue_target,
      coalesce(vm.installed_virtua,0)::int installed_virtua,
      coalesce(sm.installed_revenue,0)::numeric installed_revenue,
      coalesce(sm.installed_sales,0)::int installed_sales,
      greatest(coalesce(g.virtua_target,0)-coalesce(vm.installed_virtua,0),0)::int virtua_remaining,
      greatest(coalesce(g.revenue_target,0)-coalesce(sm.installed_revenue,0),0)::numeric revenue_remaining,
      case when coalesce(g.virtua_target,0)>0 then round(100*coalesce(vm.installed_virtua,0)::numeric/g.virtua_target,1) else 0 end virtua_pct,
      case when coalesce(g.revenue_target,0)>0 then round(100*coalesce(sm.installed_revenue,0)::numeric/g.revenue_target,1) else 0 end revenue_pct,
      g.updated_at
    from visible_teams vt
    left join public.tv_team_goals g on g.team_id=vt.id and g.year=v_year and g.month=v_month
    left join sales_metrics sm on sm.team_name=public.tv_canonical_commercial_team(vt.name)
    left join virtua_metrics vm on vm.team_name=public.tv_canonical_commercial_team(vt.name)
    order by vt.name
  )
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into v_rows from rows r;

  return jsonb_build_object(
    'role',v_role,
    'editable',v_role='admin',
    'period',jsonb_build_object('year',v_year,'month',v_month,'start',v_start,'end',v_next-1),
    'teams',v_rows
  );
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
      coalesce(nullif(btrim(s.imperium_consultant_name),''),nullif(btrim(p.full_name),''),'Sem consultor') as consultant,
      coalesce(s.total_value,0)::numeric as revenue,
      case when public.tv_is_virtua_product(
        s.real_product_summary,
        s.product_summary,
        s.product_group_summary
      ) then 1 else 0 end as virtua
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
      coalesce(sum(greatest(coalesce(sp.quantity,1),1)) filter (
        where upper(trim(coalesce(sp.product_group,''))) in ('TELEFONIA MÓVEL','TELEFONIA MOVEL','DEPENDENTE MÓVEL','DEPENDENTE MOVEL')
      ),0)::int as mobile,
      coalesce(sum(greatest(coalesce(sp.quantity,1),1)) filter (
        where upper(trim(coalesce(sp.product_group,'')))='TV'
      ),0)::int as tv,
      coalesce(sum(greatest(coalesce(sp.quantity,1),1)) filter (
        where upper(trim(coalesce(sp.product_group,''))) in ('TELEFONIA FIXA','TELEFONE FIXO','FONE')
           or upper(coalesce(sp.product_name,'')) like '%FONE%'
      ),0)::int as phone
    from scoped_sales ss
    left join public.tv_sale_products sp on sp.sale_id=ss.id
    group by ss.id,ss.consultant,ss.revenue,ss.virtua
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
as $function$
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
  v_team_filter text := nullif(public.tv_canonical_commercial_team(public.tv_dashboard_effective_team_filter(p_team_name)),'');
  v_result jsonb;
begin
  if public.tv_current_role() not in ('admin','supervisor') then raise exception 'dashboard access required'; end if;
  p_team_name := public.tv_dashboard_effective_team_filter(p_team_name);
  if v_month not between 1 and 12 or v_year not between 2020 and 2100 then raise exception 'invalid period'; end if;

  v_month_start:=make_date(v_year,v_month,1);
  v_month_next:=(v_month_start+interval '1 month')::date;
  v_last_day:=extract(day from (v_month_next-1))::int;
  v_from:=greatest(1,least(coalesce(p_day_from,1),v_last_day));
  v_to:=greatest(v_from,least(coalesce(p_day_to,v_last_day),v_last_day));
  v_start:=make_date(v_year,v_month,v_from);
  v_next:=make_date(v_year,v_month,v_to)+1;

  with scoped as (
    select
      s.id,
      s.sale_type,
      s.real_product_summary,
      s.product_summary,
      s.product_group_summary,
      public.tv_dashboard_effective_revenue(
        s.total_value,
        s.real_product_summary,
        s.imperium_raw->>'TipoValor'
      ) as effective_revenue,
      case
        when upper(btrim(coalesce(s.imperium_status,'')))='INSTALADA' then 'installed'
        when public.tv_is_pending_installation(s.status,s.imperium_status) then 'pending'
        else null
      end as bucket,
      upper(coalesce(s.real_product_summary,'')) as product_text,
      upper(coalesce(s.product_group_summary,'')) as group_text
    from public.tv_sales s
    left join public.tv_teams t on t.id=s.team_id
    where coalesce(s.sold_at,s.created_at)>=v_start::timestamp at time zone 'America/Fortaleza'
      and coalesce(s.sold_at,s.created_at)<v_next::timestamp at time zone 'America/Fortaleza'
      and public.tv_commercial_scope_filter_match(v_base,s.imperium_base_key,s.city_name)
      and (v_type='ALL' or upper(coalesce(s.sale_type,s.product_summary,''))=v_type)
      and public.tv_team_filter_match(p_team_name, public.tv_canonical_commercial_team(coalesce(nullif(btrim(s.imperium_team_name),''),t.name,'')))
  ), classified as (
    select *,
      public.tv_is_virtua_product(
        real_product_summary,
        product_summary,
        product_group_summary
      ) as has_virtua,
      (
        nullif(btrim(coalesce(sale_type,'')),'') is not null
        and (
          product_text like '%TV BOX%'
          or group_text='TV'
          or group_text like 'TV + %'
          or group_text like '% + TV'
          or group_text like '% + TV + %'
        )
      ) as has_tv,
      (
        nullif(btrim(coalesce(sale_type,'')),'') is not null
        and (
          product_text like '%CHIP%'
          or exists(
            select 1
            from public.tv_sale_products sp
            where sp.sale_id=scoped.id
              and upper(coalesce(sp.product_name,'')) like '%CHIP%'
          )
        )
      ) as has_chip
    from scoped
  ), metrics as (
    select b.bucket,
      count(*) filter(where c.has_virtua)::int as virtua,
      count(*) filter(where c.has_tv)::int as tv,
      count(*) filter(where c.has_chip)::int as chip,
      coalesce(sum(c.effective_revenue),0)::numeric as revenue,
      count(c.id)::int as sales
    from (values ('installed'::text),('pending'::text)) b(bucket)
    left join classified c on c.bucket=b.bucket
    group by b.bucket
  )
  select jsonb_build_object(
    'installed',(select to_jsonb(m)-'bucket' from metrics m where bucket='installed'),
    'pending',(select to_jsonb(m)-'bucket' from metrics m where bucket='pending'),
    'total',jsonb_build_object(
      'virtua',(select coalesce(sum(virtua),0) from metrics),
      'tv',(select coalesce(sum(tv),0) from metrics),
      'chip',(select coalesce(sum(chip),0) from metrics),
      'revenue',(select coalesce(sum(revenue),0) from metrics),
      'sales',(select coalesce(sum(sales),0) from metrics)
    ),
    'all',jsonb_build_object(
      'virtua',(select count(*) filter(where has_virtua)::int from classified),
      'tv',(select count(*) filter(where has_tv)::int from classified),
      'chip',(select count(*) filter(where has_chip)::int from classified),
      'revenue',(select coalesce(sum(effective_revenue),0)::numeric from classified),
      'sales',(select count(*)::int from classified)
    ),
    'period',jsonb_build_object('start',v_start,'end',v_next-1),
    'source','canonical_virtua_and_imperium_real_products'
  ) into v_result;

  return v_result;
end
$function$;

revoke all on function public.tv_team_goal_dashboard(integer,integer) from public;
grant execute on function public.tv_team_goal_dashboard(integer,integer) to authenticated;

revoke all on function public.tv_supervisor_team_pulse(text,text,integer,integer,integer,integer) from public;
revoke all on function public.tv_supervisor_team_pulse(text,text,integer,integer,integer,integer) from anon;
grant execute on function public.tv_supervisor_team_pulse(text,text,integer,integer,integer,integer) to authenticated;

revoke all on function public.tv_admin_installation_product_summary(text,text,integer,integer,integer,integer,text) from public;
revoke all on function public.tv_admin_installation_product_summary(text,text,integer,integer,integer,integer,text) from anon;
grant execute on function public.tv_admin_installation_product_summary(text,text,integer,integer,integer,integer,text) to authenticated;
