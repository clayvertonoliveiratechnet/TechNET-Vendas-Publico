create or replace function public.tv_backoffice_confirm_imperium_documents(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_role text;
  v_uid uuid:=auth.uid();
begin
  v_role:=public.tv_current_role();
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and v_role not in ('admin','backoffice') then
    raise exception 'backoffice or admin required';
  end if;
  update public.tv_sales
     set documents_checked_at=now(),documents_checked_by=v_uid
   where id=p_sale_id;
  if not found then raise exception 'sale not found'; end if;
  return public.tv_backoffice_imperium_submission_bundle(p_sale_id);
end
$$;

revoke all on function public.tv_backoffice_confirm_imperium_documents(uuid) from public;
grant execute on function public.tv_backoffice_confirm_imperium_documents(uuid) to authenticated,service_role;
