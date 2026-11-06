-- Consultant identity precedence and Jefferson link repair v116.
-- Imperium/commercial identity is authoritative for imported sales; the local
-- profile name is only a fallback when the sale has no commercial seller name.

create or replace function public.tv_commercial_consultant_name(
  p_imperium_name text,
  p_commercial_name text,
  p_profile_name text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  select coalesce(
    nullif(btrim(p_imperium_name),''),
    nullif(btrim(p_commercial_name),''),
    nullif(btrim(p_profile_name),''),
    'Sem consultor'
  )
$function$;

-- JEFFERSON DEYLANE was incorrectly linked to Imperium person 357457 (JEFFERSON).
-- Remove only this known invalid identity link and detach imported sales so the
-- resolver cannot attribute JEFFERSON production to that local profile.
update public.tv_profiles
set imperium_user_ref=null,
    updated_at=now()
where user_id='06737950-3a28-4b9e-af42-ce0b33ae95fa'::uuid
  and imperium_user_ref='81123222-8671-4f22-af9c-60f63e2864ae'::uuid;

update public.tv_sales
set consultant_id=null,
    updated_at=now()
where source='imperium'
  and lower(coalesce(imperium_base_key,''))='natal'
  and imperium_consultant_id=357457
  and consultant_id='06737950-3a28-4b9e-af42-ce0b33ae95fa'::uuid;

do $migration$
declare
  r record;
  ddl text;
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
        'tv_admin_supervisor_ranking_scope_v2',
        'tv_backoffice_queue',
        'tv_real_product_metrics_scope_v2',
        'tv_sales_consultant_options_month',
        'tv_sales_page',
        'tv_sales_page_month',
        'tv_sales_pending_value_month'
      )
  loop
    ddl:=pg_get_functiondef(r.oid);

    ddl:=replace(
      ddl,
      $old$coalesce(p.full_name,s.imperium_consultant_name,'Sem consultor')$old$,
      $new$public.tv_commercial_consultant_name(s.imperium_consultant_name,s.commercial_seller_name,p.full_name)$new$
    );
    ddl:=replace(
      ddl,
      $old$coalesce(p.full_name,s.imperium_consultant_name,s.commercial_seller_name,'Sem consultor')$old$,
      $new$public.tv_commercial_consultant_name(s.imperium_consultant_name,s.commercial_seller_name,p.full_name)$new$
    );
    ddl:=replace(
      ddl,
      $old$coalesce(cp.full_name,s.imperium_consultant_name,s.commercial_seller_name,'Sem consultor')$old$,
      $new$public.tv_commercial_consultant_name(s.imperium_consultant_name,s.commercial_seller_name,cp.full_name)$new$
    );
    ddl:=replace(
      ddl,
      $old$coalesce(nullif(btrim(p.full_name),''),nullif(btrim(s.imperium_consultant_name),''),nullif(btrim(s.commercial_seller_name),''),'Sem consultor')$old$,
      $new$public.tv_commercial_consultant_name(s.imperium_consultant_name,s.commercial_seller_name,p.full_name)$new$
    );
    ddl:=replace(
      ddl,
      $old$coalesce(nullif(btrim(cp.full_name),''),nullif(btrim(s.imperium_consultant_name),''),nullif(btrim(s.commercial_seller_name),''),'Sem consultor')$old$,
      $new$public.tv_commercial_consultant_name(s.imperium_consultant_name,s.commercial_seller_name,cp.full_name)$new$
    );
    ddl:=replace(
      ddl,
      $old$coalesce(p.full_name,s.imperium_consultant_name,'')$old$,
      $new$public.tv_commercial_consultant_name(s.imperium_consultant_name,s.commercial_seller_name,p.full_name)$new$
    );

    execute ddl;
  end loop;
end
$migration$;

revoke all on function public.tv_commercial_consultant_name(text,text,text) from public;
grant execute on function public.tv_commercial_consultant_name(text,text,text) to authenticated;
