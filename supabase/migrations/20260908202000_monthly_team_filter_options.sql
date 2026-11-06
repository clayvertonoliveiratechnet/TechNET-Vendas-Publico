create or replace function public.tv_sales_team_options_month(
  p_month_start date,
  p_month_end date,
  p_city text default null
)
returns table(team_name text, sales_count bigint)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_role text := public.tv_current_role();
  v_uid uuid := auth.uid();
  v_team uuid := public.tv_current_team();
  v_start date := coalesce(p_month_start, date_trunc('month', timezone('America/Fortaleza', now()))::date);
  v_end date := coalesce(p_month_end, (date_trunc('month', timezone('America/Fortaleza', now())) + interval '1 month')::date);
begin
  if v_uid is null or v_role is null then raise exception 'not authorized'; end if;
  if v_end <= v_start then raise exception 'invalid month range'; end if;

  return query
  select x.team_name, count(*)::bigint as sales_count
  from (
    select coalesce(t.name, s.imperium_team_name, 'Sem equipe') as team_name
    from public.tv_sales s
    left join public.tv_teams t on t.id = s.team_id
    where (
      v_role in ('admin','backoffice')
      or (v_role='consultant' and s.consultant_id=v_uid)
      or (v_role='supervisor' and (s.team_id=v_team or s.supervisor_id=v_uid))
    )
    and (coalesce(s.sold_at,s.created_at) at time zone 'America/Fortaleza')::date >= v_start
    and (coalesce(s.sold_at,s.created_at) at time zone 'America/Fortaleza')::date < v_end
    and (p_city is null or p_city='' or lower(coalesce(s.city_name,''))=lower(p_city) or lower(coalesce(s.imperium_base_key,''))=lower(p_city))
  ) x
  group by x.team_name
  order by count(*) desc, x.team_name asc;
end
$function$;

revoke all on function public.tv_sales_team_options_month(date,date,text) from public;
grant execute on function public.tv_sales_team_options_month(date,date,text) to authenticated;
