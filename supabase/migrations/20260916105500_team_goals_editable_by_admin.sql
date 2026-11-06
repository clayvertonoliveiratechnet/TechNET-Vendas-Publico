create table if not exists public.tv_team_goals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.tv_teams(id) on delete cascade,
  year integer not null check (year between 2020 and 2100),
  month integer not null check (month between 1 and 12),
  virtua_target integer not null default 0 check (virtua_target >= 0),
  revenue_target numeric(14,2) not null default 0 check (revenue_target >= 0),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id,year,month)
);

revoke all on table public.tv_team_goals from anon,authenticated;

create or replace function public.tv_admin_save_team_goal(
  p_team_id uuid,
  p_year integer,
  p_month integer,
  p_virtua_target integer,
  p_revenue_target numeric
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_goal public.tv_team_goals;
begin
  if public.tv_current_role()<>'admin' then raise exception 'admin required'; end if;
  if p_year not between 2020 and 2100 or p_month not between 1 and 12 then raise exception 'invalid period'; end if;
  if coalesce(p_virtua_target,0)<0 or coalesce(p_revenue_target,0)<0 then raise exception 'targets must be non-negative'; end if;
  if not exists(select 1 from public.tv_teams t where t.id=p_team_id and t.active=true) then raise exception 'team not found or inactive'; end if;

  insert into public.tv_team_goals(team_id,year,month,virtua_target,revenue_target,created_by,updated_by)
  values(p_team_id,p_year,p_month,coalesce(p_virtua_target,0),round(coalesce(p_revenue_target,0)::numeric,2),auth.uid(),auth.uid())
  on conflict(team_id,year,month) do update set
    virtua_target=excluded.virtua_target,
    revenue_target=excluded.revenue_target,
    updated_by=auth.uid(),
    updated_at=now()
  returning * into v_goal;

  return jsonb_build_object('ok',true,'goal',to_jsonb(v_goal));
end
$$;

revoke all on function public.tv_admin_save_team_goal(uuid,integer,integer,integer,numeric) from public;
grant execute on function public.tv_admin_save_team_goal(uuid,integer,integer,integer,numeric) to authenticated;

create or replace function public.tv_team_goal_dashboard(
  p_month integer default null,
  p_year integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
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
      public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,'')) team_name,
      coalesce(s.total_value,0)::numeric revenue
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
      coalesce(sum(greatest(coalesce(sp.quantity,1),1)) filter(where upper(trim(coalesce(sp.product_group,'')))='BANDA LARGA'),0)::int installed_virtua
    from sales_scope sc
    left join public.tv_sale_products sp on sp.sale_id=sc.id
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
$$;

revoke all on function public.tv_team_goal_dashboard(integer,integer) from public;
grant execute on function public.tv_team_goal_dashboard(integer,integer) to authenticated;
