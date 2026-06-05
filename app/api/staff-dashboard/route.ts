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

const DEFAULT_CLEANING_CHECKLIST = [
  "Clean kitchen sink and counters",
  "Clean toilets, tubs, and bathroom sinks",
  "Replace linens and make beds",
  "Vacuum and mop floors",
  "Empty garbage and recycling",
  "Restock guest supplies",
  "Check for damage or left items",
  "Take final walkthrough photos",
];

function isOptionalTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message || "";
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    message.includes("Could not find the table") ||
    message.includes("does not exist")
  );
}

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

function extractCheckoutDate(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/Checkout date:\s*(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] || null;
}

function sortStaffJobsNearestFirst<T extends { jobDate: string | null; slot: { created_at?: string | null } }>(
  items: T[]
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return [...items].sort((a, b) => {
    const aDate = a.jobDate ? new Date(`${a.jobDate}T00:00:00`) : null;
    const bDate = b.jobDate ? new Date(`${b.jobDate}T00:00:00`) : null;
    const aFuture = aDate ? aDate.getTime() >= today.getTime() : false;
    const bFuture = bDate ? bDate.getTime() >= today.getTime() : false;

    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    if (aDate && bDate && aDate.getTime() !== bDate.getTime()) {
      return aFuture ? aDate.getTime() - bDate.getTime() : bDate.getTime() - aDate.getTime();
    }

    return (b.slot.created_at || "").localeCompare(a.slot.created_at || "");
  });
}

async function getSignedInProfile(token: string) {
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
    .select("id, email, full_name, phone, role, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new Error(profileError?.message || "No profile is linked to this sign-in yet.");
  }

  return { user, profile };
}

async function loadPropertySupport(propertyIds: string[]) {
  if (propertyIds.length === 0) {
    return {
      properties: [],
      accessRows: [],
      sops: [],
      sopImages: [],
    };
  }

  const [propertiesRes, accessRes, sopsRes] = await Promise.all([
    serviceClient
      .from("properties")
      .select("id, organization_id, name, address, notes, latitude, longitude")
      .in("id", propertyIds),
    serviceClient
      .from("property_access")
      .select("id, property_id, door_code, alarm_code, notes")
      .in("property_id", propertyIds),
    serviceClient
      .from("property_sops")
      .select("id, property_id, title, content, created_at")
      .in("property_id", propertyIds)
      .order("created_at", { ascending: false }),
  ]);

  if (propertiesRes.error) throw new Error(propertiesRes.error.message);
  if (accessRes.error) throw new Error(accessRes.error.message);
  if (sopsRes.error) throw new Error(sopsRes.error.message);

  const sops = sopsRes.data ?? [];
  const sopIds = sops.map((sop: { id: string }) => sop.id);
  let sopImages: unknown[] = [];

  if (sopIds.length > 0) {
    const { data, error } = await serviceClient
      .from("property_sop_images")
      .select("id, sop_id, image_url, caption, sort_order")
      .in("sop_id", sopIds)
      .order("sort_order", { ascending: true });

    if (error) throw new Error(error.message);
    sopImages = data ?? [];
  }

  return {
    properties: propertiesRes.data ?? [],
    accessRows: accessRes.data ?? [],
    sops,
    sopImages,
  };
}

