-- VNA is a commercial cluster: Natal + Mossoro.
-- Keeps the stored Imperium base keys unchanged and changes only dashboard/filter semantics.

create or replace function public.tv_commercial_base_filter_match(
  p_filter text,
  p_sale_base text
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when coalesce(nullif(lower(btrim(p_filter)),''),'all')='all' then true
    when lower(btrim(p_filter))='natal'
      then lower(btrim(coalesce(p_sale_base,''))) in ('natal','mossoro')
    else lower(btrim(coalesce(p_sale_base,'')))=lower(btrim(p_filter))
  end
$function$;

do $migration$
declare
  r record;
  ddl text;
  needle constant text := '(v_base=''all'' or lower(coalesce(s.imperium_base_key,''''))=v_base)';
  replacement constant text := 'public.tv_commercial_base_filter_match(v_base,s.imperium_base_key)';
begin
  for r in
    select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) args
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
        'tv_real_product_metrics',
        'tv_real_product_metrics_scope',
        'tv_real_product_metrics_scope_v2'
      )
  loop
    ddl:=pg_get_functiondef(r.oid);
    if position(needle in ddl)>0 then
      ddl:=replace(ddl,needle,replacement);
      execute ddl;
    end if;
  end loop;
end
$migration$;
