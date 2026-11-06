create or replace function public.tv_import_imperium_analytic_rows(p_base text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_role text := public.tv_current_role();
  v_base text := lower(trim(coalesce(p_base,'')));
  v_city text;
  v_state text;
  v_received integer := 0;
  v_imported integer := 0;
  v_skipped integer := 0;
begin
  if v_role not in ('admin','backoffice') then
    raise exception 'admin or backoffice required';
  end if;
  if v_base not in ('natal','fortaleza','mossoro','recife') then
    raise exception 'invalid base';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows)=0 or jsonb_array_length(p_rows)>1000 then
    raise exception 'invalid rows';
  end if;

  v_received := jsonb_array_length(p_rows);
  select case v_base
    when 'natal' then 'Natal / Parnamirim'
    when 'fortaleza' then 'Fortaleza'
    when 'mossoro' then 'Mossoró'
    when 'recife' then 'Recife'
  end,
  case v_base
    when 'natal' then 'RN'
    when 'fortaleza' then 'CE'
    when 'mossoro' then 'RN'
    when 'recife' then 'PE'
  end
  into v_city,v_state;

  with raw as (
    select *
    from jsonb_to_recordset(p_rows) as x(
      contract text,
      customer_name text,
      seller text,
      value numeric,
      sale_type text,
      source_type text,
      install_date date,
      payment text,
      products text,
      supervisor text,
      company text,
      virtua integer,
      chip integer,
      tv integer,
      fone integer,
      dcc integer
    )
  ),
  src as (
    select distinct on (nullif(btrim(contract),''), upper(btrim(coalesce(sale_type,''))))
      nullif(btrim(contract),'') as contract,
      nullif(btrim(customer_name),'') as customer_name,
      nullif(btrim(seller),'') as seller,
      greatest(coalesce(value,0),0) as value,
      case
        when upper(btrim(coalesce(sale_type,''))) in ('NOVA','NV') then 'NV'
        when upper(btrim(coalesce(sale_type,''))) in ('UP','UP-PN','UP-PE') then
          case when upper(btrim(coalesce(sale_type,'')))='UP-PE' then 'UP-PE' else 'UP-PN' end
        else upper(btrim(coalesce(sale_type,'')))
      end as ptype,
      nullif(btrim(source_type),'') as source_type,
      install_date,
      nullif(btrim(payment),'') as payment,
      nullif(btrim(products),'') as products,
      nullif(btrim(supervisor),'') as supervisor,
      nullif(btrim(company),'') as company,
      greatest(coalesce(virtua,0),0) as virtua,
      greatest(coalesce(chip,0),0) as chip,
      greatest(coalesce(tv,0),0) as tv,
      greatest(coalesce(fone,0),0) as fone,
      greatest(coalesce(dcc,0),0) as dcc
    from raw
    where nullif(btrim(contract),'') is not null
      and nullif(btrim(customer_name),'') is not null
      and install_date is not null
    order by nullif(btrim(contract),''), upper(btrim(coalesce(sale_type,''))), install_date desc
  ),
  candidates as (
    select s.*
    from src s
    where s.ptype in ('NV','UP-PN','UP-PE')
      and not exists (
        select 1
        from public.tv_sales old
        where old.source='imperium'
          and lower(coalesce(old.imperium_base_key,''))=v_base
          and old.imperium_contract=s.contract
          and upper(coalesce(old.product_summary,''))=s.ptype
          and old.source_key not like 'analytic:%'
      )
  ),
  ins as (
    insert into public.tv_sales(
      source,source_key,status,customer_name,city_name,state,geocode_status,
      product_summary,real_product_summary,product_group_summary,total_value,notes,
      imperium_contract,imperium_status,imperium_base_key,imperium_consultant_name,imperium_team_name,imperium_raw,
      sold_at,synced_at,payment_method,commercial_company,commercial_leader,commercial_seller_name,
      commercial_enriched_at,commercial_enrich_status
    )
    select
      'imperium',
      'analytic:'||v_base||':'||c.contract||':'||c.ptype,
      'synced',
      c.customer_name,
      v_city,
      v_state,
      'manual',
      c.ptype,
      c.products,
      nullif(concat_ws(' + ',
        case when c.virtua>0 then 'BANDA LARGA' end,
        case when c.chip>0 then 'TELEFONIA MÓVEL' end,
        case when c.tv>0 then 'TV' end,
        case when c.fone>0 then 'TELEFONIA FIXA' end
      ),''),
      c.value,
      'Reconciliação do relatório Analítico exportado diretamente do Imperium.',
      c.contract,
      'INSTALADA',
      v_base,
      c.seller,
      c.supervisor,
      jsonb_strip_nulls(jsonb_build_object(
        'analytic_import',true,
        'DataInstalacao',c.install_date::text,
        'TipoVenda',coalesce(c.source_type,c.ptype),
        'FormaPagamento',c.payment,
        'Produtos',c.products,
        'Supervisor',c.supervisor,
        'Empresa',c.company,
        'VIRTUA',c.virtua,
        'CHIP',c.chip,
        'TV',c.tv,
        'FONE',c.fone,
        'DCC',c.dcc
      )),
      c.install_date::timestamp at time zone 'America/Fortaleza',
      now(),
      case when upper(coalesce(c.payment,'')) like '%DCC%' or c.dcc>0 then 'DCC' else 'BOLETO' end,
      c.company,
      c.supervisor,
      c.seller,
      now(),
      'analytic'
    from candidates c
    on conflict(source,source_key) do update set
      status=excluded.status,
      customer_name=excluded.customer_name,
      city_name=excluded.city_name,
      state=excluded.state,
      product_summary=excluded.product_summary,
      real_product_summary=excluded.real_product_summary,
      product_group_summary=excluded.product_group_summary,
      total_value=excluded.total_value,
      notes=excluded.notes,
      imperium_contract=excluded.imperium_contract,
      imperium_status=excluded.imperium_status,
      imperium_base_key=excluded.imperium_base_key,
      imperium_consultant_name=excluded.imperium_consultant_name,
      imperium_team_name=excluded.imperium_team_name,
      imperium_raw=excluded.imperium_raw,
      sold_at=excluded.sold_at,
      synced_at=excluded.synced_at,
      payment_method=excluded.payment_method,
      commercial_company=excluded.commercial_company,
      commercial_leader=excluded.commercial_leader,
      commercial_seller_name=excluded.commercial_seller_name,
      commercial_enriched_at=excluded.commercial_enriched_at,
      commercial_enrich_status=excluded.commercial_enrich_status,
      updated_at=now()
    returning id
  )
  select count(*) into v_imported from ins;

  v_skipped := greatest(v_received-v_imported,0);
  return jsonb_build_object('ok',true,'base',v_base,'received',v_received,'imported',v_imported,'skipped',v_skipped);
