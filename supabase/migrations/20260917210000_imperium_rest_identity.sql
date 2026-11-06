create table if not exists public.tv_imperium_rest_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  base_key text not null check (base_key in ('natal','fortaleza','mossoro','recife')),
  imperium_user_id text not null,
  imperium_username text not null,
  imperium_username_norm text not null,
  imperium_group text,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (base_key, imperium_user_id),
  unique (base_key, imperium_username_norm)
);

alter table public.tv_imperium_rest_identities enable row level security;
revoke all on table public.tv_imperium_rest_identities from anon, authenticated;

comment on table public.tv_imperium_rest_identities is 'Vinculo server-side da identidade REST do Imperium; nunca armazena senha ou Bearer Token.';
comment on column public.tv_imperium_rest_identities.imperium_group is 'Grupo informativo; privilegios continuam definidos em tv_profiles.';
