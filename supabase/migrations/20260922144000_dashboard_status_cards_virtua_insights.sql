-- Dashboard v90: product status groups + Virtua-only commercial insights.
-- Preserves the current RPC signatures and multi-team filter behavior.

do $migration$
declare
  fn oid;
  ddl text;
  needle text;
begin
  -- Product/status summary: keep installed + pending and expose a real all-sales bucket.
  select p.oid into fn
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='tv_admin_installation_product_summary'
  limit 1;

  if fn is null then raise exception 'tv_admin_installation_product_summary not found'; end if;
  ddl:=pg_get_functiondef(fn);

  if position('''all'',jsonb_build_object(' in ddl)=0 then
    needle:='    from scoped' || chr(10) ||
            '    where bucket is not null' || chr(10) ||
            '  ), metrics as (';
    if position(needle in ddl)=0 then
      raise exception 'classified bucket guard not found in tv_admin_installation_product_summary';
    end if;

    ddl:=replace(
      ddl,
      needle,
      '    from scoped' || chr(10) ||
      '  ), metrics as ('
    );

    ddl:=replace(ddl,'      count(*)::int as sales','      count(c.id)::int as sales');

    needle:='    ''period'',jsonb_build_object(''start'',v_start,''end'',v_next-1),';
    if position(needle in ddl)=0 then
      raise exception 'period insertion point not found in tv_admin_installation_product_summary';
    end if;

    ddl:=replace(
      ddl,
      needle,
      '    ''all'',jsonb_build_object(' || chr(10) ||
      '      ''virtua'',(select count(*) filter(where has_virtua)::int from classified),' || chr(10) ||
      '      ''tv'',(select count(*) filter(where has_tv)::int from classified),' || chr(10) ||
      '      ''chip'',(select count(*) filter(where has_chip)::int from classified),' || chr(10) ||
      '      ''revenue'',(select coalesce(sum(effective_revenue),0)::numeric from classified),' || chr(10) ||
      '      ''sales'',(select count(*)::int from classified)' || chr(10) ||
      '    ),' || chr(10) ||
      needle
    );

    execute ddl;
  end if;

  -- Dashboard insights: add a consultant stream restricted to Virtua/broadband and excluding MDU.
  select p.oid into fn
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='tv_admin_dashboard_scope'
  limit 1;

  if fn is null then raise exception 'tv_admin_dashboard_scope not found'; end if;
  ddl:=pg_get_functiondef(fn);

  if position('v_consult_virtua jsonb' in ddl)=0 then
    needle:='v_daily jsonb:=''[]''; v_consult jsonb:=''[]''; v_team jsonb:=''[]'';';
    if position(needle in ddl)=0 then
      raise exception 'dashboard json declaration not found';
    end if;

    ddl:=replace(
      ddl,
      needle,
      'v_daily jsonb:=''[]''; v_consult jsonb:=''[]''; v_consult_virtua jsonb:=''[]''; v_team jsonb:=''[]'';'
    );

    needle:='  select coalesce(jsonb_agg(to_jsonb(x) order by x.installed desc,x.generated desc),''[]''::jsonb) into v_team from (';
    if position(needle in ddl)=0 then
      raise exception 'dashboard team query insertion point not found';
    end if;

    ddl:=replace(
      ddl,
      needle,
      '  select coalesce(jsonb_agg(to_jsonb(x) order by x.installed desc,x.generated desc),''[]''::jsonb) into v_consult_virtua from (' || chr(10) ||
      '    select coalesce(p.full_name,s.imperium_consultant_name,''Sem consultor'') consultant,public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,''Sem equipe'')) team,count(*)::int generated,' || chr(10) ||
      '      count(*) filter(where s.status=''synced'' or upper(coalesce(s.imperium_status,''''))=''INSTALADA'')::int installed' || chr(10) ||
      '    from public.tv_sales s left join public.tv_profiles p on p.user_id=s.consultant_id left join public.tv_teams t on t.id=s.team_id' || chr(10) ||
      '    where coalesce(s.sold_at,s.created_at)>=v_start::timestamp at time zone ''America/Fortaleza'' and coalesce(s.sold_at,s.created_at)<v_next::timestamp at time zone ''America/Fortaleza''' || chr(10) ||
      '      and (v_base=''all'' or lower(coalesce(s.imperium_base_key,''''))=v_base)' || chr(10) ||
      '      and (v_type=''ALL'' or upper(coalesce(s.sale_type,s.product_summary,''''))=v_type)' || chr(10) ||
      '      and public.tv_team_filter_match(p_team_name, public.tv_canonical_commercial_team(coalesce(t.name,s.imperium_team_name,'''')))' || chr(10) ||
      '      and (upper(coalesce(s.real_product_summary,'''')) like ''%VIRTUA%'' or upper(coalesce(s.real_product_summary,'''')) like ''%FIBRA%'' or upper(coalesce(s.product_group_summary,'''')) like ''%BANDA LARGA%'')' || chr(10) ||
      '      and upper(coalesce(s.imperium_team_name,'''')) not like ''%MDU%''' || chr(10) ||
      '      and upper(coalesce(t.name,'''')) not like ''%MDU%''' || chr(10) ||
      '      and upper(coalesce(s.imperium_consultant_name,'''')) not like ''MDU - %''' || chr(10) ||
      '      and upper(coalesce(p.full_name,'''')) not like ''MDU - %''' || chr(10) ||
      '    group by 1,2 order by 4 desc,3 desc limit 100' || chr(10) ||
      '  ) x;' || chr(10) || chr(10) ||
      needle
    );

    needle:='''daily'',v_daily,''consultants'',v_consult,''teams'',v_team';
    if position(needle in ddl)=0 then
      raise exception 'dashboard return payload insertion point not found';
    end if;

    ddl:=replace(
      ddl,
      needle,
      '''daily'',v_daily,''consultants'',v_consult,''consultants_virtua'',v_consult_virtua,''teams'',v_team'
    );

    execute ddl;
  end if;
end
$migration$;
