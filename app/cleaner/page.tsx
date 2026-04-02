"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: "pending" | "cleaner" | "admin" | string;
  created_at: string | null;
};

type CleanerAccountMember = {
  id: string;
  cleaner_account_id: string;
  profile_id: string;
  created_at?: string | null;
};

type CleanerAccount = {
  id: string;
  display_name: string | null;
  email?: string | null;
  phone?: string | null;
  active?: boolean | null;
  created_at?: string | null;
};

type Property = {
  id: string;
  name: string | null;
  address: string | null;
  notes: string | null;
};

type TurnoverJob = {
  id: string;
  property_id: string;
  status: string | null;
  notes: string | null;
  created_at?: string | null;
  offered_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  scheduled_for?: string | null;
  staffing_status?: string | null;
  cleaner_units_needed?: number | null;
  cleaner_units_required_strict?: boolean | null;
  show_team_status_to_cleaners?: boolean | null;
};

type TurnoverJobSlot = {
  id: string;
  job_id: string;
  slot_number: number | null;
  cleaner_account_id: string | null;
  status: string | null;
  offered_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  expires_at?: string | null;
  accepted_by_profile_id?: string | null;
  declined_by_profile_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AccessRow = {
  id: string;
  property_id: string;
  door_code: string | null;
  alarm_code: string | null;
  notes: string | null;
};

type SopImage = {
  id: string;
  sop_id: string;
  image_url: string;
  caption: string | null;
  sort_order: number;
};

type Sop = {
  id: string;
  property_id: string;
  title: string | null;
  content: string | null;
  created_at?: string | null;
};

type CleanerJob = {
  slot: TurnoverJobSlot;
  job: TurnoverJob;
  jobDate: string | null;
  acceptedSlots: number;
  totalSlots: number;
};

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function toYmd(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthGrid(baseDate: Date) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startDay);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

function extractCheckoutDate(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/Checkout date:\s*(\d{4}-\d{2}-\d{2})/i);
  if (match?.[1]) return match[1];
  return null;
}

