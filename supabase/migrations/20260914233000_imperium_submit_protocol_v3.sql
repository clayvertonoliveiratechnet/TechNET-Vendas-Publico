-- Imperium submit protocol v3: documentos são consultivos e o worker usa escrita real idempotente.

create or replace function public.tv_backoffice_imperium_submission_bundle(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  s public.tv_sales;
  pf jsonb;
  v_blockers jsonb;
  v_warnings jsonb;
  v_phone text;
  v_docs jsonb;
  v_doc_advisories jsonb;
  v_role text;
begin
  v_role:=public.tv_current_role();
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then
    raise exception 'backoffice or admin required';
  end if;
  select * into s from public.tv_sales where id=p_sale_id;
  if s.id is null then raise exception 'sale not found'; end if;
  pf:=public.tv_backoffice_imperium_preflight(p_sale_id);
  v_blockers:=coalesce(pf->'blockers','[]'::jsonb);
  v_warnings:=coalesce(pf->'warnings','[]'::jsonb);
  select coalesce(jsonb_agg(x),'[]'::jsonb) into v_doc_advisories
    from jsonb_array_elements(v_blockers) x
    where coalesce(x->>'code','') in ('identity_document_missing','address_document_missing','documents_review_missing');
  select coalesce(jsonb_agg(x),'[]'::jsonb) into v_blockers
    from jsonb_array_elements(v_blockers) x
    where coalesce(x->>'code','') not in ('identity_document_missing','address_document_missing','documents_review_missing');
  v_warnings:=v_warnings||coalesce(v_doc_advisories,'[]'::jsonb);
  v_phone:=regexp_replace(coalesce(s.customer_phone,''),'\D','','g');
  if length(v_phone) not in (10,11) or v_phone ~ '^(.)\1+$' then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','customer_phone_invalid','message','Telefone principal inválido para envio ao Imperium.'));
  end if;
  if s.documents_checked_at is null then
    v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','documents_review_missing','message','BackOffice ainda não confirmou visualmente os documentos; isso não impede o registro técnico no Imperium.'));
  end if;
  if coalesce(s.solar_generated,false) and nullif(trim(coalesce(s.solar_contract,'')),'') is null then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','solar_contract_missing','message','Venda marcada como gerada no Solar sem contrato Solar.'));
  end if;
  if coalesce(s.solar_generated,false) and nullif(trim(coalesce(s.solar_login,'')),'') is null then
    v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','solar_login_missing','message','Login usado no cadastro Solar não foi informado.'));
  end if;
  if coalesce(s.duplicate_score,0)>=80 then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','duplicate_risk_high','message','Venda com risco alto de duplicidade; revisar antes do envio ao Imperium.'));
  elsif coalesce(s.duplicate_score,0)>=40 then
    v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','duplicate_risk_review','message','Venda possui sinal de possível duplicidade e deve ser conferida pelo BackOffice.'));
  end if;
  if (pf->>'base_key')='natal' and upper(coalesce(s.commercial_company,''))='RDT' then
    v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','company_base_review','message','Empresa RDT em venda da base Natal; confirmar empresa comercial antes do envio.'));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'document_type',d.document_type,'file_name',d.file_name,'mime_type',d.mime_type,
    'file_size',d.file_size,'storage_path',d.storage_path,'required',d.required
  ) order by d.created_at),'[]'::jsonb)
  into v_docs from public.tv_sale_documents d where d.sale_id=s.id;
  pf:=jsonb_set(pf,'{blockers}',v_blockers,true);
  pf:=jsonb_set(pf,'{warnings}',v_warnings,true);
  pf:=jsonb_set(pf,'{ready}',to_jsonb(jsonb_array_length(v_blockers)=0),true);
  return pf||jsonb_build_object(
    'bundle_version',4,
    'sale',jsonb_build_object(
      'id',s.id,'customer_name',s.customer_name,'customer_document',s.customer_document,
      'customer_rg',s.customer_rg,'customer_birth_date',s.customer_birth_date,'customer_mother_name',s.customer_mother_name,
      'customer_phone',s.customer_phone,'secondary_phone',s.secondary_phone,'secondary_phone_type',s.secondary_phone_type,'customer_email',s.customer_email,
      'postal_code',s.postal_code,'street',s.street,'street_number',s.street_number,'complement',s.complement,
      'neighborhood',s.neighborhood,'city_name',s.city_name,'state',s.state,'reference_point',s.reference_point,
      'contract_type',s.contract_type,'contract_number',s.contract_number,'payment_method',s.payment_method,'payment_due',s.payment_due,
      'scheduled_date',s.scheduled_date,'schedule_period',s.schedule_period,
      'solar_generated',s.solar_generated,'solar_contract',s.solar_contract,'solar_login',s.solar_login,
      'commercial_company',s.commercial_company,'commercial_leader',s.commercial_leader,'commercial_seller_name',s.commercial_seller_name,
      'notes',s.notes,'product_notes',s.product_notes,'total_value',s.total_value,
      'documents_checked_at',s.documents_checked_at
    ),
    'documents_detail',v_docs,
    'dry_run_only',false
  );
