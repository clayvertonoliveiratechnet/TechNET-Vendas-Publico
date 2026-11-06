create or replace function public.tv_backoffice_imperium_product_options(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  s public.tv_sales;
  v_role text;
  v_items jsonb;
begin
  v_role:=public.tv_current_role();
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then
    raise exception 'backoffice or admin required';
  end if;
  select * into s from public.tv_sales where id=p_sale_id;
  if s.id is null then raise exception 'sale not found'; end if;
  select coalesce(jsonb_agg(x order by abs(coalesce(x.price,0)-coalesce(x.current_value,0)),x.imperium_name),'[]'::jsonb)
    into v_items
  from (
    select distinct m.imperium_id,m.imperium_name,m.metadata->>'group' product_group,
      nullif(replace((regexp_match(m.imperium_name,'R\$\s*([0-9]+(?:[,.][0-9]{1,2})?)\s*$','i'))[1],',','.'),'')::numeric price,
      sp.monthly_value current_value
    from public.tv_imperium_reference_map m
    join public.tv_sale_products sp on sp.sale_id=s.id and coalesce(m.metadata->>'group','')=coalesce(sp.product_group,'')
    where m.base_key=s.imperium_base_key and m.entity_type='product' and m.source='imperium_direct' and m.active=true
  ) x;
  return jsonb_build_object('sale_id',s.id,'base_key',s.imperium_base_key,'items',v_items);
end
$$;

revoke all on function public.tv_backoffice_imperium_product_options(uuid) from public;
grant execute on function public.tv_backoffice_imperium_product_options(uuid) to authenticated,service_role;
