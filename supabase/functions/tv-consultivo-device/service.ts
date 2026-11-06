import { hashDeviceToken, type ConsultivoProfile } from "../_shared/consultivo-auth.ts";

export type DeviceRecord = {
  id: string;
  user_id: string;
  install_id: string;
  token_hash: string;
  active: boolean;
  revoked_at: string | null;
  device_name: string | null;
  platform: string;
  app_version: string | null;
  last_seen_at: string | null;
  last_battery: number | null;
  last_network_type: string | null;
};

export type DeviceStore = {
  getProfile(userId: string): Promise<ConsultivoProfile | null>;
  findBinding(userId: string, installId: string): Promise<DeviceRecord | null>;
  findActiveBinding(userId: string): Promise<DeviceRecord | null>;
  insertBinding(input: Record<string, unknown>): Promise<DeviceRecord>;
  findByTokenHash(userId: string, tokenHash: string): Promise<DeviceRecord | null>;
  heartbeat(deviceId: string, patch: Record<string, unknown>): Promise<DeviceRecord>;
  renew(deviceId: string, tokenHash: string, lastSeenAt: string): Promise<DeviceRecord>;
  findById(deviceId: string): Promise<DeviceRecord | null>;
  revoke(deviceId: string, revokedAt: string): Promise<DeviceRecord>;
};

export type DeviceActionInput = {
  action: "bind" | "renew" | "heartbeat" | "status" | "revoke";
  userId: string;
  body: Record<string, unknown>;
  deviceToken?: string;
  now?: () => Date;
  randomToken?: () => string;
};

export type DeviceActionResult = { status: number; body: Record<string, unknown> };

const clean = (value: unknown, max = 180) =>
  String(value ?? "").replace(/[\r\n\0]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function randomOpaqueToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function activeProfile(store: DeviceStore, userId: string) {
  const profile = await store.getProfile(userId);
  if (!profile || !profile.active) return null;
  return profile;
}

async function activeDevice(store: DeviceStore, userId: string, token: string | undefined) {
  if (!token) return null;
  const tokenHash = await hashDeviceToken(token);
  const device = await store.findByTokenHash(userId, tokenHash);
  if (!device || !device.active || device.revoked_at) return null;
  return device;
}

export async function executeDeviceAction(
  store: DeviceStore,
  input: DeviceActionInput,
): Promise<DeviceActionResult> {
  const now = input.now ?? (() => new Date());
  const profile = await activeProfile(store, input.userId);
  if (!profile) return { status: 403, body: { ok: false, code: "inactive_profile" } };

  if (input.action === "bind") {
    const installId = clean(input.body.install_id, 160);
    const deviceName = clean(input.body.device_name, 160) || null;
    const platform = clean(input.body.platform, 16).toLowerCase() || "android";
    const appVersion = clean(input.body.app_version, 40) || null;
    if (!installId || !["android", "ios"].includes(platform)) {
      return { status: 400, body: { ok: false, code: "invalid_device" } };
    }
    const existing = await store.findBinding(input.userId, installId);
    if (existing?.revoked_at || existing?.active === false) {
      return { status: 403, body: { ok: false, code: "device_revoked" } };
    }
    if (existing) {
      return { status: 409, body: { ok: false, code: "device_already_bound", device_id: existing.id } };
    }
    const previousActive = await store.findActiveBinding(input.userId);
    if (previousActive) {
      await store.revoke(previousActive.id, now().toISOString());
    }
    const token = (input.randomToken ?? randomOpaqueToken)();
    const tokenHash = await hashDeviceToken(token);
    const created = await store.insertBinding({
      user_id: input.userId,
      install_id: installId,
      token_hash: tokenHash,
      device_name: deviceName,
      platform,
      app_version: appVersion,
      active: true,
      last_seen_at: now().toISOString(),
    });
    return {
      status: 201,
      body: { ok: true, device_id: created.id, device_token: token },
    };
  }

  if (input.action === "renew") {
    const installId = clean(input.body.install_id, 160);
    if (!installId) return { status: 400, body: { ok: false, code: "missing_install_id" } };
    const existing = await store.findBinding(input.userId, installId);
    if (!existing) return { status: 404, body: { ok: false, code: "device_not_found" } };
    if (existing.revoked_at || existing.active === false) {
      return { status: 403, body: { ok: false, code: "device_revoked" } };
    }
    const token = (input.randomToken ?? randomOpaqueToken)();
    const tokenHash = await hashDeviceToken(token);
    const renewed = await store.renew(existing.id, tokenHash, now().toISOString());
    return {
      status: 200,
      body: { ok: true, device_id: renewed.id, device_token: token },
    };
  }

  if (input.action === "revoke") {
    if (profile.role !== "admin") {
      return { status: 403, body: { ok: false, code: "admin_required" } };
    }
    const deviceId = clean(input.body.device_id, 80);
    if (!deviceId) return { status: 400, body: { ok: false, code: "missing_device_id" } };
    const target = await store.findById(deviceId);
    if (!target) return { status: 404, body: { ok: false, code: "device_not_found" } };
    const revoked = await store.revoke(deviceId, now().toISOString());
    return { status: 200, body: { ok: true, device_id: revoked.id, active: false } };
  }

  const device = await activeDevice(store, input.userId, input.deviceToken);
  if (!device) return { status: 401, body: { ok: false, code: "invalid_device" } };

  if (input.action === "heartbeat") {
    const batteryRaw = Number(input.body.battery);
    const battery = Number.isFinite(batteryRaw) && batteryRaw >= 0 && batteryRaw <= 100 ? batteryRaw : null;
    const updated = await store.heartbeat(device.id, {
      last_seen_at: now().toISOString(),
      last_battery: battery,
      last_network_type: clean(input.body.network_type, 40) || null,
      app_version: clean(input.body.app_version, 40) || device.app_version,
    });
    return {
      status: 200,
      body: { ok: true, device_id: updated.id, last_seen_at: updated.last_seen_at },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      device: {
        id: device.id,
        active: device.active,
        platform: device.platform,
        app_version: device.app_version,
        last_seen_at: device.last_seen_at,
      },
      profile: { role: profile.role, team_id: profile.team_id },
    },
  };
}
