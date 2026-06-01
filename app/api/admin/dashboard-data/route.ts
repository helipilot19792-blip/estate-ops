import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables.");
}

const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function createAuthClient(token: string) {
  return createClient(supabaseUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function isOptionalTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message || "";
  return (
    error?.code === "PGRST205" ||
    message.includes("Could not find the table") ||
    message.includes("does not exist")
  );
}

function emptyResult<T = unknown>() {
  return Promise.resolve({ data: [] as T[], error: null });
}

async function requireAdminAccess(token: string, organizationId: string) {
  const authClient = createAuthClient(token);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated.");
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id,email,full_name,phone,role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("No profile was found for this user.");
  }

  if (profile.role === "platform_admin") {
    return { user, profile };
  }

  const { data: membership, error: membershipError } = await serviceClient
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (membershipError || membership?.role !== "admin") {
    throw new Error("Admin access required for this organization.");
  }

  return { user, profile };
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "").trim() : "";
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId")?.trim() || "";

    if (!token) {
      return Response.json({ ok: false, error: "Missing authorization header." }, { status: 401 });
    }

    if (!organizationId) {
      return Response.json({ ok: false, error: "Missing organizationId." }, { status: 400 });
    }

    const { user } = await requireAdminAccess(token, organizationId);
    const todayYmd = new Date().toISOString().slice(0, 10);
    const bookingLookaheadEndYmd = new Date(Date.now() + 540 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [
      propertiesRes,
      cleanerAccountsRes,
      jobsRes,
      groundsAccountsRes,
      groundsJobsRes,
      documentVaultRes,
      profilesRes,
      ownerAccountsRes,
      propertyBookingEventsRes,
      maintenanceFlagsRes,
      inspectionRulesRes,
      inspectionLogsRes,
      organizationInvitesRes,
      invoiceSettingsRes,
      propertyInvoiceRatesRes,
      ownerInvoicesRes,
      ownerInvoiceEventsRes,
      chatConversationsRes,
      chatParticipantsRes,
      chatMessagesRes,
      chatHiddenItemsRes,
    ] = await Promise.all([
      serviceClient.from("properties").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      serviceClient.from("cleaner_accounts").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      serviceClient.from("turnover_jobs").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      serviceClient.from("grounds_accounts").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      serviceClient.from("grounds_jobs").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      serviceClient.from("document_vault_files").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      serviceClient
        .from("organization_members")
        .select(`
          profile_id,
          role,
          created_at,
          profiles!organization_members_profile_id_fkey (
            id,
            email,
            full_name,
            phone,
            role,
            created_at
          )
        `)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      serviceClient.from("owner_accounts").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      serviceClient
        .from("property_booking_events")
        .select("*")
        .eq("organization_id", organizationId)
        .lte("checkin_date", bookingLookaheadEndYmd)
        .gte("checkout_date", todayYmd)
        .order("checkin_date", { ascending: true }),
      serviceClient.from("property_maintenance_flags").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      serviceClient.from("property_inspection_rules").select("*").eq("organization_id", organizationId).order("next_due_date", { ascending: true }),
      serviceClient.from("property_inspection_logs").select("*").eq("organization_id", organizationId).order("inspected_at", { ascending: false }),
      serviceClient.from("organization_invites").select("*").eq("organization_id", organizationId).in("role", ["cleaner", "grounds", "admin"]).order("created_at", { ascending: false }),
      serviceClient.from("organization_invoice_settings").select("*").eq("organization_id", organizationId).maybeSingle(),
      serviceClient.from("property_invoice_rates").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      serviceClient.from("owner_invoices").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      serviceClient.from("owner_invoice_events").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(1000),
      serviceClient.from("chat_conversations").select("id,organization_id,subject,context_type,context_id,created_by_profile_id,last_message_at,created_at,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }),
      serviceClient.from("chat_participants").select("id,organization_id,conversation_id,participant_type,participant_profile_id,participant_owner_account_id,participant_role,display_name,email,last_read_at,created_at").eq("organization_id", organizationId).order("created_at", { ascending: true }),
      serviceClient.from("chat_messages").select("id,organization_id,conversation_id,sender_profile_id,body,created_at,updated_at").eq("organization_id", organizationId).order("created_at", { ascending: true }),
      serviceClient.from("chat_hidden_items").select("id,organization_id,conversation_id,message_id,hidden_by_profile_id,hidden_by_owner_account_id,hidden_at").eq("organization_id", organizationId).eq("hidden_by_profile_id", user.id),
    ]);

    const requiredResponses = [
      propertiesRes,
      cleanerAccountsRes,
      jobsRes,
      groundsAccountsRes,
      groundsJobsRes,
      profilesRes,
      ownerAccountsRes,
      maintenanceFlagsRes,
      organizationInvitesRes,
      ownerInvoicesRes,
    ];

    for (const response of requiredResponses) {
      if (response.error) {
        throw new Error(response.error.message);
      }
    }

    const properties = propertiesRes.data ?? [];
    const loadedPropertyIds = new Set(properties.map((property: { id: string }) => property.id));
    const propertyIds = Array.from(loadedPropertyIds);
    const cleanerAccountIds = ((cleanerAccountsRes.data ?? []) as Array<{ id: string }>).map((account) => account.id);
    const groundsAccountIds = ((groundsAccountsRes.data ?? []) as Array<{ id: string }>).map((account) => account.id);
    const jobIds = ((jobsRes.data ?? []) as Array<{ id: string }>).map((job) => job.id);
    const groundsJobIds = ((groundsJobsRes.data ?? []) as Array<{ id: string }>).map((job) => job.id);
    const ownerAccountIds = ((ownerAccountsRes.data ?? []) as Array<{ id: string }>).map((owner) => owner.id);
    const maintenanceFlagIds = ((maintenanceFlagsRes.data ?? []) as Array<{ id: string }>).map((flag) => flag.id);
    const inspectionLogIds = ((inspectionLogsRes.data ?? []) as Array<{ id: string }>).map((log) => log.id);

    const [
      cleanerAccountMembersRes,
      assignmentsRes,
      jobSlotsRes,
      groundsAccountMembersRes,
      groundsAssignmentsRes,
      groundsJobSlotsRes,
      groundsRecurringTasksRes,
      groundsRecurringRulesRes,
      strandedJobsRes,
      accessRowsRes,
      sopsRes,
      ownerPropertyAccessRes,
      propertyCalendarsRes,
      maintenanceFlagImagesRes,
      inspectionPhotosRes,
    ] = await Promise.all([
      cleanerAccountIds.length > 0
        ? serviceClient.from("cleaner_account_members").select("*").in("cleaner_account_id", cleanerAccountIds).order("created_at", { ascending: false })
        : emptyResult(),
      propertyIds.length > 0
        ? serviceClient.from("property_cleaner_account_assignments").select("*").in("property_id", propertyIds).order("priority", { ascending: true })
        : emptyResult(),
      jobIds.length > 0
        ? serviceClient.from("turnover_job_slots").select("*").in("job_id", jobIds).order("job_id", { ascending: true })
        : emptyResult(),
      groundsAccountIds.length > 0
        ? serviceClient.from("grounds_account_members").select("*").in("grounds_account_id", groundsAccountIds).order("created_at", { ascending: false })
        : emptyResult(),
      propertyIds.length > 0
        ? serviceClient.from("property_grounds_account_assignments").select("*").in("property_id", propertyIds).order("priority", { ascending: true })
        : emptyResult(),
      groundsJobIds.length > 0
        ? serviceClient.from("grounds_job_slots").select("*").in("job_id", groundsJobIds).order("job_id", { ascending: true })
        : emptyResult(),
      propertyIds.length > 0
        ? serviceClient.from("property_grounds_recurring_tasks").select("*").in("property_id", propertyIds).order("created_at", { ascending: false })
        : emptyResult(),
      propertyIds.length > 0
        ? serviceClient.from("property_grounds_recurring_rules").select("*").in("property_id", propertyIds).order("created_at", { ascending: false })
        : emptyResult(),
      propertyIds.length > 0
        ? serviceClient.from("admin_stranded_jobs").select("*").in("property_id", propertyIds).order("created_at", { ascending: true })
        : emptyResult(),
      propertyIds.length > 0
        ? serviceClient.from("property_access").select("*").in("property_id", propertyIds)
        : emptyResult(),
      propertyIds.length > 0
        ? serviceClient.from("property_sops").select("*").in("property_id", propertyIds).order("created_at", { ascending: false })
        : emptyResult(),
      ownerAccountIds.length > 0
        ? serviceClient.from("owner_property_access").select("*").in("owner_account_id", ownerAccountIds).order("created_at", { ascending: false })
        : emptyResult(),
      propertyIds.length > 0
        ? serviceClient.from("property_calendars").select("*").in("property_id", propertyIds).order("created_at", { ascending: false })
        : emptyResult(),
      maintenanceFlagIds.length > 0
        ? serviceClient.from("property_maintenance_flag_images").select("*").in("flag_id", maintenanceFlagIds).order("sort_order", { ascending: true })
        : emptyResult(),
      inspectionLogIds.length > 0
        ? serviceClient.from("property_inspection_photos").select("*").in("inspection_log_id", inspectionLogIds).order("sort_order", { ascending: true })
        : emptyResult(),
    ]);

    const childRequiredResponses = [
      cleanerAccountMembersRes,
      assignmentsRes,
      jobSlotsRes,
      groundsAccountMembersRes,
      groundsAssignmentsRes,
      groundsJobSlotsRes,
      groundsRecurringTasksRes,
      groundsRecurringRulesRes,
      strandedJobsRes,
      accessRowsRes,
      sopsRes,
      ownerPropertyAccessRes,
      propertyCalendarsRes,
      maintenanceFlagImagesRes,
    ];

    for (const response of childRequiredResponses) {
      if (response.error) {
        throw new Error(response.error.message);
      }
    }

    const sopIds = ((sopsRes.data ?? []) as Array<{ id: string }>).map((sop) => sop.id);
    const sopImagesRes = sopIds.length > 0
      ? await serviceClient.from("property_sop_images").select("*").in("sop_id", sopIds).order("sort_order", { ascending: true })
      : { data: [], error: null };

    if (sopImagesRes.error) {
      throw new Error(sopImagesRes.error.message);
    }

    return Response.json({
      ok: true,
      data: {
        properties,
        cleanerAccounts: cleanerAccountsRes.data ?? [],
        cleanerAccountMembers: cleanerAccountMembersRes.data ?? [],
        assignments: assignmentsRes.data ?? [],
        jobs: jobsRes.data ?? [],
        jobSlots: jobSlotsRes.data ?? [],
        groundsAccounts: groundsAccountsRes.data ?? [],
        groundsAccountMembers: groundsAccountMembersRes.data ?? [],
        groundsAssignments: groundsAssignmentsRes.data ?? [],
        groundsJobs: groundsJobsRes.data ?? [],
        groundsJobSlots: groundsJobSlotsRes.data ?? [],
        groundsRecurringTasks: groundsRecurringTasksRes.data ?? [],
        groundsRecurringRules: groundsRecurringRulesRes.data ?? [],
        strandedJobs: strandedJobsRes.data ?? [],
        accessRows: accessRowsRes.data ?? [],
        sops: sopsRes.data ?? [],
        sopImages: sopImagesRes.data ?? [],
        documentVaultRows: documentVaultRes.error && isOptionalTableError(documentVaultRes.error) ? [] : documentVaultRes.data ?? [],
        profiles: profilesRes.data ?? [],
        ownerAccounts: ownerAccountsRes.data ?? [],
        ownerPropertyAccess: ownerPropertyAccessRes.data ?? [],
        propertyCalendars: propertyCalendarsRes.data ?? [],
        propertyBookingEvents: propertyBookingEventsRes.error && isOptionalTableError(propertyBookingEventsRes.error) ? [] : propertyBookingEventsRes.data ?? [],
        maintenanceFlags: maintenanceFlagsRes.data ?? [],
        maintenanceFlagImages: maintenanceFlagImagesRes.data ?? [],
        inspectionRules: inspectionRulesRes.error && isOptionalTableError(inspectionRulesRes.error) ? [] : inspectionRulesRes.data ?? [],
        inspectionLogs: inspectionLogsRes.error && isOptionalTableError(inspectionLogsRes.error) ? [] : inspectionLogsRes.data ?? [],
        inspectionPhotos: inspectionPhotosRes.error && isOptionalTableError(inspectionPhotosRes.error) ? [] : inspectionPhotosRes.data ?? [],
        organizationInvites: organizationInvitesRes.data ?? [],
        invoiceSettings: invoiceSettingsRes.error && isOptionalTableError(invoiceSettingsRes.error) ? null : invoiceSettingsRes.data ?? null,
        propertyInvoiceRates: propertyInvoiceRatesRes.error && isOptionalTableError(propertyInvoiceRatesRes.error) ? [] : propertyInvoiceRatesRes.data ?? [],
        ownerInvoices: ownerInvoicesRes.data ?? [],
        ownerInvoiceEvents: ownerInvoiceEventsRes.error && isOptionalTableError(ownerInvoiceEventsRes.error) ? [] : ownerInvoiceEventsRes.data ?? [],
        chatConversations: chatConversationsRes.error && isOptionalTableError(chatConversationsRes.error) ? [] : chatConversationsRes.data ?? [],
        chatParticipants: chatParticipantsRes.error && isOptionalTableError(chatParticipantsRes.error) ? [] : chatParticipantsRes.data ?? [],
        chatMessages: chatMessagesRes.error && isOptionalTableError(chatMessagesRes.error) ? [] : chatMessagesRes.data ?? [],
        chatHiddenItems: chatHiddenItemsRes.error && isOptionalTableError(chatHiddenItemsRes.error) ? [] : chatHiddenItemsRes.data ?? [],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load admin dashboard data.";
    const status =
      message.includes("authenticated") || message.includes("access required")
        ? 403
        : 500;

    return Response.json({ ok: false, error: message }, { status });
  }
}
