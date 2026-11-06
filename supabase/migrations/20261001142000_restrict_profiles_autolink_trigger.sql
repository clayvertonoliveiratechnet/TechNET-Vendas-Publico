revoke all on function public.tv_profiles_autolink_commercial_team() from public;
revoke execute on function public.tv_profiles_autolink_commercial_team() from anon;
revoke execute on function public.tv_profiles_autolink_commercial_team() from authenticated;

comment on function public.tv_profiles_autolink_commercial_team() is
  'Trigger interno para manter supervisor/equipe e consultor/supervisor alinhados; não exposto via RPC.';
