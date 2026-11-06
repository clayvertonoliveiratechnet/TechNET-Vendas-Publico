do $$
declare
  r record;
  v text;
begin
  select p.oid into r
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and p.proname='tv_sales_page'
  limit 1;
  v := pg_get_functiondef(r.oid);
  if position('sum(total_value) as production_value' in v)=0 then
    raise exception 'tv_sales_page target not found';
  end if;
  v := replace(
    v,
    'sum(total_value) as production_value',
    'sum(total_value) filter(where status in (''approved'',''sync_pending'',''synced'')) as production_value'
  );
  execute v;

  select p.oid into r
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and p.proname='tv_sales_page_month'
  limit 1;
  v := pg_get_functiondef(r.oid);
  if position('sum(total_value) as production_value' in v)=0 then
    raise exception 'tv_sales_page_month target not found';
  end if;
  v := replace(
    v,
    'sum(total_value) as production_value',
    'sum(total_value) filter(where status in (''approved'',''sync_pending'',''synced'')) as production_value'
  );
  execute v;

  select p.oid into r
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and p.proname='tv_admin_dashboard_scope'
  limit 1;
  v := pg_get_functiondef(r.oid);
  if position('coalesce(sum(s.total_value),0),count(*) filter(where s.total_value>0)' in v)=0 then
    raise exception 'tv_admin_dashboard_scope target not found';
  end if;
  v := replace(
    v,
    'coalesce(sum(s.total_value),0),count(*) filter(where s.total_value>0)',
    'coalesce(sum(s.total_value) filter(where s.status in (''approved'',''sync_pending'',''synced'')),0),count(*) filter(where s.total_value>0 and s.status in (''approved'',''sync_pending'',''synced''))'
  );
  execute v;

  select p.oid into r
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and p.proname='tv_admin_dashboard_scope_v2'
  limit 1;
  v := pg_get_functiondef(r.oid);
  if position('coalesce(sum(total_value),0) revenue,count(*) filter(where total_value>0)::int revenue_rows' in v)=0 then
    raise exception 'tv_admin_dashboard_scope_v2 target not found';
  end if;
  v := replace(
    v,
    'coalesce(sum(total_value),0) revenue,count(*) filter(where total_value>0)::int revenue_rows',
    'coalesce(sum(total_value) filter(where status in (''approved'',''sync_pending'',''synced'')),0) revenue,count(*) filter(where total_value>0 and status in (''approved'',''sync_pending'',''synced''))::int revenue_rows'
  );
  execute v;
end $$;
