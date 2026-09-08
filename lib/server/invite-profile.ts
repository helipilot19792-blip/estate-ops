import type { SupabaseClient } from "@supabase/supabase-js";

// Ignore conflicts first so concurrent invitations cannot replace an existing
// profile's identity or privileged role.
export async function ensureInviteProfile(
  service: SupabaseClient,
  profile: Record<string, string | null>
) {
  const { error: insertError } = await service.from("profiles").upsert(profile, {
    onConflict: "id",
    ignoreDuplicates: true,
  });
  if (insertError) throw new Error(insertError.message);

  const { error: updateError } = await service.from("profiles")
    .update({ role: profile.role })
    .eq("id", profile.id)
    .not("role", "in", "(admin,platform_admin)");
  if (updateError) throw new Error(updateError.message);
}
