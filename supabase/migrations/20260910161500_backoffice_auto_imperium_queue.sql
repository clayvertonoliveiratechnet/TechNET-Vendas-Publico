create or replace function public.tv_enqueue_approved_sale_for_imperium_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_base text;
  v_has_identity boolean;
  v_has_address boolean;
begin
  if new.source <> 'technet' or new.status <> 'approved' or old.status is not distinct from 'approved' then
    return new;
  end if;

  if new.registration_checked_at is null then
    raise exception 'confirme o cadastro antes de aprovar';
  end if;
  if new.active_confirmed_at is null then
    raise exception 'confirme o ativo com o assinante antes de aprovar';
  end if;
  if new.viability_status not in ('available','manual_review') then
    raise exception 'viabilidade precisa estar conferida antes de aprovar';
  end if;

  select exists(
    select 1 from public.tv_sale_documents d where d.sale_id=new.id and d.document_type='identity'
  ), exists(
    select 1 from public.tv_sale_documents d where d.sale_id=new.id and d.document_type='address'
  ) into v_has_identity,v_has_address;

  if not v_has_identity or not v_has_address then
    raise exception 'documentos obrigatorios incompletos';
  end if;

  v_base:=coalesce(
    nullif(new.imperium_base_key,''),
    (select case c.name
      when 'Natal' then 'natal'
      when 'Parnamirim' then 'natal'
      when 'Extremoz' then 'natal'
      when 'Macaíba' then 'natal'
      when 'Ceará-Mirim' then 'natal'
      when 'São Gonçalo do Amarante' then 'natal'
      when 'Fortaleza' then 'fortaleza'
      when 'Aquiraz' then 'fortaleza'
      when 'Caucaia' then 'fortaleza'
      when 'Eusébio' then 'fortaleza'
      when 'Maracanaú' then 'fortaleza'
      when 'Mossoró' then 'mossoro'
      when 'Recife' then 'recife'
      when 'Camaragibe' then 'recife'
      when 'Jaboatão dos Guararapes' then 'recife'
      when 'Olinda' then 'recife'
      when 'Paulista' then 'recife'
      else null end
     from public.tv_cities c where c.id=new.city_id)
  );

  if v_base is null then
    raise exception 'base do Imperium nao definida para esta venda';
  end if;

  insert into public.tv_imperium_submit_queue(
    sale_id,base_key,status,attempts,payload,result,error_message,next_attempt_at,last_attempt_at,last_error_at,updated_at
  ) values(
    new.id,v_base,'pending',0,to_jsonb(new),'{}'::jsonb,null,now(),null,null,now()
  )
  on conflict(sale_id) do update set
    base_key=excluded.base_key,
    status='pending',
    attempts=0,
    payload=excluded.payload,
    result='{}'::jsonb,
    error_message=null,
    next_attempt_at=now(),
    last_attempt_at=null,
    last_error_at=null,
    updated_at=now();

  update public.tv_sales
     set status='sync_pending',
         imperium_base_key=v_base,
         imperium_submit_status='ready',
         imperium_submit_error=null
   where id=new.id;

  insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note)
  values(new.id,new.backoffice_id,'approved','sync_pending','Venda aprovada e encaminhada automaticamente para envio ao Imperium');

  return new;
end
$$;

drop trigger if exists trg_tv_auto_queue_imperium_after_approval on public.tv_sales;
create trigger trg_tv_auto_queue_imperium_after_approval
after update of status on public.tv_sales
for each row
when (new.status='approved')
execute function public.tv_enqueue_approved_sale_for_imperium_trg();

create or replace function public.tv_backoffice_retry_imperium(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  s public.tv_sales;
  v_base text;
begin
  if public.tv_current_role() not in ('admin','backoffice') then
    raise exception 'backoffice or admin required';
  end if;

  select * into s from public.tv_sales where id=p_sale_id;
  if s.id is null then raise exception 'sale not found'; end if;
  if s.source <> 'technet' then raise exception 'only TechNET sales can be submitted'; end if;
  if s.status not in ('approved','sync_pending') then raise exception 'sale is not ready for Imperium'; end if;

  v_base:=coalesce(
    nullif(s.imperium_base_key,''),
    (select case c.name
      when 'Natal' then 'natal' when 'Parnamirim' then 'natal' when 'Extremoz' then 'natal' when 'Macaíba' then 'natal'
      when 'Ceará-Mirim' then 'natal' when 'São Gonçalo do Amarante' then 'natal'
      when 'Fortaleza' then 'fortaleza' when 'Aquiraz' then 'fortaleza' when 'Caucaia' then 'fortaleza' when 'Eusébio' then 'fortaleza' when 'Maracanaú' then 'fortaleza'
      when 'Mossoró' then 'mossoro'
      when 'Recife' then 'recife' when 'Camaragibe' then 'recife' when 'Jaboatão dos Guararapes' then 'recife' when 'Olinda' then 'recife' when 'Paulista' then 'recife'
      else null end from public.tv_cities c where c.id=s.city_id)
  );
  if v_base is null then raise exception 'Imperium base not defined'; end if;

  insert into public.tv_imperium_submit_queue(
    sale_id,base_key,status,attempts,payload,result,error_message,next_attempt_at,last_attempt_at,last_error_at,updated_at
  ) values(
    s.id,v_base,'pending',0,to_jsonb(s),'{}'::jsonb,null,now(),null,null,now()
  )
  on conflict(sale_id) do update set
    base_key=excluded.base_key,status='pending',attempts=0,payload=excluded.payload,result='{}'::jsonb,error_message=null,
    next_attempt_at=now(),last_attempt_at=null,last_error_at=null,updated_at=now();

  update public.tv_sales set
    status='sync_pending',imperium_base_key=v_base,imperium_submit_status='ready',imperium_submit_error=null
  where id=s.id;

  insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note)
  values(s.id,auth.uid(),s.status,'sync_pending','Reenvio ao Imperium solicitado pelo BackOffice');

  return jsonb_build_object('ok',true,'sale_id',s.id,'base',v_base,'queue_status','pending');
end
$$;

revoke all on function public.tv_backoffice_retry_imperium(uuid) from public;
grant execute on function public.tv_backoffice_retry_imperium(uuid) to authenticated;

create or replace function public.tv_backoffice_imperium_status(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v jsonb;
begin
  if public.tv_current_role() not in ('admin','backoffice') then
    raise exception 'backoffice or admin required';
  end if;
  select jsonb_build_object(
    'sale_id',s.id,
    'sale_status',s.status,
    'submit_status',s.imperium_submit_status,
    'submit_error',s.imperium_submit_error,
    'base_key',s.imperium_base_key,
    'imperium_sale_id',s.imperium_sale_id,
    'imperium_proposal',s.imperium_proposal,
    'imperium_contract',s.imperium_contract,
    'queue_status',q.status,
    'attempts',coalesce(q.attempts,0),
    'max_attempts',coalesce(q.max_attempts,5),
    'queue_error',q.error_message,
    'queued_at',q.created_at,
    'last_attempt_at',q.last_attempt_at,
    'updated_at',q.updated_at,
    'result',coalesce(q.result,'{}'::jsonb)
  ) into v
  from public.tv_sales s
  left join public.tv_imperium_submit_queue q on q.sale_id=s.id
  where s.id=p_sale_id;
  if v is null then raise exception 'sale not found'; end if;
  return v;
end
$$;

revoke all on function public.tv_backoffice_imperium_status(uuid) from public;
grant execute on function public.tv_backoffice_imperium_status(uuid) to authenticated;