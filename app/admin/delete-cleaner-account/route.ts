import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { cleanerAccountId } = await req.json();

    if (!cleanerAccountId) {
      return NextResponse.json(
        { error: "Missing cleanerAccountId" },
        { status: 400 }
      );
    }

    // 1. Remove any members linked to this cleaner account
    const { error: membersError } = await supabase
      .from("cleaner_account_members")
      .delete()
      .eq("cleaner_account_id", cleanerAccountId);

    if (membersError) {
      return NextResponse.json(
        { error: membersError.message },
        { status: 500 }
      );
    }

    // 2. Delete the cleaner account itself
    const { error: accountError } = await supabase
      .from("cleaner_accounts")
      .delete()
      .eq("id", cleanerAccountId);

    if (accountError) {
      return NextResponse.json(
        { error: accountError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 }
    );
  }
}