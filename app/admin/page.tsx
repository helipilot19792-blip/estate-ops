"use client";

import Image from "next/image";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Property = {
  id: string;
  name: string | null;
  address: string | null;
  notes?: string | null;
  default_cleaner_units_needed: number;
  cleaner_units_required_strict: boolean;
  show_team_status_to_cleaners: boolean;
};

type CleanerAccount = {
  id: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  active: boolean | null;
  created_at?: string | null;
};

type CleanerAccountMember = {
  id: string;
  cleaner_account_id: string;
  profile_id: string;
  created_at?: string | null;
};

type Assignment = {
  id: string;
  property_id: string;
  cleaner_account_id: string;
  priority: number;
  created_at?: string | null;
};

type Job = {
  id: string;
  property_id: string;
  status: string | null;
  notes: string | null;
  created_at?: string | null;
  scheduled_for?: string | null;
  cleaner_units_needed: number;
  cleaner_units_required_strict: boolean;
  show_team_status_to_cleaners: boolean;
  staffing_status: string | null;
};

type JobSlot = {
  id: string;
  job_id: string;
  slot_number: number;
  cleaner_account_id: string | null;
  status: string;
  offered_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  expires_at?: string | null;
  accepted_by_profile_id?: string | null;
  declined_by_profile_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};


type GroundsAccount = {
  id: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  active: boolean | null;
  created_at?: string | null;
};

type GroundsAccountMember = {
  id: string;
  grounds_account_id: string;
  profile_id: string;
  created_at?: string | null;
};

type GroundsAssignment = {
  id: string;
  property_id: string;
  grounds_account_id: string;
  priority: number;
  created_at?: string | null;
};

type GroundsJob = {
  id: string;
  property_id: string;
  status: string | null;
  notes: string | null;
  created_at?: string | null;
  scheduled_for?: string | null;
  service_window_start?: string | null;
  service_window_end?: string | null;
  grounds_units_needed: number;
  grounds_units_required_strict: boolean;
  show_team_status_to_grounds: boolean;
  staffing_status: string | null;
  job_type: string | null;
  needs_secure_access: boolean;
  needs_garage_access: boolean;
  recurring_task_id?: string | null;
  offered_at?: string | null;
  accepted_at?: string | null;
  completed_at?: string | null;
  canceled_at?: string | null;
  updated_at?: string | null;
};

