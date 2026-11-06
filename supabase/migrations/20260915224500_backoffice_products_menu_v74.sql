create or replace function public.tv_backoffice_product_validation_queue(
  p_base text default '',
  p_filter text default 'all',
  p_search text default '',
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_role text;
  v_result jsonb;
begin
  v_role:=public.tv_current_role();
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then
    raise exception 'backoffice or admin required';
  end if;

  with sale_rows as (
    select
      s.id,
      s.customer_name,
      s.city_name,
      s.status,
      s.total_value,
      s.submitted_at,
      s.reviewed_at,
      s.registration_checked_at,
      s.active_confirmed_at,
      coalesce(p.full_name,'Consultor não identificado') as consultant_name,
      coalesce(t.name,'Sem equipe') as team_name,
      coalesce(nullif(s.imperium_base_key,''),case
        when lower(coalesce(s.city_name,'')) in ('natal','parnamirim','extremoz','macaíba','macaiba','ceará-mirim','ceara-mirim','são gonçalo do amarante','sao goncalo do amarante') then 'natal'
        when lower(coalesce(s.city_name,'')) in ('fortaleza','aquiraz','caucaia','eusébio','eusebio','maracanaú','maracanau') then 'fortaleza'
        when lower(coalesce(s.city_name,'')) in ('mossoró','mossoro') then 'mossoro'
        when lower(coalesce(s.city_name,'')) in ('recife','camaragibe','jaboatão dos guararapes','jaboatao dos guararapes','olinda','paulista') then 'recife'
        else null end) as base_key,
      count(sp.id)::int as products_total,
      count(sp.id) filter (
        where sp.imperium_product_id is not null
          and exists (
            select 1 from public.tv_imperium_reference_map m
            where m.entity_type='product'
              and m.imperium_id=sp.imperium_product_id
              and m.active=true
              and m.base_key=coalesce(nullif(s.imperium_base_key,''),case
                when lower(coalesce(s.city_name,'')) in ('natal','parnamirim','extremoz','macaíba','macaiba','ceará-mirim','ceara-mirim','são gonçalo do amarante','sao goncalo do amarante') then 'natal'
                when lower(coalesce(s.city_name,'')) in ('fortaleza','aquiraz','caucaia','eusébio','eusebio','maracanaú','maracanau') then 'fortaleza'
                when lower(coalesce(s.city_name,'')) in ('mossoró','mossoro') then 'mossoro'
                when lower(coalesce(s.city_name,'')) in ('recife','camaragibe','jaboatão dos guararapes','jaboatao dos guararapes','olinda','paulista') then 'recife'
                else null end)
          )
      )::int as products_validated,
      coalesce(string_agg(sp.product_name,' | ' order by sp.created_at),'') as product_summary
    from public.tv_sales s
    left join public.tv_profiles p on p.user_id=s.consultant_id
    left join public.tv_teams t on t.id=s.team_id
    left join public.tv_sale_products sp on sp.sale_id=s.id
    where s.source='technet'
      and s.status in ('submitted','under_review')
    group by s.id,p.full_name,t.name
  ), scoped as (
    select r.* from sale_rows r
    where (coalesce(p_base,'')='' or r.base_key=p_base)
      and (
        coalesce(btrim(p_search),'')=''
        or lower(r.customer_name) like '%'||lower(btrim(p_search))||'%'
        or lower(r.consultant_name) like '%'||lower(btrim(p_search))||'%'
        or lower(r.team_name) like '%'||lower(btrim(p_search))||'%'
        or lower(r.product_summary) like '%'||lower(btrim(p_search))||'%'
      )
  ), listed as (
    select r.* from scoped r
    where case lower(coalesce(p_filter,'all'))
      when 'pending' then r.products_total=0 or r.products_validated<r.products_total
      when 'validated' then r.products_total>0 and r.products_validated=r.products_total
      else true end
    order by
      case when r.products_total=0 or r.products_validated<r.products_total then 0 else 1 end,
      r.submitted_at nulls last,
      r.customer_name
    limit least(greatest(coalesce(p_limit,200),1),500)
  )
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'sales_total',(select count(*) from scoped),
      'sales_pending',(select count(*) from scoped where products_total=0 or products_validated<products_total),
      'sales_validated',(select count(*) from scoped where products_total>0 and products_validated=products_total),
      'products_total',(select coalesce(sum(products_total),0) from scoped),
      'products_validated',(select coalesce(sum(products_validated),0) from scoped),
      'products_pending',(select coalesce(sum(greatest(products_total-products_validated,0)),0) from scoped)
    ),
    'sales',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,
      'customer_name',customer_name,
      'city_name',city_name,
      'base_key',base_key,
      'status',status,
      'total_value',total_value,
      'submitted_at',submitted_at,
      'reviewed_at',reviewed_at,
      'consultant_name',consultant_name,
      'team_name',team_name,
      'products_total',products_total,
      'products_validated',products_validated,
      'products_pending',greatest(products_total-products_validated,0),
      'product_summary',product_summary,
      'registration_confirmed',registration_checked_at is not null,
      'active_confirmed',active_confirmed_at is not null
    )) from listed),'[]'::jsonb)
  ) into v_result;

  return v_result;
end
$$;

revoke all on function public.tv_backoffice_product_validation_queue(text,text,text,integer) from public;
grant execute on function public.tv_backoffice_product_validation_queue(text,text,text,integer) to authenticated,service_role;
