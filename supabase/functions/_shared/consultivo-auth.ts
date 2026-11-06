export type ConsultivoProfile = {
  user_id: string;
  role: string;
  team_id: string | null;
  supervisor_id: string | null;
  active: boolean;
};

export type ConsultivoDevice = {
  id: string;
  user_id: string;
  active: boolean;
  revoked_at: string | null;
  token_hash: string;
};

export async function hashDeviceToken(token: string): Promise<string> {
  if (!token) throw new Error("missing_device_token");
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function requireProfile(sb: any, userId: string): Promise<ConsultivoProfile> {
  const { data, error } = await sb
    .from("tv_profiles")
    .select("user_id,role,team_id,supervisor_id,active")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("profile_lookup_failed");
  if (!data || !data.active) throw new Error("inactive_profile");
  return data as ConsultivoProfile;
}

export async function requireActiveDevice(
  sb: any,
  userId: string,
  token: string,
): Promise<ConsultivoDevice> {
  const tokenHash = await hashDeviceToken(token);
  const { data, error } = await sb
    .from("tv_consultivo_devices")
    .select("id,user_id,active,revoked_at,token_hash")
    .eq("user_id", userId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw new Error("device_lookup_failed");
  if (!data || !data.active || data.revoked_at) throw new Error("invalid_device");
  return data as ConsultivoDevice;
}

export function assertTeamScope(
  profile: ConsultivoProfile,
  requestedTeamId: string | null | undefined,
): void {
  if (profile.role === "admin") return;
  if (!requestedTeamId || !profile.team_id || requestedTeamId !== profile.team_id) {
    throw new Error("team_scope_denied");
  }
}
