from pathlib import Path
import base64
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


html = read("consultivo.html")
js = read("consultivo-app.js")
css = read("consultivo-app.css")
activity = read(
    "consultivo-android/app/src/main/java/br/com/technet/consultivo/MainActivity.kt"
)
manifest = read("consultivo-android/app/src/main/AndroidManifest.xml")
layout = read("consultivo-android/app/src/main/res/layout/activity_main.xml")
updater = read(
    "consultivo-android/app/src/main/java/br/com/technet/consultivo/update/AppUpdateManager.kt"
)
gradle = read("consultivo-android/app/build.gradle.kts")
# Na copia publica nao se executam workflows de deploy ou assinatura de producao.
assert not (ROOT / ".github/workflows/consultivo-apk.yml").exists()
assert not (ROOT / ".github/workflows/firebase-deploy.yml").exists()

for screen in ("home", "tracking", "sales", "team"):
    assert f'data-screen="{screen}"' in html, f"missing Consultivo tab: {screen}"

assert "renderNewSaleAdvanced" in js, "sales must reuse the real TechNET sales flow"
assert "tv_consultivo_positions" in js, "team screen must use real tracking positions"
assert "tv_consultivo_daily_summaries" in js, "journey must use real daily summaries"
assert "getFullYear()" in js and "getMonth()+1" in js, "day keys must be local-time based"
assert "mobileMapOptions" in js, "mobile map options are missing"
assert "dragging:true" in js and "touchZoom:true" in js and "doubleClickZoom:true" in js, "Consultivo maps must support pan and pinch gestures on mobile"
assert "setupFormScrollAssist" in js, "sale form fields must remain reachable above the keyboard"
assert "setupResponsiveViewport" in js, "visual viewport responsiveness is missing"
assert "setupShellFreshness" in js, "Consultivo shell freshness checker is missing"
assert "cv_pending_shell_reload" in js, "shell refresh must defer while a sale is open"
assert "cv_last_screen" in js, "shell refresh must preserve the current non-sale screen"
assert "consultivo-app\\.js\\?v=(\\d+)" in js, "shell version comparison is missing"
assert "visualViewport" in js, "keyboard/orientation viewport adaptation is missing"
assert "cv-keyboard-open" in js, "keyboard state class is missing"
assert "function uiIcon(name)" in js, "MagicPath icon system is missing"
assert "loadingMarkup" in js, "screen loading skeleton is missing"
assert "content.dataset.screen=screen" in js, "screen transition state is missing"
assert "cv-tracking-journey" in js, "tracking summary card must match approved mockup structure"
assert "cv-tracking-map-controls" in js, "tracking floating map controls are missing"
assert "cvRouteComplete" in js and "fitTrackingRoute" in js, "complete route action is missing"
assert "cv-route-number" in js, "tracking route milestone markers are missing"
assert "Supervisor:" in js, "tracking team supervisor context is missing"
assert "cv-team-filters" in js, "team filters must match approved mockup structure"
assert "cv-team-map-count" in js and "cv-team-map-controls" in js, "team map overlays are missing"
assert "cv-team-ranking" in js, "team ranking list is missing"
assert "tv_consultivo_pauses" in js, "team paused state must use real pause data"
assert "teamActivityPercent" in js, "team activity indicator must use real daily summary data"
assert "distance_meters" in js, "team distance must come from real daily summaries"
assert "REST_AUTH_URL" in js and "tv-imperium-rest-auth" in js, "Consultivo login must reuse Imperium REST auth"
assert "DIRECT_AUTH_URL" in js and "AUTH_URL" in js, "Consultivo login fallbacks must match the site auth flow"
assert "sb.auth.verifyOtp" in js, "Imperium identity must become the shared Supabase session"
assert "imperium_public_key.json" in js and "RSA-OAEP" in js, "secure contingency password encryption is missing"
assert "cvImpPassword" in js and "localStorage.setItem('tv_imp_base'" in js, "native login fields are missing"
assert "localStorage.setItem('tv_imp_user'" in js, "remembered username integration is missing"
assert "localStorage.setItem('cv_remember_access'" in js, "remember access preference is missing"
assert "sessionStorage.setItem('cv_ephemeral_active'" in js, "non-persistent login mode is missing"
assert "sb.auth.signOut({scope:'local'})" in js, "logout must invalidate the local Supabase session"
assert "renderAccount" in js and "cv-account-profile" in js, "account/settings screen is missing"
assert "profile?.full_name" in js and "session?.user?.app_metadata?.imperium_base" in js, "account screen must use real profile/base data"
assert "supervisorName()" in js and "teamName()" in js, "account screen must use real team/supervisor data"
assert "cvLogout" in js and "Sair da conta" in js, "visible logout action is missing"
assert "resetAuthViewport" in js, "login must reset stale horizontal WebView scroll"
assert "document.documentElement.scrollLeft=0" in js and "document.body.scrollLeft=0" in js, "login horizontal scroll reset is incomplete"
assert "cvAccountButton" in html, "account screen must be reachable from the header wordmark"
assert "consultantGreetingName" in js, "hero must greet the authenticated consultant by account name"
assert "/consultivo-cover-team.webp?v=1" in html, "official back-to-back cover must be used in web branding"
hero_markup = html.split('<header id="cvHero"', 1)[1].split('</header>', 1)[0]
assert 'id="cvHeroMascot" class="cv-hero-mascot" src="/consultivo-mascot-female.webp?v=1"' in hero_markup
assert "cv-brand-mascot" not in hero_markup, "hero must use a text-only TechNET wordmark"
assert "CV-BRAND-MASCOT-V1" in css, "official mascot responsive styling is missing"
assert "CV-HERO-MOCKUP-V2" in css, "approved hero composition regression guard is missing"
assert "CV-TRACKING-MOCKUP-V3" in css, "approved tracking mockup layer is missing"
assert "CV-TEAM-MOCKUP-V4" in css, "approved team mockup layer is missing"
assert "CV-AUTH-ACCOUNT-MOCKUP-V5" in css, "approved login/account mockup layer is missing"
assert "CV-AUTH-VIEWPORT-FIX-V6" in css, "login viewport overflow fix is missing"
assert "CV-AUTH-CONTROL-FLOW-V7" in css, "Android-safe normal-flow login controls are missing"
assert "CV-ICON-SYSTEM-V8" in css, "unified Consultivo SVG icon system is missing"
assert 'class="cv-ui-icon"' in js, "generated UI icons must share the common SVG class"
assert "uiIcon('gps')" in js and "uiIcon('battery')" in js and "uiIcon('salesTrend')" in js, "home metrics must use SVG icons"
assert "metric('âŒ'" not in js and "metric('â—·'" not in js and "metric('â—‰'" not in js, "legacy glyph metric icons must not return"
assert "position:static!important" in css, "auth inputs must not use absolute positioning"
assert "grid-template-columns:46px minmax(0,1fr) auto!important" in css, "auth field grid structure is missing"
assert "width:auto!important" in css, "auth controls must not combine left offset with width:100%"
assert "overflow-x:clip!important" in css, "auth page must block horizontal overflow"
assert "CV-HERO-MASCOT-SEAM-FIX-V1" in css, "transparent hero mascot seam fix is missing"
assert "CV-HERO-MASCOT-IMG-V2" in css, "hero mascot image rendering fix is missing"
assert '/consultivo-mascot-female.webp?v=1' in html, "hero must start with an official transparent mascot asset"
assert '/consultivo-app.js?v=24' in html, "Consultivo shell version must be bumped for self-refresh"
assert '/consultivo-app.css?v=23' in html, "Consultivo stylesheet version must be bumped for Imperium sales UI"
assert "consultivoSalesPageMonth" in js and "tv_sales_page_month" in js, "Consultivo must reuse the commercial sales RPC"
assert "cvSalesMonth" in js and "cvNewSale" in js and "TECHNET + IMPERIUM" in js, "Consultivo sales overview is missing"
assert "imperium_proposal" in js and "imperium_contract" in js and "real_product_summary" in js, "Imperium sale metadata must be visible in the app"
assert ".cv-commercial-sale" in css and ".cv-commercial-kpis" in css, "Consultivo commercial sales styles are missing"
assert "trackingFilterState" in js and "cvTrackingPeriod" in js and "trackingPeriodRange" in js, "tracking period filter must be functional"
assert "loadTrackingPeriodView" in js and "trackingDisplayedRoute" in js, "tracking filter must drive real route data"
assert "consultivo tracking filter" in js, "tracking filter errors must be handled"
assert ".cv-tracking-period-select" in css, "tracking period control must remain tappable in Android WebView"
assert "teamFilterState" in js and "cvTeamStatus" in js and "cvTeamPeriod" in js and "cvTeamSort" in js, "team filter controls must be functional"
assert "teamPeriodRange" in js and "aggregateTeamSummaries" in js, "team period filter must aggregate real period data"
assert "consultivo team filter" in js, "team filter errors must be handled"
assert ".cv-team-filter-select" in css and ".cv-team-sort" in css, "team filter mobile controls are missing"
assert (ROOT / "consultivo-mascot-female.webp").exists(), "official female mascot asset is missing"
assert (ROOT / "consultivo-cover-team.webp").exists(), "official back-to-back cover asset is missing"
assert (ROOT / "consultivo-mascot-male.webp").exists(), "official male mascot asset is missing"
assert (ROOT / "consultivo-mascot-duo.webp").exists(), "official duo mascot asset is missing"
assert "HERO_MASCOTS" in js and "HOME_MASCOTS" in js, "variable official mascot rotation is missing"
assert "/consultivo-mascot-male.webp?v=1" in js and "/consultivo-mascot-female.webp?v=1" in js
assert "/consultivo-mascot-duo.webp?v=1" in js and "/consultivo-cover-team.webp?v=1" in js

