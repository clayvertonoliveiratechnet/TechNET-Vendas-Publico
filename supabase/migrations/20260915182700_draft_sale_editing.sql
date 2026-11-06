create or replace function public.tv_draft_sale_edit_bundle(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  s public.tv_sales;
  v_uid uuid := auth.uid();
  v_role text := public.tv_current_role();
begin
  if v_uid is null then raise exception 'not authorized'; end if;
  select * into s from public.tv_sales where id=p_sale_id;
  if s.id is null then raise exception 'sale not found'; end if;
  if s.status not in ('draft','pending_correction') then
    raise exception 'only draft or pending correction sales can be edited';
  end if;
  if not (
    v_role='admin'
    or (v_role='consultant' and s.consultant_id=v_uid)
    or (v_role='supervisor' and (s.supervisor_id=v_uid or s.team_id=public.tv_current_team()))
  ) then raise exception 'not authorized to edit this sale'; end if;

  return jsonb_build_object(
    'sale',case when v_role='consultant' then to_jsonb(s)-'total_value' else to_jsonb(s) end,
    'correction_reason',(select h.note from public.tv_sale_history h where h.sale_id=s.id and h.to_status='pending_correction' order by h.created_at desc limit 1),    'products',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'product_name',p.product_name,'product_group',p.product_group,
        'monthly_value',case when v_role='consultant' then 0 else p.monthly_value end,
        'quantity',p.quantity,'imperium_base_key',p.imperium_base_key
      ) order by p.created_at)
      from public.tv_sale_products p where p.sale_id=s.id
    ),'[]'::jsonb)
  );
end
$function$;

grant execute on function public.tv_draft_sale_edit_bundle(uuid) to authenticated;

create or replace function public.tv_update_draft_sale(
  p_sale_id uuid,
  p_payload jsonb,
  p_products jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  s public.tv_sales;
  v_uid uuid := auth.uid();
  v_role text := public.tv_current_role();
  item jsonb;  v_city_id uuid;
  v_city_name text;
  v_state text;
  v_base text;
  v_price numeric;
  v_group text;
begin
  if v_uid is null then raise exception 'not authorized'; end if;
  if jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid sale payload'; end if;
  if jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products)=0 then
    raise exception 'at least one product is required';
  end if;

  select * into s from public.tv_sales where id=p_sale_id for update;
  if s.id is null then raise exception 'sale not found'; end if;
  if s.status not in ('draft','pending_correction') then
    raise exception 'only draft or pending correction sales can be edited';
  end if;
  if not (
    v_role='admin'
    or (v_role='consultant' and s.consultant_id=v_uid)
    or (v_role='supervisor' and (s.supervisor_id=v_uid or s.team_id=public.tv_current_team()))
  ) then raise exception 'not authorized to edit this sale'; end if;

  v_city_id:=nullif(p_payload->>'city_id','')::uuid;
  select c.name,c.state into v_city_name,v_state
  from public.tv_cities c where c.id=v_city_id and c.active=true;
  if v_city_name is null then raise exception 'invalid or inactive city'; end if;  v_base:=case
    when v_city_name in ('Natal','Parnamirim','Extremoz','Macaíba','Ceará-Mirim','São Gonçalo do Amarante') then 'natal'
    when v_city_name in ('Fortaleza','Aquiraz','Caucaia','Eusébio','Maracanaú') then 'fortaleza'
    when v_city_name='Mossoró' then 'mossoro'
    when v_city_name in ('Recife','Camaragibe','Jaboatão dos Guararapes','Olinda','Paulista') then 'recife'
    else null end;
  if v_base is null then raise exception 'city has no Imperium base mapping'; end if;

  update public.tv_sales set
    commercial_company=nullif(p_payload->>'commercial_company',''),
    commercial_leader=nullif(p_payload->>'commercial_leader',''),
    commercial_seller_name=nullif(p_payload->>'commercial_seller_name',''),
    backoffice_recipient=nullif(p_payload->>'backoffice_recipient',''),
    proposal_profile=nullif(p_payload->>'proposal_profile',''),
    customer_name=coalesce(nullif(p_payload->>'customer_name',''),customer_name),
    customer_document=nullif(p_payload->>'customer_document',''),
    customer_rg=nullif(p_payload->>'customer_rg',''),
    state_registration=nullif(p_payload->>'state_registration',''),
    customer_birth_date=nullif(p_payload->>'customer_birth_date','')::date,
    customer_mother_name=nullif(p_payload->>'customer_mother_name',''),
    customer_phone=nullif(p_payload->>'customer_phone',''),
    secondary_phone=nullif(p_payload->>'secondary_phone',''),
    secondary_phone_type=nullif(p_payload->>'secondary_phone_type',''),
    customer_email=nullif(p_payload->>'customer_email',''),
    postal_code=nullif(regexp_replace(coalesce(p_payload->>'postal_code',''),'[^0-9]','','g'),''),
    street=nullif(p_payload->>'street',''),    street_number=nullif(p_payload->>'street_number',''),
    complement=nullif(p_payload->>'complement',''),
    neighborhood=nullif(p_payload->>'neighborhood',''),
    reference_point=nullif(p_payload->>'reference_point',''),
    city_id=v_city_id,city_name=v_city_name,state=v_state,
    latitude=nullif(p_payload->>'latitude','')::double precision,
    longitude=nullif(p_payload->>'longitude','')::double precision,
    geocode_status=coalesce(nullif(p_payload->>'geocode_status',''),'pending'),
    payment_method=nullif(p_payload->>'payment_method',''),
    payment_due=nullif(p_payload->>'payment_due',''),
    contract_type=nullif(p_payload->>'contract_type',''),
    contract_number=nullif(p_payload->>'contract_number',''),
    solar_generated=case when p_payload ? 'solar_generated' then (p_payload->>'solar_generated')::boolean else solar_generated end,
    solar_contract=nullif(p_payload->>'solar_contract',''),
    solar_login=nullif(p_payload->>'solar_login',''),
    scheduled_date=nullif(p_payload->>'scheduled_date','')::date,
    schedule_period=nullif(p_payload->>'schedule_period',''),
    product_notes=nullif(p_payload->>'product_notes',''),
    notes=nullif(p_payload->>'notes',''),
    priority=coalesce(nullif(p_payload->>'priority',''),priority),
    viability_status=coalesce(nullif(p_payload->>'viability_status',''),viability_status),
    viability_message=nullif(p_payload->>'viability_message',''),
    duplicate_score=coalesce(nullif(p_payload->>'duplicate_score','')::integer,0),
    duplicate_flags=coalesce(p_payload->'duplicate_flags','[]'::jsonb),
    imperium_base_key=v_base,
    imperium_consultant_name=nullif(p_payload->>'commercial_seller_name',''),
    imperium_team_name=nullif(p_payload->>'commercial_leader',''),    registration_checked_at=null,registration_checked_by=null,
    active_confirmed_at=null,active_confirmed_by=null,
    documents_checked_at=null,documents_checked_by=null,
    backoffice_id=null,reviewed_at=null,finalized_at=null
  where id=p_sale_id;

  delete from public.tv_sale_products where sale_id=p_sale_id;
  for item in select value from jsonb_array_elements(p_products)
  loop
    if nullif(item->>'product_name','') is null then raise exception 'product name is required'; end if;
    if coalesce((item->>'quantity')::integer,1) < 1 then raise exception 'invalid product quantity'; end if;
    select latest_value,product_group into v_price,v_group
      from public.tv_imperium_products
     where base_key=v_base and active=true and product_name=item->>'product_name'
     order by last_seen_at desc nulls last limit 1;
    if v_price is null then raise exception 'product not found in selected Imperium base: %',item->>'product_name'; end if;
    insert into public.tv_sale_products(
      sale_id,product_name,product_group,monthly_value,quantity,source,imperium_base_key
    ) values (
      p_sale_id,item->>'product_name',coalesce(v_group,''),v_price,
      coalesce((item->>'quantity')::integer,1),'technet',v_base
    );
  end loop;

  update public.tv_sales set
    real_product_summary=(select string_agg(p.product_name,' | ' order by p.created_at) from public.tv_sale_products p where p.sale_id=p_sale_id),
    product_group_summary=(select string_agg(distinct p.product_group,' | ') from public.tv_sale_products p where p.sale_id=p_sale_id and nullif(p.product_group,'') is not null),    total_value=coalesce((select sum(p.monthly_value*p.quantity) from public.tv_sale_products p where p.sale_id=p_sale_id),0),
    imperium_base_key=v_base
  where id=p_sale_id;

  insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note)
  values(
    p_sale_id,v_uid,s.status,s.status,
    case when s.status='pending_correction'
      then 'Correções realizadas; aguardando reenvio ao BackOffice'
      else 'Rascunho editado antes do envio ao BackOffice' end
  );

  return jsonb_build_object(
    'ok',true,'sale_id',p_sale_id,'status',s.status,
    'product_count',jsonb_array_length(p_products),'base',v_base
  );
