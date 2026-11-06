import { executeDeviceAction, type DeviceRecord, type DeviceStore } from "./service.ts";

function assert(condition: unknown, message = "assertion_failed"): asserts condition {
  if (!condition) throw new Error(message);
}

const baseDevice = (overrides: Partial<DeviceRecord> = {}): DeviceRecord => ({
  id: "device-1",
  user_id: "user-1",
  install_id: "install-1",
  token_hash: "",
  active: true,
  revoked_at: null,
  device_name: "Pixel",
  platform: "android",
  app_version: "1.0.0",
  last_seen_at: null,
  last_battery: null,
  last_network_type: null,
  ...overrides,
});

function memoryStore(role = "consultant") {
  let device: DeviceRecord | null = null;
  const revokedIds: string[] = [];
  const store: DeviceStore = {
    async getProfile() {
      return { user_id: "user-1", role, team_id: "team-1", supervisor_id: null, active: true };
    },
    async findBinding(_userId, installId) {
      return device?.install_id === installId ? device : null;
    },
    async findActiveBinding() {
      return device?.active && !device.revoked_at ? device : null;
    },
    async insertBinding(input) {
      device = baseDevice({ ...input } as Partial<DeviceRecord>);
      return device;
    },
    async findByTokenHash(_userId, tokenHash) {
      return device?.token_hash === tokenHash ? device : null;
    },
    async heartbeat(_deviceId, patch) {
      device = { ...(device as DeviceRecord), ...patch };
      return device;
    },
    async renew(_deviceId, tokenHash, lastSeenAt) {
      device = { ...(device as DeviceRecord), token_hash: tokenHash, last_seen_at: lastSeenAt };
      return device;
    },
    async findById(deviceId) { return device?.id === deviceId ? device : null; },
    async revoke(deviceId, revokedAt) {
      revokedIds.push(deviceId);
      device = { ...(device as DeviceRecord), active: false, revoked_at: revokedAt };
      return device;
    },
  };
  return {
    store,
    getDevice: () => device,
    getRevokedIds: () => [...revokedIds],
    setDevice: (next: DeviceRecord | null) => { device = next; },
  };
}

Deno.test("bind returns opaque token once and stores only hash", async () => {
  const mem = memoryStore();
  const result = await executeDeviceAction(mem.store, {
    action: "bind",
    userId: "user-1",
    body: { install_id: "install-1", platform: "android", app_version: "1.0.0" },
    randomToken: () => "secret-device-token",
    now: () => new Date("2026-09-29T18:00:00Z"),
  });
  assert(result.status === 201);
  assert(result.body.device_token === "secret-device-token");
  const saved = mem.getDevice();
  assert(saved?.token_hash !== "secret-device-token");
  assert(saved?.token_hash.length === 64);
});

Deno.test("bind hands off tracking from the previous active device", async () => {
  const mem = memoryStore();
  mem.setDevice(baseDevice({ id: "device-old", install_id: "install-old", active: true }));
  const result = await executeDeviceAction(mem.store, {
    action: "bind",
    userId: "user-1",
    body: { install_id: "install-new", platform: "android", device_name: "Galaxy" },
    randomToken: () => "new-device-token",
    now: () => new Date("2026-10-01T13:54:00Z"),
  });
  assert(result.status === 201);
  assert(result.body.device_token === "new-device-token");
  assert(mem.getRevokedIds().includes("device-old"));
  assert(mem.getDevice()?.install_id === "install-new");
  assert(mem.getDevice()?.active === true);
});

Deno.test("revoked binding cannot be rebound", async () => {
  const mem = memoryStore();
  mem.setDevice(baseDevice({ active: false, revoked_at: "2026-09-29T18:00:00Z" }));
  const result = await executeDeviceAction(mem.store, {
    action: "bind",
    userId: "user-1",
    body: { install_id: "install-1", platform: "android" },
  });
  assert(result.status === 403);
  assert(result.body.code === "device_revoked");
});

Deno.test("heartbeat requires valid active device token", async () => {
  const mem = memoryStore();
  const bind = await executeDeviceAction(mem.store, {
    action: "bind",
    userId: "user-1",
    body: { install_id: "install-1", platform: "android" },
    randomToken: () => "valid-token",
  });
  assert(bind.status === 201);
  const denied = await executeDeviceAction(mem.store, {
    action: "heartbeat",
    userId: "user-1",
    body: { battery: 71 },
    deviceToken: "wrong-token",
  });
  assert(denied.status === 401);
  const ok = await executeDeviceAction(mem.store, {
    action: "heartbeat",
    userId: "user-1",
    body: { battery: 71, network_type: "wifi" },
    deviceToken: "valid-token",
    now: () => new Date("2026-09-29T19:00:00Z"),
  });
  assert(ok.status === 200);
  assert(mem.getDevice()?.last_battery === 71);
});

Deno.test("only admin can revoke device", async () => {
  const consultant = memoryStore("consultant");
  consultant.setDevice(baseDevice());
  const denied = await executeDeviceAction(consultant.store, {
    action: "revoke",
    userId: "user-1",
    body: { device_id: "device-1" },
  });
  assert(denied.status === 403);

  const admin = memoryStore("admin");
  admin.setDevice(baseDevice());
  const ok = await executeDeviceAction(admin.store, {
    action: "revoke",
    userId: "user-1",
    body: { device_id: "device-1" },
    now: () => new Date("2026-09-29T20:00:00Z"),
  });
  assert(ok.status === 200);
  assert(admin.getDevice()?.active === false);
});


Deno.test("renew rotates an active device token", async () => {
  const mem = memoryStore();
  const first = await executeDeviceAction(mem.store, {
    action: "bind",
    userId: "user-1",
    body: { install_id: "install-1", platform: "android" },
    randomToken: () => "first-token",
  });
  assert(first.status === 201);
  const renewed = await executeDeviceAction(mem.store, {
    action: "renew",
    userId: "user-1",
    body: { install_id: "install-1" },
    randomToken: () => "second-token",
    now: () => new Date("2026-09-30T11:00:00Z"),
  });
  assert(renewed.status === 200);
  assert(renewed.body.device_token === "second-token");
  const saved = mem.getDevice();
  assert(saved?.token_hash !== "second-token");
  assert(saved?.last_seen_at === "2026-09-30T11:00:00.000Z");
});
