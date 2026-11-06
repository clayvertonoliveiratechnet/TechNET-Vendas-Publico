-- Restrict admin dashboard RPCs to signed-in sessions.
-- Authorization remains enforced inside each function by tv_current_role()='admin'.

revoke execute on function public.tv_admin_dashboard_scope(text,text,integer,integer,integer,integer,text) from public, anon;
grant execute on function public.tv_admin_dashboard_scope(text,text,integer,integer,integer,integer,text) to authenticated, service_role;

revoke execute on function public.tv_admin_installation_product_summary(text,text,integer,integer,integer,integer,text) from public, anon;
grant execute on function public.tv_admin_installation_product_summary(text,text,integer,integer,integer,integer,text) to authenticated, service_role;

revoke execute on function public.tv_admin_supervisor_ranking_scope(text,text,integer,integer,integer,integer,text) from public, anon;
grant execute on function public.tv_admin_supervisor_ranking_scope(text,text,integer,integer,integer,integer,text) to authenticated, service_role;

revoke execute on function public.tv_real_product_metrics_scope(text,integer,integer,text,integer,integer,text) from public, anon;
grant execute on function public.tv_real_product_metrics_scope(text,integer,integer,text,integer,integer,text) to authenticated, service_role;
