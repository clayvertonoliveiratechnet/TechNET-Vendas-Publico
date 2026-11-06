alter table public.tv_sales
  add column if not exists documents_checked_at timestamptz,
  add column if not exists documents_checked_by uuid;