end
$function$;

grant execute on function public.tv_update_draft_sale(uuid,jsonb,jsonb) to authenticated;

create or replace function public.tv_submit_sale_to_backoffice(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  s public.tv_sales;
  v_uid uuid := auth.uid();
  v_role text := public.tv_current_role();  v_has_identity boolean;
  v_has_address boolean;
begin
  if v_uid is null then raise exception 'not authorized'; end if;
  select * into s from public.tv_sales where id=p_sale_id for update;
  if s.id is null then raise exception 'sale not found'; end if;
  if s.status not in ('draft','pending_correction') then raise exception 'sale is not editable/submittable'; end if;
  if not (
    v_role='admin'
    or (v_role='consultant' and s.consultant_id=v_uid)
    or (v_role='supervisor' and (s.supervisor_id=v_uid or s.team_id=public.tv_current_team()))
  ) then raise exception 'not authorized to submit this sale'; end if;

  select
    exists(select 1 from public.tv_sale_documents d where d.sale_id=s.id and d.document_type='identity'),
    exists(select 1 from public.tv_sale_documents d where d.sale_id=s.id and d.document_type='address')
  into v_has_identity,v_has_address;
  if not v_has_identity or not v_has_address then
    raise exception 'identity and address documents are required';
  end if;

  update public.tv_sales
     set status='submitted',submitted_at=now(),backoffice_id=null,reviewed_at=null,finalized_at=null
   where id=s.id;
  insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note)
  values(
    s.id,v_uid,s.status,'submitted',
    case when s.status='pending_correction' then 'Venda corrigida e reenviada ao BackOffice'
         else 'Venda enviada ao BackOffice com checklist documental' end
  );
  return jsonb_build_object('ok',true,'sale_id',s.id,'from_status',s.status,'status','submitted');
end
$function$;

grant execute on function public.tv_submit_sale_to_backoffice(uuid) to authenticated;
