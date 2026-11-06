-- Dashboard refresh v107.
-- Gives admin/supervisor a safe, rate-limited way to request a fresh Imperium
-- analytic synchronization before reloading dashboard metrics.

create or replace function public.tv_dashboard_request_imperium_refresh()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text;
  v_last_sync timestamptz;
  v_request_id bigint;
begin
  v_role:=public.tv_current_role();

  if v_role not in ('admin','supervisor') then
    raise exception 'dashboard access required';
  end if;

  select max(created_at)
    into v_last_sync
  from public.tv_imperium_cloud_runs
  where worker='analytic_direct'
    and status='ok';

  if v_last_sync is not null
     and v_last_sync >= now()-interval '45 seconds' then
    return jsonb_build_object(
      'ok',true,
      'requested',false,
      'reason','recent_sync',
      'last_sync',v_last_sync
    );
  end if;

  v_request_id:=public.tv_internal_call_edge(
    'tv-imperium-analytic-sync',
    '{"mode":"fast"}'::jsonb
  );

  return jsonb_build_object(
    'ok',true,
    'requested',true,
    'request_id',v_request_id,
    'last_sync',v_last_sync
  );
end
$function$;

revoke all on function public.tv_dashboard_request_imperium_refresh() from public;
grant execute on function public.tv_dashboard_request_imperium_refresh() to authenticated;
