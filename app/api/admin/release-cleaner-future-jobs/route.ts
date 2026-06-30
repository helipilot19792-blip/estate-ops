import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendJobOfferDigestEmailForSlots, sendJobOfferEmailsForSlots } from "@/lib/server/job-notifications";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

type ReleaseMode = "reoffer_to_backups" | "leave_unassigned";
type NotifyMode = "digest" | "immediate" | "none";

function getTodayYmd() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function extractCheckoutDate(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/Checkout date:\s*(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

function getJobDate(job: any) {
  return job.scheduled_for || extractCheckoutDate(job.notes);
}

function getResponseWindowHours(jobDate: string | null) {
  if (!jobDate) return 8;

  const now = new Date();
  const job = new Date(jobDate + "T12:00:00");
  const diff = (job.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diff > 24 * 7) return 48;
  if (diff > 48) return 8;
  return 2;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return Response.json({ ok: false, error: "Missing access token." }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicSupabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !publicSupabaseKey) {
      return Response.json({ ok: false, error: "Missing Supabase auth environment variables." }, { status: 500 });
    }

    const authClient = createClient(supabaseUrl, publicSupabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return Response.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json();
    const cleanerAccountId = body?.cleanerAccountId;
    const mode: ReleaseMode = body?.mode || "reoffer_to_backups";
    const notifyMode: NotifyMode =
      body?.notifyMode === "immediate" ? "immediate" : body?.notifyMode === "none" ? "none" : "digest";

    if (!cleanerAccountId) {
      return Response.json({ ok: false, error: "Missing cleanerAccountId" }, { status: 400 });
    }

    const { data: slots, error: slotError } = await supabase
      .from("turnover_job_slots")
      .select("*")
      .eq("cleaner_account_id", cleanerAccountId)
      .eq("status", "accepted");

    if (slotError) throw slotError;

    if (!slots || slots.length === 0) {
      return Response.json({
        ok: true,
        affected: 0,
        reoffered: 0,
        stranded: 0,
        notificationResult: null,
        message: "No accepted jobs found",
      });
    }

    const jobIds = [...new Set(slots.map((s) => s.job_id))];

    const { data: jobs } = await supabase
      .from("turnover_jobs")
      .select("id, property_id, scheduled_for, notes")
      .in("id", jobIds);

    const jobsMap = new Map(jobs?.map((j) => [j.id, j]) || []);

    const today = getTodayYmd();

    const futureSlots = slots.filter((slot) => {
      const job = jobsMap.get(slot.job_id);
      const jobDate = job ? getJobDate(job) : null;
      return jobDate && jobDate >= today;
    });

    if (futureSlots.length === 0) {
      return Response.json({
        ok: true,
        affected: 0,
        reoffered: 0,
        stranded: 0,
        notificationResult: null,
        message: "No future jobs found",
      });
    }

    const { data: cleanerAccount, error: cleanerAccountError } = await supabase
      .from("cleaner_accounts")
      .select("id, organization_id")
      .eq("id", cleanerAccountId)
      .maybeSingle();

    if (cleanerAccountError) throw cleanerAccountError;
    if (!cleanerAccount?.organization_id) {
      return Response.json({ ok: false, error: "Cleaner account not found." }, { status: 404 });
    }

    const { data: currentProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!currentProfile || (currentProfile.role !== "admin" && currentProfile.role !== "platform_admin")) {
      return Response.json({ ok: false, error: "Admin access required." }, { status: 403 });
    }

    if (currentProfile.role !== "platform_admin") {
      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", cleanerAccount.organization_id)
        .eq("profile_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership) {
        return Response.json({ ok: false, error: "Admin access required for this organization." }, { status: 403 });
      }
    }

    const propertyIds = [...new Set(futureSlots.map((s) => jobsMap.get(s.job_id)?.property_id))];

    const { data: assignments } = await supabase
      .from("property_cleaner_account_assignments")
      .select("*")
      .in("property_id", propertyIds)
      .order("priority", { ascending: true });

    const assignmentMap = new Map<string, any[]>();

    for (const a of assignments || []) {
      if (!assignmentMap.has(a.property_id)) {
        assignmentMap.set(a.property_id, []);
      }
      assignmentMap.get(a.property_id)!.push(a);
    }

    let reoffered = 0;
    let stranded = 0;
    const reofferedSlotIds: string[] = [];

    for (const slot of futureSlots) {
      const job = jobsMap.get(slot.job_id);
      if (!job) continue;

      const jobDate = getJobDate(job);
      const responseHours = getResponseWindowHours(jobDate);

      let replacementCleanerId: string | null = null;

      if (mode === "reoffer_to_backups") {
        const assignmentsForProperty = assignmentMap.get(job.property_id) || [];

        for (const a of assignmentsForProperty) {
          if (a.cleaner_account_id !== cleanerAccountId) {
            replacementCleanerId = a.cleaner_account_id;
            break;
          }
        }
      }

      if (replacementCleanerId) {
        await supabase
          .from("turnover_job_slots")
          .update({
            cleaner_account_id: replacementCleanerId,
            status: "offered",
            offered_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + responseHours * 3600000).toISOString(),
            accepted_at: null,
            declined_at: null,
            accepted_by_profile_id: null,
            declined_by_profile_id: null,
            offer_email_sent_at: null,
            offer_reminder_sent_at: null,
            day_of_reminder_sent_at: null,
            offer_push_sent_at: null,
            offer_reminder_push_sent_at: null,
            day_of_reminder_push_sent_at: null,
          })
          .eq("id", slot.id);

        reoffered++;
        reofferedSlotIds.push(slot.id);
      } else {
        await supabase
          .from("turnover_job_slots")
          .update({
            cleaner_account_id: null,
            status: "stranded",
            accepted_at: null,
            declined_at: null,
            accepted_by_profile_id: null,
            declined_by_profile_id: null,
          })
          .eq("id", slot.id);

        stranded++;
      }
    }

    let notificationResult: Awaited<ReturnType<typeof sendJobOfferEmailsForSlots>> | Awaited<ReturnType<typeof sendJobOfferDigestEmailForSlots>> | null = null;
    if (reofferedSlotIds.length > 0 && notifyMode !== "none") {
      notificationResult =
        notifyMode === "digest"
          ? await sendJobOfferDigestEmailForSlots(
              "cleaner",
              reofferedSlotIds,
              new URL(req.url).origin,
              { subjectPrefix: "Backup" }
            )
          : await sendJobOfferEmailsForSlots(
              "cleaner",
              reofferedSlotIds,
              new URL(req.url).origin
            );
    }

    return Response.json({
      ok: true,
      affected: futureSlots.length,
      reoffered,
      stranded,
      notifyMode,
      notificationResult,
      notificationErrors: notificationResult?.errors ?? [],
    });
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
