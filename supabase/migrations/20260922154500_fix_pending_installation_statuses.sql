-- Normalize pending-installation semantics across dashboard RPCs.
-- Active Imperium states AGENDADA/REAGENDADA/CADASTRADA/APROVADA are still awaiting installation.

create or replace function public.tv_is_pending_installation(
  p_app_status text,
  p_imperium_status text
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when upper(btrim(coalesce(p_imperium_status,''))) in
      ('INSTALADA','CANCELADA','REPROVADA','NÃO UTILIZAR','NAO UTILIZAR')
      then false
    when upper(btrim(coalesce(p_imperium_status,''))) in
      ('PENDENTE INSTALAÇÃO','PENDENTE INSTALACAO','AGENDADA','REAGENDADA','CADASTRADA','APROVADA')
      then true
    else lower(btrim(coalesce(p_app_status,''))) in ('approved','sync_pending')
  end
$function$;

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
        'tv_admin_dashboard',
        'tv_admin_dashboard_scope',
        'tv_admin_dashboard_scope_v2',
        'tv_admin_supervisor_ranking_scope',
        'tv_admin_supervisor_ranking_scope_v2'
      )
  loop
    ddl:=pg_get_functiondef(r.oid);

    ddl:=replace(
      ddl,
      's.status=''sync_pending'' or upper(coalesce(s.imperium_status,''''))=''PENDENTE INSTALAÇÃO''',
      'public.tv_is_pending_installation(s.status,s.imperium_status)'
    );
    ddl:=replace(
      ddl,
      'status=''sync_pending'' or upper(coalesce(imperium_status,''''))=''PENDENTE INSTALAÇÃO''',
      'public.tv_is_pending_installation(status,imperium_status)'
    );

    ddl:=replace(
      ddl,
      's.status in (''submitted'',''under_review'',''pending_correction'') or upper(coalesce(s.imperium_status,''''))=''TRATANDO''',
      '(s.status in (''submitted'',''under_review'',''pending_correction'') or upper(coalesce(s.imperium_status,''''))=''TRATANDO'') and not public.tv_is_pending_installation(s.status,s.imperium_status)'
    );
    ddl:=replace(
      ddl,
      'status in (''submitted'',''under_review'',''pending_correction'') or upper(coalesce(imperium_status,''''))=''TRATANDO''',
      '(status in (''submitted'',''under_review'',''pending_correction'') or upper(coalesce(imperium_status,''''))=''TRATANDO'') and not public.tv_is_pending_installation(status,imperium_status)'
    );

    execute ddl;
  end loop;

  select pg_get_functiondef(p.oid) into ddl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='tv_admin_installation_product_summary'
  limit 1;

  if ddl is null then raise exception 'tv_admin_installation_product_summary not found'; end if;

  ddl:=replace(
    ddl,
    'when upper(btrim(coalesce(s.imperium_status,''''))) in (''PENDENTE INSTALAÇÃO'',''PENDENTE INSTALACAO'') then ''pending''',
    'when public.tv_is_pending_installation(s.status,s.imperium_status) then ''pending'''
  );
  execute ddl;

  select pg_get_functiondef(p.oid) into ddl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='tv_real_product_metrics_scope'
  limit 1;

  if ddl is not null then
    ddl:=replace(
      ddl,
      'upper(btrim(coalesce(s.imperium_status,''''))) in (''INSTALADA'',''PENDENTE INSTALAÇÃO'',''PENDENTE INSTALACAO'')',
      '(upper(btrim(coalesce(s.imperium_status,'''')))=''INSTALADA'' or public.tv_is_pending_installation(s.status,s.imperium_status))'
    );
    execute ddl;
  end if;
end
$migration$;
