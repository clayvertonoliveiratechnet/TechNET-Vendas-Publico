alter table public.tv_sale_products add column if not exists imperium_product_id bigint;
alter table public.tv_sale_products add column if not exists imperium_product_name text;
alter table public.tv_sale_products add column if not exists imperium_base_key text;

create or replace function public.tv_resolve_sale_product_imperium_ref_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_base text;
  v_id bigint;
  v_name text;
begin
  select nullif(s.imperium_base_key,'') into v_base from public.tv_sales s where s.id=new.sale_id;
  if v_base is null then return new; end if;

  select r.imperium_id,r.imperium_name into v_id,v_name
    from public.tv_imperium_reference_map r
   where r.base_key=v_base and r.entity_type='product' and r.active=true
     and upper(trim(r.local_key))=upper(trim(new.product_name))
   order by r.verified_at desc nulls last,r.id desc limit 1;

  new.imperium_base_key:=v_base;
  new.imperium_product_id:=v_id;
  new.imperium_product_name:=v_name;
  return new;
end
$$;

drop trigger if exists trg_tv_sale_products_resolve_imperium_ref on public.tv_sale_products;
create trigger trg_tv_sale_products_resolve_imperium_ref
before insert or update of sale_id,product_name on public.tv_sale_products
for each row execute function public.tv_resolve_sale_product_imperium_ref_trg();

create index if not exists idx_tv_sale_products_imperium_ref
on public.tv_sale_products(imperium_base_key,imperium_product_id)
where imperium_product_id is not null;

-- Build safe aliases only when a historic catalog name/value identifies one direct
-- Imperium product unambiguously in the same base.
with d as (
  select base_key,imperium_id,imperium_name,
         upper(trim(regexp_replace(regexp_replace(imperium_name,
           '\s*-\s*R\$\s*[0-9]+([,.][0-9]{1,2})?\s*$','','i'),'\s+',' ','g'))) key,
         nullif(replace((regexp_match(imperium_name,
           'R\$\s*([0-9]+(?:[,.][0-9]{1,2})?)\s*$','i'))[1],',','.'),'')::numeric price
    from public.tv_imperium_reference_map
   where entity_type='product' and source='imperium_direct' and active
), p as (
  select distinct base_key,product_name,product_group,latest_value,
         upper(trim(regexp_replace(product_name,'\s+',' ','g'))) key
    from public.tv_imperium_products where active
), m as (
  select p.base_key,p.product_name,p.product_group,p.latest_value,
         min(d.imperium_id) imperium_id,min(d.imperium_name) imperium_name,count(*) matches
    from p join d on d.base_key=p.base_key and d.key=p.key
     and abs(coalesce(d.price,p.latest_value)-p.latest_value)<=0.05
   group by p.base_key,p.product_name,p.product_group,p.latest_value
  having count(*)=1
)
insert into public.tv_imperium_reference_map(
  base_key,entity_type,local_key,imperium_id,imperium_name,metadata,source,active,verified_at,updated_at
)
select base_key,'product',product_name,imperium_id,imperium_name,
       jsonb_build_object('group',product_group,'matched_value',latest_value,'match','normalized_name_price'),
       'imperium_direct_alias',true,now(),now()
  from m
on conflict(base_key,entity_type,local_key) do nothing;

-- Re-run the resolver against existing products. Unknown/ambiguous products remain null.
update public.tv_sale_products p
   set product_name=p.product_name
 where exists(select 1 from public.tv_sales s where s.id=p.sale_id);
