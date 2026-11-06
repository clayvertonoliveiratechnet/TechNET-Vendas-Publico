-- Keep operational/technical labels out of the commercial Virtua supervisor ranking.

do $migration$
declare
  r record;
  ddl text;
  needle text;
begin
  for r in
    select p.oid,p.proname
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and p.proname in ('tv_admin_supervisor_ranking_scope','tv_admin_supervisor_ranking_scope_v2')
  loop
    ddl:=pg_get_functiondef(r.oid);

    if position('not like ''%TECNICA%''' in ddl)=0 then
      if r.proname='tv_admin_supervisor_ranking_scope' then
        needle:='and upper(coalesce(nullif(btrim(p.full_name),''''),nullif(btrim(s.commercial_leader),''''),nullif(btrim(s.imperium_team_name),''''),'''')) not like ''%MDU%''';
        if position(needle in ddl)=0 then raise exception 'supervisor commercial filter not found'; end if;
        ddl:=replace(
          ddl,
          needle,
          needle || ' and upper(coalesce(nullif(btrim(p.full_name),''''),nullif(btrim(s.commercial_leader),''''),nullif(btrim(s.imperium_team_name),''''),'''')) not like ''%TECNICA%'''
        );
      else
        needle:='and upper(coalesce(p.full_name,s.commercial_leader,s.imperium_team_name,'''')) not like ''%MDU%''';
        if position(needle in ddl)=0 then raise exception 'supervisor v2 commercial filter not found'; end if;
        ddl:=replace(
          ddl,
          needle,
          needle || ' and upper(coalesce(p.full_name,s.commercial_leader,s.imperium_team_name,'''')) not like ''%TECNICA%'''
        );
      end if;
    end if;

    execute ddl;
  end loop;
end
$migration$;
