"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import GroundsDesktopView from "@/components/grounds/groundsdesktopview";
import GroundsMobileView from "@/components/grounds/groundsmobileview";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: "pending" | "grounds" | "admin" | string;
  created_at: string | null;
};

type GroundsAccountMember = {
  id: string;
  grounds_account_id: string;
  profile_id: string;
  created_at?: string | null;
};

type GroundsAccount = {
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

type GroundsPortalJob = {
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
  grounds_units_needed?: number | null;
  grounds_units_required_strict?: boolean | null;
  show_team_status_to_grounds?: boolean | null;
  needs_secure_access?: boolean | null;
  needs_garage_access?: boolean | null;
  job_type?: string | null;
};

type GroundsJobSlot = {
  id: string;
  job_id: string;
  slot_number: number | null;
  grounds_account_id: string | null;
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

export type GroundsJob = {
  slot: GroundsJobSlot;
  job: GroundsPortalJob;
  jobDate: string | null;
  acceptedSlots: number;
  totalSlots: number;
};
export type ParsedJobNotes = {
  source: string | null;
  sourceLabel: string | null;
  guest: string | null;
  checkoutDate: string | null;
  summaryLines: string[];
  detailLines: string[];
};
export type GroundsViewProps = {
  loading: boolean;
  parseJobNotes: (notes: string | null) => ParsedJobNotes;
  signingOut: boolean;
  actionLoading: "accept" | "decline" | null;
  profile: Profile | null;
  groundsAccount: GroundsAccount | null;
  properties: Property[];
  groundsJobs: GroundsJob[];
  accessRows: AccessRow[];
  sops: Sop[];
  sopImages: SopImage[];
  pageError: string | null;
  accountWarning: string | null;
  jobsWarning: string | null;
  sopsWarning: string | null;
  calendarMonth: Date;
  setCalendarMonth: React.Dispatch<React.SetStateAction<Date>>;
  selectedDate: string | null;
  setSelectedDate: React.Dispatch<React.SetStateAction<string | null>>;
  selectedSlotId: string | null;
  setSelectedSlotId: React.Dispatch<React.SetStateAction<string | null>>;
  jobsCollapsed: boolean;
  setJobsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  now: Date;
  accessByPropertyId: Map<string, AccessRow>;
  jobsByPropertyId: Map<string, GroundsJob[]>;
  sopImagesBySopId: Map<string, SopImage[]>;
  sopsByPropertyId: Map<string, Sop[]>;
  unacceptedJobs: GroundsJob[];
  unacceptedCount: number;
  jobsByDate: Map<string, GroundsJob[]>;
  calendarDays: Date[];
  filteredJobs: GroundsJob[];
  activeJobs: GroundsJob[];
  historyJobs: GroundsJob[];
  upcomingFilteredJobs: GroundsJob[];
  collapsedPreviewJob: GroundsJob | null;
  hiddenJobsCount: number;
  selectedDateLabel: string | null;
  selectedGroundsJob: GroundsJob | null;
  selectedJobProperty: Property | null;
  selectedJobAccess: AccessRow | null;
  selectedJobSops: Sop[];
  handleDateClick: (dateYmd: string) => void;
  handleJobClick: (slotId: string) => void;
  scrollToJobsSection: () => void;
  handleAcceptJob: () => Promise<void>;
  handleDeclineJob: () => Promise<void>;
  handleCloseDetails: () => void;
  handleSignOut: () => Promise<void>;
  refreshGroundsJobs: () => Promise<void>;
  formatMonthLabel: (date: Date) => string;
  toYmd: (date: Date) => string;
  formatDateLabel: (dateString: string | null) => string;
  formatDateTimeLabel: (dateString: string | null | undefined) => string;
  getTimeRemainingMs: (item: GroundsJob, now: Date) => number | null;
  formatRemaining: (ms: number) => string;
  getCountdownTone: (ms: number | null) => string;
  getSlotDisplayStatus: (
    slotStatus: string | null | undefined,
    staffingStatus: string | null | undefined
  ) => string;
  getStatusTone: (
    slotStatus: string | null | undefined,
    staffingStatus: string | null | undefined
  ) => {
    badge: string;
    card: string;
    dot: string;
    selectedRing: string;
  };
  getTeamMessage: (item: GroundsJob) => string;
  canSwitchToCleaner: boolean;
  cleanerWaitingCount: number;
  handleSwitchToCleaner: () => void;
};

type GroundsShellProps = {
  mode: "desktop" | "mobile";
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

function getDeadline(item: GroundsJob, now: Date) {
  if (!item.slot.offered_at) return null;

  const offered = new Date(item.slot.offered_at);
  if (Number.isNaN(offered.getTime())) return null;

  const hours = getResponseWindowHours(item.jobDate, now);
  return new Date(offered.getTime() + hours * 60 * 60 * 1000);
}

function getTimeRemainingMs(item: GroundsJob, now: Date) {
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
function parseJobNotes(notes: string | null): ParsedJobNotes {
  if (!notes) {
    return {
      source: null,
      sourceLabel: null,
      guest: null,
      checkoutDate: null,
      summaryLines: [],
      detailLines: [],
    };
  }

  const normalized = notes.replace(/\r\n/g, "\n");
  const sourceMatch = normalized.match(/\[AUTO_SYNC\s*:\s*([^:\]]+)/i);
  const rawSource = sourceMatch?.[1]?.trim().toLowerCase() || null;

  const sourceLabel =
    rawSource === "airbnb"
      ? "Airbnb"
      : rawSource === "vrbo"
        ? "VRBO"
        : rawSource === "booking" || rawSource === "booking.com"
          ? "Booking.com"
          : rawSource
            ? rawSource.toUpperCase()
            : null;

  const guestMatch = normalized.match(/Guest\s*\/\s*reservation\s*:\s*(.+)/i);
  const checkoutMatch = normalized.match(/Checkout date\s*:\s*(\d{4}-\d{2}-\d{2})/i);

  const guest = guestMatch?.[1]?.trim() || null;
  const checkoutDate = checkoutMatch?.[1] || null;

  const cleanedLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\[AUTO_SYNC:/i.test(line))
    .filter((line) => !/^Auto-created from .*calendar sync\.?$/i.test(line))
    .filter((line) => !/^Property\s*:/i.test(line))
    .filter((line) => !/^Guest\s*\/\s*reservation\s*:/i.test(line))
    .filter((line) => !/^Checkout date\s*:/i.test(line));

  const summaryLines: string[] = [];
  if (sourceLabel) summaryLines.push(`Imported from ${sourceLabel}`);
  if (guest) summaryLines.push(`Guest: ${guest}`);
  if (checkoutDate) summaryLines.push(`Checkout: ${formatDateLabel(checkoutDate)}`);
  if (summaryLines.length === 0 && cleanedLines.length > 0) {
    summaryLines.push(...cleanedLines.slice(0, 3));
  }

  return {
    source: rawSource,
    sourceLabel,
    guest,
    checkoutDate,
    summaryLines,
    detailLines: cleanedLines,
  };
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

function getStatusTone(
  slotStatus: string | null | undefined,
  staffingStatus: string | null | undefined
) {
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

function sortGroundsJobsNearestFirst(items: GroundsJob[]) {
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

function isPastHistoryJob(item: GroundsJob, todayYmd: string) {
  if (!item.jobDate) return false;
  return item.jobDate < todayYmd;
}

function getTeamMessage(item: GroundsJob) {
  const needed = item.job.grounds_units_needed ?? item.totalSlots ?? 1;
  const accepted = item.acceptedSlots;
  const strict = !!item.job.grounds_units_required_strict;
  const show = item.job.show_team_status_to_grounds !== false;
  const slotStatus = (item.slot.status || "").toLowerCase().trim();
  const staffing = (item.job.staffing_status || "").toLowerCase().trim();

  if (needed <= 1) {
    return slotStatus === "accepted" ? "Solo grounds task • you accepted this job" : "Solo grounds task";
  }

  if (!show) {
    return slotStatus === "accepted" ? "Grounds team • you accepted this slot" : "Grounds team";
  }

  if (strict) {
    if (slotStatus === "accepted" && staffing !== "fully_staffed") {
      const remaining = Math.max(needed - accepted, 0);
      return remaining > 0
        ? `Grounds team • ${accepted} of ${needed} accepted • waiting on ${remaining} more`
        : `Grounds team • ${accepted} of ${needed} accepted`;
    }

    if (staffing === "fully_staffed") {
      return `Grounds team • ${accepted} of ${needed} accepted • fully staffed`;
    }

    if (staffing === "partially_filled") {
      return `Grounds team • ${accepted} of ${needed} accepted`;
    }

    return `Grounds team • ${needed} grounds crew required`;
  }

  if (slotStatus === "accepted" && staffing === "ready" && accepted < needed) {
    return `Grounds team • job can proceed • ${accepted} of ${needed} accepted`;
  }

  if (staffing === "fully_staffed") {
    return `Grounds team • ${accepted} of ${needed} accepted • fully staffed`;
  }

  if (staffing === "ready") {
    return `Grounds team • ready to proceed • ${accepted} of ${needed} accepted`;
  }

  if (staffing === "partially_filled") {
    return `Grounds team • partially filled • ${accepted} of ${needed} accepted`;
  }

  return `Grounds team • ${needed} grounds slots`;
}

export default function GroundsShell({ mode }: GroundsShellProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [actionLoading, setActionLoading] = useState<"accept" | "decline" | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [groundsAccount, setGroundsAccount] = useState<GroundsAccount | null>(null);
  const [canSwitchToCleaner, setCanSwitchToCleaner] = useState(false);
  const [cleanerWaitingCount, setCleanerWaitingCount] = useState(0);

  const [properties, setProperties] = useState<Property[]>([]);
  const [groundsJobs, setGroundsJobs] = useState<GroundsJob[]>([]);
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
  const [selectionDismissed, setSelectionDismissed] = useState(false);
  const [jobsCollapsed, setJobsCollapsed] = useState(true);
  const [now, setNow] = useState(() => new Date());

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

        const accountData = await loadGroundsAccount(profileData.id);
        if (!mounted) return;

        setGroundsAccount(accountData.account);
        setAccountWarning(accountData.warning);

        if (!accountData.account) {
          setProperties([]);
          setGroundsJobs([]);
          setAccessRows([]);
          setSops([]);
          setSopImages([]);
          return;
        }

        const loadedGroundsJobs = await loadGroundsJobs(accountData.account.id);
        if (!mounted) return;
        setGroundsJobs(loadedGroundsJobs);

        const propertyIds = [...new Set(loadedGroundsJobs.map((item) => item.job.property_id))];
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
        setPageError(error?.message || "Something went wrong loading the Gulera OS grounds dashboard.");
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
    if (!groundsAccount?.id) return;

    const slotChannel = supabase
      .channel(`grounds-slot-live-${groundsAccount.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "grounds_job_slots",
        },
        () => {
          if (realtimeRefreshTimeoutRef.current) {
            window.clearTimeout(realtimeRefreshTimeoutRef.current);
          }

          realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
            void refreshGroundsJobs();
          }, 200);
        }
      )
      .subscribe();

    const membershipChannel = profile?.id
      ? supabase
          .channel(`grounds-membership-live-${profile.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "grounds_account_members",
              filter: `profile_id=eq.${profile.id}`,
            },
            async () => {
              const accountData = await loadGroundsAccount(profile.id);
              setGroundsAccount(accountData.account);
              setAccountWarning(accountData.warning);

              if (accountData.account) {
                const loadedJobs = await loadGroundsJobs(accountData.account.id);
                setGroundsJobs(loadedJobs);
              } else {
                setGroundsJobs([]);
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
  }, [groundsAccount?.id, profile?.id]);

  useEffect(() => {
    if (!groundsAccount?.id) return;

    const interval = window.setInterval(() => {
      void refreshGroundsJobs();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [groundsAccount?.id]);

  async function loadGroundsAccount(
    profileId: string
  ): Promise<{
    account: GroundsAccount | null;
    warning: string | null;
  }> {
    try {
      const { data: membershipData, error: membershipError } = await supabase
        .from("grounds_account_members")
        .select("id, grounds_account_id, profile_id, created_at")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: true });

      if (membershipError) throw membershipError;

      const memberships = (membershipData ?? []) as GroundsAccountMember[];

      if (memberships.length === 0) {
        return {
          account: null,
          warning:
            "Your grounds login is not linked to a grounds account yet. Ask admin to connect your profile to a grounds account.",
        };
      }

      const accountIds = memberships.map((m) => m.grounds_account_id);

      const { data: accountsData, error: accountsError } = await supabase
        .from("grounds_accounts")
        .select("*")
        .in("id", accountIds);

      if (accountsError) throw accountsError;

      const accounts = (accountsData ?? []) as GroundsAccount[];
      const primaryAccount =
        accounts.find((a) => a.id === memberships[0].grounds_account_id) || accounts[0] || null;

      let warning: string | null = null;
      if (memberships.length > 1) {
        warning =
          "Your profile is linked to more than one grounds account. This page is using the first linked grounds account right now.";
      }

      return {
        account: primaryAccount,
        warning,
      };
    } catch (error: any) {
      return {
        account: null,
        warning: `Grounds account could not be loaded yet. ${error?.message || ""}`.trim(),
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

  async function loadGroundsJobs(groundsAccountId: string): Promise<GroundsJob[]> {
    setJobsWarning(null);

    try {
      const { data: slotData, error: slotError } = await supabase
        .from("grounds_job_slots")
        .select(
          "id, job_id, slot_number, grounds_account_id, status, offered_at, accepted_at, declined_at, expires_at, accepted_by_profile_id, declined_by_profile_id, created_at, updated_at"
        )
        .eq("grounds_account_id", groundsAccountId)
        .order("created_at", { ascending: false });

      if (slotError) throw slotError;

      const accountSlots = (slotData ?? []) as GroundsJobSlot[];

      if (accountSlots.length === 0) {
        return [];
      }

      const jobIds = [...new Set(accountSlots.map((slot) => slot.job_id))];

      const { data: jobData, error: jobError } = await supabase
        .from("grounds_jobs")
        .select(
          "id, property_id, status, notes, created_at, offered_at, accepted_at, declined_at, scheduled_for, staffing_status, grounds_units_needed, grounds_units_required_strict, show_team_status_to_grounds, needs_secure_access, needs_garage_access, job_type"
        )
        .in("id", jobIds);

      if (jobError) throw jobError;

      const jobs = (jobData ?? []) as GroundsPortalJob[];
      const jobsById = new Map(jobs.map((job) => [job.id, job]));

      const { data: allSlotData, error: allSlotError } = await supabase
        .from("grounds_job_slots")
        .select("id, job_id, status")
        .in("job_id", jobIds);

      if (allSlotError) throw allSlotError;

      const allSlots = (allSlotData ?? []) as Array<{
        id: string;
        job_id: string;
        status: string | null;
      }>;
      const slotCounts = new Map<string, { total: number; accepted: number }>();

      for (const slot of allSlots) {
        const current = slotCounts.get(slot.job_id) || { total: 0, accepted: 0 };
        current.total += 1;
        if ((slot.status || "").toLowerCase().trim() === "accepted") {
          current.accepted += 1;
        }
        slotCounts.set(slot.job_id, current);
      }

      const merged: GroundsJob[] = accountSlots
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
        .filter((item): item is GroundsJob => Boolean(item));

      return sortGroundsJobsNearestFirst(merged);
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

  async function refreshGroundsJobs() {
    if (!groundsAccount?.id) return;

    const loadedJobs = await loadGroundsJobs(groundsAccount.id);
    setGroundsJobs(loadedJobs);

    const propertyIds = [...new Set(loadedJobs.map((item) => item.job.property_id))];
    const loadedProperties = await loadProperties(propertyIds);
    setProperties(loadedProperties);

    const loadedAccess = await loadAccess(propertyIds);
    setAccessRows(loadedAccess);

    const { sopRows, sopImageRows } = await loadSops(propertyIds);
    setSops(sopRows);
    setSopImages(sopImageRows);
  }

  function handleCloseDetails() {
    setSelectionDismissed(true);
    setSelectedSlotId(null);
  }

  async function refreshGroundsJobStaffing(jobId: string) {
    const [{ data: slotData, error: slotError }, { data: jobRow, error: jobError }] = await Promise.all([
      supabase
        .from("grounds_job_slots")
        .select("status, accepted_at, offered_at")
        .eq("job_id", jobId),
      supabase
        .from("grounds_jobs")
        .select("id, grounds_units_needed")
        .eq("id", jobId)
        .single(),
    ]);

    if (slotError) throw slotError;
    if (jobError) throw jobError;

    const slots = slotData ?? [];
    const needed = Math.max(jobRow?.grounds_units_needed ?? 1, 1);
    const acceptedSlots = slots.filter((slot) => (slot.status || "").toLowerCase().trim() === "accepted");
    const offeredSlots = slots.filter((slot) => (slot.status || "").toLowerCase().trim() === "offered");

    let staffingStatus = "unassigned";
    if (acceptedSlots.length >= needed) staffingStatus = "fully_staffed";
    else if (acceptedSlots.length > 0) staffingStatus = "partially_filled";
    else if (offeredSlots.length === 0 && slots.length > 0) staffingStatus = "stranded";

    const earliestOfferedAt =
      offeredSlots
        .map((slot) => slot.offered_at)
        .filter(Boolean)
        .sort()[0] || null;

    const earliestAcceptedAt =
      acceptedSlots
        .map((slot) => slot.accepted_at)
        .filter(Boolean)
        .sort()[0] || null;

    const status =
      acceptedSlots.length > 0
        ? "accepted"
        : offeredSlots.length > 0
          ? "offered"
          : "open";

    const { error: updateError } = await supabase
      .from("grounds_jobs")
      .update({
        staffing_status: staffingStatus,
        status,
        offered_at: earliestOfferedAt,
        accepted_at: earliestAcceptedAt,
      })
      .eq("id", jobId);

    if (updateError) throw updateError;
  }

  async function handleAcceptJob() {
    if (!selectedGroundsJob || !profile?.id) return;

    const acceptedSlotId = selectedGroundsJob.slot.id;
    const acceptedJobDate = selectedGroundsJob.jobDate;

    setJobsWarning(null);
    setActionLoading("accept");
    setSelectionDismissed(false);

    try {
      const { error } = await supabase
        .from("grounds_job_slots")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
          declined_at: null,
          accepted_by_profile_id: profile.id,
          declined_by_profile_id: null,
        })
        .eq("id", acceptedSlotId);

      if (error) throw error;

      await refreshGroundsJobStaffing(selectedGroundsJob.job.id);
      await refreshGroundsJobs();

      if (acceptedJobDate) {
        setSelectedDate(acceptedJobDate);
      }

      setSelectedSlotId(acceptedSlotId);
    } catch (error: any) {
      setJobsWarning(error?.message || "Could not accept grounds job.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeclineJob() {
    if (!selectedGroundsJob || !profile?.id) return;

    setJobsWarning(null);
    setActionLoading("decline");

    try {
      const { error } = await supabase
        .from("grounds_job_slots")
        .update({
          status: "declined",
          declined_at: new Date().toISOString(),
          accepted_at: null,
          declined_by_profile_id: profile.id,
          accepted_by_profile_id: null,
        })
        .eq("id", selectedGroundsJob.slot.id);

      if (error) throw error;

      const declinedSlotId = selectedGroundsJob.slot.id;
      await refreshGroundsJobStaffing(selectedGroundsJob.job.id);
      await refreshGroundsJobs();

      setSelectedSlotId((current) => (current === declinedSlotId ? null : current));
    } catch (error: any) {
      setJobsWarning(error?.message || "Could not decline grounds job.");
    } finally {
      setActionLoading(null);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadCleanerSummary() {
      if (!profile?.id) {
        if (active) {
          setCanSwitchToCleaner(false);
          setCleanerWaitingCount(0);
        }
        return;
      }

      const { data: memberships, error: membershipsError } = await supabase
        .from("cleaner_account_members")
        .select("cleaner_account_id")
        .eq("profile_id", profile.id);

      if (membershipsError || !memberships?.length) {
        if (active) {
          setCanSwitchToCleaner(false);
          setCleanerWaitingCount(0);
        }
        return;
      }

      const accountIds = [...new Set(memberships.map((row: any) => row.cleaner_account_id).filter(Boolean))];

      if (!accountIds.length) {
        if (active) {
          setCanSwitchToCleaner(false);
          setCleanerWaitingCount(0);
        }
        return;
      }

      const { count, error: countError } = await supabase
        .from("turnover_job_slots")
        .select("id", { count: "exact", head: true })
        .in("cleaner_account_id", accountIds)
        .eq("status", "offered");

      if (!active) return;

      setCanSwitchToCleaner(true);
      setCleanerWaitingCount(countError ? 0 : count ?? 0);
    }

    void loadCleanerSummary();

    return () => {
      active = false;
    };
  }, [profile?.id]);

  function handleSwitchToCleaner() {
    router.push("/cleaner");
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
    const map = new Map<string, GroundsJob[]>();
    for (const item of groundsJobs) {
      if (!map.has(item.job.property_id)) {
        map.set(item.job.property_id, []);
      }
      map.get(item.job.property_id)!.push(item);
    }
    return map;
  }, [groundsJobs]);

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
    () => groundsJobs.filter((item) => (item.slot.status || "").toLowerCase().trim() === "offered"),
    [groundsJobs]
  );

  const unacceptedCount = unacceptedJobs.length;

  const jobsByDate = useMemo(() => {
    const map = new Map<string, GroundsJob[]>();

    for (const item of groundsJobs) {
      if (!item.jobDate) continue;
      if (!map.has(item.jobDate)) {
        map.set(item.jobDate, []);
      }
      map.get(item.jobDate)!.push(item);
    }

    return map;
  }, [groundsJobs]);

  const calendarDays = useMemo(() => getMonthGrid(calendarMonth), [calendarMonth]);

  const filteredJobs = useMemo(() => {
    const items = selectedDate
      ? groundsJobs.filter((item) => item.jobDate === selectedDate)
      : groundsJobs;

    return sortGroundsJobsNearestFirst(items);
  }, [groundsJobs, selectedDate]);

  const activeJobs = useMemo(() => {
    const todayYmd = toYmd(now);

    return filteredJobs.filter((item) => {
      const slotStatus = (item.slot.status || "").toLowerCase().trim();
      const staffingStatus = (item.job.staffing_status || "").toLowerCase().trim();
      const isUrgent = slotStatus === "offered" || slotStatus === "stranded" || staffingStatus === "stranded";

      if (isUrgent) return true;
      return !isPastHistoryJob(item, todayYmd);
    });
  }, [filteredJobs, now]);

  const historyJobs = useMemo(() => {
    const todayYmd = toYmd(now);

    return filteredJobs.filter((item) => {
      const slotStatus = (item.slot.status || "").toLowerCase().trim();
      const staffingStatus = (item.job.staffing_status || "").toLowerCase().trim();
      const isUrgent = slotStatus === "offered" || slotStatus === "stranded" || staffingStatus === "stranded";

      if (isUrgent) return false;
      return isPastHistoryJob(item, todayYmd);
    });
  }, [filteredJobs, now]);

  const upcomingFilteredJobs = useMemo(() => {
    const today = toYmd(new Date());
    return filteredJobs.filter((item) => {
      if (!item.jobDate) return false;
      return item.jobDate >= today;
    });
  }, [filteredJobs]);

  const collapsedPreviewJob = useMemo(() => {
    const urgentUnaccepted = activeJobs.find(
      (item) => (item.slot.status || "").toLowerCase().trim() === "offered"
    );
    if (urgentUnaccepted) return urgentUnaccepted;

    if (upcomingFilteredJobs.length > 0) return upcomingFilteredJobs[0];
    if (activeJobs.length > 0) return activeJobs[0];
    if (historyJobs.length > 0) return historyJobs[0];
    return null;
  }, [upcomingFilteredJobs, activeJobs, historyJobs]);

  const hiddenJobsCount = useMemo(() => {
    if (!collapsedPreviewJob) return 0;
    return Math.max(activeJobs.length - 1, 0);
  }, [collapsedPreviewJob, activeJobs.length]);

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return null;
    return formatDateLabel(selectedDate);
  }, [selectedDate]);

  const selectedGroundsJob = useMemo(() => {
    if (!selectedSlotId) return null;
    return groundsJobs.find((item) => item.slot.id === selectedSlotId) || null;
  }, [groundsJobs, selectedSlotId]);

  const selectedJobProperty = useMemo(() => {
    if (!selectedGroundsJob) return null;
    return properties.find((p) => p.id === selectedGroundsJob.job.property_id) || null;
  }, [selectedGroundsJob, properties]);

  const selectedJobAccess = useMemo(() => {
    if (!selectedGroundsJob) return null;
    return accessByPropertyId.get(selectedGroundsJob.job.property_id) || null;
  }, [selectedGroundsJob, accessByPropertyId]);

  const selectedJobSops = useMemo(() => {
    if (!selectedGroundsJob) return [];
    return sopsByPropertyId.get(selectedGroundsJob.job.property_id) || [];
  }, [selectedGroundsJob, sopsByPropertyId]);

  useEffect(() => {
    if (unacceptedCount > 0) {
      setJobsCollapsed(false);
    }
  }, [unacceptedCount]);

  useEffect(() => {
    if (hasAutoSelectedInitialJob.current) return;
    if (selectedSlotId) return;

    const preferredInitialJob =
      unacceptedJobs[0] ??
      activeJobs[0] ??
      historyJobs[0] ??
      null;

    if (preferredInitialJob) {
      setSelectedSlotId(preferredInitialJob.slot.id);
      hasAutoSelectedInitialJob.current = true;
    }
  }, [selectedSlotId, unacceptedJobs, activeJobs, historyJobs]);

  useEffect(() => {
    if (selectedSlotId && groundsJobs.some((item) => item.slot.id === selectedSlotId)) {
      return;
    }

    if (selectionDismissed) {
      if (groundsJobs.length === 0) {
        setSelectionDismissed(false);
      }
      return;
    }

    const nextSelectedJob =
      unacceptedJobs[0] ??
      activeJobs[0] ??
      historyJobs[0] ??
      null;

    if (nextSelectedJob) {
      setSelectedSlotId(nextSelectedJob.slot.id);
      return;
    }

    setSelectedSlotId(null);
  }, [groundsJobs, selectedSlotId, unacceptedJobs, activeJobs, historyJobs, selectionDismissed]);

  useEffect(() => {
    if (selectedSlotId) {
      setSelectionDismissed(false);
    }
  }, [selectedSlotId]);

  function handleDateClick(dateYmd: string) {
    setSelectedDate(dateYmd);
    const dateJobs = sortGroundsJobsNearestFirst(jobsByDate.get(dateYmd) || []);
    setSelectedSlotId(dateJobs[0]?.slot.id || null);
    setJobsCollapsed(false);
  }

  function handleJobClick(slotId: string) {
    setSelectedSlotId(slotId);
    setJobsCollapsed(false);
  }

  function scrollToJobsSection() {
    setJobsCollapsed(false);
  }

  const viewProps: GroundsViewProps = {
    loading,
    signingOut,
    actionLoading,
    parseJobNotes,
    profile,
    groundsAccount,
    properties,
    groundsJobs,
    accessRows,
    sops,
    sopImages,
    pageError,
    accountWarning,
    jobsWarning,
    sopsWarning,
    calendarMonth,
    setCalendarMonth,
    selectedDate,
    setSelectedDate,
    selectedSlotId,
    setSelectedSlotId,
    jobsCollapsed,
    setJobsCollapsed,
    now,
    accessByPropertyId,
    jobsByPropertyId,
    sopImagesBySopId,
    sopsByPropertyId,
    unacceptedJobs,
    unacceptedCount,
    jobsByDate,
    calendarDays,
    filteredJobs,
    activeJobs,
    historyJobs,
    upcomingFilteredJobs,
    collapsedPreviewJob,
    hiddenJobsCount,
    selectedDateLabel,
    selectedGroundsJob,
    selectedJobProperty,
    selectedJobAccess,
    selectedJobSops,
    handleDateClick,
    handleJobClick,
    scrollToJobsSection,
    handleAcceptJob,
    handleDeclineJob,
    handleCloseDetails,
    handleSignOut,
    refreshGroundsJobs,
    formatMonthLabel,
    toYmd,
    formatDateLabel,
    formatDateTimeLabel,
    getTimeRemainingMs,
    formatRemaining,
    getCountdownTone,
    getSlotDisplayStatus,
    getStatusTone,
    getTeamMessage,
    canSwitchToCleaner,
    cleanerWaitingCount,
    handleSwitchToCleaner,
  };

  if (mode === "mobile") {
    return <GroundsMobileView {...viewProps} />;
  }

  return <GroundsDesktopView {...viewProps} />;
}