-- O BackOffice s? enxerga produtos ATIVOS liberados pelo admin.
create or replace function public.tv_backoffice_imperium_product_options(p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare s public.tv_sales; v_role text; v_base text; v_items jsonb;
begin
 v_role:=public.tv_current_role();
 if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then raise exception 'backoffice or admin required'; end if;
 select * into s from public.tv_sales where id=p_sale_id;
 if s.id is null then raise exception 'sale not found'; end if;
 v_base:=coalesce(nullif(s.imperium_base_key,''),(select case c.name
  when 'Natal' then 'natal' when 'Parnamirim' then 'natal' when 'Extremoz' then 'natal' when 'Maca?ba' then 'natal'
  when 'Cear?-Mirim' then 'natal' when 'S?o Gon?alo do Amarante' then 'natal'
  when 'Fortaleza' then 'fortaleza' when 'Aquiraz' then 'fortaleza' when 'Caucaia' then 'fortaleza' when 'Eus?bio' then 'fortaleza' when 'Maracana?' then 'fortaleza'
  when 'Mossor?' then 'mossoro' when 'Recife' then 'recife' when 'Camaragibe' then 'recife'
  when 'Jaboat?o dos Guararapes' then 'recife' when 'Olinda' then 'recife' when 'Paulista' then 'recife' else null end
  from public.tv_cities c where c.id=s.city_id));
 select coalesce(jsonb_agg(x order by abs(coalesce(x.price,0)-coalesce(x.current_value,0)),x.imperium_name),'[]'::jsonb) into v_items
 from (
  select distinct m.imperium_id,m.imperium_name,m.metadata->>'group' product_group,
   nullif(replace((regexp_match(m.imperium_name,'R\$\s*([0-9]+(?:[,.][0-9]{1,2})?)\s*$','i'))[1],',','.'),'')::numeric price,
   sp.monthly_value current_value
  from public.tv_imperium_reference_map m
  join public.tv_imperium_product_selection sel on sel.base_key=m.base_key and sel.imperium_product_id=m.imperium_id and sel.enabled=true
  join public.tv_sale_products sp on sp.sale_id=s.id
   and (case upper(trim(coalesce(m.metadata->>'group',''))) when 'TELEFONIA FIXA' then 'TELEFONE' when 'TELEFONE FIXO' then 'TELEFONE' else upper(trim(coalesce(m.metadata->>'group',''))) end)
    =(case upper(trim(coalesce(sp.product_group,''))) when 'TELEFONIA FIXA' then 'TELEFONE' when 'TELEFONE FIXO' then 'TELEFONE' else upper(trim(coalesce(sp.product_group,''))) end)
  where m.base_key=v_base and m.entity_type='product' and m.source='imperium_direct' and m.active=true
    and upper(coalesce(m.metadata->>'status',''))='ATIVO'
 ) x;
 return jsonb_build_object('sale_id',s.id,'base_key',v_base,'items',v_items);
end $$;
revoke all on function public.tv_backoffice_imperium_product_options(uuid) from public;
grant execute on function public.tv_backoffice_imperium_product_options(uuid) to authenticated,service_role;

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
  'id',sp.id,'product_name',sp.product_name,'product_group',sp.product_group,'monthly_value',sp.monthly_value,'quantity',sp.quantity,'source',sp.source,
  'imperium_product_id',sp.imperium_product_id,'imperium_product_name',sp.imperium_product_name,'validated',public.tv_imperium_product_enabled(v_base,sp.imperium_product_id)
 ) order by sp.created_at),'[]'::jsonb),count(*) filter(where public.tv_imperium_product_enabled(v_base,sp.imperium_product_id))
 into v_products,v_validated from public.tv_sale_products sp where sp.sale_id=s.id;
 select coalesce(jsonb_agg(jsonb_build_object('imperium_id',x.imperium_id,'imperium_name',x.imperium_name,'product_group',x.product_group,'price',x.price)
  order by x.product_group,x.price nulls last,x.imperium_name),'[]'::jsonb) into v_options
 from (
  select distinct on (m.imperium_id) m.imperium_id,m.imperium_name,coalesce(m.metadata->>'group','') product_group,
   nullif(replace((regexp_match(m.imperium_name,'R\$\s*([0-9]+(?:[,.][0-9]{1,2})?)\s*$','i'))[1],',','.'),'')::numeric price
  from public.tv_imperium_reference_map m
  join public.tv_imperium_product_selection sel on sel.base_key=m.base_key and sel.imperium_product_id=m.imperium_id and sel.enabled=true
  where m.base_key=v_base and m.entity_type='product' and m.source='imperium_direct' and m.active=true
    and upper(coalesce(m.metadata->>'status',''))='ATIVO'
  order by m.imperium_id,m.verified_at desc nulls last,m.id desc
 ) x;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'imperium_team_id',t.imperium_team_id) order by t.name),'[]'::jsonb)
 into v_teams from public.tv_teams t where t.active=true and t.imperium_team_id is not null and (s.city_id is null or t.city_id=s.city_id);
 return jsonb_build_object('sale_id',s.id,'sale_status',s.status,'base_key',v_base,'current_team_id',s.team_id,
  'products',v_products,'products_total',jsonb_array_length(v_products),'products_validated',coalesce(v_validated,0),
  'product_options',v_options,'teams',v_teams,
  'consultant',jsonb_build_object('name',p.full_name,'account_id',ia.id,'account_base',ia.base_key,'imperium_user_id',ia.imperium_user_id,'account_active',coalesce(ia.active,false)));
end $$;
revoke all on function public.tv_backoffice_imperium_fix_options(uuid) from public;
grant execute on function public.tv_backoffice_imperium_fix_options(uuid) to authenticated,service_role;
