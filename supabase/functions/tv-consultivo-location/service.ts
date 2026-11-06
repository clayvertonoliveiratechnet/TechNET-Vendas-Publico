export type PositionInput = {
  sourceId: string;
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  activityType: string | null;
};

const finite = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function parsePosition(body: Record<string, unknown>, now = new Date()): PositionInput {
  const sourceId = String(body.source_id || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sourceId)) {
    throw new Error("invalid_source_id");
  }
  const latitude = finite(body.latitude);
  const longitude = finite(body.longitude);
  if (latitude === null || latitude < -90 || latitude > 90 ||
      longitude === null || longitude < -180 || longitude > 180) {
    throw new Error("invalid_coordinates");
  }
  const accuracyRaw = finite(body.accuracy);
  const speedRaw = finite(body.speed);
  const headingRaw = finite(body.heading);
  const batteryRaw = finite(body.battery_level);
  const recorded = body.recorded_at ? new Date(String(body.recorded_at)) : now;
  if (!Number.isFinite(recorded.getTime())) throw new Error("invalid_recorded_at");
  if (recorded.getTime() > now.getTime() + 5 * 60_000) throw new Error("future_position");
  if (recorded.getTime() < now.getTime() - 36 * 60 * 60_000) throw new Error("stale_position");
  return {
    sourceId,
    recordedAt: recorded.toISOString(),
    latitude,
    longitude,
    accuracy: accuracyRaw !== null && accuracyRaw >= 0 ? accuracyRaw : null,
    speed: speedRaw !== null && speedRaw >= 0 ? speedRaw : null,
    heading: headingRaw !== null && headingRaw >= 0 && headingRaw < 360 ? headingRaw : null,
    battery: batteryRaw !== null && batteryRaw >= 0 && batteryRaw <= 100 ? batteryRaw : null,
    activityType: String(body.activity_type || "").trim().slice(0, 40) || null,
  };
}

export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const r = 6371000;
  const rad = (v: number) => v * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function positionDelta(
  previous: { recorded_at: string; latitude: number; longitude: number } | null,
  current: PositionInput,
) {
  if (!previous) return { distance: 0, movementSeconds: 0, stoppedSeconds: 0 };
  const dt = Math.max(0, Math.round((new Date(current.recordedAt).getTime() - new Date(previous.recorded_at).getTime()) / 1000));
  if (!dt || dt > 600) return { distance: 0, movementSeconds: 0, stoppedSeconds: 0 };
  const distance = haversineMeters(
    { latitude: Number(previous.latitude), longitude: Number(previous.longitude) },
    current,
  );
  // ponytail: discard impossible GPS jumps; a future native background tracker can use richer sensor fusion.
  const saneDistance = distance <= Math.max(120, dt * 60) ? distance : 0;
  const inferredSpeed = saneDistance / Math.max(1, dt);
  const moving = (current.speed ?? inferredSpeed) >= 0.8 || inferredSpeed >= 0.8;
  return {
    distance: saneDistance >= 5 ? saneDistance : 0,
    movementSeconds: moving ? dt : 0,
    stoppedSeconds: moving ? 0 : dt,
  };
}

export function localDay(iso: string, timeZone = "America/Fortaleza") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function gpsQuality(accuracy: number | null) {
  if (accuracy == null) return "unknown";
  if (accuracy <= 15) return "excellent";
  if (accuracy <= 35) return "good";
  if (accuracy <= 80) return "fair";
  return "poor";
}
