alter table public.tv_consultivo_devices
  add column if not exists last_network_type text;

create unique index if not exists tv_consultivo_devices_token_hash_uidx
  on public.tv_consultivo_devices (token_hash)
  where token_hash is not null and btrim(token_hash) <> '';

comment on column public.tv_consultivo_devices.last_network_type is
  'Último tipo de rede informado pelo APK nativo do TECHNET - CONSULTIVO.';
