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

  // Portal capabilities live in account links. Adding a work lane must not
  // replace an existing person's primary role or remove owner access.
  let update=service.from("profiles").update({role:profile.role}).eq("id",profile.id);
  // An explicit admin invitation may promote; first invitations initialize pending profiles.
  update=profile.role==="admin"?update.not("role","in","(admin,platform_admin)"):update.eq("role","pending");
  const { error: updateError } = await update;
  if (updateError) throw new Error(updateError.message);
}

/** Legacy organization role identifies team eligibility, not all portal capabilities. */
export function shouldUpdateInviteMembership(existing:string,incoming:string) {
  if(existing==="admin"||existing==="platform_admin")return false;
  if(incoming==="admin")return true;
  if(existing==="pending")return true;
  return existing==="owner"&&(incoming==="cleaner"||incoming==="grounds");
}
