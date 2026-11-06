create or replace function public.tv_backoffice_sale_edit_bundle(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  s public.tv_sales;
  v_role text := public.tv_current_role();
begin
  if auth.uid() is null or v_role not in ('admin','backoffice') then
    raise exception 'admin or backoffice required';
  end if;

  select * into s from public.tv_sales where id=p_sale_id;
  if s.id is null then raise exception 'sale not found'; end if;
  if s.status not in ('draft','submitted','under_review','pending_correction') then
    raise exception 'sale is locked for editing';
  end if;
  if s.imperium_sale_id is not null
     or lower(coalesce(s.imperium_submit_status,'')) in ('queued','sending','processing','sent') then
    raise exception 'sale is already in Imperium submission flow';
  end if;

  return jsonb_build_object(
    'sale',to_jsonb(s),
    'products',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,
        'product_name',p.product_name,
        'product_group',p.product_group,
        'monthly_value',p.monthly_value,
        'quantity',p.quantity,
        'imperium_product_id',p.imperium_product_id,
        'imperium_base_key',p.imperium_base_key
      ) order by p.created_at)
      from public.tv_sale_products p where p.sale_id=s.id
    ),'[]'::jsonb),
    'cities',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'state',c.state) order by c.name)
      from public.tv_cities c where c.active=true
    ),'[]'::jsonb)
  );
end
$function$;

grant execute on function public.tv_backoffice_sale_edit_bundle(uuid) to authenticated;

