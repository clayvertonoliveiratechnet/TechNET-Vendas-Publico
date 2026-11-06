create table if not exists public.tv_imperium_reference_map (
  id bigserial primary key,
  base_key text not null,
  entity_type text not null check (entity_type in ('product','payment','status','sale_type')),
  local_key text not null,
  imperium_id bigint,
  imperium_name text,
  metadata jsonb not null default '{}'::jsonb,
  source text not null default 'verified',
  active boolean not null default true,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(base_key,entity_type,local_key)
);

alter table public.tv_imperium_reference_map enable row level security;
revoke all on public.tv_imperium_reference_map from anon, authenticated;

create or replace function public.tv_backoffice_imperium_preflight(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  s public.tv_sales;
  p public.tv_profiles;
  iu public.tv_imperium_users;
  ia public.tv_imperium_accounts;
  v_base text;
  v_doc text;
  v_doc_len integer;
  v_identity_docs integer := 0;
  v_address_docs integer := 0;
  v_product_count integer := 0;
  v_unmapped_products integer := 0;
  v_products jsonb := '[]'::jsonb;
  v_payment_id bigint;
  v_payment_name text;
  v_status_id bigint;
  v_status_name text;
  v_team_id bigint;
  v_team_name text;
  v_sale_kind text;
  v_sale_tipo text;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_candidates jsonb := '[]'::jsonb;
  v_role text;
begin
  v_role := public.tv_current_role();
  if v_role not in ('admin','backoffice') then
    raise exception 'backoffice or admin required';
  end if;

  select * into s from public.tv_sales where id=p_sale_id;
  if s.id is null then raise exception 'sale not found'; end if;

  if s.source <> 'technet' then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','source_not_technet','message','Somente vendas TechNET podem ser enviadas ao Imperium.'));
  end if;
  if s.status not in ('approved','sync_pending') then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','status_not_approved','message','A venda precisa estar aprovada antes do envio.'));
  end if;

  v_base := coalesce(nullif(s.imperium_base_key,''),
    (select case c.name
      when 'Natal' then 'natal' when 'Parnamirim' then 'natal' when 'Extremoz' then 'natal' when 'Macaíba' then 'natal'
      when 'Ceará-Mirim' then 'natal' when 'São Gonçalo do Amarante' then 'natal'
      when 'Fortaleza' then 'fortaleza' when 'Aquiraz' then 'fortaleza' when 'Caucaia' then 'fortaleza' when 'Eusébio' then 'fortaleza' when 'Maracanaú' then 'fortaleza'
      when 'Mossoró' then 'mossoro'
      when 'Recife' then 'recife' when 'Camaragibe' then 'recife' when 'Jaboatão dos Guararapes' then 'recife' when 'Olinda' then 'recife' when 'Paulista' then 'recife'
      else null end from public.tv_cities c where c.id=s.city_id));
  if v_base is null then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','base_unresolved','message','A base do Imperium não foi identificada.'));
  end if;

  if nullif(trim(coalesce(s.customer_name,'')),'') is null then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','customer_name_missing','message','Nome do cliente ausente.')); end if;
  v_doc := regexp_replace(coalesce(s.customer_document,''),'\D','','g');
  v_doc_len := length(v_doc);
  if v_doc_len not in (11,14) then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','customer_document_invalid','message','CPF/CNPJ inválido para envio.')); end if;
  if nullif(trim(coalesce(s.customer_phone,'')),'') is null then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','customer_phone_missing','message','Telefone principal ausente.')); end if;
  if nullif(trim(coalesce(s.postal_code,'')),'') is null or nullif(trim(coalesce(s.street,'')),'') is null or nullif(trim(coalesce(s.street_number,'')),'') is null or nullif(trim(coalesce(s.neighborhood,'')),'') is null or nullif(trim(coalesce(s.city_name,'')),'') is null or nullif(trim(coalesce(s.state,'')),'') is null then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','address_incomplete','message','Endereço obrigatório incompleto.'));
  end if;

  if v_doc_len=11 then
    if s.customer_birth_date is null then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','birth_date_missing','message','Data de nascimento ausente para cliente CPF.')); end if;
    if nullif(trim(coalesce(s.customer_mother_name,'')),'') is null then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','mother_name_missing','message','Nome da mãe ausente para cliente CPF.')); end if;
    if nullif(trim(coalesce(s.customer_rg,'')),'') is null then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','rg_missing','message','RG não informado; confirmar se o cadastro do Imperium aceita sem RG.')); end if;
  end if;

  select count(*) filter(where document_type='identity'), count(*) filter(where document_type='address')
    into v_identity_docs,v_address_docs from public.tv_sale_documents where sale_id=s.id;
  if v_identity_docs=0 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','identity_document_missing','message','Documento de identidade obrigatório ausente.')); end if;
  if v_address_docs=0 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','address_document_missing','message','Comprovante de endereço obrigatório ausente.')); end if;

  select * into p from public.tv_profiles where user_id=s.consultant_id;
  if p.user_id is null then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','consultant_missing','message','Consultor da venda não identificado.'));
  else
    if p.imperium_user_ref is not null then select * into iu from public.tv_imperium_users where id=p.imperium_user_ref and active=true; end if;
    if p.imperium_account_id is not null then select * into ia from public.tv_imperium_accounts where id=p.imperium_account_id and active=true; end if;
    if iu.id is null then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','consultant_imperium_identity_unlinked','message','O consultor ainda não está vinculado ao IdPessoaUsuario correto do Imperium.'));
    end if;
  end if;

  v_team_id := coalesce(
    (select t.imperium_team_id from public.tv_teams t where t.id=coalesce(s.team_id,p.team_id) and t.active=true),
    iu.imperium_team_id
  );
  v_team_name := coalesce(
    (select t.name from public.tv_teams t where t.id=coalesce(s.team_id,p.team_id) and t.active=true),
    iu.team_name
  );
  if v_team_id is null then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','imperium_team_unresolved','message','Equipe/IdTime do Imperium não foi resolvido para esta venda.'));
  end if;

  v_sale_kind := case upper(coalesce(s.contract_type,'')) when 'ND' then 'NV' when 'UP' then 'UP-PN' else null end;
  v_sale_tipo := case v_sale_kind when 'NV' then 'N' when 'UP-PN' then 'P' else null end;
  if v_sale_kind is null then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','sale_type_unresolved','message','Tipo de venda não pôde ser convertido para NOVA/UP do Imperium.'));
  end if;

  select m.imperium_id,m.imperium_name into v_payment_id,v_payment_name
    from public.tv_imperium_reference_map m
    where m.base_key=v_base and m.entity_type='payment' and upper(trim(m.local_key))=upper(trim(coalesce(s.payment_method,''))) and m.active=true limit 1;
  if nullif(trim(coalesce(s.payment_method,'')),'') is null then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','payment_missing','message','Forma de pagamento ausente.'));
  elsif v_payment_id is null then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','payment_id_unmapped','message','IdFormaPagamento do Imperium ainda não foi validado para esta forma de pagamento.'));
  end if;
  if nullif(trim(coalesce(s.payment_due,'')),'') is null then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','payment_due_missing','message','Dia de vencimento ausente.')); end if;
  if upper(coalesce(s.payment_method,''))='DCC' then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','dcc_details_not_implemented','message','Envio DCC ainda precisa do mapeamento dos dados bancários exigidos pelo Imperium.'));
  end if;

  select m.imperium_id,m.imperium_name into v_status_id,v_status_name
    from public.tv_imperium_reference_map m
    where m.base_key=v_base and m.entity_type='status' and upper(trim(m.local_key))=upper('INITIAL_'||coalesce(v_sale_kind,'')) and m.active=true limit 1;
  if v_status_id is null then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','initial_status_unmapped','message','Status inicial da nova venda no Imperium ainda não foi validado.'));
  end if;

  select count(*) into v_product_count from public.tv_sale_products where sale_id=s.id;
  if v_product_count=0 then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','products_missing','message','A venda não possui produtos.'));
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'product_name',sp.product_name,'product_group',sp.product_group,'monthly_value',sp.monthly_value,'quantity',sp.quantity,
      'imperium_id',m.imperium_id,'imperium_name',m.imperium_name,'mapped',(m.imperium_id is not null)
    ) order by sp.created_at),'[]'::jsonb), count(*) filter(where m.imperium_id is null)
    into v_products,v_unmapped_products
    from public.tv_sale_products sp
    left join public.tv_imperium_reference_map m on m.base_key=v_base and m.entity_type='product' and upper(trim(m.local_key))=upper(trim(sp.product_name)) and m.active=true
    where sp.sale_id=s.id;
    if v_unmapped_products>0 then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','product_ids_unmapped','message',format('%s produto(s) ainda sem IdProduto validado no Imperium.',v_unmapped_products)));
    end if;
  end if;

  if s.scheduled_date is null then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','schedule_missing','message','Venda sem data de agendamento; manter como pendência até confirmar o comportamento do status inicial.')); end if;
  if nullif(trim(coalesce(s.customer_email,'')),'') is null then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','email_missing','message','E-mail do cliente não informado.')); end if;
  if nullif(trim(coalesce(s.reference_point,'')),'') is null then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','reference_point_missing','message','Ponto de referência não informado.')); end if;

  if v_base is not null and v_product_count>0 then
    select coalesce(jsonb_agg(x),'[]'::jsonb) into v_candidates from (
      select jsonb_build_object('product_name',ip.product_name,'product_group',ip.product_group,'latest_value',ip.latest_value,'sales_seen',ip.sales_seen) x
      from public.tv_imperium_products ip
      join public.tv_sale_products sp on sp.sale_id=s.id
      where ip.base_key=v_base and ip.active=true and ip.product_group=sp.product_group
        and (ip.product_name ilike '%'||regexp_replace(sp.product_name,'[^0-9]+','','g')||'%' or abs(ip.latest_value-sp.monthly_value)<=20)
      order by abs(ip.latest_value-sp.monthly_value),ip.sales_seen desc
      limit 8
    ) z;
  end if;

  return jsonb_build_object(
    'ok',true,
    'ready',jsonb_array_length(v_blockers)=0,
    'sale_id',s.id,
    'base_key',v_base,
    'sale_status',s.status,
    'submission',jsonb_build_object(
      'sale_kind',v_sale_kind,'imperium_tipo',v_sale_tipo,
      'consultant_name',p.full_name,
      'consultant_imperium_person_id',iu.imperium_person_id,
      'consultant_login_id',ia.imperium_user_id,
      'partner_id',ia.partner_id,
      'team_id',v_team_id,'team_name',v_team_name,
      'payment_method',s.payment_method,'payment_due',s.payment_due,'payment_id',v_payment_id,'payment_name',v_payment_name,
      'initial_status_id',v_status_id,'initial_status_name',v_status_name,
      'scheduled_date',s.scheduled_date,'schedule_period',s.schedule_period,
      'products',v_products
    ),
    'documents',jsonb_build_object('identity',v_identity_docs,'address',v_address_docs),
    'blockers',v_blockers,
    'warnings',v_warnings,
    'product_candidates',v_candidates,
    'checked_at',now()
  );
end
$$;

revoke all on function public.tv_backoffice_imperium_preflight(uuid) from public;
grant execute on function public.tv_backoffice_imperium_preflight(uuid) to authenticated;