for mock_value in ("Equipe Alfa", "Carlos Silva", "12,4 km", "3h 26min"):
    assert mock_value not in js, f"mock data leaked into runtime: {mock_value}"

assert "localStorage.setItem('tv_imp_password'" not in js, "password must never be persisted"
assert "localStorage.setItem('cv_imp_password'" not in js, "password must never be persisted"

assert "CV-MASCOT-CLEAN-V2" in css, "clean approved mascot must remain wired"
assert "CV-SCROLL-FIX-V2" in css, "WebView root scrolling regression guard is missing"
assert "CV-THEMELY-RESPONSIVE-V1" in css, "Themely responsive layer is missing"
assert "CV-MAGICPATH-UX-V1" in css, "MagicPath UX layer is missing"
assert "cv-loading-grid" in css and "cv-skeleton" in css, "loading skeleton polish is missing"
assert "clamp(" in css, "responsive typography/spacing must use fluid clamp values"
assert "@media(max-width:350px)" in css, "compact phone breakpoint is missing"
assert "@media(min-width:761px)" in css, "tablet breakpoint is missing"
assert "@media(max-height:560px) and (orientation:landscape)" in css, "landscape breakpoint is missing"
assert "overflow-y:auto!important" in css
assert "touch-action:pan-y" in css
assert ".cv-sale-shell .sale-step-nav" in css and "position:static!important" in css

