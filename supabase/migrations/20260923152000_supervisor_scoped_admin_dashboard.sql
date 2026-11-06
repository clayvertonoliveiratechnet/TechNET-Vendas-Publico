-- Supervisor dashboard isolation v106.
-- Supervisors use the same management dashboard UI as administrators, but every
-- dashboard RPC is forced to the authenticated supervisor's commercial scope.

update public.tv_profiles
set permissions='{}'::jsonb, updated_at=now()
where role='supervisor' and permissions<>'{}'::jsonb;

create or replace function public.tv_has_permission(
  p_key text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce((
    select case
      when p.role='admin' then true
      when p.role='backoffice' and p_key='backoffice' then true
      else false
    end
    from public.tv_profiles p
    where p.user_id=p_user_id and p.active=true
    limit 1
  ),false)
$function$;

create or replace function public.tv_dashboard_effective_team_filter(
  p_requested text default null
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select case
    when p.role='admin' then nullif(btrim(p_requested),'')
    when p.role='supervisor' then nullif(btrim(p.full_name),'')
    else null
  end
  from public.tv_profiles p
  where p.user_id=auth.uid() and p.active=true
  limit 1
$function$;

create or replace function public.tv_admin_save_access_v4(
  p_user_id uuid,
  p_role text,
  p_city_id uuid default null,
  p_team_id uuid default null,
  p_supervisor_id uuid default null,
  p_active boolean default true,
  p_permissions jsonb default '{}'::jsonb
)
returns public.tv_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_row public.tv_profiles;
begin
  if public.tv_current_role()<>'admin' then raise exception 'admin required'; end if;
  if p_role not in ('consultant','supervisor','backoffice','admin') then raise exception 'invalid role'; end if;

  update public.tv_profiles
     set role=p_role,
         city_id=p_city_id,
         team_id=p_team_id,
         supervisor_id=p_supervisor_id,
         active=p_active,
         permissions='{}'::jsonb,
         updated_at=now()
   where user_id=p_user_id
   returning * into v_row;

  if v_row.user_id is null then raise exception 'profile not found'; end if;

  if p_role='supervisor' and p_team_id is not null then
    update public.tv_sales set supervisor_id=p_user_id where team_id=p_team_id;
  end if;

  return v_row;
end
$function$;

do $migration$
declare
  r record;
  ddl text;
  old_ddl text;
  old_check text := 'if not public.tv_has_permission(''dashboard_full'') then raise exception ''dashboard permission required''; end if;';
  new_check text := 'if public.tv_current_role() not in (''admin'',''supervisor'') then raise exception ''dashboard access required''; end if;';
begin
  for r in
    select p.oid,p.proname
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'tv_admin_dashboard_scope',
        'tv_real_product_metrics_scope',
        'tv_admin_supervisor_ranking_scope',
        'tv_admin_installation_product_summary'
      )
  loop
    ddl:=pg_get_functiondef(r.oid);
    old_ddl:=ddl;

    if position(old_check in ddl)=0 then
      raise exception '% access check anchor not found',r.proname;
    end if;

    ddl:=replace(
      ddl,
      old_check,
      new_check || chr(10) ||
      '  p_team_name := public.tv_dashboard_effective_team_filter(p_team_name);'
    );

    ddl:=replace(
      ddl,
      'nullif(public.tv_canonical_commercial_team(p_team_name),'''')',
      'nullif(public.tv_canonical_commercial_team(public.tv_dashboard_effective_team_filter(p_team_name)),'''')'
    );

    if ddl=old_ddl then raise exception '% was not changed',r.proname; end if;
    execute ddl;
  end loop;
end
$migration$;

do $migration$
declare
  r record;
  ddl text;
  old_ddl text;
begin
  for r in
    select p.oid,p.proname
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('tv_sales_page','tv_sales_page_month')
  loop
    ddl:=pg_get_functiondef(r.oid);
    old_ddl:=ddl;
    ddl:=replace(
      ddl,
      '(v_role in (''admin'',''backoffice'') or public.tv_has_permission(''sales_all''))',
      'v_role in (''admin'',''backoffice'')'
    );
    if ddl=old_ddl then raise exception '% sales scope anchor not found',r.proname; end if;
    execute ddl;
  end loop;
end
$migration$;

drop policy if exists profiles_read on public.tv_profiles;
create policy profiles_read on public.tv_profiles
for select to authenticated
using (
  user_id=auth.uid()
  or public.tv_current_role() in ('admin','backoffice')
  or (public.tv_current_role()='supervisor' and team_id=public.tv_current_team())
);

drop policy if exists sales_read on public.tv_sales;
create policy sales_read on public.tv_sales
for select to authenticated
using (
  public.tv_current_role() in ('admin','backoffice')
  or consultant_id=auth.uid()
  or (public.tv_current_role()='supervisor' and (
    supervisor_id=auth.uid()
    or (public.tv_current_team() is not null and team_id=public.tv_current_team())
  ))
);

drop policy if exists sales_update on public.tv_sales;
create policy sales_update on public.tv_sales
for update to authenticated
using (
  public.tv_current_role() in ('admin','backoffice')
  or consultant_id=auth.uid()
  or (public.tv_current_role()='supervisor' and (
    supervisor_id=auth.uid()
    or (public.tv_current_team() is not null and team_id=public.tv_current_team())
  ))
)
with check (
  public.tv_current_role() in ('admin','backoffice')
  or consultant_id=auth.uid()
  or (public.tv_current_role()='supervisor' and (
    supervisor_id=auth.uid()
    or (public.tv_current_team() is not null and team_id=public.tv_current_team())
  ))
);

grant execute on function public.tv_dashboard_effective_team_filter(text) to authenticated;
