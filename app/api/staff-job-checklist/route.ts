import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing Supabase server environment variables." }, { status: 500 });
  }

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

    const body = await request.json().catch(() => null);
    const itemId = String(body?.itemId || "").trim();
    const completed = Boolean(body?.completed);
    if (!itemId) return NextResponse.json({ error: "Missing checklist item." }, { status: 400 });

    const authClient = createClient(supabaseUrl, publicSupabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: memberships, error: membershipError } = await service
      .from("cleaner_account_members")
      .select("cleaner_account_id")
      .eq("profile_id", user.id);
    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });

    const cleanerAccountIds = new Set((memberships ?? []).map((row: any) => row.cleaner_account_id).filter(Boolean));
    if (cleanerAccountIds.size === 0) {
      return NextResponse.json({ error: "This sign-in is not linked to a cleaner account." }, { status: 403 });
    }

    const { data: checklistItem, error: itemError } = await service
      .from("turnover_job_checklist_items")
      .select("id, slot_id, completed_at")
      .eq("id", itemId)
      .maybeSingle();
    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
    if (!checklistItem) return NextResponse.json({ error: "Checklist item was not found." }, { status: 404 });

    const { data: slot, error: slotError } = await service
      .from("turnover_job_slots")
      .select("id, cleaner_account_id")
      .eq("id", checklistItem.slot_id)
      .maybeSingle();
    if (slotError) return NextResponse.json({ error: slotError.message }, { status: 500 });
    if (!slot?.cleaner_account_id || !cleanerAccountIds.has(slot.cleaner_account_id)) {
      return NextResponse.json({ error: "This checklist item is not assigned to your cleaner account." }, { status: 403 });
    }

    const { data: updatedItem, error: updateError } = await service
      .from("turnover_job_checklist_items")
      .update({
        completed_at: completed ? new Date().toISOString() : null,
        completed_by_profile_id: completed ? user.id : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .select("*")
      .maybeSingle();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({ ok: true, item: updatedItem });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update checklist." },
      { status: 500 }
    );
  }
}
