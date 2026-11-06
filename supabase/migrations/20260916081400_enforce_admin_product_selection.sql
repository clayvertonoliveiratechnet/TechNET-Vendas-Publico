-- Impede o BackOffice de gravar ou aprovar produtos fora da sele??o do admin.
create or replace function public.tv_backoffice_correct_imperium_product(p_sale_id uuid,p_product_row_id uuid,p_imperium_product_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_role text; sp public.tv_sale_products; m public.tv_imperium_reference_map; s public.tv_sales; v_base text; v_group_sale text; v_group_imp text;
begin
 v_role:=public.tv_current_role();
 if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then raise exception 'backoffice or admin required'; end if;
 select * into s from public.tv_sales where id=p_sale_id for update;if s.id is null then raise exception 'sale not found'; end if;
 select * into sp from public.tv_sale_products where id=p_product_row_id and sale_id=p_sale_id for update;if sp.id is null then raise exception 'sale product not found'; end if;
 v_base:=coalesce(nullif(s.imperium_base_key,''),(public.tv_backoffice_imperium_preflight(p_sale_id)->>'base_key'));if v_base is null then raise exception 'Base do Imperium n?o identificada para esta venda'; end if;
 select * into m from public.tv_imperium_reference_map where base_key=v_base and entity_type='product' and imperium_id=p_imperium_product_id
  and source='imperium_direct' and active=true and upper(coalesce(metadata->>'status',''))='ATIVO'
  and public.tv_imperium_product_enabled(v_base,p_imperium_product_id)
 order by verified_at desc nulls last,id desc limit 1;
 if m.id is null then raise exception 'Produto n?o est? liberado pelo administrador para esta base'; end if;
 v_group_sale:=case upper(trim(coalesce(sp.product_group,''))) when 'TELEFONIA FIXA' then 'TELEFONE' when 'TELEFONE FIXO' then 'TELEFONE' else upper(trim(coalesce(sp.product_group,''))) end;
 v_group_imp:=case upper(trim(coalesce(m.metadata->>'group',''))) when 'TELEFONIA FIXA' then 'TELEFONE' when 'TELEFONE FIXO' then 'TELEFONE' else upper(trim(coalesce(m.metadata->>'group',''))) end;
 if v_group_imp<>v_group_sale then raise exception 'Grupo do produto do Imperium n?o corresponde ao produto da venda'; end if;
 update public.tv_sale_products set imperium_product_id=m.imperium_id,imperium_product_name=m.imperium_name,imperium_base_key=v_base,updated_at=now() where id=sp.id;
 update public.tv_sales x set imperium_base_key=v_base,status=case when x.status in ('submitted','under_review') then 'under_review' else x.status end where x.id=s.id;
 insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note) values(s.id,auth.uid(),s.status,case when s.status in ('submitted','under_review') then 'under_review' else s.status end,format('Produto vinculado ao Imperium pelo BackOffice: %s -> %s (IdProduto %s)',sp.product_name,m.imperium_name,m.imperium_id));
 return public.tv_backoffice_imperium_submission_for_approval(s.id);
end $$;
revoke all on function public.tv_backoffice_correct_imperium_product(uuid,uuid,bigint) from public;
grant execute on function public.tv_backoffice_correct_imperium_product(uuid,uuid,bigint) to authenticated,service_role;

