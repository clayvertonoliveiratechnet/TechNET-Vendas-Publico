-- Installed Virtua status alignment v115
-- The product-status dashboard must use the same installed semantics as the
-- canonical dashboard, team goals and supervisor Team Pulse:
-- local synced OR Imperium INSTALADA.

do $migration$
declare
  ddl text;
  old_line constant text := 'when upper(btrim(coalesce(s.imperium_status,'''')))=''INSTALADA'' then ''installed''';
  new_line constant text := 'when s.status=''synced'' or upper(btrim(coalesce(s.imperium_status,'''')))=''INSTALADA'' then ''installed''';
begin
  select pg_get_functiondef(p.oid)
    into ddl
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='tv_admin_installation_product_summary'
   limit 1;

  if ddl is null then raise exception 'tv_admin_installation_product_summary not found'; end if;
  if position(old_line in ddl)=0 then raise exception 'installed bucket anchor not found'; end if;

  ddl:=replace(ddl,old_line,new_line);
  execute ddl;
end
$migration$;
