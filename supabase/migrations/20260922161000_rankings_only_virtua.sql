-- Commercial rankings v97: only Virtua/Banda Larga sales, excluding MDU context.

create or replace function public.tv_is_virtua_product(
  p_real_product_summary text,
  p_product_summary text,
  p_product_group_summary text
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $function$
  select
    upper(coalesce(p_real_product_summary,'')) like '%VIRTUA%'
    or upper(coalesce(p_real_product_summary,'')) like '%FIBRA%'
    or upper(coalesce(p_product_summary,'')) like '%VIRTUA%'
    or upper(coalesce(p_product_summary,'')) like '%FIBRA%'
    or upper(coalesce(p_product_summary,'')) like '%BANDA LARGA%'
    or upper(coalesce(p_product_group_summary,'')) like '%BANDA LARGA%'
$function$;

do $migration$
declare
  fn oid;
  ddl text;
  needle text;
begin
  select p.oid into fn
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='tv_admin_dashboard_scope'
  limit 1;

  if fn is null then raise exception 'tv_admin_dashboard_scope not found'; end if;
  ddl:=pg_get_functiondef(fn);
  ddl:=replace(
    ddl,
    'and (upper(coalesce(s.real_product_summary,'''')) like ''%VIRTUA%'' or upper(coalesce(s.real_product_summary,'''')) like ''%FIBRA%'' or upper(coalesce(s.product_group_summary,'''')) like ''%BANDA LARGA%'')',
    'and public.tv_is_virtua_product(s.real_product_summary,s.product_summary,s.product_group_summary)'
  );
  execute ddl;

  select p.oid into fn
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='tv_admin_supervisor_ranking_scope'
  limit 1;

  if fn is null then raise exception 'tv_admin_supervisor_ranking_scope not found'; end if;
  ddl:=pg_get_functiondef(fn);
  if position('tv_is_virtua_product' in ddl)=0 then
    needle:='      and public.tv_team_filter_match(p_team_name, public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,'''')))';
    if position(needle in ddl)=0 then raise exception 'supervisor ranking insertion point not found'; end if;
    ddl:=replace(
      ddl,
      needle,
      needle || chr(10) ||
      '      and public.tv_is_virtua_product(s.real_product_summary,s.product_summary,s.product_group_summary)' || chr(10) ||
      '      and upper(coalesce(t.name,s.imperium_team_name,'''')) not like ''%MDU%''' || chr(10) ||
      '      and upper(coalesce(s.imperium_consultant_name,s.commercial_seller_name,'''')) not like ''MDU - %'''
    );
  end if;
  ddl:=replace(
    ddl,
    'and upper(coalesce(nullif(btrim(p.full_name),''''),nullif(btrim(s.commercial_leader),''''),nullif(btrim(s.imperium_team_name),''''),'''')) not in ('''',''SEM SUPERVISOR'',''SEM EQUIPE'',''TECNICA'',''MDU/INTERNO - CE'')',
    'and upper(coalesce(nullif(btrim(p.full_name),''''),nullif(btrim(s.commercial_leader),''''),nullif(btrim(s.imperium_team_name),''''),'''')) not in ('''',''SEM SUPERVISOR'',''SEM EQUIPE'',''TECNICA'',''MDU/INTERNO - CE'') and upper(coalesce(nullif(btrim(p.full_name),''''),nullif(btrim(s.commercial_leader),''''),nullif(btrim(s.imperium_team_name),''''),'''')) not like ''%MDU%'''
  );
  execute ddl;

  select p.oid into fn
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='tv_admin_supervisor_ranking_scope_v2'
  limit 1;

  if fn is not null then
    ddl:=pg_get_functiondef(fn);
    if position('tv_is_virtua_product' in ddl)=0 then
      needle:='      and upper(coalesce(nullif(btrim(cp.full_name),''''),nullif(btrim(s.imperium_consultant_name),''''),nullif(btrim(s.commercial_seller_name),''''),''Sem consultor''))=v_consultant_filter';
      if position(needle in ddl)=0 then raise exception 'supervisor ranking v2 insertion point not found'; end if;
      ddl:=replace(
        ddl,
        needle,
        needle || chr(10) ||
        '      and public.tv_is_virtua_product(s.real_product_summary,s.product_summary,s.product_group_summary)' || chr(10) ||
        '      and upper(coalesce(t.name,s.imperium_team_name,'''')) not like ''%MDU%''' || chr(10) ||
        '      and upper(coalesce(cp.full_name,s.imperium_consultant_name,s.commercial_seller_name,'''')) not like ''MDU - %''' || chr(10) ||
        '      and upper(coalesce(p.full_name,s.commercial_leader,s.imperium_team_name,'''')) not like ''%MDU%'''
      );
    end if;
    execute ddl;
  end if;
end
$migration$;
