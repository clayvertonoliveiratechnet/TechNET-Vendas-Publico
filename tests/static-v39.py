from pathlib import Path
import json
import re
r=Path(__file__).resolve().parents[1]
idx=(r/'index.html').read_text(encoding='utf-8-sig')
app=(r/'app-v48.js').read_text(encoding='utf-8-sig')
field=(r/'field-workflow-v48.js').read_text(encoding='utf-8-sig')
sw=(r/'sw-v48.js').read_text(encoding='utf-8-sig')
boedit=(r/'backoffice-sale-editor-v78.js').read_text(encoding='utf-8-sig')
admin=(r/'admin-control-v42.js').read_text(encoding='utf-8-sig')
adm=(r/'admin-dashboard-v20.js').read_text(encoding='utf-8-sig')
teamfix=(r/'admin-team-filter-fix-v60.css').read_text(encoding='utf-8-sig')
status_products=(r/'dashboard-installation-products-v76.css').read_text(encoding='utf-8-sig')
ui_icons=(r/'ui-icons-v48.js').read_text(encoding='utf-8-sig')
premium_ui=(r/'technet-dashboard-premium.css').read_text(encoding='utf-8-sig')
location_ui=(r/'commercial-location-v1.js').read_text(encoding='utf-8-sig')
location_css=(r/'commercial-location-v1.css').read_text(encoding='utf-8-sig')
supervisor_team_pulse=(r/'supervisor-team-pulse-v113.js').read_text(encoding='utf-8-sig')
supervisor_team_pulse_css=(r/'supervisor-team-pulse-v113.css').read_text(encoding='utf-8-sig')
dark_fix=(r/'theme-dark-fixes-v117.css').read_text(encoding='utf-8-sig')
supervisor_team_pulse_sql=(r/'supabase/migrations/20260924123000_supervisor_team_pulse.sql').read_text(encoding='utf-8-sig')
canonical_virtua_sql=(r/'supabase/migrations/20260924151500_canonical_virtua_counting.sql').read_text(encoding='utf-8-sig')
installed_virtua_status_sql=(r/'supabase/migrations/20260924152500_align_installed_virtua_status.sql').read_text(encoding='utf-8-sig')
consultant_identity_sql=(r/'supabase/migrations/20260924154000_fix_consultant_identity_precedence.sql').read_text(encoding='utf-8-sig')
product_mix_sql=(r/'supabase/migrations/20260924161000_canonical_supervisor_product_mix.sql').read_text(encoding='utf-8-sig')
pro=(r/'professional.css').read_text(encoding='utf-8-sig')
css=''.join((r/x).read_text(encoding='utf-8-sig') for x in ['ui-system-v40.css','design-system-v38.css','admin-control-v42.css','android-fix-v43.css','ux-v47.css','sales-ui-v48.css','premium-3d-v49.css','supervisor-kpi-v56.css','technet-design-system.css','technet-dashboard-premium.css'])
json.loads((r/'firebase.json').read_text(encoding='utf-8-sig'))
assert 'theme-dark-fixes-v117.css?v=121' in idx and idx.index('theme-dark-fixes-v117.css?v=121') > idx.index('supervisor-team-pulse-v113.css?v=113')
assert ':root[data-theme="dark"] .sale-progress{' in dark_fix and 'background:var(--cmd-border,#334155)!important' in dark_fix
assert 'app-v48.js?v=119' in idx and 'dashboard-installation-products-v76.css?v=90' in idx and 'professional.css?v=37' in idx and 'android-fix-v43.css?v=46' in idx and 'sales-ui-v48.css?v=60' in idx and 'premium-3d-v49.css?v=52' in idx and 'supervisor-kpi-v56.css?v=56' in idx and 'ux-v47.css?v=47' in idx and 'admin-team-filter-fix-v60.css?v=103' in idx and 'technet-design-system.css?v=41' in idx and 'technet-dashboard-premium.css?v=96' in idx and 'navigation-wayfinder-v110.css?v=113' in idx and 'desktop-alignment-fix-v111.css?v=112' in idx and 'supervisor-team-pulse-v113.css?v=113' in idx and 'apple-navbar-v82.css?v=100' in idx and 'studio-v42' not in idx
assert 'backoffice-sale-editor-v78.js?v=78' in idx
assert all(x in idx for x in ['id="loginForm"','id="impBase"','id="impUser"','id="impPassword"','id="passwordToggle"','id="loginBtn"','id="loginMsg"'])
assert 'login-benefits' in idx and 'login-card-wrap' in idx and 'login-mobile-welcome' in idx and 'login-progress' in idx and 'themeToggleLoginMobile' in idx and 'themeSvg(dark)' in idx and 'theme-svg' in idx
assert 'tv-imperium-direct-auth' in app and 'imperiumLogin' in app and 'contingencyLogin' in app
assert 'mobileRecoveryV43' in app and 'retryBootV43' in app and 'setupAndroidUXV41' in app and "page_ready" in app
android_tabs=(r/'android-dashboard-v82.js').read_text(encoding='utf-8-sig')
android_tabs_css=(r/'android-dashboard-v82.css').read_text(encoding='utf-8-sig')
assert 'android-tabs-v4' in android_tabs and 'android-tabs-v4' in android_tabs_css and 'android-dashboard-v82.js?v=83' in idx and 'android-dashboard-v82.css?v=84' in idx and 'apple-navbar-v82.js?v=85' in idx
wayfinder=(r/'navigation-wayfinder-v110.css').read_text(encoding='utf-8-sig')
assert '.mobile-bottom-nav.android-tabs-v4' not in wayfinder
assert 'font-size:10px!important' in android_tabs_css and 'font-size:9.5px!important' in android_tabs_css
assert "if(event.persisted)setTimeout(()=>recover({restored:true}),80)" in app and "let recovering=false" in app and "window.addEventListener('focus',()=>setTimeout(recover" not in app and "setInterval(recover,5000)" not in app
assert 'Promise.allSettled' in adm and 'adm-loading-shell' in adm and 'Dashboard principal' in adm and 'tv_admin_supervisor_ranking_scope' in adm and '.limit(5000)' not in adm and 'rpcRetry' in adm and 'ensureMobileNav' not in adm
assert all(x in adm for x in ['statusProductGroup','VENDAS INSTALADAS','PENDENTES DE INSTALAÇÃO','TODAS AS VENDAS','RECEITA','consultants_virtua','EM ALTA · VIRTUA','ATENÇÃO · VIRTUA'])
assert all(x in adm for x in ['sales=virtua','data-total-sales','vendas no status · ${virtua} Virtua','${virtua} Virtua${virtua===1?\'\':\'s\'} no status'])
assert 'installProducts.total||installProducts.all' in adm and 'Instaladas + pendentes de instalação no período filtrado' in adm
assert all(x in adm for x in ["leaderboardRows(consultVirtua,'consultant')","consultVirtua.slice(0,5)",'RANKING DE SUPERVISORES · VIRTUA','RANKING DE CONSULTORES · VIRTUA','Somente vendas Virtua / Banda Larga, sem MDU'])
assert all(x in adm for x in ['dailyVirtua=d.daily_virtua||[]','virtuaDailyAvg','MÉDIA DIÁRIA · VIRTUA','Virtuas/dia','Somente vendas Virtua / Banda Larga por dia útil, sem MDU.'])
assert all(x in adm for x in ['BASE_CITIES','scopeBaseKey','RDT_CITIES','VNA_CITIES','Todas as bases e cidades','Fortaleza, Recife e região','Natal, Mossoró e região','adm-city-scope','data-city'])
assert all(x in adm for x in ["['all','TODOS'","['aquiraz','Aquiraz']","['jaboatao-dos-guararapes','Jaboatão dos Guararapes']","['extremoz','Extremoz']","['sao-goncalo-do-amarante','São Gonçalo do Amarante']"])
assert 'adm-team-picker-chevron' in adm and "icon('chevronDown')" in adm
assert all(x in adm for x in ['Natal, Mossoró e região','dynamicTeamOptions','aria-label="${esc(x[1])}: ${esc(x[2]||x[1])}"'])
assert all(x in adm for x in ['teamSelections','teamFilterValue','data-team-all','admTeamApply','Selecionar equipes / supervisores'])
assert "if(profile?.role!=='consultant')return" in app
assert 'tv_product_catalog' in field and 'tv_sale_drafts' in field
assert 'requestReason' in field and 'prompt(' not in field
assert 'currentProductBase' in field and 'Selecione um produto válido para a cidade/base escolhida' in field
assert all(x in field for x in ['cepSearchBtn','lookupCep','viacep.com.br','brasilapi.com.br',"postal_code:digits(get('sCep'))"])
assert all(x in field for x in ['tv_draft_sale_edit_bundle','tv_update_draft_sale','tv_submit_sale_to_backoffice','Corrigir venda','Reenviar ao BackOffice'])
assert all(x in app for x in ['saleEditAction','wireSaleEditActions','Editar rascunho','Corrigir venda'])
assert '.cep-search-row' in pro and '.cep-lookup-status.is-success' in pro and '.cep-lookup-status.is-error' in pro
assert 'tv_backoffice_correct_imperium_product' in field and 'tv_backoffice_confirm_imperium_documents' in field and 'boConfirmDocs' in field and 'boUploadCorrectDoc' in field and 'Aprovar e enviar ao Imperium' in field and 'Finalizar venda' not in field
assert 'tv_backoffice_imperium_submission_bundle' in field and 'if(!preflight?.ready)' in field
assert all(x in boedit for x in ['tv_backoffice_sale_edit_bundle','tv_backoffice_update_sale_fields','Editar venda completa','Salvar correções','registration'])
assert 'tv_admin_action_center' in admin and 'tv_admin_save_goal_scope' in admin
assert 'app-v48.js?v=119' in idx and '/app-v48.js?v=119' in sw and '/android-dashboard-v82.css?v=84' in sw
assert 'technet-vendas-v127-claro-command' in sw and '/theme-dark-fixes-v117.css?v=121' in sw and '/claro-command-v120.css?v=120' in sw and '/claro-command-v120.js?v=120' in sw and '/admin-users.js?v=106' in sw and '/admin-control-v42.css?v=106' in sw and '/ui-icons-v48.js?v=94' in sw and '/dashboard-installation-products-v76.css?v=90' in sw and '/backoffice-sale-editor-v78.js?v=78' and '/app-v48.js?v=119' in sw and '/apple-navbar-v82.js?v=85' in sw and '/imperium-products-page-v74.js?v=74' in sw and '/admin-team-filter-fix-v60.css?v=103' in sw and '/supervisor-kpi-v56.css?v=56' in sw and '/mobile-bottom-nav-motion.js?v=1' in sw and '/mobile-sidebar-motion.js?v=2' in sw and '/professional.css?v=37' in sw and '/android-fix-v43.css?v=46' in sw and '/field-workflow-v48.js?v=56' in sw and '/sales-ui-v48.css?v=60' in sw and '/premium-3d-v49.css?v=52' in sw and '/observability-v46.js?v=46' in sw and '/admin-dashboard-v20.js?v=115' in sw and '/supervisor-team-pulse-v113.js?v=113' in sw and '/supervisor-team-pulse-v113.css?v=113' in sw and '/technet-design-system.css?v=41' in sw and '/technet-dashboard-premium.css?v=96' in sw and '/navigation-wayfinder-v110.css?v=113' in sw and '/desktop-alignment-fix-v111.css?v=112' in sw and '/apple-navbar-v82.css?v=100' in sw and 'u.origin!==self.location.origin' in sw and "cache:'no-store'" in sw and "cache:'reload'" in sw
core=(r/'core-utils-v38.js').read_text(encoding='utf-8-sig');assert "timeZone:'America/Fortaleza'" in core and 'formatDateOnly' in core and 'field-workflow-v48.js?v=56' in app
assert all(x in supervisor_team_pulse for x in ['tv_supervisor_team_pulse','ACOMPANHAMENTO DA EQUIPE','PRODUÇÃO POR CONSULTOR','trend_virtua','virtua_need_day'])
assert all(x in supervisor_team_pulse_css for x in ['TechNET Team Pulse v113','.stp113-scoreboard','.stp113-table','.stp113-mix']) and supervisor_team_pulse_css.count('{')==supervisor_team_pulse_css.count('}')
assert all(x in supervisor_team_pulse_sql for x in ['create or replace function public.tv_supervisor_team_pulse','tv_supervisor_sale_in_scope','tv_commercial_scope_filter_match','supervisor required'])
# canonical Virtua source of truth: one qualifying sale = one Virtua, never dependent on product enrichment rows.
assert canonical_virtua_sql.count('public.tv_is_virtua_product(') >= 3
assert all(x in canonical_virtua_sql for x in ['create or replace function public.tv_team_goal_dashboard','create or replace function public.tv_supervisor_team_pulse','create or replace function public.tv_admin_installation_product_summary'])
assert "sum(greatest(coalesce(sp.quantity,1),1)) filter (\n        where upper(trim(coalesce(sp.product_group,'')))='BANDA LARGA'" not in canonical_virtua_sql
# installed Virtua status semantics must match the dashboard: synced OR Imperium INSTALADA.
assert "s.status=''synced'' or upper(btrim(coalesce(s.imperium_status,'''')))=''INSTALADA'' then ''installed''" in installed_virtua_status_sql
# Imperium consultant identity must win over stale/mislinked local profile names.
assert all(x in consultant_identity_sql for x in ['tv_commercial_consultant_name','p_imperium_name','p_commercial_name','p_profile_name','imperium_consultant_id=357457',"imperium_user_ref=null"])
assert consultant_identity_sql.index("nullif(btrim(p_imperium_name),'')") < consultant_identity_sql.index("nullif(btrim(p_profile_name),'')")
assert all(x in consultant_identity_sql for x in ['tv_admin_dashboard_scope','tv_admin_consultant_options_scope','tv_sales_page_month','tv_sales_consultant_options_month'])
# official Imperium product mix semantics: MULTI=CHIP, TV=TV BOX, FONE only on Imperium INSTALADA.
assert all(x in product_mix_sql for x in ['tv_count_commercial_product',"when 'MULTI' then item like '%CHIP%'","when 'TV' then item like '%TV BOX%'","when 'FONE' then item like '%FONE%' or item like '%TELEFONE%'","upper(btrim(coalesce(s.imperium_status,'')))='INSTALADA' as imperium_installed"])
assert all(x in product_mix_sql for x in ["public.tv_count_commercial_product(ss.products_text,'MULTI')","public.tv_count_commercial_product(ss.products_text,'TV')","public.tv_count_commercial_product(ss.products_text,'FONE')"])
assert "supervisor-team-pulse-v113.js?v=113" in adm and "id=\"supervisorTeamPulse\"" in adm and 'renderSupervisorTeamPulse' in adm
assert 'premium-dashboard' in app and 'dashboard-hero-metric' in app and 'setupPremiumTilt' in app and 'rank-track' in app and 'TechNETDashboardMotion' in app
assert 'navigationToken' in app and 'errorState' in app and 'closeSidebar' in app and "register('/sw-v48.js?v=127')" in app and 'nav-group' in app and 'sales-cards' in app and 'ui-icons-v48.js?v=94' in app
assert all(x in app for x in ['isVirtuaRankingSaleV97','Ranking Virtua por equipe','Consultores Virtua','Consultores Virtua em evidência','vendas Virtua'])
nav_pages=set(re.findall(r"page:'([^']+)'",app))
handled_pages=set(re.findall(r"page==='([^']+)'",app))
assert nav_pages <= handled_pages, f'Rotas de navegação sem handler: {sorted(nav_pages-handled_pages)}'
motion=(r/'mobile-bottom-nav-motion.js').read_text(encoding='utf-8-sig')
assert 'motion@13.2.0/+esm' in motion and 'prefers-reduced-motion:reduce' in motion and 'Android' in motion and 'mobile-nav-indicator' in motion
assert 'setupMobileBottomNavMotion' in app and 'animateMobileBottomNavActive' in app and 'setMobileBottomNavKeyboardHidden' in app
assert all(x in dark_fix for x in ['apple-nav-link.active','mobile-bottom-nav.android-tabs-v4','caps-lock:not(:empty)','input:-webkit-autofill','tg77-disclosure-meta em','leaflet-popup-content-wrapper'])
sidebar_motion=(r/'mobile-sidebar-motion.js').read_text(encoding='utf-8-sig')
# Drawer mobile atual: valida comportamento/seguranca sem acoplar o teste a valores exatos da animacao.
assert 'motion@13.2.0/+esm' in sidebar_motion and 'prefers-reduced-motion:reduce' in sidebar_motion
assert 'stagger' in sidebar_motion and 'resetLegacyEffects' in sidebar_motion and "style.clipPath='none'" in sidebar_motion
assert 'sidebar.classList.add(\'open\')' in sidebar_motion and 'sidebar.classList.remove(\'open\')' in sidebar_motion
assert 'setupMobileSidebarMotion' in app and 'setMobileSidebarOpen' in app and 'menu-line-top' in idx and 'aria-expanded="false"' in idx
assert 'tv_sales_page_month' in app and 'salesMonthFilter' in app and 'salesMonthOptionsV54' in app and 'p_month_start' in app and 'p_month_end' in app
assert 'tv_sales_team_options_month' in app and 'salesTeamFilter' in app and 'tv_sales_pending_value_month' in app and 'Valor em valida\\u00e7\\u00e3o' in app
assert 'const date=formatDateOnly; const technicalDate=formatDateTime;' in app and '${technicalDate(v.last_seen)}' in app and '${technicalDate(e.created_at)}' in app
assert 'tv_supervisor_kpi_month' in app and 'supervisorKpiPanel' in app and 'Acompanhamento de meta' in app and 'Produ\\u00e7\\u00e3o por venda' in app
assert "mobile-sidebar-motion.js?v=2" in app and "sidebar-open" in app
assert '.app>.sidebar' not in (r/'claro-bubbles-background.css').read_text(encoding='utf-8-sig')
android=(r/'android-fix-v43.css').read_text(encoding='utf-8-sig')
assert 'body.sidebar-open' in android and 'body.sidebar-open .mobile-bottom-nav' in android and 'height:100dvh!important' in android and '.sidebar-backdrop.open' in android
assert 'position:absolute!important' in teamfix and 'position:static!important' not in teamfix and 'z-index:9999!important' in teamfix and 'min-height:44px!important' in teamfix and '.adm-team-menu.hidden{display:none!important}' in teamfix and teamfix.count('{')==teamfix.count('}')
assert all(x in teamfix for x in ['.adm-team-checkbox','.adm-team-menu-actions','grid-template-columns:20px minmax(0,1fr)'])
assert all(x in teamfix for x in ['Team picker trigger polish v95','.adm-team-picker-chevron','grid-template-columns:auto minmax(0,1fr) 30px'])
assert all(x in teamfix for x in ['Region/city selector v99','.adm-city-scope','.adm-cities','.adm-city.active'])
assert all(x in teamfix for x in ['Region/city selector v103','grid-template-columns:repeat(3,minmax(0,1fr))','.adm-bases .adm-tab'])
assert all(x in status_products for x in ['.adm-product-status-suite','.adm-product-status-grid','grid-template-columns:repeat(4,minmax(0,1fr))','.product-revenue']) and status_products.count('{')==status_products.count('}')
assert all(x in ui_icons for x in ["broadband:","mobile:","tv:","revenue:","clock:","cancel:","warning:"])
assert all(x in premium_ui for x in ['UI polish + dark-mode normalization v94','--tn-surface-elevated:#253142','.ui-icon,.sale-action-icon','overflow-wrap:anywhere','.adm-insight-card.highlight','Dashboard admin motion pulse v95','Dashboard admin hover motion v96','tn-admin-reveal','tn-admin-progress','translateY(-5px) scale(1.008)','adm-team-picker-btn','prefers-reduced-motion:reduce']) and premium_ui.count('{')==premium_ui.count('}')
assert 'setupAdminMotion' in adm and 'adm-motion-item' in adm and 'data-count' in adm
assert css.count('{')==css.count('}')
obs=(r/'observability-v46.js').read_text(encoding='utf-8');assert "const VERSION='46';" in obs and 'cleanContext' in obs and 'context?.page' in obs
team_goals=(r/'team-goals-v77.js').read_text(encoding='utf-8');team_goals_css=(r/'team-goals-v77.css').read_text(encoding='utf-8-sig');assert 'tv_team_goal_dashboard' in team_goals and 'tv_admin_save_team_goal' in team_goals and 'Meta da equipe' in team_goals and 'tg77-disclosure' in team_goals and 'tvTeamGoalOpenTeam' in team_goals and 'tg77-accordion' in team_goals and 'tg77TeamSelect' not in team_goals and 'tg77-disclosure-chevron' in team_goals and "icon('chevronDown')" in team_goals and '>⌄</i>' not in team_goals
assert all(x in team_goals_css for x in ['.tg77-accordion','.tg77-disclosure','.tg77-disclosure-body','Team goals accordion v93','Goals chevron alignment v96','.tg77-disclosure-chevron','grid-template-columns:auto 30px']) and '.tg77-selector' not in team_goals_css and team_goals_css.count('{')==team_goals_css.count('}')
rest_auth=(r/'supabase/functions/tv-imperium-rest-auth/index.ts').read_text(encoding='utf-8-sig')
identity_sql=(r/'supabase/migrations/20260917210000_imperium_rest_identity.sql').read_text(encoding='utf-8-sig')
functions_config=(r/'supabase/config.toml').read_text(encoding='utf-8-sig')
assert '[functions.tv-imperium-rest-auth]' in functions_config and 'verify_jwt = false' in functions_config
assert 'tv-imperium-rest-auth' in app and 'REST_AUTH_URL' in app and "mode:'rest'" in app
assert "['invalid_credentials','invalid_request'].includes(restError.code)" in app and 'API oficial indisponível. Ativando conexão direta segura...' in app
assert all(x in rest_auth for x in ['/login?rememberme=true','/usuario-logado','invalid_credentials','upstream_unavailable','tv_imperium_rest_identities','generateLink'])
assert 'jwtpassword' in rest_auth and "localStorage" not in rest_auth and 'bearer_token' not in identity_sql.lower() and 'password' not in identity_sql.lower()
assert 'imperium_group' in identity_sql and 'revoke all' in identity_sql
assert 'team-goals-v77.css?v=96' in idx and '/team-goals-v77.js?v=96' in sw and '/team-goals-v77.css?v=96' in sw
assert all(x in field for x in ["const {sb,session,profile,toast,navigate}=ctx","tv_bo_sale_focus","role==='consultant'?'my-sales':'team'"])
assert all(x in app for x in ["type==='sale'","sales-focus-target","data-sale-id","renderTeamGoalPanel"])
conflict_start='<'*7
conflict_end='>'*7
for text in [idx,app,field,sw,(r/'sales-ui-v48.css').read_text(encoding='utf-8-sig')]: assert conflict_start not in text and conflict_end not in text
print('STATIC_V48_OK')
apple_nav_css=(r/'apple-navbar-v82.css').read_text(encoding='utf-8-sig')
assert all(x in apple_nav_css for x in ['v100: align secondary header with dashboard content','grid-template-columns:minmax(0,1fr) auto!important','.main>.topbar .top-actions','width:min(1540px,calc(100vw - 40px))!important']) and apple_nav_css.count('{')==apple_nav_css.count('}')