type GroundsJobSlot = {
  id: string;
  job_id: string;
  slot_number: number;
  grounds_account_id: string | null;
  status: string;
  offered_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  expires_at?: string | null;
  accepted_by_profile_id?: string | null;
  declined_by_profile_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type GroundsRecurringTask = {
  id: string;
  property_id: string;
  task_type: string;
  label: string | null;
  notes: string | null;
  day_of_week: number;
  frequency_type: string;
  interval_weeks: number;
  week_anchor_date: string;
  due_time?: string | null;
  reminder_hours_before: number;
  needs_photo_proof: boolean;
  active: boolean;
  season_start?: string | null;
  season_end?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};


type GroundsRecurringRule = {
  id: string;
  property_id: string;
  task_type: string;
  label: string | null;
  notes: string | null;
  frequency_type: string;
  interval_days: number | null;
  day_of_week: number | null;
  day_of_month: number | null;
  semi_monthly_day_1: number | null;
  semi_monthly_day_2: number | null;
  anchor_date: string | null;
  start_date: string;
  end_date: string | null;
  next_run_date: string | null;
  grounds_units_needed: number;
  grounds_units_required_strict: boolean;
  show_team_status_to_grounds: boolean;
  needs_secure_access: boolean;
  needs_garage_access: boolean;
  active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type StrandedJob = {
  id: string;
  property_id: string | null;
  property_name: string | null;
  property_address: string | null;
  status: string | null;
  notes: string | null;
  created_at?: string | null;
  scheduled_for?: string | null;
  cleaner_units_needed: number | null;
  cleaner_units_required_strict: boolean | null;
  staffing_status: string | null;
};

type AccessRow = {
  id: string;
  property_id: string;
  door_code: string | null;
  alarm_code: string | null;
  notes: string | null;
};

type SopRow = {
  id: string;
  property_id: string;
  title: string | null;
  content: string | null;
  created_at?: string | null;
};

type SopImageRow = {
  id: string;
  sop_id: string;
  image_url: string;
  caption: string | null;
  sort_order: number;
  created_at?: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string;
  created_at?: string | null;
};

type PropertyCalendarRow = {
  id: string;
  property_id: string;
  source: string;
  ical_url: string;
  is_active: boolean | null;
  last_synced_at?: string | null;
  created_at?: string | null;
};

type MaintenanceFlagRow = {
  id: string;
  property_id?: string | null;
  source?: string | null;
  category?: string | null;
  urgency?: string | null;
  status?: string | null;
  notes?: string | null;
  flagged_by_profile_id?: string | null;
  flagged_at?: string | null;
  resolved_at?: string | null;
  resolved_by_profile_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  title?: string | null;
  description?: string | null;
  priority?: string | null;
  severity?: string | null;
  due_at?: string | null;
  [key: string]: any;
};

type MaintenanceFlagImageRow = {
  id: string;
  flag_id: string;
  image_url: string;
  caption?: string | null;
  sort_order: number;
  created_at?: string | null;
};

type AdminSection =
  | "users"
  | "properties"
  | "cleanerAccounts"
  | "groundsAccounts"
  | "assignments"
  | "jobs"
  | "maintenance";

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

function extractCheckoutDate(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/Checkout date:\s*(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

function getResponseWindowHours(jobDate: string | null, now: Date) {
  if (!jobDate) return 8;
  const job = new Date(`${jobDate}T12:00:00`);
  const diffHours = (job.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (diffHours > 24 * 7) return 48;
  if (diffHours > 48) return 8;
  return 2;
}

function getDeadline(
  job: { scheduled_for?: string | null; notes: string | null },
  firstOfferedAt: string | null | undefined,
  now: Date
) {
  if (!firstOfferedAt) return null;
  const offered = new Date(firstOfferedAt);
  if (Number.isNaN(offered.getTime())) return null;
  const jobDate = job.scheduled_for || extractCheckoutDate(job.notes);
  const hours = getResponseWindowHours(jobDate, now);
  return new Date(offered.getTime() + hours * 60 * 60 * 1000);
}

function getTimeRemainingMs(
  job: { scheduled_for?: string | null; notes: string | null },
  firstOfferedAt: string | null | undefined,
  now: Date
) {
  const deadline = getDeadline(job, firstOfferedAt, now);
  if (!deadline) return null;
  return deadline.getTime() - now.getTime();
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getCountdownTone(ms: number | null) {
  if (ms === null) return "text-[#8a7b68]";
  if (ms < 0) return "text-red-600";
  if (ms <= 2 * 60 * 60 * 1000) return "text-amber-600";
  return "text-[#7f5d28]";
}

const MAINTENANCE_CATEGORY_OPTIONS = [
  "Lawn / exterior",
  "Plumbing",
  "Electrical",
  "HVAC",
  "Appliances",
  "Cleaning issue",
  "Damage",
  "Supplies",
  "Lock / access",
  "Pest issue",
  "Safety issue",
  "Other",
];

const GROUNDS_JOB_TYPE_OPTIONS = [
  { value: "lawn_cut", label: "Lawn Cut" },
  { value: "yard_cleanup", label: "Yard Cleanup" },
  { value: "garbage_out", label: "Garbage Out" },
  { value: "recycling_out", label: "Recycling Out" },
  { value: "yard_waste_out", label: "Yard Waste Out" },
  { value: "bulk_pickup_out", label: "Bulk Pickup Out" },
  { value: "snow_clear", label: "Snow Clear" },
  { value: "salt", label: "Salt / Ice" },
  { value: "exterior_check", label: "Exterior Check" },
  { value: "storm_cleanup", label: "Storm Cleanup" },
  { value: "other", label: "Other" },
];

const PROPERTY_CALENDAR_COLORS = [
  { bg: "#e8f1ff", text: "#1d4ed8", border: "#bfdbfe" },
  { bg: "#ecfdf3", text: "#047857", border: "#a7f3d0" },
  { bg: "#fff7ed", text: "#c2410c", border: "#fdba74" },
  { bg: "#faf5ff", text: "#7c3aed", border: "#d8b4fe" },
  { bg: "#fdf2f8", text: "#be185d", border: "#f9a8d4" },
  { bg: "#eff6ff", text: "#2563eb", border: "#93c5fd" },
  { bg: "#f0fdf4", text: "#15803d", border: "#86efac" },
  { bg: "#fff1f2", text: "#be123c", border: "#fda4af" },
];

function getPropertyColor(propertyId: string | null) {
  if (!propertyId) {
    return { bg: "#f4efe8", text: "#6f6255", border: "#d8c7ab" };
  }

  let hash = 0;
  for (let i = 0; i < propertyId.length; i += 1) {
    hash = (hash * 31 + propertyId.charCodeAt(i)) >>> 0;
  }

  return PROPERTY_CALENDAR_COLORS[hash % PROPERTY_CALENDAR_COLORS.length];
}

export default function AdminPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentAdminUserId, setCurrentAdminUserId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [adminCalendarMonth, setAdminCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [adminSelectedDate, setAdminSelectedDate] = useState<string | null>(() => toYmd(new Date()));
  const [activeSection, setActiveSection] = useState<AdminSection>("users");

  const [properties, setProperties] = useState<Property[]>([]);
  const [cleanerAccounts, setCleanerAccounts] = useState<CleanerAccount[]>([]);
  const [cleanerAccountMembers, setCleanerAccountMembers] = useState<CleanerAccountMember[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobSlots, setJobSlots] = useState<JobSlot[]>([]);
  const [groundsAccounts, setGroundsAccounts] = useState<GroundsAccount[]>([]);
  const [groundsAccountMembers, setGroundsAccountMembers] = useState<GroundsAccountMember[]>([]);
  const [groundsAssignments, setGroundsAssignments] = useState<GroundsAssignment[]>([]);
  const [groundsJobs, setGroundsJobs] = useState<GroundsJob[]>([]);
  const [groundsJobSlots, setGroundsJobSlots] = useState<GroundsJobSlot[]>([]);
  const [groundsRecurringTasks, setGroundsRecurringTasks] = useState<GroundsRecurringTask[]>([]);
  const [groundsRecurringRules, setGroundsRecurringRules] = useState<GroundsRecurringRule[]>([]);
  const [strandedJobs, setStrandedJobs] = useState<StrandedJob[]>([]);
  const [accessRows, setAccessRows] = useState<AccessRow[]>([]);
  const [sops, setSops] = useState<SopRow[]>([]);
  const [sopImages, setSopImages] = useState<SopImageRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [propertyCalendars, setPropertyCalendars] = useState<PropertyCalendarRow[]>([]);
  const [maintenanceFlags, setMaintenanceFlags] = useState<MaintenanceFlagRow[]>([]);
  const [maintenanceFlagImages, setMaintenanceFlagImages] = useState<MaintenanceFlagImageRow[]>([]);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [actingOnProfileId, setActingOnProfileId] = useState<string | null>(null);
  const [savingCalendars, setSavingCalendars] = useState(false);
  const [uploadingSop, setUploadingSop] = useState(false);
  const [jobsExpanded, setJobsExpanded] = useState(false);
  const [reassignSelections, setReassignSelections] = useState<Record<string, string>>({});
  const [reassigningJobId, setReassigningJobId] = useState<string | null>(null);
  const [highlightedJobId, setHighlightedJobId] = useState<string | null>(null);
  const [syncingCalendarsNow, setSyncingCalendarsNow] = useState(false);
  const [deletingPropertyId, setDeletingPropertyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [selectedJobsPropertyFilter, setSelectedJobsPropertyFilter] = useState("all");
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [maintenanceFormPropertyId, setMaintenanceFormPropertyId] = useState("");
  const [maintenanceFormCategory, setMaintenanceFormCategory] = useState("");
  const [maintenanceFormUrgency, setMaintenanceFormUrgency] = useState("normal");
  const [maintenanceFormNotes, setMaintenanceFormNotes] = useState("");
  const [maintenanceFormError, setMaintenanceFormError] = useState("");
  const [creatingMaintenanceFlag, setCreatingMaintenanceFlag] = useState(false);
  const [resolvingMaintenanceFlagId, setResolvingMaintenanceFlagId] = useState<string | null>(null);
  const [deletingMaintenanceFlagId, setDeletingMaintenanceFlagId] = useState<string | null>(null);
  const [maintenanceHistoryExpanded, setMaintenanceHistoryExpanded] = useState(false);
  const [deletingResolvedMaintenanceFlags, setDeletingResolvedMaintenanceFlags] = useState(false);

  const [propertyName, setPropertyName] = useState("");
  const [propertyStreet, setPropertyStreet] = useState("");
  const [propertyCity, setPropertyCity] = useState("");
  const [propertyProvince, setPropertyProvince] = useState("");
  const [propertyPostal, setPropertyPostal] = useState("");
  const [propertyNotes, setPropertyNotes] = useState("");
  const [propertyUnitsNeeded, setPropertyUnitsNeeded] = useState("1");
  const [propertyUnitsStrict, setPropertyUnitsStrict] = useState(false);
  const [propertyShowTeamStatus, setPropertyShowTeamStatus] = useState(true);

  const [cleanerAccountName, setCleanerAccountName] = useState("");
  const [cleanerAccountEmail, setCleanerAccountEmail] = useState("");
  const [cleanerAccountPhone, setCleanerAccountPhone] = useState("");
  const [selectedCleanerMemberProfileIds, setSelectedCleanerMemberProfileIds] = useState<string[]>([]);

  const [groundsAccountName, setGroundsAccountName] = useState("");
  const [groundsAccountEmail, setGroundsAccountEmail] = useState("");
  const [groundsAccountPhone, setGroundsAccountPhone] = useState("");
  const [selectedGroundsMemberProfileIds, setSelectedGroundsMemberProfileIds] = useState<string[]>([]);

  const [assignmentPropertyId, setAssignmentPropertyId] = useState("");
  const [assignmentCleanerProfileId, setAssignmentCleanerProfileId] = useState("");
  const [assignmentPriority, setAssignmentPriority] = useState("1");

  const [groundsAssignmentPropertyId, setGroundsAssignmentPropertyId] = useState("");
  const [groundsAssignmentProfileId, setGroundsAssignmentProfileId] = useState("");
  const [groundsAssignmentPriority, setGroundsAssignmentPriority] = useState("1");

  const [groundsJobPropertyId, setGroundsJobPropertyId] = useState("");
  const [groundsJobType, setGroundsJobType] = useState("lawn_cut");
  const [groundsJobScheduledFor, setGroundsJobScheduledFor] = useState("");
  const [groundsJobNotes, setGroundsJobNotes] = useState("");
  const [groundsJobOverrideUnitsEnabled, setGroundsJobOverrideUnitsEnabled] = useState(false);
  const [groundsJobUnitsNeeded, setGroundsJobUnitsNeeded] = useState("1");
  const [groundsJobUnitsStrict, setGroundsJobUnitsStrict] = useState(false);
  const [groundsJobShowTeamStatus, setGroundsJobShowTeamStatus] = useState(true);
  const [groundsJobNeedsSecureAccess, setGroundsJobNeedsSecureAccess] = useState(false);
  const [groundsJobNeedsGarageAccess, setGroundsJobNeedsGarageAccess] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringType, setRecurringType] = useState("weekly");

  const [jobPropertyId, setJobPropertyId] = useState("");

  const [jobNotes, setJobNotes] = useState("");
  const [jobOverrideUnitsEnabled, setJobOverrideUnitsEnabled] = useState(false);
  const [jobUnitsNeeded, setJobUnitsNeeded] = useState("1");
  const [jobUnitsStrict, setJobUnitsStrict] = useState(false);
  const [jobShowTeamStatus, setJobShowTeamStatus] = useState(true);

  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedPropertyUnitsNeeded, setSelectedPropertyUnitsNeeded] = useState("1");
  const [selectedPropertyUnitsStrict, setSelectedPropertyUnitsStrict] = useState(false);
  const [selectedPropertyShowTeamStatus, setSelectedPropertyShowTeamStatus] = useState(true);
  const [savingSelectedPropertyDefaults, setSavingSelectedPropertyDefaults] = useState(false);
  const [doorCode, setDoorCode] = useState("");
  const [alarmCode, setAlarmCode] = useState("");
  const [accessNotes, setAccessNotes] = useState("");
  const [accessDirty, setAccessDirty] = useState(false);
  const [propertyDefaultsDirty, setPropertyDefaultsDirty] = useState(false);

  const [calendarRowsDraft, setCalendarRowsDraft] = useState<
    Array<{ id?: string; source: string; ical_url: string; is_active: boolean }>
  >([]);
  const [calendarDraftDirty, setCalendarDraftDirty] = useState(false);

  const [sopTitle, setSopTitle] = useState("");
  const [sopContent, setSopContent] = useState("");
  const [sopFiles, setSopFiles] = useState<File[]>([]);

  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});
  const [groundsLinkSelections, setGroundsLinkSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    async function checkAuthAndRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id,email,full_name,phone,role")
        .eq("id", user.id)
        .single<ProfileRow>();

      if (profileError || !profile || profile.role !== "admin") {
        router.push("/login");
        return;
      }

      setCurrentAdminUserId(user.id);
      setCheckingAuth(false);
    }

    void checkAuthAndRole();
  }, [router]);

  useEffect(() => {
    if (!checkingAuth) {
      void loadData();
    }
  }, [checkingAuth]);

  useEffect(() => {
    if (checkingAuth) return;
    const interval = window.setInterval(() => void loadData(), 15000);
    return () => window.clearInterval(interval);
  }, [checkingAuth]);

  useEffect(() => {
    setCalendarDraftDirty(false);
    setAccessDirty(false);
    setPropertyDefaultsDirty(false);
  }, [selectedPropertyId]);

  useEffect(() => {
    if (!selectedPropertyId) {
      setDoorCode("");
      setAlarmCode("");
      setAccessNotes("");
      setCalendarRowsDraft([]);
      setCalendarDraftDirty(false);
      setAccessDirty(false);
      setPropertyDefaultsDirty(false);
      return;
    }

    const existingAccess = accessRows.find((x) => x.property_id === selectedPropertyId);
    if (!accessDirty) {
      setDoorCode(existingAccess?.door_code ?? "");
      setAlarmCode(existingAccess?.alarm_code ?? "");
      setAccessNotes(existingAccess?.notes ?? "");
    }

    if (!calendarDraftDirty) {
      const selectedCalendars = propertyCalendars
        .filter((x) => x.property_id === selectedPropertyId)
        .map((x) => ({
          id: x.id,
          source: x.source || "",
          ical_url: x.ical_url || "",
          is_active: x.is_active !== false,
        }));

      setCalendarRowsDraft(selectedCalendars);
    }

    const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
    if (!propertyDefaultsDirty) {
      setSelectedPropertyUnitsNeeded(String(selectedProperty?.default_cleaner_units_needed || 1));
      setSelectedPropertyUnitsStrict(!!selectedProperty?.cleaner_units_required_strict);
      setSelectedPropertyShowTeamStatus(selectedProperty?.show_team_status_to_cleaners !== false);
    }
  }, [
    selectedPropertyId,
    accessRows,
    propertyCalendars,
    properties,
    calendarDraftDirty,
    accessDirty,
    propertyDefaultsDirty,
  ]);

  async function loadData() {
    setError("");

    const [
      propertiesRes,
      cleanerAccountsRes,
      cleanerAccountMembersRes,
      assignmentsRes,
      jobsRes,
      jobSlotsRes,
      groundsAccountsRes,
      groundsAccountMembersRes,
      groundsAssignmentsRes,
      groundsJobsRes,
      groundsJobSlotsRes,
      groundsRecurringTasksRes,
      groundsRecurringRulesRes,
      strandedJobsRes,
      accessRowsRes,
      sopsRes,
      sopImagesRes,
      profilesRes,
      propertyCalendarsRes,
      maintenanceFlagsRes,
      maintenanceFlagImagesRes,
    ] = await Promise.all([
      supabase.from("properties").select("*").order("created_at", { ascending: false }),
      supabase.from("cleaner_accounts").select("*").order("created_at", { ascending: false }),
      supabase.from("cleaner_account_members").select("*").order("created_at", { ascending: false }),
      supabase
        .from("property_cleaner_account_assignments")
        .select("*")
        .order("priority", { ascending: true }),
      supabase.from("turnover_jobs").select("*").order("created_at", { ascending: false }),
      supabase.from("turnover_job_slots").select("*").order("job_id", { ascending: true }),
      supabase.from("grounds_accounts").select("*").order("created_at", { ascending: false }),
      supabase.from("grounds_account_members").select("*").order("created_at", { ascending: false }),
      supabase
        .from("property_grounds_account_assignments")
        .select("*")
        .order("priority", { ascending: true }),
      supabase.from("grounds_jobs").select("*").order("created_at", { ascending: false }),
      supabase.from("grounds_job_slots").select("*").order("job_id", { ascending: true }),
      supabase
        .from("property_grounds_recurring_tasks")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("property_grounds_recurring_rules")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("admin_stranded_jobs").select("*").order("created_at", { ascending: true }),
      supabase.from("property_access").select("*"),
      supabase.from("property_sops").select("*").order("created_at", { ascending: false }),
      supabase.from("property_sop_images").select("*").order("sort_order", { ascending: true }),
      supabase
        .from("profiles")
        .select("id,email,full_name,phone,role,created_at")
        .order("created_at", { ascending: false }),
      supabase.from("property_calendars").select("*").order("created_at", { ascending: false }),
      supabase.from("property_maintenance_flags").select("*").order("created_at", { ascending: false }),
      supabase.from("property_maintenance_flag_images").select("*").order("sort_order", { ascending: true }),
    ]);

    const responses = [
      propertiesRes,
      cleanerAccountsRes,
      cleanerAccountMembersRes,
      assignmentsRes,
      jobsRes,
      jobSlotsRes,
      groundsAccountsRes,
      groundsAccountMembersRes,
      groundsAssignmentsRes,
      groundsJobsRes,
      groundsJobSlotsRes,
      groundsRecurringTasksRes,
      groundsRecurringRulesRes,
      strandedJobsRes,
      accessRowsRes,
      sopsRes,
      sopImagesRes,
      profilesRes,
      propertyCalendarsRes,
      maintenanceFlagsRes,
      maintenanceFlagImagesRes,
    ];

    for (const response of responses) {
      if (response.error) {
        setError(response.error.message);
        return;
      }
    }

    setProperties((propertiesRes.data ?? []) as Property[]);
    setCleanerAccounts((cleanerAccountsRes.data ?? []) as CleanerAccount[]);
    setCleanerAccountMembers((cleanerAccountMembersRes.data ?? []) as CleanerAccountMember[]);
    setAssignments((assignmentsRes.data ?? []) as Assignment[]);
    setJobs((jobsRes.data ?? []) as Job[]);
    setJobSlots((jobSlotsRes.data ?? []) as JobSlot[]);
    setGroundsAccounts((groundsAccountsRes.data ?? []) as GroundsAccount[]);
    setGroundsAccountMembers((groundsAccountMembersRes.data ?? []) as GroundsAccountMember[]);
    setGroundsAssignments((groundsAssignmentsRes.data ?? []) as GroundsAssignment[]);
    setGroundsJobs((groundsJobsRes.data ?? []) as GroundsJob[]);
    setGroundsJobSlots((groundsJobSlotsRes.data ?? []) as GroundsJobSlot[]);
    setGroundsRecurringTasks((groundsRecurringTasksRes.data ?? []) as GroundsRecurringTask[]);
    setGroundsRecurringRules((groundsRecurringRulesRes.data ?? []) as GroundsRecurringRule[]);
    setStrandedJobs((strandedJobsRes.data ?? []) as StrandedJob[]);
    setAccessRows((accessRowsRes.data ?? []) as AccessRow[]);
    setSops((sopsRes.data ?? []) as SopRow[]);
    setSopImages((sopImagesRes.data ?? []) as SopImageRow[]);
    setProfiles((profilesRes.data ?? []) as ProfileRow[]);
    setPropertyCalendars((propertyCalendarsRes.data ?? []) as PropertyCalendarRow[]);
    setMaintenanceFlags((maintenanceFlagsRes.data ?? []) as MaintenanceFlagRow[]);
    setMaintenanceFlagImages((maintenanceFlagImagesRes.data ?? []) as MaintenanceFlagImageRow[]);

    setReassignSelections((prev) => {
      const next = { ...prev };
      for (const job of (strandedJobsRes.data ?? []) as StrandedJob[]) {
        if (!next[job.id]) next[job.id] = "";
      }
      return next;
    });
  }

  function handleSopFilesChange(e: ChangeEvent<HTMLInputElement>) {
    setSopFiles(Array.from(e.target.files ?? []));
  }

  function getAdminCount() {
    return profiles.filter((profile) => profile.role === "admin").length;
  }

  async function updateUserRole(profileId: string, newRole: string) {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;

    setError("");
    setActionMessage("");

    if (profile.role === newRole) return;

    if (newRole === "admin") {
      const confirmed = window.confirm(
        `Promote ${profile.full_name || profile.email || "this user"} to admin?\n\nAdmins have full control of the portal.`
      );
      if (!confirmed) return;
    }

    if (profileId === currentAdminUserId && newRole !== "admin") {
      setError("You cannot remove your own admin access.");
      return;
    }

    if (profile.role === "admin" && newRole !== "admin" && getAdminCount() <= 1) {
      setError("You cannot remove the last admin.");
      return;
    }

    setSavingRoleId(profileId);

    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", profileId);

    if (error) {
      setError(error.message);
      setSavingRoleId(null);
      return;
    }

    setActionMessage("User role updated.");
    await loadData();
    setSavingRoleId(null);
  }

  async function removeUserFromPortal(profile: ProfileRow) {
    setError("");
    setActionMessage("");

    if (profile.id === currentAdminUserId) {
      setError("You cannot remove yourself from the portal.");
      return;
    }

    if (profile.role === "admin" && getAdminCount() <= 1) {
      setError("You cannot remove the last admin.");
      return;
    }

    const confirmed = window.confirm(
      `Remove ${profile.full_name || profile.email || "this user"} from the portal?\n\nThis will set their role to pending and unlink them from shared cleaner accounts.`
    );
    if (!confirmed) return;

    setActingOnProfileId(profile.id);

    const { error: membershipError } = await supabase
      .from("cleaner_account_members")
      .delete()
      .eq("profile_id", profile.id);

    if (membershipError) {
      setError(membershipError.message);
      setActingOnProfileId(null);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ role: "pending" })
      .eq("id", profile.id);

    if (profileError) {
      setError(profileError.message);
      setActingOnProfileId(null);
      return;
    }

    setActionMessage("User removed from portal.");
    await loadData();
    setActingOnProfileId(null);
  }

  async function permanentlyDeleteUser(profile: ProfileRow) {
    setError("");
    setActionMessage("");

    if (profile.id === currentAdminUserId) {
      setError("You cannot permanently delete your own account.");
      return;
    }

    if (profile.role === "admin" && getAdminCount() <= 1) {
      setError("You cannot delete the last admin.");
      return;
    }

    const displayName = profile.full_name || profile.email || "this user";

    const confirmed = window.confirm(
      `Permanently delete ${displayName}?\n\nThis should remove their auth account completely.\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setActingOnProfileId(profile.id);

    try {
      const response = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profileId: profile.id,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Permanent delete failed.");
      }

      setActionMessage(payload?.message || "User permanently deleted.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Permanent delete failed.");
    } finally {
      setActingOnProfileId(null);
    }
  }

  async function deleteProperty(property: Property) {
    const propertyName = property.name || property.address || "this property";
    const confirmed = window.confirm(
      `Delete ${propertyName}?\n\nThis will also delete its calendars, access notes, SOPs, assignments, turnover jobs, and job slots.\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setError("");
    setActionMessage("");
    setDeletingPropertyId(property.id);

    try {
      const propertyJobIds = jobs.filter((job) => job.property_id === property.id).map((job) => job.id);
      const propertySopIds = sops.filter((sop) => sop.property_id === property.id).map((sop) => sop.id);

      if (propertyJobIds.length > 0) {
        const { error: slotDeleteError } = await supabase
          .from("turnover_job_slots")
          .delete()
          .in("job_id", propertyJobIds);

        if (slotDeleteError) throw slotDeleteError;

        const { error: jobDeleteError } = await supabase
          .from("turnover_jobs")
          .delete()
          .in("id", propertyJobIds);

        if (jobDeleteError) throw jobDeleteError;
      }

      if (propertySopIds.length > 0) {
        const { error: sopImageDeleteError } = await supabase
          .from("property_sop_images")
          .delete()
          .in("sop_id", propertySopIds);

        if (sopImageDeleteError) throw sopImageDeleteError;

        const { error: sopDeleteError } = await supabase
          .from("property_sops")
          .delete()
          .in("id", propertySopIds);

        if (sopDeleteError) throw sopDeleteError;
      }

      const cleanupTables = [
        ["property_calendars", "property_id"],
        ["property_access", "property_id"],
        ["property_cleaner_account_assignments", "property_id"],
      ] as const;

      for (const [table, column] of cleanupTables) {
        const { error: cleanupError } = await supabase
          .from(table)
          .delete()
          .eq(column, property.id);

        if (cleanupError) throw cleanupError;
      }

      const { error: propertyDeleteError } = await supabase
        .from("properties")
        .delete()
        .eq("id", property.id);

      if (propertyDeleteError) throw propertyDeleteError;

      if (selectedPropertyId === property.id) {
        setSelectedPropertyId("");
      }

      setActionMessage(`Property deleted: ${propertyName}`);
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not delete property.");
    } finally {
      setDeletingPropertyId(null);
    }
  }

  async function addProperty() {
    if (!propertyName.trim()) return;

    const { error } = await supabase.from("properties").insert({
      name: propertyName.trim(),
      address: `${propertyStreet}, ${propertyCity}, ${propertyProvince}, ${propertyPostal}`,
      notes: propertyNotes.trim() || null,
      default_cleaner_units_needed: Number(propertyUnitsNeeded),
      cleaner_units_required_strict: propertyUnitsStrict,
      show_team_status_to_cleaners: propertyShowTeamStatus,
    });

    if (error) {
      setError(error.message);
      return;
    }

    setPropertyName("");
    setPropertyStreet("");
    setPropertyCity("");
    setPropertyProvince("");
    setPropertyPostal("");
    setPropertyNotes("");
    setPropertyUnitsNeeded("1");
    setPropertyUnitsStrict(false);
    setPropertyShowTeamStatus(true);
    setActionMessage("Property added.");
    await loadData();
  }

  async function addCleanerAccount() {
    if (!cleanerAccountName.trim()) {
      setError("Cleaner account name is required.");
      return;
    }

    setError("");
    const { data: inserted, error } = await supabase
      .from("cleaner_accounts")
      .insert({
        display_name: cleanerAccountName.trim(),
        email: cleanerAccountEmail.trim() || null,
        phone: cleanerAccountPhone.trim() || null,
        active: true,
      })
      .select()
      .single();

    if (error || !inserted) {
      setError(error?.message || "Could not create cleaner account.");
      return;
    }

    if (selectedCleanerMemberProfileIds.length > 0) {
      const memberRows = selectedCleanerMemberProfileIds.map((profileId) => ({
        cleaner_account_id: inserted.id,
        profile_id: profileId,
      }));
      const { error: memberError } = await supabase.from("cleaner_account_members").insert(memberRows);
      if (memberError) {
        setError(memberError.message);
        return;
      }
    }

    setCleanerAccountName("");
    setCleanerAccountEmail("");
    setCleanerAccountPhone("");
    setSelectedCleanerMemberProfileIds([]);
    setActionMessage("Cleaner account linked.");
    await loadData();
  }


  async function linkCleanerToAccount(cleanerAccountId: string, profileId: string) {
    if (!cleanerAccountId || !profileId) {
      setError("Missing cleaner or account.");
      return;
    }

    setError("");
    setActionMessage("");

    const { error } = await supabase.from("cleaner_account_members").insert({
      cleaner_account_id: cleanerAccountId,
      profile_id: profileId,
    });

    if (error) {
      setError(error.message);
      return;
    }

    setLinkSelections((prev) => ({ ...prev, [cleanerAccountId]: "" }));
    setActionMessage("Cleaner linked to account.");
    await loadData();
  }

  async function unlinkCleanerFromAccount(cleanerAccountId: string, profileId: string) {
    const confirmed = window.confirm("Remove this cleaner from the account?");
    if (!confirmed) return;

    setError("");
    setActionMessage("");

    const { error } = await supabase
      .from("cleaner_account_members")
      .delete()
      .eq("cleaner_account_id", cleanerAccountId)
      .eq("profile_id", profileId);

    if (error) {
      setError(error.message);
      return;
    }

    setActionMessage("Cleaner removed.");
    await loadData();
  }

  async function addAssignment() {
    if (!assignmentPropertyId || !assignmentCleanerProfileId) {
      setError("Select property and cleaner.");
      return;
    }

    setError("");
    setActionMessage("");

    let cleanerAccountId: string | null = null;

    const existingMembership = cleanerAccountMembers.find(
      (member) => member.profile_id === assignmentCleanerProfileId
    );

    if (existingMembership) {
      cleanerAccountId = existingMembership.cleaner_account_id;
    } else {
      const cleanerProfile = profiles.find((p) => p.id === assignmentCleanerProfileId);

      const { data: insertedAccount, error: insertedAccountError } = await supabase
        .from("cleaner_accounts")
        .insert({
          display_name:
            cleanerProfile?.full_name || cleanerProfile?.email || "Cleaner account",
          email: cleanerProfile?.email || null,
          phone: cleanerProfile?.phone || null,
          active: true,
        })
        .select()
        .single();

      if (insertedAccountError || !insertedAccount) {
        setError(insertedAccountError?.message || "Could not create cleaner account.");
        return;
      }

      cleanerAccountId = insertedAccount.id;

      const { error: memberInsertError } = await supabase
        .from("cleaner_account_members")
        .insert({
          cleaner_account_id: cleanerAccountId,
          profile_id: assignmentCleanerProfileId,
        });

      if (memberInsertError) {
        setError(memberInsertError.message);
        return;
      }
    }

    const { error } = await supabase.from("property_cleaner_account_assignments").insert({
      property_id: assignmentPropertyId,
      cleaner_account_id: cleanerAccountId,
      priority: Number(assignmentPriority),
    });

    if (error) {
      setError(error.message);
      return;
    }

    setAssignmentPropertyId("");
    setAssignmentCleanerProfileId("");
    setAssignmentPriority("1");
    setActionMessage("Cleaner assigned to property.");
    await loadData();
  }

  async function createJob() {
    if (!jobPropertyId) return;

    const property = properties.find((p) => p.id === jobPropertyId);
    const extractedDate = extractCheckoutDate(jobNotes.trim() || null);

    const payload: Partial<Job> & { property_id: string; notes: string | null; scheduled_for: string | null } = {
      property_id: jobPropertyId,
      notes: jobNotes.trim() || null,
      scheduled_for: extractedDate,
    };

    if (jobOverrideUnitsEnabled) {
      payload.cleaner_units_needed = Number(jobUnitsNeeded);
      payload.cleaner_units_required_strict = jobUnitsStrict;
      payload.show_team_status_to_cleaners = jobShowTeamStatus;
    } else if (property) {
      payload.cleaner_units_needed = property.default_cleaner_units_needed;
      payload.cleaner_units_required_strict = property.cleaner_units_required_strict;
      payload.show_team_status_to_cleaners = property.show_team_status_to_cleaners;
    }

    setError("");
    setActionMessage("");

    const { data: insertedJob, error } = await supabase
      .from("turnover_jobs")
      .insert(payload)
      .select()
      .single();

    if (error || !insertedJob) {
      setError(error?.message || "Could not create job.");
      return;
    }

    const slotCheck = await supabase
      .from("turnover_job_slots")
      .select("id", { count: "exact", head: true })
      .eq("job_id", insertedJob.id);

    if (!slotCheck.error && (slotCheck.count ?? 0) === 0) {
      const slotCreate = await supabase.rpc("create_slots_for_job", {
        p_job_id: insertedJob.id,
      });

      if (slotCreate.error) {
        setError(`Job created, but slot creation failed: ${slotCreate.error.message}`);
        await loadData();
        return;
      }
    }

    setJobPropertyId("");
    setJobNotes("");
    setJobOverrideUnitsEnabled(false);
    setJobUnitsNeeded("1");
    setJobUnitsStrict(false);
    setJobShowTeamStatus(true);
    setActionMessage("Job created successfully.");
    await loadData();
  }

  async function syncCalendarsNow() {
    setError("");
    setActionMessage("");
    setSyncingCalendarsNow(true);

    try {
      const response = await fetch("/api/sync-calendars", {
        method: "POST",
      });

      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || "Calendar sync failed.");
      }

      setActionMessage(payload?.message || "Calendars synced successfully.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Calendar sync failed.");
    } finally {
      setSyncingCalendarsNow(false);
    }
  }

  async function reassignStrandedJob(jobId: string) {
    const cleanerAccountId = reassignSelections[jobId];
    if (!cleanerAccountId) {
      setError("Please select a cleaner account before assigning.");
      return;
    }

    const slot = jobSlots
      .filter((x) => x.job_id === jobId)
      .sort((a, b) => a.slot_number - b.slot_number)
      .find((x) => x.status === "stranded" || x.cleaner_account_id === null);

    if (!slot) {
      setError("No stranded slot was found for that job.");
      return;
    }

    setError("");
    setReassigningJobId(jobId);

    const responseHours = getResponseWindowHours(
      jobs.find((j) => j.id === jobId)?.scheduled_for ||
      extractCheckoutDate(jobs.find((j) => j.id === jobId)?.notes || null),
      new Date()
    );

    const { error } = await supabase
      .from("turnover_job_slots")
      .update({
        cleaner_account_id: cleanerAccountId,
        status: "offered",
        offered_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + responseHours * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
        declined_at: null,
        accepted_by_profile_id: null,
        declined_by_profile_id: null,
      })
      .eq("id", slot.id);

    if (error) {
      setError(error.message);
      setReassigningJobId(null);
      return;
    }

    setActionMessage("Stranded job reassigned.");
    await loadData();
    setReassigningJobId(null);
  }

  function getNextOpenSlot(jobId: string) {
    return jobSlots
      .filter((x) => x.job_id === jobId)
      .sort((a, b) => a.slot_number - b.slot_number)
      .find((x) => x.status !== "accepted");
  }

  async function reassignOpenJob(jobId: string) {
    const cleanerAccountId = reassignSelections[jobId];
    if (!cleanerAccountId) {
      setError("Please select a cleaner account before reassigning.");
      return;
    }

    const slot = getNextOpenSlot(jobId);

    if (!slot) {
      setError("No open slot was found for that job.");
      return;
    }

    setError("");
    setActionMessage("");
    setReassigningJobId(jobId);

    const responseHours = getResponseWindowHours(
      jobs.find((j) => j.id === jobId)?.scheduled_for ||
      extractCheckoutDate(jobs.find((j) => j.id === jobId)?.notes || null),
      new Date()
    );

    const { error } = await supabase
      .from("turnover_job_slots")
      .update({
        cleaner_account_id: cleanerAccountId,
        status: "offered",
        offered_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + responseHours * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
        declined_at: null,
        accepted_by_profile_id: null,
        declined_by_profile_id: null,
      })
      .eq("id", slot.id);

    if (error) {
      setError(error.message);
      setReassigningJobId(null);
      return;
    }

    setActionMessage("Job reassigned.");
    await loadData();
    setReassigningJobId(null);

    setTimeout(() => {
      document.getElementById(`job-${jobId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  async function deleteCleanerAccount(account: CleanerAccount) {
    const displayName = account.display_name || account.email || "this cleaner account";
    const confirmed = window.confirm(
      `Delete ${displayName}?\n\nThis removes its linked members and deletes the cleaner account.`
    );
    if (!confirmed) return;

    setError("");
    setActionMessage("");
    setReassigningJobId(account.id);

    try {
      const response = await fetch("/api/admin/delete-cleaner-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cleanerAccountId: account.id,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Could not delete cleaner account.");
      }

      setActionMessage("Cleaner account deleted.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not delete cleaner account.");
    } finally {
      setReassigningJobId(null);
    }
  }

  async function addGroundsAccount() {
    if (!groundsAccountName.trim()) {
      setError("Grounds account name is required.");
      return;
    }

    setError("");
    const { data: inserted, error } = await supabase
      .from("grounds_accounts")
      .insert({
        display_name: groundsAccountName.trim(),
        email: groundsAccountEmail.trim() || null,
        phone: groundsAccountPhone.trim() || null,
        active: true,
      })
      .select()
      .single();

    if (error || !inserted) {
      setError(error?.message || "Could not create grounds account.");
      return;
    }

    if (selectedGroundsMemberProfileIds.length > 0) {
      const memberRows = selectedGroundsMemberProfileIds.map((profileId) => ({
        grounds_account_id: inserted.id,
        profile_id: profileId,
      }));
      const { error: memberError } = await supabase.from("grounds_account_members").insert(memberRows);
      if (memberError) {
        setError(memberError.message);
        return;
      }
    }

    setGroundsAccountName("");
    setGroundsAccountEmail("");
    setGroundsAccountPhone("");
    setSelectedGroundsMemberProfileIds([]);
    setActionMessage("Grounds account linked.");
    await loadData();
  }

  async function linkGroundsToAccount(groundsAccountId: string, profileId: string) {
    if (!groundsAccountId || !profileId) {
      setError("Missing grounds user or account.");
      return;
    }

    setError("");
    setActionMessage("");

    const { error } = await supabase.from("grounds_account_members").insert({
      grounds_account_id: groundsAccountId,
      profile_id: profileId,
    });

    if (error) {
      setError(error.message);
      return;
    }

    setGroundsLinkSelections((prev) => ({ ...prev, [groundsAccountId]: "" }));
    setActionMessage("Grounds user linked to account.");
    await loadData();
  }

  async function unlinkGroundsFromAccount(groundsAccountId: string, profileId: string) {
    const confirmed = window.confirm("Remove this grounds user from the account?");
    if (!confirmed) return;

    setError("");
    setActionMessage("");

    const { error } = await supabase
      .from("grounds_account_members")
      .delete()
      .eq("grounds_account_id", groundsAccountId)
      .eq("profile_id", profileId);

    if (error) {
      setError(error.message);
      return;
    }

    setActionMessage("Grounds user removed.");
    await loadData();
  }

  async function addGroundsAssignment() {
    if (!groundsAssignmentPropertyId || !groundsAssignmentProfileId) {
      setError("Select property and grounds user.");
      return;
    }

    setError("");
    setActionMessage("");

    let groundsAccountId: string | null = null;

    const existingMembership = groundsAccountMembers.find(
      (member) => member.profile_id === groundsAssignmentProfileId
    );

    if (existingMembership) {
      groundsAccountId = existingMembership.grounds_account_id;
    } else {
      const groundsProfile = profiles.find((p) => p.id === groundsAssignmentProfileId);

      const { data: insertedAccount, error: insertedAccountError } = await supabase
        .from("grounds_accounts")
        .insert({
          display_name:
            groundsProfile?.full_name || groundsProfile?.email || "Grounds account",
          email: groundsProfile?.email || null,
          phone: groundsProfile?.phone || null,
          active: true,
        })
        .select()
        .single();

      if (insertedAccountError || !insertedAccount) {
        setError(insertedAccountError?.message || "Could not create grounds account.");
        return;
      }

      groundsAccountId = insertedAccount.id;

      const { error: memberInsertError } = await supabase
        .from("grounds_account_members")
        .insert({
          grounds_account_id: groundsAccountId,
          profile_id: groundsAssignmentProfileId,
        });

      if (memberInsertError) {
        setError(memberInsertError.message);
        return;
      }
    }

    const { error } = await supabase.from("property_grounds_account_assignments").insert({
      property_id: groundsAssignmentPropertyId,
      grounds_account_id: groundsAccountId,
      priority: Number(groundsAssignmentPriority),
    });

    if (error) {
      setError(error.message);
      return;
    }

    setGroundsAssignmentPropertyId("");
    setGroundsAssignmentProfileId("");
    setGroundsAssignmentPriority("1");
    setActionMessage("Grounds assigned to property.");
    await loadData();
  }

  function getGroundsJobStaffingStatus(unitsNeeded: number, slotCount: number) {
    if (slotCount <= 0) return "unassigned";
    if (slotCount >= unitsNeeded) return "partially_filled";
    return "partially_filled";
  }

  async function createGroundsJob() {
    if (!groundsJobPropertyId) {
      setError("Select a property for the grounds job.");
      return;
    }

    setError("");
    setActionMessage("");

    const propertyAssignments = groundsAssignments
      .filter((assignment) => assignment.property_id === groundsJobPropertyId)
      .sort((a, b) => a.priority - b.priority);

    const unitsNeeded = Number(groundsJobUnitsNeeded || "1");
    const assignedAccounts = propertyAssignments.slice(0, unitsNeeded);
    const staffingStatus = getGroundsJobStaffingStatus(unitsNeeded, assignedAccounts.length);
    const initialStatus = assignedAccounts.length > 0 ? "offered" : "open";

    const payload = {
      property_id: groundsJobPropertyId,
      status: initialStatus,
      staffing_status: staffingStatus,
      job_type: groundsJobType,
      notes: groundsJobNotes.trim() || null,
      scheduled_for: groundsJobScheduledFor || null,
      grounds_units_needed: unitsNeeded,
      grounds_units_required_strict: groundsJobUnitsStrict,
      show_team_status_to_grounds: groundsJobShowTeamStatus,
      needs_secure_access: groundsJobNeedsSecureAccess,
      needs_garage_access: groundsJobNeedsGarageAccess,
      offered_at: assignedAccounts.length > 0 ? new Date().toISOString() : null,
      created_by_profile_id: currentAdminUserId,
    };

    const { data: insertedJob, error: jobError } = await supabase
      .from("grounds_jobs")
      .insert(payload)
      .select()
      .single();

    if (jobError || !insertedJob) {
      setError(jobError?.message || "Could not create grounds job.");
      return;
    }

    if (assignedAccounts.length > 0) {
      const responseHours = getResponseWindowHours(groundsJobScheduledFor || null, new Date());
      const expiresAt = new Date(Date.now() + responseHours * 60 * 60 * 1000).toISOString();

      const slotRows = assignedAccounts.map((assignment, index) => ({
        job_id: insertedJob.id,
        slot_number: index + 1,
        grounds_account_id: assignment.grounds_account_id,
        status: "offered",
        offered_at: new Date().toISOString(),
        expires_at: expiresAt,
      }));

      const { error: slotError } = await supabase.from("grounds_job_slots").insert(slotRows);

      if (slotError) {
        setError(`Grounds job created, but slot creation failed: ${slotError.message}`);
        await loadData();
        return;
      }
    }

    setGroundsJobPropertyId("");
    setGroundsJobType("lawn_cut");
    setGroundsJobScheduledFor("");
    setGroundsJobNotes("");
    setGroundsJobOverrideUnitsEnabled(false);
    setGroundsJobUnitsNeeded("1");
    setGroundsJobUnitsStrict(false);
    setGroundsJobShowTeamStatus(true);
    setGroundsJobNeedsSecureAccess(false);
    setGroundsJobNeedsGarageAccess(false);
    setActionMessage("Grounds job created.");
    await loadData();
  }

  async function deleteGroundsAccount(account: GroundsAccount) {
    const displayName = account.display_name || account.email || "this grounds account";
    const confirmed = window.confirm(
      `Delete ${displayName}?

This removes its linked members and deletes the grounds account.`
    );
    if (!confirmed) return;

    setError("");
    setActionMessage("");
    setReassigningJobId(account.id);

    try {
      const { error } = await supabase
        .from("grounds_accounts")
        .delete()
        .eq("id", account.id);

      if (error) throw error;

      setActionMessage("Grounds account deleted.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not delete grounds account.");
    } finally {
      setReassigningJobId(null);
    }
  }

  async function saveAccess() {
    if (!selectedPropertyId) return;
    const existing = accessRows.find((x) => x.property_id === selectedPropertyId);

    if (existing) {
      const { error } = await supabase
        .from("property_access")
        .update({
          door_code: doorCode.trim() || null,
          alarm_code: alarmCode.trim() || null,
          notes: accessNotes.trim() || null,
        })
        .eq("id", existing.id);

      if (error) {
        setError(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("property_access").insert({
        property_id: selectedPropertyId,
        door_code: doorCode.trim() || null,
        alarm_code: alarmCode.trim() || null,
        notes: accessNotes.trim() || null,
      });

      if (error) {
        setError(error.message);
        return;
      }
    }

    setAccessDirty(false);
    setActionMessage("Access saved.");
    await loadData();
  }

  async function saveSelectedPropertyDefaults() {
    if (!selectedPropertyId) return;
    setError("");
    setSavingSelectedPropertyDefaults(true);

    try {
      const { error } = await supabase
        .from("properties")
        .update({
          default_cleaner_units_needed: Number(selectedPropertyUnitsNeeded || "1"),
          cleaner_units_required_strict: selectedPropertyUnitsStrict,
          show_team_status_to_cleaners: selectedPropertyShowTeamStatus,
        })
        .eq("id", selectedPropertyId);

      if (error) throw error;
      setPropertyDefaultsDirty(false);
      setActionMessage("Property defaults saved.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not save property staffing defaults.");
    } finally {
      setSavingSelectedPropertyDefaults(false);
    }
  }

  function addCalendarDraftRow() {
    setCalendarDraftDirty(true);
    setCalendarRowsDraft((prev) => [
      ...prev,
      { source: "", ical_url: "", is_active: true },
    ]);
  }

  function updateCalendarDraftRow(
    index: number,
    field: "source" | "ical_url" | "is_active",
    value: string | boolean
  ) {
    setCalendarDraftDirty(true);
    setCalendarRowsDraft((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );
  }

  function removeCalendarDraftRow(index: number) {
    setCalendarDraftDirty(true);
    setCalendarRowsDraft((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  }

  async function saveCalendars() {
    if (!selectedPropertyId) {
      setError("Please select a property first.");
      return;
    }

    setError("");
    setActionMessage("");
    setSavingCalendars(true);

    try {
      const existingRows = propertyCalendars.filter(
        (x) => x.property_id === selectedPropertyId
      );

      const normalizedRows = calendarRowsDraft
        .map((row) => ({
          id: row.id,
          source: row.source.trim(),
          ical_url: row.ical_url.trim(),
          is_active: row.is_active,
        }))
        .filter((row) => row.source || row.ical_url);

      for (const row of normalizedRows) {
        if (!row.source) {
          throw new Error("Each calendar row needs a source name.");
        }
        if (!row.ical_url) {
          throw new Error(`Calendar URL is missing for ${row.source}.`);
        }
      }

      const draftIds = new Set(
        normalizedRows
          .map((row) => row.id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      );

      const rowsToDelete = existingRows.filter((row) => !draftIds.has(row.id));

      if (rowsToDelete.length > 0) {
        const { error } = await supabase
          .from("property_calendars")
          .delete()
          .in("id", rowsToDelete.map((row) => row.id));

        if (error) throw error;
      }

      for (const row of normalizedRows) {
        if (row.id) {
          const { error } = await supabase
            .from("property_calendars")
            .update({
              source: row.source,
              ical_url: row.ical_url,
              is_active: row.is_active,
            })
            .eq("id", row.id);

          if (error) throw error;
        } else {
          const { error } = await supabase.from("property_calendars").insert({
            property_id: selectedPropertyId,
            source: row.source,
            ical_url: row.ical_url,
            is_active: row.is_active,
          });

          if (error) throw error;
        }
      }

      setCalendarDraftDirty(false);
      const activeCount = normalizedRows.filter((row) => row.is_active).length;
      setActionMessage(`Calendars saved. ${normalizedRows.length} feed${normalizedRows.length === 1 ? "" : "s"} configured, ${activeCount} active.`);
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not save calendars.");
    } finally {
      setSavingCalendars(false);
    }
  }

  async function addSop() {
    if (!selectedPropertyId) {
      setError("Please select a property first.");
      return;
    }

    const hasTitle = !!sopTitle.trim();
    const hasContent = !!sopContent.trim();
    const hasFiles = sopFiles.length > 0;

    if (!hasTitle && !hasContent && !hasFiles) {
      setError("Please add at least a title, a note, or an image.");
      return;
    }

    setError("");
    setUploadingSop(true);

    try {
      const { data: sopInsert, error: sopError } = await supabase
        .from("property_sops")
        .insert({
          property_id: selectedPropertyId,
          title: hasTitle ? sopTitle.trim() : null,
          content: hasContent ? sopContent.trim() : null,
        })
        .select()
        .single();

      if (sopError || !sopInsert) {
        setError("SOP save failed: " + (sopError?.message || "Unknown error"));
        return;
      }

      const newSopId = sopInsert.id as string;

      for (let i = 0; i < sopFiles.length; i++) {
        const file = sopFiles[i];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${selectedPropertyId}/${newSopId}/${Date.now()}-${i}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("property-sop-images")
          .upload(filePath, file, { cacheControl: "3600", upsert: false });

        if (uploadError) {
          setError("Image upload failed: " + uploadError.message);
          return;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("property-sop-images").getPublicUrl(filePath);

        const { error: imageInsertError } = await supabase.from("property_sop_images").insert({
          sop_id: newSopId,
          image_url: publicUrl,
          caption: null,
          sort_order: i,
        });

        if (imageInsertError) {
          setError("Image record save failed: " + imageInsertError.message);
          return;
        }
      }

      setSopTitle("");
      setSopContent("");
      setSopFiles([]);
      setActionMessage("SOP added.");
      await loadData();
    } catch (err: any) {
      setError("Unexpected error: " + (err?.message || "Unknown error"));
    } finally {
      setUploadingSop(false);
    }
  }

  function getPropertyName(id: string | null) {
    if (!id) return "Unknown property";
    return properties.find((p) => p.id === id)?.name || id;
  }

  function getCleanerAccountName(id: string | null) {
    if (!id) return "Unassigned";
    return cleanerAccounts.find((c) => c.id === id)?.display_name || id;
  }

  function getGroundsAccountName(id: string | null) {
    if (!id) return "Unassigned";
    return groundsAccounts.find((g) => g.id === id)?.display_name || id;
  }

  function getGroundsTaskLabel(task: GroundsRecurringTask) {
    return task.label || task.task_type || "Recurring grounds task";
  }


  function getGroundsRuleLabel(rule: GroundsRecurringRule) {
    return rule.label || rule.task_type || "Recurring grounds rule";
  }

  function getGroundsRuleFrequencyLabel(rule: GroundsRecurringRule) {
    if (rule.frequency_type === "weekly") {
      return `Weekly${rule.day_of_week !== null ? ` • day ${rule.day_of_week}` : ""}`;
    }
    if (rule.frequency_type === "biweekly") {
      return `Biweekly${rule.day_of_week !== null ? ` • day ${rule.day_of_week}` : ""}`;
    }
    if (rule.frequency_type === "monthly") {
      return `Monthly${rule.day_of_month !== null ? ` • day ${rule.day_of_month}` : ""}`;
    }
    if (rule.frequency_type === "semi_monthly") {
      const parts = [rule.semi_monthly_day_1, rule.semi_monthly_day_2].filter((v) => v !== null);
      return parts.length ? `Semi-monthly • days ${parts.join(" & ")}` : "Semi-monthly";
    }
    if (rule.frequency_type === "every_x_days") {
      return rule.interval_days ? `Every ${rule.interval_days} days` : "Every X days";
    }
    return rule.frequency_type || "Custom";
  }

  function getPriorityLabel(priority: number) {
    if (priority === 1) return "Primary";
    if (priority === 2) return "Backup";
    if (priority === 3) return "Second Backup";
    return `Priority ${priority}`;
  }

  function formatDateTime(value?: string | null) {
    if (!value) return "Unknown time";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  function formatScheduledFor(value?: string | null) {
    if (!value) return "Not set";
    const d = new Date(`${value}T12:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString();
  }

  function getMaintenanceFlagLabel(flag: MaintenanceFlagRow, keys: string[]) {
    return (
      flag.title ||
      flag.name ||
      flag.issue ||
      flag.flag ||
      flag.category ||
      (keys.length > 0 ? keys[0].replace(/_/g, " ") : "Untitled flag")
    );
  }

  function getMaintenanceFlagBody(flag: MaintenanceFlagRow) {
    return flag.description || flag.notes || flag.details || flag.summary || null;
  }

  function getMaintenanceFlagState(flag: MaintenanceFlagRow) {
    if (flag.resolved_at) return "resolved";
    return flag.status || "open";
  }

  function resetMaintenanceForm() {
    setMaintenanceFormPropertyId(selectedJobsPropertyFilter !== "all" ? selectedJobsPropertyFilter : "");
    setMaintenanceFormCategory("");
    setMaintenanceFormUrgency("normal");
    setMaintenanceFormNotes("");
    setMaintenanceFormError("");
  }

  function openMaintenanceModal() {
    resetMaintenanceForm();
    setMaintenanceModalOpen(true);
  }

  function closeMaintenanceModal() {
    setMaintenanceModalOpen(false);
    resetMaintenanceForm();
  }

  async function createMaintenanceFlag() {
    if (!maintenanceFormPropertyId) {
      setMaintenanceFormError("Please choose a property.");
      return;
    }

    if (!maintenanceFormCategory.trim()) {
      setMaintenanceFormError("Please choose a category.");
      return;
    }

    if (!maintenanceFormNotes.trim()) {
      setMaintenanceFormError("Please add notes describing the issue.");
      return;
    }

    setMaintenanceFormError("");
    setError("");
    setActionMessage("");
    setCreatingMaintenanceFlag(true);

    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from("property_maintenance_flags").insert({
        property_id: maintenanceFormPropertyId,
        source: "admin",
        category: maintenanceFormCategory.trim(),
        urgency: maintenanceFormUrgency,
        status: "open",
        notes: maintenanceFormNotes.trim(),
        flagged_by_profile_id: currentAdminUserId,
        flagged_at: nowIso,
      });

      if (error) throw error;

      closeMaintenanceModal();
      setActionMessage("Maintenance flag created.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not create maintenance flag.");
    } finally {
      setCreatingMaintenanceFlag(false);
    }
  }

  async function resolveMaintenanceFlag(flagId: string) {
    if (!currentAdminUserId) {
      setError("Admin user not found.");
      return;
    }

    setError("");
    setActionMessage("");
    setResolvingMaintenanceFlagId(flagId);

    try {
      const { error } = await supabase
        .from("property_maintenance_flags")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by_profile_id: currentAdminUserId,
        })
        .eq("id", flagId);

      if (error) throw error;

      setActionMessage("Maintenance flag resolved.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not resolve maintenance flag.");
    } finally {
      setResolvingMaintenanceFlagId(null);
    }
  }

  async function deleteMaintenanceFlag(flagId: string) {
    const confirmed = window.confirm("Delete this maintenance flag? This cannot be undone.");
    if (!confirmed) return;

    setError("");
    setActionMessage("");
    setDeletingMaintenanceFlagId(flagId);

    try {
      const { error } = await supabase.from("property_maintenance_flags").delete().eq("id", flagId);
      if (error) throw error;

      setActionMessage("Maintenance flag deleted.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not delete maintenance flag.");
    } finally {
      setDeletingMaintenanceFlagId(null);
    }
  }


  async function deleteResolvedMaintenanceFlags() {
    const resolvedIds = filteredMaintenanceFlags
      .filter((flag) => {
        const stateLower = String(getMaintenanceFlagState(flag) || "").toLowerCase();
        return stateLower.includes("resolved") || stateLower.includes("closed") || stateLower.includes("done");
      })
      .map((flag) => flag.id);

    if (resolvedIds.length === 0) {
      setActionMessage("No resolved maintenance flags to delete.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${resolvedIds.length} resolved maintenance flag${resolvedIds.length === 1 ? "" : "s"}? This cannot be undone.`
    );
    if (!confirmed) return;

    setError("");
    setActionMessage("");
    setDeletingResolvedMaintenanceFlags(true);

    try {
      const { error } = await supabase.from("property_maintenance_flags").delete().in("id", resolvedIds);
      if (error) throw error;

      setActionMessage(`Deleted ${resolvedIds.length} resolved maintenance flag${resolvedIds.length === 1 ? "" : "s"}.`);
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not delete resolved maintenance flags.");
    } finally {
      setDeletingResolvedMaintenanceFlags(false);
    }
  }

  const selectedSops = useMemo(
    () => sops.filter((x) => x.property_id === selectedPropertyId),
    [sops, selectedPropertyId]
  );

  const maintenanceImagesByFlagId = useMemo(() => {
    const map: Record<string, MaintenanceFlagImageRow[]> = {};
    for (const image of maintenanceFlagImages) {
      if (!map[image.flag_id]) map[image.flag_id] = [];
      map[image.flag_id].push(image);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [maintenanceFlagImages]);

  const sopImagesBySopId = useMemo(() => {
    const map: Record<string, SopImageRow[]> = {};
    for (const image of sopImages) {
      if (!map[image.sop_id]) map[image.sop_id] = [];
      map[image.sop_id].push(image);
    }
    return map;
  }, [sopImages]);

  const jobSlotsByJobId = useMemo(() => {
    const map: Record<string, JobSlot[]> = {};
    for (const slot of jobSlots) {
      if (!map[slot.job_id]) map[slot.job_id] = [];
      map[slot.job_id].push(slot);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.slot_number - b.slot_number);
    }
    return map;
  }, [jobSlots]);

  const groundsJobSlotsByJobId = useMemo(() => {
    const map: Record<string, GroundsJobSlot[]> = {};
    for (const slot of groundsJobSlots) {
      if (!map[slot.job_id]) map[slot.job_id] = [];
      map[slot.job_id].push(slot);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.slot_number - b.slot_number);
    }
    return map;
  }, [groundsJobSlots]);

  const cleanerMembersByAccountId = useMemo(() => {
    const map: Record<string, ProfileRow[]> = {};
    for (const member of cleanerAccountMembers) {
      const profile = profiles.find((p) => p.id === member.profile_id);
      if (!profile) continue;
      if (!map[member.cleaner_account_id]) map[member.cleaner_account_id] = [];
      map[member.cleaner_account_id].push(profile);
    }
    return map;
  }, [cleanerAccountMembers, profiles]);

  const groundsMembersByAccountId = useMemo(() => {
    const map: Record<string, ProfileRow[]> = {};
    for (const member of groundsAccountMembers) {
      const profile = profiles.find((p) => p.id === member.profile_id);
      if (!profile) continue;
      if (!map[member.grounds_account_id]) map[member.grounds_account_id] = [];
      map[member.grounds_account_id].push(profile);
    }
    return map;
  }, [groundsAccountMembers, profiles]);

  const cleanerAccountNamesByProfileId = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const member of cleanerAccountMembers) {
      const label =
        cleanerAccounts.find((account) => account.id === member.cleaner_account_id)?.display_name ||
        member.cleaner_account_id;
      if (!map[member.profile_id]) map[member.profile_id] = [];
      if (!map[member.profile_id].includes(label)) map[member.profile_id].push(label);
    }
    return map;
  }, [cleanerAccountMembers, cleanerAccounts]);

  const groundsAccountNamesByProfileId = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const member of groundsAccountMembers) {
      const label =
        groundsAccounts.find((account) => account.id === member.grounds_account_id)?.display_name ||
        member.grounds_account_id;
      if (!map[member.profile_id]) map[member.profile_id] = [];
      if (!map[member.profile_id].includes(label)) map[member.profile_id].push(label);
    }
    return map;
  }, [groundsAccountMembers, groundsAccounts]);

  const eligibleCleanerProfiles = useMemo(
    () => profiles.filter((profile) => profile.role === "cleaner"),
    [profiles]
  );

  const eligibleGroundsProfiles = useMemo(
    () => profiles.filter((profile) => profile.role === "grounds" || profile.role === "cleaner"),
    [profiles]
  );

  function getActiveCountdownMs(jobId: string) {
    const slots = jobSlotsByJobId[jobId] ?? [];
    const activeOffered = slots
      .filter((slot) => slot.status === "offered" && !!slot.expires_at)
      .sort((a, b) => new Date(a.expires_at || 0).getTime() - new Date(b.expires_at || 0).getTime());

    if (!activeOffered.length || !activeOffered[0].expires_at) return null;
    return new Date(activeOffered[0].expires_at).getTime() - now.getTime();
  }

  function getJobDisplayStatus(job: Job, slots: JobSlot[]) {
    const needed = job.cleaner_units_needed || Math.max(slots.length, 1);
    const accepted = slots.filter((slot) => slot.status === "accepted").length;
    const offered = slots.filter((slot) => slot.status === "offered").length;
    const declined = slots.filter((slot) => slot.status === "declined").length;
    const stranded = slots.filter((slot) => slot.status === "stranded").length;

    if (accepted >= needed) return "Fully staffed";
    if (accepted > 0 && job.cleaner_units_required_strict) return "Partially filled";
    if (accepted > 0 && !job.cleaner_units_required_strict) return "Ready";
    if (stranded > 0 || job.staffing_status === "stranded") return "Stranded";
    if (offered > 0) return "Jobs waiting for acceptance";
    if (declined > 0) return "Reoffer needed";
    return job.staffing_status || job.status || "Unknown";
  }
  const waitingJobs = useMemo(
    () =>
      jobs.filter((job) =>
        (jobSlotsByJobId[job.id] ?? []).some((slot) => slot.status === "offered")
      ),
    [jobs, jobSlotsByJobId]
  );

  const overdueWaitingJobs = useMemo(
    () =>
      waitingJobs.filter((job) => {
        const slots = jobSlotsByJobId[job.id] ?? [];
        const firstOffered = slots
          .filter((slot) => slot.status === "offered")
          .sort(
            (a, b) =>
              new Date(a.offered_at || 0).getTime() - new Date(b.offered_at || 0).getTime()
          )[0];

        const remainingMs = getTimeRemainingMs(job, firstOffered?.offered_at, now);
        return remainingMs !== null && remainingMs < 0;
      }),
    [waitingJobs, jobSlotsByJobId, now]
  );

  function jumpToJobs(type: "waiting" | "stranded") {
    setActiveSection("jobs");

    setTimeout(() => {
      document
        .getElementById(
          type === "waiting" ? "waiting-jobs-section" : "stranded-jobs-section"
        )
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }
  const filteredJobs = useMemo(
    () =>
      selectedJobsPropertyFilter === "all"
        ? jobs
        : jobs.filter((job) => job.property_id === selectedJobsPropertyFilter),
    [jobs, selectedJobsPropertyFilter]
  );

  const visibleJobs = jobsExpanded ? filteredJobs : filteredJobs.slice(0, 3);
  const recentDeclinedJobs = useMemo(
    () =>
      [...jobSlots]
        .filter((slot) => !!slot.declined_at)
        .filter((slot) => {
          if (selectedJobsPropertyFilter === "all") return true
          const matchingJob = jobs.find((job) => job.id === slot.job_id)
          return matchingJob?.property_id === selectedJobsPropertyFilter
        })
        .sort((a, b) => new Date(b.declined_at || 0).getTime() - new Date(a.declined_at || 0).getTime())
        .slice(0, 10),
    [jobSlots, jobs, selectedJobsPropertyFilter]
  );

  const filteredStrandedJobs = useMemo(
    () =>
      selectedJobsPropertyFilter === "all"
        ? strandedJobs
        : strandedJobs.filter((job) => job.property_id === selectedJobsPropertyFilter),
    [strandedJobs, selectedJobsPropertyFilter]
  );

  const adminJobsByDate = useMemo(() => {
    const map = new Map<string, Job[]>();

    for (const job of jobs) {
      const jobDate = job.scheduled_for || extractCheckoutDate(job.notes);
      if (!jobDate) continue;
      if (!map.has(jobDate)) map.set(jobDate, []);
      map.get(jobDate)!.push(job);
    }

    for (const [key, value] of map.entries()) {
      value.sort((a, b) => {
        const aName = getPropertyName(a.property_id);
        const bName = getPropertyName(b.property_id);
        return aName.localeCompare(bName);
      });
      map.set(key, value);
    }

    return map;
  }, [jobs, properties]);

  const adminCalendarDays = useMemo(() => getMonthGrid(adminCalendarMonth), [adminCalendarMonth]);

  const adminSelectedDayJobs = useMemo(() => {
    if (!adminSelectedDate) return [];
    const dayJobs = adminJobsByDate.get(adminSelectedDate) ?? [];
    return selectedJobsPropertyFilter === "all"
      ? dayJobs
      : dayJobs.filter((job) => job.property_id === selectedJobsPropertyFilter);
  }, [adminJobsByDate, adminSelectedDate, selectedJobsPropertyFilter]);

  const filteredMaintenanceFlags = useMemo(() => {
    const filteredByProperty =
      selectedJobsPropertyFilter === "all"
        ? maintenanceFlags
        : maintenanceFlags.filter((flag) => flag.property_id === selectedJobsPropertyFilter);

    return [...filteredByProperty].sort(
      (a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
    );
  }, [maintenanceFlags, selectedJobsPropertyFilter]);

  const maintenanceFlagCounts = useMemo(() => {
    let open = 0;
    let resolved = 0;
    let urgent = 0;

    for (const flag of filteredMaintenanceFlags) {
      const state = String(getMaintenanceFlagState(flag) || "").toLowerCase();
      const urgency = String(flag.urgency || flag.priority || flag.severity || "").toLowerCase();
      const isResolved = state.includes("resolved") || state.includes("closed") || state.includes("done");
      const isUrgent = urgency.includes("high") || urgency.includes("urgent") || urgency.includes("critical");

      if (isResolved) {
        resolved += 1;
      } else {
        open += 1;
        if (isUrgent) urgent += 1;
      }
    }

    return {
      total: filteredMaintenanceFlags.length,
      open,
      resolved,
      urgent,
    };
  }, [filteredMaintenanceFlags]);

  const openMaintenanceFlags = useMemo(
    () =>
      filteredMaintenanceFlags.filter((flag) => {
        const stateLower = String(getMaintenanceFlagState(flag) || "").toLowerCase();
        return !(stateLower.includes("resolved") || stateLower.includes("closed") || stateLower.includes("done"));
      }),
    [filteredMaintenanceFlags]
  );

  const resolvedMaintenanceFlags = useMemo(
    () =>
      filteredMaintenanceFlags.filter((flag) => {
        const stateLower = String(getMaintenanceFlagState(flag) || "").toLowerCase();
        return stateLower.includes("resolved") || stateLower.includes("closed") || stateLower.includes("done");
      }),
    [filteredMaintenanceFlags]
  );

  const operationsAlerts = useMemo(() => {
    const alerts: Array<{
      key: string;
      label: string;
      tone: "amber" | "red";
      onClick: () => void;
    }> = [];

    if (waitingJobs.length > 0) {
      alerts.push({
        key: "waiting",
        label: `${waitingJobs.length} job${waitingJobs.length === 1 ? "" : "s"} waiting for acceptance`,
        tone: "amber",
        onClick: () => jumpToJobs("waiting"),
      });
    }

    if (overdueWaitingJobs.length > 0) {
      alerts.push({
        key: "overdue",
        label: `${overdueWaitingJobs.length} overdue job${overdueWaitingJobs.length === 1 ? "" : "s"} needing attention`,
        tone: "red",
        onClick: () => jumpToJobs("waiting"),
      });
    }

    if (strandedJobs.length > 0) {
      alerts.push({
        key: "stranded",
        label: `${strandedJobs.length} stranded job${strandedJobs.length === 1 ? "" : "s"}`,
        tone: "red",
        onClick: () => jumpToJobs("stranded"),
      });
    }

    if (maintenanceFlagCounts.open > 0) {
      alerts.push({
        key: "maintenance-open",
        label: `${maintenanceFlagCounts.open} open maintenance flag${maintenanceFlagCounts.open === 1 ? "" : "s"}`,
        tone: "red",
        onClick: () => {
          setActiveSection("maintenance");
          setTimeout(() => {
            document.getElementById("maintenance-flags-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 50);
        },
      });
    }

    if (maintenanceFlagCounts.urgent > 0) {
      alerts.push({
        key: "maintenance-urgent",
        label: `${maintenanceFlagCounts.urgent} urgent maintenance flag${maintenanceFlagCounts.urgent === 1 ? "" : "s"}`,
        tone: "red",
        onClick: () => {
          setActiveSection("maintenance");
          setTimeout(() => {
            document.getElementById("maintenance-flags-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 50);
        },
      });
    }

    return alerts;
  }, [waitingJobs.length, overdueWaitingJobs.length, strandedJobs.length, maintenanceFlagCounts.open, maintenanceFlagCounts.urgent]);

  function selectAdminCalendarDate(dateYmd: string) {
    setAdminSelectedDate(dateYmd);
  }

  const selectedPropertyDefaults = properties.find((p) => p.id === jobPropertyId);

  const selectedGroundsPropertyAssignmentCount = useMemo(() =>
    groundsAssignments.filter((assignment) => assignment.property_id === groundsJobPropertyId).length,
    [groundsAssignments, groundsJobPropertyId]
  );

  const selectedGroundsProperty = properties.find((p) => p.id === groundsJobPropertyId);

  function getGroundsJobDisplayStatus(job: GroundsJob, slots: GroundsJobSlot[]) {
    const needed = job.grounds_units_needed || Math.max(slots.length, 1);
    const accepted = slots.filter((slot) => slot.status === "accepted").length;
    const offered = slots.filter((slot) => slot.status === "offered").length;
    const declined = slots.filter((slot) => slot.status === "declined").length;

    if (accepted >= needed) return "Fully staffed";
    if (accepted > 0 && job.grounds_units_required_strict) return "Partially filled";
    if (accepted > 0 && !job.grounds_units_required_strict) return "Ready";
    if (offered > 0) return "Waiting for response";
    if (declined > 0) return "Reoffer needed";
    return job.status || "Open";
  }

  const menuItems: Array<{ key: AdminSection; label: string }> = [
    { key: "users", label: "Users" },
    { key: "properties", label: "Properties" },
    { key: "cleanerAccounts", label: "Cleaner Accounts" },
    { key: "groundsAccounts", label: "Grounds Accounts" },
    { key: "assignments", label: "Assignments" },
    { key: "jobs", label: "Jobs" },
    { key: "maintenance", label: "Maintenance Flags" },
  ];

  function renderUsersSection() {
    return (
      <div className="rounded-[30px] border border-[#e7ddd0] bg-white p-4 md:p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">User Management</h2>
          <p className="mt-1 text-sm text-[#7f7263]">
            Approve pending users, change access roles, remove users from the portal, or permanently delete them.
          </p>
          <div className="mt-3 rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3 text-sm text-[#6f6255]">
            <span className="font-semibold text-[#241c15]">How access works:</span> Users are linked to Cleaner and/or Grounds teams. Properties are assigned to those teams.
          </div>
        </div>

        <div className="space-y-3">
          {profiles.map((profile) => {
            const isBusy =
              savingRoleId === profile.id || actingOnProfileId === profile.id;
            const isSelf = profile.id === currentAdminUserId;
            const cleanerLinks = cleanerAccountNamesByProfileId[profile.id] ?? [];
            const groundsLinks = groundsAccountNamesByProfileId[profile.id] ?? [];

            return (
              <div
                key={profile.id}
                className="rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] p-3 md:p-4"
              >
                <div className="grid gap-3 lg:grid-cols-[1.2fr_180px_220px] xl:grid-cols-[1.4fr_180px_220px_300px] xl:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold text-[#241c15]">
                        {profile.full_name || "No name"}
                      </div>

                      <span className="inline-flex rounded-full border border-[#d8c7ab] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#7f7263]">
                        {profile.role}
                      </span>

                      {isSelf ? (
                        <span className="inline-flex rounded-full border border-[#d8c7ab] bg-[#fffaf3] px-2.5 py-0.5 text-[11px] font-medium text-[#7f7263]">
                          Your account
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 truncate text-sm text-[#6f6255]">
                      {profile.email || "No email"}
                    </div>

                    <div className="mt-0.5 text-sm text-[#8a7b68]">
                      {profile.phone || "No phone"}
                    </div>

                    <div className="mt-3 rounded-[16px] border border-[#eadfce] bg-white px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">
                        Connections
                      </div>

                      <div className="mt-2 space-y-2">
                        <div className="rounded-[12px] border border-[#e6dfd5] bg-[#fcfaf7] px-3 py-2">
                          <div className="text-xs font-semibold text-[#241c15]">Cleaner team</div>
                          <div className="mt-1 text-sm text-[#6f6255]">
                            {cleanerLinks.length > 0 ? cleanerLinks.join(", ") : "Not linked"}
                          </div>
                        </div>

                        <div className="rounded-[12px] border border-[#dce9df] bg-[#f6fbf7] px-3 py-2">
                          <div className="text-xs font-semibold text-[#173d24]">Grounds team</div>
                          <div className="mt-1 text-sm text-[#3f6b4b]">
                            {groundsLinks.length > 0 ? groundsLinks.join(", ") : "Not linked"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">
                      Change role
                    </div>

                    <select
                      className="w-full rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#b48d4e]"
                      value={profile.role}
                      onChange={(e) => void updateUserRole(profile.id, e.target.value)}
                      disabled={isBusy}
                    >
                      <option value="pending">pending</option>
                      <option value="cleaner">cleaner</option>
                      <option value="grounds">grounds</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>

                  <div className="xl:col-span-2">
                    <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">
                      Account actions
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        className="rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm text-[#5f5245] transition hover:bg-[#f7f3ee] disabled:opacity-50"
                        onClick={() => void removeUserFromPortal(profile)}
                        disabled={isBusy}
                      >
                        {actingOnProfileId === profile.id ? "Working..." : "Remove from portal"}
                      </button>

                      <button
                        className="rounded-[14px] border border-[#efc6c6] bg-[#fff5f5] px-3 py-2 text-sm text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:opacity-50"
                        onClick={() => void permanentlyDeleteUser(profile)}
                        disabled={isBusy}
                      >
                        {actingOnProfileId === profile.id ? "Working..." : "Permanently delete"}
                      </button>
                    </div>

                    <div className="mt-1 text-[11px] text-[#8a7b68]">
                      {savingRoleId === profile.id
                        ? "Saving..."
                        : "Admin promotion requires confirmation"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  function renderAddPropertySection() {
    return (
      <section id="maintenance-flags-section" className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <h2 className="text-xl font-semibold tracking-tight">Add Property</h2>
        <p className="mt-1 text-sm text-[#7f7263]">
          Add a managed property and set default staffing rules.
        </p>

        <div className="mt-5 space-y-3">
          <input
            className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
            placeholder="Property name"
            value={propertyName}
            onChange={(e) => setPropertyName(e.target.value)}
          />

          <div className="grid gap-2">
            <input
              className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
              placeholder="Street Address"
              value={propertyStreet}
              onChange={(e) => setPropertyStreet(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                placeholder="City"
                value={propertyCity}
                onChange={(e) => setPropertyCity(e.target.value)}
              />

              <input
                className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                placeholder="Province"
                value={propertyProvince}
                onChange={(e) => setPropertyProvince(e.target.value)}
              />
            </div>

            <input
              className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
              placeholder="Postal Code"
              value={propertyPostal}
              onChange={(e) => setPropertyPostal(e.target.value)}
            />
          </div>

          <textarea
            className="min-h-[110px] w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
            placeholder="Internal notes"
            value={propertyNotes}
            onChange={(e) => setPropertyNotes(e.target.value)}
          />

          <select
            className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
            value={propertyUnitsNeeded}
            onChange={(e) => setPropertyUnitsNeeded(e.target.value)}
          >
            <option value="1">Default cleaner units: 1</option>
            <option value="2">Default cleaner units: 2</option>
            <option value="3">Default cleaner units: 3</option>
          </select>

          <label className="flex items-center gap-2 text-sm text-[#6f6255]">
            <input
              type="checkbox"
              checked={propertyUnitsStrict}
              onChange={(e) => setPropertyUnitsStrict(e.target.checked)}
            />
            Full team required before the job is fully staffed
          </label>

          <label className="flex items-center gap-2 text-sm text-[#6f6255]">
            <input
              type="checkbox"
              checked={propertyShowTeamStatus}
              onChange={(e) => setPropertyShowTeamStatus(e.target.checked)}
            />
            Show team status on cleaner page
          </label>

          <button
            className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]"
            onClick={() => void addProperty()}
          >
            Add Property
          </button>
        </div>
      </section>
    );
  }
  function renderPropertiesSection() {
    return (
      <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Properties</h2>
          <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">{properties.length}</span>
        </div>
        <div className="space-y-3">
          {properties.map((p) => {
            const propertyCalendarCount = propertyCalendars.filter((calendar) => calendar.property_id === p.id).length;
            return (
              <div key={p.id} className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold">{p.name}</div>
                    <div className="mt-1 text-sm text-[#6f6255]">{p.address || "No address"}</div>
                    <div className="mt-2 text-sm text-[#8a7b68]">{p.notes || "No notes"}</div>
                    <div className="mt-2 text-xs text-[#8a7b68]">
                      Default staffing: {p.default_cleaner_units_needed} unit{p.default_cleaner_units_needed === 1 ? "" : "s"}
                      {p.cleaner_units_required_strict ? ", strict" : ", flexible"}
                    </div>
                    <div className="mt-2 text-xs text-[#8a7b68]">
                      Calendars configured: {propertyCalendarCount}
                    </div>
                  </div>

                  <div className="w-full md:w-[220px]">
                    <button
                      className="w-full rounded-[14px] border border-[#efc6c6] bg-[#fff5f5] px-3 py-2 text-sm text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:opacity-50"
                      onClick={() => void deleteProperty(p)}
                      disabled={deletingPropertyId === p.id}
                    >
                      {deletingPropertyId === p.id ? "Deleting..." : "Delete property"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function renderCleanerAccountsSection() {
    return (
      <div className="space-y-6">
        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <h2 className="text-xl font-semibold tracking-tight">Link Existing Cleaner Users</h2>
          <p className="mt-1 text-sm text-[#7f7263]">
            Real cleaner logins are created from the sign up page. Use this section only when you want multiple existing cleaner users to share the same jobs.
          </p>

          <div className="mt-5 space-y-3">
            <input className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Shared jobs group name (example: Sam & Sean)" value={cleanerAccountName} onChange={(e) => setCleanerAccountName(e.target.value)} />
            <input className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Shared email (optional)" value={cleanerAccountEmail} onChange={(e) => setCleanerAccountEmail(e.target.value)} />
            <input className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Shared phone (optional)" value={cleanerAccountPhone} onChange={(e) => setCleanerAccountPhone(e.target.value)} />

            <div className="rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] p-4">
              <div className="mb-2 text-sm font-medium text-[#5f5245]">Select existing cleaner users to share jobs</div>
              <div className="space-y-2">
                {eligibleCleanerProfiles.length === 0 ? (
                  <div className="text-sm text-[#8a7b68]">No cleaner-role users available yet.</div>
                ) : (
                  eligibleCleanerProfiles.map((profile) => (
                    <label key={profile.id} className="flex items-center gap-2 text-sm text-[#6f6255]">
                      <input
                        type="checkbox"
                        checked={selectedCleanerMemberProfileIds.includes(profile.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCleanerMemberProfileIds((prev) => [...prev, profile.id]);
                          } else {
                            setSelectedCleanerMemberProfileIds((prev) => prev.filter((id) => id !== profile.id));
                          }
                        }}
                      />
                      {profile.full_name || profile.email || profile.id}
                    </label>
                  ))
                )}
              </div>
            </div>

            <button className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]" onClick={() => void addCleanerAccount()}>
              Link Selected Cleaners
            </button>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Cleaner Accounts</h2>
            <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">{cleanerAccounts.length}</span>
          </div>
          <div className="space-y-3">
            {cleanerAccounts.map((account) => (
              <div key={account.id} className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold">{account.display_name || "No name"}</div>
                    <div className="mt-1 text-sm text-[#6f6255]">{account.email || "No email"}</div>
                    <div className="mt-1 text-sm text-[#8a7b68]">{account.phone || "No phone"}</div>

                    <div className="mt-2 text-xs text-[#8a7b68]">Members:</div>

                    <div className="mt-2 space-y-2">
                      {(cleanerMembersByAccountId[account.id] ?? []).length === 0 ? (
                        <div className="text-sm text-[#8a7b68]">No linked members</div>
                      ) : (
                        (cleanerMembersByAccountId[account.id] ?? []).map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between gap-3 rounded-[14px] border border-[#eadfce] bg-white px-3 py-2"
                          >
                            <div className="min-w-0 text-sm text-[#5f5245]">
                              {member.full_name || member.email || member.id}
                            </div>

                            <button
                              className="rounded-full border border-[#efc6c6] bg-[#fff5f5] px-3 py-1 text-xs text-[#8a2e22] transition hover:bg-[#fff0f0]"
                              onClick={() => void unlinkCleanerFromAccount(account.id, member.id)}
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                      <select
                        className="w-full rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#b48d4e]"
                        value={linkSelections[account.id] || ""}
                        onChange={(e) =>
                          setLinkSelections((prev) => ({
                            ...prev,
                            [account.id]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Select cleaner to link</option>
                        {eligibleCleanerProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.full_name || profile.email || profile.id}
                          </option>
                        ))}
                      </select>

                      <button
                        className="rounded-full bg-[#241c15] px-4 py-2 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]"
                        onClick={() => void linkCleanerToAccount(account.id, linkSelections[account.id])}
                      >
                        Link user
                      </button>
                    </div>
                  </div>

                  <div className="w-full md:w-[220px]">
                    <button
                      className="w-full rounded-[14px] border border-[#efc6c6] bg-[#fff5f5] px-3 py-2 text-sm text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:opacity-50"
                      onClick={() => void deleteCleanerAccount(account)}
                      disabled={reassigningJobId === account.id}
                    >
                      {reassigningJobId === account.id ? "Deleting..." : "Delete cleaner account"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderGroundsAccountsSection() {
    return (
      <div className="space-y-6">
        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <h2 className="text-xl font-semibold tracking-tight">Link Existing Grounds Users</h2>
          <p className="mt-1 text-sm text-[#7f7263]">
            Create a shared grounds account when one or more existing users need to receive the same grounds jobs. Cleaner users can also be linked here when they handle both cleaning and grounds work.
          </p>

          <div className="mt-5 space-y-3">
            <input className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Grounds group name (example: Louis Grounds Team)" value={groundsAccountName} onChange={(e) => setGroundsAccountName(e.target.value)} />
            <input className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Shared email (optional)" value={groundsAccountEmail} onChange={(e) => setGroundsAccountEmail(e.target.value)} />
            <input className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Shared phone (optional)" value={groundsAccountPhone} onChange={(e) => setGroundsAccountPhone(e.target.value)} />

            <div className="rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] p-4">
              <div className="mb-2 text-sm font-medium text-[#5f5245]">Select existing users for grounds work</div>
              <div className="space-y-2">
                {eligibleGroundsProfiles.length === 0 ? (
                  <div className="text-sm text-[#8a7b68]">No grounds-capable users available yet.</div>
                ) : (
                  eligibleGroundsProfiles.map((profile) => (
                    <label key={profile.id} className="flex items-center gap-2 text-sm text-[#6f6255]">
                      <input
                        type="checkbox"
                        checked={selectedGroundsMemberProfileIds.includes(profile.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedGroundsMemberProfileIds((prev) => [...prev, profile.id]);
                          } else {
                            setSelectedGroundsMemberProfileIds((prev) => prev.filter((id) => id !== profile.id));
                          }
                        }}
                      />
                      {profile.full_name || profile.email || profile.id}
                      <span className="text-xs text-[#8a7b68]">({profile.role})</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <button className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]" onClick={() => void addGroundsAccount()}>
              Link Selected Grounds Users
            </button>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Grounds Accounts</h2>
            <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">{groundsAccounts.length}</span>
          </div>
          <div className="space-y-3">
            {groundsAccounts.map((account) => (
              <div key={account.id} className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold">{account.display_name || "No name"}</div>
                    <div className="mt-1 text-sm text-[#6f6255]">{account.email || "No email"}</div>
                    <div className="mt-1 text-sm text-[#8a7b68]">{account.phone || "No phone"}</div>

                    <div className="mt-2 text-xs text-[#8a7b68]">Members:</div>

                    <div className="mt-2 space-y-2">
                      {(groundsMembersByAccountId[account.id] ?? []).length === 0 ? (
                        <div className="text-sm text-[#8a7b68]">No linked members</div>
                      ) : (
                        (groundsMembersByAccountId[account.id] ?? []).map((member) => (
                          <div key={member.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#eadfce] bg-white px-3 py-2">
                            <div className="min-w-0 text-sm text-[#5f5245]">
                              {member.full_name || member.email || member.id}
                            </div>

                            <button className="rounded-full border border-[#efc6c6] bg-[#fff5f5] px-3 py-1 text-xs text-[#8a2e22] transition hover:bg-[#fff0f0]" onClick={() => void unlinkGroundsFromAccount(account.id, member.id)}>
                              Remove
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                      <select className="w-full rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#b48d4e]" value={groundsLinkSelections[account.id] || ""} onChange={(e) => setGroundsLinkSelections((prev) => ({ ...prev, [account.id]: e.target.value }))}>
                        <option value="">Select grounds user to link</option>
                        {eligibleGroundsProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.full_name || profile.email || profile.id}
                          </option>
                        ))}
                      </select>

                      <button className="rounded-full bg-[#241c15] px-4 py-2 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]" onClick={() => void linkGroundsToAccount(account.id, groundsLinkSelections[account.id])}>
                        Link user
                      </button>
                    </div>
                  </div>

                  <div className="w-full md:w-[220px]">
                    <button className="w-full rounded-[14px] border border-[#efc6c6] bg-[#fff5f5] px-3 py-2 text-sm text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:opacity-50" onClick={() => void deleteGroundsAccount(account)} disabled={reassigningJobId === account.id}>
                      {reassigningJobId === account.id ? "Deleting..." : "Delete grounds account"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderAssignmentsSection() {
    return (
      <div className="space-y-6">
        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <h2 className="text-xl font-semibold tracking-tight">Assign Cleaner to Property</h2>
          <p className="mt-1 text-sm text-[#7f7263]">
            Choose an approved cleaner and assign them as primary or backup. If they are not linked to a cleaner account yet, the system will create that link automatically.
          </p>

          <div className="mt-5 space-y-3">
            <select className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" value={assignmentPropertyId} onChange={(e) => setAssignmentPropertyId(e.target.value)}>
              <option value="">Select property</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <select className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" value={assignmentCleanerProfileId} onChange={(e) => setAssignmentCleanerProfileId(e.target.value)}>
              <option value="">Select cleaner</option>
              {eligibleCleanerProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name || profile.email || profile.id}
                </option>
              ))}
            </select>

            <select className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" value={assignmentPriority} onChange={(e) => setAssignmentPriority(e.target.value)}>
              <option value="1">Primary</option>
              <option value="2">Backup</option>
              <option value="3">Second Backup</option>
            </select>

            <button className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]" onClick={() => void addAssignment()}>
              Save Assignment
            </button>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Assignments</h2>
            <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">{assignments.length}</span>
          </div>
          <div className="space-y-3">
            {assignments.map((a) => {
              const members = cleanerMembersByAccountId[a.cleaner_account_id] ?? [];
              const memberLabel = members.length
                ? members.map((m) => m.full_name || m.email || m.id).join(", ")
                : getCleanerAccountName(a.cleaner_account_id);

              return (
                <div key={a.id} className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                  <div className="text-base font-semibold">{getPropertyName(a.property_id)}</div>
                  <div className="mt-1 text-sm text-[#6f6255]">{memberLabel}</div>
                  <div className="mt-1 text-xs text-[#8a7b68]">Cleaner account: {getCleanerAccountName(a.cleaner_account_id)}</div>
                  <div className="mt-2 inline-flex rounded-full border border-[#d8c7ab] bg-white px-3 py-1 text-xs font-medium text-[#7f7263]">
                    {getPriorityLabel(a.priority)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <h2 className="text-xl font-semibold tracking-tight">Assign Grounds to Property</h2>
          <p className="mt-1 text-sm text-[#7f7263]">
            Choose a grounds-capable user and assign them as primary or backup for grounds work. If they are not linked to a grounds account yet, the system will create that link automatically.
          </p>

          <div className="mt-5 space-y-3">
            <select className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" value={groundsAssignmentPropertyId} onChange={(e) => setGroundsAssignmentPropertyId(e.target.value)}>
              <option value="">Select property</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <select className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" value={groundsAssignmentProfileId} onChange={(e) => setGroundsAssignmentProfileId(e.target.value)}>
              <option value="">Select grounds user</option>
              {eligibleGroundsProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name || profile.email || profile.id}
                </option>
              ))}
            </select>

            <select className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" value={groundsAssignmentPriority} onChange={(e) => setGroundsAssignmentPriority(e.target.value)}>
              <option value="1">Primary</option>
              <option value="2">Backup</option>
              <option value="3">Second Backup</option>
            </select>

            <button className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]" onClick={() => void addGroundsAssignment()}>
              Save Grounds Assignment
            </button>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Grounds Assignments</h2>
            <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">{groundsAssignments.length}</span>
          </div>
          <div className="space-y-3">
            {groundsAssignments.map((a) => {
              const members = groundsMembersByAccountId[a.grounds_account_id] ?? [];
              const memberLabel = members.length ? members.map((m) => m.full_name || m.email || m.id).join(", ") : getGroundsAccountName(a.grounds_account_id);

              return (
                <div key={a.id} className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                  <div className="text-base font-semibold">{getPropertyName(a.property_id)}</div>
                  <div className="mt-1 text-sm text-[#6f6255]">{memberLabel}</div>
                  <div className="mt-1 text-xs text-[#8a7b68]">Grounds account: {getGroundsAccountName(a.grounds_account_id)}</div>
                  <div className="mt-2 inline-flex rounded-full border border-[#d8c7ab] bg-white px-3 py-1 text-xs font-medium text-[#7f7263]">
                    {getPriorityLabel(a.priority)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  function renderJobsSection() {
    return (
      <div className="space-y-6" id="jobs-section">
        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <h2 className="text-xl font-semibold tracking-tight">Create Cleaning Job</h2>
          <p className="mt-1 text-sm text-[#7f7263]">
            Create a turnover job. Slots are created automatically from cleaner account assignments.
          </p>

          <div className="mt-5 space-y-3">
            <select className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" value={jobPropertyId} onChange={(e) => setJobPropertyId(e.target.value)}>
              <option value="">Select property</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {selectedPropertyDefaults ? (
              <div className="rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] p-4 text-sm text-[#6f6255]">
                Default staffing: {selectedPropertyDefaults.default_cleaner_units_needed} unit{selectedPropertyDefaults.default_cleaner_units_needed === 1 ? "" : "s"}
                {selectedPropertyDefaults.cleaner_units_required_strict ? ", full team required" : ", one unit may proceed"}
              </div>
            ) : null}

            <label className="flex items-center gap-2 text-sm text-[#6f6255]">
              <input type="checkbox" checked={jobOverrideUnitsEnabled} onChange={(e) => setJobOverrideUnitsEnabled(e.target.checked)} />
              Override default staffing for this job
            </label>

            {jobOverrideUnitsEnabled ? (
              <div className="space-y-3 rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                <select className="w-full rounded-[16px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" value={jobUnitsNeeded} onChange={(e) => setJobUnitsNeeded(e.target.value)}>
                  <option value="1">Cleaner units needed: 1</option>
                  <option value="2">Cleaner units needed: 2</option>
                  <option value="3">Cleaner units needed: 3</option>
                </select>

                <label className="flex items-center gap-2 text-sm text-[#6f6255]">
                  <input type="checkbox" checked={jobUnitsStrict} onChange={(e) => setJobUnitsStrict(e.target.checked)} />
                  Full team required before fully staffed
                </label>

                <label className="flex items-center gap-2 text-sm text-[#6f6255]">
                  <input type="checkbox" checked={jobShowTeamStatus} onChange={(e) => setJobShowTeamStatus(e.target.checked)} />
                  Show team status to cleaners
                </label>
              </div>
            ) : null}

            <textarea className="min-h-[120px] w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Job notes. Example: Checkout date: 2026-04-08" value={jobNotes} onChange={(e) => setJobNotes(e.target.value)} />

            <button className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]" onClick={() => void createJob()}>
              Create Cleaning Job
            </button>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#d8e8d8] bg-[linear-gradient(180deg,#f8fcf8_0%,#f2f8f2_100%)] p-5 shadow-[0_18px_45px_rgba(28,86,39,0.08)]">
          <h2 className="text-xl font-semibold tracking-tight text-[#23422c]">Create Grounds Job</h2>
          <p className="mt-1 text-sm text-[#5b7460]">
            Create a grounds job. Grounds slots are offered automatically from the property's grounds assignments.
          </p>

          <div className="mt-5 space-y-3">
            <select className="w-full rounded-[20px] border border-[#b7cfb7] bg-white px-4 py-3 text-sm outline-none focus:border-[#4f8a5b]" value={groundsJobPropertyId} onChange={(e) => setGroundsJobPropertyId(e.target.value)}>
              <option value="">Select property</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <select className="w-full rounded-[20px] border border-[#b7cfb7] bg-white px-4 py-3 text-sm outline-none focus:border-[#4f8a5b]" value={groundsJobType} onChange={(e) => setGroundsJobType(e.target.value)}>
              {GROUNDS_JOB_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            <input
              type="date"
              className="w-full rounded-[20px] border border-[#b7cfb7] bg-white px-4 py-3 text-sm outline-none focus:border-[#4f8a5b]"
              value={groundsJobScheduledFor}
              onChange={(e) => setGroundsJobScheduledFor(e.target.value)}
            />
            {/* RECURRING TOGGLE */}
            <div className="mt-4 rounded-xl border border-[#2d4f3a] bg-[#0f2419] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#e8f5ec]">
                    Recurring Job
                  </p>
                  <p className="text-xs text-[#9fc7ad]">
                    Automatically create future grounds jobs
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                />
              </div>

              {isRecurring && (
                <div className="mt-4 space-y-3">
                  <select
                    value={recurringType}
                    onChange={(e) => setRecurringType(e.target.value)}
                    className="w-full rounded-lg bg-[#183828] p-2 text-sm text-[#e8f5ec]"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="semi-monthly">Semi Monthly</option>
                    <option value="monthly">Monthly</option>
                  </select>

                  <p className="text-xs text-[#9fc7ad]">
                    Next run will be calculated automatically
                  </p>
                </div>
              )}
            </div>
            {selectedGroundsProperty ? (
              <div className="rounded-[20px] border border-[#cfe2cf] bg-white p-4 text-sm text-[#46604b]">
                Property assignments found: {selectedGroundsPropertyAssignmentCount}. Default staffing is currently set from the grounds job form below.
              </div>
            ) : null}

            <label className="flex items-center gap-2 text-sm text-[#46604b]">
              <input type="checkbox" checked={groundsJobOverrideUnitsEnabled} onChange={(e) => setGroundsJobOverrideUnitsEnabled(e.target.checked)} />
              Set staffing options for this grounds job
            </label>

            {groundsJobOverrideUnitsEnabled ? (
              <div className="space-y-3 rounded-[20px] border border-[#cfe2cf] bg-white p-4">
                <select className="w-full rounded-[16px] border border-[#b7cfb7] bg-white px-4 py-3 text-sm outline-none focus:border-[#4f8a5b]" value={groundsJobUnitsNeeded} onChange={(e) => setGroundsJobUnitsNeeded(e.target.value)}>
                  <option value="1">Grounds units needed: 1</option>
                  <option value="2">Grounds units needed: 2</option>
                  <option value="3">Grounds units needed: 3</option>
                </select>

                <label className="flex items-center gap-2 text-sm text-[#46604b]">
                  <input type="checkbox" checked={groundsJobUnitsStrict} onChange={(e) => setGroundsJobUnitsStrict(e.target.checked)} />
                  Full grounds team required before fully staffed
                </label>

                <label className="flex items-center gap-2 text-sm text-[#46604b]">
                  <input type="checkbox" checked={groundsJobShowTeamStatus} onChange={(e) => setGroundsJobShowTeamStatus(e.target.checked)} />
                  Show team status to grounds workers
                </label>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-[18px] border border-[#cfe2cf] bg-white px-4 py-3 text-sm text-[#46604b]">
                <input type="checkbox" checked={groundsJobNeedsSecureAccess} onChange={(e) => setGroundsJobNeedsSecureAccess(e.target.checked)} />
                Needs secure access
              </label>

              <label className="flex items-center gap-2 rounded-[18px] border border-[#cfe2cf] bg-white px-4 py-3 text-sm text-[#46604b]">
                <input type="checkbox" checked={groundsJobNeedsGarageAccess} onChange={(e) => setGroundsJobNeedsGarageAccess(e.target.checked)} />
                Needs garage access
              </label>
            </div>

            <textarea className="min-h-[120px] w-full rounded-[20px] border border-[#b7cfb7] bg-white px-4 py-3 text-sm outline-none focus:border-[#4f8a5b]" placeholder="Grounds job notes. Example: Put bins out tonight and return them tomorrow afternoon." value={groundsJobNotes} onChange={(e) => setGroundsJobNotes(e.target.value)} />

            <button
  onClick={async () => {
    if (!groundsJobPropertyId || !groundsJobScheduledFor) {
      alert("Please select property and date");
      return;
    }

    // 🔁 RECURRING LOGIC
    if (isRecurring) {
      const { error } = await supabase.from("grounds_recurring_rules").insert({
        property_id: groundsJobPropertyId,
        job_type: groundsJobType,
        frequency_type: recurringType,
        next_run_date: groundsJobScheduledFor,
        active: true,
      });

      if (error) {
        console.error(error);
        alert("Failed to create recurring rule");
        return;
      }

      alert("Recurring rule created");
      return;
    }

    // 🧹 NORMAL JOB CREATION
    const { error } = await supabase.from("grounds_jobs").insert({
      property_id: groundsJobPropertyId,
      job_type: groundsJobType,
      scheduled_for: groundsJobScheduledFor,
      notes: groundsJobNotes,
      needs_secure_access: groundsJobNeedsSecureAccess,
      needs_garage_access: groundsJobNeedsGarageAccess,
      grounds_units_needed: parseInt(groundsJobUnitsNeeded || "1"),
      grounds_units_strict: groundsJobUnitsStrict,
      grounds_show_team_status: groundsJobShowTeamStatus,
      status: "pending",
    });

    if (error) {
      console.error(error);
      alert("Failed to create job");
      return;
    }

    alert("Grounds job created");
  }}
  className="inline-flex items-center justify-center rounded-full bg-[#23422c] px-5 py-2 text-sm font-medium text-white"
>
  Create Grounds Job
</button>
          </div>
          <div className="mt-8 border-t border-[#cfe2cf] pt-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-[#23422c]">Recurring Grounds Rules</h3>
                <p className="mt-1 text-sm text-[#5b7460]">
                  New recurring grounds scheduling rules. This is the new system that will eventually generate future grounds jobs automatically.
                </p>
              </div>
              <span className="rounded-full border border-[#cfe2cf] bg-white px-3 py-1 text-xs font-medium text-[#46604b]">{groundsRecurringRules.length}</span>
            </div>

            <div className="space-y-3">
              {groundsRecurringRules.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[#b7cfb7] bg-white px-4 py-4 text-sm text-[#5b7460]">
                  No recurring grounds rules yet.
                </div>
              ) : (
                groundsRecurringRules.map((rule) => (
                  <div key={rule.id} className="rounded-[22px] border border-[#cfe2cf] bg-white p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-base font-semibold text-[#23422c]">{getPropertyName(rule.property_id)}</div>
                        <div className="mt-1 text-sm text-[#46604b]">{getGroundsRuleLabel(rule)}</div>
                        <div className="mt-1 text-sm text-[#5b7460]">Frequency: {getGroundsRuleFrequencyLabel(rule)}</div>
                        <div className="mt-1 text-sm text-[#5b7460]">Next run: {rule.next_run_date ? formatScheduledFor(rule.next_run_date) : "Not set"}</div>
                        <div className="mt-1 text-sm text-[#5b7460]">Staffing: {rule.grounds_units_needed} unit{rule.grounds_units_needed === 1 ? "" : "s"}{rule.grounds_units_required_strict ? ", strict" : ", flexible"}</div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${rule.active ? "border-[#cfe2cf] bg-[#f7fbf7] text-[#46604b]" : "border-[#efc6c6] bg-[#fff5f5] text-[#8a2e22]"}`}>
                          {rule.active ? "Active" : "Paused"}
                        </span>
                        <span className="rounded-full border border-[#cfe2cf] bg-[#f7fbf7] px-3 py-1 text-xs font-medium text-[#46604b]">
                          Secure access: {rule.needs_secure_access ? "Yes" : "No"}
                        </span>
                        <span className="rounded-full border border-[#cfe2cf] bg-[#f7fbf7] px-3 py-1 text-xs font-medium text-[#46604b]">
                          Garage: {rule.needs_garage_access ? "Yes" : "No"}
                        </span>
                      </div>
                    </div>

                    {rule.notes ? (
                      <div className="mt-3 text-sm leading-6 text-[#46604b]">{rule.notes}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#d8e8d8] bg-[linear-gradient(180deg,#f8fcf8_0%,#f2f8f2_100%)] p-5 shadow-[0_18px_45px_rgba(28,86,39,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[#23422c]">Grounds Jobs</h2>
              <p className="mt-1 text-sm text-[#5b7460]">Manual grounds jobs now live here. These use the same account-and-slot flow as cleaner jobs.</p>
            </div>
            <span className="rounded-full border border-[#cfe2cf] bg-white px-3 py-1 text-xs font-medium text-[#46604b]">{groundsJobs.length}</span>
          </div>

  <div className="space-y-3">
  {groundsJobs.length === 0 ? (
    <div className="rounded-[22px] border border-dashed border-[#b7cfb7] bg-white px-4 py-4 text-sm text-[#5b7460]">
      No grounds jobs yet.
    </div>
  ) : (
    groundsJobs.map((job) => {
      const slots = groundsJobSlotsByJobId[job.id] ?? [];
      const acceptedCount = slots.filter((slot) => slot.status === "accepted").length;
      const offeredCount = slots.filter((slot) => slot.status === "offered").length;
      const declinedCount = slots.filter((slot) => slot.status === "declined").length;

      return (
        <div key={job.id} className="rounded-[22px] border border-[#cfe2cf] bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-base font-semibold text-[#23422c]">
                {getPropertyName(job.property_id)}
              </div>
              <div className="mt-1 text-sm text-[#46604b]">
                {GROUNDS_JOB_TYPE_OPTIONS.find((option) => option.value === job.job_type)?.label ||
                  job.job_type ||
                  "Grounds job"}
              </div>
              <div className="mt-1 text-sm text-[#5b7460]">
                Scheduled: {formatScheduledFor(job.scheduled_for)}
              </div>
              <div className="mt-1 text-sm text-[#5b7460]">
                Status:{" "}
                <span className="font-medium text-[#23422c]">
                  {getGroundsJobDisplayStatus(job, slots)}
                </span>
              </div>
              <div className="mt-1 text-sm text-[#5b7460]">
                Team progress: {acceptedCount}/{job.grounds_units_needed} accepted
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-[#cfe2cf] bg-[#f7fbf7] px-3 py-1 text-xs font-medium text-[#46604b]">
                Offered: {offeredCount}
              </span>
              <span className="rounded-full border border-[#cfe2cf] bg-[#f7fbf7] px-3 py-1 text-xs font-medium text-[#46604b]">
                Declined: {declinedCount}
              </span>
              <span className="rounded-full border border-[#cfe2cf] bg-[#f7fbf7] px-3 py-1 text-xs font-medium text-[#46604b]">
                Secure access: {job.needs_secure_access ? "Yes" : "No"}
              </span>
            </div>
          </div>

          {job.notes ? (
            <div className="mt-3 text-sm leading-6 text-[#46604b]">{job.notes}</div>
          ) : null}

          <div className="mt-3 space-y-2">
            {slots.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-[#cfe2cf] bg-[#f7fbf7] px-3 py-3 text-xs text-[#5b7460]">
                No grounds slots created yet.
              </div>
            ) : (
              slots.map((slot) => (
                <div
                  key={slot.id}
                  className="rounded-[18px] border border-[#cfe2cf] bg-[#f7fbf7] px-3 py-3 text-xs text-[#46604b]"
                >
                  <div>Slot {slot.slot_number}</div>
                  <div>Account: {getGroundsAccountName(slot.grounds_account_id)}</div>
                  <div>Status: {slot.status}</div>
                  <div>Offered: {formatDateTime(slot.offered_at)}</div>
                  <div>Accepted: {formatDateTime(slot.accepted_at)}</div>
                  <div>Declined: {formatDateTime(slot.declined_at)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    })
  )}
</div>
        </section>


        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Admin Calendar</h2>
              <p className="mt-1 text-sm text-[#7f7263]">
                Month view of all scheduled cleanings. Click a day to see everything happening on that date.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-2 text-sm font-medium text-[#6f6255] transition hover:bg-white"
                onClick={() =>
                  setAdminCalendarMonth(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                  )
                }
              >
                Prev
              </button>
              <div className="min-w-[170px] text-center text-sm font-semibold text-[#241c15]">
                {formatMonthLabel(adminCalendarMonth)}
              </div>
              <button
                type="button"
                className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-2 text-sm font-medium text-[#6f6255] transition hover:bg-white"
                onClick={() =>
                  setAdminCalendarMonth(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                  )
                }
              >
                Next
              </button>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[26px] border border-[#eadfce]">
            <div className="grid grid-cols-7 border-b border-[#eadfce] bg-[#f8f4ee]">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#8a7b68]">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 bg-white">
              {adminCalendarDays.map((day) => {
                const dateYmd = toYmd(day);
                const dayJobs = adminJobsByDate.get(dateYmd) ?? [];
                const urgentCount = dayJobs.filter((job) => {
                  const slots = jobSlotsByJobId[job.id] ?? [];
                  return slots.some((slot) => slot.status === "offered" || slot.status === "stranded");
                }).length;
                const isCurrentMonth = day.getMonth() === adminCalendarMonth.getMonth();
                const isSelected = adminSelectedDate === dateYmd;
                const isToday = dateYmd === toYmd(now);

                return (
                  <button
                    key={dateYmd}
                    type="button"
                    onClick={() => selectAdminCalendarDate(dateYmd)}
                    className={`min-h-[118px] border-r border-b border-[#eadfce] p-2 text-left align-top transition ${isSelected
                      ? "bg-[#fffaf3] shadow-[inset_0_0_0_2px_rgba(180,141,78,0.65)]"
                      : "hover:bg-[#fcfaf7]"
                      } ${!isCurrentMonth ? "bg-[#fbf9f5] text-[#b1a392]" : "text-[#241c15]"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-[#241c15] text-[#f8f2e8]" : "bg-transparent"
                          }`}
                      >
                        {day.getDate()}
                      </div>

                      {dayJobs.length > 0 ? (
                        <span className="rounded-full border border-[#d8c7ab] bg-white px-2 py-0.5 text-[11px] font-medium text-[#7f7263]">
                          {dayJobs.length}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 space-y-1">
                      {dayJobs.slice(0, 2).map((job) => {
                        const propertyColor = getPropertyColor(job.property_id);
                        const isStranded = (jobSlotsByJobId[job.id] ?? []).some((slot) => slot.status === "stranded");
                        const isOffered = (jobSlotsByJobId[job.id] ?? []).some((slot) => slot.status === "offered");

                        return (
                          <div
                            key={job.id}
                            className="truncate rounded-full border px-2 py-1 text-[11px] font-medium"
                            style={{
                              backgroundColor: propertyColor.bg,
                              color: isStranded ? "#8a2e22" : isOffered ? "#8a5a0a" : propertyColor.text,
                              borderColor: isStranded ? "#efc6c6" : isOffered ? "#f2d49b" : propertyColor.border,
                            }}
                          >
                            {getPropertyName(job.property_id)}
                          </div>
                        );
                      })}

                      {dayJobs.length > 2 ? (
                        <div className="text-[11px] text-[#8a7b68]">+{dayJobs.length - 2} more</div>
                      ) : null}

                      {urgentCount > 0 ? (
                        <div className="pt-1 text-[11px] font-semibold text-[#8a2e22]">
                          {urgentCount} urgent
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-4">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Happenings for {formatDateLabel(adminSelectedDate)}</h3>
                <div className="mt-1 text-sm text-[#7f7263]">
                  {adminSelectedDayJobs.length} job{adminSelectedDayJobs.length === 1 ? "" : "s"} on this day
                </div>
              </div>

              <button
                type="button"
                className="mt-2 rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-medium text-[#6f6255] transition hover:bg-[#f7f3ee] md:mt-0"
                onClick={() => {
                  const today = new Date();
                  setAdminCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                  setAdminSelectedDate(toYmd(today));
                }}
              >
                Jump to Today
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {adminSelectedDayJobs.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-[#d8c7ab] bg-white px-4 py-4 text-sm text-[#7f7263]">
                  Nothing scheduled for this day yet.
                </div>
              ) : (
                adminSelectedDayJobs.map((job) => {
                  const slots = jobSlotsByJobId[job.id] ?? [];
                  const acceptedCount = slots.filter((slot) => slot.status === "accepted").length;
                  const offeredCount = slots.filter((slot) => slot.status === "offered").length;
                  const strandedCount = slots.filter((slot) => slot.status === "stranded").length;
                  const declinedCount = slots.filter((slot) => slot.status === "declined").length;
                  const propertyColor = getPropertyColor(job.property_id);

                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => {
                        setHighlightedJobId(job.id);
                        setTimeout(() => {
                          document.getElementById(`job-${job.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }, 50);
                      }}
                      className="block w-full rounded-[20px] border bg-white p-4 text-left transition hover:shadow-sm"
                      style={{ borderColor: propertyColor.border, boxShadow: `inset 4px 0 0 ${propertyColor.text}` }}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-full border"
                              style={{ backgroundColor: propertyColor.text, borderColor: propertyColor.border }}
                            />
                            <div className="text-base font-semibold text-[#241c15]">
                              {getPropertyName(job.property_id)}
                            </div>
                          </div>
                          <div className="mt-1 text-sm text-[#6f6255]">
                            {getJobDisplayStatus(job, slots)}
                          </div>
                          <div className="mt-1 text-sm text-[#8a7b68]">
                            Team progress: {acceptedCount}/{job.cleaner_units_needed} accepted
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">
                            Offered: {offeredCount}
                          </span>
                          <span className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">
                            Declined: {declinedCount}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${strandedCount > 0
                            ? "border border-[#efc6c6] bg-[#fff5f5] text-[#8a2e22]"
                            : "border border-[#d8c7ab] bg-[#fcfaf7] text-[#7f7263]"
                            }`}>
                            Stranded: {strandedCount}
                          </span>
                        </div>
                      </div>

                      {job.notes ? (
                        <div className="mt-3 line-clamp-2 text-sm leading-6 text-[#6f6255]">
                          {job.notes}
                        </div>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section
          id="waiting-jobs-section"
          className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]"
        >
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold tracking-tight">Jobs</h2>
              <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">{filteredJobs.length}</span>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-2 text-sm font-medium text-[#6f6255] outline-none transition focus:border-[#b48d4e]"
                value={selectedJobsPropertyFilter}
                onChange={(e) => {
                  setSelectedJobsPropertyFilter(e.target.value);
                  setJobsExpanded(false);
                }}
              >
                <option value="all">All properties</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name || property.address || "Unnamed property"}
                  </option>
                ))}
              </select>

              {filteredJobs.length > 3 ? (
                <button onClick={() => setJobsExpanded((prev) => !prev)} className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-3 py-1.5 text-xs font-medium text-[#6f6255] transition hover:bg-white">
                  {jobsExpanded ? "Collapse Jobs" : `Show All ${filteredJobs.length} Jobs`}
                </button>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            {visibleJobs.map((job) => {
              const slots = jobSlotsByJobId[job.id] ?? [];
              const acceptedCount = slots.filter((slot) => slot.status === "accepted").length;

              return (
                <div
                  key={job.id}
                  id={`job-${job.id}`}
                  onClick={() => setHighlightedJobId(job.id)}
                  className={`rounded-[22px] p-4 transition cursor-pointer ${highlightedJobId === job.id ? "border-2 border-[#b48d4e] bg-[#fffaf3] shadow-lg" : "border border-[#eadfce] bg-[#fcfaf7] hover:shadow-sm"}`}
                >
                  <div className="text-base font-semibold">{getPropertyName(job.property_id)}</div>
                  <div className="mt-2 text-sm text-[#6f6255]">
                    Status: <span className="font-medium text-[#241c15]">{getJobDisplayStatus(job, slots)}</span>
                  </div>
                  <div className="mt-1 text-sm text-[#8a7b68]">
                    Team progress: {acceptedCount}/{job.cleaner_units_needed} accepted
                  </div>
                  <div className="mt-1 text-sm text-[#8a7b68]">
                    Slots: {slots.filter((slot) => slot.status === "offered").length} offered, {slots.filter((slot) => slot.status === "declined").length} declined, {slots.filter((slot) => slot.status === "stranded").length} stranded
                  </div>
                  <div className="mt-1 text-sm text-[#8a7b68]">
                    Cleaning date: {formatScheduledFor(job.scheduled_for || extractCheckoutDate(job.notes))}
                  </div>

                  {getActiveCountdownMs(job.id) !== null && acceptedCount < job.cleaner_units_needed && (
                    <div className={`mt-1 text-sm font-semibold ${getCountdownTone(getActiveCountdownMs(job.id))}`}>
                      {getActiveCountdownMs(job.id)! < 0
                        ? `Offer overdue by ${formatRemaining(getActiveCountdownMs(job.id)!)}`
                        : `Current offer expires in ${formatRemaining(getActiveCountdownMs(job.id)!)}`
                      }
                    </div>
                  )}

                  <div className="mt-3 space-y-2">
                    {slots.map((slot) => (
                      <div key={slot.id} className="rounded-[18px] border border-[#eadfce] bg-white px-3 py-2 text-xs text-[#6f6255]">
                        <div>Slot {slot.slot_number}: {getCleanerAccountName(slot.cleaner_account_id)}</div>
                        <div>Status: {slot.status}</div>
                        <div>Offered: {formatDateTime(slot.offered_at)}</div>
                        <div>Expires: {formatDateTime(slot.expires_at)}</div>
                        <div>Accepted: {formatDateTime(slot.accepted_at)}</div>
                        <div>Declined: {formatDateTime(slot.declined_at)}</div>
                      </div>
                    ))}
                  </div>

                  {acceptedCount < job.cleaner_units_needed ? (
                    <div className="mt-3 rounded-[18px] border border-[#eadfce] bg-white p-3">
                      <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">
                        Reassign next open slot
                      </div>

                      <div className="grid gap-2 md:grid-cols-[1fr_220px]">
                        <select
                          className="w-full rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#b48d4e]"
                          value={reassignSelections[job.id] || ""}
                          onChange={(e) =>
                            setReassignSelections((prev) => ({ ...prev, [job.id]: e.target.value }))
                          }
                        >
                          <option value="">Select cleaner account</option>
                          {cleanerAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.display_name || "Unnamed cleaner account"}
                            </option>
                          ))}
                        </select>

                        <button
                          className="rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60"
                          onClick={(e) => {
                            e.stopPropagation();
                            void reassignOpenJob(job.id);
                          }}
                          disabled={reassigningJobId === job.id}
                        >
                          {reassigningJobId === job.id ? "Reassigning..." : "Reassign next open slot"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 text-sm leading-6 text-[#6f6255]">{job.notes || "No notes"}</div>
                </div>
              );
            })}
          </div>
        </section>

        {filteredStrandedJobs.length > 0 ? (
          <section
            id="stranded-jobs-section"
            className="rounded-[30px] border border-[#f0b4b4] bg-[linear-gradient(135deg,#fff5f5_0%,#ffe9e9_100%)] p-5 shadow-[0_18px_45px_rgba(140,32,32,0.12)]"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-[#b14b4b]">Immediate Attention Needed</div>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#7e1f1f] animate-pulse">
                  🚨 {filteredStrandedJobs.length} stranded job{filteredStrandedJobs.length === 1 ? "" : "s"}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8b3838]">
                  These jobs have missing cleaner units and need manual assignment.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {filteredStrandedJobs.map((job) => {
                const slots = jobSlotsByJobId[job.id] ?? [];
                const remainingMs = getActiveCountdownMs(job.id);

                return (
                  <div key={job.id} className="rounded-[22px] border border-[#f0d0d0] bg-white px-4 py-4 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-base font-semibold text-[#241c15]">{job.property_name || getPropertyName(job.property_id)}</div>
                        <div className="mt-1 text-sm text-[#8a5d4b]">
                          Cleaning date: {formatScheduledFor(job.scheduled_for || extractCheckoutDate(job.notes))}
                        </div>
                        <div className="mt-1 text-sm text-[#8a5d4b]">
                          Status: {job.staffing_status || job.status || "Stranded"}
                        </div>
                        {remainingMs !== null ? (
                          <div className={`mt-1 text-sm font-semibold ${getCountdownTone(remainingMs)}`}>
                            {remainingMs < 0 ? `Offer overdue by ${formatRemaining(remainingMs)}` : `Current offer expires in ${formatRemaining(remainingMs)}`}
                          </div>
                        ) : null}
                        <div className="mt-3 text-sm leading-6 text-[#6f6255]">{job.notes || "No notes"}</div>
                      </div>

                      <div className="w-full max-w-sm">
                        <select
                          className="w-full rounded-[16px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#b48d4e]"
                          value={reassignSelections[job.id] || ""}
                          onChange={(e) =>
                            setReassignSelections((prev) => ({ ...prev, [job.id]: e.target.value }))
                          }
                        >
                          <option value="">Select cleaner account</option>
                          {cleanerAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.display_name || "Unnamed cleaner account"}
                            </option>
                          ))}
                        </select>

                        <button
                          className="mt-3 w-full rounded-full bg-[#7e1f1f] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#6a1717] disabled:opacity-60"
                          onClick={() => void reassignStrandedJob(job.id)}
                          disabled={reassigningJobId === job.id}
                        >
                          {reassigningJobId === job.id ? "Reassigning..." : "Reassign Stranded Job"}
                        </button>

                        <div className="mt-3 space-y-2">
                          {slots.map((slot) => (
                            <div key={slot.id} className="rounded-[16px] border border-[#eadfce] bg-[#fcfaf7] px-3 py-2 text-xs text-[#6f6255]">
                              <div>Slot {slot.slot_number}: {getCleanerAccountName(slot.cleaner_account_id)}</div>
                              <div>Status: {slot.status}</div>
                              <div>Expires: {formatDateTime(slot.expires_at)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {recentDeclinedJobs.length > 0 ? (
          <section className="rounded-[30px] border border-[#efd8c9] bg-[linear-gradient(135deg,#fff8f4_0%,#fff2eb_100%)] p-5 shadow-[0_18px_45px_rgba(140,80,32,0.08)]">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-[#b16a4b]">Recent Activity</div>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#8a4526]">Recently Declined Slots</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8a5d4b]">Latest cleaner-account declines.</p>
            </div>

            <div className="mt-4 grid gap-3">
              {recentDeclinedJobs.map((slot) => {
                const job = jobs.find((j) => j.id === slot.job_id);
                return (
                  <div key={slot.id} className="rounded-[22px] border border-[#edd8cc] bg-white px-4 py-4 shadow-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-base font-semibold text-[#241c15]">{getPropertyName(job?.property_id || null)}</div>
                        <div className="mt-1 text-sm text-[#6f6255]">Cleaner account: {getCleanerAccountName(slot.cleaner_account_id)}</div>
                        <div className="mt-1 text-sm text-[#8a7b68]">
                          Cleaning date: {formatScheduledFor(job?.scheduled_for || extractCheckoutDate(job?.notes || null))}
                        </div>
                        <div className="mt-3 text-sm leading-6 text-[#6f6255]">{job?.notes || "No notes"}</div>
                      </div>

                      <div className="rounded-[18px] border border-[#efe1d8] bg-[#fcfaf7] px-4 py-3 text-sm text-[#8a5d4b]">
                        <div>Declined: {formatDateTime(slot.declined_at)}</div>
                        <div className="mt-1">Offered: {formatDateTime(slot.offered_at)}</div>
                        <div className="mt-1">Slot: {slot.slot_number}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  function renderPropertySetupSection() {
    return (
      <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <h2 className="text-xl font-semibold tracking-tight">Property Setup</h2>
        <p className="mt-1 text-sm text-[#7f7263]">Manage access notes, booking calendars, and visual SOPs.</p>

        <div className="mt-5">
          <select className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" value={selectedPropertyId} onChange={(e) => setSelectedPropertyId(e.target.value)}>
            <option value="">Select property</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {selectedPropertyId ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="rounded-[26px] border border-[#eadfce] bg-[#fcfaf7] p-5 lg:col-span-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Property Staffing Defaults</h3>
                </div>
                <button
                  className="inline-flex items-center justify-center rounded-full border border-[#efc6c6] bg-[#fff5f5] px-5 py-2.5 text-sm font-medium text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:opacity-50"
                  onClick={() => {
                    const property = properties.find((p) => p.id === selectedPropertyId);
                    if (property) void deleteProperty(property);
                  }}
                  disabled={deletingPropertyId === selectedPropertyId}
                >
                  {deletingPropertyId === selectedPropertyId ? "Deleting property..." : "Delete This Property"}
                </button>
              </div>
              <p className="mt-1 text-sm text-[#7f7263]">Edit how many cleaner units this property usually needs, whether the full team must accept, and whether cleaners can see team progress.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#5f5245]">Cleaner units needed</label>
                  <select className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" value={selectedPropertyUnitsNeeded} onChange={(e) => {
                    setSelectedPropertyUnitsNeeded(e.target.value);
                    setPropertyDefaultsDirty(true);
                  }}>
                    <option value="1">1 cleaner unit</option>
                    <option value="2">2 cleaner units</option>
                    <option value="3">3 cleaner units</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 rounded-[18px] border border-[#eadfce] bg-white px-4 py-3 text-sm text-[#6f6255]">
                  <input type="checkbox" checked={selectedPropertyUnitsStrict} onChange={(e) => {
                    setSelectedPropertyUnitsStrict(e.target.checked);
                    setPropertyDefaultsDirty(true);
                  }} />
                  Property must have full team
                </label>
                <label className="flex items-center gap-2 rounded-[18px] border border-[#eadfce] bg-white px-4 py-3 text-sm text-[#6f6255]">
                  <input type="checkbox" checked={selectedPropertyShowTeamStatus} onChange={(e) => {
                    setSelectedPropertyShowTeamStatus(e.target.checked);
                    setPropertyDefaultsDirty(true);
                  }} />
                  Show team status to cleaners
                </label>
              </div>
              <div className="mt-4">
                <button className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60" onClick={() => void saveSelectedPropertyDefaults()} disabled={savingSelectedPropertyDefaults}>
                  {savingSelectedPropertyDefaults ? "Saving..." : "Save Property Setup"}
                </button>
              </div>
            </div>

            <div className="rounded-[26px] border border-[#eadfce] bg-[#fcfaf7] p-5">
              <h3 className="text-lg font-semibold">Access Notes</h3>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#5f5245]">Door code</label>
                  <input className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Front door / smart lock code" value={doorCode} onChange={(e) => {
                    setDoorCode(e.target.value);
                    setAccessDirty(true);
                  }} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#5f5245]">Alarm code</label>
                  <input className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Alarm panel code" value={alarmCode} onChange={(e) => {
                    setAlarmCode(e.target.value);
                    setAccessDirty(true);
                  }} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#5f5245]">Extra access notes</label>
                  <textarea className="min-h-[120px] w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Entry directions, tricky locks, gate notes, etc." value={accessNotes} onChange={(e) => {
                    setAccessNotes(e.target.value);
                    setAccessDirty(true);
                  }} />
                </div>
                <button className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]" onClick={() => void saveAccess()}>
                  Save Access
                </button>
              </div>
            </div>

            <div className="rounded-[26px] border border-[#eadfce] bg-[#fcfaf7] p-5">
              <h3 className="text-lg font-semibold">Booking Calendars</h3>
              <p className="mt-1 text-sm text-[#7f7263]">
                Add as many calendar feeds as you need for this property. Examples:
                Airbnb, VRBO, Booking.com, direct booking, Hospitable, or any custom iCal URL.
              </p>

              <div className="mt-4 space-y-4">
                <div className="rounded-[18px] border border-[#eadfce] bg-white px-4 py-3 text-sm text-[#6f6255]">
                  Draft rows: {calendarRowsDraft.length}. Saved rows for this property: {propertyCalendars.filter((calendar) => calendar.property_id === selectedPropertyId).length}.
                </div>

                {propertyCalendars.filter((calendar) => calendar.property_id === selectedPropertyId).length > 0 ? (
                  <div className="rounded-[20px] border border-[#eadfce] bg-white p-4">
                    <div className="mb-3 text-sm font-medium text-[#5f5245]">Currently saved calendars</div>
                    <div className="space-y-2">
                      {propertyCalendars
                        .filter((calendar) => calendar.property_id === selectedPropertyId)
                        .map((calendar) => (
                          <div
                            key={calendar.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#eadfce] bg-[#fcfaf7] px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-[#241c15]">{calendar.source || "Unnamed calendar"}</div>
                              <div className="truncate text-xs text-[#8a7b68]">{calendar.ical_url}</div>
                            </div>
                            <div className="text-xs text-[#8a7b68]">
                              {calendar.is_active === false ? "Inactive" : "Active"}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}

                {calendarRowsDraft.length === 0 ? (
                  <div className="rounded-[18px] border border-dashed border-[#d8c7ab] bg-white px-4 py-4 text-sm text-[#7f7263]">
                    No calendars added yet.
                  </div>
                ) : null}

                {calendarRowsDraft.map((row, index) => (
                  <div
                    key={row.id ?? `draft-${index}`}
                    className="rounded-[20px] border border-[#eadfce] bg-white p-4"
                  >
                    <div className="grid gap-3">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-[#5f5245]">
                          Source name
                        </label>
                        <input
                          className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                          placeholder="Airbnb, VRBO, Booking.com, Direct, etc."
                          value={row.source}
                          onChange={(e) =>
                            updateCalendarDraftRow(index, "source", e.target.value)
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-[#5f5245]">
                          iCal URL
                        </label>
                        <input
                          className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                          placeholder="Paste calendar URL"
                          value={row.ical_url}
                          onChange={(e) =>
                            updateCalendarDraftRow(index, "ical_url", e.target.value)
                          }
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm text-[#6f6255]">
                          <input
                            type="checkbox"
                            checked={row.is_active}
                            onChange={(e) =>
                              updateCalendarDraftRow(index, "is_active", e.target.checked)
                            }
                          />
                          Active
                        </label>

                        <button
                          type="button"
                          className="rounded-full border border-[#efc6c6] bg-[#fff5f5] px-4 py-2 text-sm text-[#8a2e22] transition hover:bg-[#fff0f0]"
                          onClick={() => removeCalendarDraftRow(index)}
                        >
                          Remove calendar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full border border-[#241c15] bg-white px-5 py-2.5 text-sm font-medium text-[#241c15] transition hover:bg-[#f7f3ee]"
                    onClick={addCalendarDraftRow}
                  >
                    Add Calendar
                  </button>

                  <button className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60" onClick={() => void saveCalendars()} disabled={savingCalendars}>
                    {savingCalendars ? "Saving..." : "Save Calendars"}
                  </button>

                  <button className="inline-flex items-center justify-center rounded-full border border-[#241c15] bg-white px-5 py-2.5 text-sm font-medium text-[#241c15] transition hover:bg-[#f7f3ee] disabled:opacity-60" onClick={() => void syncCalendarsNow()} disabled={syncingCalendarsNow}>
                    {syncingCalendarsNow ? "Syncing..." : "Sync Calendars Now"}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[26px] border border-[#eadfce] bg-[#fcfaf7] p-5">
              <h3 className="text-lg font-semibold">Add SOP Note</h3>
              <div className="mt-4 space-y-3">
                <input className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="SOP title" value={sopTitle} onChange={(e) => setSopTitle(e.target.value)} />
                <textarea className="min-h-[120px] w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Optional note or instruction" value={sopContent} onChange={(e) => setSopContent(e.target.value)} />

                <div className="rounded-[20px] border border-dashed border-[#d8c7ab] bg-white p-4">
                  <label className="mb-2 block text-sm font-medium text-[#5f5245]">SOP photos</label>
                  <input type="file" accept="image/*" multiple onChange={handleSopFilesChange} className="block w-full text-sm text-[#6c5f51]" />
                  <div className="mt-3 text-sm text-[#7f7263]">
                    {sopFiles.length > 0 ? `${sopFiles.length} image${sopFiles.length === 1 ? "" : "s"} selected` : "No images selected yet."}
                  </div>
                </div>

                <button className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60" onClick={() => void addSop()} disabled={uploadingSop}>
                  {uploadingSop ? "Uploading..." : "Add SOP"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-[24px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-5 py-8 text-sm text-[#8a7b68]">
            Select a property to manage calendars, SOPs, and access details.
          </div>
        )}

        {selectedPropertyId ? (
          <div className="mt-6">
            <h3 className="mb-3 text-lg font-semibold">Existing SOP Notes</h3>
            <div className="space-y-4">
              {selectedSops.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-5 py-6 text-sm text-[#8a7b68]">No SOP notes yet.</div>
              ) : null}

              {selectedSops.map((s) => {
                const images = sopImagesBySopId[s.id] ?? [];
                return (
                  <div key={s.id} className="rounded-[26px] border border-[#eadfce] bg-white p-4 shadow-sm">
                    <div className="text-base font-semibold text-[#241c15]">{s.title || "Untitled"}</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#6f6255]">{s.content || "No details"}</div>
                    {images.length > 0 ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {images.map((image) => (
                          <a key={image.id} href={image.image_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] transition hover:shadow-md">
                            <img src={image.image_url} alt={image.caption || s.title || "SOP image"} className="h-48 w-full cursor-zoom-in object-cover" />
                            {image.caption ? <div className="px-3 py-2 text-sm text-[#6f6255]">{image.caption}</div> : null}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 text-sm text-[#a39584]">No images attached.</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>
    );
  }


  function renderMaintenanceSection() {
    return (
      <>
        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Maintenance Flags</h2>
              <p className="mt-1 text-sm text-[#7f7263]">
                Admin-only maintenance tracking. Add flags here now, then we can wire cleaner-side reporting in later.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 md:flex-row xl:w-auto xl:items-end">
              <div className="w-full md:w-[280px]">
                <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">
                  Filter by property
                </label>
                <select
                  className="w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  value={selectedJobsPropertyFilter}
                  onChange={(e) => setSelectedJobsPropertyFilter(e.target.value)}
                >
                  <option value="all">All properties</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name || property.address || property.id}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-3 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]"
                onClick={openMaintenanceModal}
              >
                Add Flag
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              {
                label: "Total Flags",
                value: maintenanceFlagCounts.total,
                cardClass: "border-[#eadfce] bg-[#fcfaf7]",
                labelClass: "text-[#8a7b68]",
                valueClass: "text-[#241c15]",
              },
              {
                label: "Open",
                value: maintenanceFlagCounts.open,
                cardClass:
                  maintenanceFlagCounts.open > 0
                    ? "border-[#dc2626] bg-[#fff1f2] shadow-[0_10px_28px_rgba(220,38,38,0.12)]"
                    : "border-[#eadfce] bg-[#fcfaf7]",
                labelClass: maintenanceFlagCounts.open > 0 ? "text-[#991b1b]" : "text-[#8a7b68]",
                valueClass: maintenanceFlagCounts.open > 0 ? "text-[#b91c1c]" : "text-[#241c15]",
              },
              {
                label: "Resolved",
                value: maintenanceFlagCounts.resolved,
                cardClass: "border-[#eadfce] bg-[#fcfaf7]",
                labelClass: "text-[#8a7b68]",
                valueClass: "text-[#241c15]",
              },
              {
                label: "Urgent",
                value: maintenanceFlagCounts.urgent,
                cardClass:
                  maintenanceFlagCounts.urgent > 0
                    ? "animate-pulse border-[#b91c1c] bg-[#dc2626] shadow-[0_16px_34px_rgba(185,28,28,0.28)]"
                    : "border-[#eadfce] bg-[#fcfaf7]",
                labelClass: maintenanceFlagCounts.urgent > 0 ? "text-white/80" : "text-[#8a7b68]",
                valueClass: maintenanceFlagCounts.urgent > 0 ? "text-white" : "text-[#241c15]",
              },
            ].map((item) => (
              <div key={item.label} className={`rounded-[24px] border px-4 py-4 shadow-sm ${item.cardClass}`}>
                <div className={`text-[11px] uppercase tracking-[0.22em] ${item.labelClass}`}>{item.label}</div>
                <div className={`mt-2 text-3xl font-semibold ${item.valueClass}`}>{item.value}</div>
              </div>
            ))}
          </div>

          {filteredMaintenanceFlags.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-5 py-8 text-sm text-[#8a7b68]">
              No maintenance flags found for the current filter.
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[#241c15]">Open Flags</h3>
                    <div className="mt-1 text-sm text-[#7f7263]">
                      {openMaintenanceFlags.length} active flag{openMaintenanceFlags.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                {openMaintenanceFlags.length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-5 py-6 text-sm text-[#8a7b68]">
                    No open maintenance flags.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {openMaintenanceFlags.map((flag) => {
                      const state = String(getMaintenanceFlagState(flag) || "open");
                      const stateLower = state.toLowerCase();
                      const urgency = String(flag.urgency || flag.priority || flag.severity || "normal");
                      const urgencyLower = urgency.toLowerCase();
                      const isResolved =
                        stateLower.includes("resolved") ||
                        stateLower.includes("closed") ||
                        stateLower.includes("done");
                      const isUrgent =
                        urgencyLower.includes("high") ||
                        urgencyLower.includes("urgent") ||
                        urgencyLower.includes("critical");

                      const flaggedByName = profiles.find((profile) => profile.id === flag.flagged_by_profile_id)?.full_name;
                      const resolvedByName = profiles.find((profile) => profile.id === flag.resolved_by_profile_id)?.full_name;
                      const labelKeys = Object.keys(flag).filter(
                        (key) =>
                          ![
                            "id",
                            "property_id",
                            "source",
                            "category",
                            "urgency",
                            "status",
                            "notes",
                            "flagged_by_profile_id",
                            "flagged_at",
                            "resolved_at",
                            "resolved_by_profile_id",
                            "created_at",
                            "updated_at",
                          ].includes(key) && flag[key] !== null && flag[key] !== ""
                      );

                      return (
                        <div
                          key={flag.id}
                          className={`rounded-[24px] border p-4 shadow-sm ${isResolved
                            ? "border-[#d7e7d7] bg-[#f5fbf5]"
                            : isUrgent
                              ? "animate-pulse border-[#b91c1c] bg-[#fff1f2] shadow-[0_16px_34px_rgba(185,28,28,0.16)]"
                              : "border-[#dc2626] bg-[#fff5f5]"
                            }`}
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-base font-semibold text-[#241c15]">
                                  {flag.category || getMaintenanceFlagLabel(flag, labelKeys)}
                                </div>
                                <span
                                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${isResolved
                                    ? "border-[#cfe4cf] bg-white text-[#2f6b2f]"
                                    : isUrgent
                                      ? "border-[#fecaca] bg-white text-[#991b1b]"
                                      : "border-[#fecaca] bg-white text-[#991b1b]"
                                    }`}
                                >
                                  {state}
                                </span>
                                <span
                                  className={`inline-flex rounded-full border bg-white px-2.5 py-0.5 text-[11px] font-medium ${isUrgent ? "border-[#fecaca] text-[#991b1b]" : "border-[#d8c7ab] text-[#7f7263]"
                                    }`}
                                >
                                  {urgency}
                                </span>
                                {flag.source ? (
                                  <span className="inline-flex rounded-full border border-[#d8c7ab] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#7f7263]">
                                    Source: {flag.source}
                                  </span>
                                ) : null}
                              </div>

                              <div className="mt-2 text-sm text-[#6f6255]">
                                {getPropertyName(flag.property_id ?? null)}
                              </div>

                              {flag.notes ? (
                                <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#5f5245]">
                                  {flag.notes}
                                </div>
                              ) : null}

                              {(maintenanceImagesByFlagId[flag.id] ?? []).length > 0 ? (
                                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                  {(maintenanceImagesByFlagId[flag.id] ?? []).map((image) => (
                                    <button
                                      key={image.id}
                                      type="button"
                                      onClick={() => setExpandedImage(image.image_url)}
                                      className="block overflow-hidden rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] text-left transition hover:shadow-md"
                                    >
                                      <img
                                        src={image.image_url}
                                        alt={image.caption || "Maintenance image"}
                                        className="h-40 w-full object-cover"
                                      />
                                      {image.caption ? (
                                        <div className="px-3 py-2 text-sm text-[#6f6255]">{image.caption}</div>
                                      ) : null}
                                    </button>
                                  ))}
                                </div>
                              ) : null}

                              {labelKeys.length > 0 ? (
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {labelKeys.slice(0, 6).map((key) => (
                                    <span
                                      key={key}
                                      className="inline-flex rounded-full border border-[#e2d6c6] bg-white px-3 py-1 text-xs text-[#6f6255]"
                                    >
                                      {key.replace(/_/g, " ")}: {String(flag[key])}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            <div className="flex w-full flex-col gap-3 lg:w-[260px]">
                              <div className="grid gap-2 text-sm text-[#7f7263]">
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Flagged</div>
                                  <div>{formatDateTime(flag.flagged_at || flag.created_at)}</div>
                                </div>

                                {flaggedByName || flag.flagged_by_profile_id ? (
                                  <div>
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Flagged by</div>
                                    <div>{flaggedByName || flag.flagged_by_profile_id}</div>
                                  </div>
                                ) : null}

                                {flag.resolved_at ? (
                                  <div>
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Resolved</div>
                                    <div>{formatDateTime(flag.resolved_at)}</div>
                                  </div>
                                ) : null}

                                {resolvedByName || flag.resolved_by_profile_id ? (
                                  <div>
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Resolved by</div>
                                    <div>{resolvedByName || flag.resolved_by_profile_id}</div>
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                                {!isResolved ? (
                                  <button
                                    className="rounded-[16px] bg-[#241c15] px-4 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60"
                                    onClick={() => void resolveMaintenanceFlag(flag.id)}
                                    disabled={resolvingMaintenanceFlagId === flag.id || deletingMaintenanceFlagId === flag.id}
                                  >
                                    {resolvingMaintenanceFlagId === flag.id ? "Resolving..." : "Mark Resolved"}
                                  </button>
                                ) : null}

                                <button
                                  className="rounded-[16px] border border-[#efc6c6] bg-[#fff5f5] px-4 py-2.5 text-sm font-medium text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:opacity-60"
                                  onClick={() => void deleteMaintenanceFlag(flag.id)}
                                  disabled={deletingMaintenanceFlagId === flag.id || resolvingMaintenanceFlagId === flag.id}
                                >
                                  {deletingMaintenanceFlagId === flag.id ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 text-left text-lg font-semibold text-[#241c15]"
                      onClick={() => setMaintenanceHistoryExpanded((prev) => !prev)}
                    >
                      <span>{maintenanceHistoryExpanded ? "▾" : "▸"}</span>
                      Flag History
                    </button>
                    <div className="mt-1 text-sm text-[#7f7263]">
                      {resolvedMaintenanceFlags.length} resolved flag{resolvedMaintenanceFlags.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      className="rounded-[16px] border border-[#d8c7ab] bg-white px-4 py-2.5 text-sm font-medium text-[#6f6255] transition hover:bg-[#f7f3ee]"
                      onClick={() => setMaintenanceHistoryExpanded((prev) => !prev)}
                    >
                      {maintenanceHistoryExpanded ? "Collapse" : "Expand"}
                    </button>
                    <button
                      type="button"
                      className="rounded-[16px] border border-[#efc6c6] bg-[#fff5f5] px-4 py-2.5 text-sm font-medium text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:opacity-60"
                      onClick={() => void deleteResolvedMaintenanceFlags()}
                      disabled={deletingResolvedMaintenanceFlags || resolvedMaintenanceFlags.length === 0}
                    >
                      {deletingResolvedMaintenanceFlags ? "Deleting..." : "Delete All Resolved"}
                    </button>
                  </div>
                </div>

                {maintenanceHistoryExpanded ? (
                  resolvedMaintenanceFlags.length === 0 ? (
                    <div className="mt-4 rounded-[20px] border border-dashed border-[#d8c7ab] bg-white px-4 py-5 text-sm text-[#8a7b68]">
                      No resolved maintenance flags yet.
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {resolvedMaintenanceFlags.map((flag) => {
                        const state = String(getMaintenanceFlagState(flag) || "resolved");
                        const urgency = String(flag.urgency || flag.priority || flag.severity || "normal");
                        const flaggedByName = profiles.find((profile) => profile.id === flag.flagged_by_profile_id)?.full_name;
                        const resolvedByName = profiles.find((profile) => profile.id === flag.resolved_by_profile_id)?.full_name;
                        const labelKeys = Object.keys(flag).filter(
                          (key) =>
                            ![
                              "id",
                              "property_id",
                              "source",
                              "category",
                              "urgency",
                              "status",
                              "notes",
                              "flagged_by_profile_id",
                              "flagged_at",
                              "resolved_at",
                              "resolved_by_profile_id",
                              "created_at",
                              "updated_at",
                            ].includes(key) && flag[key] !== null && flag[key] !== ""
                        );

                        return (
                          <div key={flag.id} className="rounded-[24px] border border-[#d7e7d7] bg-[#f5fbf5] p-4 shadow-sm">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-base font-semibold text-[#241c15]">
                                    {flag.category || getMaintenanceFlagLabel(flag, labelKeys)}
                                  </div>
                                  <span className="inline-flex rounded-full border border-[#cfe4cf] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#2f6b2f]">
                                    {state}
                                  </span>
                                  <span className="inline-flex rounded-full border border-[#d8c7ab] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#7f7263]">
                                    {urgency}
                                  </span>
                                </div>
                                <div className="mt-2 text-sm text-[#6f6255]">{getPropertyName(flag.property_id ?? null)}</div>
                                {flag.notes ? <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#5f5245]">{flag.notes}</div> : null}
                                {labelKeys.length > 0 ? (
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    {labelKeys.slice(0, 6).map((key) => (
                                      <span key={key} className="inline-flex rounded-full border border-[#e2d6c6] bg-white px-3 py-1 text-xs text-[#6f6255]">
                                        {key.replace(/_/g, " ")}: {String(flag[key])}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex w-full flex-col gap-3 lg:w-[260px]">
                                <div className="grid gap-2 text-sm text-[#7f7263]">
                                  <div>
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Flagged</div>
                                    <div>{formatDateTime(flag.flagged_at || flag.created_at)}</div>
                                  </div>
                                  {flaggedByName || flag.flagged_by_profile_id ? (
                                    <div>
                                      <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Flagged by</div>
                                      <div>{flaggedByName || flag.flagged_by_profile_id}</div>
                                    </div>
                                  ) : null}
                                  {flag.resolved_at ? (
                                    <div>
                                      <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Resolved</div>
                                      <div>{formatDateTime(flag.resolved_at)}</div>
                                    </div>
                                  ) : null}
                                  {resolvedByName || flag.resolved_by_profile_id ? (
                                    <div>
                                      <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Resolved by</div>
                                      <div>{resolvedByName || flag.resolved_by_profile_id}</div>
                                    </div>
                                  ) : null}
                                </div>

                                <button
                                  className="rounded-[16px] border border-[#efc6c6] bg-[#fff5f5] px-4 py-2.5 text-sm font-medium text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:opacity-60"
                                  onClick={() => void deleteMaintenanceFlag(flag.id)}
                                  disabled={deletingMaintenanceFlagId === flag.id || deletingResolvedMaintenanceFlags}
                                >
                                  {deletingMaintenanceFlagId === flag.id ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : null}
              </div>
            </div>
          )}
        </section>

        {maintenanceModalOpen ? (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4 py-6">
            <div className="w-full max-w-2xl rounded-[32px] border border-[#d8c7ab] bg-[#f8f3eb] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-semibold tracking-tight text-[#241c15]">Create Maintenance Flag</div>
                  <p className="mt-1 text-sm text-[#7f7263]">
                    Add an internal maintenance issue now. This stays admin-only for the moment.
                  </p>
                </div>
                <button
                  className="rounded-full border border-[#d8c7ab] bg-white px-3 py-1.5 text-sm text-[#6f6255] transition hover:bg-[#f7f3ee]"
                  onClick={closeMaintenanceModal}
                  disabled={creatingMaintenanceFlag}
                >
                  Close
                </button>
              </div>

              {maintenanceFormError ? (
                <div className="mt-5 rounded-[18px] border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#991b1b]">
                  {maintenanceFormError}
                </div>
              ) : null}

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Property</label>
                  <select
                    className={`w-full rounded-[20px] border bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e] ${maintenanceFormError && !maintenanceFormPropertyId ? "border-[#dc2626] bg-[#fff5f5]" : "border-[#d9ccbb]"
                      }`}
                    value={maintenanceFormPropertyId}
                    onChange={(e) => setMaintenanceFormPropertyId(e.target.value)}
                  >
                    <option value="">Select property</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name || property.address || property.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Category</label>
                  <select
                    className={`w-full rounded-[20px] border bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e] ${maintenanceFormError && !maintenanceFormCategory ? "border-[#dc2626] bg-[#fff5f5]" : "border-[#d9ccbb]"
                      }`}
                    value={maintenanceFormCategory}
                    onChange={(e) => setMaintenanceFormCategory(e.target.value)}
                  >
                    <option value="">Select category</option>
                    {MAINTENANCE_CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Urgency</label>
                  <select
                    className="w-full rounded-[20px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                    value={maintenanceFormUrgency}
                    onChange={(e) => setMaintenanceFormUrgency(e.target.value)}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Notes</label>
                  <textarea
                    className={`min-h-[160px] w-full rounded-[20px] border bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e] ${maintenanceFormError && !maintenanceFormNotes.trim() ? "border-[#dc2626] bg-[#fff5f5]" : "border-[#d9ccbb]"
                      }`}
                    placeholder="Describe the issue clearly so it can be acted on later."
                    value={maintenanceFormNotes}
                    onChange={(e) => setMaintenanceFormNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  className="rounded-full border border-[#d8c7ab] bg-white px-5 py-2.5 text-sm font-medium text-[#6f6255] transition hover:bg-[#f7f3ee]"
                  onClick={closeMaintenanceModal}
                  disabled={creatingMaintenanceFlag}
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60"
                  onClick={() => void createMaintenanceFlag()}
                  disabled={creatingMaintenanceFlag}
                >
                  {creatingMaintenanceFlag ? "Creating..." : "Create Flag"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  function renderActiveSection() {
    switch (activeSection) {
      case "users":
        return renderUsersSection();
      case "properties":
        return (
          <div className="space-y-6">
            {renderAddPropertySection()}
            {renderPropertySetupSection()}
            {renderPropertiesSection()}
          </div>
        );
      case "cleanerAccounts":
        return renderCleanerAccountsSection();
      case "groundsAccounts":
        return renderGroundsAccountsSection();
      case "assignments":
        return renderAssignmentsSection();
      case "jobs":
        return renderJobsSection();
      case "maintenance":
        return renderMaintenanceSection();
      default:
        return renderUsersSection();
    }
  }

  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-[#f7f3ee] text-[#241c15]">
        <div className="mx-auto max-w-7xl p-6">
          <div className="rounded-[32px] border border-[#e7ddd0] bg-white p-8 shadow-[0_20px_50px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-4">
              <div className="w-[180px]">
                <Image
                  src="/guleraoslogo.png"
                  alt="GuleraOS"
                  width={400}
                  height={120}
                  className="h-auto w-full"
                  priority
                />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-[#8a7b68]">GULERAOS</div>
                <div className="mt-1 text-2xl font-semibold">Checking admin access...</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f3ee] text-[#241c15]">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-6 overflow-hidden rounded-[34px] border border-[#e7ddd0] bg-white shadow-[0_30px_70px_rgba(0,0,0,0.08)]">
          <div className="bg-[linear-gradient(135deg,#1f1812_0%,#2a2119_55%,#3a2c1d_100%)] px-6 py-8 text-white md:px-8 md:py-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="flex items-start gap-4">
                <div className="w-[220px] shrink-0 rounded-[20px] border border-white/10 bg-white/5 p-3 backdrop-blur">
                  <Image
                    src="/guleraoslogo.png"
                    alt="GuleraOS"
                    width={500}
                    height={160}
                    className="h-auto w-full"
                    priority
                  />
                </div>
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.32em] text-[#d8c7ab]">GULERAOS</div>
                  <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Property operations, elevated.</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#e7dccb] md:text-base">
                    Staffing, scheduling, maintenance, and access — all in one place.
                  </p>
                </div>
              </div>

              <button
                className="inline-flex items-center justify-center rounded-full border border-[#d6b36a]/40 bg-white/10 px-5 py-2.5 text-sm font-medium text-[#f6efe4] shadow-sm transition hover:bg-white/20"
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = "/login";
                }}
              >
                Logout
              </button>
            </div>
          </div>

          <div className="grid gap-3 border-t border-[#efe6dc] bg-[#fbf8f4] px-6 py-4 md:grid-cols-7 md:px-8">
            {[
              { label: "Properties", value: properties.length },
              { label: "Cleaner Accounts", value: cleanerAccounts.length },
              { label: "Grounds Accounts", value: groundsAccounts.length },
              { label: "Assignments", value: assignments.length + groundsAssignments.length },
              { label: "Jobs", value: jobs.length + groundsJobs.length },
              { label: "Users", value: profiles.length },
              { label: "Flags", value: maintenanceFlags.length },
            ].map((item) => (
              <div key={item.label} className="rounded-[24px] border border-[#eadfce] bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#8a7b68]">{item.label}</div>
                <div className="mt-2 text-3xl font-semibold text-[#241c15]">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-[24px] border border-[#e7c6c1] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2e22] shadow-sm">
            {error}
          </div>
        ) : null}

        {actionMessage ? (
          <div className="mb-6 rounded-[24px] border border-[#cfe4cf] bg-[#f4fbf4] px-4 py-3 text-sm text-[#2f6b2f] shadow-sm">
            {actionMessage}
          </div>
        ) : null}

        {operationsAlerts.length > 0 ? (
          <div className="sticky top-3 z-40 mb-6 rounded-[30px] border border-[#e7ddd0] bg-[rgba(255,255,255,0.94)] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-[#241c15]">Operations Alerts</div>
                <div className="mt-1 text-sm text-[#7f7263]">
                  Important items across jobs and maintenance.
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {operationsAlerts.map((alert) => (
                  <button
                    key={alert.key}
                    onClick={alert.onClick}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${alert.key === "maintenance-urgent"
                      ? "animate-pulse border-[#b91c1c] bg-[#dc2626] text-white shadow-[0_8px_22px_rgba(185,28,28,0.28)] hover:bg-[#b91c1c]"
                      : alert.tone === "red"
                        ? "border-[#fecaca] bg-[#fff1f2] text-[#991b1b] hover:bg-[#ffe4e6]"
                        : "border-[#ecd7a8] bg-[#fff8e8] text-[#8a6112] hover:bg-[#fff2cf]"
                      }`}
                  >
                    <span>{alert.label}</span>
                    <span className="rounded-full border border-current/20 px-2 py-0.5 text-[11px]">
                      View
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mb-6 rounded-[30px] border border-[#e7ddd0] bg-white p-3 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap gap-2">
            {menuItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeSection === item.key
                  ? "bg-[#241c15] text-[#f8f2e8]"
                  : "border border-[#d8c7ab] bg-[#fcfaf7] text-[#6f6255] hover:bg-white"
                  }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {renderActiveSection()}
      </div>

      {expandedImage ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setExpandedImage(null)}
        >
          <img
            src={expandedImage}
            alt="Expanded maintenance image"
            className="max-h-[92vh] max-w-[96vw] rounded-[20px] shadow-2xl"
          />
        </div>
      ) : null}
    </main>
  );
}