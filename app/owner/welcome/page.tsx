"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type OwnerAccountRow = {
  id: string;
  email: string;
  full_name: string | null;
  profile_id?: string | null;
  invite_sent_at?: string | null;
  invite_accepted_at?: string | null;
  is_active: boolean;
};

type OwnerPropertyAccessRow = {
  id: string;
  owner_account_id: string;
  property_id: string;
};

type PropertyRow = {
  id: string;
  name: string | null;
  address: string | null;
};

function getCityFromAddress(address?: string | null) {
  if (!address) return "";
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return address;
}

export default function OwnerWelcomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [savingPassword, setSavingPassword] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [signedInEmail, setSignedInEmail] = useState("");
  const [expectedOwnerEmail, setExpectedOwnerEmail] = useState("");
  const [ownerAccount, setOwnerAccount] = useState<OwnerAccountRow | null>(null);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadOwnerContext() {
      setLoading(true);
      setError("");
      setStatusMessage("");

      const expectedFromQuery = searchParams.get("owner_email")?.trim().toLowerCase() || "";
      setExpectedOwnerEmail(expectedFromQuery);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        if (!cancelled) {
          setError(sessionError.message);
          setLoading(false);
        }
        return;
      }

      const accessToken = session?.access_token;

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (!cancelled) {
          setError("We could not confirm your invite session. Please open the link from your email again.");
          setLoading(false);
        }
        return;
      }

      const authEmail = user.email?.trim().toLowerCase() || "";
      setSignedInEmail(authEmail);

      const resolvedOwnerEmail =
        expectedFromQuery ||
        (typeof user.user_metadata?.owner_email === "string"
          ? user.user_metadata.owner_email.trim().toLowerCase()
          : "") ||
        authEmail;

      if (!resolvedOwnerEmail) {
        if (!cancelled) {
          setError("We could not determine which owner account this invite belongs to.");
          setLoading(false);
        }
        return;
      }

      const { data: owner, error: ownerError } = await supabase
        .from("owner_accounts")
        .select("*")
        .eq("email", resolvedOwnerEmail)
        .maybeSingle<OwnerAccountRow>();

      if (ownerError) {
        if (!cancelled) {
          setError(ownerError.message);
          setLoading(false);
        }
        return;
      }

      if (!owner) {
        if (!cancelled) {
          setOwnerAccount(null);
          setProperties([]);
          setError("No owner account was found for this invite email.");
          setLoading(false);
        }
        return;
      }

      const updates: Record<string, string | null> = {};

      if (!owner.profile_id) {
        updates.profile_id = user.id;
      }

      if (!owner.invite_accepted_at) {
        updates.invite_accepted_at = new Date().toISOString();
      }

      let finalOwner = owner;

      if (Object.keys(updates).length > 0) {
        const { data: updatedOwner, error: updateOwnerError } = await supabase
          .from("owner_accounts")
          .update(updates)
          .eq("id", owner.id)
          .select()
          .single<OwnerAccountRow>();

        if (updateOwnerError) {
          if (!cancelled) {
            setError(updateOwnerError.message);
            setLoading(false);
          }
          return;
        }

        finalOwner = updatedOwner;
      }

      const { data: accessRows, error: accessError } = (await supabase
        .from("owner_property_access")
        .select("*")
        .eq("owner_account_id", finalOwner.id)) as {
        data: OwnerPropertyAccessRow[] | null;
        error: { message: string } | null;
      };

      if (accessError) {
        if (!cancelled) {
          setError(accessError.message);
          setLoading(false);
        }
        return;
      }

      const propertyIds = (accessRows ?? []).map((row) => row.property_id);
      let linkedProperties: PropertyRow[] = [];

      if (propertyIds.length > 0) {
        const { data: propertyRows, error: propertyError } = await supabase
          .from("properties")
          .select("id,name,address")
          .in("id", propertyIds);

        if (propertyError) {
          if (!cancelled) {
            setError(propertyError.message);
            setLoading(false);
          }
          return;
        }

        linkedProperties = (propertyRows ?? []) as PropertyRow[];
      }

      if (!cancelled) {
        setOwnerAccount(finalOwner);
        setProperties(linkedProperties);
        setError("");

        if (authEmail && resolvedOwnerEmail && authEmail !== resolvedOwnerEmail) {
          setStatusMessage(
            `This invite is for ${resolvedOwnerEmail}, but this browser is currently signed in as ${authEmail}. Please sign out and use the invited email.`
          );
        } else if (accessToken) {
          setStatusMessage("Your access has been confirmed.");
        } else {
          setStatusMessage("");
        }

        setLoading(false);
      }
    }

    void loadOwnerContext();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const passwordReady = useMemo(() => {
    return password.trim().length >= 8 && password === confirmPassword;
  }, [password, confirmPassword]);

  const ownerMatched = !!ownerAccount;
  const wrongSignedInUser =
    !!expectedOwnerEmail && !!signedInEmail && expectedOwnerEmail !== signedInEmail;

  async function handleSetPassword() {
    if (!ownerMatched) {
      setError("Please use the correct invited email before setting a password.");
      return;
    }

    if (!passwordReady) {
      setError("Use a password with at least 8 characters, and make sure both fields match.");
      return;
    }

    setSavingPassword(true);
    setError("");
    setStatusMessage("");

    const { error: updateError } = await supabase.auth.updateUser({
      password: password.trim(),
    });

    if (updateError) {
      setError(updateError.message);
      setSavingPassword(false);
      return;
    }

    setSavingPassword(false);
    setPassword("");
    setConfirmPassword("");
    setStatusMessage("Password saved. You can now use email and password sign-in as well.");
  }

  async function handleContinue() {
    if (!ownerMatched) {
      setError("We could not match this session to an owner account yet.");
      return;
    }

    setContinuing(true);
    router.push("/owner");
  }

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
    window.location.reload();
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(176,139,71,0.14),transparent_28%),#0f0d0a] px-4 py-8 text-[#f7f1e8] sm:px-6">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-white/8 bg-[#15110d] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
          <div className="text-sm text-[#cdbda0]">Confirming your owner access...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(176,139,71,0.14),transparent_28%),#0f0d0a] px-4 py-8 text-[#f7f1e8] sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(23,18,13,0.98)_0%,rgba(14,11,8,1)_100%)] px-6 py-7 shadow-[0_24px_80px_rgba(0,0,0,0.36)] sm:px-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-[#bfa67b]">
            Gulera OS Owner Portal
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#f7f1e8] sm:text-4xl">
            Welcome{ownerAccount?.full_name ? `, ${ownerAccount.full_name}` : ""}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#cdbda0]">
            This is your private owner setup page where you can confirm your properties, set a
            password, and continue into your dashboard.
          </p>
        </section>

        {(error || wrongSignedInUser) ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-950/20 px-4 py-3 text-sm text-red-200">
            <div>{error || "This invite appears to be open under the wrong signed-in account."}</div>
            {(signedInEmail || expectedOwnerEmail) ? (
              <div className="mt-2 space-y-1 text-xs text-red-100/90">
                {expectedOwnerEmail ? <div>Invited email: {expectedOwnerEmail}</div> : null}
                {signedInEmail ? <div>Signed in as: {signedInEmail}</div> : null}
              </div>
            ) : null}

            <div className="mt-3">
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="rounded-full border border-white/12 px-4 py-2 text-xs font-semibold text-[#f7f1e8] transition hover:bg-white/[0.05] disabled:opacity-60"
              >
                {signingOut ? "Signing out..." : "Sign out and try again"}
              </button>
            </div>
          </div>
        ) : null}

        {statusMessage ? (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">
            {statusMessage}
          </div>
        ) : null}

        <section className="rounded-[28px] border border-white/8 bg-[#15110d] p-5 sm:p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-[#bfa67b]">Confirmed Account</div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-[#cdbda0]">Signed-in email</div>
              <div className="mt-1 text-lg font-semibold text-[#f7f1e8]">
                {signedInEmail || "Unknown"}
              </div>
            </div>

            <div>
              <div className="text-sm text-[#cdbda0]">Invite email</div>
              <div className="mt-1 text-lg font-semibold text-[#f7f1e8]">
                {expectedOwnerEmail || ownerAccount?.email || "Unknown"}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#bfa67b]">Assigned Properties</div>
            <div className="mt-3 space-y-3">
              {properties.length > 0 ? (
                properties.map((property) => (
                  <div
                    key={property.id}
                    className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4"
                  >
                    <div className="text-sm font-semibold text-[#f7f1e8]">
                      {property.name || "Property"}
                    </div>
                    <div className="mt-1 text-sm text-[#cdbda0]">
                      {getCityFromAddress(property.address) || property.address || "Location unavailable"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-[#cdbda0]">
                  No properties are linked yet.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/8 bg-[#15110d] p-5 sm:p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-[#bfa67b]">Set Password</div>
          <h2 className="mt-2 text-xl font-semibold text-[#f7f1e8]">Finish your setup</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#cdbda0]">
            Setting a password is recommended. It lets you sign in later without relying on an email
            link every time.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[#bfa67b]">New password</label>
              <div className="mt-2 flex rounded-2xl border border-white/8 bg-[#100c08] focus-within:border-[#b08b47]">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-l-2xl bg-transparent px-4 py-3 text-sm text-[#f7f1e8] outline-none"
                  placeholder="Minimum 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="rounded-r-2xl px-4 text-sm font-medium text-[#cdbda0]"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[#bfa67b]">Confirm password</label>
              <div className="mt-2 flex rounded-2xl border border-white/8 bg-[#100c08] focus-within:border-[#b08b47]">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-l-2xl bg-transparent px-4 py-3 text-sm text-[#f7f1e8] outline-none"
                  placeholder="Repeat password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="rounded-r-2xl px-4 text-sm font-medium text-[#cdbda0]"
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleSetPassword()}
              disabled={savingPassword || !ownerMatched}
              className="rounded-full bg-[#b08b47] px-5 py-2.5 text-sm font-semibold text-[#17120d] transition hover:brightness-110 disabled:opacity-60"
            >
              {savingPassword ? "Saving..." : "Set Password"}
            </button>

            <button
              type="button"
              onClick={() => void handleContinue()}
              disabled={continuing || !ownerMatched}
              className="rounded-full border border-white/12 px-5 py-2.5 text-sm font-semibold text-[#f7f1e8] transition hover:bg-white/[0.05] disabled:opacity-60"
            >
              {continuing ? "Opening..." : "Continue to Dashboard"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
