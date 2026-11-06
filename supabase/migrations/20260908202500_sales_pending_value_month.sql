create or replace function public.tv_sales_pending_value_month(
  p_month_start date,
  p_month_end date,
  p_city text default null,
  p_query text default null,
  p_consultant text default null,
  p_team text default null,
  p_leader text default null
) returns integer
language plpgsql security definer set search_path=public as $$
declare
  v_role text := public.tv_current_role();
  v_uid uuid := auth.uid();
  v_team uuid := public.tv_current_team();
  v_start date := coalesce(p_month_start, date_trunc('month', timezone('America/Fortaleza', now()))::date);
  v_end date := coalesce(p_month_end, (date_trunc('month', timezone('America/Fortaleza', now())) + interval '1 month')::date);
  v_count integer := 0;
begin
  if v_uid is null or v_role is null then raise exception 'not authorized'; end if;
  select count(*)::int into v_count
  from public.tv_sales s
  left join public.tv_profiles cp on cp.user_id=s.consultant_id
  left join public.tv_teams t on t.id=s.team_id
  where (
    v_role in ('admin','backoffice')
    or (v_role='consultant' and s.consultant_id=v_uid)
    or (v_role='supervisor' and (s.team_id=v_team or s.supervisor_id=v_uid))
  )
  and (coalesce(s.sold_at,s.created_at) at time zone 'America/Fortaleza')::date >= v_start
  and (coalesce(s.sold_at,s.created_at) at time zone 'America/Fortaleza')::date < v_end
  and (p_city is null or p_city='' or lower(coalesce(s.city_name,''))=lower(p_city) or lower(coalesce(s.imperium_base_key,''))=lower(p_city))
  and (p_consultant is null or p_consultant='' or lower(coalesce(cp.full_name,s.imperium_consultant_name,s.commercial_seller_name,'Sem consultor'))=lower(p_consultant))
  and (p_team is null or p_team='' or lower(coalesce(t.name,s.imperium_team_name,'Sem equipe'))=lower(p_team))
  and (p_leader is null or p_leader='' or lower(coalesce(s.commercial_leader,s.imperium_team_name,''))=lower(p_leader))
  and (p_query is null or btrim(p_query)='' or s.customer_name ilike '%'||btrim(p_query)||'%' or coalesce(s.imperium_proposal,'') ilike '%'||btrim(p_query)||'%' or coalesce(s.imperium_contract,'') ilike '%'||btrim(p_query)||'%')
  and s.source='imperium'
  and coalesce(s.total_value,0)<=0
  and coalesce(nullif(btrim(s.imperium_contract),''),nullif(btrim(s.imperium_proposal),''),'') not in ('','00000');
  return v_count;
end $$;

revoke all on function public.tv_sales_pending_value_month(date,date,text,text,text,text,text) from public;
grant execute on function public.tv_sales_pending_value_month(date,date,text,text,text,text,text) to authenticated;
