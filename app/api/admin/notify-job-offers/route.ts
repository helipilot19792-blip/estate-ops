import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendJobOfferEmailsForSlots, type JobNotificationKind } from "@/lib/server/job-notifications";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "Missing access token." }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Missing server environment variables." },
        { status: 500 }
      );
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: currentProfile, error: currentProfileError } = await service
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (
      currentProfileError ||
      !currentProfile ||
      (currentProfile.role !== "admin" && currentProfile.role !== "platform_admin")
    ) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const kind = body?.kind as JobNotificationKind | undefined;
    const rawSlotIds: unknown[] = Array.isArray(body?.slotIds) ? body.slotIds : [];
    const slotIds: string[] = [...new Set(
      rawSlotIds.filter(
        (value: unknown): value is string => typeof value === "string" && value.trim().length > 0
      )
    )];

    if ((kind !== "cleaner" && kind !== "grounds") || slotIds.length === 0) {
      return NextResponse.json(
        { error: "Missing valid kind or slotIds." },
        { status: 400 }
      );
    }

    const slotTable = kind === "cleaner" ? "turnover_job_slots" : "grounds_job_slots";
    const jobTable = kind === "cleaner" ? "turnover_jobs" : "grounds_jobs";

    const { data: slotRows, error: slotRowsError } = await (service
      .from(slotTable as any)
      .select("id, job_id")
      .in("id", slotIds)) as any;

    if (slotRowsError) {
      return NextResponse.json({ error: slotRowsError.message }, { status: 500 });
    }

    const foundSlotIds = new Set((slotRows ?? []).map((row: any) => row.id));
    if (foundSlotIds.size !== slotIds.length) {
      return NextResponse.json(
        { error: "One or more job slots could not be found." },
        { status: 404 }
      );
    }

    const rawJobIds: string[] = (slotRows ?? [])
      .map((row: any) => row.job_id)
      .filter((value: unknown): value is string => typeof value === "string" && value.length > 0);
    const jobIds: string[] = [...new Set(rawJobIds)];
    const { data: jobs, error: jobsError } = await (service
      .from(jobTable as any)
      .select("id, organization_id")
      .in("id", jobIds)) as any;

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    const rawOrganizationIds: string[] = (jobs ?? [])
      .map((job: any) => job.organization_id)
      .filter((value: unknown): value is string => typeof value === "string" && value.length > 0);
    const organizationIds: string[] = [...new Set(rawOrganizationIds)];
    const allowedOrganizationIds =
      currentProfile.role === "platform_admin"
        ? new Set<string>(organizationIds)
        : new Set<string>();

    if (currentProfile.role !== "platform_admin") {
      const { data: memberships, error: membershipsError } = await service
        .from("organization_members")
        .select("organization_id, role")
        .eq("profile_id", user.id)
        .eq("role", "admin")
        .in("organization_id", organizationIds);

      if (membershipsError) {
        return NextResponse.json({ error: membershipsError.message }, { status: 500 });
      }

      for (const membership of memberships ?? []) {
        allowedOrganizationIds.add(membership.organization_id);
      }

      if (allowedOrganizationIds.size !== organizationIds.length) {
        return NextResponse.json(
          { error: "You do not have access to notify one or more of these job slots." },
          { status: 403 }
        );
      }
    }

    const result = await sendJobOfferEmailsForSlots(kind, slotIds, req.nextUrl.origin, {
      allowedOrganizationIds,
    });

    return NextResponse.json({
      success: true,
      kind,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      { status: 500 }
    );
  }
}

export {};
