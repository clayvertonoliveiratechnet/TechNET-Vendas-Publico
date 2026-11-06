-- Fluxo correto: venda enviada para análise -> BackOffice valida -> BackOffice aprova -> fila Imperium.
-- Também remove dependência circular de imperium_base_key na validação de produtos.

create or replace function public.tv_backoffice_imperium_submission_for_approval(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  s public.tv_sales;
  v_bundle jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_base text;
  v_product_count integer := 0;
  v_unvalidated_products integer := 0;
  v_role text;
begin
  v_role := public.tv_current_role();
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' and v_role not in ('admin','backoffice') then
    raise exception 'backoffice or admin required';
  end if;

  select * into s from public.tv_sales where id=p_sale_id;
  if s.id is null then raise exception 'sale not found'; end if;

  v_bundle := public.tv_backoffice_imperium_submission_bundle(p_sale_id);
  v_base := nullif(v_bundle->>'base_key','');

  select coalesce(jsonb_agg(x),'[]'::jsonb)
    into v_blockers
    from jsonb_array_elements(coalesce(v_bundle->'blockers','[]'::jsonb)) x
   where coalesce(x->>'code','') not in ('status_not_approved','product_ids_unmapped');

  if s.status not in ('submitted','under_review','approved','sync_pending') then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code','backoffice_review_required',
      'message','A venda precisa estar em análise do BackOffice antes da aprovação e do envio ao Imperium.'
    ));
  end if;

  if s.registration_checked_at is null then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code','registration_review_missing',
      'message','O BackOffice precisa confirmar o cadastro antes de aprovar a venda.'
    ));
  end if;

  if s.active_confirmed_at is null then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code','active_review_missing',
      'message','O BackOffice precisa confirmar o ativo com o assinante antes de aprovar a venda.'
    ));
  end if;

  select count(*),
         count(*) filter (
           where sp.imperium_product_id is null
              or v_base is null
              or not exists (
                select 1
                  from public.tv_imperium_reference_map m
                 where m.base_key=v_base
                   and m.entity_type='product'
                   and m.imperium_id=sp.imperium_product_id
                   and m.active=true
              )
         )
    into v_product_count,v_unvalidated_products
    from public.tv_sale_products sp
   where sp.sale_id=s.id;

  if v_product_count=0 then
    if not exists(select 1 from jsonb_array_elements(v_blockers) x where x->>'code'='products_missing') then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','products_missing','message','A venda não possui produtos.'));
    end if;
  elsif v_unvalidated_products>0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code','product_validation_pending',
      'message',format('%s produto(s) precisam ser vinculados a um IdProduto oficial do Imperium antes da aprovação.',v_unvalidated_products)
    ));
  end if;

  v_bundle := jsonb_set(v_bundle,'{blockers}',v_blockers,true);
  v_bundle := jsonb_set(v_bundle,'{ready}',to_jsonb(jsonb_array_length(v_blockers)=0),true);
  v_bundle := jsonb_set(v_bundle,'{approval_flow}',jsonb_build_object(
    'backoffice_approval_required',true,
    'registration_confirmed',s.registration_checked_at is not null,
    'active_confirmed',s.active_confirmed_at is not null,
    'products_total',v_product_count,
    'products_unvalidated',v_unvalidated_products
  ),true);
  return v_bundle;
end
$$;
revoke all on function public.tv_backoffice_imperium_submission_for_approval(uuid) from public;
grant execute on function public.tv_backoffice_imperium_submission_for_approval(uuid) to authenticated,service_role;

create or replace function public.tv_backoffice_confirm_registration(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  s public.tv_sales;
  v_role text;
begin
  v_role:=public.tv_current_role();
  if v_role not in ('admin','backoffice') then raise exception 'backoffice or admin required'; end if;
  select * into s from public.tv_sales where id=p_sale_id for update;
  if s.id is null then raise exception 'sale not found'; end if;
  if s.source<>'technet' then raise exception 'only TechNET sales can be reviewed'; end if;
  if s.status not in ('submitted','under_review') then raise exception 'Venda não está disponível para análise do BackOffice'; end if;
  if s.registration_checked_at is null then
    update public.tv_sales set registration_checked_at=now(),registration_checked_by=auth.uid(),status='under_review',backoffice_id=auth.uid(),reviewed_at=now() where id=s.id;
    insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note)
    values(s.id,auth.uid(),s.status,'under_review','Cadastro conferido e confirmado pelo BackOffice');
  end if;
  return public.tv_backoffice_imperium_submission_for_approval(s.id);
end
$$;
revoke all on function public.tv_backoffice_confirm_registration(uuid) from public;
grant execute on function public.tv_backoffice_confirm_registration(uuid) to authenticated;