async function loadCleanerChecklistItems(slots: any[], jobsById: Map<string, any>, profileId: string) {
  if (slots.length === 0) return [];

  const slotIds = slots.map((slot) => slot.id).filter(Boolean);
  const propertyIds = [
    ...new Set(
      slots
        .map((slot) => jobsById.get(slot.job_id)?.property_id)
        .filter(Boolean)
    ),
  ];

  let existingRes: any = await serviceClient
    .from("turnover_job_checklist_items")
    .select("*")
    .in("slot_id", slotIds)
    .order("sort_order", { ascending: true });

  if (isOptionalTableError(existingRes.error)) return [];
  if (existingRes.error) throw new Error(existingRes.error.message);

  const existingItems = existingRes.data ?? [];
  const existingSlotIds = new Set(existingItems.map((item: any) => item.slot_id));
  const missingSlots = slots.filter((slot) => !existingSlotIds.has(slot.id));

  if (missingSlots.length > 0) {
    let propertyChecklistRes: any =
      propertyIds.length > 0
        ? await serviceClient
            .from("property_cleaning_checklist_items")
            .select("*")
            .in("property_id", propertyIds)
            .eq("active", true)
            .order("sort_order", { ascending: true })
        : { data: [], error: null };

    if (isOptionalTableError(propertyChecklistRes.error)) return existingItems;
    if (propertyChecklistRes.error) throw new Error(propertyChecklistRes.error.message);

    const propertyItems = propertyChecklistRes.data ?? [];
    const propertyItemsByPropertyId = new Map<string, any[]>();
    for (const item of propertyItems) {
      const list = propertyItemsByPropertyId.get(item.property_id) || [];
      list.push(item);
      propertyItemsByPropertyId.set(item.property_id, list);
    }

    const rowsToInsert = missingSlots.flatMap((slot) => {
      const job = jobsById.get(slot.job_id);
      if (!job) return [];
      const sourceItems = propertyItemsByPropertyId.get(job.property_id) || [];
      const checklistSource =
        sourceItems.length > 0
          ? sourceItems
          : DEFAULT_CLEANING_CHECKLIST.map((title, index) => ({
              id: null,
              title,
              description: null,
              sort_order: index + 1,
            }));

      return checklistSource.map((item: any, index: number) => ({
        organization_id: job.organization_id,
        job_id: slot.job_id,
        slot_id: slot.id,
        property_id: job.property_id,
        source_item_id: item.id || null,
        title: item.title,
        description: item.description || null,
        sort_order: Number(item.sort_order ?? index + 1),
      }));
    });

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await serviceClient
        .from("turnover_job_checklist_items")
        .insert(rowsToInsert);
      if (insertError && !isOptionalTableError(insertError)) {
        throw new Error(insertError.message);
      }

      existingRes = await serviceClient
        .from("turnover_job_checklist_items")
        .select("*")
        .in("slot_id", slotIds)
        .order("sort_order", { ascending: true });
      if (existingRes.error && !isOptionalTableError(existingRes.error)) {
        throw new Error(existingRes.error.message);
      }
      return existingRes.data ?? existingItems;
    }
  }

  return existingItems;
}

