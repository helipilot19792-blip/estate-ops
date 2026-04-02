import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            } catch {
              // Route handlers can ignore this if cookies cannot be set here
            }
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: currentProfile, error: currentProfileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (currentProfileError || !currentProfile || currentProfile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const profileId = body?.profileId as string | undefined;

    if (!profileId) {
      return NextResponse.json({ error: "Missing profileId." }, { status: 400 });
    }

    if (profileId === user.id) {
      return NextResponse.json(
        { error: "You cannot permanently delete your own account." },
        { status: 400 }
      );
    }

    const adminCountRes = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if (adminCountRes.error) {
      return NextResponse.json(
        { error: adminCountRes.error.message },
        { status: 500 }
      );
    }

    const { data: targetProfile, error: targetProfileError } = await supabase
      .from("profiles")
      .select("id, role, email, full_name")
      .eq("id", profileId)
      .single();

    if (targetProfileError || !targetProfile) {
      return NextResponse.json({ error: "User profile not found." }, { status: 404 });
    }

    if (targetProfile.role === "admin" && (adminCountRes.count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "You cannot delete the last admin." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Missing server environment variables." },
        { status: 500 }
      );
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const acceptedClear = await service
      .from("turnover_job_slots")
      .update({ accepted_by_profile_id: null })
      .eq("accepted_by_profile_id", profileId);

    if (acceptedClear.error) {
      return NextResponse.json(
        { error: acceptedClear.error.message },
        { status: 500 }
      );
    }

    const declinedClear = await service
      .from("turnover_job_slots")
      .update({ declined_by_profile_id: null })
      .eq("declined_by_profile_id", profileId);

    if (declinedClear.error) {
      return NextResponse.json(
        { error: declinedClear.error.message },
        { status: 500 }
      );
    }

    const membershipDelete = await service
      .from("cleaner_account_members")
      .delete()
      .eq("profile_id", profileId);

    if (membershipDelete.error) {
      return NextResponse.json(
        { error: membershipDelete.error.message },
        { status: 500 }
      );
    }

    const profileDelete = await service.from("profiles").delete().eq("id", profileId);

    if (profileDelete.error) {
      return NextResponse.json(
        { error: profileDelete.error.message },
        { status: 500 }
      );
    }

    const authDelete = await service.auth.admin.deleteUser(profileId);

    if (authDelete.error) {
      return NextResponse.json(
        { error: authDelete.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: `Deleted ${targetProfile.full_name || targetProfile.email || "user"} permanently.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
export {};
