create or replace function public.tv_backoffice_correct_imperium_product(p_sale_id uuid, p_product_row_id uuid, p_imperium_product_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_role text;
  sp public.tv_sale_products;
  m public.tv_imperium_reference_map;
  s public.tv_sales;
  v_price numeric;
begin
  v_role:=public.tv_current_role();
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then
    raise exception 'backoffice or admin required';
  end if;
  select * into s from public.tv_sales where id=p_sale_id for update;
  if s.id is null then raise exception 'sale not found'; end if;
  select * into sp from public.tv_sale_products where id=p_product_row_id and sale_id=p_sale_id for update;
  if sp.id is null then raise exception 'sale product not found'; end if;
  select * into m from public.tv_imperium_reference_map
   where base_key=s.imperium_base_key and entity_type='product' and imperium_id=p_imperium_product_id
     and source='imperium_direct' and active=true
   order by verified_at desc nulls last,id desc limit 1;
  if m.id is null then raise exception 'Imperium product is not valid for sale base'; end if;
  if coalesce(m.metadata->>'group','')<>coalesce(sp.product_group,'') then raise exception 'Imperium product group mismatch'; end if;
  v_price:=nullif(replace((regexp_match(m.imperium_name,'R\$\s*([0-9]+(?:[,.][0-9]{1,2})?)\s*$','i'))[1],',','.'),'')::numeric;
  update public.tv_sale_products set
    product_name=m.imperium_name,
    product_group=coalesce(m.metadata->>'group',product_group),
    monthly_value=coalesce(v_price,monthly_value),
    imperium_product_id=m.imperium_id,
    imperium_product_name=m.imperium_name,
    imperium_base_key=s.imperium_base_key,
    updated_at=now()
  where id=sp.id;

  update public.tv_sales x set
    real_product_summary=(select string_agg(p.product_name,' | ' order by p.created_at) from public.tv_sale_products p where p.sale_id=x.id),
    product_group_summary=(select string_agg(distinct p.product_group,' | ') from public.tv_sale_products p where p.sale_id=x.id),
    total_value=(select coalesce(sum(p.monthly_value*p.quantity),0) from public.tv_sale_products p where p.sale_id=x.id),
    documents_checked_at=null,
    documents_checked_by=null,
    registration_checked_at=null,
    registration_checked_by=null
  where x.id=s.id;
  return public.tv_backoffice_imperium_submission_bundle(s.id);
end
$$;

revoke all on function public.tv_backoffice_correct_imperium_product(uuid,uuid,bigint) from public;
grant execute on function public.tv_backoffice_correct_imperium_product(uuid,uuid,bigint) to authenticated,service_role;