function formatDateLabel(dateString: string | null) {
  if (!dateString) return "Not set";
  const [year, month, day] = dateString.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTimeLabel(dateString: string | null | undefined) {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function getResponseWindowHours(jobDate: string | null, now: Date) {
  if (!jobDate) return 8;

  const job = new Date(`${jobDate}T12:00:00`);
  const diffHours = (job.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours > 24 * 7) return 48;
  if (diffHours > 48) return 8;
  return 2;
}

function getDeadline(item: CleanerJob, now: Date) {
  if (!item.slot.offered_at) return null;

  const offered = new Date(item.slot.offered_at);
  if (Number.isNaN(offered.getTime())) return null;

  const hours = getResponseWindowHours(item.jobDate, now);
  return new Date(offered.getTime() + hours * 60 * 60 * 1000);
}

function getTimeRemainingMs(item: CleanerJob, now: Date) {
  const deadline = getDeadline(item, now);
  if (!deadline) return null;
  return deadline.getTime() - now.getTime();
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const absSeconds = Math.abs(totalSeconds);

  const days = Math.floor(absSeconds / 86400);
  const hours = Math.floor((absSeconds % 86400) / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const seconds = absSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getCountdownTone(ms: number | null) {
  if (ms === null) return "text-[#e7c98a]";
  if (ms < 0) return "text-red-400";
  if (ms <= 2 * 60 * 60 * 1000) return "text-amber-300";
  return "text-[#e7c98a]";
}

function getSlotDisplayStatus(
  slotStatus: string | null | undefined,
  staffingStatus: string | null | undefined
) {
  const slot = (slotStatus || "").toLowerCase().trim();
  const staffing = (staffingStatus || "").toLowerCase().trim();

  if (slot === "accepted") {
    if (staffing === "fully_staffed") return "Accepted • fully staffed";
    if (staffing === "partially_filled") return "Accepted • waiting on team";
    if (staffing === "ready") return "Accepted • ready to proceed";
    return "Accepted";
  }

  if (slot === "offered") {
    if (staffing === "stranded") return "Urgent • stranded";
    return "Waiting for your response";
  }

  if (slot === "declined") return "Declined";
  if (slot === "stranded") return "Stranded";
  return slotStatus || "Unknown";
}

function getStatusTone(slotStatus: string | null | undefined, staffingStatus: string | null | undefined) {
  const slot = (slotStatus || "").toLowerCase().trim();
  const staffing = (staffingStatus || "").toLowerCase().trim();

  if (slot === "accepted") {
    return {
      badge: "border border-emerald-400/30 bg-emerald-500/15 text-emerald-200",
      card:
        "border-emerald-500/25 bg-[linear-gradient(180deg,rgba(18,35,27,0.35)_0%,rgba(16,13,10,1)_100%)]",
      dot: "bg-emerald-400",
      selectedRing: "ring-2 ring-emerald-300/60",
    };
  }

  if (slot === "offered" || staffing === "stranded") {
    return {
      badge:
        "border border-red-400/70 bg-red-500 text-white shadow-[0_0_18px_rgba(239,68,68,0.35)] animate-pulse",
      card:
        "border-red-400/65 bg-[linear-gradient(180deg,rgba(92,20,20,0.78)_0%,rgba(24,18,14,1)_100%)] shadow-[0_0_34px_rgba(239,68,68,0.18)]",
      dot: "bg-red-400",
      selectedRing: "ring-2 ring-red-300/70",
    };
  }

  return {
    badge: "border border-[#7a5c2e]/30 bg-[#b08b47]/10 text-[#e7c98a]",
    card:
      "border-[#7a5c2e]/25 bg-[linear-gradient(180deg,rgba(27,21,16,0.95)_0%,rgba(16,13,10,1)_100%)]",
    dot: "bg-[#b08b47]",
    selectedRing: "ring-2 ring-[#b08b47]/60",
  };
}

function sortCleanerJobsNearestFirst(items: CleanerJob[]) {
  return [...items].sort((a, b) => {
    const aOffered = (a.slot.status || "").toLowerCase().trim() === "offered";
    const bOffered = (b.slot.status || "").toLowerCase().trim() === "offered";

    if (aOffered && !bOffered) return -1;
    if (!aOffered && bOffered) return 1;

    const aDate = a.jobDate ?? "9999-12-31";
    const bDate = b.jobDate ?? "9999-12-31";

    if (aDate !== bDate) return aDate.localeCompare(bDate);

    const aTime = a.slot.offered_at ?? a.job.created_at ?? "";
    const bTime = b.slot.offered_at ?? b.job.created_at ?? "";
    return bTime.localeCompare(aTime);
  });
}

function getTeamMessage(item: CleanerJob) {
  const needed = item.job.cleaner_units_needed ?? item.totalSlots ?? 1;
  const accepted = item.acceptedSlots;
  const strict = !!item.job.cleaner_units_required_strict;
  const show = item.job.show_team_status_to_cleaners !== false;
  const slotStatus = (item.slot.status || "").toLowerCase().trim();
  const staffing = (item.job.staffing_status || "").toLowerCase().trim();

  if (needed <= 1) {
    return slotStatus === "accepted" ? "Solo clean • you accepted this job" : "Solo clean";
  }

  if (!show) {
    return slotStatus === "accepted" ? "Team clean • you accepted this slot" : "Team clean";
  }

  if (strict) {
    if (slotStatus === "accepted" && staffing !== "fully_staffed") {
      const remaining = Math.max(needed - accepted, 0);
      return remaining > 0
        ? `Team clean • ${accepted} of ${needed} accepted • waiting on ${remaining} more`
        : `Team clean • ${accepted} of ${needed} accepted`;
    }

    if (staffing === "fully_staffed") {
      return `Team clean • ${accepted} of ${needed} accepted • fully staffed`;
    }

    if (staffing === "partially_filled") {
      return `Team clean • ${accepted} of ${needed} accepted`;
    }

    return `Team clean • ${needed} cleaners required`;
  }

  if (slotStatus === "accepted" && staffing === "ready" && accepted < needed) {
    return `Team clean • job can proceed • ${accepted} of ${needed} accepted`;
  }

  if (staffing === "fully_staffed") {
    return `Team clean • ${accepted} of ${needed} accepted • fully staffed`;
  }

  if (staffing === "ready") {
    return `Team clean • ready to proceed • ${accepted} of ${needed} accepted`;
  }

  if (staffing === "partially_filled") {
    return `Team clean • partially filled • ${accepted} of ${needed} accepted`;
  }

  return `Team clean • ${needed} cleaner slots`;
}

export default function CleanerPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [actionLoading, setActionLoading] = useState<"accept" | "decline" | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [cleanerAccount, setCleanerAccount] = useState<CleanerAccount | null>(null);

  const [properties, setProperties] = useState<Property[]>([]);
  const [cleanerJobs, setCleanerJobs] = useState<CleanerJob[]>([]);
  const [accessRows, setAccessRows] = useState<AccessRow[]>([]);
  const [sops, setSops] = useState<Sop[]>([]);
  const [sopImages, setSopImages] = useState<SopImage[]>([]);

  const [pageError, setPageError] = useState<string | null>(null);
  const [accountWarning, setAccountWarning] = useState<string | null>(null);
  const [jobsWarning, setJobsWarning] = useState<string | null>(null);
  const [sopsWarning, setSopsWarning] = useState<string | null>(null);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [jobsCollapsed, setJobsCollapsed] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const selectedJobPanelRef = useRef<HTMLElement | null>(null);
  const jobsSectionRef = useRef<HTMLElement | null>(null);
  const hasAutoSelectedInitialJob = useRef(false);
  const realtimeRefreshTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadPage() {
      try {
        setLoading(true);
        setPageError(null);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          router.replace("/login");
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, email, full_name, phone, role, created_at")
          .eq("id", user.id)
          .single();

        if (profileError) throw profileError;
        if (!mounted) return;

        setProfile(profileData);

        if (profileData.role === "admin") {
          router.replace("/admin");
          return;
        }

        const accountData = await loadCleanerAccount(profileData.id);
        if (!mounted) return;

        setCleanerAccount(accountData.account);
        setAccountWarning(accountData.warning);

        if (!accountData.account) {
          setProperties([]);
          setCleanerJobs([]);
          setAccessRows([]);
          setSops([]);
          setSopImages([]);
          return;
        }

        const loadedCleanerJobs = await loadCleanerJobs(accountData.account.id);
        if (!mounted) return;
        setCleanerJobs(loadedCleanerJobs);

        const propertyIds = [...new Set(loadedCleanerJobs.map((item) => item.job.property_id))];
        const loadedProperties = await loadProperties(propertyIds);
        if (!mounted) return;
        setProperties(loadedProperties);

        const loadedAccess = await loadAccess(propertyIds);
        if (!mounted) return;
        setAccessRows(loadedAccess);

        const { sopRows, sopImageRows } = await loadSops(propertyIds);
        if (!mounted) return;
        setSops(sopRows);
        setSopImages(sopImageRows);
      } catch (error: any) {
        if (!mounted) return;
        setPageError(error?.message || "Something went wrong loading the cleaner dashboard.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadPage();

    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedSlotId) return;

    const timer = window.setTimeout(() => {
      selectedJobPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [selectedSlotId]);

useEffect(() => {
  if (!cleanerAccount?.id) return;

  const slotChannel = supabase
    .channel(`cleaner-slot-live-${cleanerAccount.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "turnover_job_slots",
      },
      () => {
        if (realtimeRefreshTimeoutRef.current) {
          window.clearTimeout(realtimeRefreshTimeoutRef.current);
        }

        realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
          void refreshCleanerJobs();
        }, 200);
      }
    )
    .subscribe();

  const membershipChannel = profile?.id
    ? supabase
        .channel(`cleaner-membership-live-${profile.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "cleaner_account_members",
            filter: `profile_id=eq.${profile.id}`,
          },
          async () => {
            const accountData = await loadCleanerAccount(profile.id);
            setCleanerAccount(accountData.account);
            setAccountWarning(accountData.warning);

            if (accountData.account) {
              const loadedJobs = await loadCleanerJobs(accountData.account.id);
              setCleanerJobs(loadedJobs);
            } else {
              setCleanerJobs([]);
            }
          }
        )
        .subscribe()
    : null;

  return () => {
    if (realtimeRefreshTimeoutRef.current) {
      window.clearTimeout(realtimeRefreshTimeoutRef.current);
    }
    void supabase.removeChannel(slotChannel);
    if (membershipChannel) {
      void supabase.removeChannel(membershipChannel);
    }
  };
}, [cleanerAccount?.id, profile?.id]);
useEffect(() => {
  if (!cleanerAccount?.id) return;

  const interval = window.setInterval(() => {
    void refreshCleanerJobs();
  }, 15000);

  return () => window.clearInterval(interval);
}, [cleanerAccount?.id]);
      
    async function loadCleanerAccount(profileId: string): Promise<{
    account: CleanerAccount | null;
    warning: string | null;
  }> {
    try {
      const { data: membershipData, error: membershipError } = await supabase
        .from("cleaner_account_members")
        .select("id, cleaner_account_id, profile_id, created_at")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: true });

      if (membershipError) throw membershipError;

      const memberships = (membershipData ?? []) as CleanerAccountMember[];

      if (memberships.length === 0) {
        return {
          account: null,
          warning:
            "Your cleaner login is not linked to a cleaner account yet. Ask admin to connect your profile to a cleaner account.",
        };
      }

      const accountIds = memberships.map((m) => m.cleaner_account_id);

      const { data: accountsData, error: accountsError } = await supabase
        .from("cleaner_accounts")
        .select("*")
        .in("id", accountIds);

      if (accountsError) throw accountsError;

      const accounts = (accountsData ?? []) as CleanerAccount[];
      const primaryAccount = accounts.find((a) => a.id === memberships[0].cleaner_account_id) || accounts[0] || null;

      let warning: string | null = null;
      if (memberships.length > 1) {
        warning =
          "Your profile is linked to more than one cleaner account. This page is using the first linked account right now.";
      }

      return {
        account: primaryAccount,
        warning,
      };
    } catch (error: any) {
      return {
        account: null,
        warning: `Cleaner account could not be loaded yet. ${error?.message || ""}`.trim(),
      };
    }
  }

  async function loadProperties(propertyIds: string[]): Promise<Property[]> {
    if (propertyIds.length === 0) return [];

    const { data, error } = await supabase
      .from("properties")
      .select("id, name, address, notes")
      .in("id", propertyIds);

    if (error) throw error;

    return (data ?? []) as Property[];
  }

  async function loadCleanerJobs(cleanerAccountId: string): Promise<CleanerJob[]> {
    setJobsWarning(null);

    try {
      const { data: slotData, error: slotError } = await supabase
        .from("turnover_job_slots")
        .select(
          "id, job_id, slot_number, cleaner_account_id, status, offered_at, accepted_at, declined_at, expires_at, accepted_by_profile_id, declined_by_profile_id, created_at, updated_at"
        )
        .eq("cleaner_account_id", cleanerAccountId)
        .order("created_at", { ascending: false });

      if (slotError) throw slotError;

      const accountSlots = (slotData ?? []) as TurnoverJobSlot[];

      if (accountSlots.length === 0) {
        return [];
      }

      const jobIds = [...new Set(accountSlots.map((slot) => slot.job_id))];

      const { data: jobData, error: jobError } = await supabase
        .from("turnover_jobs")
        .select(
          "id, property_id, status, notes, created_at, offered_at, accepted_at, declined_at, scheduled_for, staffing_status, cleaner_units_needed, cleaner_units_required_strict, show_team_status_to_cleaners"
        )
        .in("id", jobIds);

      if (jobError) throw jobError;

      const jobs = (jobData ?? []) as TurnoverJob[];
      const jobsById = new Map(jobs.map((job) => [job.id, job]));

      const { data: allSlotData, error: allSlotError } = await supabase
        .from("turnover_job_slots")
        .select("id, job_id, status")
        .in("job_id", jobIds);

      if (allSlotError) throw allSlotError;

      const allSlots = (allSlotData ?? []) as Array<{ id: string; job_id: string; status: string | null }>;
      const slotCounts = new Map<string, { total: number; accepted: number }>();

      for (const slot of allSlots) {
        const current = slotCounts.get(slot.job_id) || { total: 0, accepted: 0 };
        current.total += 1;
        if ((slot.status || "").toLowerCase().trim() === "accepted") {
          current.accepted += 1;
        }
        slotCounts.set(slot.job_id, current);
      }

      const merged: CleanerJob[] = accountSlots
        .map((slot) => {
          const job = jobsById.get(slot.job_id);
          if (!job) return null;

          const counts = slotCounts.get(slot.job_id) || { total: 0, accepted: 0 };

          return {
            slot,
            job,
            jobDate: job.scheduled_for || extractCheckoutDate(job.notes),
            acceptedSlots: counts.accepted,
            totalSlots: counts.total,
          };
        })
        .filter((item): item is CleanerJob => Boolean(item));

      return sortCleanerJobsNearestFirst(merged);
    } catch (error: any) {
      setJobsWarning(`Jobs could not be loaded yet. ${error?.message || ""}`.trim());
      return [];
    }
  }

  async function loadAccess(propertyIds: string[]): Promise<AccessRow[]> {
    if (propertyIds.length === 0) return [];

    try {
      const { data, error } = await supabase
        .from("property_access")
        .select("id, property_id, door_code, alarm_code, notes")
        .in("property_id", propertyIds);

      if (error) throw error;

      return (data ?? []) as AccessRow[];
    } catch {
      return [];
    }
  }

  async function loadSops(
    propertyIds: string[]
  ): Promise<{ sopRows: Sop[]; sopImageRows: SopImage[] }> {
    setSopsWarning(null);

    if (propertyIds.length === 0) {
      return { sopRows: [], sopImageRows: [] };
    }

    try {
      const { data: sopData, error: sopError } = await supabase
        .from("property_sops")
        .select("id, property_id, title, content, created_at")
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false });

      if (sopError) throw sopError;

      const sopRows = (sopData ?? []) as Sop[];

      if (sopRows.length === 0) {
        return { sopRows, sopImageRows: [] };
      }

      const sopIds = sopRows.map((sop) => sop.id);

      const { data: imageData, error: imageError } = await supabase
        .from("property_sop_images")
        .select("id, sop_id, image_url, caption, sort_order")
        .in("sop_id", sopIds)
        .order("sort_order", { ascending: true });

      if (imageError) throw imageError;

      return {
        sopRows,
        sopImageRows: (imageData ?? []) as SopImage[],
      };
    } catch (error: any) {
      setSopsWarning(`SOPs could not be loaded yet. ${error?.message || ""}`.trim());
      return { sopRows: [], sopImageRows: [] };
    }
  }

  async function refreshCleanerJobs() {
    if (!cleanerAccount?.id) return;
    const loadedJobs = await loadCleanerJobs(cleanerAccount.id);
    setCleanerJobs(loadedJobs);
  }

  async function handleAcceptJob() {
    if (!selectedCleanerJob || !profile?.id) return;

    setJobsWarning(null);
    setActionLoading("accept");

    try {
      const { error } = await supabase.rpc("accept_turnover_job_slot", {
        p_slot_id: selectedCleanerJob.slot.id,
        p_profile_id: profile.id,
      });

      if (error) throw error;

      await refreshCleanerJobs();
    } catch (error: any) {
      setJobsWarning(error?.message || "Could not accept job.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeclineJob() {
    if (!selectedCleanerJob || !profile?.id) return;

    setJobsWarning(null);
    setActionLoading("decline");

    try {
      const { error } = await supabase.rpc("decline_turnover_job_slot", {
        p_slot_id: selectedCleanerJob.slot.id,
        p_profile_id: profile.id,
      });

      if (error) throw error;

      const declinedSlotId = selectedCleanerJob.slot.id;
      await refreshCleanerJobs();

      setSelectedSlotId((current) => (current === declinedSlotId ? null : current));
    } catch (error: any) {
      setJobsWarning(error?.message || "Could not decline job.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSignOut() {
    try {
      setSigningOut(true);
      await supabase.auth.signOut();
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  }

  const accessByPropertyId = useMemo(() => {
    const map = new Map<string, AccessRow>();
    for (const row of accessRows) {
      map.set(row.property_id, row);
    }
    return map;
  }, [accessRows]);

  const jobsByPropertyId = useMemo(() => {
    const map = new Map<string, CleanerJob[]>();
    for (const item of cleanerJobs) {
      if (!map.has(item.job.property_id)) {
        map.set(item.job.property_id, []);
      }
      map.get(item.job.property_id)!.push(item);
    }
    return map;
  }, [cleanerJobs]);

  const sopImagesBySopId = useMemo(() => {
    const map = new Map<string, SopImage[]>();
    for (const image of sopImages) {
      if (!map.has(image.sop_id)) {
        map.set(image.sop_id, []);
      }
      map.get(image.sop_id)!.push(image);
    }
    return map;
  }, [sopImages]);

  const sopsByPropertyId = useMemo(() => {
    const map = new Map<string, Sop[]>();
    for (const sop of sops) {
      if (!map.has(sop.property_id)) {
        map.set(sop.property_id, []);
      }
      map.get(sop.property_id)!.push(sop);
    }
    return map;
  }, [sops]);

  const unacceptedJobs = useMemo(
    () => cleanerJobs.filter((item) => (item.slot.status || "").toLowerCase().trim() === "offered"),
    [cleanerJobs]
  );

  const unacceptedCount = unacceptedJobs.length;

  const jobsByDate = useMemo(() => {
    const map = new Map<string, CleanerJob[]>();

    for (const item of cleanerJobs) {
      if (!item.jobDate) continue;
      if (!map.has(item.jobDate)) {
        map.set(item.jobDate, []);
      }
      map.get(item.jobDate)!.push(item);
    }

    return map;
  }, [cleanerJobs]);

  const calendarDays = useMemo(() => getMonthGrid(calendarMonth), [calendarMonth]);

  const filteredJobs = useMemo(() => {
    const items = selectedDate
      ? cleanerJobs.filter((item) => item.jobDate === selectedDate)
      : cleanerJobs;

    return sortCleanerJobsNearestFirst(items);
  }, [cleanerJobs, selectedDate]);

  const upcomingFilteredJobs = useMemo(() => {
    const today = toYmd(new Date());
    return filteredJobs.filter((item) => {
      if (!item.jobDate) return false;
      return item.jobDate >= today;
    });
  }, [filteredJobs]);

  const collapsedPreviewJob = useMemo(() => {
    const urgentUnaccepted = filteredJobs.find(
      (item) => (item.slot.status || "").toLowerCase().trim() === "offered"
    );
    if (urgentUnaccepted) return urgentUnaccepted;

    if (upcomingFilteredJobs.length > 0) return upcomingFilteredJobs[0];
    if (filteredJobs.length > 0) return filteredJobs[0];
    return null;
  }, [upcomingFilteredJobs, filteredJobs]);

  const hiddenJobsCount = useMemo(() => {
    if (!collapsedPreviewJob) return 0;
    return Math.max(filteredJobs.length - 1, 0);
  }, [collapsedPreviewJob, filteredJobs.length]);

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return null;
    return formatDateLabel(selectedDate);
  }, [selectedDate]);

  const selectedCleanerJob = useMemo(() => {
    if (!selectedSlotId) return null;
    return cleanerJobs.find((item) => item.slot.id === selectedSlotId) || null;
  }, [cleanerJobs, selectedSlotId]);

  const selectedJobProperty = useMemo(() => {
    if (!selectedCleanerJob) return null;
    return properties.find((p) => p.id === selectedCleanerJob.job.property_id) || null;
  }, [selectedCleanerJob, properties]);

  const selectedJobAccess = useMemo(() => {
    if (!selectedCleanerJob) return null;
    return accessByPropertyId.get(selectedCleanerJob.job.property_id) || null;
  }, [selectedCleanerJob, accessByPropertyId]);

  const selectedJobSops = useMemo(() => {
    if (!selectedCleanerJob) return [];
    return sopsByPropertyId.get(selectedCleanerJob.job.property_id) || [];
  }, [selectedCleanerJob, sopsByPropertyId]);

  useEffect(() => {
    if (unacceptedCount > 0) {
      setJobsCollapsed(false);
    }
  }, [unacceptedCount]);

  useEffect(() => {
    if (hasAutoSelectedInitialJob.current) return;
    if (selectedSlotId) return;

    if (unacceptedJobs.length > 0) {
      setSelectedSlotId(unacceptedJobs[0].slot.id);
      hasAutoSelectedInitialJob.current = true;
      return;
    }

    if (cleanerJobs.length > 0) {
      setSelectedSlotId(cleanerJobs[0].slot.id);
      hasAutoSelectedInitialJob.current = true;
    }
  }, [selectedSlotId, unacceptedJobs, cleanerJobs]);

  useEffect(() => {
    if (selectedSlotId && cleanerJobs.some((item) => item.slot.id === selectedSlotId)) {
      return;
    }

    if (unacceptedJobs.length > 0) {
      setSelectedSlotId(unacceptedJobs[0].slot.id);
      return;
    }

    if (cleanerJobs.length > 0) {
      setSelectedSlotId(cleanerJobs[0].slot.id);
      return;
    }

    setSelectedSlotId(null);
  }, [cleanerJobs, selectedSlotId, unacceptedJobs]);

  function handleDateClick(dateYmd: string) {
    setSelectedDate(dateYmd);
    const dateJobs = sortCleanerJobsNearestFirst(jobsByDate.get(dateYmd) || []);
    setSelectedSlotId(dateJobs[0]?.slot.id || null);
    setJobsCollapsed(false);
  }

  function handleJobClick(slotId: string) {
    setSelectedSlotId(slotId);
    setJobsCollapsed(false);
  }

  function scrollToJobsSection() {
    setJobsCollapsed(false);

    window.setTimeout(() => {
      jobsSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0f0d0a] text-[#f5efe4]">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="animate-pulse rounded-3xl border border-[#7a5c2e]/30 bg-[#17130f] p-8">
            <div className="h-8 w-48 rounded bg-[#2a2219]" />
            <div className="mt-6 h-5 w-72 rounded bg-[#2a2219]" />
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <div className="h-56 rounded-2xl bg-[#2a2219]" />
              <div className="h-56 rounded-2xl bg-[#2a2219]" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (pageError) {
    return (
      <main className="min-h-screen bg-[#0f0d0a] text-[#f5efe4]">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="rounded-3xl border border-red-500/30 bg-[#17130f] p-8">
            <div className="mb-4 flex items-center gap-4">
              <Image
                src="/eomlogo.png"
                alt="Estate of Mind logo"
                width={64}
                height={64}
                className="h-16 w-auto object-contain"
              />
              <div>
                <h1 className="text-2xl font-semibold text-[#f5efe4]">Cleaner Dashboard</h1>
                <p className="text-sm text-[#d4c4a8]">Estate of Mind Property Management</p>
              </div>
            </div>

            <p className="rounded-2xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200">
              {pageError}
            </p>

            <button
              onClick={() => router.replace("/login")}
              className="mt-6 rounded-full border border-[#b08b47] bg-[#b08b47] px-5 py-2 text-sm font-medium text-[#120f0b] transition hover:opacity-90"
            >
              Back to login
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0f0d0a] text-[#f5efe4]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="overflow-hidden rounded-3xl border border-[#7a5c2e]/35 bg-[linear-gradient(180deg,#17130f_0%,#100d09_100%)] shadow-2xl">
          <div className="border-b border-[#7a5c2e]/25 px-4 py-5 sm:px-6 sm:py-6 md:px-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <Image
                  src="/eomlogo.png"
                  alt="Estate of Mind logo"
                  width={84}
                  height={84}
                  className="h-14 w-auto object-contain sm:h-16 md:h-20"
                  priority
                />
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-[#b08b47]">
                    Cleaner Portal
                  </p>
                  <h1 className="mt-1 text-xl font-semibold text-[#f8f2e8] sm:text-2xl md:text-3xl">
                    Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}
                  </h1>
                  <p className="mt-1 text-sm text-[#d4c4a8]">
                    {cleanerAccount?.display_name
                      ? `Account: ${cleanerAccount.display_name}`
                      : "Your assigned jobs, access notes, and SOPs."}
                  </p>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="rounded-full border border-[#b08b47]/70 px-5 py-2 text-sm font-medium text-[#f5efe4] transition hover:bg-[#b08b47] hover:text-[#120f0b] disabled:opacity-50"
              >
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </div>

          <div className="grid gap-6 px-4 py-5 sm:px-6 sm:py-6 md:px-8">
            {profile?.role === "pending" && (
              <section className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5">
                <h2 className="text-lg font-semibold text-[#f5efe4]">Account awaiting approval</h2>
                <p className="mt-2 text-sm text-[#e6d8be]">
                  Your account has been created, but admin approval is still needed before full
                  cleaner access is granted.
                </p>
              </section>
            )}

            {accountWarning && (
              <section className="rounded-2xl border border-amber-500/25 bg-amber-950/20 p-4 text-sm text-[#e6d8be]">
                {accountWarning}
              </section>
            )}

            {unacceptedCount > 0 && (
              <section className="sticky top-0 z-40 rounded-2xl border border-red-400/60 bg-red-600 p-4 text-white shadow-[0_0_28px_rgba(239,68,68,0.28)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-red-100">
                      Immediate Attention Needed
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      🚨 {unacceptedCount} job{unacceptedCount === 1 ? "" : "s"} waiting for your response
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      if (unacceptedJobs[0]) {
                        setSelectedSlotId(unacceptedJobs[0].slot.id);
                      }
                      scrollToJobsSection();
                    }}
                    className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
                  >
                    View urgent jobs
                  </button>
                </div>
              </section>
            )}

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-[#7a5c2e]/25 bg-[#15110d] p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b08b47]">Assigned Properties</p>
                <p className="mt-3 text-3xl font-semibold text-[#f8f2e8]">{properties.length}</p>
              </div>

              <div
                className={`rounded-2xl border p-5 ${
                  unacceptedCount > 0
                    ? "border-red-500/60 bg-[linear-gradient(180deg,rgba(90,18,18,0.78)_0%,rgba(21,17,13,1)_100%)] shadow-[0_0_28px_rgba(239,68,68,0.16)]"
                    : "border-[#7a5c2e]/25 bg-[#15110d]"
                }`}
              >
                <p className="text-xs uppercase tracking-[0.2em] text-[#b08b47]">Jobs Waiting</p>
                <p className="mt-3 text-3xl font-semibold text-[#f8f2e8]">{unacceptedCount}</p>
              </div>

              <div className="rounded-2xl border border-[#7a5c2e]/25 bg-[#15110d] p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b08b47]">Visible Slots</p>
                <p className="mt-3 text-3xl font-semibold text-[#f8f2e8]">{cleanerJobs.length}</p>
              </div>

              <div className="rounded-2xl border border-[#7a5c2e]/25 bg-[#15110d] p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b08b47]">Cleaner Account</p>
                <p className="mt-3 text-lg font-semibold text-[#f8f2e8]">
                  {cleanerAccount?.display_name || "Not linked"}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-[#7a5c2e]/25 bg-[#15110d] p-4 sm:p-5">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[#f8f2e8]">Cleaning Calendar</h2>
                  <p className="mt-1 text-sm text-[#cdbda0]">
                    Tap a date to filter jobs for that day.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <button
                    onClick={() =>
                      setCalendarMonth(
                        new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                      )
                    }
                    className="rounded-full border border-[#7a5c2e]/40 px-4 py-2 text-sm text-[#f5efe4] hover:bg-[#1b1510]"
                  >
                    Prev
                  </button>

                  <div className="min-w-[150px] text-center text-sm font-medium text-[#f8f2e8] sm:min-w-[180px]">
                    {formatMonthLabel(calendarMonth)}
                  </div>

                  <button
                    onClick={() =>
                      setCalendarMonth(
                        new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                      )
                    }
                    className="rounded-full border border-[#7a5c2e]/40 px-4 py-2 text-sm text-[#f5efe4] hover:bg-[#1b1510]"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="mb-3 hidden grid-cols-7 gap-2 text-center text-xs uppercase tracking-[0.16em] text-[#b08b47] sm:grid">
                <div>Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
                {calendarDays.map((day) => {
                  const ymd = toYmd(day);
                  const dayJobs = sortCleanerJobsNearestFirst(jobsByDate.get(ymd) || []);
                  const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                  const isSelected = selectedDate === ymd;
                  const isToday = ymd === toYmd(new Date());
                  const hasUnacceptedOnDay = dayJobs.some(
                    (item) => (item.slot.status || "").toLowerCase().trim() === "offered"
                  );

                  return (
                    <div
                      key={ymd}
                      className={[
                        "min-h-[112px] rounded-2xl border p-2 sm:min-h-[120px]",
                        isSelected
                          ? "border-[#b08b47] bg-[#221a13]"
                          : hasUnacceptedOnDay
                          ? "border-red-500/50 bg-[linear-gradient(180deg,rgba(68,16,16,0.58)_0%,rgba(16,13,10,1)_100%)]"
                          : "border-[#7a5c2e]/20 bg-[#100d0a]",
                        !isCurrentMonth ? "opacity-45" : "",
                      ].join(" ")}
                    >
                      <button
                        onClick={() => handleDateClick(ymd)}
                        className="flex w-full items-start justify-between rounded-xl px-1 py-1 text-left"
                      >
                        <span
                          className={[
                            "text-sm font-medium",
                            isToday ? "text-[#e7c98a]" : "text-[#f8f2e8]",
                          ].join(" ")}
                        >
                          {day.getDate()}
                        </span>

                        {dayJobs.length > 0 && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] ${
                              hasUnacceptedOnDay
                                ? "bg-red-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.28)]"
                                : "bg-[#b08b47]/15 text-[#e7c98a]"
                            }`}
                          >
                            {dayJobs.length}
                          </span>
                        )}
                      </button>

                      <div className="mt-2 space-y-1.5">
                        {dayJobs.slice(0, 3).map((item) => {
                          const property = properties.find((p) => p.id === item.job.property_id);
                          const isJobSelected = selectedSlotId === item.slot.id;
                          const tone = getStatusTone(item.slot.status, item.job.staffing_status);
                          const waiting = (item.slot.status || "").toLowerCase().trim() === "offered";

                          return (
                            <button
                              key={item.slot.id}
                              onClick={() => handleJobClick(item.slot.id)}
                              className={[
                                "block w-full truncate rounded-lg px-2 py-1.5 text-left text-[11px] transition",
                                isJobSelected
                                  ? "bg-[#b08b47] text-[#120f0b]"
                                  : waiting
                                  ? "bg-red-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.25)] animate-pulse"
                                  : "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/25",
                              ].join(" ")}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                                <span>{property?.name || "Property"}</span>
                              </span>
                            </button>
                          );
                        })}

                        {dayJobs.length > 3 && (
                          <button
                            onClick={() => handleDateClick(ymd)}
                            className="text-[11px] text-[#bfa67b]"
                          >
                            +{dayJobs.length - 3} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    setSelectedDate(null);
                    setSelectedSlotId(unacceptedJobs[0]?.slot.id ?? null);
                    setJobsCollapsed(false);
                  }}
                  className="rounded-full border border-[#7a5c2e]/40 px-4 py-2 text-sm text-[#f5efe4] hover:bg-[#1b1510]"
                >
                  Show all jobs
                </button>

                {selectedDateLabel && (
                  <div className="rounded-full border border-[#b08b47]/30 bg-[#b08b47]/10 px-4 py-2 text-sm text-[#e7c98a]">
                    Filtering: {selectedDateLabel}
                  </div>
                )}
              </div>
            </section>

            <section
              ref={jobsSectionRef}
              className="rounded-2xl border border-[#7a5c2e]/25 bg-[#15110d] p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[#f8f2e8]">
                    Jobs {selectedDateLabel ? `for ${selectedDateLabel}` : ""}
                  </h2>
                  <p className="mt-1 text-sm text-[#cdbda0]">
                    {jobsCollapsed
                      ? "Collapsed view showing the most urgent slot first. Expand to see the full schedule."
                      : "Expanded view showing all visible slots in priority order, with waiting jobs first."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {jobsCollapsed ? (
                    <button
                      onClick={() => setJobsCollapsed(false)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#b08b47]/45 bg-[#1b1510] px-4 py-2 text-sm text-[#f5efe4] hover:bg-[#241a14]"
                    >
                      <span>Expand jobs</span>
                      <span>▼</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setJobsCollapsed(true)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#b08b47]/45 bg-[#1b1510] px-4 py-2 text-sm text-[#f5efe4] hover:bg-[#241a14]"
                    >
                      <span>Collapse jobs</span>
                      <span>▲</span>
                    </button>
                  )}
                </div>
              </div>

              {jobsWarning && (
                <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3 text-sm text-[#e6d8be]">
                  {jobsWarning}
                </p>
              )}

              {selectedCleanerJob && (
                <section
                  ref={selectedJobPanelRef}
                  className="mt-4 rounded-2xl border border-[#b08b47]/30 bg-[#18120e] p-4 shadow-lg sm:p-5"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">
                        Selected Job Details
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-[#f8f2e8]">
                        {selectedJobProperty?.name || "Property job"}
                      </h3>
                      <p className="mt-1 text-sm text-[#d4c4a8]">
                        {selectedJobProperty?.address || "No property address"}
                      </p>
                      <p className="mt-2 text-sm text-[#e7c98a]">
                        Cleaning date: {formatDateLabel(selectedCleanerJob.jobDate)}
                      </p>
                      <p className="mt-2 text-sm text-[#d9c5a1]">
                        {getTeamMessage(selectedCleanerJob)}
                      </p>
                    </div>

                    <div>
                      {(() => {
                     const display = getSlotDisplayStatus(
  selectedCleanerJob.slot.status ?? null,
  selectedCleanerJob.job.staffing_status ?? null
);
                        const isOffered =
                          (selectedCleanerJob.slot.status || "").toLowerCase().trim() === "offered";
                        const isAccepted =
                          (selectedCleanerJob.slot.status || "").toLowerCase().trim() === "accepted";

                        return (
                          <span
                            className={`inline-flex w-fit rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em] ${
                              isOffered
                                ? "border border-red-400/70 bg-red-500 text-white animate-pulse"
                                : isAccepted
                                ? "border border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                                : "border border-[#7a5c2e]/35 bg-[#b08b47]/10 text-[#e7c98a]"
                            }`}
                          >
                            {display}
                          </span>
                        );
                      })()}

                      {(() => {
                        const isOffered =
                          (selectedCleanerJob.slot.status || "").toLowerCase().trim() === "offered";
                        if (!isOffered) return null;

                        const remainingMs = getTimeRemainingMs(selectedCleanerJob, now);
                        if (remainingMs === null) return null;

                        const tone = getCountdownTone(remainingMs);

                        return (
                          <div className={`mt-3 text-sm font-semibold ${tone}`}>
                            {remainingMs < 0
                              ? `Overdue by ${formatRemaining(remainingMs)}`
                              : `Accept within ${formatRemaining(remainingMs)}`}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#b08b47]">Slot Offered</p>
                      <p className="mt-2 text-sm text-[#e8ddca]">
                        {formatDateTimeLabel(selectedCleanerJob.slot.offered_at)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#b08b47]">Slot Accepted</p>
                      <p className="mt-2 text-sm text-[#e8ddca]">
                        {formatDateTimeLabel(selectedCleanerJob.slot.accepted_at)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#b08b47]">Slot Declined</p>
                      <p className="mt-2 text-sm text-[#e8ddca]">
                        {formatDateTimeLabel(selectedCleanerJob.slot.declined_at)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#b08b47]">Team Slots</p>
                      <p className="mt-2 text-sm text-[#e8ddca]">
                        {selectedCleanerJob.acceptedSlots} accepted of {selectedCleanerJob.totalSlots}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#b08b47]">Job Status</p>
                      <p className="mt-2 text-sm text-[#e8ddca]">
                        {selectedCleanerJob.job.staffing_status || selectedCleanerJob.job.status || "—"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#b08b47]">Slot Number</p>
                      <p className="mt-2 text-sm text-[#e8ddca]">
                        {selectedCleanerJob.slot.slot_number ?? "—"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={handleAcceptJob}
                      disabled={
                        actionLoading !== null ||
                        (selectedCleanerJob.slot.status || "").toLowerCase().trim() !== "offered"
                      }
                      className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-[#08110c] transition hover:bg-emerald-400 disabled:opacity-50"
                    >
                      {actionLoading === "accept" ? "Accepting..." : "Accept Job"}
                    </button>

                    <button
                      onClick={handleDeclineJob}
                      disabled={
                        actionLoading !== null ||
                        (selectedCleanerJob.slot.status || "").toLowerCase().trim() !== "offered"
                      }
                      className="rounded-full bg-red-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-400 disabled:opacity-50"
                    >
                      {actionLoading === "decline" ? "Declining..." : "Decline Job"}
                    </button>

                    <button
                      onClick={() => setSelectedSlotId(null)}
                      className="rounded-full border border-[#7a5c2e]/50 px-5 py-2 text-sm font-medium text-[#f5efe4] transition hover:bg-[#241a14]"
                    >
                      Close Details
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">Job Notes</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-[#e8ddca]">
                        {selectedCleanerJob.job.notes || "No job notes."}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">Access Details</p>
                      <div className="mt-2 space-y-2 text-sm text-[#e8ddca]">
                        <p>
                          <span className="text-[#d4c4a8]">Door code:</span>{" "}
                          {selectedJobAccess?.door_code || "Not added"}
                        </p>
                        <p>
                          <span className="text-[#d4c4a8]">Alarm code:</span>{" "}
                          {selectedJobAccess?.alarm_code || "Not added"}
                        </p>
                        <p className="whitespace-pre-wrap">
                          <span className="text-[#d4c4a8]">Notes:</span>{" "}
                          {selectedJobAccess?.notes || "No access notes added yet."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">Property Notes</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[#e8ddca]">
                      {selectedJobProperty?.notes || "No property notes."}
                    </p>
                  </div>

                  <div className="mt-4 rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">SOPs</p>

                    {selectedJobSops.length === 0 ? (
                      <p className="mt-2 text-sm text-[#cdbda0]">No SOPs added yet.</p>
                    ) : (
                      <div className="mt-3 space-y-4">
                        {selectedJobSops.map((sop) => {
                          const images = sopImagesBySopId.get(sop.id) || [];

                          return (
                            <div
                              key={sop.id}
                              className="rounded-2xl border border-[#7a5c2e]/15 bg-[#15110d] p-4"
                            >
                              {sop.title && (
                                <h4 className="text-base font-semibold text-[#f8f2e8]">
                                  {sop.title}
                                </h4>
                              )}

                              {sop.content && (
                                <p className="mt-2 whitespace-pre-wrap text-sm text-[#e8ddca]">
                                  {sop.content}
                                </p>
                              )}

                              {images.length > 0 && (
                                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                  {images.map((image) => (
                                    <a
                                      key={image.id}
                                      href={image.image_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block overflow-hidden rounded-xl border border-[#7a5c2e]/20"
                                    >
                                      <img
                                        src={image.image_url}
                                        alt={image.caption || sop.title || "SOP image"}
                                        className="h-40 w-full object-cover transition hover:scale-[1.02]"
                                      />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {jobsCollapsed ? (
                <div className="mt-4">
                  <div
                    className={`mb-4 rounded-2xl border p-4 ${
                      unacceptedCount > 0
                        ? "border-red-500/45 bg-red-950/25"
                        : "border-[#b08b47]/20 bg-[#110d09]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#b08b47]/35 bg-[#b08b47]/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-[#e7c98a]">
                        Collapsed
                      </span>

                      {collapsedPreviewJob && (
                        <span
                          className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em] ${
                            (collapsedPreviewJob.slot.status || "").toLowerCase().trim() === "offered"
                              ? "border border-red-400/70 bg-red-500 text-white animate-pulse"
                              : "border border-sky-400/25 bg-sky-400/10 text-sky-200"
                          }`}
                        >
                          {(collapsedPreviewJob.slot.status || "").toLowerCase().trim() === "offered"
                            ? "Needs Response"
                            : "Next Upcoming Job"}
                        </span>
                      )}

                      {hiddenJobsCount > 0 && (
                        <span className="rounded-full border border-[#7a5c2e]/30 bg-[#1a140f] px-3 py-1 text-xs text-[#d8c7ab]">
                          {hiddenJobsCount} more scheduled job{hiddenJobsCount === 1 ? "" : "s"} hidden
                        </span>
                      )}
                    </div>
                  </div>

                  {!collapsedPreviewJob ? (
                    <p className="text-sm text-[#cdbda0]">
                      {selectedDate ? "No jobs for that date." : "No jobs assigned yet."}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {(() => {
                        const item = collapsedPreviewJob;
                        const property = properties.find((p) => p.id === item.job.property_id);
                        const isSelected = selectedSlotId === item.slot.id;
                        const tone = getStatusTone(item.slot.status, item.job.staffing_status);
                        const waiting = (item.slot.status || "").toLowerCase().trim() === "offered";
                        const remainingMs = waiting ? getTimeRemainingMs(item, now) : null;
                        const countdownTone = getCountdownTone(remainingMs);

                        return (
                          <button
                            key={item.slot.id}
                            onClick={() => handleJobClick(item.slot.id)}
                            className={[
                              "block w-full rounded-2xl border p-5 text-left transition duration-200",
                              tone.card,
                              isSelected ? tone.selectedRing : "hover:-translate-y-[1px] hover:bg-[#18120e]",
                            ].join(" ")}
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={tone.badge}>
                                    {getSlotDisplayStatus(item.slot.status, item.job.staffing_status)}
                                  </span>
                                </div>

                                <h3 className="mt-3 text-lg font-semibold text-[#f8f2e8]">
                                  {property?.name || "Property job"}
                                </h3>

                                <p className="mt-1 text-sm text-[#d4c4a8]">
                                  {property?.address || "No property address"}
                                </p>

                                <p className="mt-2 text-sm font-medium text-[#f0d59f]">
                                  Cleaning date: {formatDateLabel(item.jobDate)}
                                </p>

                                <p className="mt-2 text-sm text-[#d9c5a1]">{getTeamMessage(item)}</p>

                                {waiting && remainingMs !== null && (
                                  <p className={`mt-2 text-sm font-semibold ${countdownTone}`}>
                                    {remainingMs < 0
                                      ? `Overdue by ${formatRemaining(remainingMs)}`
                                      : `Accept within ${formatRemaining(remainingMs)}`}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-start md:justify-end">
                                <span className="inline-flex items-center gap-2 rounded-full border border-[#7a5c2e]/25 bg-[#120f0b] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#d9c5a1]">
                                  <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                                  Tap to open
                                </span>
                              </div>
                            </div>

                            <div className="mt-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">
                                Job Notes
                              </p>
                              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-[#e8ddca]">
                                {item.job.notes || "No job notes."}
                              </p>
                            </div>
                          </button>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4">
                  {filteredJobs.length === 0 ? (
                    <p className="text-sm text-[#cdbda0]">
                      {selectedDate ? "No jobs for that date." : "No jobs assigned yet."}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {filteredJobs.map((item) => {
                        const property = properties.find((p) => p.id === item.job.property_id);
                        const isSelected = selectedSlotId === item.slot.id;
                        const tone = getStatusTone(item.slot.status, item.job.staffing_status);
                        const waiting = (item.slot.status || "").toLowerCase().trim() === "offered";
                        const remainingMs = waiting ? getTimeRemainingMs(item, now) : null;
                        const countdownTone = getCountdownTone(remainingMs);

                        return (
                          <button
                            key={item.slot.id}
                            onClick={() => handleJobClick(item.slot.id)}
                            className={[
                              "block w-full rounded-2xl border p-5 text-left transition duration-200",
                              tone.card,
                              isSelected ? tone.selectedRing : "hover:-translate-y-[1px] hover:bg-[#18120e]",
                            ].join(" ")}
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={tone.badge}>
                                    {getSlotDisplayStatus(item.slot.status, item.job.staffing_status)}
                                  </span>

                                  {isSelected && (
                                    <span className="rounded-full border border-[#b08b47]/35 bg-[#b08b47]/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#f0d59f]">
                                      Selected
                                    </span>
                                  )}
                                </div>

                                <h3 className="mt-3 text-lg font-semibold text-[#f8f2e8]">
                                  {property?.name || "Property job"}
                                </h3>

                                <p className="mt-1 text-sm text-[#d4c4a8]">
                                  {property?.address || "No property address"}
                                </p>

                                <p className="mt-2 text-sm font-medium text-[#f0d59f]">
                                  Cleaning date: {formatDateLabel(item.jobDate)}
                                </p>

                                <p className="mt-2 text-sm text-[#d9c5a1]">{getTeamMessage(item)}</p>

                                {waiting && remainingMs !== null && (
                                  <p className={`mt-2 text-sm font-semibold ${countdownTone}`}>
                                    {remainingMs < 0
                                      ? `Overdue by ${formatRemaining(remainingMs)}`
                                      : `Accept within ${formatRemaining(remainingMs)}`}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-start md:justify-end">
                                <span className="inline-flex items-center gap-2 rounded-full border border-[#7a5c2e]/25 bg-[#120f0b] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#d9c5a1]">
                                  <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                                  Tap to open
                                </span>
                              </div>
                            </div>

                            <div className="mt-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">
                                Job Notes
                              </p>
                              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-[#e8ddca]">
                                {item.job.notes || "No job notes."}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[#7a5c2e]/25 bg-[#15110d] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#f8f2e8]">SOPs</h2>
              </div>

              {sopsWarning && (
                <p className="mb-4 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3 text-sm text-[#e6d8be]">
                  {sopsWarning}
                </p>
              )}

              {properties.length === 0 ? (
                <p className="text-sm text-[#cdbda0]">
                  SOPs will appear here once properties are assigned.
                </p>
              ) : (
                <div className="space-y-6">
                  {properties.map((property) => {
                    const propertySops = sopsByPropertyId.get(property.id) || [];
                    const propertyJobs = jobsByPropertyId.get(property.id) || [];

                    return (
                      <div
                        key={property.id}
                        className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-5"
                      >
                        <h3 className="text-lg font-semibold text-[#f8f2e8]">
                          {property.name || "Untitled property"}
                        </h3>

                        {propertyJobs.length > 0 && (
                          <p className="mt-2 text-sm text-[#cdbda0]">
                            {propertyJobs.length} visible slot
                            {propertyJobs.length === 1 ? "" : "s"} linked to this property.
                          </p>
                        )}

                        {propertySops.length === 0 ? (
                          <p className="mt-3 text-sm text-[#cdbda0]">No SOPs added yet.</p>
                        ) : (
                          <div className="mt-4 space-y-4">
                            {propertySops.map((sop) => {
                              const images = sopImagesBySopId.get(sop.id) || [];

                              return (
                                <div
                                  key={sop.id}
                                  className="rounded-2xl border border-[#7a5c2e]/15 bg-[#15110d] p-4"
                                >
                                  {sop.title && (
                                    <h4 className="text-base font-semibold text-[#f8f2e8]">
                                      {sop.title}
                                    </h4>
                                  )}

                                  {sop.content && (
                                    <p className="mt-2 whitespace-pre-wrap text-sm text-[#e8ddca]">
                                      {sop.content}
                                    </p>
                                  )}

                                  {images.length > 0 && (
                                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                      {images.map((image) => (
                                        <a
                                          key={image.id}
                                          href={image.image_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="block overflow-hidden rounded-xl border border-[#7a5c2e]/20"
                                        >
                                          <img
                                            src={image.image_url}
                                            alt={image.caption || sop.title || "SOP image"}
                                            className="h-44 w-full object-cover transition hover:scale-[1.02]"
                                          />
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}