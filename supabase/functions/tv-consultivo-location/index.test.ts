import { gpsQuality, localDay, parsePosition, positionDelta } from "./service.ts";

function assert(condition: unknown, message = "assertion_failed"): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("parsePosition validates coordinates and normalizes sensor fields", () => {
  const p = parsePosition({
    source_id: "11111111-1111-4111-8111-111111111111",
    latitude: -5.8,
    longitude: -35.2,
    accuracy: 9,
    speed: 1.2,
    battery_level: 72,
    recorded_at: "2026-09-30T11:00:00Z",
  }, new Date("2026-09-30T11:00:10Z"));
  assert(p.latitude === -5.8);
  assert(p.battery === 72);
  assert(gpsQuality(p.accuracy) === "excellent");
});

Deno.test("positionDelta counts walking movement and filters tiny GPS noise", () => {
  const now = parsePosition({
    source_id: "22222222-2222-4222-8222-222222222222",
    latitude: -5.8005,
    longitude: -35.2,
    accuracy: 8,
    speed: 1.4,
    recorded_at: "2026-09-30T11:01:00Z",
  }, new Date("2026-09-30T11:01:01Z"));
  const delta = positionDelta({
    recorded_at: "2026-09-30T11:00:00Z",
    latitude: -5.8,
    longitude: -35.2,
  }, now);
  assert(delta.distance > 40);
  assert(delta.movementSeconds === 60);
  assert(delta.stoppedSeconds === 0);
});

Deno.test("positionDelta ignores long gaps", () => {
  const now = parsePosition({
    source_id: "33333333-3333-4333-8333-333333333333",
    latitude: -5.9,
    longitude: -35.3,
    recorded_at: "2026-09-30T12:00:00Z",
  }, new Date("2026-09-30T12:00:01Z"));
  const delta = positionDelta({
    recorded_at: "2026-09-30T11:00:00Z",
    latitude: -5.8,
    longitude: -35.2,
  }, now);
  assert(delta.distance === 0 && delta.movementSeconds === 0);
});

Deno.test("localDay uses Fortaleza timezone", () => {
  assert(localDay("2026-10-01T01:30:00Z") === "2026-09-30");
});
