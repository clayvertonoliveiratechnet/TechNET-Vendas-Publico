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
    jsonb_build_object('protocol_version',2,'submission_key',new.id::text,'dry_run',true,'bundle',v_bundle),
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
    jsonb_build_object('protocol_version',2,'submission_key',s.id::text,'dry_run',true,'bundle',v_bundle),
    jsonb_build_object('preflight',v_bundle),null,now(),null,null,now())
  on conflict(sale_id) do update set base_key=excluded.base_key,status='pending',attempts=0,payload=excluded.payload,result=excluded.result,error_message=null,next_attempt_at=now(),last_attempt_at=null,last_error_at=null,updated_at=now();

  update public.tv_sales set status='sync_pending',imperium_base_key=v_base,imperium_submit_status='queued',imperium_submit_error=null where id=s.id;
  return jsonb_build_object('ok',true,'sale_id',s.id,'base',v_base,'protocol_version',2,'preflight_ready',true);
end
$$;
