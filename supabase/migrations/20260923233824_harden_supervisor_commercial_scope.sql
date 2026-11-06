-- Harden supervisor commercial scope across RLS, Team, Map and search RPCs.
-- Prefer the canonical commercial team when team metadata exists; only fall back
-- to supervisor_id for legacy rows that have no team identity at all.

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
      when coalesce(nullif(btrim(t.name),''),nullif(btrim(p_imperium_team_name),'')) is not null then
        public.tv_canonical_commercial_team(
          coalesce(nullif(btrim(t.name),''),nullif(btrim(p_imperium_team_name),''))
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

drop policy if exists sales_read on public.tv_sales;
create policy sales_read on public.tv_sales
for select
to authenticated
using (
  (select public.tv_current_role()) in ('admin','backoffice')
  or consultant_id=(select auth.uid())
  or (
    (select public.tv_current_role())='supervisor'
    and public.tv_supervisor_sale_in_scope(supervisor_id,team_id,imperium_team_name)
  )
);

drop policy if exists sales_update on public.tv_sales;
create policy sales_update on public.tv_sales
for update
to authenticated
using (
  (select public.tv_current_role()) in ('admin','backoffice')
  or consultant_id=(select auth.uid())
  or (
    (select public.tv_current_role())='supervisor'
    and public.tv_supervisor_sale_in_scope(supervisor_id,team_id,imperium_team_name)
  )
)
with check (
  (select public.tv_current_role()) in ('admin','backoffice')
  or consultant_id=(select auth.uid())
  or (
    (select public.tv_current_role())='supervisor'
    and public.tv_supervisor_sale_in_scope(supervisor_id,team_id,imperium_team_name)
  )
);

do $migration$
declare
  r record;
  ddl text;
  old_scope constant text := '(v_role=''supervisor'' and (s.team_id=v_team or s.supervisor_id=v_uid))';
  new_scope constant text := '(v_role=''supervisor'' and public.tv_supervisor_sale_in_scope(s.supervisor_id,s.team_id,s.imperium_team_name))';
begin
  for r in
    select p.oid,p.proname
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'tv_customer_search',
        'tv_sale_timeline',
        'tv_sales_consultant_options_month',
        'tv_sales_page',
        'tv_sales_page_month',
        'tv_sales_pending_value_month',
        'tv_sales_team_options_month'
      )
  loop
    ddl:=pg_get_functiondef(r.oid);
    if position(old_scope in ddl)=0 then
      raise exception '% supervisor scope anchor not found',r.proname;
    end if;
    ddl:=replace(ddl,old_scope,new_scope);
    execute ddl;
  end loop;
end
$migration$;