create or replace function public.tv_backoffice_add_sale_product(p_sale_id uuid,p_imperium_product_id bigint,p_product_name text,p_monthly_value numeric,p_quantity integer)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_role text; s public.tv_sales; m public.tv_imperium_reference_map; v_base text; v_group text; v_name text; v_value numeric; v_price numeric;
begin
 v_role:=public.tv_current_role();if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then raise exception 'backoffice or admin required'; end if;
 select * into s from public.tv_sales where id=p_sale_id for update;if s.id is null then raise exception 'sale not found'; end if;
 if s.source<>'technet' then raise exception 'only TechNET sales can be edited'; end if;if s.status not in ('submitted','under_review') then raise exception 'A venda s? pode ser editada enquanto estiver em an?lise do BackOffice'; end if;if coalesce(p_quantity,0)<1 then raise exception 'Quantidade inv?lida'; end if;
 v_base:=coalesce(nullif(s.imperium_base_key,''),(public.tv_backoffice_imperium_preflight(p_sale_id)->>'base_key'));if nullif(v_base,'') is null then raise exception 'Base do Imperium n?o identificada'; end if;
 if not public.tv_imperium_product_enabled(v_base,p_imperium_product_id) then raise exception 'Produto n?o est? liberado pelo administrador para esta base'; end if;
 select * into m from public.tv_imperium_reference_map where base_key=v_base and entity_type='product' and imperium_id=p_imperium_product_id and source='imperium_direct' and active=true and upper(coalesce(metadata->>'status',''))='ATIVO' order by verified_at desc nulls last,id desc limit 1;
 if m.id is null then raise exception 'IdProduto n?o ? ATIVO no cat?logo oficial desta base'; end if;
 v_group:=coalesce(nullif(m.metadata->>'group',''),'OUTROS');v_name:=coalesce(nullif(btrim(p_product_name),''),m.imperium_name);
 begin v_price:=nullif(replace((regexp_match(m.imperium_name,'R\$\s*([0-9]+(?:[,.][0-9]{1,2})?)\s*$','i'))[1],',','.'),'')::numeric; exception when others then v_price:=null; end;
 v_value:=coalesce(p_monthly_value,v_price,0);if v_value<0 then raise exception 'Valor do produto inv?lido'; end if;
 insert into public.tv_sale_products(sale_id,product_name,product_group,monthly_value,quantity,source,imperium_product_id,imperium_product_name,imperium_base_key) values(s.id,v_name,v_group,v_value,p_quantity,'backoffice',m.imperium_id,m.imperium_name,v_base);
 update public.tv_sales x set imperium_base_key=v_base,status='under_review',real_product_summary=(select string_agg(p.product_name,' | ' order by p.created_at) from public.tv_sale_products p where p.sale_id=x.id),product_group_summary=(select string_agg(distinct p.product_group,' | ') from public.tv_sale_products p where p.sale_id=x.id),total_value=(select coalesce(sum(p.monthly_value*p.quantity),0) from public.tv_sale_products p where p.sale_id=x.id) where x.id=s.id;
 insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note) values(s.id,auth.uid(),s.status,'under_review',format('Produto adicionado pelo BackOffice: %s / IdProduto %s / R$ %s / qtd %s',v_name,m.imperium_id,v_value,p_quantity));
 return public.tv_backoffice_imperium_fix_options(s.id);
end $$;
revoke all on function public.tv_backoffice_add_sale_product(uuid,bigint,text,numeric,integer) from public;
grant execute on function public.tv_backoffice_add_sale_product(uuid,bigint,text,numeric,integer) to authenticated,service_role;

create or replace function public.tv_backoffice_update_sale_product(p_sale_id uuid,p_product_row_id uuid,p_imperium_product_id bigint,p_product_name text,p_monthly_value numeric,p_quantity integer)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_role text; s public.tv_sales; sp public.tv_sale_products; m public.tv_imperium_reference_map; v_base text; v_group text;
begin
 v_role:=public.tv_current_role();if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then raise exception 'backoffice or admin required'; end if;
 select * into s from public.tv_sales where id=p_sale_id for update;if s.id is null then raise exception 'sale not found'; end if;if s.source<>'technet' then raise exception 'only TechNET sales can be edited'; end if;if s.status not in ('submitted','under_review') then raise exception 'A venda s? pode ser editada enquanto estiver em an?lise do BackOffice'; end if;
 select * into sp from public.tv_sale_products where id=p_product_row_id and sale_id=p_sale_id for update;if sp.id is null then raise exception 'sale product not found'; end if;if coalesce(p_monthly_value,-1)<0 then raise exception 'Valor do produto inv?lido'; end if;if coalesce(p_quantity,0)<1 then raise exception 'Quantidade inv?lida'; end if;
 v_base:=coalesce(nullif(s.imperium_base_key,''),(public.tv_backoffice_imperium_preflight(p_sale_id)->>'base_key'));if nullif(v_base,'') is null then raise exception 'Base do Imperium n?o identificada'; end if;if not public.tv_imperium_product_enabled(v_base,p_imperium_product_id) then raise exception 'Produto n?o est? liberado pelo administrador para esta base'; end if;
 select * into m from public.tv_imperium_reference_map where base_key=v_base and entity_type='product' and imperium_id=p_imperium_product_id and source='imperium_direct' and active=true and upper(coalesce(metadata->>'status',''))='ATIVO' order by verified_at desc nulls last,id desc limit 1;if m.id is null then raise exception 'IdProduto n?o ? ATIVO no cat?logo oficial desta base'; end if;
 v_group:=coalesce(nullif(m.metadata->>'group',''),sp.product_group,'');
 update public.tv_sale_products set product_name=coalesce(nullif(btrim(p_product_name),''),m.imperium_name),product_group=v_group,monthly_value=p_monthly_value,quantity=p_quantity,imperium_product_id=m.imperium_id,imperium_product_name=m.imperium_name,imperium_base_key=v_base,updated_at=now() where id=sp.id;
 update public.tv_sales x set imperium_base_key=v_base,status='under_review',real_product_summary=(select string_agg(p.product_name,' | ' order by p.created_at) from public.tv_sale_products p where p.sale_id=x.id),product_group_summary=(select string_agg(distinct p.product_group,' | ') from public.tv_sale_products p where p.sale_id=x.id),total_value=(select coalesce(sum(p.monthly_value*p.quantity),0) from public.tv_sale_products p where p.sale_id=x.id) where x.id=s.id;
 insert into public.tv_sale_history(sale_id,actor_id,from_status,to_status,note) values(s.id,auth.uid(),s.status,'under_review',format('Produto editado pelo BackOffice: %s -> %s / IdProduto %s',sp.product_name,coalesce(nullif(btrim(p_product_name),''),m.imperium_name),m.imperium_id));
 return public.tv_backoffice_imperium_fix_options(s.id);
