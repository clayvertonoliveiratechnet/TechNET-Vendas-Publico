alter table public.tv_sales
  add column if not exists commercial_enrich_attempts integer not null default 0,
  add column if not exists commercial_enrich_last_attempt_at timestamptz,
  add column if not exists commercial_enrich_status text;

create index if not exists tv_sales_commercial_retry_idx
  on public.tv_sales (commercial_enrich_status, commercial_enrich_last_attempt_at)
  where source = 'imperium' and coalesce(total_value, 0) = 0;
