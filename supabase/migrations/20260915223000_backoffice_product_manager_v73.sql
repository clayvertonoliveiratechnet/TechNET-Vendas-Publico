-- Gerenciador de produtos do BackOffice: editar, adicionar, remover e validar contra o catálogo oficial do Imperium.

create or replace function public.tv_backoffice_update_sale_product(
  p_sale_id uuid,
  p_product_row_id uuid,
  p_imperium_product_id bigint,
  p_product_name text,
  p_monthly_value numeric,
  p_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_role text;
  s public.tv_sales;
  sp public.tv_sale_products;
  m public.tv_imperium_reference_map;
  v_base text;
  v_group text;
begin
  v_role:=public.tv_current_role();
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then raise exception 'backoffice or admin required'; end if;
  select * into s from public.tv_sales where id=p_sale_id for update;
  if s.id is null then raise exception 'sale not found'; end if;
  if s.source<>'technet' then raise exception 'only TechNET sales can be edited'; end if;
  if s.status not in ('submitted','under_review') then raise exception 'A venda só pode ser editada enquanto estiver em análise do BackOffice'; end if;
  select * into sp from public.tv_sale_products where id=p_product_row_id and sale_id=p_sale_id for update;
  if sp.id is null then raise exception 'sale product not found'; end if;
  if coalesce(p_monthly_value,-1)<0 then raise exception 'Valor do produto inválido'; end if;
  if coalesce(p_quantity,0)<1 then raise exception 'Quantidade inválida'; end if;
  v_base:=coalesce(nullif(s.imperium_base_key,''),(public.tv_backoffice_imperium_preflight(p_sale_id)->>'base_key'));
  if nullif(v_base,'') is null then raise exception 'Base do Imperium não identificada'; end if;
  select * into m from public.tv_imperium_reference_map
   where base_key=v_base and entity_type='product' and imperium_id=p_imperium_product_id
     and source='imperium_direct' and active=true
   order by verified_at desc nulls last,id desc limit 1;
  if m.id is null then raise exception 'IdProduto não é válido para a base desta venda'; end if;
  v_group:=coalesce(nullif(m.metadata->>'group',''),sp.product_group,'');

  update public.tv_sale_products set
    product_name=coalesce(nullif(btrim(p_product_name),''),m.imperium_name),
    product_group=v_group, monthly_value=p_monthly_value, quantity=p_quantity,
    imperium_product_id=m.imperium_id, imperium_product_name=m.imperium_name,
    imperium_base_key=v_base, updated_at=now()
  where id=sp.id;

  update public.tv_sales x set
    imperium_base_key=v_base,status='under_review',
    real_product_summary=(select string_agg(p.product_name,' | ' order by p.created_at) from public.tv_sale_products p where p.sale_id=x.id),
    product_group_summary=(select string_agg(distinct p.product_group,' | ') from public.tv_sale_products p where p.sale_id=x.id),
    total_value=(select coalesce(sum(p.monthly_value*p.quantity),0) from public.tv_sale_products p where p.sale_id=x.id)
  where x.id=s.id;
  insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note)
  values(s.id,auth.uid(),s.status,'under_review',format('Produto editado pelo BackOffice: %s / R$ %s / qtd %s -> %s / IdProduto %s / R$ %s / qtd %s',sp.product_name,sp.monthly_value,sp.quantity,coalesce(nullif(btrim(p_product_name),''),m.imperium_name),m.imperium_id,p_monthly_value,p_quantity));
  return public.tv_backoffice_imperium_fix_options(s.id);
end
$$;
revoke all on function public.tv_backoffice_update_sale_product(uuid,uuid,bigint,text,numeric,integer) from public;
grant execute on function public.tv_backoffice_update_sale_product(uuid,uuid,bigint,text,numeric,integer) to authenticated,service_role;