match = re.search(r"data:image/webp;base64,([A-Za-z0-9+/=]+)", css)
assert match, "mascot WebP data URI is missing"
mascot = base64.b64decode(match.group(1), validate=True)
assert mascot[:4] == b"RIFF" and mascot[8:12] == b"WEBP", "mascot asset is not a valid WebP"
assert 5_000 < len(mascot) < 60_000, "mascot asset size is outside the expected optimized range"

assert 'HOME_URL = "https://technet-vendas-2026.web.app/consultivo.html"' in activity
assert "isVerticalScrollBarEnabled = true" in activity
assert "WebSettings.LOAD_NO_CACHE" in activity, "Android WebView must bypass stale HTTP cache"
assert "freshUrl" in activity and '"Cache-Control" to "no-cache, no-store, must-revalidate"' in activity, "fresh shell request is missing"
assert "refreshShellAfterResumeIfSafe" in activity, "Android must refresh the shell after returning to the app"
assert 'screen == "sales"' in activity, "Android shell refresh must not interrupt an in-progress sale"
assert "SHELL_REFRESH_BACKGROUND_MS" in activity, "resume refresh threshold is missing"
assert "isNestedScrollingEnabled = true" in activity
assert "View.OVER_SCROLL_IF_CONTENT_SCROLLS" in activity
assert "WindowInsetsCompat.Type.systemBars()" in activity, "Android system-bar insets must protect bottom navigation"
assert "setPadding(0, 0, 0, systemBars.bottom)" in activity, "bottom system inset must keep app buttons tappable"
assert "gpsCard.onclick=()=>navigate('tracking')" in js, "GPS card must be tappable"
assert "ensureNativeTrackingRunning();geoStatus='requesting'" in js, "GPS center action must restart native tracking when needed"
assert "if(currentScreen!=='home')return" in js and "if(currentScreen!=='tracking')return" in js and "if(currentScreen!=='account')return" in js, "async screen rendering must not overwrite a newer navigation"
assert 'android:windowSoftInputMode="adjustResize"' in manifest
assert 'android:icon="@drawable/consultivo_cover_team"' in manifest
assert 'android:roundIcon="@drawable/consultivo_cover_team"' in manifest
assert 'android:nestedScrollingEnabled="true"' in layout
assert 'android:scrollbars="vertical"' in layout
assert "@drawable/consultivo_cover_team" in layout, "official back-to-back cover must be used in Android splash"
assert (
    ROOT / "consultivo-android/app/src/main/res/drawable/consultivo_cover_team.webp"
).exists(), "official back-to-back Android cover asset is missing"

assert "REQUEST_INSTALL_PACKAGES" in manifest
assert "FileProvider" in manifest and "@xml/file_paths" in manifest
assert "APP_UPDATE_MANIFEST_URL" in gradle
assert "AppUpdatePolicy.isNewer" in updater
assert "downloadAndInstall" in updater
assert "canRequestPackageInstalls" in updater

print("CONSULTIVO_UI_STATIC_OK")

assert "tv_commercial_hierarchy" in js and "hierarchy_only" in js and "Aguardando acesso ao app" in js

assert "ensureNativeTrackingRunning" in js and "consultivo native keepalive" in js

assert "commercial_seller_name" in js and "imperium_consultant_name" in js and "consultivo team sales" in js
assert "select('consultant_name,created_at')" not in js