admin_users=(r/'admin-users.js').read_text(encoding='utf-8-sig')
assert all(x in admin_users for x in ['tv_admin_list_users_v4','tv_admin_save_access_v4','admin-supervisor-scope','Mesmo dashboard do administrador, somente com os próprios dados','Filtro no servidor'])
assert all(x not in admin_users for x in ['dashboard_full','sales_all','map_all','u-permission'])
assert "if(['admin','supervisor'].includes(profile.role))return renderAdminDashboard" in app
assert "['admin','supervisor'].includes(profile?.role)" in app
assert "hasPermission('dashboard_full')" not in app and "hasPermission('sales_all')" not in app
assert 'adm-team-scope-locked' in adm and "team:isSupervisor?'':teamFilterValue(savedTeams)" in adm and 'rawSaved.owner===profile.user_id' in adm
assert 'profile.role===\'admin\'?\'<button id="admGoal"' in adm and "querySelector('#admGoal')?.addEventListener" in adm
assert all(x in adm for x in ['tv_dashboard_request_imperium_refresh','Sincronizando…','Sincronizando dados atuais do Imperium','setTimeout(r,10000)'])
supervisor_scope_sql=(r/'supabase/migrations/20260923233249_fix_supervisor_dashboard_aux_scope.sql').read_text(encoding='utf-8-sig')
assert all(x in supervisor_scope_sql for x in ["v_team_filter := nullif(btrim(p_team_name)","v_team_filters is null or public.tv_canonical_commercial_team","team cards supervisor scope anchor not found"])
supervisor_team_link_sql=(r/'supabase/migrations/20260923233532_repair_supervisor_team_links.sql').read_text(encoding='utf-8-sig')
assert all(x in supervisor_team_link_sql for x in ["p.role='supervisor'","p.team_id is null","tv_canonical_commercial_team(t.name)","unique_matches"])
supervisor_scope_hardening_sql=(r/'supabase/migrations/20260923233824_harden_supervisor_commercial_scope.sql').read_text(encoding='utf-8-sig')
assert all(x in supervisor_scope_hardening_sql for x in ['tv_supervisor_sale_in_scope','drop policy if exists sales_read','drop policy if exists sales_update','tv_sales_page_month','tv_customer_search'])
imperium_team_priority_sql=(r/'supabase/migrations/20260923234132_prefer_imperium_commercial_team.sql').read_text(encoding='utf-8-sig')
assert all(x in imperium_team_priority_sql for x in ["coalesce(nullif(btrim(p_imperium_team_name),''),nullif(btrim(t.name),''))","coalesce(t.name,s.imperium_team_name","tv_admin_dashboard_scope","tv_sales_page_month"])

assert all(x in app for x in ["renderCommercialLocation","destroyCommercialLocation","page:'location'","if(page==='location')"])
assert all(x in location_ui for x in ['tv_consultivo_latest_visible_positions','tv_consultivo_positions','tv_consultivo_pauses','tv_consultivo_devices','REFRESH_MS=20000','Ver rota de hoje','Todos os supervisores'])
assert 'navigator.geolocation' not in location_ui and 'getCurrentPosition' not in location_ui
assert all(x in location_css for x in ['.commercial-location','.loc-map','.loc-person-card','.loc-map-marker','prefers-reduced-motion:reduce']) and location_css.count('{')==location_css.count('}')
assert 'commercial-location-v1.css?v=2' in idx and '/commercial-location-v1.css?v=2' in sw and '/commercial-location-v1.js?v=2' in sw

assert all(x in location_ui for x in ['tv_commercial_hierarchy','hierarchy_only','Sem app vinculado','personKey'])