async function loadCleanerDashboard(profileId: string) {
  const { data: memberships, error: membershipError } = await serviceClient
    .from("cleaner_account_members")
    .select("id, cleaner_account_id, profile_id, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true });

  if (membershipError) throw new Error(membershipError.message);

  const memberRows = memberships ?? [];
  if (memberRows.length === 0) {
    return {
      account: null,
      warning: "Your cleaner login is not linked to a cleaner account yet. Ask admin to connect your profile to a cleaner account.",
      jobs: [],
      properties: [],
      accessRows: [],
      sops: [],
      sopImages: [],
      checklistItems: [],
    };
  }

  const accountIds = memberRows.map((member: { cleaner_account_id: string }) => member.cleaner_account_id);
  const { data: accounts, error: accountsError } = await serviceClient
    .from("cleaner_accounts")
    .select("*")
    .in("id", accountIds);

  if (accountsError) throw new Error(accountsError.message);

  const account =
    (accounts ?? []).find((row: { id: string }) => row.id === memberRows[0].cleaner_account_id) ||
    accounts?.[0] ||
    null;

  if (!account) {
    return {
      account: null,
      warning: "Your cleaner account record could not be found. Ask admin to reconnect your cleaner access.",
      jobs: [],
      properties: [],
      accessRows: [],
      sops: [],
      sopImages: [],
      checklistItems: [],
    };
  }

  let accountSlotsRes: any = await serviceClient
    .from("turnover_job_slots")
    .select("id, job_id, slot_number, cleaner_account_id, status, offered_at, accepted_at, declined_at, started_at, finished_at, expires_at, accepted_by_profile_id, declined_by_profile_id, started_by_profile_id, finished_by_profile_id, created_at, updated_at")
    .eq("cleaner_account_id", account.id)
    .order("created_at", { ascending: false });

  if (accountSlotsRes.error?.code === "42703") {
    accountSlotsRes = await serviceClient
      .from("turnover_job_slots")
      .select("id, job_id, slot_number, cleaner_account_id, status, offered_at, accepted_at, declined_at, expires_at, accepted_by_profile_id, declined_by_profile_id, created_at, updated_at")
      .eq("cleaner_account_id", account.id)
      .order("created_at", { ascending: false });
  }

  const accountSlots = accountSlotsRes.data;
  const slotError = accountSlotsRes.error;

  if (slotError) throw new Error(slotError.message);

  const slots = accountSlots ?? [];
  if (slots.length === 0) {
    return {
      account,
      warning: memberRows.length > 1 ? "Your profile is linked to more than one cleaner account. This page is using the first linked account right now." : null,
      jobs: [],
      checklistItems: [],
      ...(await loadPropertySupport([])),
    };
  }

  const jobIds = [...new Set(slots.map((slot: { job_id: string }) => slot.job_id))];
  const [jobsRes, allSlotsRes] = await Promise.all([
    serviceClient
      .from("turnover_jobs")
      .select("id, organization_id, property_id, status, notes, created_at, offered_at, accepted_at, declined_at, scheduled_for, staffing_status, cleaner_units_needed, cleaner_units_required_strict, show_team_status_to_cleaners")
      .in("id", jobIds),
    serviceClient
      .from("turnover_job_slots")
      .select("id, job_id, status")
      .in("job_id", jobIds),
  ]);

  if (jobsRes.error) throw new Error(jobsRes.error.message);
  if (allSlotsRes.error) throw new Error(allSlotsRes.error.message);

  const jobsById = new Map((jobsRes.data ?? []).map((job: { id: string }) => [job.id, job]));
  const checklistItems = await loadCleanerChecklistItems(slots, jobsById, profileId);
  const slotCounts = new Map<string, { total: number; accepted: number }>();

  for (const slot of allSlotsRes.data ?? []) {
    const current = slotCounts.get(slot.job_id) || { total: 0, accepted: 0 };
    current.total += 1;
    if (["accepted", "in_progress", "completed"].includes((slot.status || "").toLowerCase().trim())) {
      current.accepted += 1;
    }
    slotCounts.set(slot.job_id, current);
  }

  const merged = sortStaffJobsNearestFirst(
    slots
      .map((slot: any) => {
        const job = jobsById.get(slot.job_id) as { scheduled_for?: string | null; notes?: string | null; property_id?: string } | undefined;
        if (!job) return null;
        const counts = slotCounts.get(slot.job_id) || { total: 0, accepted: 0 };
        return {
          slot,
          job,
          jobDate: job.scheduled_for || extractCheckoutDate(job.notes || null),
          acceptedSlots: counts.accepted,
          totalSlots: counts.total,
        };
      })
      .filter((item: any): item is {
        slot: any;
        job: { scheduled_for?: string | null; notes?: string | null; property_id?: string };
        jobDate: string | null;
        acceptedSlots: number;
        totalSlots: number;
      } => Boolean(item))
  );

  const propertyIds = [...new Set(merged.map((item: any) => item.job.property_id).filter(Boolean))];

  return {
    account,
    warning: memberRows.length > 1 ? "Your profile is linked to more than one cleaner account. This page is using the first linked account right now." : null,
    jobs: merged,
    checklistItems,
    ...(await loadPropertySupport(propertyIds)),
  };
}

async function loadGroundsDashboard(profileId: string) {
  const { data: memberships, error: membershipError } = await serviceClient
    .from("grounds_account_members")
    .select("id, grounds_account_id, profile_id, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true });

  if (membershipError) throw new Error(membershipError.message);

  const memberRows = memberships ?? [];
  if (memberRows.length === 0) {
    return {
      account: null,
      warning: "Your grounds login is not linked to a grounds account yet. Ask admin to connect your profile to a grounds account.",
      jobs: [],
      properties: [],
      accessRows: [],
      sops: [],
      sopImages: [],
    };
  }

  const accountIds = memberRows.map((member: { grounds_account_id: string }) => member.grounds_account_id);
  const { data: accounts, error: accountsError } = await serviceClient
    .from("grounds_accounts")
    .select("*")
    .in("id", accountIds);

  if (accountsError) throw new Error(accountsError.message);

  const account =
    (accounts ?? []).find((row: { id: string }) => row.id === memberRows[0].grounds_account_id) ||
    accounts?.[0] ||
    null;

  if (!account) {
    return {
      account: null,
      warning: "Your grounds account record could not be found. Ask admin to reconnect your grounds access.",
      jobs: [],
      properties: [],
      accessRows: [],
      sops: [],
      sopImages: [],
    };
  }

  const { data: accountSlots, error: slotError } = await serviceClient
    .from("grounds_job_slots")
    .select("id, job_id, slot_number, grounds_account_id, status, offered_at, accepted_at, declined_at, expires_at, accepted_by_profile_id, declined_by_profile_id, created_at, updated_at")
    .eq("grounds_account_id", account.id)
    .order("created_at", { ascending: false });

  if (slotError) throw new Error(slotError.message);

  const slots = accountSlots ?? [];
  if (slots.length === 0) {
    return {
      account,
      warning: memberRows.length > 1 ? "Your profile is linked to more than one grounds account. This page is using the first linked grounds account right now." : null,
      jobs: [],
      ...(await loadPropertySupport([])),
    };
  }

  const jobIds = [...new Set(slots.map((slot: { job_id: string }) => slot.job_id))];
  const [jobsRes, allSlotsRes] = await Promise.all([
    serviceClient
      .from("grounds_jobs")
      .select("id, property_id, status, notes, created_at, offered_at, accepted_at, declined_at, scheduled_for, staffing_status, grounds_units_needed, grounds_units_required_strict, show_team_status_to_grounds, needs_secure_access, needs_garage_access, job_type")
      .in("id", jobIds),
    serviceClient
      .from("grounds_job_slots")
      .select("id, job_id, status")
      .in("job_id", jobIds),
  ]);

  if (jobsRes.error) throw new Error(jobsRes.error.message);
  if (allSlotsRes.error) throw new Error(allSlotsRes.error.message);

  const jobsById = new Map((jobsRes.data ?? []).map((job: { id: string }) => [job.id, job]));
  const slotCounts = new Map<string, { total: number; accepted: number }>();

  for (const slot of allSlotsRes.data ?? []) {
    const current = slotCounts.get(slot.job_id) || { total: 0, accepted: 0 };
    current.total += 1;
    if ((slot.status || "").toLowerCase().trim() === "accepted") current.accepted += 1;
    slotCounts.set(slot.job_id, current);
  }

  const merged = sortStaffJobsNearestFirst(
    slots
      .map((slot: any) => {
        const job = jobsById.get(slot.job_id) as { scheduled_for?: string | null; notes?: string | null; property_id?: string } | undefined;
        if (!job) return null;
        const counts = slotCounts.get(slot.job_id) || { total: 0, accepted: 0 };
        return {
          slot,
          job,
          jobDate: job.scheduled_for || extractCheckoutDate(job.notes || null),
          acceptedSlots: counts.accepted,
          totalSlots: counts.total,
        };
      })
      .filter((item): item is {
        slot: any;
        job: { scheduled_for?: string | null; notes?: string | null; property_id?: string };
        jobDate: string | null;
        acceptedSlots: number;
        totalSlots: number;
      } => Boolean(item))
  );

  const propertyIds = [...new Set(merged.map((item: any) => item.job.property_id).filter(Boolean))];

  return {
    account,
    warning: memberRows.length > 1 ? "Your profile is linked to more than one grounds account. This page is using the first linked grounds account right now." : null,
    jobs: merged,
    ...(await loadPropertySupport(propertyIds)),
  };
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "").trim() : "";
    const portal = new URL(request.url).searchParams.get("portal");

    if (!token) {
      return Response.json({ ok: false, error: "Missing authorization header." }, { status: 401 });
    }

    if (portal !== "cleaner" && portal !== "grounds") {
      return Response.json({ ok: false, error: "Unknown staff portal." }, { status: 400 });
    }

    const { profile } = await getSignedInProfile(token);
    const data = portal === "cleaner" ? await loadCleanerDashboard(profile.id) : await loadGroundsDashboard(profile.id);

    return Response.json({
      ok: true,
      profile,
      ...data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load staff dashboard.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
