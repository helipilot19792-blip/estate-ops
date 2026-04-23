"use client";
export const dynamic = "force-dynamic";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type InviteRow = {
  id: string;
  organization_id: string;
  email: string;
  full_name: string | null;
  phone?: string | null;
  role: "cleaner" | "grounds" | "owner" | "admin";
  status: "pending" | "sent" | "accepted" | "revoked" | "expired";
  token: string;
  invited_by_profile_id: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  expires_at: string | null;
  created_at: string;
};

type ProfileUpdate = {
  role?: string;
  phone?: string | null;
  full_name?: string | null;
};

type CleanerAccountRow = {
  id: string;
  organization_id?: string | null;
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type GroundsAccountRow = {
  id: string;
  organization_id?: string | null;
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

function getDestinationForRole(role: InviteRow["role"]) {
  switch (role) {
    case "cleaner":
      return "/cleaner";
    case "grounds":
      return "/grounds";
    case "owner":
      return "/owner";
    case "admin":
      return "/admin";
    default:
      return "/login";
  }
}

function InvitePageContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() || "", [searchParams]);

  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [inviteChecked, setInviteChecked] = useState(false);
  const [completingInvite, setCompletingInvite] = useState(false);
  const [inviteAccepted, setInviteAccepted] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loadingSignup, setLoadingSignup] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadInvite() {
    setError("");
    setMessage("");
    setInvite(null);

    if (!token) {
      setError("This invite link is missing a token.");
      setInviteChecked(true);
      return;
    }

    setLoadingInvite(true);

    try {
      const response = await fetch("/api/invite/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error || "This invite link is invalid or no longer exists.");
        setInviteChecked(true);
        return;
      }

      const data = payload?.invite as InviteRow | null;

      if (!data) {
        setError("This invite link is invalid or no longer exists.");
        setInviteChecked(true);
        return;
      }

      if (data.status === "revoked") {
        setError("This invite has been revoked.");
        setInviteChecked(true);
        return;
      }

      if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
        setError("This invite has expired.");
        setInviteChecked(true);
        return;
      }

      setInvite(data);
      setEmail(data.email || "");
      setInviteChecked(true);

      if (data.status === "accepted") {
        setInviteAccepted(true);
        setMessage("This invite has already been accepted.");
      }
    } finally {
      setLoadingInvite(false);
    }
  }

  async function ensureCleanerMembership(userId: string, inviteData: InviteRow) {
    const { data: existingMembership, error: membershipLookupError } = await supabase
      .from("cleaner_account_members")
      .select("id, cleaner_account_id")
      .eq("profile_id", userId)
      .limit(1)
      .maybeSingle();

    if (membershipLookupError) {
      throw new Error(membershipLookupError.message);
    }

    if (existingMembership) {
      return;
    }

    const displayName =
      inviteData.full_name?.trim() ||
      inviteData.email ||
      "Cleaner account";

    const { data: existingAccount, error: existingAccountError } = await supabase
      .from("cleaner_accounts")
      .select("id, organization_id, email")
      .eq("organization_id", inviteData.organization_id)
      .eq("email", inviteData.email)
      .limit(1)
      .maybeSingle<CleanerAccountRow>();

    if (existingAccountError) {
      throw new Error(existingAccountError.message);
    }

    let cleanerAccountId = existingAccount?.id || null;

    if (!cleanerAccountId) {
      const { data: insertedAccount, error: insertAccountError } = await supabase
        .from("cleaner_accounts")
        .insert({
          organization_id: inviteData.organization_id,
          display_name: displayName,
          email: inviteData.email,
          phone: inviteData.phone ?? null,
          active: true,
        })
        .select("id")
        .single<CleanerAccountRow>();

      if (insertAccountError || !insertedAccount) {
        throw new Error(insertAccountError?.message || "Could not create cleaner account.");
      }

      cleanerAccountId = insertedAccount.id;
    }

    const { error: memberInsertError } = await supabase
      .from("cleaner_account_members")
      .insert({
        cleaner_account_id: cleanerAccountId,
        profile_id: userId,
      });

    if (memberInsertError) {
      throw new Error(memberInsertError.message);
    }
  }

  async function ensureGroundsMembership(userId: string, inviteData: InviteRow) {
    const { data: existingMembership, error: membershipLookupError } = await supabase
      .from("grounds_account_members")
      .select("id, grounds_account_id")
      .eq("profile_id", userId)
      .limit(1)
      .maybeSingle();

    if (membershipLookupError) {
      throw new Error(membershipLookupError.message);
    }

    if (existingMembership) {
      return;
    }

    const displayName =
      inviteData.full_name?.trim() ||
      inviteData.email ||
      "Grounds account";

    const { data: existingAccount, error: existingAccountError } = await supabase
      .from("grounds_accounts")
      .select("id, organization_id, email")
      .eq("organization_id", inviteData.organization_id)
      .eq("email", inviteData.email)
      .limit(1)
      .maybeSingle<GroundsAccountRow>();

    if (existingAccountError) {
      throw new Error(existingAccountError.message);
    }

    let groundsAccountId = existingAccount?.id || null;

    if (!groundsAccountId) {
      const { data: insertedAccount, error: insertAccountError } = await supabase
        .from("grounds_accounts")
        .insert({
          organization_id: inviteData.organization_id,
          display_name: displayName,
          email: inviteData.email,
          phone: inviteData.phone ?? null,
          active: true,
        })
        .select("id")
        .single<GroundsAccountRow>();

      if (insertAccountError || !insertedAccount) {
        throw new Error(insertAccountError?.message || "Could not create grounds account.");
      }

      groundsAccountId = insertedAccount.id;
    }

    const { error: memberInsertError } = await supabase
      .from("grounds_account_members")
      .insert({
        grounds_account_id: groundsAccountId,
        profile_id: userId,
      });

    if (memberInsertError) {
      throw new Error(memberInsertError.message);
    }
  }

  async function completeInviteForSignedInUser(inviteData: InviteRow) {
    if (!token) return;
    if (completingInvite) return;
    if (inviteAccepted) return;

    setCompletingInvite(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        setError(userError.message);
        return;
      }

      if (!user) {
        return;
      }

      const userEmail = user.email?.trim().toLowerCase() || "";
      const inviteEmail = inviteData.email.trim().toLowerCase();

      if (!userEmail || userEmail !== inviteEmail) {
        setError("You are signed in with a different email than the invite.");
        return;
      }

      const { data: existingOrgMembership, error: membershipLookupError } = await supabase
        .from("organization_members")
        .select("organization_id, profile_id")
        .eq("organization_id", inviteData.organization_id)
        .eq("profile_id", user.id)
        .maybeSingle();

      if (membershipLookupError) {
        setError(membershipLookupError.message);
        return;
      }

      if (!existingOrgMembership) {
        const { error: insertMembershipError } = await supabase
          .from("organization_members")
          .insert({
            organization_id: inviteData.organization_id,
            profile_id: user.id,
            role: inviteData.role,
          });

        if (insertMembershipError) {
          setError(insertMembershipError.message);
          return;
        }
      }

      const profileUpdates: ProfileUpdate = {
        role: inviteData.role,
      };

      if (inviteData.phone) {
        profileUpdates.phone = inviteData.phone;
      }

      if (inviteData.full_name) {
        profileUpdates.full_name = inviteData.full_name;
      }

      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update(profileUpdates)
        .eq("id", user.id);

      if (profileUpdateError) {
        setError(profileUpdateError.message);
        return;
      }

      if (inviteData.role === "cleaner") {
        await ensureCleanerMembership(user.id, inviteData);
      }

      if (inviteData.role === "grounds") {
        await ensureGroundsMembership(user.id, inviteData);
      }

      const { error: inviteUpdateError } = await supabase
        .from("organization_invites")
        .update({
          accepted_at: new Date().toISOString(),
          status: "accepted",
        })
        .eq("id", inviteData.id);

      if (inviteUpdateError) {
        setError(inviteUpdateError.message);
        return;
      }

      setInviteAccepted(true);
      setMessage("Your account has been connected to the organization.");
      setInvite({
        ...inviteData,
        status: "accepted",
        accepted_at: new Date().toISOString(),
      });
    } catch (err: any) {
      setError(err?.message || "Could not finish invite acceptance.");
    } finally {
      setCompletingInvite(false);
    }
  }

  useEffect(() => {
    void loadInvite();
  }, [token]);

  useEffect(() => {
    if (!inviteChecked || !invite) return;
    if (invite.status === "accepted") return;
    void completeInviteForSignedInUser(invite);
  }, [inviteChecked, invite]);

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!invite) {
      setError("No valid invite was loaded.");
      return;
    }

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    if (email.trim().toLowerCase() !== invite.email.trim().toLowerCase()) {
      setError("This email does not match the invite.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoadingSignup(true);

    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/invite?token=${token}`,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      setMessage(
        "Account created. Check your email to confirm your account. After confirmation, you will be connected to the organization automatically."
      );
    } finally {
      setLoadingSignup(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f3ee] px-4 py-8 text-[#241c15]">
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-[34px] border border-[#e7ddd0] bg-white shadow-[0_30px_70px_rgba(0,0,0,0.08)]">
          <section className="bg-[linear-gradient(135deg,#1f1812_0%,#2a2119_55%,#3a2c1d_100%)] px-6 py-8 text-white md:px-10 md:py-10">
            <div className="max-w-xl">
              <div className="mb-6 rounded-[22px] bg-white px-5 py-5 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                <Image
                  src="/guleraoslogo.png"
                  alt="Gulera OS"
                  width={420}
                  height={180}
                  className="mx-auto h-auto w-full max-w-[300px]"
                  priority
                />
              </div>

              <div className="mb-2 text-xs uppercase tracking-[0.32em] text-[#d8c7ab]">
                Gulera OS
              </div>

              <h1 className="text-3xl font-semibold tracking-tight">You’ve been invited</h1>

              <p className="mt-3 text-sm leading-7 text-[#e7dccb] md:text-base">
                Use your invite link to create your account and join the correct company workspace.
              </p>
            </div>
          </section>

          <section className="px-5 py-6 md:px-10 md:py-10">
            {error ? (
              <div className="mb-4 rounded-[20px] border border-[#e7c6c1] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2e22] shadow-sm">
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="mb-4 rounded-[20px] border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-3 text-sm text-[#5f5245] shadow-sm">
                {message}
              </div>
            ) : null}

            {loadingInvite ? (
              <div className="space-y-4">
                <p className="text-sm text-[#6f6255]">Checking invite...</p>
              </div>
            ) : null}

            {!loadingInvite && !inviteChecked ? (
              <div className="space-y-4">
                <p className="text-sm text-[#6f6255]">Ready to verify this invite link.</p>

                <button
                  type="button"
                  onClick={loadInvite}
                  className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-3 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]"
                >
                  Check Invite
                </button>
              </div>
            ) : null}

            {invite ? (
              <div className="space-y-6">
                <div className="rounded-[24px] border border-[#e7ddd0] bg-[#fcfaf7] p-5">
                  <div className="text-sm text-[#8a7b68]">Invited email</div>
                  <div className="mt-1 text-base font-medium text-[#241c15]">{invite.email}</div>

                  <div className="mt-4 text-sm text-[#8a7b68]">Role</div>
                  <div className="mt-1 text-base font-medium capitalize text-[#241c15]">
                    {invite.role}
                  </div>

                  {invite.full_name ? (
                    <>
                      <div className="mt-4 text-sm text-[#8a7b68]">Invite name</div>
                      <div className="mt-1 text-base font-medium text-[#241c15]">
                        {invite.full_name}
                      </div>
                    </>
                  ) : null}

                  {invite.phone ? (
                    <>
                      <div className="mt-4 text-sm text-[#8a7b68]">Phone</div>
                      <div className="mt-1 text-base font-medium text-[#241c15]">
                        {invite.phone}
                      </div>
                    </>
                  ) : null}
                </div>

                {inviteAccepted ? (
                  <div className="rounded-[24px] border border-[#d8c7ab] bg-[#fcfaf7] p-5">
                    <div className="text-base font-medium text-[#241c15]">
                      Your invite has been accepted.
                    </div>
                    <div className="mt-2 text-sm text-[#6f6255]">
                      Continue to your workspace.
                    </div>

                    <div className="mt-4">
                      <Link
                        href={getDestinationForRole(invite.role)}
                        className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-3 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]"
                      >
                        Continue
                      </Link>
                    </div>
                  </div>
                ) : null}

                {!inviteAccepted ? (
                  <form onSubmit={handleCreateAccount} className="space-y-3">
                    <input
                      className="w-full rounded-[20px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                      type="email"
                      placeholder="Email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />

                    <div className="relative">
                      <input
                        className="w-full rounded-[20px] border border-[#d9ccbb] bg-white px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                        type={showPassword ? "text" : "password"}
                        placeholder="Password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7b68] hover:text-[#241c15]"
                        onClick={() => setShowPassword((prev) => !prev)}
                      >
                        👁
                      </button>
                    </div>

                    <input
                      className="w-full rounded-[20px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                      type={showPassword ? "text" : "password"}
                      placeholder="Confirm password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={loadingSignup || completingInvite}
                        className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-3 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loadingSignup
                          ? "Creating account..."
                          : completingInvite
                            ? "Connecting account..."
                            : "Create Account"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            ) : null}

            <div className="mt-8 text-sm text-[#7f7263]">
              <Link href="/login" className="underline underline-offset-2">
                Back to login
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
export default function InvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f7f3ee]" />}>
      <InvitePageContent />
    </Suspense>
  );
}
