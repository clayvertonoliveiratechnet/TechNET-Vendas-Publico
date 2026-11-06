create or replace function public.tv_sales_page_month(p_month_start date, p_month_end date, p_city text default null::text, p_status text default null::text, p_query text default null::text, p_consultant text default null::text, p_team text default null::text, p_leader text default null::text, p_limit integer default 40, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.tv_current_role();
  v_uid uuid := auth.uid();
  v_team uuid := public.tv_current_team();
  v_limit integer := greatest(1,least(coalesce(p_limit,40),100));
  v_offset integer := greatest(0,coalesce(p_offset,0));
  v_start date := coalesce(p_month_start, date_trunc('month', timezone('America/Fortaleza', now()))::date);
  v_end date := coalesce(p_month_end, (date_trunc('month', timezone('America/Fortaleza', now())) + interval '1 month')::date);
  v_result jsonb;
begin
  if v_uid is null or v_role is null then raise exception 'not authorized'; end if;
  if v_end <= v_start then raise exception 'invalid month range'; end if;

  with visible as (
    select s.*,
      coalesce(cp.full_name,s.imperium_consultant_name,s.commercial_seller_name,'Sem consultor') as consultant_name,
      coalesce(t.name,s.imperium_team_name,'Sem equipe') as team_name
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
  ), filtered as (
    select * from visible v
    where (p_city is null or p_city='' or lower(coalesce(v.city_name,''))=lower(p_city) or lower(coalesce(v.imperium_base_key,''))=lower(p_city))
      and (p_status is null or p_status='' or p_status='all' or (p_status='non_draft' and coalesce(v.status,'')<>'draft') or v.status=p_status)
      and (p_consultant is null or p_consultant='' or lower(v.consultant_name)=lower(p_consultant))
      and (p_team is null or p_team='' or lower(v.team_name)=lower(p_team))
      and (p_leader is null or p_leader='' or lower(coalesce(v.commercial_leader,v.imperium_team_name,''))=lower(p_leader))
      and (
        p_query is null or btrim(p_query)='' or
        v.customer_name ilike '%'||btrim(p_query)||'%' or
        coalesce(v.customer_document,'') ilike '%'||btrim(p_query)||'%' or
        coalesce(v.customer_phone,'') ilike '%'||btrim(p_query)||'%' or
        coalesce(v.secondary_phone,'') ilike '%'||btrim(p_query)||'%' or
        coalesce(v.imperium_proposal,'') ilike '%'||btrim(p_query)||'%' or
        coalesce(v.imperium_contract,'') ilike '%'||btrim(p_query)||'%' or
        coalesce(v.contract_number,'') ilike '%'||btrim(p_query)||'%' or
        coalesce(v.street,'') ilike '%'||btrim(p_query)||'%' or
        coalesce(v.neighborhood,'') ilike '%'||btrim(p_query)||'%' or
        v.consultant_name ilike '%'||btrim(p_query)||'%' or
        v.team_name ilike '%'||btrim(p_query)||'%'
      )
  ), paged as (
    select * from filtered order by coalesce(sold_at,created_at) desc, created_at desc limit v_limit offset v_offset
  ), stats as (
    select count(*)::int as total_count,
      count(*) filter(where status in ('approved','sync_pending','synced'))::int as approved_count,
      count(*) filter(where status in ('submitted','under_review','pending_correction'))::int as analysis_count,
      count(*) filter(where status='pending_correction')::int as pending_count,
      count(*) filter(where status='cancelled')::int as cancelled_count,
      count(*) filter(where status='draft')::int as draft_count,
      sum(total_value) as production_value
    from filtered
  )
  select jsonb_build_object(
    'role',v_role,
    'month_start',v_start,
    'month_end',v_end,
    'total',st.total_count,
    'approved',st.approved_count,
    'analysis',st.analysis_count,
    'pending',st.pending_count,
    'cancelled',st.cancelled_count,
    'drafts',st.draft_count,
    'production_value',case when v_role='consultant' then null else coalesce(st.production_value,0) end,
    'limit',v_limit,'offset',v_offset,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'sold_at',p.sold_at,'created_at',p.created_at,'status',p.status,'priority',p.priority,
      'city_name',p.city_name,'state',p.state,'customer_name',p.customer_name,'customer_phone',p.customer_phone,
      'customer_document',p.customer_document,'imperium_proposal',p.imperium_proposal,'imperium_contract',p.imperium_contract,
      'contract_number',p.contract_number,'consultant_id',p.consultant_id,'consultant_name',p.consultant_name,
      'team_id',p.team_id,'team_name',p.team_name,'commercial_leader',p.commercial_leader,
      'imperium_submit_status',p.imperium_submit_status,'imperium_sale_id',p.imperium_sale_id,'source',p.source,
      'real_product_summary',p.real_product_summary,'product_summary',p.product_summary,
      'sla_due_at',p.sla_due_at,'submitted_at',p.submitted_at,
      'total_value',case when v_role='consultant' then null else p.total_value end
    )) from paged p),'[]'::jsonb)
  ) into v_result from stats st;
  return coalesce(v_result,jsonb_build_object('items','[]'::jsonb,'total',0));
end
$function$;

create or replace function public.tv_sales_consultant_options_month(
  p_month_start date,
  p_month_end date,
  p_city text default null,
  p_team text default null,
  p_status text default null
)
returns table(consultant_name text, sales_count bigint, installed_count bigint, draft_count bigint)
language plpgsql
security definer
set search_path to 'public'
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
  with x as (
    select
      coalesce(cp.full_name,s.imperium_consultant_name,s.commercial_seller_name,'Sem consultor') as consultant_name,
      coalesce(t.name,s.imperium_team_name,'Sem equipe') as team_name,
      s.status,
      s.imperium_status
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
  )
  select x.consultant_name,
         count(*)::bigint as sales_count,
         count(*) filter(where x.status='synced' or upper(coalesce(x.imperium_status,''))='INSTALADA')::bigint as installed_count,
         count(*) filter(where x.status='draft')::bigint as draft_count
  from x
  where (p_team is null or p_team='' or lower(x.team_name)=lower(p_team))
    and (p_status is null or p_status='' or p_status='all' or (p_status='non_draft' and coalesce(x.status,'')<>'draft') or x.status=p_status)
  group by x.consultant_name
  order by count(*) desc, x.consultant_name asc;
end
$function$;

grant execute on function public.tv_sales_consultant_options_month(date,date,text,text,text) to authenticated;