end
$$;

revoke all on function public.tv_backoffice_imperium_submission_bundle(uuid) from public;
grant execute on function public.tv_backoffice_imperium_submission_bundle(uuid) to authenticated,service_role;


create or replace function public.tv_enqueue_approved_sale_for_imperium_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_bundle jsonb;
  v_base text;
  v_msg text;
begin
  if new.source <> 'technet' or new.status <> 'approved' or old.status is not distinct from 'approved' then
    return new;
  end if;

  if new.registration_checked_at is null then raise exception 'confirme o cadastro antes de aprovar'; end if;
  if new.active_confirmed_at is null then raise exception 'confirme o ativo com o assinante antes de aprovar'; end if;
  if new.viability_status not in ('available','manual_review') then raise exception 'viabilidade precisa estar conferida antes de aprovar'; end if;

  v_bundle := public.tv_backoffice_imperium_submission_bundle(new.id);
  if coalesce((v_bundle->>'ready')::boolean,false) is not true then
    select string_agg(coalesce(x->>'message',x->>'code'),' | ')
      into v_msg
      from jsonb_array_elements(coalesce(v_bundle->'blockers','[]'::jsonb)) x;
    raise exception 'Venda não está pronta para o Imperium: %', coalesce(v_msg,'pendências no preflight');
  end if;

  v_base := v_bundle->>'base_key';
  if nullif(v_base,'') is null then raise exception 'base do Imperium nao definida para esta venda'; end if;

  insert into public.tv_imperium_submit_queue(
    sale_id,base_key,status,attempts,payload,result,error_message,next_attempt_at,last_attempt_at,last_error_at,updated_at
  ) values(
    new.id,v_base,'pending',0,
    jsonb_build_object('protocol_version',3,'submission_key',new.id::text,'dry_run',false,'bundle',v_bundle),
    jsonb_build_object('preflight',v_bundle),null,now(),null,null,now()
  )
  on conflict(sale_id) do update set
    base_key=excluded.base_key,status='pending',attempts=0,payload=excluded.payload,result=excluded.result,
    error_message=null,next_attempt_at=now(),last_attempt_at=null,last_error_at=null,updated_at=now();

  update public.tv_sales
     set status='sync_pending',imperium_base_key=v_base,imperium_submit_status='queued',imperium_submit_error=null
   where id=new.id;

  insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note)
  values(new.id,new.backoffice_id,'approved','sync_pending','Venda validada pelo preflight e encaminhada para envio ao Imperium');

  return new;
end
$$;

create or replace function public.tv_queue_sale_for_imperium(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  s public.tv_sales;
  v_bundle jsonb;
  v_base text;
  v_msg text;
begin
  if public.tv_current_role() not in ('admin','backoffice') then raise exception 'backoffice or admin required'; end if;
  select * into s from public.tv_sales where id=p_sale_id;
  if s.id is null then raise exception 'sale not found'; end if;
  if s.status not in ('approved','sync_pending') then raise exception 'sale must be approved'; end if;

  v_bundle := public.tv_backoffice_imperium_submission_bundle(s.id);
  if coalesce((v_bundle->>'ready')::boolean,false) is not true then
    select string_agg(coalesce(x->>'message',x->>'code'),' | ')
      into v_msg from jsonb_array_elements(coalesce(v_bundle->'blockers','[]'::jsonb)) x;
    update public.tv_sales set imperium_submit_status='not_ready',imperium_submit_error=coalesce(v_msg,'preflight_not_ready') where id=s.id;
    raise exception 'Venda não está pronta para o Imperium: %', coalesce(v_msg,'pendências no preflight');
  end if;

  v_base := v_bundle->>'base_key';
  insert into public.tv_imperium_submit_queue(sale_id,base_key,status,attempts,payload,result,error_message,next_attempt_at,last_attempt_at,last_error_at,updated_at)
  values(s.id,v_base,'pending',0,
    jsonb_build_object('protocol_version',3,'submission_key',s.id::text,'dry_run',false,'bundle',v_bundle),
    jsonb_build_object('preflight',v_bundle),null,now(),null,null,now())
  on conflict(sale_id) do update set base_key=excluded.base_key,status='pending',attempts=0,payload=excluded.payload,result=excluded.result,error_message=null,next_attempt_at=now(),last_attempt_at=null,last_error_at=null,updated_at=now();

  update public.tv_sales set status='sync_pending',imperium_base_key=v_base,imperium_submit_status='queued',imperium_submit_error=null where id=s.id;
  return jsonb_build_object('ok',true,'sale_id',s.id,'base',v_base,'protocol_version',3,'preflight_ready',true);
end
$$;
