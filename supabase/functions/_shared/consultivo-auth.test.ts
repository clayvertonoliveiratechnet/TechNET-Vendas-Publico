import {
  assertTeamScope,
  hashDeviceToken,
  requireActiveDevice,
  requireProfile,
  type ConsultivoProfile,
} from "./consultivo-auth.ts";

function assert(condition: unknown, message = "assertion_failed"): asserts condition {
  if (!condition) throw new Error(message);
}

async function assertRejects(fn: () => Promise<unknown>, expected: string) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message === expected, `expected ${expected}, got ${error.message}`);
    return;
  }
  throw new Error(`expected rejection: ${expected}`);
}

function singleRowClient(table: string, row: unknown, error: unknown = null) {
  return {
    from(name: string) {
      assert(name === table, `unexpected table: ${name}`);
      const chain: any = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return Promise.resolve({ data: row, error }); },
      };
      return chain;
    },
  };
}

Deno.test("requireProfile rejects inactive profile", async () => {
  const sb = singleRowClient("tv_profiles", {
    user_id: "u1",
    role: "consultant",
    team_id: "t1",
    supervisor_id: null,
    active: false,
  });
  await assertRejects(() => requireProfile(sb, "u1"), "inactive_profile");
});

Deno.test("hashDeviceToken is deterministic SHA-256", async () => {
  const first = await hashDeviceToken("abc");
  const second = await hashDeviceToken("abc");
  assert(first === second);
  assert(first === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

Deno.test("requireActiveDevice rejects invalid token", async () => {
  const sb = singleRowClient("tv_consultivo_devices", null);
  await assertRejects(
    () => requireActiveDevice(sb, "u1", "invalid-token"),
    "invalid_device",
  );
});

Deno.test("supervisor cannot request another team", () => {
  const profile: ConsultivoProfile = {
    user_id: "u1",
    role: "supervisor",
    team_id: "team-a",
    supervisor_id: null,
    active: true,
  };
  let denied = false;
  try {
    assertTeamScope(profile, "team-b");
  } catch (error) {
    denied = error instanceof Error && error.message === "team_scope_denied";
  }
  assert(denied);
  assertTeamScope(profile, "team-a");
});
