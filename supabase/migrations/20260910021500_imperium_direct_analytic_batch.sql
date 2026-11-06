create or replace function public.tv_cloud_upsert_imperium_analytic_batch(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_received integer := 0;
  v_inserted integer := 0;
  v_direct_updated integer := 0;
  v_enriched integer := 0;
  v_deleted integer := 0;
  v_users integer := 0;
begin
  if coalesce(auth.role(),'') <> 'service_role'
     and current_user <> 'postgres'
     and session_user <> 'postgres' then
    raise exception 'internal only';
  end if;

  if jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows)=0
     or jsonb_array_length(p_rows)>750 then
    raise exception 'invalid rows';
  end if;

  v_received := jsonb_array_length(p_rows);

  with src as (
    select *
    from jsonb_to_recordset(p_rows) as x(
      source_key text,
      status text,
      customer_name text,
      city_name text,
      state text,
      product_summary text,
      total_value numeric,
      notes text,
      imperium_sale_id bigint,
      imperium_proposal text,
      imperium_contract text,
      imperium_status text,
      imperium_base_key text,
      imperium_customer_id bigint,
      imperium_consultant_id bigint,
      imperium_consultant_name text,
      imperium_team_id bigint,
      imperium_team_name text,
      imperium_raw jsonb,
      sold_at timestamptz,
      synced_at timestamptz,
      real_product_summary text,
      product_group_summary text,
      payment_method text,
      commercial_company text,
      commercial_leader text,
      commercial_seller_name text,
      sale_type text
    )
  ), ins as (
    insert into public.tv_sales(
      source,source_key,status,customer_name,city_name,state,
      product_summary,total_value,notes,
      imperium_sale_id,imperium_proposal,imperium_contract,imperium_status,imperium_base_key,
      imperium_customer_id,imperium_consultant_id,imperium_consultant_name,
      imperium_team_id,imperium_team_name,imperium_raw,sold_at,synced_at,
      real_product_summary,product_group_summary,payment_method,
      commercial_company,commercial_leader,commercial_seller_name,sale_type,
      commercial_enriched_at,commercial_enrich_status
    )
    select
      'imperium',x.source_key,coalesce(x.status,'under_review'),x.customer_name,x.city_name,x.state,
      x.product_summary,greatest(coalesce(x.total_value,0),0),x.notes,
      x.imperium_sale_id,x.imperium_proposal,x.imperium_contract,x.imperium_status,x.imperium_base_key,
      x.imperium_customer_id,x.imperium_consultant_id,x.imperium_consultant_name,
      x.imperium_team_id,x.imperium_team_name,
      coalesce(x.imperium_raw,'{}'::jsonb) || jsonb_build_object('analytic_direct',true),
      x.sold_at,coalesce(x.synced_at,now()),
      nullif(x.real_product_summary,''),nullif(x.product_group_summary,''),nullif(x.payment_method,''),
      nullif(x.commercial_company,''),nullif(x.commercial_leader,''),nullif(x.commercial_seller_name,''),nullif(x.sale_type,''),
      case when coalesce(x.total_value,0)>0 or nullif(x.real_product_summary,'') is not null then now() end,
      case when coalesce(x.total_value,0)>0 or nullif(x.real_product_summary,'') is not null then 'analytic_direct' end
    from src x
    where nullif(btrim(coalesce(x.source_key,'')),'') is not null
      and nullif(btrim(coalesce(x.customer_name,'')),'') is not null
      and nullif(btrim(coalesce(x.imperium_base_key,'')),'') is not null
    on conflict(source,source_key) do nothing
    returning id
  )
  select count(*) into v_inserted from ins;

  with users as (
    select distinct on (x.imperium_base_key,x.imperium_consultant_id)
      x.imperium_base_key as base_key,
      x.imperium_consultant_id as imperium_person_id,
      x.imperium_consultant_name as display_name,
      x.imperium_team_id,
      x.imperium_team_name as team_name
    from jsonb_to_recordset(p_rows) as x(
      imperium_base_key text,
      imperium_consultant_id bigint,
      imperium_consultant_name text,
      imperium_team_id bigint,
      imperium_team_name text
    )
    where x.imperium_consultant_id is not null
      and nullif(btrim(coalesce(x.imperium_consultant_name,'')),'') is not null
  )
  insert into public.tv_imperium_users(
    base_key,imperium_person_id,display_name,imperium_team_id,team_name,last_seen_at,active
  )
  select base_key,imperium_person_id,display_name,imperium_team_id,team_name,now(),true
  from users
  on conflict(base_key,imperium_person_id) do update set
    display_name=excluded.display_name,
    imperium_team_id=excluded.imperium_team_id,
    team_name=excluded.team_name,
    last_seen_at=now(),
    active=true;
  get diagnostics v_users = row_count;

  with src as (
    select *
    from jsonb_to_recordset(p_rows) as x(
      source_key text,
      status text,
      customer_name text,
      city_name text,
      state text,
      product_summary text,
      notes text,
      imperium_sale_id bigint,
      imperium_proposal text,
      imperium_contract text,
      imperium_status text,
      imperium_base_key text,
      imperium_customer_id bigint,
      imperium_consultant_id bigint,
      imperium_consultant_name text,
      imperium_team_id bigint,
      imperium_team_name text,
      imperium_raw jsonb,
      sold_at timestamptz,
      synced_at timestamptz
    )
  )
  update public.tv_sales s set
    status=coalesce(x.status,s.status),
    customer_name=coalesce(nullif(x.customer_name,''),s.customer_name),
    city_name=coalesce(nullif(x.city_name,''),s.city_name),
    state=coalesce(nullif(x.state,''),s.state),
    product_summary=coalesce(nullif(x.product_summary,''),s.product_summary),
    notes=coalesce(x.notes,s.notes),
    imperium_sale_id=coalesce(x.imperium_sale_id,s.imperium_sale_id),
    imperium_proposal=coalesce(nullif(x.imperium_proposal,''),s.imperium_proposal),
    imperium_contract=coalesce(nullif(x.imperium_contract,''),s.imperium_contract),
    imperium_status=coalesce(nullif(x.imperium_status,''),s.imperium_status),
    imperium_base_key=coalesce(nullif(x.imperium_base_key,''),s.imperium_base_key),
    imperium_customer_id=coalesce(x.imperium_customer_id,s.imperium_customer_id),
    imperium_consultant_id=coalesce(x.imperium_consultant_id,s.imperium_consultant_id),
    imperium_consultant_name=coalesce(nullif(x.imperium_consultant_name,''),s.imperium_consultant_name),
    imperium_team_id=coalesce(x.imperium_team_id,s.imperium_team_id),
    imperium_team_name=coalesce(nullif(x.imperium_team_name,''),s.imperium_team_name),
    imperium_raw=coalesce(x.imperium_raw,'{}'::jsonb) || jsonb_build_object('analytic_direct',true),
    sold_at=coalesce(x.sold_at,s.sold_at),
    synced_at=coalesce(x.synced_at,now()),
    updated_at=now()
  from src x
  where s.source='imperium'
    and s.source_key=x.source_key
    and coalesce(s.imperium_raw->>'analytic_direct','false')='true';
  get diagnostics v_direct_updated = row_count;

  with src as (
    select *
    from jsonb_to_recordset(p_rows) as x(
      source_key text,
      total_value numeric,
      real_product_summary text,
      product_group_summary text,
      payment_method text,
      commercial_company text,
      commercial_leader text,
      commercial_seller_name text,
      sale_type text,
      synced_at timestamptz
    )
  )
  update public.tv_sales s set
    total_value=case when coalesce(x.total_value,0)>0 then x.total_value else s.total_value end,
    real_product_summary=coalesce(nullif(x.real_product_summary,''),s.real_product_summary),
    product_group_summary=coalesce(nullif(x.product_group_summary,''),s.product_group_summary),
    payment_method=coalesce(nullif(x.payment_method,''),s.payment_method),
    commercial_company=coalesce(nullif(x.commercial_company,''),s.commercial_company),
    commercial_leader=coalesce(nullif(x.commercial_leader,''),s.commercial_leader),
    commercial_seller_name=coalesce(nullif(x.commercial_seller_name,''),s.commercial_seller_name),
    sale_type=coalesce(nullif(x.sale_type,''),s.sale_type),
    commercial_enriched_at=case
      when coalesce(x.total_value,0)>0 or nullif(x.real_product_summary,'') is not null
        then coalesce(x.synced_at,now())
      else s.commercial_enriched_at
    end,
    commercial_enrich_status=case
      when coalesce(x.total_value,0)>0 or nullif(x.real_product_summary,'') is not null
        then 'analytic_direct'
      else s.commercial_enrich_status
    end,
    updated_at=now()
  from src x
  where s.source='imperium'
    and s.source_key=x.source_key
    and (
      (coalesce(x.total_value,0)>0 and s.total_value is distinct from x.total_value)
      or (nullif(x.real_product_summary,'') is not null and s.real_product_summary is distinct from x.real_product_summary)
      or (nullif(x.product_group_summary,'') is not null and s.product_group_summary is distinct from x.product_group_summary)
      or (nullif(x.payment_method,'') is not null and s.payment_method is distinct from x.payment_method)
      or (nullif(x.commercial_company,'') is not null and s.commercial_company is distinct from x.commercial_company)
      or (nullif(x.commercial_leader,'') is not null and s.commercial_leader is distinct from x.commercial_leader)
      or (nullif(x.commercial_seller_name,'') is not null and s.commercial_seller_name is distinct from x.commercial_seller_name)
      or (nullif(x.sale_type,'') is not null and s.sale_type is distinct from x.sale_type)
      or (coalesce(x.total_value,0)>0 and s.commercial_enrich_status is distinct from 'analytic_direct')
    );
  get diagnostics v_enriched = row_count;

  with src as (
    select distinct
      x.source_key,
      lower(nullif(btrim(coalesce(x.imperium_base_key,'')),'')) as base_key,
      nullif(btrim(coalesce(x.imperium_contract,'')),'') as contract
    from jsonb_to_recordset(p_rows) as x(
      source_key text,
      imperium_base_key text,
      imperium_contract text
    )
  )
  delete from public.tv_sales a
  using src x
  where a.source='imperium'
    and a.source_key like 'analytic:%'
    and x.base_key is not null
    and x.contract is not null
    and lower(coalesce(a.imperium_base_key,''))=x.base_key
    and a.imperium_contract=x.contract
    and exists(
      select 1
      from public.tv_sales c
      where c.source='imperium'
        and c.source_key=x.source_key
        and c.source_key not like 'analytic:%'
    );
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'ok',true,
    'received',v_received,
    'inserted',v_inserted,
    'direct_updated',v_direct_updated,
    'enriched',v_enriched,
    'analytic_placeholders_deleted',v_deleted,
    'users',v_users
  );
end
$function$;

revoke all on function public.tv_cloud_upsert_imperium_analytic_batch(jsonb) from public;
revoke all on function public.tv_cloud_upsert_imperium_analytic_batch(jsonb) from anon;
revoke all on function public.tv_cloud_upsert_imperium_analytic_batch(jsonb) from authenticated;
grant execute on function public.tv_cloud_upsert_imperium_analytic_batch(jsonb) to service_role;
