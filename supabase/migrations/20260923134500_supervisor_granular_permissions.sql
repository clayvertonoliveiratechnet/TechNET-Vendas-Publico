-- Granular supervisor permissions v105.
-- Admins can delegate selected capabilities without promoting a supervisor to admin.

alter table public.tv_profiles
  add column if not exists permissions jsonb not null default '{}'::jsonb;

alter table public.tv_profiles
  drop constraint if exists tv_profiles_permissions_object_ck;

alter table public.tv_profiles
  add constraint tv_profiles_permissions_object_ck
  check (jsonb_typeof(permissions)='object');

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
      when p.role='backoffice' and p_key in ('backoffice','sales_all','map_all') then true
      when p.role='supervisor' then coalesce(p.permissions->>p_key,'false')='true'
      else false
    end
    from public.tv_profiles p
    where p.user_id=p_user_id
      and p.active=true
    limit 1
  ),false)
$function$;

create or replace function public.tv_admin_list_users_v4()
returns table(
  user_id uuid,
  username text,
  base_key text,
  full_name text,
  role text,
  city_id uuid,
  team_id uuid,
  supervisor_id uuid,
  imperium_account_id uuid,
  imperium_user_ref uuid,
  active boolean,
  group_name text,
  imperium_team_name text,
  supervisor_name text,
  cargo text,
  verified_at timestamptz,
  permissions jsonb
)
language sql
security definer
set search_path = public, auth, pg_temp
as $function$
  select
    p.user_id,a.username,a.base_key,p.full_name,p.role,p.city_id,p.team_id,p.supervisor_id,
    p.imperium_account_id,p.imperium_user_ref,p.active,a.group_name,a.team_name,a.supervisor_name,
    a.cargo,a.verified_at,coalesce(p.permissions,'{}'::jsonb)
  from public.tv_profiles p
  join public.tv_imperium_accounts a on a.id=p.imperium_account_id
  where public.tv_current_role()='admin'
  order by p.full_name
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
  v_permissions jsonb := '{}'::jsonb;
begin
  if public.tv_current_role()<>'admin' then raise exception 'admin required'; end if;
  if p_role not in ('consultant','supervisor','backoffice','admin') then raise exception 'invalid role'; end if;
  if jsonb_typeof(coalesce(p_permissions,'{}'::jsonb))<>'object' then raise exception 'invalid permissions'; end if;

  if p_role='supervisor' then
    v_permissions:=jsonb_build_object(
      'dashboard_full',coalesce(p_permissions->>'dashboard_full','false')='true',
      'sales_all',coalesce(p_permissions->>'sales_all','false')='true',
      'map_all',coalesce(p_permissions->>'map_all','false')='true',
      'backoffice',coalesce(p_permissions->>'backoffice','false')='true'
    );
  end if;

  update public.tv_profiles
     set role=p_role,
         city_id=p_city_id,
         team_id=p_team_id,
         supervisor_id=p_supervisor_id,
         active=p_active,
         permissions=v_permissions,
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
begin
  for r in
    select p.oid,p.proname
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and p.proname in (
        'tv_admin_dashboard',
        'tv_admin_dashboard_scope',
        'tv_admin_dashboard_scope_v2',
        'tv_admin_consultant_options_scope',
        'tv_admin_installation_product_summary',
        'tv_admin_supervisor_ranking_scope',
        'tv_admin_supervisor_ranking_scope_v2',
        'tv_real_product_metrics_scope'
      )
  loop
    ddl:=pg_get_functiondef(r.oid);
    old_ddl:=ddl;

    ddl:=replace(
      ddl,
      'if public.tv_current_role()<>''admin'' then raise exception ''admin required''; end if;',
      'if not public.tv_has_permission(''dashboard_full'') then raise exception ''dashboard permission required''; end if;'
    );
    ddl:=replace(
      ddl,
      'if public.tv_current_role() <> ''admin'' then raise exception ''admin required''; end if;',
      'if not public.tv_has_permission(''dashboard_full'') then raise exception ''dashboard permission required''; end if;'
    );

    if ddl<>old_ddl then execute ddl; end if;
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
      'v_role in (''admin'',''backoffice'')',
      '(v_role in (''admin'',''backoffice'') or public.tv_has_permission(''sales_all''))'
    );
    if ddl<>old_ddl then execute ddl; end if;
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
      and p.prokind='f'
      and p.proname like 'tv_backoffice_%'
  loop
    ddl:=pg_get_functiondef(r.oid);
    old_ddl:=ddl;

    ddl:=replace(
      ddl,
      'public.tv_current_role() not in (''admin'',''backoffice'')',
      'not public.tv_has_permission(''backoffice'')'
    );
    ddl:=replace(
      ddl,
      'v_role not in (''admin'',''backoffice'')',
      'not public.tv_has_permission(''backoffice'')'
    );

    if ddl<>old_ddl then execute ddl; end if;
  end loop;
end
$migration$;

drop policy if exists profiles_read on public.tv_profiles;
create policy profiles_read on public.tv_profiles
for select to authenticated
using (
  user_id=auth.uid()
  or public.tv_current_role() in ('admin','backoffice')
  or public.tv_has_permission('sales_all')
  or public.tv_has_permission('map_all')
  or public.tv_has_permission('backoffice')
  or (public.tv_current_role()='supervisor' and team_id=public.tv_current_team())
);

drop policy if exists sales_read on public.tv_sales;
create policy sales_read on public.tv_sales
for select to authenticated
using (
  public.tv_current_role() in ('admin','backoffice')
  or public.tv_has_permission('sales_all')
  or public.tv_has_permission('map_all')
  or public.tv_has_permission('backoffice')
  or consultant_id=auth.uid()
  or (public.tv_current_role()='supervisor' and team_id=public.tv_current_team())
);

drop policy if exists sales_update on public.tv_sales;
create policy sales_update on public.tv_sales
for update to authenticated
using (
  public.tv_current_role() in ('admin','backoffice')
  or public.tv_has_permission('backoffice')
  or consultant_id=auth.uid()
  or (public.tv_current_role()='supervisor' and team_id=public.tv_current_team())
)
with check (
  public.tv_current_role() in ('admin','backoffice')
  or public.tv_has_permission('backoffice')
  or consultant_id=auth.uid()
  or (public.tv_current_role()='supervisor' and team_id=public.tv_current_team())
);

grant execute on function public.tv_has_permission(text,uuid) to authenticated;
grant execute on function public.tv_admin_list_users_v4() to authenticated;
grant execute on function public.tv_admin_save_access_v4(uuid,text,uuid,uuid,uuid,boolean,jsonb) to authenticated;
