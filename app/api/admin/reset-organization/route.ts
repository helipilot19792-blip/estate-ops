import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        { ok: false, error: "Missing authorization header." },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return Response.json(
        { ok: false, error: "Missing access token." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    const organizationId =
      typeof body?.organizationId === "string" ? body.organizationId.trim() : "";

    if (!organizationId) {
      return Response.json(
        { ok: false, error: "Missing organizationId." },
        { status: 400 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return Response.json(
        { ok: false, error: "Invalid user." },
        { status: 401 }
      );
    }

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("profile_id", user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return Response.json(
        { ok: false, error: "You do not have access to this organization." },
        { status: 403 }
      );
    }

    if (membership.role !== "admin") {
      return Response.json(
        { ok: false, error: "Only admins can reset organization data." },
        { status: 403 }
      );
    }

    const { data: properties, error: propertiesError } = await supabase
      .from("properties")
      .select("id")
      .eq("organization_id", organizationId);

    if (propertiesError) throw propertiesError;

    const propertyIds = (properties ?? []).map((p) => p.id);

    const { data: turnoverJobs, error: tjError } = await supabase
      .from("turnover_jobs")
      .select("id")
      .eq("organization_id", organizationId);

    if (tjError) throw tjError;

    const turnoverJobIds = (turnoverJobs ?? []).map((j) => j.id);

    const { data: groundsJobs, error: gjError } = await supabase
      .from("grounds_jobs")
      .select("id")
      .eq("organization_id", organizationId);

    if (gjError) throw gjError;

    const groundsJobIds = (groundsJobs ?? []).map((j) => j.id);

    const { data: flags, error: flagsError } = await supabase
      .from("property_maintenance_flags")
      .select("id")
      .eq("organization_id", organizationId);

    if (flagsError) throw flagsError;

    const flagIds = (flags ?? []).map((f) => f.id);

    const { data: sops, error: sopsError } = await supabase
      .from("property_sops")
      .select("id")
      .in(
        "property_id",
        propertyIds.length > 0 ? propertyIds : ["00000000-0000-0000-0000-000000000000"]
      );

    if (sopsError) throw sopsError;

    const sopIds = (sops ?? []).map((s) => s.id);

    const { data: ownerAccounts, error: ownerAccountsError } = await supabase
      .from("owner_accounts")
      .select("id")
      .eq("organization_id", organizationId);

    if (ownerAccountsError) throw ownerAccountsError;

    const ownerAccountIds = (ownerAccounts ?? []).map((o) => o.id);

    const { data: cleanerAccounts, error: cleanerAccountsError } = await supabase
      .from("cleaner_accounts")
      .select("id")
      .eq("organization_id", organizationId);

    if (cleanerAccountsError) throw cleanerAccountsError;

    const cleanerAccountIds = (cleanerAccounts ?? []).map((c) => c.id);

    const { data: groundsAccounts, error: groundsAccountsError } = await supabase
      .from("grounds_accounts")
      .select("id")
      .eq("organization_id", organizationId);

    if (groundsAccountsError) throw groundsAccountsError;

    const groundsAccountIds = (groundsAccounts ?? []).map((g) => g.id);

    let deletedFlagImages = 0;
    if (flagIds.length > 0) {
      const { error, count } = await supabase
        .from("property_maintenance_flag_images")
        .delete({ count: "exact" })
        .in("flag_id", flagIds);

      if (error) throw error;
      deletedFlagImages = count ?? 0;
    }

    const { error: delFlagsError, count: deletedFlags } = await supabase
      .from("property_maintenance_flags")
      .delete({ count: "exact" })
      .eq("organization_id", organizationId);

    if (delFlagsError) throw delFlagsError;

    let deletedPropertyCalendars = 0;
    if (propertyIds.length > 0) {
      const { error, count } = await supabase
        .from("property_calendars")
        .delete({ count: "exact" })
        .in("property_id", propertyIds);

      if (error) throw error;
      deletedPropertyCalendars = count ?? 0;
    }

    let deletedTurnoverSlots = 0;
    if (turnoverJobIds.length > 0) {
      const { error, count } = await supabase
        .from("turnover_job_slots")
        .delete({ count: "exact" })
        .in("job_id", turnoverJobIds);

      if (error) throw error;
      deletedTurnoverSlots = count ?? 0;
    }

    let deletedGroundsSlots = 0;
    if (groundsJobIds.length > 0) {
      const { error, count } = await supabase
        .from("grounds_job_slots")
        .delete({ count: "exact" })
        .in("job_id", groundsJobIds);

      if (error) throw error;
      deletedGroundsSlots = count ?? 0;
    }

    const { error: delTJError, count: deletedTurnoverJobs } = await supabase
      .from("turnover_jobs")
      .delete({ count: "exact" })
      .eq("organization_id", organizationId);

    if (delTJError) throw delTJError;

    const { error: delGJError, count: deletedGroundsJobs } = await supabase
      .from("grounds_jobs")
      .delete({ count: "exact" })
      .eq("organization_id", organizationId);

    if (delGJError) throw delGJError;

    let deletedPropertyAccess = 0;
    if (propertyIds.length > 0) {
      const { error, count } = await supabase
        .from("property_access")
        .delete({ count: "exact" })
        .in("property_id", propertyIds);

      if (error) throw error;
      deletedPropertyAccess = count ?? 0;
    }

    let deletedCleanerAssignments = 0;
    if (propertyIds.length > 0) {
      const { error, count } = await supabase
        .from("property_cleaner_account_assignments")
        .delete({ count: "exact" })
        .in("property_id", propertyIds);

      if (error) throw error;
      deletedCleanerAssignments = count ?? 0;
    }

    let deletedGroundsAssignments = 0;
    if (propertyIds.length > 0) {
      const { error, count } = await supabase
        .from("property_grounds_account_assignments")
        .delete({ count: "exact" })
        .in("property_id", propertyIds);

      if (error) throw error;
      deletedGroundsAssignments = count ?? 0;
    }

    let deletedGroundsRecurringTasks = 0;
    if (propertyIds.length > 0) {
      const { error, count } = await supabase
        .from("property_grounds_recurring_tasks")
        .delete({ count: "exact" })
        .in("property_id", propertyIds);

      if (error) throw error;
      deletedGroundsRecurringTasks = count ?? 0;
    }

    let deletedGroundsRecurringRules = 0;
    if (propertyIds.length > 0) {
      const { error, count } = await supabase
        .from("property_grounds_recurring_rules")
        .delete({ count: "exact" })
        .in("property_id", propertyIds);

      if (error) throw error;
      deletedGroundsRecurringRules = count ?? 0;
    }

    let deletedSopImages = 0;
    if (sopIds.length > 0) {
      const { error, count } = await supabase
        .from("property_sop_images")
        .delete({ count: "exact" })
        .in("sop_id", sopIds);

      if (error) throw error;
      deletedSopImages = count ?? 0;
    }

    let deletedSops = 0;
    if (propertyIds.length > 0) {
      const { error, count } = await supabase
        .from("property_sops")
        .delete({ count: "exact" })
        .in("property_id", propertyIds);

      if (error) throw error;
      deletedSops = count ?? 0;
    }

    let deletedOwnerPropertyAccess = 0;
    if (ownerAccountIds.length > 0 || propertyIds.length > 0) {
      const filters = [
        ownerAccountIds.length > 0
          ? `owner_account_id.in.(${ownerAccountIds.join(",")})`
          : null,
        propertyIds.length > 0 ? `property_id.in.(${propertyIds.join(",")})` : null,
      ].filter(Boolean);

      if (filters.length > 0) {
        const { error, count } = await supabase
          .from("owner_property_access")
          .delete({ count: "exact" })
          .or(filters.join(","));

        if (error) throw error;
        deletedOwnerPropertyAccess = count ?? 0;
      }
    }

    let deletedOwnerAccounts = 0;
    if (ownerAccountIds.length > 0) {
      const { error, count } = await supabase
        .from("owner_accounts")
        .delete({ count: "exact" })
        .eq("organization_id", organizationId);

      if (error) throw error;
      deletedOwnerAccounts = count ?? 0;
    }

    let deletedCleanerAccountMembers = 0;
    if (cleanerAccountIds.length > 0) {
      const { error, count } = await supabase
        .from("cleaner_account_members")
        .delete({ count: "exact" })
        .in("cleaner_account_id", cleanerAccountIds);

      if (error) throw error;
      deletedCleanerAccountMembers = count ?? 0;
    }

    let deletedGroundsAccountMembers = 0;
    if (groundsAccountIds.length > 0) {
      const { error, count } = await supabase
        .from("grounds_account_members")
        .delete({ count: "exact" })
        .in("grounds_account_id", groundsAccountIds);

      if (error) throw error;
      deletedGroundsAccountMembers = count ?? 0;
    }

    let deletedCleanerAccounts = 0;
    if (cleanerAccountIds.length > 0) {
      const { error, count } = await supabase
        .from("cleaner_accounts")
        .delete({ count: "exact" })
        .eq("organization_id", organizationId);

      if (error) throw error;
      deletedCleanerAccounts = count ?? 0;
    }

    let deletedGroundsAccounts = 0;
    if (groundsAccountIds.length > 0) {
      const { error, count } = await supabase
        .from("grounds_accounts")
        .delete({ count: "exact" })
        .eq("organization_id", organizationId);

      if (error) throw error;
      deletedGroundsAccounts = count ?? 0;
    }

    const { error: invitesDeleteError, count: deletedInvites } = await supabase
      .from("organization_invites")
      .delete({ count: "exact" })
      .eq("organization_id", organizationId);

    if (invitesDeleteError) throw invitesDeleteError;

    const { error: supportDeleteError, count: deletedSupportTickets } = await supabase
      .from("support_tickets")
      .delete({ count: "exact" })
      .eq("organization_id", organizationId);

    if (supportDeleteError) throw supportDeleteError;

    const { error: propertiesDeleteError, count: deletedProperties } = await supabase
      .from("properties")
      .delete({ count: "exact" })
      .eq("organization_id", organizationId);

    if (propertiesDeleteError) throw propertiesDeleteError;

    return Response.json({
      ok: true,
      message: "Organization data reset completed.",
      deleted: {
        property_maintenance_flag_images: deletedFlagImages,
        property_maintenance_flags: deletedFlags ?? 0,
        property_calendars: deletedPropertyCalendars,
        turnover_job_slots: deletedTurnoverSlots,
        grounds_job_slots: deletedGroundsSlots,
        turnover_jobs: deletedTurnoverJobs ?? 0,
        grounds_jobs: deletedGroundsJobs ?? 0,
        property_access: deletedPropertyAccess,
        property_cleaner_account_assignments: deletedCleanerAssignments,
        property_grounds_account_assignments: deletedGroundsAssignments,
        property_grounds_recurring_tasks: deletedGroundsRecurringTasks,
        property_grounds_recurring_rules: deletedGroundsRecurringRules,
        property_sop_images: deletedSopImages,
        property_sops: deletedSops,
        owner_property_access: deletedOwnerPropertyAccess,
        owner_accounts: deletedOwnerAccounts,
        cleaner_account_members: deletedCleanerAccountMembers,
        grounds_account_members: deletedGroundsAccountMembers,
        cleaner_accounts: deletedCleanerAccounts,
        grounds_accounts: deletedGroundsAccounts,
        organization_invites: deletedInvites ?? 0,
        support_tickets: deletedSupportTickets ?? 0,
        properties: deletedProperties ?? 0,
      },
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        error: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}