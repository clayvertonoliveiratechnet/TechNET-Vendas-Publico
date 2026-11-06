from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

manifest = (ROOT / "consultivo-android/app/src/main/AndroidManifest.xml").read_text(encoding="utf-8")
activity = (ROOT / "consultivo-android/app/src/main/java/br/com/technet/consultivo/MainActivity.kt").read_text(encoding="utf-8")
gradle = (ROOT / "consultivo-android/app/build.gradle.kts").read_text(encoding="utf-8")
tracking_service = (ROOT / "consultivo-android/app/src/main/java/br/com/technet/consultivo/tracking/TrackingService.kt").read_text(encoding="utf-8")
tracking_api = (ROOT / "consultivo-android/app/src/main/java/br/com/technet/consultivo/tracking/TrackingApi.kt").read_text(encoding="utf-8")
tracking_store = (ROOT / "consultivo-android/app/src/main/java/br/com/technet/consultivo/tracking/TrackingStore.kt").read_text(encoding="utf-8")
map_js = (ROOT / "field-workflow-v48.js").read_text(encoding="utf-8")
consultivo_js = (ROOT / "consultivo-app.js").read_text(encoding="utf-8")
location_edge = (ROOT / "supabase/functions/tv-consultivo-location/index.ts").read_text(encoding="utf-8")
location_service = (ROOT / "supabase/functions/tv-consultivo-location/service.ts").read_text(encoding="utf-8")
device_edge = (ROOT / "supabase/functions/tv-consultivo-device/index.ts").read_text(encoding="utf-8")
migration = (ROOT / "supabase/migrations/20260930223000_consultivo_native_tracking.sql").read_text(encoding="utf-8")
config = (ROOT / "supabase/config.toml").read_text(encoding="utf-8")

required = {
    "manifest background location": "android.permission.ACCESS_BACKGROUND_LOCATION" in manifest,
    "manifest foreground location": "android.permission.FOREGROUND_SERVICE_LOCATION" in manifest,
    "manifest boot tracking": ".tracking.TrackingService" in manifest and ".tracking.BootReceiver" in manifest,
    "play services location": "play-services-location:21.3.0" in gradle,
    "native fused provider": "FusedLocationProviderClient" in tracking_service and "Priority.PRIORITY_HIGH_ACCURACY" in tracking_service,
    "native watchdog": "75_000L" in tracking_service and "recoverCurrentLocation" in tracking_service,
    "native offline queue": "queuePosition" in tracking_api and "flushQueuedPositions" in tracking_api and "queue.length() - 1000" in tracking_store,
    "native device token header": 'setRequestProperty("x-technet-device-token"' in tracking_api,
    "native batch upload": '.put("action", "batch")' in tracking_api,
    "native bridge": 'addJavascriptInterface(NativeTrackingBridge(), "TechNETNativeTracking")' in activity,
    "native permission status": 'put("location_permission", hasLocationPermission())' in activity,
    "background permission setup": "ACTION_APPLICATION_DETAILS_SETTINGS" in activity and "ACCESS_BACKGROUND_LOCATION" in activity,
    "approximate location support": "GRANULARITY_PERMISSION_LEVEL" in tracking_service,
    "browser geolocation disabled": "setGeolocationEnabled(false)" in activity and "onGeolocationPermissionsShowPrompt" not in activity,
    "site does not collect gps": "navigator.geolocation" not in consultivo_js,
    "site native configure": "TechNETNativeTracking.configure" in consultivo_js and "nativeTrackingSnapshot" in consultivo_js,
    "site team reads positions": "tv_consultivo_positions" in consultivo_js and "setupTeamMap" in consultivo_js,
    "map locate control": 'id="mapLocate"' in map_js,
    "app user agent gate": "TechNET-Consultivo" in map_js,
    "device binding": "ensureTrackingDevice" in consultivo_js and "DEVICE_URL" in consultivo_js,
    "location edge custom device auth": "hashDeviceToken" in location_edge and '.eq("token_hash", tokenHash)' in location_edge,
    "location edge batch": '["position", "batch", "pause", "resume", "heartbeat"]' in location_edge and 'action === "batch"' in location_edge,
    "location edge inserts positions": 'from("tv_consultivo_positions").insert' in location_edge,
    "location edge native metadata": '"android-native"' in location_edge and '"webview-geolocation"' not in location_edge,
    "location edge updates summaries": 'from("tv_consultivo_daily_summaries")' in location_edge,
    "location edge pause support": 'action === "pause"' in location_edge and 'action === "resume"' in location_edge,
    "location helper gps jump guard": "dt * 60" in location_service,
    "device edge token renewal": '"renew"' in device_edge,
    "device edge jwt config": "[functions.tv-consultivo-device]" in config and "verify_jwt = true" in config,
    "location custom auth config": "[functions.tv-consultivo-location]" in config and "verify_jwt = false" in config,
    "network type migration": "add column if not exists last_network_type text" in migration,
}

missing = [name for name, ok in required.items() if not ok]
if missing:
    raise SystemExit("CONSULTIVO_MAP_LOCATION_STATIC_FAIL: " + ", ".join(missing))

print("CONSULTIVO_MAP_LOCATION_STATIC_OK")