create or replace function public.tv_backoffice_add_sale_product(
  p_sale_id uuid,p_imperium_product_id bigint,p_product_name text,p_monthly_value numeric,p_quantity integer
)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_role text; s public.tv_sales; m public.tv_imperium_reference_map; v_base text; v_group text; v_name text; v_value numeric; v_price numeric;
begin
  v_role:=public.tv_current_role();
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then raise exception 'backoffice or admin required'; end if;
  select * into s from public.tv_sales where id=p_sale_id for update;
  if s.id is null then raise exception 'sale not found'; end if;
  if s.source<>'technet' then raise exception 'only TechNET sales can be edited'; end if;
  if s.status not in ('submitted','under_review') then raise exception 'A venda só pode ser editada enquanto estiver em análise do BackOffice'; end if;
  if coalesce(p_quantity,0)<1 then raise exception 'Quantidade inválida'; end if;
  v_base:=coalesce(nullif(s.imperium_base_key,''),(public.tv_backoffice_imperium_preflight(p_sale_id)->>'base_key'));
  if nullif(v_base,'') is null then raise exception 'Base do Imperium não identificada'; end if;
  select * into m from public.tv_imperium_reference_map where base_key=v_base and entity_type='product' and imperium_id=p_imperium_product_id and source='imperium_direct' and active=true order by verified_at desc nulls last,id desc limit 1;
  if m.id is null then raise exception 'IdProduto não é válido para a base desta venda'; end if;
  v_group:=coalesce(nullif(m.metadata->>'group',''),'OUTROS');
  v_name:=coalesce(nullif(btrim(p_product_name),''),m.imperium_name);
  begin v_price:=nullif(replace((regexp_match(m.imperium_name,'R\$\s*([0-9]+(?:[,.][0-9]{1,2})?)\s*$','i'))[1],',','.'),'')::numeric; exception when others then v_price:=null; end;
  v_value:=coalesce(p_monthly_value,v_price,0);
  if v_value<0 then raise exception 'Valor do produto inválido'; end if;
  insert into public.tv_sale_products(sale_id,product_name,product_group,monthly_value,quantity,source,imperium_product_id,imperium_product_name,imperium_base_key)
  values(s.id,v_name,v_group,v_value,p_quantity,'backoffice',m.imperium_id,m.imperium_name,v_base);
  update public.tv_sales x set imperium_base_key=v_base,status='under_review',
    real_product_summary=(select string_agg(p.product_name,' | ' order by p.created_at) from public.tv_sale_products p where p.sale_id=x.id),
    product_group_summary=(select string_agg(distinct p.product_group,' | ') from public.tv_sale_products p where p.sale_id=x.id),
    total_value=(select coalesce(sum(p.monthly_value*p.quantity),0) from public.tv_sale_products p where p.sale_id=x.id)
  where x.id=s.id;
  insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note)
  values(s.id,auth.uid(),s.status,'under_review',format('Produto adicionado pelo BackOffice: %s / IdProduto %s / R$ %s / qtd %s',v_name,m.imperium_id,v_value,p_quantity));
  return public.tv_backoffice_imperium_fix_options(s.id);
end
$$;
revoke all on function public.tv_backoffice_add_sale_product(uuid,bigint,text,numeric,integer) from public;
grant execute on function public.tv_backoffice_add_sale_product(uuid,bigint,text,numeric,integer) to authenticated,service_role;

create or replace function public.tv_backoffice_remove_sale_product(p_sale_id uuid,p_product_row_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_role text; s public.tv_sales; sp public.tv_sale_products; v_count integer;
begin
  v_role:=public.tv_current_role();
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then raise exception 'backoffice or admin required'; end if;
  select * into s from public.tv_sales where id=p_sale_id for update;
  if s.id is null then raise exception 'sale not found'; end if;
  if s.source<>'technet' then raise exception 'only TechNET sales can be edited'; end if;
  if s.status not in ('submitted','under_review') then raise exception 'A venda só pode ser editada enquanto estiver em análise do BackOffice'; end if;
  select count(*) into v_count from public.tv_sale_products where sale_id=s.id;
  if v_count<=1 then raise exception 'Adicione o produto correto antes de remover o último produto da venda'; end if;
  select * into sp from public.tv_sale_products where id=p_product_row_id and sale_id=s.id for update;
  if sp.id is null then raise exception 'sale product not found'; end if;
  delete from public.tv_sale_products where id=sp.id;
  update public.tv_sales x set status='under_review',
    real_product_summary=(select string_agg(p.product_name,' | ' order by p.created_at) from public.tv_sale_products p where p.sale_id=x.id),
    product_group_summary=(select string_agg(distinct p.product_group,' | ') from public.tv_sale_products p where p.sale_id=x.id),
    total_value=(select coalesce(sum(p.monthly_value*p.quantity),0) from public.tv_sale_products p where p.sale_id=x.id)
  where x.id=s.id;
  insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note) values(s.id,auth.uid(),s.status,'under_review',format('Produto removido pelo BackOffice: %s / R$ %s / qtd %s',sp.product_name,sp.monthly_value,sp.quantity));
  return public.tv_backoffice_imperium_fix_options(s.id);
end
$$;
revoke all on function public.tv_backoffice_remove_sale_product(uuid,uuid) from public;
grant execute on function public.tv_backoffice_remove_sale_product(uuid,uuid) to authenticated,service_role;

