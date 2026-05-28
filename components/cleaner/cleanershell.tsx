"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { trackFeatureUsage } from "@/lib/feature-usage";
import PortalChat from "@/components/chat/portalchat";
import CleanerDesktopView from "@/components/cleaner/cleanerdesktopview";
import CleanerMobileView from "@/components/cleaner/cleanermobileview";
import PushNotificationControl from "@/components/cleaner/pushnotificationcontrol";

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
  organization_id?: string | null;
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
  started_at?: string | null;
  finished_at?: string | null;
  expires_at?: string | null;
  accepted_by_profile_id?: string | null;
  declined_by_profile_id?: string | null;
  started_by_profile_id?: string | null;
  finished_by_profile_id?: string | null;
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

export type CleanerJob = {
  slot: TurnoverJobSlot;
  job: TurnoverJob;
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
export type CleanerViewProps = {
  loading: boolean;
  parseJobNotes: (notes: string | null) => ParsedJobNotes;
  signingOut: boolean;
  actionLoading: "accept" | "decline" | "start" | "finish" | null;
  profile: Profile | null;
  cleanerAccount: CleanerAccount | null;
  properties: Property[];
  cleanerJobs: CleanerJob[];
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
  jobsByPropertyId: Map<string, CleanerJob[]>;
  sopImagesBySopId: Map<string, SopImage[]>;
  sopsByPropertyId: Map<string, Sop[]>;
  unacceptedJobs: CleanerJob[];
  unacceptedCount: number;
  jobsByDate: Map<string, CleanerJob[]>;
  calendarDays: Date[];
  filteredJobs: CleanerJob[];
  activeJobs: CleanerJob[];
  historyJobs: CleanerJob[];
  upcomingFilteredJobs: CleanerJob[];
  collapsedPreviewJob: CleanerJob | null;
  hiddenJobsCount: number;
  selectedDateLabel: string | null;
  selectedCleanerJob: CleanerJob | null;
  selectedJobProperty: Property | null;
  selectedJobAccess: AccessRow | null;
  selectedJobSops: Sop[];
  jobsSectionRef: React.RefObject<HTMLDivElement | null>;
  handleDateClick: (dateYmd: string) => void;
  handleJobClick: (slotId: string) => void;
  scrollToJobsSection: () => void;
  handleAcceptJob: () => Promise<void>;
  handleDeclineJob: () => Promise<void>;
  handleStartJob: () => Promise<void>;
  handleFinishJob: () => Promise<void>;
  handleCloseDetails: () => void;
  handleSignOut: () => Promise<void>;
  refreshCleanerJobs: () => Promise<void>;
  formatMonthLabel: (date: Date) => string;
  toYmd: (date: Date) => string;
  formatDateLabel: (dateString: string | null) => string;
  formatDateTimeLabel: (dateString: string | null | undefined) => string;
  getTimeRemainingMs: (item: CleanerJob, now: Date) => number | null;
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
  getTeamMessage: (item: CleanerJob) => string;
  canSwitchToGrounds: boolean;
  groundsWaitingCount: number;
  handleSwitchToGrounds: () => void;
};

type CleanerShellProps = {
  mode: "desktop" | "mobile";
};

type CleanerDashboardPayload = {
  profile: Profile;
  account: CleanerAccount | null;
  warning: string | null;
  jobs: CleanerJob[];
  properties: Property[];
  accessRows: AccessRow[];
  sops: Sop[];
  sopImages: SopImage[];
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
  const guestCountMatch = normalized.match(/Guest count\s*:\s*(.+)/i);
  const checkoutMatch = normalized.match(/Checkout date\s*:\s*(\d{4}-\d{2}-\d{2})/i);

  const guest = guestMatch?.[1]?.trim() || null;
  const guestCount = guestCountMatch?.[1]?.trim() || null;
  const checkoutDate = checkoutMatch?.[1] || null;

  const cleanedLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\[AUTO_SYNC:/i.test(line))
    .filter((line) => !/^Auto-created from .*calendar sync\.?$/i.test(line))
    .filter((line) => !/^Property\s*:/i.test(line))
    .filter((line) => !/^Guest\s*\/\s*reservation\s*:/i.test(line))
    .filter((line) => !/^Guest count\s*:/i.test(line))
    .filter((line) => !/^Checkout date\s*:/i.test(line));

  const summaryLines: string[] = [];
  if (sourceLabel) summaryLines.push(`Imported from ${sourceLabel}`);
  if (guest) summaryLines.push(`Guest: ${guest}`);
  if (guestCount) summaryLines.push(`Guest count: ${guestCount}`);
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

  if (slot === "in_progress") return "Job started";
  if (slot === "completed") return "Job finished";
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

  if (slot === "completed") {
    return {
      badge: "border border-sky-400/30 bg-sky-500/15 text-sky-200",
      card:
        "border-sky-500/25 bg-[linear-gradient(180deg,rgba(15,30,45,0.35)_0%,rgba(16,13,10,1)_100%)]",
      dot: "bg-sky-400",
      selectedRing: "ring-2 ring-sky-300/60",
    };
  }

  if (slot === "in_progress") {
    return {
      badge: "border border-amber-400/35 bg-amber-500/15 text-amber-200",
      card:
        "border-amber-500/25 bg-[linear-gradient(180deg,rgba(48,35,15,0.35)_0%,rgba(16,13,10,1)_100%)]",
      dot: "bg-amber-400",
      selectedRing: "ring-2 ring-amber-300/60",
    };
  }

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

function isPastHistoryJob(item: CleanerJob, todayYmd: string) {
  if (!item.jobDate) return false;
  return item.jobDate < todayYmd;
}

function getTeamMessage(item: CleanerJob) {
  const needed = item.job.cleaner_units_needed ?? item.totalSlots ?? 1;
  const accepted = item.acceptedSlots;
  const strict = !!item.job.cleaner_units_required_strict;
  const show = item.job.show_team_status_to_cleaners !== false;
  const slotStatus = (item.slot.status || "").toLowerCase().trim();
  const staffing = (item.job.staffing_status || "").toLowerCase().trim();

  if (slotStatus === "completed") return "Job finished";
  if (slotStatus === "in_progress") return "Job started";

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

export default function CleanerShell({ mode }: CleanerShellProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [actionLoading, setActionLoading] = useState<CleanerViewProps["actionLoading"]>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [cleanerAccount, setCleanerAccount] = useState<CleanerAccount | null>(null);
  const [canSwitchToGrounds, setCanSwitchToGrounds] = useState(false);
  const [groundsWaitingCount, setGroundsWaitingCount] = useState(0);

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
  const [selectionDismissed, setSelectionDismissed] = useState(false);
  const [jobsCollapsed, setJobsCollapsed] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [targetChatConversationId, setTargetChatConversationId] = useState("");

  const hasAutoSelectedInitialJob = useRef(false);
  const realtimeRefreshTimeoutRef = useRef<number | null>(null);
  const chatSectionRef = useRef<HTMLDivElement | null>(null);
  const jobsSectionRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!cleanerAccount?.id) return;

    const channel = supabase
      .channel("cleaner-jobs-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "turnover_job_slots",
        },
        async () => {
          await refreshCleanerJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cleanerAccount?.id]);
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
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          setPageError("No signed-in cleaner account was found. Please log in again.");
          setLoading(false);
          return;
        }

        const dashboard = await loadCleanerDashboardFromServer(session.access_token);
        if (!mounted) return;

        setProfile(dashboard.profile);

        if (dashboard.profile.role === "platform_admin" || dashboard.profile.role === "admin") {
          router.replace(dashboard.profile.role === "platform_admin" ? "/platform" : "/admin");
          return;
        }

        setCleanerAccount(dashboard.account);
        setAccountWarning(dashboard.warning);
        setCleanerJobs(dashboard.jobs);
        setProperties(dashboard.properties);
        setAccessRows(dashboard.accessRows);
        setSops(dashboard.sops);
        setSopImages(dashboard.sopImages);

        if (!dashboard.account) {
          setPageError(
            dashboard.warning || "This sign-in is not linked to a cleaner account yet. Ask an admin to connect your profile."
          );
          setLoading(false);
          return;
        }
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

  async function loadCleanerDashboardFromServer(accessToken: string): Promise<CleanerDashboardPayload> {
    const response = await fetch("/api/staff-dashboard?portal=cleaner", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || "Cleaner dashboard could not be loaded yet.");
    }

    return {
      profile: result.profile as Profile,
      account: (result.account ?? null) as CleanerAccount | null,
      warning: (result.warning ?? null) as string | null,
      jobs: (result.jobs ?? []) as CleanerJob[],
      properties: (result.properties ?? []) as Property[],
      accessRows: (result.accessRows ?? []) as AccessRow[],
      sops: (result.sops ?? []) as Sop[],
      sopImages: (result.sopImages ?? []) as SopImage[],
    };
  }

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
            await refreshCleanerJobs();
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
      if (document.visibilityState !== "visible") return;
      void refreshCleanerJobs();
    }, 600000);

    return () => window.clearInterval(interval);
  }, [cleanerAccount?.id]);

  async function loadCleanerAccount(
    profileId: string
  ): Promise<{
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
      const primaryAccount =
        accounts.find((a) => a.id === memberships[0].cleaner_account_id) || accounts[0] || null;

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
      .select("id, organization_id, name, address, notes")
      .in("id", propertyIds);

    if (error) throw error;

    return (data ?? []) as Property[];
  }

  async function loadCleanerJobs(cleanerAccountId: string): Promise<CleanerJob[]> {
    setJobsWarning(null);

    try {
      let slotResult: any = await supabase
        .from("turnover_job_slots")
        .select(
          "id, job_id, slot_number, cleaner_account_id, status, offered_at, accepted_at, declined_at, started_at, finished_at, expires_at, accepted_by_profile_id, declined_by_profile_id, started_by_profile_id, finished_by_profile_id, created_at, updated_at"
        )
        .eq("cleaner_account_id", cleanerAccountId)
        .order("created_at", { ascending: false });

      if (slotResult.error?.code === "42703") {
        slotResult = await supabase
          .from("turnover_job_slots")
          .select(
            "id, job_id, slot_number, cleaner_account_id, status, offered_at, accepted_at, declined_at, expires_at, accepted_by_profile_id, declined_by_profile_id, created_at, updated_at"
          )
          .eq("cleaner_account_id", cleanerAccountId)
          .order("created_at", { ascending: false });
      }

      const slotData = slotResult.data;
      const slotError = slotResult.error;

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

      const allSlots = (allSlotData ?? []) as Array<{
        id: string;
        job_id: string;
        status: string | null;
      }>;
      const slotCounts = new Map<string, { total: number; accepted: number }>();

      for (const slot of allSlots) {
        const current = slotCounts.get(slot.job_id) || { total: 0, accepted: 0 };
        current.total += 1;
        if (["accepted", "in_progress", "completed"].includes((slot.status || "").toLowerCase().trim())) {
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
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setPageError("Your login session expired. Please log in again.");
      return;
    }

    const dashboard = await loadCleanerDashboardFromServer(session.access_token);
    setProfile(dashboard.profile);
    setCleanerAccount(dashboard.account);
    setAccountWarning(dashboard.warning);
    setCleanerJobs(dashboard.jobs);
    setProperties(dashboard.properties);
    setAccessRows(dashboard.accessRows);
    setSops(dashboard.sops);
    setSopImages(dashboard.sopImages);
  }

  function handleCloseDetails() {
    setSelectionDismissed(true);
    setSelectedSlotId(null);
  }

  async function handleAcceptJob() {
    if (!selectedCleanerJob || !profile?.id) return;

    const acceptedSlotId = selectedCleanerJob.slot.id;
    const acceptedJobDate = selectedCleanerJob.jobDate;

    setJobsWarning(null);
    setActionLoading("accept");
    setSelectionDismissed(false);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your login session expired. Please log in again.");
      }

      const response = await fetch("/api/staff-job-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          portal: "cleaner",
          action: "accept",
          slotId: acceptedSlotId,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Could not accept job.");
      }

      await refreshCleanerJobs();

      if (acceptedJobDate) {
        setSelectedDate(acceptedJobDate);
      }

      setSelectedSlotId(acceptedSlotId);
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
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your login session expired. Please log in again.");
      }

      const response = await fetch("/api/staff-job-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          portal: "cleaner",
          action: "decline",
          slotId: selectedCleanerJob.slot.id,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Could not decline job.");
      }

      const declinedSlotId = selectedCleanerJob.slot.id;
      await refreshCleanerJobs();

      setSelectedSlotId((current) => (current === declinedSlotId ? null : current));
    } catch (error: any) {
      setJobsWarning(error?.message || "Could not decline job.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleProgressAction(action: "start" | "finish") {
    if (!selectedCleanerJob || !profile?.id) return;

    setJobsWarning(null);
    setActionLoading(action);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your login session expired. Please log in again.");
      }

      const response = await fetch("/api/staff-job-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          portal: "cleaner",
          action,
          slotId: selectedCleanerJob.slot.id,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Could not ${action} job.`);
      }

      const slotId = selectedCleanerJob.slot.id;
      await refreshCleanerJobs();
      setSelectedSlotId(slotId);

      const pushErrors = Array.isArray(payload.progressPush?.errors) ? payload.progressPush.errors : [];
      if (pushErrors.length > 0) {
        setJobsWarning(`Job ${action === "start" ? "started" : "finished"}, but admin push notification failed: ${pushErrors[0]}`);
      }
    } catch (error: any) {
      setJobsWarning(error?.message || `Could not ${action} job.`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleStartJob() {
    await handleProgressAction("start");
  }

  async function handleFinishJob() {
    await handleProgressAction("finish");
  }

  useEffect(() => {
    let active = true;

    async function loadGroundsSummary() {
      if (!profile?.id) {
        if (active) {
          setCanSwitchToGrounds(false);
          setGroundsWaitingCount(0);
        }
        return;
      }

      const { data: memberships, error: membershipsError } = await supabase
        .from("grounds_account_members")
        .select("grounds_account_id")
        .eq("profile_id", profile.id);

      if (membershipsError || !memberships?.length) {
        if (active) {
          setCanSwitchToGrounds(false);
          setGroundsWaitingCount(0);
        }
        return;
      }

      const accountIds = [...new Set(memberships.map((row: any) => row.grounds_account_id).filter(Boolean))];

      if (!accountIds.length) {
        if (active) {
          setCanSwitchToGrounds(false);
          setGroundsWaitingCount(0);
        }
        return;
      }

      const { count, error: countError } = await supabase
        .from("grounds_job_slots")
        .select("id", { count: "exact", head: true })
        .in("grounds_account_id", accountIds)
        .eq("status", "offered");

      if (!active) return;

      setCanSwitchToGrounds(true);
      setGroundsWaitingCount(countError ? 0 : count ?? 0);
    }

    void loadGroundsSummary();

    return () => {
      active = false;
    };
  }, [profile?.id]);

  function handleSwitchToGrounds() {
    router.push("/grounds");
  }

  useEffect(() => {
    const organizationId = properties.find((property) => property.organization_id)?.organization_id || null;
    if (!profile?.id || !organizationId) return;

    trackFeatureUsage({
      organizationId,
      portal: "cleaner",
      area: "portal",
      featureKey: "cleaner.dashboard",
      featureLabel: "Cleaner Dashboard",
      action: "open",
      metadata: {
        mode,
      },
    });
  }, [mode, profile?.id, properties]);

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

  const activeJobs = useMemo(() => {
    const todayYmd = toYmd(now);

    return filteredJobs.filter((item) => {
      const slotStatus = (item.slot.status || "").toLowerCase().trim();
      const staffingStatus = (item.job.staffing_status || "").toLowerCase().trim();
      const isUrgent = slotStatus === "offered" || slotStatus === "stranded" || staffingStatus === "stranded";

      if (isUrgent) return true;
      if (slotStatus === "completed") return false;
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
      if (slotStatus === "completed") return true;
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
    if (selectedSlotId && cleanerJobs.some((item) => item.slot.id === selectedSlotId)) {
      return;
    }

    if (selectionDismissed) {
      if (cleanerJobs.length === 0) {
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
  }, [cleanerJobs, selectedSlotId, unacceptedJobs, activeJobs, historyJobs, selectionDismissed]);

  useEffect(() => {
    if (selectedSlotId) {
      setSelectionDismissed(false);
    }
  }, [selectedSlotId]);

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
    setSelectedDate(null);
    if (unacceptedJobs[0]) {
      setSelectedSlotId(unacceptedJobs[0].slot.id);
    }
    setJobsCollapsed(false);
    window.setTimeout(() => {
      jobsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function scrollToChatSection() {
    chatSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const conversationId = params.get("conversationId")?.trim() || "";
    if (conversationId) {
      setTargetChatConversationId(conversationId);
    }
    if (params.get("open") === "chat") {
      window.setTimeout(() => scrollToChatSection(), 250);
    }
  }, []);

  const viewProps: CleanerViewProps = {
    loading,
    signingOut,
    actionLoading,
    parseJobNotes,
    profile,
    cleanerAccount,
    properties,
    cleanerJobs,
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
    selectedCleanerJob,
    selectedJobProperty,
    selectedJobAccess,
    selectedJobSops,
    jobsSectionRef,
    handleDateClick,
    handleJobClick,
    scrollToJobsSection,
    handleAcceptJob,
    handleDeclineJob,
    handleStartJob,
    handleFinishJob,
    handleCloseDetails,
    handleSignOut,
    refreshCleanerJobs,
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
    canSwitchToGrounds,
    groundsWaitingCount,
    handleSwitchToGrounds,
  };

  const shellView = mode === "mobile" ? <CleanerMobileView {...viewProps} /> : <CleanerDesktopView {...viewProps} />;

  return (
    <>
      {shellView}
      {profile ? <PushNotificationControl /> : null}
      {profile && chatUnreadCount > 0 ? (
        <button
          type="button"
          onClick={scrollToChatSection}
          className="fixed bottom-4 right-4 z-40 rounded-full border border-[#e3c177]/50 bg-[#d3322b] px-4 py-3 text-sm font-bold text-white shadow-[0_18px_45px_rgba(0,0,0,0.24)] transition hover:brightness-110"
        >
          Chat {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
        </button>
      ) : null}
      {profile ? (
        <div ref={chatSectionRef} className="bg-[#100d0a] px-3 pb-[35vh] sm:px-6">
          <div className="mx-auto max-w-7xl">
            <PortalChat
              participant={{
                type: "profile",
                profileId: profile.id,
                displayName: profile.full_name,
                email: profile.email,
                role: profile.role,
              }}
              title="Cleaner Chat"
              subtitle="Read and reply to chat from property management without email notifications for every message."
              targetConversationId={targetChatConversationId}
              onUnreadCountChange={setChatUnreadCount}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
