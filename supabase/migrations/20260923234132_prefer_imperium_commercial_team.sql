-- Use the Imperium analytic team as the primary commercial identity.
-- Local tv_teams links remain a fallback for rows that do not have Imperium team metadata.

create or replace function public.tv_supervisor_sale_in_scope(
  p_supervisor_id uuid,
  p_team_id uuid,
  p_imperium_team_name text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce((
    select case
      when coalesce(nullif(btrim(p_imperium_team_name),''),nullif(btrim(t.name),'')) is not null then
        public.tv_canonical_commercial_team(
          coalesce(nullif(btrim(p_imperium_team_name),''),nullif(btrim(t.name),''))
        ) = public.tv_canonical_commercial_team(p.full_name)
      else
        p_supervisor_id=p.user_id
    end
    from public.tv_profiles p
    left join public.tv_teams t on t.id=p_team_id
    where p.user_id=auth.uid()
      and p.active=true
      and p.role='supervisor'
    limit 1
  ),false)
$function$;

revoke all on function public.tv_supervisor_sale_in_scope(uuid,uuid,text) from public;
revoke all on function public.tv_supervisor_sale_in_scope(uuid,uuid,text) from anon;
grant execute on function public.tv_supervisor_sale_in_scope(uuid,uuid,text) to authenticated;

do $migration$
declare
  r record;
  ddl text;
  old_expr constant text := 'coalesce(t.name,s.imperium_team_name';
  new_expr constant text := 'coalesce(nullif(btrim(s.imperium_team_name),''''),t.name';
begin
  for r in
    select p.oid,p.proname
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and p.proname in (
        'tv_admin_consultant_options_scope',
        'tv_admin_dashboard',
        'tv_admin_dashboard_scope',
        'tv_admin_dashboard_scope_v2',
        'tv_admin_installation_product_summary',
        'tv_admin_supervisor_ranking_scope',
        'tv_admin_supervisor_ranking_scope_v2',
        'tv_backoffice_queue',
        'tv_real_product_metrics_scope',
        'tv_real_product_metrics_scope_v2',
        'tv_sales_consultant_options_month',
        'tv_sales_page',
        'tv_sales_page_month',
        'tv_sales_pending_value_month',
        'tv_team_goal_dashboard'
      )
      and pg_get_functiondef(p.oid) like '%coalesce(t.name,s.imperium_team_name%'
  loop
    ddl:=pg_get_functiondef(r.oid);
    ddl:=replace(ddl,old_expr,new_expr);
    execute ddl;
  end loop;
end
$migration$;
