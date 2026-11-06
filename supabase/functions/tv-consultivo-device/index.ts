import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { executeDeviceAction, type DeviceStore } from "./service.ts";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-technet-device-token",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function bearer(req: Request) {
  const raw = req.headers.get("authorization") || "";
  return /^bearer\s+/i.test(raw) ? raw.replace(/^bearer\s+/i, "").trim() : "";
}

function createStore(sb: any): DeviceStore {
  return {
    async getProfile(userId) {
      const { data, error } = await sb.from("tv_profiles")
        .select("user_id,role,team_id,supervisor_id,active")
        .eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async findBinding(userId, installId) {
      const { data, error } = await sb.from("tv_consultivo_devices")
        .select("*").eq("user_id", userId).eq("install_id", installId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async findActiveBinding(userId) {
      const { data, error } = await sb.from("tv_consultivo_devices")
        .select("*")
        .eq("user_id", userId)
        .eq("active", true)
        .is("revoked_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async insertBinding(input) {
      const { data, error } = await sb.from("tv_consultivo_devices")
        .insert(input).select("*").single();
      if (error) throw error;
      return data;
    },
    async findByTokenHash(userId, tokenHash) {
      const { data, error } = await sb.from("tv_consultivo_devices")
        .select("*").eq("user_id", userId).eq("token_hash", tokenHash).maybeSingle();
      if (error) throw error;
      return data;
    },
    async heartbeat(deviceId, patch) {
      const { data, error } = await sb.from("tv_consultivo_devices")
        .update(patch).eq("id", deviceId).select("*").single();
      if (error) throw error;
      return data;
    },
    async renew(deviceId, tokenHash, lastSeenAt) {
      const { data, error } = await sb.from("tv_consultivo_devices")
        .update({ token_hash: tokenHash, last_seen_at: lastSeenAt })
        .eq("id", deviceId).select("*").single();
      if (error) throw error;
      return data;
    },
    async findById(deviceId) {
      const { data, error } = await sb.from("tv_consultivo_devices")
        .select("*").eq("id", deviceId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async revoke(deviceId, revokedAt) {
      const { data, error } = await sb.from("tv_consultivo_devices")
        .update({ active: false, revoked_at: revokedAt })
        .eq("id", deviceId).select("*").single();
      if (error) throw error;
      return data;
    },
  };
}

export async function handleConsultivoDevice(req: Request) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, code: "method_not_allowed" });

  const jwt = bearer(req);
  if (!jwt) return json(401, { ok: false, code: "missing_authorization" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { ok: false, code: "server_not_configured" });

  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const userResult = await sb.auth.getUser(jwt);
  const userId = userResult.data?.user?.id;
  if (userResult.error || !userId) return json(401, { ok: false, code: "invalid_session" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: "invalid_json" });
  }

  const action = String(body.action || "") as "bind" | "renew" | "heartbeat" | "status" | "revoke";
  if (!["bind", "renew", "heartbeat", "status", "revoke"].includes(action)) {
    return json(400, { ok: false, code: "invalid_action" });
  }

  try {
    const result = await executeDeviceAction(createStore(sb), {
      action,
      userId,
      body,
      deviceToken: req.headers.get("x-technet-device-token") || undefined,
    });
    return json(result.status, result.body);
  } catch (error) {
    console.error("tv_consultivo_device", error instanceof Error ? error.message : "request_failed");
    return json(500, { ok: false, code: "request_failed" });
  }
}

if (import.meta.main) Deno.serve(handleConsultivoDevice);
