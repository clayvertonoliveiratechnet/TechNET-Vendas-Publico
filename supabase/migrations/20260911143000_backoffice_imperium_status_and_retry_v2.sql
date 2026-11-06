create or replace function public.tv_backoffice_imperium_status(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v jsonb;
  v_preflight jsonb;
begin
  if public.tv_current_role() not in ('admin','backoffice') then
    raise exception 'backoffice or admin required';
  end if;

  begin
    v_preflight := public.tv_backoffice_imperium_submission_bundle(p_sale_id);
  exception when others then
    v_preflight := jsonb_build_object('ready',false,'blockers',jsonb_build_array(jsonb_build_object('code','preflight_error','message',sqlerrm)),'warnings','[]'::jsonb);
  end;

  select jsonb_build_object(
    'sale_id',s.id,
    'sale_status',s.status,
    'submit_status',s.imperium_submit_status,
    'submit_error',s.imperium_submit_error,
    'base_key',s.imperium_base_key,
    'imperium_sale_id',s.imperium_sale_id,
    'imperium_proposal',s.imperium_proposal,
    'imperium_contract',s.imperium_contract,
    'imperium_status',s.imperium_status,
    'synced_at',s.synced_at,
    'queue_status',q.status,
    'attempts',coalesce(q.attempts,0),
    'max_attempts',coalesce(q.max_attempts,5),
    'queue_error',q.error_message,
    'queued_at',q.created_at,
    'last_attempt_at',q.last_attempt_at,
    'updated_at',q.updated_at,
    'result',coalesce(q.result,'{}'::jsonb),
    'preflight',coalesce(v_preflight,'{}'::jsonb)
  ) into v
  from public.tv_sales s
  left join public.tv_imperium_submit_queue q on q.sale_id=s.id
  where s.id=p_sale_id;

  if v is null then raise exception 'sale not found'; end if;
  return v;
end
$$;

create or replace function public.tv_backoffice_retry_imperium(p_sale_id uuid)
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
  if public.tv_current_role() not in ('admin','backoffice') then
    raise exception 'backoffice or admin required';
  end if;

  select * into s from public.tv_sales where id=p_sale_id;
  if s.id is null then raise exception 'sale not found'; end if;
  if s.source <> 'technet' then raise exception 'only TechNET sales can be submitted'; end if;
  if s.status not in ('approved','sync_pending') then raise exception 'sale is not ready for Imperium'; end if;

  v_bundle := public.tv_backoffice_imperium_submission_bundle(s.id);
  if coalesce((v_bundle->>'ready')::boolean,false) is not true then
    select string_agg(coalesce(x->>'message',x->>'code'),' | ')
      into v_msg
      from jsonb_array_elements(coalesce(v_bundle->'blockers','[]'::jsonb)) x;
    update public.tv_sales
       set imperium_submit_status='not_ready',imperium_submit_error=coalesce(v_msg,'preflight_not_ready')
     where id=s.id;
    raise exception 'Venda não está pronta para o Imperium: %',coalesce(v_msg,'pendências no preflight');
  end if;

  v_base:=v_bundle->>'base_key';
  if nullif(v_base,'') is null then raise exception 'Imperium base not defined'; end if;

  insert into public.tv_imperium_submit_queue(
    sale_id,base_key,status,attempts,payload,result,error_message,next_attempt_at,last_attempt_at,last_error_at,updated_at
  ) values(
    s.id,v_base,'pending',0,
    jsonb_build_object('protocol_version',2,'submission_key',s.id::text,'dry_run',true,'bundle',v_bundle),
    jsonb_build_object('preflight',v_bundle),null,now(),null,null,now()
  )
  on conflict(sale_id) do update set
    base_key=excluded.base_key,
    status='pending',
    attempts=0,
    payload=excluded.payload,
    result=excluded.result,
    error_message=null,
    next_attempt_at=now(),
    last_attempt_at=null,
    last_error_at=null,
    updated_at=now();

  update public.tv_sales set
    status='sync_pending',imperium_base_key=v_base,imperium_submit_status='queued',imperium_submit_error=null
  where id=s.id;

  insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note)
  values(s.id,auth.uid(),s.status,'sync_pending','Reenvio ao Imperium solicitado pelo BackOffice após novo preflight');

  return jsonb_build_object('ok',true,'sale_id',s.id,'base',v_base,'queue_status','pending','protocol_version',2,'preflight_ready',true);
end
$$;