create or replace function public.tv_backoffice_update_sale_fields(
  p_sale_id uuid,
  p_payload jsonb
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
  v_city_id uuid;
  v_city_name text;
  v_state text;
  v_base text;
  v_base_changed boolean := false;
  v_phone text;
  v_postal text;
  v_dup jsonb;
  v_viab jsonb;
  v_preflight jsonb;
begin
  if v_uid is null or v_role not in ('admin','backoffice') then
    raise exception 'admin or backoffice required';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid sale payload'; end if;

  select * into s from public.tv_sales where id=p_sale_id for update;
  if s.id is null then raise exception 'sale not found'; end if;
  if s.status not in ('draft','submitted','under_review','pending_correction') then
    raise exception 'sale is locked for editing';
  end if;
  if s.imperium_sale_id is not null
     or lower(coalesce(s.imperium_submit_status,'')) in ('queued','sending','processing','sent') then
    raise exception 'sale is already in Imperium submission flow';
  end if;

  if nullif(btrim(p_payload->>'customer_name'),'') is null then raise exception 'customer name is required'; end if;
  v_phone := regexp_replace(coalesce(p_payload->>'customer_phone',''),'[^0-9]','','g');
  if length(v_phone) not in (10,11) then raise exception 'valid phone with area code is required'; end if;
  v_postal := regexp_replace(coalesce(p_payload->>'postal_code',''),'[^0-9]','','g');
  if length(v_postal) <> 8 then raise exception 'valid postal code with 8 digits is required'; end if;

  v_city_id := nullif(p_payload->>'city_id','')::uuid;
  select c.name,c.state into v_city_name,v_state
    from public.tv_cities c
   where c.id=v_city_id and c.active=true;
  if v_city_name is null then raise exception 'invalid or inactive city'; end if;

  v_base := case
    when v_city_name in ('Natal','Parnamirim','Extremoz','Macaíba','Ceará-Mirim','São Gonçalo do Amarante') then 'natal'
    when v_city_name in ('Fortaleza','Aquiraz','Caucaia','Eusébio','Maracanaú') then 'fortaleza'
    when v_city_name='Mossoró' then 'mossoro'
    when v_city_name in ('Recife','Camaragibe','Jaboatão dos Guararapes','Olinda','Paulista') then 'recife'
    else null end;
  if v_base is null then raise exception 'city has no Imperium base mapping'; end if;
  v_base_changed := coalesce(s.imperium_base_key,'') <> v_base;

  v_dup := public.tv_smart_duplicate_check(
    p_payload->>'customer_document',
    v_phone,
    v_postal,
    p_payload->>'street',
    p_payload->>'street_number',
    p_sale_id
  );
  v_viab := public.tv_historical_viability(
    v_postal,
    p_payload->>'street',
    p_payload->>'street_number',
    p_payload->>'neighborhood',
    v_city_name,
    v_state
  );

  update public.tv_sales set
    proposal_profile=nullif(p_payload->>'proposal_profile',''),
    customer_name=btrim(p_payload->>'customer_name'),
    customer_document=nullif(p_payload->>'customer_document',''),
    customer_rg=nullif(p_payload->>'customer_rg',''),
    state_registration=nullif(p_payload->>'state_registration',''),
    customer_birth_date=nullif(p_payload->>'customer_birth_date','')::date,
    customer_mother_name=nullif(p_payload->>'customer_mother_name',''),
    customer_phone=v_phone,
    secondary_phone=nullif(regexp_replace(coalesce(p_payload->>'secondary_phone',''),'[^0-9]','','g'),''),
    secondary_phone_type=nullif(p_payload->>'secondary_phone_type',''),
    customer_email=nullif(p_payload->>'customer_email',''),
    backoffice_recipient=nullif(p_payload->>'backoffice_recipient',''),
    postal_code=v_postal,
    street=nullif(p_payload->>'street',''),
    street_number=nullif(p_payload->>'street_number',''),
    complement=nullif(p_payload->>'complement',''),
    neighborhood=nullif(p_payload->>'neighborhood',''),
    reference_point=nullif(p_payload->>'reference_point',''),
    city_id=v_city_id,
    city_name=v_city_name,
    state=v_state,
    imperium_base_key=v_base,
    contract_type=nullif(p_payload->>'contract_type',''),
    payment_method=nullif(p_payload->>'payment_method',''),
    payment_due=nullif(p_payload->>'payment_due',''),
    contract_number=nullif(p_payload->>'contract_number',''),
    solar_generated=case when p_payload ? 'solar_generated' then (p_payload->>'solar_generated')::boolean else solar_generated end,
    solar_contract=nullif(p_payload->>'solar_contract',''),
    solar_login=nullif(p_payload->>'solar_login',''),
    scheduled_date=nullif(p_payload->>'scheduled_date','')::date,
    schedule_period=nullif(p_payload->>'schedule_period',''),
    priority=coalesce(nullif(p_payload->>'priority',''),priority),
    product_notes=nullif(p_payload->>'product_notes',''),
    notes=nullif(p_payload->>'notes',''),
    duplicate_score=coalesce((v_dup->>'score')::integer,0),
    duplicate_flags=coalesce(v_dup->'flags','[]'::jsonb),
    viability_status=coalesce(nullif(v_viab->>'status',''),'manual_review'),
    viability_message=nullif(v_viab->>'message',''),
    status='under_review',
    backoffice_id=v_uid,
    reviewed_at=now(),
    finalized_at=null,
    registration_checked_at=null,
    registration_checked_by=null,
    active_confirmed_at=null,
    active_confirmed_by=null,
    documents_checked_at=null,
    documents_checked_by=null,
    imperium_submit_status='not_ready',
    imperium_submit_error=null
  where id=p_sale_id;

  if v_base_changed then
    update public.tv_sale_products
       set imperium_base_key=v_base,
           imperium_product_id=null,
           imperium_product_name=null,
           updated_at=now()
     where sale_id=p_sale_id;
  end if;

  insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note)
  values(
    p_sale_id,v_uid,s.status,'under_review',
    case when v_base_changed
      then 'Venda corrigida diretamente pelo BackOffice; base alterada e produtos precisam ser revalidados para o Imperium'
      else 'Venda corrigida diretamente pelo BackOffice; validações reiniciadas antes da aprovação'
    end
  );

  v_preflight := public.tv_backoffice_imperium_submission_bundle(p_sale_id);
  return jsonb_build_object(
    'ok',true,
    'sale_id',p_sale_id,
    'status','under_review',
    'base',v_base,
    'base_changed',v_base_changed,
    'preflight',v_preflight
  );
end
$function$;

grant execute on function public.tv_backoffice_update_sale_fields(uuid,jsonb) to authenticated;
