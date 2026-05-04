"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

function getSupabaseInviteError() {
  if (typeof window === "undefined" || !window.location.hash) return "";

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const errorCode = hashParams.get("error_code");
  const errorDescription = hashParams.get("error_description");

  if (!errorCode && !errorDescription) return "";

  if (errorCode === "otp_expired") {
    return "This owner invite link is expired or has already been used. Please request a fresh owner login link, or resend the owner invite from admin.";
  }

  return errorDescription || "We could not confirm this owner invite link.";
}

export default function OwnerWelcomePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingPassword, setSavingPassword] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [requestingFreshLink, setRequestingFreshLink] = useState(false);
  const [hasInviteSession, setHasInviteSession] = useState(false);
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
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadOwnerContext() {
      setLoading(true);
      setError("");
      setStatusMessage("");

      const expectedFromQuery =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("owner_email")?.trim().toLowerCase() || ""
          : "";
      const inviteLinkError = getSupabaseInviteError();
      const tokenHash =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("token_hash")?.trim() || ""
          : "";
      const tokenType =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("type")?.trim() || "magiclink"
          : "magiclink";

      setExpectedOwnerEmail(expectedFromQuery);

      if (tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: tokenType as any,
        });

        if (verifyError) {
          if (!cancelled) {
            setError(
              verifyError.message ||
                "This owner login link could not be confirmed. Please request a fresh link."
            );
            setLoading(false);
          }
          return;
        }

        if (typeof window !== "undefined") {
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("token_hash");
          cleanUrl.searchParams.delete("type");
          window.history.replaceState(null, "", cleanUrl.toString());
        }
      }

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
      setHasInviteSession(!!accessToken);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (!cancelled) {
          setError(
            inviteLinkError ||
              "We could not confirm your invite session. Please open the newest link from your email again."
          );
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
  }, []);

  const passwordReady = useMemo(() => {
    return password.trim().length >= 8 && password === confirmPassword;
  }, [password, confirmPassword]);

  const ownerMatched = !!ownerAccount;
  const wrongSignedInUser =
    !!expectedOwnerEmail && !!signedInEmail && expectedOwnerEmail !== signedInEmail;
  const canUseSetupActions = ownerMatched && hasInviteSession && !wrongSignedInUser;

  async function handleSetPassword() {
    if (!hasInviteSession) {
      setError("This owner invite session is not active anymore. Please request a fresh owner login link, then set the password from the newest email.");
      return;
    }

    if (wrongSignedInUser) {
      setError("This browser is signed in under a different email than the owner invite. Please sign out and open the invite with the invited email.");
      return;
    }

    if (!ownerMatched) {
      setError("Please use the correct invited email before setting a password.");
      return;
    }

    if (!passwordReady) {
      setError("Use a password with at least 8 characters, and make sure both fields match.");
      return;
    }

    if (!acceptedTerms) {
      setError("Please accept the testing terms and privacy policy before setting a password.");
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

    await supabase.auth.signOut();

    const loginEmail = ownerAccount?.email || expectedOwnerEmail || signedInEmail || "";
    router.replace(
      `/owner/login?message=password_set${loginEmail ? `&email=${encodeURIComponent(loginEmail)}` : ""}`
    );
  }

  async function handleContinue() {
    if (!hasInviteSession) {
      setError("Please request a fresh owner login link before continuing.");
      return;
    }

    if (!ownerMatched) {
      setError("We could not match this session to an owner account yet.");
      return;
    }

    if (!acceptedTerms) {
      setError("Please accept the testing terms and privacy policy before continuing.");
      return;
    }

    setContinuing(true);
    router.push("/owner");
  }

async function handleSignOut() {
  setSigningOut(true);
  await supabase.auth.signOut();
  setSigningOut(false);
  router.replace("/owner/login");
}

async function handleFreshLoginLink() {
  const loginEmail = expectedOwnerEmail || ownerAccount?.email || signedInEmail || "";
  const loginSig =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("sig")?.trim() || ""
      : "";

  if (!loginEmail) {
    router.replace("/owner/login");
    return;
  }

  setRequestingFreshLink(true);
  setError("");
  setStatusMessage("");
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch("/api/owner/fresh-link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token
        ? {
            Authorization: `Bearer ${session.access_token}`,
          }
        : {}),
    },
    body: JSON.stringify({
      email: loginEmail,
      sig: loginSig,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    setError(
      `${payload?.error || "Could not send a fresh owner login link."} If this keeps happening, resend the owner invite from admin first.`
    );
    setRequestingFreshLink(false);
    return;
  }

  const deliveryId = payload?.emailId ? ` Delivery ID: ${payload.emailId}.` : "";
  setStatusMessage(`Fresh owner login link sent to ${loginEmail}.${deliveryId} Open the newest email, then set the password from that link.`);
  setRequestingFreshLink(false);
}

  if (loading) {
    return (
      <main className="owner-shell min-h-screen px-4 py-8 text-[#f7f1e8] sm:px-6">
        <div className="owner-card mx-auto max-w-3xl rounded-[32px] border border-white/8 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
          <div className="text-sm text-[#e6d8bf]">Confirming your owner access...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="owner-shell min-h-screen px-4 py-8 text-[#f7f1e8] sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="owner-hero rounded-[32px] border border-white/8 px-6 py-7 shadow-[0_24px_80px_rgba(0,0,0,0.36)] sm:px-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-[#e7c98a]">
            Gulera OS Owner Portal
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#f7f1e8] sm:text-4xl">
            Welcome{ownerAccount?.full_name ? `, ${ownerAccount.full_name}` : ""}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#e6d8bf]">
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

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleFreshLoginLink()}
                disabled={requestingFreshLink}
                className="rounded-full bg-[#b08b47] px-4 py-2 text-xs font-semibold text-[#17120d] transition hover:brightness-110 disabled:opacity-60"
              >
                {requestingFreshLink ? "Sending link..." : "Email me a fresh link"}
              </button>
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

        <section className="owner-card rounded-[28px] border border-white/8 p-5 sm:p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">Owner Access</div>
          <h2 className="mt-2 text-xl font-semibold text-[#f7f1e8]">Set your password or log in</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#e6d8bf]">
            Start here. If this is your first time, set a password from the newest email link.
            If your password is already set, go straight to owner login.
          </p>
          {!hasInviteSession ? (
            <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
              Password setup needs an active email-link session. Click "Email me a fresh link" above, then open the newest email.
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[#e7c98a]">New password</label>
              <div className="owner-field mt-2 flex rounded-2xl border border-white/8 focus-within:border-[#b08b47]">
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
                  className="rounded-r-2xl px-4 text-sm font-medium text-[#e6d8bf]"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[#e7c98a]">Confirm password</label>
              <div className="owner-field mt-2 flex rounded-2xl border border-white/8 focus-within:border-[#b08b47]">
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
                  className="rounded-r-2xl px-4 text-sm font-medium text-[#e6d8bf]"
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </div>

          <label className="mt-5 flex gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-[#e6d8bf]">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[#b08b47]"
            />
            <span>
              I understand Gulera OS is in testing and agree to the{" "}
              <Link href="/terms" className="font-semibold text-[#e7c98a] underline">
                Terms
              </Link>
              ,{" "}
              <Link href="/privacy" className="font-semibold text-[#e7c98a] underline">
                Privacy Policy
              </Link>
              , and{" "}
              <Link href="/cookies" className="font-semibold text-[#e7c98a] underline">
                Cookie Notice
              </Link>
              .
            </span>
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleSetPassword()}
              disabled={savingPassword || !canUseSetupActions}
              className="rounded-full bg-[#b08b47] px-5 py-2.5 text-sm font-semibold text-[#17120d] transition hover:brightness-110 disabled:opacity-60"
            >
              {savingPassword ? "Saving..." : "Set Password"}
            </button>

            <button
              type="button"
              onClick={() => void handleContinue()}
              disabled={continuing || !canUseSetupActions}
              className="rounded-full border border-white/12 px-5 py-2.5 text-sm font-semibold text-[#f7f1e8] transition hover:bg-white/[0.05] disabled:opacity-60"
            >
              {continuing ? "Opening..." : "Continue to Dashboard"}
            </button>

            <button
              type="button"
              onClick={() => {
                const loginEmail = expectedOwnerEmail || ownerAccount?.email || signedInEmail || "";
                router.push(`/owner/login${loginEmail ? `?email=${encodeURIComponent(loginEmail)}` : ""}`);
              }}
              className="rounded-full border border-[#b08b47]/50 px-5 py-2.5 text-sm font-semibold text-[#f7f1e8] transition hover:bg-[#b08b47]/10"
            >
              Already have a password? Log in
            </button>
          </div>
        </section>

        <section className="owner-card rounded-[28px] border border-white/8 p-5 sm:p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">Confirmed Account</div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-[#e6d8bf]">Signed-in email</div>
              <div className="mt-1 text-lg font-semibold text-[#f7f1e8]">
                {signedInEmail || "Unknown"}
              </div>
            </div>

            <div>
              <div className="text-sm text-[#e6d8bf]">Invite email</div>
              <div className="mt-1 text-lg font-semibold text-[#f7f1e8]">
                {expectedOwnerEmail || ownerAccount?.email || "Unknown"}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">Assigned Properties</div>
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
                    <div className="mt-1 text-sm text-[#e6d8bf]">
                      {getCityFromAddress(property.address) || property.address || "Location unavailable"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-[#e6d8bf]">
                  No properties are linked yet.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