create or replace function public.tv_backoffice_confirm_active(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  s public.tv_sales;
  v_role text;
begin
  v_role:=public.tv_current_role();
  if v_role not in ('admin','backoffice') then raise exception 'backoffice or admin required'; end if;
  select * into s from public.tv_sales where id=p_sale_id for update;
  if s.id is null then raise exception 'sale not found'; end if;
  if s.source<>'technet' then raise exception 'only TechNET sales can be reviewed'; end if;
  if s.status not in ('submitted','under_review') then raise exception 'Venda não está disponível para análise do BackOffice'; end if;
  if s.active_confirmed_at is null then
    update public.tv_sales set active_confirmed_at=now(),active_confirmed_by=auth.uid(),status='under_review',backoffice_id=auth.uid(),reviewed_at=now() where id=s.id;
    insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note)
    values(s.id,auth.uid(),s.status,'under_review','Ativo confirmado com o assinante pelo BackOffice');
  end if;
  return public.tv_backoffice_imperium_submission_for_approval(s.id);
end
$$;
revoke all on function public.tv_backoffice_confirm_active(uuid) from public;
grant execute on function public.tv_backoffice_confirm_active(uuid) to authenticated;

create or replace function public.tv_backoffice_imperium_product_options(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  s public.tv_sales;
  v_role text;
  v_base text;
  v_items jsonb;
begin
  v_role:=public.tv_current_role();
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then
    raise exception 'backoffice or admin required';
  end if;
  select * into s from public.tv_sales where id=p_sale_id;
  if s.id is null then raise exception 'sale not found'; end if;

  v_base:=coalesce(nullif(s.imperium_base_key,''),(select case c.name
    when 'Natal' then 'natal' when 'Parnamirim' then 'natal' when 'Extremoz' then 'natal' when 'Macaíba' then 'natal'
    when 'Ceará-Mirim' then 'natal' when 'São Gonçalo do Amarante' then 'natal'
    when 'Fortaleza' then 'fortaleza' when 'Aquiraz' then 'fortaleza' when 'Caucaia' then 'fortaleza' when 'Eusébio' then 'fortaleza' when 'Maracanaú' then 'fortaleza'
    when 'Mossoró' then 'mossoro'
    when 'Recife' then 'recife' when 'Camaragibe' then 'recife' when 'Jaboatão dos Guararapes' then 'recife' when 'Olinda' then 'recife' when 'Paulista' then 'recife'
    else null end from public.tv_cities c where c.id=s.city_id));

  select coalesce(jsonb_agg(x order by abs(coalesce(x.price,0)-coalesce(x.current_value,0)),x.imperium_name),'[]'::jsonb)
    into v_items
  from (
    select distinct m.imperium_id,m.imperium_name,m.metadata->>'group' product_group,
      nullif(replace((regexp_match(m.imperium_name,'R\$\s*([0-9]+(?:[,.][0-9]{1,2})?)\s*$','i'))[1],',','.'),'')::numeric price,
      sp.monthly_value current_value
    from public.tv_imperium_reference_map m
    join public.tv_sale_products sp on sp.sale_id=s.id
      and (case upper(trim(coalesce(m.metadata->>'group','')))
             when 'TELEFONIA FIXA' then 'TELEFONE'
             when 'TELEFONE FIXO' then 'TELEFONE'
             else upper(trim(coalesce(m.metadata->>'group',''))) end)
          =
          (case upper(trim(coalesce(sp.product_group,'')))
             when 'TELEFONIA FIXA' then 'TELEFONE'
             when 'TELEFONE FIXO' then 'TELEFONE'
             else upper(trim(coalesce(sp.product_group,''))) end)
    where m.base_key=v_base and m.entity_type='product' and m.source='imperium_direct' and m.active=true
  ) x;
  return jsonb_build_object('sale_id',s.id,'base_key',v_base,'items',v_items);
end
$$;
revoke all on function public.tv_backoffice_imperium_product_options(uuid) from public;
grant execute on function public.tv_backoffice_imperium_product_options(uuid) to authenticated,service_role;

create or replace function public.tv_backoffice_correct_imperium_product(p_sale_id uuid, p_product_row_id uuid, p_imperium_product_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_role text;
  sp public.tv_sale_products;
  m public.tv_imperium_reference_map;
  s public.tv_sales;
  v_price numeric;
  v_base text;
  v_group_sale text;
  v_group_imp text;
begin
  v_role:=public.tv_current_role();
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then
    raise exception 'backoffice or admin required';
  end if;
  select * into s from public.tv_sales where id=p_sale_id for update;
  if s.id is null then raise exception 'sale not found'; end if;
  select * into sp from public.tv_sale_products where id=p_product_row_id and sale_id=p_sale_id for update;
  if sp.id is null then raise exception 'sale product not found'; end if;

  v_base:=coalesce(nullif(s.imperium_base_key,''),(select case c.name
    when 'Natal' then 'natal' when 'Parnamirim' then 'natal' when 'Extremoz' then 'natal' when 'Macaíba' then 'natal'
    when 'Ceará-Mirim' then 'natal' when 'São Gonçalo do Amarante' then 'natal'
    when 'Fortaleza' then 'fortaleza' when 'Aquiraz' then 'fortaleza' when 'Caucaia' then 'fortaleza' when 'Eusébio' then 'fortaleza' when 'Maracanaú' then 'fortaleza'
    when 'Mossoró' then 'mossoro'
    when 'Recife' then 'recife' when 'Camaragibe' then 'recife' when 'Jaboatão dos Guararapes' then 'recife' when 'Olinda' then 'recife' when 'Paulista' then 'recife'
    else null end from public.tv_cities c where c.id=s.city_id));
  if v_base is null then raise exception 'Base do Imperium não identificada para esta venda'; end if;

  select * into m from public.tv_imperium_reference_map
   where base_key=v_base and entity_type='product' and imperium_id=p_imperium_product_id
     and source='imperium_direct' and active=true
   order by verified_at desc nulls last,id desc limit 1;
  if m.id is null then raise exception 'Produto não é válido para a base da venda'; end if;

  v_group_sale:=case upper(trim(coalesce(sp.product_group,''))) when 'TELEFONIA FIXA' then 'TELEFONE' when 'TELEFONE FIXO' then 'TELEFONE' else upper(trim(coalesce(sp.product_group,''))) end;
  v_group_imp:=case upper(trim(coalesce(m.metadata->>'group',''))) when 'TELEFONIA FIXA' then 'TELEFONE' when 'TELEFONE FIXO' then 'TELEFONE' else upper(trim(coalesce(m.metadata->>'group',''))) end;
  if v_group_imp<>v_group_sale then raise exception 'Grupo do produto do Imperium não corresponde ao produto da venda'; end if;

  v_price:=nullif(replace((regexp_match(m.imperium_name,'R\$\s*([0-9]+(?:[,.][0-9]{1,2})?)\s*$','i'))[1],',','.'),'')::numeric;
  update public.tv_sale_products set
    product_name=m.imperium_name,
    product_group=coalesce(m.metadata->>'group',product_group),
    monthly_value=coalesce(v_price,monthly_value),
    imperium_product_id=m.imperium_id,
    imperium_product_name=m.imperium_name,
    imperium_base_key=v_base,
    updated_at=now()
  where id=sp.id;

  update public.tv_sales x set
    imperium_base_key=v_base,
    status=case when x.status in ('submitted','under_review') then 'under_review' else x.status end,
    real_product_summary=(select string_agg(p.product_name,' | ' order by p.created_at) from public.tv_sale_products p where p.sale_id=x.id),
    product_group_summary=(select string_agg(distinct p.product_group,' | ') from public.tv_sale_products p where p.sale_id=x.id),
    total_value=(select coalesce(sum(p.monthly_value*p.quantity),0) from public.tv_sale_products p where p.sale_id=x.id),
    documents_checked_at=null,
    documents_checked_by=null,
    registration_checked_at=null,
    registration_checked_by=null
  where x.id=s.id;
  return public.tv_backoffice_imperium_submission_for_approval(s.id);
end
$$;
revoke all on function public.tv_backoffice_correct_imperium_product(uuid,uuid,bigint) from public;
grant execute on function public.tv_backoffice_correct_imperium_product(uuid,uuid,bigint) to authenticated,service_role;

create or replace function public.tv_backoffice_approve_sale_for_imperium(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  s public.tv_sales;
  v_bundle jsonb;
  v_msg text;
  v_base text;
begin
  if public.tv_current_role() not in ('admin','backoffice') then raise exception 'backoffice or admin required'; end if;
  select * into s from public.tv_sales where id=p_sale_id for update;
  if s.id is null then raise exception 'sale not found'; end if;
  if s.source<>'technet' then raise exception 'only TechNET sales can be approved'; end if;
  if s.status not in ('submitted','under_review') then raise exception 'Venda não está em análise do BackOffice'; end if;
  if s.registration_checked_at is null then raise exception 'Confirme o cadastro antes de aprovar'; end if;
  if s.active_confirmed_at is null then raise exception 'Confirme o ativo com o assinante antes de aprovar'; end if;

  v_bundle:=public.tv_backoffice_imperium_submission_for_approval(s.id);
  if coalesce((v_bundle->>'ready')::boolean,false) is not true then
    select string_agg(coalesce(x->>'message',x->>'code'),' | ')
      into v_msg from jsonb_array_elements(coalesce(v_bundle->'blockers','[]'::jsonb)) x;
    raise exception 'Venda ainda possui pendências antes da aprovação: %',coalesce(v_msg,'revise a venda');
  end if;
  v_base:=v_bundle->>'base_key';
  if nullif(v_base,'') is null then raise exception 'Base do Imperium não identificada'; end if;

  insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note)
  values(s.id,auth.uid(),s.status,'approved','Venda aprovada pelo BackOffice após validação de cadastro, ativo e produtos');

  update public.tv_sales set
    imperium_base_key=v_base,
    status='approved',
    backoffice_id=auth.uid(),
    reviewed_at=now(),
    finalized_at=now()
  where id=s.id;

  return (
    select jsonb_build_object('ok',true,'sale_id',x.id,'status',x.status,'imperium_submit_status',x.imperium_submit_status,'base_key',x.imperium_base_key)
      from public.tv_sales x where x.id=s.id
  );
end
$$;
revoke all on function public.tv_backoffice_approve_sale_for_imperium(uuid) from public;
grant execute on function public.tv_backoffice_approve_sale_for_imperium(uuid) to authenticated;

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
  if new.source <> 'technet' or new.status <> 'approved' or old.status is not distinct from 'approved' then return new; end if;
  if new.registration_checked_at is null then raise exception 'confirme o cadastro antes de aprovar'; end if;
  if new.active_confirmed_at is null then raise exception 'confirme o ativo com o assinante antes de aprovar'; end if;
  if new.viability_status not in ('available','manual_review') then raise exception 'viabilidade precisa estar conferida antes de aprovar'; end if;

  v_bundle:=public.tv_backoffice_imperium_submission_for_approval(new.id);
  if coalesce((v_bundle->>'ready')::boolean,false) is not true then
    select string_agg(coalesce(x->>'message',x->>'code'),' | ') into v_msg
      from jsonb_array_elements(coalesce(v_bundle->'blockers','[]'::jsonb)) x;
    raise exception 'Venda não está pronta para o Imperium: %',coalesce(v_msg,'pendências no preflight');
  end if;
  v_base:=v_bundle->>'base_key';
  if nullif(v_base,'') is null then raise exception 'base do Imperium nao definida para esta venda'; end if;

  insert into public.tv_imperium_submit_queue(sale_id,base_key,status,attempts,payload,result,error_message,next_attempt_at,last_attempt_at,last_error_at,updated_at)
  values(new.id,v_base,'pending',0,jsonb_build_object('protocol_version',3,'submission_key',new.id::text,'dry_run',false,'bundle',v_bundle),jsonb_build_object('preflight',v_bundle),null,now(),null,null,now())
  on conflict(sale_id) do update set base_key=excluded.base_key,status='pending',attempts=0,payload=excluded.payload,result=excluded.result,error_message=null,next_attempt_at=now(),last_attempt_at=null,last_error_at=null,updated_at=now();

  update public.tv_sales set status='sync_pending',imperium_base_key=v_base,imperium_submit_status='queued',imperium_submit_error=null where id=new.id;
  insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note)
  values(new.id,new.backoffice_id,'approved','sync_pending','Venda aprovada pelo BackOffice e encaminhada para envio ao Imperium');
  return new;
end
$$;

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
  if public.tv_current_role() not in ('admin','backoffice') then raise exception 'backoffice or admin required'; end if;
  begin
    v_preflight:=public.tv_backoffice_imperium_submission_for_approval(p_sale_id);
  exception when others then
    v_preflight:=jsonb_build_object('ready',false,'blockers',jsonb_build_array(jsonb_build_object('code','preflight_error','message',sqlerrm)),'warnings','[]'::jsonb);
  end;

  select jsonb_build_object(
    'sale_id',s.id,'sale_status',s.status,'submit_status',s.imperium_submit_status,'submit_error',s.imperium_submit_error,
    'base_key',coalesce(nullif(s.imperium_base_key,''),v_preflight->>'base_key'),'imperium_sale_id',s.imperium_sale_id,
    'imperium_proposal',s.imperium_proposal,'imperium_contract',s.imperium_contract,'imperium_status',s.imperium_status,'synced_at',s.synced_at,
    'queue_status',q.status,'attempts',coalesce(q.attempts,0),'max_attempts',coalesce(q.max_attempts,5),'queue_error',q.error_message,
    'queued_at',q.created_at,'last_attempt_at',q.last_attempt_at,'updated_at',q.updated_at,'result',coalesce(q.result,'{}'::jsonb),
    'preflight',coalesce(v_preflight,'{}'::jsonb)
  ) into v
  from public.tv_sales s left join public.tv_imperium_submit_queue q on q.sale_id=s.id where s.id=p_sale_id;
  if v is null then raise exception 'sale not found'; end if;
  return v;
end
$$;
revoke all on function public.tv_backoffice_imperium_status(uuid) from public;
grant execute on function public.tv_backoffice_imperium_status(uuid) to authenticated;
