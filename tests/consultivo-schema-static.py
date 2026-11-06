from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
matches = sorted(MIGRATIONS.glob("*_consultivo_tracking.sql"))
assert matches, "migration consultivo_tracking não encontrada"

sql = matches[-1].read_text(encoding="utf-8-sig").lower()

tables = [
    "tv_consultivo_devices",
    "tv_consultivo_team_schedules",
    "tv_consultivo_positions",
    "tv_consultivo_pauses",
    "tv_consultivo_daily_summaries",
    "tv_consultivo_web_bridges",
]

for table in tables:
    assert f"create table if not exists public.{table}" in sql, f"tabela ausente: {table}"
    assert f"alter table public.{table} enable row level security" in sql, f"rls ausente: {table}"

assert "source_id uuid not null unique" in sql
assert "references auth.users(id)" in sql
assert "references public.tv_teams(id)" in sql
assert "references public.tv_consultivo_devices(id)" in sql

required_indexes = [
    "idx_consultivo_positions_user_recorded",
    "idx_consultivo_positions_team_recorded",
    "idx_consultivo_positions_device_recorded",
    "idx_consultivo_devices_user_active",
    "idx_consultivo_summaries_team_day",
]
for index in required_indexes:
    assert f"create index if not exists {index}" in sql, f"índice ausente: {index}"

assert "create unique index if not exists idx_consultivo_open_pause_user" in sql
assert "where ended_at is null" in sql

assert sql.count("create policy") >= 6, "políticas RLS insuficientes"
assert "public.tv_current_role()='admin'" in sql
assert "public.tv_current_role()='supervisor'" in sql
assert "public.tv_current_team()" in sql
assert "user_id=auth.uid()" in sql

for ingest_table in ("tv_consultivo_positions", "tv_consultivo_web_bridges"):
    block = re.search(
        rf"alter table public\.{ingest_table} enable row level security;(.*?)(?=alter table public\.|$)",
        sql,
        re.S,
    )
    assert block, f"bloco RLS ausente: {ingest_table}"
    assert "for insert to authenticated" not in block.group(1), f"insert direto habilitado em {ingest_table}"

print("CONSULTIVO_SCHEMA_STATIC_OK")