end
$function$;

revoke all on function public.tv_import_imperium_analytic_rows(text,jsonb) from public;
grant execute on function public.tv_import_imperium_analytic_rows(text,jsonb) to authenticated;

create or replace function public.tv_remove_analytic_placeholder_on_canonical()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if new.source='imperium'
     and coalesce(new.source_key,'') not like 'analytic:%'
     and nullif(btrim(coalesce(new.imperium_contract,'')),'') is not null
     and nullif(btrim(coalesce(new.product_summary,'')),'') is not null then
    delete from public.tv_sales a
    where a.id<>new.id
      and a.source='imperium'
      and a.source_key like 'analytic:%'
      and lower(coalesce(a.imperium_base_key,''))=lower(coalesce(new.imperium_base_key,''))
      and a.imperium_contract=new.imperium_contract
      and upper(coalesce(a.product_summary,''))=upper(coalesce(new.product_summary,''));
  end if;
  return new;
end
$function$;

drop trigger if exists trg_tv_sales_remove_analytic_placeholder on public.tv_sales;
create trigger trg_tv_sales_remove_analytic_placeholder
after insert or update of source_key,imperium_base_key,imperium_contract,product_summary
on public.tv_sales
for each row
execute function public.tv_remove_analytic_placeholder_on_canonical();
