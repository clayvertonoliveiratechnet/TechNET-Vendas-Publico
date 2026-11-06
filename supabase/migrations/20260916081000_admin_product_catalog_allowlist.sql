-- Admin controla quais produtos ATIVOS do Imperium podem aparecer no TechNET.
create table if not exists public.tv_imperium_product_selection (
  base_key text not null,
  imperium_product_id bigint not null,
  enabled boolean not null default false,
  selected_by uuid null,
  selected_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (base_key, imperium_product_id)
);
alter table public.tv_imperium_product_selection enable row level security;
revoke all on public.tv_imperium_product_selection from anon, authenticated;

-- Mant?m os produtos oficiais j? ativos liberados na implanta??o inicial.
-- Novos produtos descobertos depois entram desabilitados at? decis?o do admin.
insert into public.tv_imperium_product_selection(base_key,imperium_product_id,enabled,selected_at,updated_at)
select distinct m.base_key,m.imperium_id,true,now(),now()
from public.tv_imperium_reference_map m
where m.entity_type='product' and m.source='imperium_direct' and m.active=true
  and upper(coalesce(m.metadata->>'status',''))='ATIVO'
on conflict(base_key,imperium_product_id) do nothing;

create or replace function public.tv_imperium_product_enabled(p_base text,p_product_id bigint)
returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
 select exists(
  select 1 from public.tv_imperium_reference_map m
  join public.tv_imperium_product_selection s
    on s.base_key=m.base_key and s.imperium_product_id=m.imperium_id and s.enabled=true
  where m.base_key=p_base and m.entity_type='product' and m.source='imperium_direct'
    and m.active=true and upper(coalesce(m.metadata->>'status',''))='ATIVO'
    and m.imperium_id=p_product_id
 );
$$;
revoke all on function public.tv_imperium_product_enabled(text,bigint) from public;
grant execute on function public.tv_imperium_product_enabled(text,bigint) to authenticated,service_role;

create or replace function public.tv_admin_imperium_product_catalog(p_base text default '',p_search text default '',p_filter text default 'all')
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_role text:=public.tv_current_role(); v_result jsonb;
begin
 if v_role<>'admin' then raise exception 'admin required'; end if;
 with official as (
  select distinct on (m.base_key,m.imperium_id)
   m.base_key,m.imperium_id,m.imperium_name,coalesce(m.metadata->>'group','') product_group,
   coalesce(m.metadata->>'brand','NET') brand,coalesce(m.metadata->>'table','') product_table,
   coalesce(m.metadata->>'status','ATIVO') imperium_status,
   nullif(replace((regexp_match(m.imperium_name,'R\$\s*([0-9]+(?:[,.][0-9]{1,2})?)\s*$','i'))[1],',','.'),'')::numeric price,
   coalesce(s.enabled,false) enabled,s.selected_at
  from public.tv_imperium_reference_map m
  left join public.tv_imperium_product_selection s on s.base_key=m.base_key and s.imperium_product_id=m.imperium_id
  where m.entity_type='product' and m.source='imperium_direct' and m.active=true
    and upper(coalesce(m.metadata->>'status',''))='ATIVO'
    and (coalesce(p_base,'')='' or m.base_key=p_base)
    and (coalesce(btrim(p_search),'')='' or m.imperium_name ilike '%'||btrim(p_search)||'%'
      or coalesce(m.metadata->>'group','') ilike '%'||btrim(p_search)||'%'
      or m.imperium_id::text like '%'||btrim(p_search)||'%')
  order by m.base_key,m.imperium_id,m.verified_at desc nulls last,m.id desc
 ), filtered as (
  select * from official where case lower(coalesce(p_filter,'all')) when 'enabled' then enabled=true when 'disabled' then enabled=false else true end
 )
 select jsonb_build_object(
  'summary',jsonb_build_object('active_total',(select count(*) from official),'enabled_total',(select count(*) from official where enabled),'disabled_total',(select count(*) from official where not enabled)),
  'products',coalesce((select jsonb_agg(jsonb_build_object('base_key',base_key,'imperium_id',imperium_id,'imperium_name',imperium_name,'product_group',product_group,'brand',brand,'product_table',product_table,'imperium_status',imperium_status,'price',price,'enabled',enabled,'selected_at',selected_at) order by base_key,product_group,imperium_name) from filtered),'[]'::jsonb)
 ) into v_result;
 return v_result;
end $$;
revoke all on function public.tv_admin_imperium_product_catalog(text,text,text) from public;
grant execute on function public.tv_admin_imperium_product_catalog(text,text,text) to authenticated;

create or replace function public.tv_admin_set_imperium_product_enabled(p_base text,p_product_id bigint,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_role text:=public.tv_current_role(); v_name text;
begin
 if v_role<>'admin' then raise exception 'admin required'; end if;
 select m.imperium_name into v_name from public.tv_imperium_reference_map m
 where m.base_key=p_base and m.entity_type='product' and m.source='imperium_direct' and m.active=true
   and upper(coalesce(m.metadata->>'status',''))='ATIVO' and m.imperium_id=p_product_id
 order by m.verified_at desc nulls last,m.id desc limit 1;
 if v_name is null then raise exception 'Produto n?o est? ATIVO no cat?logo oficial do Imperium'; end if;
 insert into public.tv_imperium_product_selection(base_key,imperium_product_id,enabled,selected_by,selected_at,updated_at)
 values(p_base,p_product_id,coalesce(p_enabled,false),auth.uid(),now(),now())
 on conflict(base_key,imperium_product_id) do update set enabled=excluded.enabled,selected_by=excluded.selected_by,selected_at=excluded.selected_at,updated_at=excluded.updated_at;
 return jsonb_build_object('ok',true,'base_key',p_base,'imperium_product_id',p_product_id,'product_name',v_name,'enabled',coalesce(p_enabled,false));
end $$;
revoke all on function public.tv_admin_set_imperium_product_enabled(text,bigint,boolean) from public;
grant execute on function public.tv_admin_set_imperium_product_enabled(text,bigint,boolean) to authenticated;

create or replace function public.tv_product_catalog_safe(p_base text default null)
returns table(base_key text,product_name text,product_group text,latest_value numeric)
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_role text:=public.tv_current_role();
begin
 if auth.uid() is null or v_role is null then raise exception 'not authorized'; end if;
 return query
 select m.base_key,m.imperium_name,coalesce(m.metadata->>'group',''),
  case when v_role='consultant' then null::numeric else nullif(replace((regexp_match(m.imperium_name,'R\$\s*([0-9]+(?:[,.][0-9]{1,2})?)\s*$','i'))[1],',','.'),'')::numeric end
 from public.tv_imperium_reference_map m
 join public.tv_imperium_product_selection s on s.base_key=m.base_key and s.imperium_product_id=m.imperium_id and s.enabled=true
 where m.entity_type='product' and m.source='imperium_direct' and m.active=true
   and upper(coalesce(m.metadata->>'status',''))='ATIVO'
   and (p_base is null or p_base='' or m.base_key=p_base)
 order by coalesce(m.metadata->>'group',''),m.imperium_name;
end $$;
revoke all on function public.tv_product_catalog_safe(text) from public;
grant execute on function public.tv_product_catalog_safe(text) to authenticated;

-- BackOffice e aprova??o final usam a mesma allowlist por meio de tv_imperium_product_enabled.
-- As fun??es de edi??o/valida??o s?o redefinidas em produ??o pela migra??o aplicada junto desta altera??o.
