import "server-only";

export async function requireOrganizationAdmin(
  service: any,
  userId: string,
  organizationId: string
) {
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id,email,role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile || (profile.role !== "admin" && profile.role !== "platform_admin")) {
    throw Object.assign(new Error("Admin access required."), { code: "FORBIDDEN" });
  }

  if (profile.role !== "platform_admin") {
    const { data: membership, error: membershipError } = await service
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("profile_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (membershipError) throw new Error(membershipError.message);
    if (!membership) {
      throw Object.assign(new Error("Admin access required for this organization."), {
        code: "FORBIDDEN",
      });
    }
  }

  return profile as { id: string; email: string | null; role: string };
}

export async function requirePropertyInOrganization(
  service: any,
  propertyId: string,
  organizationId: string,
  columns = "id,organization_id"
) {
  const { data: property, error } = await service
    .from("properties")
    .select(columns)
    .eq("id", propertyId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!property) {
    throw Object.assign(new Error("Property was not found in this organization."), {
      code: "NOT_FOUND",
    });
  }
  return property;
}

export function getOrganizationAccessErrorStatus(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  if (code === "FORBIDDEN") return 403;
  if (code === "NOT_FOUND") return 404;
  return 500;
}
