do $do$
begin
  if exists(select 1 from cron.job where jobname='technet-imperium-submit-queue') then
    perform cron.unschedule('technet-imperium-submit-queue');
  end if;
end
$do$;

select cron.schedule(
  'technet-imperium-submit-queue',
  '* * * * *',
  $$select public.tv_internal_call_edge('tv-imperium-submit-cloud','{"action":"process_queue","limit":1}'::jsonb);$$
);
