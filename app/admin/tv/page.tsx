"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, Monitor, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { supabase } from "@/lib/supabase";

type Property = {
  id: string;
  name: string | null;
  address: string | null;
  default_checkout_time?: string | null;
};

type CleanerAccount = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type CleanerAccountMember = {
  cleaner_account_id: string;
  profile_id: string;
};

type GroundsAccount = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type GroundsAccountMember = {
  grounds_account_id: string;
  profile_id: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type Job = {
  id: string;
  property_id: string;
  notes: string | null;
  scheduled_for?: string | null;
  cleaner_units_needed: number;
  cleaner_units_required_strict: boolean;
};

type JobSlot = {
  job_id: string;
  cleaner_account_id: string | null;
  status: string;
  offered_at?: string | null;
};

type GroundsJob = {
  id: string;
  property_id: string;
  scheduled_for?: string | null;
  job_type: string | null;
};

type GroundsJobSlot = {
  job_id: string;
  grounds_account_id: string | null;
  status: string;
};

type PropertyBookingEvent = {
  id: string;
  property_id: string;
  source: string | null;
  guest_count?: number | null;
  checkin_date: string;
  checkout_date: string;
};

type MaintenanceFlagRow = {
  id: string;
  property_id?: string | null;
  status?: string | null;
  resolved_at?: string | null;
  urgency?: string | null;
  priority?: string | null;
  severity?: string | null;
};

type DashboardPayload = {
  properties?: Property[];
  cleanerAccounts?: CleanerAccount[];
  cleanerAccountMembers?: CleanerAccountMember[];
  groundsAccounts?: GroundsAccount[];
  groundsAccountMembers?: GroundsAccountMember[];
  profiles?: Array<{
    role?: string | null;
    profiles?:
      | {
          id: string;
          email: string | null;
          full_name: string | null;
        }
      | Array<{
          id: string;
          email: string | null;
          full_name: string | null;
        }>
      | null;
  }>;
  jobs?: Job[];
  jobSlots?: JobSlot[];
  groundsJobs?: GroundsJob[];
  groundsJobSlots?: GroundsJobSlot[];
  propertyBookingEvents?: PropertyBookingEvent[];
  maintenanceFlags?: MaintenanceFlagRow[];
};

type TodayCard = {
  id: string;
  propertyName: string;
  staffLabel: string;
};

type WaitingCard = {
  id: string;
  propertyName: string;
  overdue: boolean;
};

type OccupiedCard = {
  id: string;
  propertyName: string;
  guestCountLabel: string;
  checkoutLabel: string;
};

type CheckInCard = {
  id: string;
  propertyName: string;
  dateLabel: string;
  sourceLabel: string;
  guestCountLabel: string;
};

type FlagCard = {
  id: string;
  propertyName: string;
  urgencyLabel: string;
};

function ymdToLocalDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatDateLabel(dateString: string) {
  return formatLongDate(ymdToLocalDate(dateString));
}

function formatTimeLabel(value?: string | null) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{2}):(\d{2})$/);
  if (!match) return "";

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "";

  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function extractCheckoutDate(notes: string | null) {
  if (!notes) return null;

  const checkoutMatch = notes.match(/check(?:-|\s)?out[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (checkoutMatch?.[1]) return checkoutMatch[1];

  const dateMatch = notes.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return dateMatch?.[1] || null;
}

function getBookingSourceLabel(source?: string | null) {
  const normalized = String(source || "").trim().toLowerCase();
  if (!normalized) return "Calendar";
  if (normalized === "airbnb") return "Airbnb";
  if (normalized === "vrbo") return "VRBO";
  if (normalized === "booking" || normalized === "booking.com") return "Booking.com";
  return normalized.toUpperCase();
}

function getGroundsJobLabel(value?: string | null) {
  const labels: Record<string, string> = {
    lawn_cut: "Lawn Cut",
    yard_cleanup: "Yard Cleanup",
    garbage_out: "Garbage Out",
    recycling_out: "Recycling Out",
    yard_waste_out: "Yard Waste Out",
    bulk_pickup_out: "Bulk Pickup Out",
    snow_clear: "Snow Clear",
    salt: "Salt / Ice",
    exterior_check: "Exterior Check",
    storm_cleanup: "Storm Cleanup",
    other: "Grounds",
  };

  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "Grounds";
  return labels[normalized] || normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function getFirstName(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const beforeEmail = raw.includes("@") ? raw.split("@")[0] : raw;
  const token = beforeEmail
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .find(Boolean);

  if (!token) return "";
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function formatGuestCountLabel(guestCount?: number | null) {
  const count = Number(guestCount);
  if (Number.isFinite(count) && count > 0) {
    return `${count} guest${count === 1 ? "" : "s"}`;
  }

  return "Guest count not listed";
}

function getResponseWindowHours(jobDate: string | null, now: Date) {
  if (!jobDate) return 8;
  const job = new Date(`${jobDate}T12:00:00`);
  const diffHours = (job.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (diffHours > 24 * 7) return 48;
  if (diffHours > 48) return 8;
  return 2;
}

function getDeadline(job: Job, firstOfferedAt: string | null | undefined, now: Date) {
  if (!firstOfferedAt) return null;
  const offered = new Date(firstOfferedAt);
  if (Number.isNaN(offered.getTime())) return null;
  const jobDate = job.scheduled_for || extractCheckoutDate(job.notes);
  const hours = getResponseWindowHours(jobDate, now);
  return new Date(offered.getTime() + hours * 60 * 60 * 1000);
}

function isMaintenanceFlagResolved(flag: MaintenanceFlagRow) {
  const state = String(flag.resolved_at ? "resolved" : flag.status || "open").toLowerCase();
  return state.includes("resolved") || state.includes("closed") || state.includes("done");
}

function TvBoard() {
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organizationId")?.trim() || "";
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTvBoard(showRefreshState: boolean) {
      if (!organizationId) {
        if (!cancelled) {
          setError("No organization selected. Open the TV screen from the admin menu.");
          setLoading(false);
        }
        return;
      }

      if (showRefreshState) setRefreshing(true);
      else setLoading(true);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error("No active admin session was found.");
        }

        const response = await fetch(
          `/api/admin/dashboard-data?organizationId=${encodeURIComponent(organizationId)}`,
          {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );
        const nextPayload = await response.json().catch(() => null);

        if (!response.ok || !nextPayload?.ok) {
          throw new Error(nextPayload?.error || "Could not load the TV dashboard.");
        }

        if (!cancelled) {
          setPayload((nextPayload.data || {}) as DashboardPayload);
          setError("");
          setLastLoadedAt(new Date());
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load the TV dashboard.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void loadTvBoard(false);
    const intervalId = window.setInterval(() => {
      void loadTvBoard(true);
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [organizationId]);

  const profiles = useMemo(() => {
    return ((payload?.profiles ?? []) as NonNullable<DashboardPayload["profiles"]>).flatMap((member) => {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      if (!profile) return [];
      return [{ id: profile.id, email: profile.email, full_name: profile.full_name } satisfies ProfileRow];
    });
  }, [payload]);

  const properties = useMemo(() => payload?.properties ?? [], [payload?.properties]);
  const cleanerAccounts = useMemo(() => payload?.cleanerAccounts ?? [], [payload?.cleanerAccounts]);
  const cleanerAccountMembers = useMemo(
    () => payload?.cleanerAccountMembers ?? [],
    [payload?.cleanerAccountMembers]
  );
  const groundsAccounts = useMemo(() => payload?.groundsAccounts ?? [], [payload?.groundsAccounts]);
  const groundsAccountMembers = useMemo(
    () => payload?.groundsAccountMembers ?? [],
    [payload?.groundsAccountMembers]
  );
  const jobs = useMemo(() => payload?.jobs ?? [], [payload?.jobs]);
  const jobSlots = useMemo(() => payload?.jobSlots ?? [], [payload?.jobSlots]);
  const groundsJobs = useMemo(() => payload?.groundsJobs ?? [], [payload?.groundsJobs]);
  const groundsJobSlots = useMemo(() => payload?.groundsJobSlots ?? [], [payload?.groundsJobSlots]);
  const propertyBookingEvents = useMemo(
    () => payload?.propertyBookingEvents ?? [],
    [payload?.propertyBookingEvents]
  );
  const maintenanceFlags = useMemo(() => payload?.maintenanceFlags ?? [], [payload?.maintenanceFlags]);

  const propertyById = useMemo(
    () => new Map(properties.map((property) => [property.id, property])),
    [properties]
  );

  const cleanerProfileByAccountId = useMemo(() => {
    const map = new Map<string, ProfileRow>();
    for (const member of cleanerAccountMembers) {
      const profile = profiles.find((item) => item.id === member.profile_id);
      if (profile && !map.has(member.cleaner_account_id)) {
        map.set(member.cleaner_account_id, profile);
      }
    }
    return map;
  }, [cleanerAccountMembers, profiles]);

  const groundsProfileByAccountId = useMemo(() => {
    const map = new Map<string, ProfileRow>();
    for (const member of groundsAccountMembers) {
      const profile = profiles.find((item) => item.id === member.profile_id);
      if (profile && !map.has(member.grounds_account_id)) {
        map.set(member.grounds_account_id, profile);
      }
    }
    return map;
  }, [groundsAccountMembers, profiles]);

  const jobSlotsByJobId = useMemo(() => {
    const map = new Map<string, JobSlot[]>();
    for (const slot of jobSlots) {
      const current = map.get(slot.job_id) || [];
      current.push(slot);
      map.set(slot.job_id, current);
    }
    return map;
  }, [jobSlots]);

  const groundsSlotsByJobId = useMemo(() => {
    const map = new Map<string, GroundsJobSlot[]>();
    for (const slot of groundsJobSlots) {
      const current = map.get(slot.job_id) || [];
      current.push(slot);
      map.set(slot.job_id, current);
    }
    return map;
  }, [groundsJobSlots]);

  const now = useMemo(() => lastLoadedAt ?? new Date(), [lastLoadedAt]);
  const todayYmd = useMemo(() => now.toISOString().slice(0, 10), [now]);

  const getCleanerFirstName = useCallback((cleanerAccountId: string | null) => {
    if (!cleanerAccountId) return "";

    const account = cleanerAccounts.find((item) => item.id === cleanerAccountId);
    const profile = cleanerProfileByAccountId.get(cleanerAccountId);
    return (
      getFirstName(account?.display_name) ||
      getFirstName(profile?.full_name) ||
      getFirstName(account?.email) ||
      getFirstName(profile?.email)
    );
  }, [cleanerAccounts, cleanerProfileByAccountId]);

  const getGroundsFirstName = useCallback((groundsAccountId: string | null) => {
    if (!groundsAccountId) return "";

    const account = groundsAccounts.find((item) => item.id === groundsAccountId);
    const profile = groundsProfileByAccountId.get(groundsAccountId);
    return (
      getFirstName(account?.display_name) ||
      getFirstName(profile?.full_name) ||
      getFirstName(account?.email) ||
      getFirstName(profile?.email)
    );
  }, [groundsAccounts, groundsProfileByAccountId]);

  const cleaningCards = useMemo<TodayCard[]>(() => {
    return jobs
      .filter((job) => (job.scheduled_for || extractCheckoutDate(job.notes)) === todayYmd)
      .map((job) => {
        const slots = jobSlotsByJobId.get(job.id) || [];
        const acceptedNames = Array.from(
          new Set(
            slots
              .filter((slot) => ["accepted", "in_progress", "completed"].includes(String(slot.status || "").toLowerCase()))
              .map((slot) => getCleanerFirstName(slot.cleaner_account_id))
              .filter(Boolean)
          )
        );

        let staffLabel = "Cleaner: unassigned";
        if (acceptedNames.length > 0) {
          staffLabel = `Cleaner: ${acceptedNames.join(", ")}`;
        } else if (slots.some((slot) => String(slot.status || "").toLowerCase() === "offered")) {
          staffLabel = "Cleaner: waiting";
        }

        return {
          id: `cleaning-${job.id}`,
          propertyName: propertyById.get(job.property_id)?.name || "Unknown property",
          staffLabel,
        };
      })
      .sort((a, b) => a.propertyName.localeCompare(b.propertyName));
  }, [getCleanerFirstName, jobSlotsByJobId, jobs, propertyById, todayYmd]);

  const groundsCards = useMemo<TodayCard[]>(() => {
    return groundsJobs
      .filter((job) => job.scheduled_for === todayYmd)
      .map((job) => {
        const slots = groundsSlotsByJobId.get(job.id) || [];
        const acceptedNames = Array.from(
          new Set(
            slots
              .filter((slot) => ["accepted", "in_progress", "completed"].includes(String(slot.status || "").toLowerCase()))
              .map((slot) => getGroundsFirstName(slot.grounds_account_id))
              .filter(Boolean)
          )
        );

        return {
          id: `grounds-${job.id}`,
          propertyName: propertyById.get(job.property_id)?.name || "Unknown property",
          staffLabel:
            acceptedNames.length > 0
              ? `${getGroundsJobLabel(job.job_type)}: ${acceptedNames.join(", ")}`
              : `${getGroundsJobLabel(job.job_type)}: unassigned`,
        };
      })
      .sort((a, b) => a.propertyName.localeCompare(b.propertyName));
  }, [getGroundsFirstName, groundsJobs, groundsSlotsByJobId, propertyById, todayYmd]);

  const waitingCards = useMemo<WaitingCard[]>(() => {
    return jobs
      .filter((job) => {
        const slots = jobSlotsByJobId.get(job.id) || [];
        const offered = slots.filter((slot) => String(slot.status || "").toLowerCase() === "offered").length;
        if (offered === 0) return false;

        const acceptedLike = slots.filter((slot) =>
          ["accepted", "in_progress", "completed"].includes(String(slot.status || "").toLowerCase())
        ).length;
        const needed = job.cleaner_units_needed || Math.max(slots.length, 1);
        return job.cleaner_units_required_strict ? acceptedLike < needed : acceptedLike === 0;
      })
      .map((job) => {
        const slots = jobSlotsByJobId.get(job.id) || [];
        const firstOffered = slots
          .filter((slot) => String(slot.status || "").toLowerCase() === "offered")
          .sort((a, b) => new Date(a.offered_at || 0).getTime() - new Date(b.offered_at || 0).getTime())[0];
        const deadline = getDeadline(job, firstOffered?.offered_at, now);

        return {
          id: `waiting-${job.id}`,
          propertyName: propertyById.get(job.property_id)?.name || "Unknown property",
          overdue: !!deadline && deadline.getTime() < now.getTime(),
        };
      })
      .sort((a, b) => a.propertyName.localeCompare(b.propertyName));
  }, [jobSlotsByJobId, jobs, now, propertyById]);

  const occupiedCards = useMemo<OccupiedCard[]>(() => {
    return propertyBookingEvents
      .filter((event) => event.checkin_date <= todayYmd && event.checkout_date > todayYmd)
      .map((event) => {
        const property = propertyById.get(event.property_id);
        const checkoutTime = formatTimeLabel(property?.default_checkout_time);
        return {
          id: `occupied-${event.id}`,
          propertyName: property?.name || "Unknown property",
          guestCountLabel: formatGuestCountLabel(event.guest_count),
          checkoutLabel: `Out ${formatDateLabel(event.checkout_date)}${checkoutTime ? ` at ${checkoutTime}` : ""}`,
        };
      })
      .sort((a, b) => a.propertyName.localeCompare(b.propertyName));
  }, [propertyBookingEvents, propertyById, todayYmd]);

  const upcomingCheckIns = useMemo<CheckInCard[]>(() => {
    return propertyBookingEvents
      .filter((event) => event.checkin_date >= todayYmd)
      .sort((a, b) => {
        const aName = propertyById.get(a.property_id)?.name || "";
        const bName = propertyById.get(b.property_id)?.name || "";
        return a.checkin_date.localeCompare(b.checkin_date) || aName.localeCompare(bName);
      })
      .slice(0, 6)
      .map((event) => ({
        id: `checkin-${event.id}`,
        propertyName: propertyById.get(event.property_id)?.name || "Unknown property",
        dateLabel: event.checkin_date === todayYmd ? "Today" : formatDateLabel(event.checkin_date),
        sourceLabel: getBookingSourceLabel(event.source),
        guestCountLabel: formatGuestCountLabel(event.guest_count),
      }));
  }, [propertyBookingEvents, propertyById, todayYmd]);

  const openFlags = useMemo<FlagCard[]>(() => {
    return maintenanceFlags
      .filter((flag) => !isMaintenanceFlagResolved(flag))
      .slice(0, 6)
      .map((flag) => ({
        id: `flag-${flag.id}`,
        propertyName: propertyById.get(flag.property_id || "")?.name || "Unknown property",
        urgencyLabel: String(flag.urgency || flag.priority || flag.severity || "open")
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase()),
      }));
  }, [maintenanceFlags, propertyById]);

  const stats = [
    { label: "Cleaning", value: cleaningCards.length },
    { label: "Grounds", value: groundsCards.length },
    { label: "Occupied", value: occupiedCards.length },
    { label: "Check-ins", value: upcomingCheckIns.length },
    { label: "Awaiting", value: waitingCards.length },
    { label: "Flags", value: openFlags.length },
  ];
  const visibleCleaningCards = cleaningCards.slice(0, 3);
  const visibleGroundsCards = groundsCards.slice(0, 3);
  const visibleOccupiedCards = occupiedCards.slice(0, 2);
  const visibleCheckInCards = upcomingCheckIns.slice(0, 4);
  const visibleWaitingCards = waitingCards.slice(0, 3);
  const visibleFlagCards = openFlags.slice(0, 3);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8] px-6 text-center text-[#334155]">
        <div>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
            <Monitor className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-3xl font-semibold text-[#0f172a]">Preparing TV view</h1>
          <p className="mt-2 text-lg text-[#64748b]">Loading today&apos;s sterilized operations board.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fff7ed] px-6">
        <div className="max-w-xl rounded-[28px] border border-[#fdba74] bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-12 w-12 text-[#c2410c]" />
          <h1 className="mt-4 text-3xl font-semibold text-[#7c2d12]">TV view unavailable</h1>
          <p className="mt-3 text-lg text-[#9a3412]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-[#eef2f6] px-4 py-4 text-[#0f172a] md:px-5 md:py-5">
      <div className="mx-auto grid h-full max-w-[1850px] grid-rows-[auto_minmax(0,1.05fr)_minmax(0,1fr)] gap-4">
        <section className="rounded-[28px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(240,249,255,0.96)_48%,rgba(240,253,244,0.96)_100%)] px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:px-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-2xl font-semibold tracking-tight text-[#0f172a] md:text-3xl">{formatLongDate(now)}</div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#dbe4ee] bg-white px-4 py-2 text-sm font-medium text-[#475569]">
                <Clock3 className="h-4 w-4" />
                <span>Updates every minute</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#dbe4ee] bg-white px-4 py-2 text-sm font-medium text-[#475569]">
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                <span>
                  {lastLoadedAt
                    ? `Last refresh ${lastLoadedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                    : "Refreshing"}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-[20px] border border-[#dbe4ee] bg-white/92 px-4 py-3 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#64748b]">{stat.label}</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight text-[#0f172a] md:text-4xl">{stat.value}</div>
              </div>
            ))}
            </div>
          </div>
        </section>

        <section className="grid min-h-0 gap-4 xl:grid-cols-2">
          <div className="rounded-[28px] border border-[#cfe1ff] bg-white px-5 py-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2563eb]">Cleaning</div>
                <h2 className="mt-1 text-2xl font-semibold md:text-3xl">Today&apos;s cleaning</h2>
              </div>
              <div className="rounded-full bg-[#e8f1ff] px-4 py-2 text-lg font-semibold text-[#2957a4]">
                {cleaningCards.length}
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {visibleCleaningCards.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[#bfdbfe] bg-[#f8fbff] px-5 py-7 text-center text-lg text-[#5f6f86]">
                  No cleaning jobs scheduled today.
                </div>
              ) : (
                visibleCleaningCards.map((card) => (
                  <article key={card.id} className="rounded-[22px] border border-[#b9d1fb] bg-[#f8fbff] px-5 py-4">
                    <div className="text-2xl font-semibold text-[#172554] md:text-3xl">{card.propertyName}</div>
                    <div className="mt-2 text-xl text-[#2957a4] md:text-2xl">{card.staffLabel}</div>
                  </article>
                ))
              )}
              {cleaningCards.length > visibleCleaningCards.length ? (
                <div className="text-right text-sm font-semibold text-[#5f6f86]">
                  +{cleaningCards.length - visibleCleaningCards.length} more
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#bde7cf] bg-white px-5 py-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#15803d]">Grounds</div>
                <h2 className="mt-1 text-2xl font-semibold md:text-3xl">Today&apos;s grounds</h2>
              </div>
              <div className="rounded-full bg-[#ecfdf5] px-4 py-2 text-lg font-semibold text-[#166534]">
                {groundsCards.length}
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {visibleGroundsCards.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[#bbdfc0] bg-[#f0fbf2] px-5 py-7 text-center text-lg text-[#476a50]">
                  No grounds work scheduled today.
                </div>
              ) : (
                visibleGroundsCards.map((card) => (
                  <article key={card.id} className="rounded-[22px] border border-[#bbdfc0] bg-[#f0fbf2] px-5 py-4">
                    <div className="text-2xl font-semibold text-[#14532d] md:text-3xl">{card.propertyName}</div>
                    <div className="mt-2 text-xl text-[#166534] md:text-2xl">{card.staffLabel}</div>
                  </article>
                ))
              )}
              {groundsCards.length > visibleGroundsCards.length ? (
                <div className="text-right text-sm font-semibold text-[#476a50]">
                  +{groundsCards.length - visibleGroundsCards.length} more
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid min-h-0 gap-4 xl:grid-cols-4">
          <div className="rounded-[28px] border border-[#dbe4ee] bg-white px-5 py-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#64748b]">Occupied</div>
                <h2 className="mt-1 text-xl font-semibold md:text-2xl">In house</h2>
              </div>
              <div className="rounded-full bg-[#f8fafc] px-4 py-2 text-base font-semibold text-[#334155]">
                {occupiedCards.length}
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {visibleOccupiedCards.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[#dbe4ee] bg-[#f8fafc] px-4 py-6 text-center text-base text-[#64748b]">
                  No occupied properties today.
                </div>
              ) : (
                visibleOccupiedCards.map((card) => (
                  <article key={card.id} className="rounded-[22px] border border-[#dbe4ee] bg-[#f8fafc] px-4 py-4">
                    <div className="text-xl font-semibold md:text-2xl">{card.propertyName}</div>
                    <div className="mt-2 text-base text-[#475569] md:text-lg">{card.guestCountLabel}</div>
                    <div className="mt-1 text-base text-[#475569] md:text-lg">{card.checkoutLabel}</div>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#ddd6fe] bg-white px-5 py-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6d28d9]">Check-ins</div>
                <h2 className="mt-1 text-xl font-semibold md:text-2xl">Arrivals</h2>
              </div>
              <div className="rounded-full bg-[#f5f3ff] px-4 py-2 text-base font-semibold text-[#6d28d9]">
                {upcomingCheckIns.length}
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {visibleCheckInCards.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[#ddd6fe] bg-[#faf5ff] px-4 py-6 text-center text-base text-[#7c3aed]">
                  No upcoming check-ins.
                </div>
              ) : (
                visibleCheckInCards.map((card) => (
                  <article key={card.id} className="rounded-[22px] border border-[#ddd6fe] bg-[#faf5ff] px-4 py-4">
                    <div className="text-xl font-semibold text-[#4c1d95] md:text-2xl">{card.propertyName}</div>
                    <div className="mt-2 text-base text-[#6d28d9] md:text-lg">{card.dateLabel}</div>
                    <div className="mt-1 text-base text-[#6d28d9] md:text-lg">
                      {card.sourceLabel} | {card.guestCountLabel}
                    </div>
                  </article>
                ))
              )}
              {upcomingCheckIns.length > visibleCheckInCards.length ? (
                <div className="text-right text-sm font-semibold text-[#6d28d9]">
                  +{upcomingCheckIns.length - visibleCheckInCards.length} more
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#fde68a] bg-white px-5 py-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a16207]">Awaiting</div>
                <h2 className="mt-1 text-xl font-semibold md:text-2xl">Awaiting acceptance</h2>
              </div>
              <div className="rounded-full bg-[#fffbeb] px-4 py-2 text-base font-semibold text-[#a16207]">
                {waitingCards.length}
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {visibleWaitingCards.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[#fde68a] bg-[#fffbeb] px-4 py-6 text-center text-base text-[#946200]">
                  No waiting jobs right now.
                </div>
              ) : (
                visibleWaitingCards.map((card) => (
                  <article key={card.id} className="rounded-[22px] border border-[#fde68a] bg-[#fffbeb] px-4 py-4">
                    <div className="text-xl font-semibold text-[#713f12] md:text-2xl">{card.propertyName}</div>
                    <div className={`mt-2 text-base md:text-lg ${card.overdue ? "text-[#b91c1c]" : "text-[#a16207]"}`}>
                      {card.overdue ? "Overdue response needed" : "Waiting for acceptance"}
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#fecaca] bg-white px-5 py-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b91c1c]">Flags</div>
                <h2 className="mt-1 text-xl font-semibold md:text-2xl">Maintenance</h2>
              </div>
              <div className="rounded-full bg-[#fff1f2] px-4 py-2 text-base font-semibold text-[#b91c1c]">
                {openFlags.length}
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {visibleFlagCards.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[#fecaca] bg-[#fff1f2] px-4 py-6 text-center text-base text-[#b91c1c]">
                  No open maintenance flags.
                </div>
              ) : (
                visibleFlagCards.map((card) => (
                  <article key={card.id} className="rounded-[22px] border border-[#fecaca] bg-[#fff1f2] px-4 py-4">
                    <div className="text-xl font-semibold text-[#7f1d1d] md:text-2xl">{card.propertyName}</div>
                    <div className="mt-2 text-base text-[#b91c1c] md:text-lg">{card.urgencyLabel}</div>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function AdminTvPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8] px-6 text-center text-[#334155]">
          <div>
            <Monitor className="mx-auto h-10 w-10" />
            <p className="mt-4 text-lg">Loading TV view...</p>
          </div>
        </div>
      }
    >
      <TvBoard />
    </Suspense>
  );
}
