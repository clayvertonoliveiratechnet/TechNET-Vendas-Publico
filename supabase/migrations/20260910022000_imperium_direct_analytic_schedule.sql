do $do$
begin
  if exists(select 1 from cron.job where jobname='technet-imperium-analytic-fast') then
    perform cron.unschedule('technet-imperium-analytic-fast');
  end if;
  if exists(select 1 from cron.job where jobname='technet-imperium-analytic-deep-natal') then
    perform cron.unschedule('technet-imperium-analytic-deep-natal');
  end if;
  if exists(select 1 from cron.job where jobname='technet-imperium-analytic-deep-fortaleza') then
    perform cron.unschedule('technet-imperium-analytic-deep-fortaleza');
  end if;
  if exists(select 1 from cron.job where jobname='technet-imperium-analytic-deep-mossoro') then
    perform cron.unschedule('technet-imperium-analytic-deep-mossoro');
  end if;
  if exists(select 1 from cron.job where jobname='technet-imperium-analytic-deep-recife') then
    perform cron.unschedule('technet-imperium-analytic-deep-recife');
  end if;
end
$do$;

select cron.schedule(
  'technet-imperium-analytic-fast',
  '*/5 * * * *',
  $$select public.tv_internal_call_edge('tv-imperium-analytic-sync','{"mode":"fast"}'::jsonb);$$
);

select cron.schedule(
  'technet-imperium-analytic-deep-natal',
  '10 5 * * *',
  $$select public.tv_internal_call_edge('tv-imperium-analytic-sync','{"mode":"deep","base":"natal"}'::jsonb);$$
);
select cron.schedule(
  'technet-imperium-analytic-deep-fortaleza',
  '20 5 * * *',
  $$select public.tv_internal_call_edge('tv-imperium-analytic-sync','{"mode":"deep","base":"fortaleza"}'::jsonb);$$
);
select cron.schedule(
  'technet-imperium-analytic-deep-mossoro',
  '30 5 * * *',
  $$select public.tv_internal_call_edge('tv-imperium-analytic-sync','{"mode":"deep","base":"mossoro"}'::jsonb);$$
);
select cron.schedule(
  'technet-imperium-analytic-deep-recife',
  '40 5 * * *',
  $$select public.tv_internal_call_edge('tv-imperium-analytic-sync','{"mode":"deep","base":"recife"}'::jsonb);$$
);