end $$;
revoke all on function public.tv_backoffice_update_sale_product(uuid,uuid,bigint,text,numeric,integer) from public;
grant execute on function public.tv_backoffice_update_sale_product(uuid,uuid,bigint,text,numeric,integer) to authenticated,service_role;

create or replace function public.tv_backoffice_imperium_submission_for_approval(p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare s public.tv_sales; v_bundle jsonb; v_blockers jsonb:='[]'::jsonb; v_base text; v_product_count integer:=0; v_unvalidated_products integer:=0; v_role text;
begin
 v_role:=public.tv_current_role();if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then raise exception 'backoffice or admin required'; end if;
 select * into s from public.tv_sales where id=p_sale_id;if s.id is null then raise exception 'sale not found'; end if;
 v_bundle:=public.tv_backoffice_imperium_submission_bundle(p_sale_id);v_base:=nullif(v_bundle->>'base_key','');
 select coalesce(jsonb_agg(x),'[]'::jsonb) into v_blockers from jsonb_array_elements(coalesce(v_bundle->'blockers','[]'::jsonb)) x where coalesce(x->>'code','') not in ('status_not_approved','product_ids_unmapped');
 if s.status not in ('submitted','under_review','approved','sync_pending') then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','backoffice_review_required','message','A venda precisa estar em an?lise do BackOffice antes da aprova??o e do envio ao Imperium.')); end if;
 if s.registration_checked_at is null then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','registration_review_missing','message','O BackOffice precisa confirmar o cadastro antes de aprovar a venda.')); end if;
 if s.active_confirmed_at is null then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','active_review_missing','message','O BackOffice precisa confirmar o ativo com o assinante antes de aprovar a venda.')); end if;
 select count(*),count(*) filter(where not public.tv_imperium_product_enabled(v_base,sp.imperium_product_id)) into v_product_count,v_unvalidated_products from public.tv_sale_products sp where sp.sale_id=s.id;
 if v_product_count=0 then if not exists(select 1 from jsonb_array_elements(v_blockers) x where x->>'code'='products_missing') then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','products_missing','message','A venda n?o possui produtos.')); end if;
 elsif v_unvalidated_products>0 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','product_validation_pending','message',format('%s produto(s) n?o est?o liberados pelo administrador ou n?o possuem IdProduto ATIVO do Imperium.',v_unvalidated_products))); end if;
 v_bundle:=jsonb_set(v_bundle,'{blockers}',v_blockers,true);v_bundle:=jsonb_set(v_bundle,'{ready}',to_jsonb(jsonb_array_length(v_blockers)=0),true);
 v_bundle:=jsonb_set(v_bundle,'{approval_flow}',jsonb_build_object('backoffice_approval_required',true,'registration_confirmed',s.registration_checked_at is not null,'active_confirmed',s.active_confirmed_at is not null,'products_total',v_product_count,'products_unvalidated',v_unvalidated_products),true);
 return v_bundle;
end $$;
revoke all on function public.tv_backoffice_imperium_submission_for_approval(uuid) from public;
grant execute on function public.tv_backoffice_imperium_submission_for_approval(uuid) to authenticated,service_role;