create or replace function public.tv_backoffice_imperium_fix_options(p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  s public.tv_sales; p public.tv_profiles; ia public.tv_imperium_accounts; v_role text; v_base text;
  v_products jsonb; v_options jsonb; v_teams jsonb; v_validated integer;
begin
  v_role:=public.tv_current_role();
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then raise exception 'backoffice or admin required'; end if;
  select * into s from public.tv_sales where id=p_sale_id;
  if s.id is null then raise exception 'sale not found'; end if;
  v_base:=coalesce(nullif(s.imperium_base_key,''),(public.tv_backoffice_imperium_preflight(p_sale_id)->>'base_key'));
  select * into p from public.tv_profiles where user_id=s.consultant_id;
  if p.imperium_account_id is not null then select * into ia from public.tv_imperium_accounts where id=p.imperium_account_id and active=true; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',sp.id,'product_name',sp.product_name,'product_group',sp.product_group,
    'monthly_value',sp.monthly_value,'quantity',sp.quantity,'source',sp.source,
    'imperium_product_id',sp.imperium_product_id,'imperium_product_name',sp.imperium_product_name,
    'validated',exists(select 1 from public.tv_imperium_reference_map m where m.base_key=v_base and m.entity_type='product' and m.imperium_id=sp.imperium_product_id and m.source='imperium_direct' and m.active=true)
  ) order by sp.created_at),'[]'::jsonb),
  count(*) filter(where sp.imperium_product_id is not null and exists(select 1 from public.tv_imperium_reference_map m where m.base_key=v_base and m.entity_type='product' and m.imperium_id=sp.imperium_product_id and m.source='imperium_direct' and m.active=true))
  into v_products,v_validated from public.tv_sale_products sp where sp.sale_id=s.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'imperium_id',x.imperium_id,'imperium_name',x.imperium_name,'product_group',x.product_group,'price',x.price
  ) order by x.product_group,x.price nulls last,x.imperium_name),'[]'::jsonb)
  into v_options from (
    select distinct on (m.imperium_id) m.imperium_id,m.imperium_name,coalesce(m.metadata->>'group','') product_group,
      nullif(replace((regexp_match(m.imperium_name,'R\$\s*([0-9]+(?:[,.][0-9]{1,2})?)\s*$','i'))[1],',','.'),'')::numeric price
    from public.tv_imperium_reference_map m
    where m.base_key=v_base and m.entity_type='product' and m.source='imperium_direct' and m.active=true
    order by m.imperium_id,m.verified_at desc nulls last,m.id desc
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'imperium_team_id',t.imperium_team_id) order by t.name),'[]'::jsonb)
  into v_teams from public.tv_teams t
  where t.active=true and t.imperium_team_id is not null and (s.city_id is null or t.city_id=s.city_id);

  return jsonb_build_object(
    'sale_id',s.id,'sale_status',s.status,'base_key',v_base,'current_team_id',s.team_id,
    'products',v_products,'products_total',jsonb_array_length(v_products),'products_validated',coalesce(v_validated,0),
    'product_options',v_options,'teams',v_teams,
    'consultant',jsonb_build_object('name',p.full_name,'account_id',ia.id,'account_base',ia.base_key,'imperium_user_id',ia.imperium_user_id,'account_active',coalesce(ia.active,false))
  );
end
$$;
revoke all on function public.tv_backoffice_imperium_fix_options(uuid) from public;
grant execute on function public.tv_backoffice_imperium_fix_options(uuid) to authenticated,service_role;


-- Preserva o IdProduto escolhido explicitamente pelo BackOffice; o trigger antigo sobrescrevia o vínculo ao alterar o nome local.
create or replace function public.tv_resolve_sale_product_imperium_ref_trg()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_base text; v_id bigint; v_name text;
begin
  select nullif(s.imperium_base_key,'') into v_base from public.tv_sales s where s.id=new.sale_id;
  v_base:=coalesce(v_base,nullif(new.imperium_base_key,''));
  if v_base is null then return new; end if;
  if new.imperium_product_id is not null then
    select r.imperium_id,r.imperium_name into v_id,v_name from public.tv_imperium_reference_map r
     where r.base_key=v_base and r.entity_type='product' and r.active=true and r.imperium_id=new.imperium_product_id
     order by r.verified_at desc nulls last,r.id desc limit 1;
    if v_id is not null then
      new.imperium_base_key:=v_base; new.imperium_product_id:=v_id; new.imperium_product_name:=v_name; return new;
    end if;
  end if;
  select r.imperium_id,r.imperium_name into v_id,v_name from public.tv_imperium_reference_map r
   where r.base_key=v_base and r.entity_type='product' and r.active=true and upper(trim(r.local_key))=upper(trim(new.product_name))
   order by r.verified_at desc nulls last,r.id desc limit 1;
  new.imperium_base_key:=v_base; new.imperium_product_id:=v_id; new.imperium_product_name:=v_name;
  return new;
end
$$;
