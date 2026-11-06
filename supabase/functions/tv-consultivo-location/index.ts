import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { hashDeviceToken, requireProfile } from "../_shared/consultivo-auth.ts";
import { gpsQuality, localDay, parsePosition, positionDelta, type PositionInput } from "./service.ts";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-technet-device-token",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

async function activeDevice(sb: any, token: string) {
  if (!token) throw new Error("missing_device_token");
  const tokenHash = await hashDeviceToken(token);
  const { data, error } = await sb.from("tv_consultivo_devices")
    .select("id,user_id,active,revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.active || data.revoked_at) throw new Error("invalid_device");
  return data;
}

async function updateSummary(sb: any, profile: any, input: PositionInput) {
  const day = localDay(input.recordedAt);
  const { data: previous } = await sb.from("tv_consultivo_positions")
    .select("recorded_at,latitude,longitude")
    .eq("user_id", profile.user_id)
    .lt("recorded_at", input.recordedAt)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const delta = positionDelta(previous || null, input);
  const { data: existing } = await sb.from("tv_consultivo_daily_summaries")
    .select("*").eq("day", day).eq("user_id", profile.user_id).maybeSingle();
  const next = {
    day,
    user_id: profile.user_id,
    team_id: profile.team_id,
    distance_meters: Number(existing?.distance_meters || 0) + delta.distance,
    movement_seconds: Number(existing?.movement_seconds || 0) + delta.movementSeconds,
    stopped_seconds: Number(existing?.stopped_seconds || 0) + delta.stoppedSeconds,
    first_position_at: existing?.first_position_at || input.recordedAt,
    last_position_at: input.recordedAt,
    position_count: Number(existing?.position_count || 0) + 1,
    gps_quality: gpsQuality(input.accuracy),
    computed_at: new Date().toISOString(),
  };
  const { error } = await sb.from("tv_consultivo_daily_summaries")
    .upsert(next, { onConflict: "day,user_id" });
  if (error) throw error;
}

async function persistPosition(
  sb: any,
  profile: any,
  device: any,
  input: PositionInput,
) {
  const { error } = await sb.from("tv_consultivo_positions").insert({
    source_id: input.sourceId,
    user_id: device.user_id,
    team_id: profile.team_id,
    device_id: device.id,
    recorded_at: input.recordedAt,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy,
    speed: input.speed,
    heading: input.heading,
    battery_level: input.battery,
    activity_type: input.activityType,
    metadata: { source: "android-native", shell: "consultivo" },
  });
  if (error?.code === "23505") return false;
  if (error) throw error;
  await updateSummary(sb, profile, input);
  return true;
}

export async function handleConsultivoLocation(req: Request) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, code: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { ok: false, code: "server_not_configured" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: "invalid_json" });
  }
  const action = String(body.action || "");
  if (!["position", "batch", "pause", "resume", "heartbeat"].includes(action)) {
    return json(400, { ok: false, code: "invalid_action" });
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const device = await activeDevice(sb, req.headers.get("x-technet-device-token") || "");
    const profile = await requireProfile(sb, device.user_id);

    if (action === "position") {
      const input = parsePosition(body);
      const inserted = await persistPosition(sb, profile, device, input);
      await sb.from("tv_consultivo_devices").update({
        last_seen_at: new Date().toISOString(),
        last_battery: input.battery,
      }).eq("id", device.id);
      return json(200, {
        ok: true,
        duplicate: !inserted,
        recorded_at: input.recordedAt,
      });
    }

    if (action === "batch") {
      const positions = Array.isArray(body.positions) ? body.positions : [];
      if (!positions.length || positions.length > 150) {
        return json(400, { ok: false, code: "invalid_batch" });
      }
      const parsed = positions
        .map((position) => parsePosition(position as Record<string, unknown>))
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
      let inserted = 0;
      for (const input of parsed) {
        if (await persistPosition(sb, profile, device, input)) inserted += 1;
      }
      const latest = parsed.at(-1)!;
      await sb.from("tv_consultivo_devices").update({
        last_seen_at: new Date().toISOString(),
        last_battery: latest.battery,
      }).eq("id", device.id);
      return json(200, {
        ok: true,
        received: parsed.length,
        inserted,
        duplicates: parsed.length - inserted,
      });
    }

    if (action === "pause") {
      const { data: open } = await sb.from("tv_consultivo_pauses")
        .select("id").eq("user_id", device.user_id).is("ended_at", null).maybeSingle();
      if (!open) {
        const { error } = await sb.from("tv_consultivo_pauses").insert({
          user_id: device.user_id,
          team_id: profile.team_id,
          device_id: device.id,
          reason: String(body.reason || "manual").slice(0, 80),
        });
        if (error) throw error;
      }
      return json(200, { ok: true, paused: true });
    }

    if (action === "resume") {
      const { data: open } = await sb.from("tv_consultivo_pauses")
        .select("id").eq("user_id", device.user_id).is("ended_at", null).maybeSingle();
      if (open?.id) {
        const { error } = await sb.from("tv_consultivo_pauses")
          .update({ ended_at: new Date().toISOString() }).eq("id", open.id);
        if (error) throw error;
      }
      return json(200, { ok: true, paused: false });
    }

    const battery = Number(body.battery);
    const patch: Record<string, unknown> = {
      last_seen_at: new Date().toISOString(),
      last_battery: Number.isFinite(battery) && battery >= 0 && battery <= 100 ? battery : null,
      last_network_type: String(body.network_type || "").slice(0, 40) || null,
    };
    const appVersion = String(body.app_version || "").trim().slice(0, 40);
    if (appVersion) patch.app_version = appVersion;
    const { error } = await sb.from("tv_consultivo_devices")
      .update(patch).eq("id", device.id);
    if (error) throw error;
    return json(200, { ok: true, device_id: device.id });
  } catch (error) {
    const code = error instanceof Error ? error.message : "request_failed";
    const status =
      ["invalid_device", "missing_device_token"].includes(code) ? 401 :
      code === "inactive_profile" ? 403 :
      code.startsWith("invalid_") || ["future_position", "stale_position"].includes(code) ? 400 :
      500;
    console.error("tv_consultivo_location", code);
    return json(status, { ok: false, code });
  }
}

if (import.meta.main) Deno.serve(handleConsultivoLocation);
