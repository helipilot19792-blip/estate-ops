"use client";

import Image from "next/image";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { trackFeatureUsage } from "@/lib/feature-usage";
import OnboardingChecklist, { type OnboardingStep } from "@/components/onboarding-checklist";

function getCityFromAddress(address?: string | null) {
  if (!address) return "";

  const parts = address.split(",");

  if (parts.length >= 2) {
    return parts[1].trim();
  }

  return address;
}

function getBookingSourceLabel(source?: string | null) {
  const normalized = String(source || "").trim().toLowerCase();
  if (!normalized) return "Calendar";
  if (normalized === "airbnb") return "Airbnb";
  if (normalized === "vrbo") return "VRBO";
  if (normalized === "booking" || normalized === "booking.com") return "Booking.com";
  return normalized.toUpperCase();
}

type Property = {
  id: string;
  name: string | null;
  address: string | null;
  notes?: string | null;
  cover_photo_url?: string | null;
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

type PropertyBookingEvent = {
  id: string;
  property_id: string;
  property_calendar_id?: string | null;
  source: string | null;
  external_uid?: string | null;
  summary: string | null;
  guest_count?: number | null;
  checkin_date: string;
  checkout_date: string;
  created_at?: string | null;
  updated_at?: string | null;
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
  offer_email_sent_at?: string | null;
  offer_reminder_sent_at?: string | null;
  day_of_reminder_sent_at?: string | null;
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
  offer_email_sent_at?: string | null;
  offer_reminder_sent_at?: string | null;
  day_of_reminder_sent_at?: string | null;
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

type DocumentVaultRow = {
  id: string;
  organization_id: string;
  property_id: string | null;
  title: string;
  category: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string;
  created_by_profile_id: string | null;
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

type OwnerAccountRow = {
  id: string;
  organization_id?: string | null;
  email: string;
  full_name: string | null;
  profile_id?: string | null;
  invite_sent_at?: string | null;
  invite_accepted_at?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type OwnerPropertyAccessRow = {
  id: string;
  owner_account_id: string;
  property_id: string;
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
  | "home"
  | "notifications"
  | "users"
  | "properties"
  | "cleanerAccounts"
  | "groundsAccounts"
  | "assignments"
  | "jobs"
  | "calendar"
  | "maintenance"
  | "invites"
  | "chat"
  | "documents"
  | "backup"
  | "invoices";
type PropertyEntryMode = "manual" | "airbnb";
type PropertyWorkflowTab = "add" | "setup" | "directory" | "health";
type PropertySetupTab = "overview" | "access" | "calendars" | "sops";
type JobWorkflowTab = "cleaning" | "grounds" | "active" | "reliability" | "notifications" | "exceptions";
type InvoiceWorkflowTab = "create" | "running" | "existing" | "defaults" | "history";
type AdminMenuOrientation = "side" | "top";
const ADMIN_FEATURE_LABELS: Record<AdminSection, string> = {
  home: "Admin Home",
  notifications: "Notification Center",
  users: "Users",
  properties: "Properties",
  cleanerAccounts: "Cleaner Accounts",
  groundsAccounts: "Grounds Accounts",
  assignments: "Assignments",
  jobs: "Jobs",
  calendar: "Calendar",
  maintenance: "Maintenance Flags",
  invites: "Invites",
  chat: "Chat",
  documents: "Document Vault",
  backup: "Backup Center",
  invoices: "Invoices",
};
type MyOrganizationRow = {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  role: string;
  record_count?: number;
};

const ADMIN_SELECTED_ORGANIZATION_KEY = "admin-current-organization-id-v2";

type OrganizationBillingRow = {
  id: string;
  name: string | null;
  subscription_status?: string | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  billing_enabled?: boolean | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
};
type OrganizationInviteRow = {
  id: string;
  organization_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: "cleaner" | "grounds" | "owner";
  status: string | null;
  token: string;
  sent_at?: string | null;
  accepted_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
};
type ChatConversationRow = {
  id: string;
  organization_id: string;
  subject: string | null;
  context_type: string;
  context_id?: string | null;
  created_by_profile_id?: string | null;
  last_message_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};
type ChatParticipantRow = {
  id: string;
  organization_id: string;
  conversation_id: string;
  participant_type: "profile" | "owner";
  participant_profile_id?: string | null;
  participant_owner_account_id?: string | null;
  participant_role?: string | null;
  display_name?: string | null;
  email?: string | null;
  last_read_at?: string | null;
  created_at?: string | null;
};
type ChatMessageRow = {
  id: string;
  organization_id: string;
  conversation_id: string;
  sender_profile_id: string | null;
  body: string;
  created_at?: string | null;
  updated_at?: string | null;
};
type ChatHiddenItemRow = {
  id: string;
  organization_id: string;
  conversation_id: string;
  message_id?: string | null;
  hidden_by_profile_id?: string | null;
  hidden_by_owner_account_id?: string | null;
  hidden_at?: string | null;
};
type InvoiceSettingsRow = {
  organization_id: string;
  company_name: string | null;
  logo_url: string | null;
  from_email: string | null;
  reply_to_email: string | null;
  header_text: string | null;
  default_turnover_rate: number | null;
  default_grounds_rate: number | null;
  tax_lines?: OwnerInvoiceTaxLine[] | null;
  auto_add_turnover: boolean | null;
  auto_add_grounds: boolean | null;
  payment_instructions: string | null;
};
type OwnerInvoiceTaxLine = {
  id: string;
  label: string;
  rate: number | string;
  enabled?: boolean;
};
type PropertyInvoiceRateRow = {
  id?: string;
  organization_id: string;
  property_id: string;
  turnover_rate: number | null;
  grounds_rate: number | null;
  bill_turnover_to_owner?: boolean | null;
  bill_grounds_to_owner?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};
type OwnerInvoiceLineItem = {
  id: string;
  description: string;
  category: "turnover" | "grounds" | "expense" | "other";
  quantity: number | string;
  rate: number | string;
  source_id?: string | null;
  receipt_urls?: string[];
  receipt_names?: string[];
};
type OwnerInvoiceRow = {
  id: string;
  organization_id: string;
  owner_account_id: string;
  property_id: string | null;
  invoice_number: string;
  status: "draft" | "sent" | "paid" | "void";
  issue_date: string;
  due_date: string | null;
  company_name: string | null;
  logo_url: string | null;
  from_email?: string | null;
  reply_to_email?: string | null;
  header_text: string | null;
  notes: string | null;
  payment_instructions: string | null;
  tax_lines?: OwnerInvoiceTaxLine[] | null;
  line_items: OwnerInvoiceLineItem[];
  invoice_source?: "generated" | "uploaded" | null;
  uploaded_invoice_url?: string | null;
  uploaded_invoice_name?: string | null;
  uploaded_invoice_content_type?: string | null;
  subtotal: number;
  tax_total: number;
  total: number;
  sent_at?: string | null;
  created_at?: string | null;
};
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

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function normalizeTaxLines(lines: OwnerInvoiceTaxLine[] | null | undefined) {
  const normalized = (Array.isArray(lines) ? lines : [])
    .map((line, index) => ({
      id: line.id || `tax-${index + 1}`,
      label: String(line.label || "").trim(),
      rate: String(line.rate ?? ""),
      enabled: line.enabled !== false,
    }))
    .filter((line) => line.label || Number(line.rate || 0) > 0);

  if (normalized.length > 0) return normalized;

  return [
    {
      id: "tax-1",
      label: "Tax",
      rate: "0",
      enabled: true,
    },
  ];
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  return fallback;
}

function getTodayYmd() {
  return toYmd(new Date());
}

function getDefaultDueDateYmd() {
  const due = new Date();
  due.setDate(due.getDate() + 14);
  return toYmd(due);
}

function getTrialDaysRemaining(trialEndsAt?: string | null, now = new Date()) {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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

const PROPERTY_CALENDAR_SOURCE_OPTIONS = [
  { value: "airbnb", label: "Airbnb" },
  { value: "vrbo", label: "VRBO" },
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

function buildPropertyAddress(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(", ");
}

function parseAddressLine(addressLine: string) {
  const parts = addressLine
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { street: "", city: "", province: "", postal: "" };
  }

  const street = parts[0] || "";
  const city = parts[1] || "";
  const regionPostal = parts.slice(2).join(" ").trim();
  const tokens = regionPostal.split(/\s+/).filter(Boolean);

  if (tokens.length <= 1) {
    return {
      street,
      city,
      province: regionPostal,
      postal: "",
    };
  }

  return {
    street,
    city,
    province: tokens[0] || "",
    postal: tokens.slice(1).join(" "),
  };
}

function normalizeIcalUrl(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase().startsWith("webcal://")) {
    return `https://${trimmed.slice("webcal://".length)}`;
  }
  return trimmed;
}

function createInviteToken() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function loadPlatformAdminOrganizations(accessToken: string): Promise<MyOrganizationRow[]> {
  const response = await fetch("/api/platform/organizations", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || "Could not load platform organizations.");
  }

  return ((payload?.organizations || []) as Array<{
    id: string;
    name: string | null;
    slug: string | null;
    property_count?: number;
    cleaning_job_count?: number;
    grounds_job_count?: number;
  }>).map((organization) => ({
    organization_id: organization.id,
    organization_name: organization.name || organization.slug || "Organization",
    organization_slug: organization.slug || "",
    role: "platform_admin",
    record_count:
      (organization.property_count || 0) +
      (organization.cleaning_job_count || 0) +
      (organization.grounds_job_count || 0),
  }));
}

export default function AdminPage() {
  const router = useRouter();


  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentPortalRole, setCurrentPortalRole] = useState<string | null>(null);
  const [currentAdminUserId, setCurrentAdminUserId] = useState<string | null>(null);
  const [currentAdminProfile, setCurrentAdminProfile] = useState<ProfileRow | null>(null);
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null);
  const [currentOrganizationBilling, setCurrentOrganizationBilling] = useState<OrganizationBillingRow | null>(null);
  const [myOrganizations, setMyOrganizations] = useState<MyOrganizationRow[]>([]);
  const [adminDataLoaded, setAdminDataLoaded] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [adminCalendarMonth, setAdminCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [adminSelectedDate, setAdminSelectedDate] = useState<string | null>(() => toYmd(new Date()));
  const [activeSection, setActiveSection] = useState<AdminSection>("home");

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
  const [documentVaultRows, setDocumentVaultRows] = useState<DocumentVaultRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [ownerAccounts, setOwnerAccounts] = useState<OwnerAccountRow[]>([]);
  const [ownerPropertyAccess, setOwnerPropertyAccess] = useState<OwnerPropertyAccessRow[]>([]);
  const [propertyCalendars, setPropertyCalendars] = useState<PropertyCalendarRow[]>([]);
  const [propertyBookingEvents, setPropertyBookingEvents] = useState<PropertyBookingEvent[]>([]);
  const [maintenanceFlags, setMaintenanceFlags] = useState<MaintenanceFlagRow[]>([]);
  const [maintenanceFlagImages, setMaintenanceFlagImages] = useState<MaintenanceFlagImageRow[]>([]);
  const [organizationInvites, setOrganizationInvites] = useState<OrganizationInviteRow[]>([]);
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettingsRow | null>(null);
  const [propertyInvoiceRates, setPropertyInvoiceRates] = useState<PropertyInvoiceRateRow[]>([]);
  const [ownerInvoices, setOwnerInvoices] = useState<OwnerInvoiceRow[]>([]);
  const [chatConversations, setChatConversations] = useState<ChatConversationRow[]>([]);
  const [chatParticipants, setChatParticipants] = useState<ChatParticipantRow[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessageRow[]>([]);
  const [chatHiddenItems, setChatHiddenItems] = useState<ChatHiddenItemRow[]>([]);
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
  const [sendingOwnerInviteId, setSendingOwnerInviteId] = useState<string | null>(null);
  const [deletingOrganizationInviteId, setDeletingOrganizationInviteId] = useState<string | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resettingOrganization, setResettingOrganization] = useState(false);
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
  const [savingInvoiceSettings, setSavingInvoiceSettings] = useState(false);
  const [savingPropertyRateId, setSavingPropertyRateId] = useState<string | null>(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [previewingInvoicePdf, setPreviewingInvoicePdf] = useState(false);
  const [uploadingInvoiceLogo, setUploadingInvoiceLogo] = useState(false);
  const [uploadingReceiptLineItemId, setUploadingReceiptLineItemId] = useState<string | null>(null);
  const [uploadingExternalInvoice, setUploadingExternalInvoice] = useState(false);
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null);
  const [updatingInvoiceStatusId, setUpdatingInvoiceStatusId] = useState<string | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [creatingChatConversation, setCreatingChatConversation] = useState(false);
  const [sendingChatMessage, setSendingChatMessage] = useState(false);
  const [selectedChatConversationId, setSelectedChatConversationId] = useState("");
  const [chatRecipientTarget, setChatRecipientTarget] = useState("");
  const [chatSubject, setChatSubject] = useState("");
  const [chatMessageBody, setChatMessageBody] = useState("");
  const [chatReplyBody, setChatReplyBody] = useState("");
  const [chatRealtimeReady, setChatRealtimeReady] = useState(false);
  const chatThreadScrollRef = useRef<HTMLDivElement | null>(null);
  const [invoiceOwnerId, setInvoiceOwnerId] = useState("");
  const [invoicePropertyId, setInvoicePropertyId] = useState("");
  const [invoiceIssueDate, setInvoiceIssueDate] = useState(() => getTodayYmd());
  const [invoiceDueDate, setInvoiceDueDate] = useState(() => getDefaultDueDateYmd());
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [invoiceCompanyName, setInvoiceCompanyName] = useState("");
  const [invoiceLogoUrl, setInvoiceLogoUrl] = useState("");
  const [invoiceFromEmail, setInvoiceFromEmail] = useState("");
  const [invoiceReplyToEmail, setInvoiceReplyToEmail] = useState("");
  const [invoiceHeaderText, setInvoiceHeaderText] = useState("");
  const [invoicePaymentInstructions, setInvoicePaymentInstructions] = useState("");
  const [editingOwnerInvoiceId, setEditingOwnerInvoiceId] = useState<string | null>(null);
  const [invoiceWorkflowTab, setInvoiceWorkflowTab] = useState<InvoiceWorkflowTab>("create");
  const [externalInvoiceUrl, setExternalInvoiceUrl] = useState("");
  const [externalInvoiceName, setExternalInvoiceName] = useState("");
  const [externalInvoiceContentType, setExternalInvoiceContentType] = useState("");
  const [externalInvoiceNumber, setExternalInvoiceNumber] = useState("");
  const [externalInvoiceAmount, setExternalInvoiceAmount] = useState("");
  const [invoiceTaxLines, setInvoiceTaxLines] = useState<OwnerInvoiceTaxLine[]>([
    { id: "tax-1", label: "Tax", rate: "0", enabled: true },
  ]);
  const [invoiceCcEmails, setInvoiceCcEmails] = useState("");
  const [propertyInvoiceRateDrafts, setPropertyInvoiceRateDrafts] = useState<Record<string, { turnover: string; grounds: string; billTurnover: boolean; billGrounds: boolean }>>({});
  const [invoiceSettingsDirty, setInvoiceSettingsDirty] = useState(false);
  const [invoiceDraftDirty, setInvoiceDraftDirty] = useState(false);
  const [invoiceHistoryOpenSections, setInvoiceHistoryOpenSections] = useState({
    drafts: true,
    active: true,
    paid: false,
  });
  const [dirtyPropertyInvoiceRateIds, setDirtyPropertyInvoiceRateIds] = useState<Set<string>>(() => new Set());
  const [invoiceAutoTurnover, setInvoiceAutoTurnover] = useState(true);
  const [invoiceAutoGrounds, setInvoiceAutoGrounds] = useState(true);
  const [invoiceLineItems, setInvoiceLineItems] = useState<OwnerInvoiceLineItem[]>([
    { id: "custom-1", description: "", category: "expense", quantity: 1, rate: 0 },
  ]);

  const [propertyName, setPropertyName] = useState("");
  const [propertyEntryMode, setPropertyEntryMode] = useState<PropertyEntryMode>("manual");
  const [propertyStreet, setPropertyStreet] = useState("");
  const [propertyCity, setPropertyCity] = useState("");
  const [propertyProvince, setPropertyProvince] = useState("");
  const [propertyPostal, setPropertyPostal] = useState("");
  const [propertyNotes, setPropertyNotes] = useState("");
  const [propertyOwnerName, setPropertyOwnerName] = useState("");
  const [propertyOwnerEmail, setPropertyOwnerEmail] = useState("");
  const [selectedPropertyOwnerName, setSelectedPropertyOwnerName] = useState("");
  const [selectedPropertyOwnerEmail, setSelectedPropertyOwnerEmail] = useState("");
  const [savingSelectedPropertyOwner, setSavingSelectedPropertyOwner] = useState(false);
  const [selectedPropertyOwnerDirty, setSelectedPropertyOwnerDirty] = useState(false);
  const [ownerLinkTargetPropertyId, setOwnerLinkTargetPropertyId] = useState("");
  const [linkingOwnerProperty, setLinkingOwnerProperty] = useState(false);
  const [uploadingPropertyCover, setUploadingPropertyCover] = useState(false);
  const [propertyCoverMessage, setPropertyCoverMessage] = useState("");
  const [propertyCoverError, setPropertyCoverError] = useState("");
  const [propertyUnitsNeeded, setPropertyUnitsNeeded] = useState("1");
  const [propertyUnitsStrict, setPropertyUnitsStrict] = useState(false);
  const [propertyShowTeamStatus, setPropertyShowTeamStatus] = useState(true);
  const [importingAirbnbProperty, setImportingAirbnbProperty] = useState(false);
  const [airbnbImportName, setAirbnbImportName] = useState("");
  const [airbnbImportAddress, setAirbnbImportAddress] = useState("");
  const [airbnbImportStreet, setAirbnbImportStreet] = useState("");
  const [airbnbImportCity, setAirbnbImportCity] = useState("");
  const [airbnbImportProvince, setAirbnbImportProvince] = useState("");
  const [airbnbImportPostal, setAirbnbImportPostal] = useState("");
  const [airbnbImportCalendarUrl, setAirbnbImportCalendarUrl] = useState("");
  const [airbnbImportCoverPhotoUrl, setAirbnbImportCoverPhotoUrl] = useState("");
  const [airbnbImportListingUrl, setAirbnbImportListingUrl] = useState("");
  const [airbnbImportOwnerName, setAirbnbImportOwnerName] = useState("");
  const [airbnbImportOwnerEmail, setAirbnbImportOwnerEmail] = useState("");
  const [airbnbImportNotes, setAirbnbImportNotes] = useState("");
  const [inviteCleanerName, setInviteCleanerName] = useState("");
  const [inviteCleanerEmail, setInviteCleanerEmail] = useState("");
  const [inviteCleanerPhone, setInviteCleanerPhone] = useState("");
  const [inviteGroundsName, setInviteGroundsName] = useState("");
  const [inviteGroundsEmail, setInviteGroundsEmail] = useState("");
  const [inviteGroundsPhone, setInviteGroundsPhone] = useState("");

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
  const [jobMode, setJobMode] = useState<"single" | "recurring">("single");
  const [recurringType, setRecurringType] = useState("weekly");
  const [jobWorkflowTab, setJobWorkflowTab] = useState<JobWorkflowTab>("active");
  const [retryingNotificationSlotId, setRetryingNotificationSlotId] = useState<string | null>(null);
  const [retryingNotificationBatch, setRetryingNotificationBatch] = useState(false);

  const [jobPropertyId, setJobPropertyId] = useState("");
  const [jobScheduledFor, setJobScheduledFor] = useState("");
  const [showSupport, setShowSupport] = useState(false);
  const [showAdminNav, setShowAdminNav] = useState(false);
  const [adminMenuOrientation, setAdminMenuOrientation] = useState<AdminMenuOrientation>("side");
  const [adminMenuOrder, setAdminMenuOrder] = useState<AdminSection[]>([]);
  const [showMobileWorkspaceStats, setShowMobileWorkspaceStats] = useState(false);
  const [draggingAdminMenuKey, setDraggingAdminMenuKey] = useState<AdminSection | null>(null);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [sendingSupport, setSendingSupport] = useState(false);


  const [jobNotes, setJobNotes] = useState("");
  const [jobOverrideUnitsEnabled, setJobOverrideUnitsEnabled] = useState(false);
  const [jobUnitsNeeded, setJobUnitsNeeded] = useState("1");
  const [jobUnitsStrict, setJobUnitsStrict] = useState(false);
  const [jobShowTeamStatus, setJobShowTeamStatus] = useState(true);

  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [propertyWorkflowTab, setPropertyWorkflowTab] = useState<PropertyWorkflowTab>("directory");
  const [propertySetupTab, setPropertySetupTab] = useState<PropertySetupTab>("overview");
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
  const [importingBookingHistory, setImportingBookingHistory] = useState(false);
  const [sopTitle, setSopTitle] = useState("");
  const [sopContent, setSopContent] = useState("");
  const [sopFiles, setSopFiles] = useState<File[]>([]);
  const [documentVaultPropertyId, setDocumentVaultPropertyId] = useState("all");
  const [documentVaultCategory, setDocumentVaultCategory] = useState("General");
  const [documentVaultTitle, setDocumentVaultTitle] = useState("");
  const [documentVaultFiles, setDocumentVaultFiles] = useState<File[]>([]);
  const [uploadingDocumentVaultFiles, setUploadingDocumentVaultFiles] = useState(false);
  const [openingDocumentVaultId, setOpeningDocumentVaultId] = useState<string | null>(null);
  const [deletingDocumentVaultId, setDeletingDocumentVaultId] = useState<string | null>(null);


  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});
  const [groundsLinkSelections, setGroundsLinkSelections] = useState<Record<string, string>>({});

  const todayYmd = toYmd(now);
  const todaysCleaningJobs = useMemo(() => {
    return jobs
      .filter((job) => (job.scheduled_for || extractCheckoutDate(job.notes)) === todayYmd)
      .sort((a, b) => {
        const aDate = a.scheduled_for || extractCheckoutDate(a.notes) || "";
        const bDate = b.scheduled_for || extractCheckoutDate(b.notes) || "";
        return aDate.localeCompare(bDate);
      });
  }, [jobs, todayYmd]);

  const todaysGroundsJobs = useMemo(() => {
    return groundsJobs
      .filter((job) => job.scheduled_for === todayYmd)
      .sort((a, b) => {
        const aDate = a.scheduled_for || "";
        const bDate = b.scheduled_for || "";
        return aDate.localeCompare(bDate);
      });
  }, [groundsJobs, todayYmd]);
  const tomorrowYmd = useMemo(() => {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return toYmd(tomorrow);
  }, [now]);

  const tomorrowsCleaningJobs = useMemo(() => {
    return jobs.filter(
      (job) => (job.scheduled_for || extractCheckoutDate(job.notes)) === tomorrowYmd
    );
  }, [jobs, tomorrowYmd]);

  const tomorrowsGroundsJobs = useMemo(() => {
    return groundsJobs.filter(
      (job) => job.scheduled_for === tomorrowYmd
    );
  }, [groundsJobs, tomorrowYmd]);
  const pendingCleanerInvites = useMemo(() => {
    return organizationInvites.filter((invite) => invite.role === "cleaner");
  }, [organizationInvites]);

  const duplicateCleanerInviteEmails = useMemo(() => {
    const counts = new Map<string, number>();

    for (const invite of pendingCleanerInvites) {
      const email = invite.email.trim().toLowerCase();
      counts.set(email, (counts.get(email) ?? 0) + 1);
    }

    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([email]) => email)
    );
  }, [pendingCleanerInvites]);

  const pendingGroundsInvites = useMemo(() => {
    return organizationInvites.filter((invite) => invite.role === "grounds");
  }, [organizationInvites]);

  const duplicateGroundsInviteEmails = useMemo(() => {
    const counts = new Map<string, number>();

    for (const invite of pendingGroundsInvites) {
      const email = invite.email.trim().toLowerCase();
      counts.set(email, (counts.get(email) ?? 0) + 1);
    }

    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([email]) => email)
    );
  }, [pendingGroundsInvites]);

  const openMaintenanceFlagsCount = useMemo(() => {
    return maintenanceFlags.filter((flag) => {
      const status = (flag.status || "").toLowerCase();
      return status !== "resolved" && status !== "closed";
    }).length;
  }, [maintenanceFlags]);

  const currentTrialStatus = (currentOrganizationBilling?.subscription_status || "trialing").toLowerCase();
  const currentOrganizationLabel =
    currentOrganizationBilling?.name ||
    myOrganizations.find((organization) => organization.organization_id === currentOrganizationId)?.organization_name ||
    myOrganizations.find((organization) => organization.organization_id === currentOrganizationId)?.organization_slug ||
    "Current company";
  const trialDaysRemaining = getTrialDaysRemaining(currentOrganizationBilling?.trial_ends_at, now);
  const trialExpired = currentTrialStatus === "trialing" && trialDaysRemaining !== null && trialDaysRemaining < 0;
  const trialEndingSoon =
    currentTrialStatus === "trialing" &&
    trialDaysRemaining !== null &&
    trialDaysRemaining >= 0 &&
    trialDaysRemaining <= 7;
  const propertyInvoiceRatesDirty = dirtyPropertyInvoiceRateIds.size > 0;
  const adminDraftDirty =
    selectedPropertyOwnerDirty ||
    accessDirty ||
    calendarDraftDirty ||
    propertyDefaultsDirty ||
    invoiceSettingsDirty ||
    invoiceDraftDirty ||
    propertyInvoiceRatesDirty;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedOrientation = window.localStorage.getItem("admin-menu-orientation");
    if (savedOrientation === "side" || savedOrientation === "top") {
      setAdminMenuOrientation(savedOrientation);
    }

    const savedOrder = window.localStorage.getItem("admin-menu-order");
    if (savedOrder) {
      try {
        const parsed = JSON.parse(savedOrder);
        if (Array.isArray(parsed)) {
          setAdminMenuOrder(parsed.filter((value): value is AdminSection => typeof value === "string"));
        }
      } catch {
        window.localStorage.removeItem("admin-menu-order");
      }
    }
  }, []);

  useEffect(() => {
    async function checkAuthAndRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("No signed-in user was found on the admin page.");
        setCheckingAuth(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id,email,full_name,phone,role")
        .eq("id", user.id)
        .single<ProfileRow>();

      if (profileError) {
        setError(`Profile lookup failed: ${profileError.message}`);
        setCheckingAuth(false);
        return;
      }

      if (!profile) {
        setError("No profile row was found for this user.");
        setCheckingAuth(false);
        return;
      }

      if (profile.role !== "admin" && profile.role !== "platform_admin") {
        setError(`This account is not admin. Current role: ${profile.role}`);
        setCheckingAuth(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const platformOrganizationRows =
        profile.role === "platform_admin" && session?.access_token
          ? await loadPlatformAdminOrganizations(session.access_token).catch(() => [])
          : [];

      const { data: orgRows, error: orgError } =
        platformOrganizationRows.length > 0
          ? { data: platformOrganizationRows, error: null }
          : await supabase.rpc("get_my_organizations");

      if (orgError) {
        setError(`Organization lookup failed: ${orgError.message}`);
        setCheckingAuth(false);
        return;
      }

      if (!orgRows || orgRows.length === 0) {
        setError("No organizations were returned for this admin account.");
        setCheckingAuth(false);
        return;
      }

      const organizationRows = orgRows as MyOrganizationRow[];
      const savedOrganizationId =
        typeof window !== "undefined" ? window.localStorage.getItem(ADMIN_SELECTED_ORGANIZATION_KEY) : null;
      const savedOrganization = organizationRows.find((row) => row.organization_id === savedOrganizationId);
      let nextOrganizationId = savedOrganization?.organization_id || organizationRows[0].organization_id;

      if (organizationRows.length > 1 && organizationRows.some((row) => row.record_count !== undefined)) {
        const bestOrganization = [...organizationRows].sort(
          (a, b) => (b.record_count || 0) - (a.record_count || 0)
        )[0];
        const savedOrganizationRecordCount = savedOrganization?.record_count || 0;
        const shouldPreferDataOrganization =
          !savedOrganization || (savedOrganizationRecordCount === 0 && (bestOrganization?.record_count || 0) > 0);

        if (shouldPreferDataOrganization && (bestOrganization?.record_count || 0) > 0) {
          nextOrganizationId = bestOrganization.organization_id;
        }
      } else if (!savedOrganization && organizationRows.length > 1) {
        const organizationScores = await Promise.all(
          organizationRows.map(async (organization) => {
            const [propertiesCount, jobsCount, groundsJobsCount] = await Promise.all([
              supabase
                .from("properties")
                .select("id", { count: "exact", head: true })
                .eq("organization_id", organization.organization_id),
              supabase
                .from("turnover_jobs")
                .select("id", { count: "exact", head: true })
                .eq("organization_id", organization.organization_id),
              supabase
                .from("grounds_jobs")
                .select("id", { count: "exact", head: true })
                .eq("organization_id", organization.organization_id),
            ]);

            return {
              organizationId: organization.organization_id,
              score:
                (propertiesCount.count || 0) +
                (jobsCount.count || 0) +
                (groundsJobsCount.count || 0),
            };
          })
        );
        const bestOrganization = organizationScores.sort((a, b) => b.score - a.score)[0];
        if (bestOrganization?.score > 0) {
          nextOrganizationId = bestOrganization.organizationId;
        }
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(ADMIN_SELECTED_ORGANIZATION_KEY, nextOrganizationId);
      }

      setCurrentPortalRole(profile.role);
      setCurrentAdminProfile(profile);
      setMyOrganizations(organizationRows);
      setCurrentOrganizationId(nextOrganizationId);
      setCurrentAdminUserId(user.id);
      setCheckingAuth(false);
    }

    void checkAuthAndRole();
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const open = new URLSearchParams(window.location.search).get("open");

    if (open === "add-property") {
      setActiveSection("properties");
    }
  }, []);
  useEffect(() => {
    if (!checkingAuth && currentOrganizationId) {
      void loadData();
    }
  }, [checkingAuth, currentOrganizationId]);

  useEffect(() => {
    if (checkingAuth || !currentOrganizationId) return;

    trackFeatureUsage({
      organizationId: currentOrganizationId,
      portal: "admin",
      area: "navigation",
      featureKey: `admin.${activeSection}`,
      featureLabel: ADMIN_FEATURE_LABELS[activeSection] || activeSection,
      action: "open",
    });
  }, [activeSection, checkingAuth, currentOrganizationId]);

  useEffect(() => {
    async function loadOrganizationBilling() {
      if (!currentOrganizationId) {
        setCurrentOrganizationBilling(null);
        return;
      }

      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", currentOrganizationId)
        .maybeSingle();

      if (error) {
        console.error("Organization billing lookup failed:", error.message);
        setCurrentOrganizationBilling(null);
        return;
      }

      setCurrentOrganizationBilling((data ?? null) as OrganizationBillingRow | null);
    }

    void loadOrganizationBilling();
  }, [currentOrganizationId]);

  useEffect(() => {
    if (
      checkingAuth ||
      !currentOrganizationId ||
      adminDraftDirty
    ) {
      return;
    }

    // Keep this as a low-frequency safety refresh. Realtime and action-specific reloads
    // handle normal updates; full admin hydration is intentionally expensive.
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadData();
    }, 600000);
    return () => window.clearInterval(interval);
  }, [checkingAuth, currentOrganizationId, adminDraftDirty]);

  useEffect(() => {
    setSelectedPropertyOwnerDirty(false);
    setCalendarDraftDirty(false);
    setAccessDirty(false);
    setPropertyDefaultsDirty(false);
    setPropertySetupTab("overview");
    setOwnerLinkTargetPropertyId("");
    setPropertyCoverMessage("");
    setPropertyCoverError("");
  }, [selectedPropertyId]);

  useEffect(() => {
    if (invoiceSettingsDirty) return;

    setInvoiceCompanyName(invoiceSettings?.company_name || currentOrganizationBilling?.name || "");
    setInvoiceLogoUrl(invoiceSettings?.logo_url || "");
    setInvoiceFromEmail(invoiceSettings?.from_email || "");
    setInvoiceReplyToEmail(invoiceSettings?.reply_to_email || "");
    setInvoiceHeaderText(
      invoiceSettings?.header_text ||
        "Thank you for trusting us with your property operations."
    );
    setInvoicePaymentInstructions(invoiceSettings?.payment_instructions || "");
    setInvoiceTaxLines(normalizeTaxLines(invoiceSettings?.tax_lines));
    setInvoiceAutoTurnover(invoiceSettings?.auto_add_turnover ?? true);
    setInvoiceAutoGrounds(invoiceSettings?.auto_add_grounds ?? true);
  }, [invoiceSettings, currentOrganizationBilling, invoiceSettingsDirty]);

  useEffect(() => {
    const ratesByPropertyId = new Map(propertyInvoiceRates.map((rate) => [rate.property_id, rate]));
    setPropertyInvoiceRateDrafts((current) => {
      const next: Record<string, { turnover: string; grounds: string; billTurnover: boolean; billGrounds: boolean }> = {};

      for (const property of properties) {
        const existing = ratesByPropertyId.get(property.id);
        next[property.id] = dirtyPropertyInvoiceRateIds.has(property.id) && current[property.id]
          ? current[property.id]
          : {
          turnover: String(existing?.turnover_rate ?? invoiceSettings?.default_turnover_rate ?? 0),
          grounds: String(existing?.grounds_rate ?? invoiceSettings?.default_grounds_rate ?? 0),
          billTurnover: existing?.bill_turnover_to_owner ?? false,
          billGrounds: existing?.bill_grounds_to_owner ?? false,
        };
      }

      return next;
    });
  }, [properties, propertyInvoiceRates, invoiceSettings, dirtyPropertyInvoiceRateIds]);

  useEffect(() => {
    if (!selectedPropertyId) {
      setDoorCode("");
      setAlarmCode("");
      setAccessNotes("");
      setSelectedPropertyOwnerName("");
      setSelectedPropertyOwnerEmail("");
      setSelectedPropertyOwnerDirty(false);
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
    const linkedOwner = getOwnerForProperty(selectedPropertyId);

    if (!selectedPropertyOwnerDirty) {
      setSelectedPropertyOwnerName(linkedOwner?.full_name || "");
      setSelectedPropertyOwnerEmail(linkedOwner?.email || "");
    }

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
    selectedPropertyOwnerDirty,
  ]);
  async function handleSubmitSupportTicket() {
    if (!supportMessage.trim()) return;

    try {
      setSendingSupport(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("You must be signed in to contact support.");
        return;
      }

      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("profile_id", user.id)
        .maybeSingle();

      const { error } = await supabase.from("support_tickets").insert({
        user_id: user.id,
        organization_id: membership?.organization_id ?? null,
        subject: supportSubject.trim() || "Support request",
        message: supportMessage.trim(),
        status: "open",
      });

      if (error) {
        console.error(error);
        alert("Could not send support request.");
        return;
      }

      setShowSupport(false);
      setSupportSubject("");
      setSupportMessage("");
      alert("Support request sent.");
    } catch (error) {
      console.error(error);
      alert("Something went wrong sending your support request.");
    } finally {
      setSendingSupport(false);
    }
  }
  function applyAdminDataPayload(data: any) {
    const loadedProperties = (data.properties ?? []) as Property[];
    const loadedStrandedJobs = (data.strandedJobs ?? []) as StrandedJob[];

    setProperties(loadedProperties);
    setCleanerAccounts((data.cleanerAccounts ?? []) as CleanerAccount[]);
    setCleanerAccountMembers((data.cleanerAccountMembers ?? []) as CleanerAccountMember[]);
    setAssignments((data.assignments ?? []) as Assignment[]);
    setJobs((data.jobs ?? []) as Job[]);
    setJobSlots((data.jobSlots ?? []) as JobSlot[]);
    setGroundsAccounts((data.groundsAccounts ?? []) as GroundsAccount[]);
    setGroundsAccountMembers((data.groundsAccountMembers ?? []) as GroundsAccountMember[]);
    setGroundsAssignments((data.groundsAssignments ?? []) as GroundsAssignment[]);
    setGroundsJobs((data.groundsJobs ?? []) as GroundsJob[]);
    setGroundsJobSlots((data.groundsJobSlots ?? []) as GroundsJobSlot[]);
    setGroundsRecurringTasks((data.groundsRecurringTasks ?? []) as GroundsRecurringTask[]);
    setGroundsRecurringRules((data.groundsRecurringRules ?? []) as GroundsRecurringRule[]);
    setStrandedJobs(loadedStrandedJobs);
    setAccessRows((data.accessRows ?? []) as AccessRow[]);
    setSops((data.sops ?? []) as SopRow[]);
    setSopImages((data.sopImages ?? []) as SopImageRow[]);
    setDocumentVaultRows((data.documentVaultRows ?? []) as DocumentVaultRow[]);
    setProfiles(
      ((data.profiles ?? []) as any[])
        .map((member) => {
          const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
          if (!profile) return null;

          return {
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            phone: profile.phone,
            role: member.role || profile.role,
            created_at: profile.created_at,
          } as ProfileRow;
        })
        .filter(Boolean) as ProfileRow[]
    );
    setOwnerAccounts((data.ownerAccounts ?? []) as OwnerAccountRow[]);
    setOwnerPropertyAccess((data.ownerPropertyAccess ?? []) as OwnerPropertyAccessRow[]);
    setPropertyCalendars((data.propertyCalendars ?? []) as PropertyCalendarRow[]);
    setPropertyBookingEvents((data.propertyBookingEvents ?? []) as PropertyBookingEvent[]);
    setMaintenanceFlags((data.maintenanceFlags ?? []) as MaintenanceFlagRow[]);
    setMaintenanceFlagImages((data.maintenanceFlagImages ?? []) as MaintenanceFlagImageRow[]);
    setOrganizationInvites((data.organizationInvites ?? []) as OrganizationInviteRow[]);
    setInvoiceSettings((data.invoiceSettings ?? null) as InvoiceSettingsRow | null);
    setPropertyInvoiceRates((data.propertyInvoiceRates ?? []) as PropertyInvoiceRateRow[]);
    setOwnerInvoices((data.ownerInvoices ?? []) as OwnerInvoiceRow[]);
    setChatConversations((data.chatConversations ?? []) as ChatConversationRow[]);
    setChatParticipants((data.chatParticipants ?? []) as ChatParticipantRow[]);
    setChatMessages((data.chatMessages ?? []) as ChatMessageRow[]);
    setChatHiddenItems((data.chatHiddenItems ?? []) as ChatHiddenItemRow[]);

    setReassignSelections((prev) => {
      const next = { ...prev };
      for (const job of loadedStrandedJobs) {
        if (!next[job.id]) next[job.id] = "";
      }
      return next;
    });
    setAdminDataLoaded(true);
  }

  async function loadData() {
    setError("");
    setAdminDataLoaded(false);

    if (!currentOrganizationId) {
      setError("No organization selected.");
      return;
    }

    if (currentPortalRole === "platform_admin") {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("No active admin session was found.");
        return;
      }

      const response = await fetch(
        `/api/admin/dashboard-data?organizationId=${encodeURIComponent(currentOrganizationId)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        setError(payload?.error || "Could not load admin dashboard data.");
        return;
      }

      applyAdminDataPayload(payload.data || {});
      return;
    }





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
      documentVaultRes,
      profilesRes,
      ownerAccountsRes,
      ownerPropertyAccessRes,
      propertyCalendarsRes,
      propertyBookingEventsRes,
      maintenanceFlagsRes,
      maintenanceFlagImagesRes,
      organizationInvitesRes,
      invoiceSettingsRes,
      propertyInvoiceRatesRes,
      ownerInvoicesRes,
      chatConversationsRes,
      chatParticipantsRes,
      chatMessagesRes,
      chatHiddenItemsRes,
    ] = await Promise.all([
      supabase
        .from("properties")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("cleaner_accounts")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false }),
      supabase.from("cleaner_account_members").select("*").order("created_at", { ascending: false }),
      supabase
        .from("property_cleaner_account_assignments")
        .select("*")
        .order("priority", { ascending: true }),
      supabase
        .from("turnover_jobs")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false }),
      supabase.from("turnover_job_slots").select("*").order("job_id", { ascending: true }),
      supabase
        .from("grounds_accounts")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false }),
      supabase.from("grounds_account_members").select("*").order("created_at", { ascending: false }),
      supabase
        .from("property_grounds_account_assignments")
        .select("*")
        .order("priority", { ascending: true }),
      supabase
        .from("grounds_jobs")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false }),
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
        .from("document_vault_files")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("organization_members")
        .select(`
    profile_id,
    role,
    created_at,
    profiles!organization_members_profile_id_fkey (
      id,
      email,
      full_name,
      phone,
      role,
      created_at
    )
  `)
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("owner_accounts")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false }),
      supabase.from("owner_property_access").select("*").order("created_at", { ascending: false }),
      supabase.from("property_calendars").select("*").order("created_at", { ascending: false }),
      supabase
        .from("property_booking_events")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .lte("checkin_date", todayYmd)
        .gt("checkout_date", todayYmd)
        .order("checkout_date", { ascending: true }),
      supabase
        .from("property_maintenance_flags")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false }),
      supabase.from("property_maintenance_flag_images").select("*").order("sort_order", { ascending: true }),
      supabase
        .from("organization_invites")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .in("role", ["cleaner", "grounds"])
        .order("created_at", { ascending: false }),
      supabase
        .from("organization_invoice_settings")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .maybeSingle(),
      supabase
        .from("property_invoice_rates")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("owner_invoices")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("chat_conversations")
        .select("id,organization_id,subject,context_type,context_id,created_by_profile_id,last_message_at,created_at,updated_at")
        .eq("organization_id", currentOrganizationId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("chat_participants")
        .select("id,organization_id,conversation_id,participant_type,participant_profile_id,participant_owner_account_id,participant_role,display_name,email,last_read_at,created_at")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: true }),
      supabase
        .from("chat_messages")
        .select("id,organization_id,conversation_id,sender_profile_id,body,created_at,updated_at")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: true }),
      currentAdminUserId
        ? supabase
            .from("chat_hidden_items")
            .select("id,organization_id,conversation_id,message_id,hidden_by_profile_id,hidden_by_owner_account_id,hidden_at")
            .eq("organization_id", currentOrganizationId)
            .eq("hidden_by_profile_id", currentAdminUserId)
        : Promise.resolve({ data: [], error: null }),
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
      documentVaultRes,
      profilesRes,
      ownerAccountsRes,
      ownerPropertyAccessRes,
      propertyCalendarsRes,
      propertyBookingEventsRes,
      maintenanceFlagsRes,
      maintenanceFlagImagesRes,
      organizationInvitesRes,
      invoiceSettingsRes,
      propertyInvoiceRatesRes,
      ownerInvoicesRes,
      chatConversationsRes,
      chatParticipantsRes,
      chatMessagesRes,
      chatHiddenItemsRes,
    ];

    for (const response of responses) {
      if (
        response.error &&
        response !== invoiceSettingsRes &&
        response !== propertyInvoiceRatesRes &&
        response !== documentVaultRes &&
        response !== propertyBookingEventsRes &&
        response !== chatConversationsRes &&
        response !== chatParticipantsRes &&
        response !== chatMessagesRes &&
        response !== chatHiddenItemsRes
      ) {
        setError(response.error.message);
        return;
      }
    }

    const loadedProperties = (propertiesRes.data ?? []) as Property[];
    const loadedPropertyIds = new Set(loadedProperties.map((property) => property.id));
    const loadedCleanerAccountIds = new Set(((cleanerAccountsRes.data ?? []) as CleanerAccount[]).map((account) => account.id));
    const loadedGroundsAccountIds = new Set(((groundsAccountsRes.data ?? []) as GroundsAccount[]).map((account) => account.id));
    const loadedJobIds = new Set(((jobsRes.data ?? []) as Job[]).map((job) => job.id));
    const loadedGroundsJobIds = new Set(((groundsJobsRes.data ?? []) as GroundsJob[]).map((job) => job.id));
    const loadedOwnerAccountIds = new Set(((ownerAccountsRes.data ?? []) as OwnerAccountRow[]).map((owner) => owner.id));
    const loadedStrandedJobs = ((strandedJobsRes.data ?? []) as StrandedJob[]).filter(
      (job) => !!job.property_id && loadedPropertyIds.has(job.property_id)
    );
    const loadedOwnerPropertyAccess = ((ownerPropertyAccessRes.data ?? []) as OwnerPropertyAccessRow[]).filter(
      (access) => loadedPropertyIds.has(access.property_id) && loadedOwnerAccountIds.has(access.owner_account_id)
    );
    const loadedPropertyCalendars = ((propertyCalendarsRes.data ?? []) as PropertyCalendarRow[]).filter((calendar) =>
      loadedPropertyIds.has(calendar.property_id)
    );
    const loadedAccessRows = ((accessRowsRes.data ?? []) as AccessRow[]).filter((row) =>
      loadedPropertyIds.has(row.property_id)
    );
    const loadedAssignments = ((assignmentsRes.data ?? []) as Assignment[]).filter(
      (assignment) => loadedPropertyIds.has(assignment.property_id) && loadedCleanerAccountIds.has(assignment.cleaner_account_id)
    );
    const loadedGroundsAssignments = ((groundsAssignmentsRes.data ?? []) as GroundsAssignment[]).filter(
      (assignment) => loadedPropertyIds.has(assignment.property_id) && loadedGroundsAccountIds.has(assignment.grounds_account_id)
    );
    const loadedCleanerAccountMembers = ((cleanerAccountMembersRes.data ?? []) as CleanerAccountMember[]).filter((member) =>
      loadedCleanerAccountIds.has(member.cleaner_account_id)
    );
    const loadedGroundsAccountMembers = ((groundsAccountMembersRes.data ?? []) as GroundsAccountMember[]).filter((member) =>
      loadedGroundsAccountIds.has(member.grounds_account_id)
    );
    const loadedJobSlots = ((jobSlotsRes.data ?? []) as JobSlot[]).filter((slot) => loadedJobIds.has(slot.job_id));
    const loadedGroundsJobSlots = ((groundsJobSlotsRes.data ?? []) as GroundsJobSlot[]).filter((slot) =>
      loadedGroundsJobIds.has(slot.job_id)
    );
    const loadedGroundsRecurringTasks = ((groundsRecurringTasksRes.data ?? []) as GroundsRecurringTask[]).filter((task) =>
      loadedPropertyIds.has(task.property_id)
    );
    const loadedGroundsRecurringRules = ((groundsRecurringRulesRes.data ?? []) as GroundsRecurringRule[]).filter((rule) =>
      loadedPropertyIds.has(rule.property_id)
    );
    const loadedSops = ((sopsRes.data ?? []) as SopRow[]).filter((sop) => loadedPropertyIds.has(sop.property_id));
    const loadedSopIds = new Set(loadedSops.map((sop) => sop.id));
    const loadedSopImages = ((sopImagesRes.data ?? []) as SopImageRow[]).filter((image) => loadedSopIds.has(image.sop_id));
    const loadedMaintenanceFlagIds = new Set(((maintenanceFlagsRes.data ?? []) as MaintenanceFlagRow[]).map((flag) => flag.id));
    const loadedMaintenanceFlagImages = ((maintenanceFlagImagesRes.data ?? []) as MaintenanceFlagImageRow[]).filter((image) =>
      loadedMaintenanceFlagIds.has(image.flag_id)
    );

    setProperties(loadedProperties);
    setCleanerAccounts((cleanerAccountsRes.data ?? []) as CleanerAccount[]);
    setCleanerAccountMembers(loadedCleanerAccountMembers);
    setAssignments(loadedAssignments);
    setJobs((jobsRes.data ?? []) as Job[]);
    setJobSlots(loadedJobSlots);
    setGroundsAccounts((groundsAccountsRes.data ?? []) as GroundsAccount[]);
    setGroundsAccountMembers(loadedGroundsAccountMembers);
    setGroundsAssignments(loadedGroundsAssignments);
    setGroundsJobs((groundsJobsRes.data ?? []) as GroundsJob[]);
    setGroundsJobSlots(loadedGroundsJobSlots);
    setGroundsRecurringTasks(loadedGroundsRecurringTasks);
    setGroundsRecurringRules(loadedGroundsRecurringRules);
    setStrandedJobs(loadedStrandedJobs);
    setAccessRows(loadedAccessRows);
    setSops(loadedSops);
    setSopImages(loadedSopImages);
    setDocumentVaultRows(
      documentVaultRes.error ? [] : ((documentVaultRes.data ?? []) as DocumentVaultRow[])
    );
    setProfiles(
      ((profilesRes.data ?? []) as any[])
        .map((member) => {
          const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
          if (!profile) return null;

          return {
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            phone: profile.phone,
            role: member.role || profile.role,
            created_at: profile.created_at,
          } as ProfileRow;
        })
        .filter(Boolean) as ProfileRow[]
    );
    setOwnerAccounts((ownerAccountsRes.data ?? []) as OwnerAccountRow[]);
    setOwnerPropertyAccess(loadedOwnerPropertyAccess);
    setPropertyCalendars(loadedPropertyCalendars);
    setPropertyBookingEvents(
      propertyBookingEventsRes.error ? [] : ((propertyBookingEventsRes.data ?? []) as PropertyBookingEvent[])
    );
    setMaintenanceFlags((maintenanceFlagsRes.data ?? []) as MaintenanceFlagRow[]);
    setMaintenanceFlagImages(loadedMaintenanceFlagImages);
    setOrganizationInvites((organizationInvitesRes.data ?? []) as OrganizationInviteRow[]);
    setInvoiceSettings((invoiceSettingsRes.data ?? null) as InvoiceSettingsRow | null);
    setPropertyInvoiceRates(
      propertyInvoiceRatesRes.error ? [] : ((propertyInvoiceRatesRes.data ?? []) as PropertyInvoiceRateRow[])
    );
    setOwnerInvoices((ownerInvoicesRes.data ?? []) as OwnerInvoiceRow[]);
    setChatConversations(
      chatConversationsRes.error ? [] : ((chatConversationsRes.data ?? []) as ChatConversationRow[])
    );
    setChatParticipants(
      chatParticipantsRes.error ? [] : ((chatParticipantsRes.data ?? []) as ChatParticipantRow[])
    );
    setChatMessages(chatMessagesRes.error ? [] : ((chatMessagesRes.data ?? []) as ChatMessageRow[]));
    setChatHiddenItems(
      chatHiddenItemsRes.error ? [] : ((chatHiddenItemsRes.data ?? []) as ChatHiddenItemRow[])
    );

    setReassignSelections((prev) => {
      const next = { ...prev };
      for (const job of loadedStrandedJobs) {
        if (!next[job.id]) next[job.id] = "";
      }
      return next;
    });
    setAdminDataLoaded(true);
  }

  async function markChatConversationRead(conversationId: string) {
    if (!conversationId || !currentAdminUserId) return;

    const readAt = new Date().toISOString();
    setChatParticipants((participants) =>
      participants.map((participant) =>
        participant.conversation_id === conversationId && participant.participant_profile_id === currentAdminUserId
          ? { ...participant, last_read_at: readAt }
          : participant
      )
    );

    const { error: readError } = await supabase.rpc("mark_chat_conversation_read", {
      conversation_id_to_mark: conversationId,
    });

    if (readError) {
      console.warn("Could not mark chat conversation read", readError);
    }
  }

  useEffect(() => {
    if (!currentOrganizationId) return;

    const channel = supabase
      .channel(`admin-chat-realtime-${currentOrganizationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `organization_id=eq.${currentOrganizationId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessageRow;
          setChatMessages((current) =>
            current.some((message) => message.id === incoming.id) ? current : [...current, incoming]
          );
          setChatConversations((current) =>
            current.map((conversation) =>
              conversation.id === incoming.conversation_id
                ? {
                    ...conversation,
                    last_message_at: incoming.created_at,
                    updated_at: incoming.created_at,
                  }
                : conversation
            )
          );
        }
      )
      .subscribe((status) => {
        setChatRealtimeReady(status === "SUBSCRIBED");
      });

    return () => {
      setChatRealtimeReady(false);
      void supabase.removeChannel(channel);
    };
  }, [currentOrganizationId]);

  useEffect(() => {
    if (activeSection !== "chat") return;
    const conversationId = selectedChatConversationId || chatConversations[0]?.id || "";
    if (!conversationId) return;
    void markChatConversationRead(conversationId);
  }, [activeSection, selectedChatConversationId, chatConversations, chatMessages.length]);

  useEffect(() => {
    if (activeSection !== "chat") return;
    const thread = chatThreadScrollRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [activeSection, selectedChatConversationId, chatMessages.length]);

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
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Could not verify your admin session.");
      }

      const response = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
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

  function resetManualPropertyForm() {
    setPropertyName("");
    setPropertyStreet("");
    setPropertyCity("");
    setPropertyProvince("");
    setPropertyPostal("");
    setPropertyNotes("");
    setPropertyOwnerName("");
    setPropertyOwnerEmail("");
    setPropertyUnitsNeeded("1");
    setPropertyUnitsStrict(false);
    setPropertyShowTeamStatus(true);
  }

  function resetAirbnbImportForm() {
    setAirbnbImportName("");
    setAirbnbImportAddress("");
    setAirbnbImportStreet("");
    setAirbnbImportCity("");
    setAirbnbImportProvince("");
    setAirbnbImportPostal("");
    setAirbnbImportCalendarUrl("");
    setAirbnbImportCoverPhotoUrl("");
    setAirbnbImportListingUrl("");
    setAirbnbImportOwnerName("");
    setAirbnbImportOwnerEmail("");
    setAirbnbImportNotes("");
  }

  function applyAirbnbAddressLine() {
    const parsed = parseAddressLine(airbnbImportAddress);
    setAirbnbImportStreet(parsed.street);
    setAirbnbImportCity(parsed.city);
    setAirbnbImportProvince(parsed.province);
    setAirbnbImportPostal(parsed.postal);
  }

  async function linkOwnerAccountToProperty(propertyId: string, ownerEmailRaw: string, ownerNameRaw: string) {
    const ownerEmail = ownerEmailRaw.trim().toLowerCase();
    const ownerName = ownerNameRaw.trim();

    if (!ownerEmail) {
      return false;
    }

    let ownerAccountId: string | null = null;

    const existingOwner = ownerAccounts.find(
      (owner) => owner.email.trim().toLowerCase() === ownerEmail
    );

    if (existingOwner) {
      ownerAccountId = existingOwner.id;

      const updates: Record<string, any> = {};
      if (ownerName && !existingOwner.full_name) {
        updates.full_name = ownerName;
      }

      if (Object.keys(updates).length > 0) {
        const { error: ownerUpdateError } = await supabase
          .from("owner_accounts")
          .update(updates)
          .eq("id", existingOwner.id);

        if (ownerUpdateError) {
          throw ownerUpdateError;
        }
      }
    } else {
      const { data: insertedOwner, error: ownerInsertError } = await supabase
        .from("owner_accounts")
        .insert({
          organization_id: currentOrganizationId,
          email: ownerEmail,
          full_name: ownerName || null,
          is_active: true,
        })
        .select()
        .single();

      if (ownerInsertError || !insertedOwner) {
        throw ownerInsertError || new Error("Could not create owner account.");
      }

      ownerAccountId = insertedOwner.id;
    }

    if (ownerAccountId) {
      const existingAccess = ownerPropertyAccess.find(
        (row) => row.owner_account_id === ownerAccountId && row.property_id === propertyId
      );

      if (!existingAccess) {
        const { error: accessError } = await supabase.from("owner_property_access").insert({
          owner_account_id: ownerAccountId,
          property_id: propertyId,
        });

        if (accessError) {
          throw accessError;
        }
      }
    }

    return true;
  }

  async function addProperty() {
    if (!propertyName.trim()) {
      setError("Property name is required.");
      return;
    }

    setError("");
    setActionMessage("");

    const ownerEmail = propertyOwnerEmail.trim().toLowerCase();
    const ownerName = propertyOwnerName.trim();

    const { data: insertedProperty, error: propertyError } = await supabase
      .from("properties")
      .insert({
        organization_id: currentOrganizationId,
        name: propertyName.trim(),
        address: buildPropertyAddress([
          propertyStreet,
          propertyCity,
          propertyProvince,
          propertyPostal,
        ]),
        notes: propertyNotes.trim() || null,
        default_cleaner_units_needed: Number(propertyUnitsNeeded),
        cleaner_units_required_strict: propertyUnitsStrict,
        show_team_status_to_cleaners: propertyShowTeamStatus,
      })
      .select()
      .single();

    if (propertyError || !insertedProperty) {
      setError(propertyError?.message || "Could not create property.");
      return;
    }

    if (ownerEmail) {
      try {
        await linkOwnerAccountToProperty(insertedProperty.id, ownerEmail, ownerName);
      } catch (err: any) {
        setError(err?.message || "Could not create owner account.");
        return;
      }
    }

    resetManualPropertyForm();
    setActionMessage(ownerEmail ? "Property added and owner linked." : "Property added.");
    await loadData();
  }

  async function addAirbnbProperty() {
    if (!airbnbImportName.trim()) {
      setError("Airbnb listing name is required.");
      return;
    }

    if (!airbnbImportStreet.trim() || !airbnbImportCity.trim()) {
      setError("Street and city are required before importing from Airbnb.");
      return;
    }

    if (!airbnbImportCalendarUrl.trim()) {
      setError("Airbnb iCal URL is required for the import wizard.");
      return;
    }

    const normalizedCalendarUrl = normalizeIcalUrl(airbnbImportCalendarUrl);
    try {
      const parsedUrl = new URL(normalizedCalendarUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Unsupported calendar URL.");
      }
    } catch {
      setError("Enter a valid Airbnb iCal export URL. It should start with https:// or webcal://.");
      return;
    }

    setError("");
    setActionMessage("Creating the property, attaching Airbnb iCal, then syncing bookings automatically.");
    setImportingAirbnbProperty(true);

    let insertedPropertyId: string | null = null;

    try {
      const combinedNotes = [
        airbnbImportNotes.trim(),
        airbnbImportListingUrl.trim() ? `Airbnb listing: ${airbnbImportListingUrl.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const { data: insertedProperty, error: propertyError } = await supabase
        .from("properties")
        .insert({
          organization_id: currentOrganizationId,
          name: airbnbImportName.trim(),
          address: buildPropertyAddress([
            airbnbImportStreet,
            airbnbImportCity,
            airbnbImportProvince,
            airbnbImportPostal,
          ]),
          notes: combinedNotes || null,
          cover_photo_url: airbnbImportCoverPhotoUrl.trim() || null,
          default_cleaner_units_needed: Number(propertyUnitsNeeded),
          cleaner_units_required_strict: propertyUnitsStrict,
          show_team_status_to_cleaners: propertyShowTeamStatus,
        })
        .select()
        .single();

      if (propertyError || !insertedProperty) {
        throw propertyError || new Error("Could not create Airbnb property.");
      }

      insertedPropertyId = insertedProperty.id;

      if (airbnbImportOwnerEmail.trim()) {
        await linkOwnerAccountToProperty(
          insertedProperty.id,
          airbnbImportOwnerEmail,
          airbnbImportOwnerName
        );
      }

      const { error: calendarError } = await supabase.from("property_calendars").insert({
        property_id: insertedProperty.id,
        source: "airbnb",
        ical_url: normalizedCalendarUrl,
        is_active: true,
      });

      if (calendarError) {
        throw new Error(`Property created, but the Airbnb calendar could not be attached: ${calendarError.message}`);
      }

      setSelectedPropertyId(insertedProperty.id);
      setPropertySetupTab("overview");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Property created, but the calendar could not sync because your admin session was not ready.");
      }

      const syncResponse = await fetch("/api/sync-calendars", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          organizationId: currentOrganizationId,
          propertyId: insertedProperty.id,
        }),
      });

      const syncPayload = await syncResponse.json().catch(() => null);
      if (!syncResponse.ok) {
        throw new Error(
          `Property and Airbnb calendar were saved, but automatic sync failed: ${syncPayload?.error || syncPayload?.message || "Calendar sync failed."}`
        );
      }

      resetAirbnbImportForm();
      setActionMessage(`Airbnb property imported and synced automatically. ${getCalendarSyncMessage(syncPayload)}`);
      await loadData();
    } catch (err: any) {
      if (insertedPropertyId) {
        await loadData();
      }
      setError(err?.message || "Could not import Airbnb property.");
    } finally {
      setImportingAirbnbProperty(false);
    }
  }
  async function createOrganizationInvite(params: {
    email: string;
    fullName?: string;
    phone?: string;
    role: "cleaner" | "grounds" | "owner";
  }) {
    const email = params.email.trim().toLowerCase();
    const fullName = params.fullName?.trim() || null;
    const phone = params.phone?.trim() || null;

    if (!currentOrganizationId) {
      setError("No organization selected.");
      return null;
    }

    if (!currentAdminUserId) {
      setError("No admin user found.");
      return null;
    }

    if (!email) {
      setError("Email is required.");
      return null;
    }

    setError("");
    setActionMessage("");

    const token = createInviteToken();

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existingInvite, error: existingInviteError } = await supabase
      .from("organization_invites")
      .select("*")
      .eq("organization_id", currentOrganizationId)
      .eq("email", email)
      .eq("role", params.role)
      .in("status", ["pending", "sent"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingInviteError) {
      setError(existingInviteError.message);
      return null;
    }

    const { data, error } = existingInvite
      ? await supabase
        .from("organization_invites")
        .update({
          full_name: fullName || existingInvite.full_name,
          phone: phone || existingInvite.phone,
          status: "sent",
          token,
          sent_at: new Date().toISOString(),
          expires_at: expiresAt,
        })
        .eq("id", existingInvite.id)
        .select()
        .single()
      : await supabase
        .from("organization_invites")
        .insert({
          organization_id: currentOrganizationId,
          email,
          full_name: fullName,
          phone,
          role: params.role,
          status: "sent",
          token,
          invited_by_profile_id: currentAdminUserId,
          sent_at: new Date().toISOString(),
          expires_at: expiresAt,
        })
        .select()
        .single();

    if (error) {
      setError(error.message);
      return null;
    }

    const inviteUrl = `${window.location.origin}/invite?token=${data.token}`;

    try {
      const response = await fetch("/api/send-invite-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          inviteUrl,
          role: params.role,
          name: fullName,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const detailedError =
          payload?.error ||
          payload?.message ||
          `Invite email failed with status ${response.status}`;
        throw new Error(detailedError);
      }

      setActionMessage(
        existingInvite
          ? `${params.role} invite refreshed and email sent: ${inviteUrl}`
          : `${params.role} invite created and email sent: ${inviteUrl}`
      );
    } catch (err: any) {
      const detailedMessage = err?.message || "Unknown email send error.";
      setError(detailedMessage);
      setActionMessage(
        existingInvite
          ? `${params.role} invite refreshed, but email failed to send: ${detailedMessage}`
          : `${params.role} invite created, but email failed to send: ${detailedMessage}`
      );
    }

    return data;
  }
  async function resendOrganizationInvite(params: {
    email: string;
    role: "cleaner" | "grounds" | "owner";
  }) {
    const email = params.email.trim().toLowerCase();

    if (!currentOrganizationId) {
      setError("No organization selected.");
      return null;
    }

    if (!email) {
      setError("Email is required.");
      return null;
    }

    setError("");
    setActionMessage("");

    const { data: existingInvite, error: existingInviteError } = await supabase
      .from("organization_invites")
      .select("*")
      .eq("organization_id", currentOrganizationId)
      .eq("email", email)
      .eq("role", params.role)
      .in("status", ["pending", "sent"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingInviteError) {
      setError(existingInviteError.message);
      return null;
    }

    if (!existingInvite) {
      setError("No active invite was found to resend.");
      return null;
    }

    const refreshedExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const refreshedToken = createInviteToken();

    const { data, error } = await supabase
      .from("organization_invites")
      .update({
        sent_at: new Date().toISOString(),
        expires_at: refreshedExpiry,
        status: "sent",
        token: refreshedToken,
      })
      .eq("id", existingInvite.id)
      .select()
      .single();

    if (error) {
      setError(error.message);
      return null;
    }

    const inviteUrl = `${window.location.origin}/invite?token=${data.token}`;

    try {
      const response = await fetch("/api/send-invite-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          inviteUrl,
          role: params.role,
          name: data.full_name || undefined,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Invite email failed to send.");
      }

      setActionMessage(`${params.role} invite resent and email sent: ${inviteUrl}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite email failed to send.");
      setActionMessage(`${params.role} invite was refreshed, but email failed to send: ${inviteUrl}`);
    }

    return data;
  }

  async function deleteOrganizationInvite(inviteId: string) {
    const confirmed = window.confirm(
      "Revoke this pending invite? The invite link will stop working."
    );
    if (!confirmed) return;

    if (!currentOrganizationId) {
      setError("No organization selected.");
      return;
    }

    setError("");
    setActionMessage("");
    setDeletingOrganizationInviteId(inviteId);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Could not verify your admin session.");
      }

      const response = await fetch("/api/admin/delete-organization-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          inviteId,
          organizationId: currentOrganizationId,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Could not revoke pending invite.");
      }

      setOrganizationInvites((prev) =>
        prev.map((invite) => (invite.id === inviteId ? { ...invite, status: "revoked" } : invite))
      );
      setActionMessage(payload?.message || "Pending invite revoked.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke pending invite.");
    } finally {
      setDeletingOrganizationInviteId(null);
    }
  }
  async function notifyJobOffers(kind: "cleaner" | "grounds", slotIds: string[]) {
    const uniqueSlotIds = [...new Set(slotIds.filter(Boolean))];

    if (uniqueSlotIds.length === 0) {
      return { sent: 0, skipped: 0, errors: [] as string[] };
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return {
        sent: 0,
        skipped: uniqueSlotIds.length,
        errors: ["Could not verify your admin session for email notifications."],
      };
    }

    const response = await fetch("/api/admin/notify-job-offers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        kind,
        slotIds: uniqueSlotIds,
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        sent: 0,
        skipped: uniqueSlotIds.length,
        errors: [payload?.error || "Could not send job offer notifications."],
      };
    }

    return {
      sent: Number(payload?.sent ?? 0),
      skipped: Number(payload?.skipped ?? 0),
      errors: Array.isArray(payload?.errors) ? payload.errors : [],
    };
  }

  async function retryJobNotification(kind: "cleaner" | "grounds", slotIds: string[], retryId?: string) {
    const uniqueSlotIds = [...new Set(slotIds.filter(Boolean))];
    if (uniqueSlotIds.length === 0) {
      setError("No pending notification slots were selected.");
      return;
    }

    if (retryId) {
      setRetryingNotificationSlotId(retryId);
    } else {
      setRetryingNotificationBatch(true);
    }

    try {
      const result = await notifyJobOffers(kind, uniqueSlotIds);
      if (result.errors.length > 0) {
        setError(result.errors.join(" "));
      }

      if (result.sent > 0) {
        setActionMessage(`${result.sent} ${kind} offer email${result.sent === 1 ? "" : "s"} sent.`);
      } else if (result.skipped > 0 && result.errors.length === 0) {
        setActionMessage("No emails were sent because those slots are no longer pending.");
      }

      await loadData();
    } finally {
      setRetryingNotificationSlotId(null);
      setRetryingNotificationBatch(false);
    }
  }

  async function retryAllPendingJobNotifications() {
    const cleanerSlotIds = failedNotificationRows
      .filter((row) => row.kindApi === "cleaner")
      .map((row) => row.slotId);
    const groundsSlotIds = failedNotificationRows
      .filter((row) => row.kindApi === "grounds")
      .map((row) => row.slotId);

    if (cleanerSlotIds.length === 0 && groundsSlotIds.length === 0) {
      setActionMessage("No pending job offer email notifications need retrying.");
      return;
    }

    setRetryingNotificationBatch(true);
    try {
      const cleanerResult = cleanerSlotIds.length > 0
        ? await notifyJobOffers("cleaner", cleanerSlotIds)
        : { sent: 0, skipped: 0, errors: [] as string[] };
      const groundsResult = groundsSlotIds.length > 0
        ? await notifyJobOffers("grounds", groundsSlotIds)
        : { sent: 0, skipped: 0, errors: [] as string[] };
      const sent = cleanerResult.sent + groundsResult.sent;
      const errors = [...cleanerResult.errors, ...groundsResult.errors];

      if (errors.length > 0) {
        setError(errors.join(" "));
      }

      setActionMessage(
        sent > 0
          ? `${sent} pending job offer email${sent === 1 ? "" : "s"} sent.`
          : "No pending job offer emails were sent."
      );

      await loadData();
    } finally {
      setRetryingNotificationBatch(false);
    }
  }
  async function inviteCleanerFromForm() {
    if (!inviteCleanerEmail.trim()) {
      setError("Cleaner email is required to send an invite.");
      return;
    }

    const invite = await createOrganizationInvite({
      email: inviteCleanerEmail,
      fullName: inviteCleanerName || undefined,
      phone: inviteCleanerPhone || undefined,
      role: "cleaner",
    });

    if (!invite) return;

    setInviteCleanerName("");
    setInviteCleanerEmail("");
    setInviteCleanerPhone("");
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
        organization_id: currentOrganizationId,
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
    const scheduledDate = jobScheduledFor || extractedDate;

    if (!scheduledDate) {
      setError("Please select a cleaning date or include a checkout date in the notes.");
      return;
    }

    const payload: Partial<Job> & {
      organization_id: string | null;
      property_id: string;
      cleaners_needed: number;
      cleaners_required_strict: boolean;
      notes: string | null;
      scheduled_for: string | null;
    } = {
      organization_id: currentOrganizationId,
      property_id: jobPropertyId,
      cleaners_needed: Number(jobUnitsNeeded),
      cleaners_required_strict: jobUnitsStrict,
      notes: jobNotes.trim() || null,
      scheduled_for: scheduledDate,
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
      const message = error?.message || "Could not create job.";
      setError(message);
      alert(message);
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

    const { data: createdOfferSlots, error: createdOfferSlotsError } = await supabase
      .from("turnover_job_slots")
      .select("id")
      .eq("job_id", insertedJob.id)
      .eq("status", "offered")
      .not("cleaner_account_id", "is", null);

    let notificationNote = "";
    if (!createdOfferSlotsError && (createdOfferSlots ?? []).length > 0) {
      const notifyResult = await notifyJobOffers(
        "cleaner",
        (createdOfferSlots ?? []).map((slot) => slot.id)
      );

      if (notifyResult.errors.length > 0) {
        notificationNote = " Offer email notification needs attention.";
      } else if (notifyResult.sent > 0) {
        notificationNote = ` ${notifyResult.sent} offer email${notifyResult.sent === 1 ? "" : "s"} sent.`;
      }
    }

    setJobPropertyId("");
    setJobScheduledFor("");
    setJobNotes("");
    setJobOverrideUnitsEnabled(false);
    setJobUnitsNeeded("1");
    setJobUnitsStrict(false);
    setJobShowTeamStatus(true);
    setActionMessage(`Job created successfully.${notificationNote}`.trim());
    alert("Cleaning job created.");
    await loadData();
    setActiveSection("jobs");
    setHighlightedJobId(insertedJob.id);
    setTimeout(() => {
      document.getElementById(`job-${insertedJob.id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 150);
  }

  async function syncCalendarsNow(propertyId?: string) {
    setError("");
    setActionMessage("");
    setSyncingCalendarsNow(true);

    try {
      if (!currentOrganizationId) {
        throw new Error("No organization selected for calendar sync.");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("You must be signed in as an admin to sync calendars.");
      }

      const response = await fetch("/api/sync-calendars", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          organizationId: currentOrganizationId,
          ...(propertyId ? { propertyId } : {}),
        }),
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

      setActionMessage(getCalendarSyncMessage(payload));
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Calendar sync failed.");
    } finally {
      setSyncingCalendarsNow(false);
    }
  }

  function getCalendarSyncMessage(payload: any) {
    if (payload?.message) return payload.message;

    const calendarsFound = Number(payload?.calendars_found ?? 0);
    const totals = payload?.totals || {};
    const created = Number(totals.created ?? 0);
    const skippedExisting = Number(totals.skipped_existing ?? 0);
    const skippedPast = Number(totals.skipped_past ?? 0);
    const skippedNonBooking = Number(totals.skipped_non_booking ?? 0);
    const bookingEventsSaved = Number(totals.booking_events_saved ?? 0);
    const removedMissingFuture = Number(totals.removed_missing_future ?? 0);
    const errors = Number(totals.errors ?? 0);
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const resultIssueSummaries = results
      .map((result: any) => {
        const resultErrors = Array.isArray(result?.errors) ? result.errors : [];
        if (resultErrors.length === 0) return "";
        const propertyName = result?.property_name || "Unknown property";
        const source = result?.source || "calendar";
        const firstError = String(resultErrors[0] || "Unknown issue").replace(/\s+/g, " ");
        return `${propertyName} / ${source}: ${resultErrors.length} issue${resultErrors.length === 1 ? "" : "s"} (${firstError.slice(0, 140)}${firstError.length > 140 ? "..." : ""})`;
      })
      .filter(Boolean);

    const propertySummaries =
      results.length > 0
        ? results
          .map((result: any) => {
            const propertyName = result?.property_name || "Unknown property";
            const source = result?.source || "calendar";
            const resultCreated = Number(result?.created ?? 0);
            const resultBookingEvents = Number(result?.booking_events_saved ?? 0);
            const resultRemovedMissingFuture = Number(result?.removed_missing_future ?? 0);
            const resultErrors = Array.isArray(result?.errors) ? result.errors.length : 0;
            if (resultCreated === 0 && resultBookingEvents === 0 && resultRemovedMissingFuture === 0 && resultErrors === 0) return "";
            return `${propertyName} / ${source}: ${resultCreated} created, ${resultBookingEvents} booking saved, ${resultRemovedMissingFuture} removed${resultErrors > 0 ? `, ${resultErrors} issue${resultErrors === 1 ? "" : "s"}` : ""}`;
          })
          .filter(Boolean)
          .slice(0, 4)
          .join(" | ")
        : "";

    if (calendarsFound === 0) {
      return "Calendar sync finished, but no active calendar feeds were found. Add an iCal URL to the property, save calendars, then sync again.";
    }

    const parts = [`Calendar sync finished${errors > 0 ? " with issues" : ""}: ${calendarsFound} active feed${calendarsFound === 1 ? "" : "s"}`];
    parts.push(`${created} job${created === 1 ? "" : "s"} created`);
    parts.push(`${skippedExisting} existing, ${skippedPast} past, ${skippedNonBooking} blocked/non-booking skipped`);
    parts.push(`${bookingEventsSaved} booking history saved, ${removedMissingFuture} missing future removed`);

    if (propertySummaries) {
      parts.push(propertySummaries);
    }

    if (errors > 0) {
      parts.push(`${errors} issue${errors === 1 ? "" : "s"} found`);
      if (resultIssueSummaries.length > 0) {
        parts.push(`First issue: ${resultIssueSummaries[0]}`);
      }
    }

    return `${parts.join(". ")}.`;
  }
  async function handleResetOrganization() {
    if (resetConfirmText.trim().toUpperCase() !== "WIPE ALL DATA") {
      return;
    }

    if (!currentOrganizationId) {
      setError("No organization selected.");
      return;
    }

    const confirmed = window.confirm(
      "This will permanently delete all data for the current organization. This cannot be undone."
    );
    if (!confirmed) return;

    setError("");
    setActionMessage("");
    setResettingOrganization(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Could not verify your admin session.");
      }

      const response = await fetch("/api/admin/reset-organization", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          organizationId: currentOrganizationId,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Reset failed.");
      }

      setActionMessage(payload?.message || "Reset request completed.");
      setResetConfirmText("");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Reset failed.");
    } finally {
      setResettingOrganization(false);
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
        offer_email_sent_at: null,
        offer_reminder_sent_at: null,
        day_of_reminder_sent_at: null,
      })
      .eq("id", slot.id);

    if (error) {
      setError(error.message);
      setReassigningJobId(null);
      return;
    }

    const notifyResult = await notifyJobOffers("cleaner", [slot.id]);
    setActionMessage(
      notifyResult.errors.length > 0
        ? "Stranded job reassigned. Offer email notification needs attention."
        : notifyResult.sent > 0
          ? `Stranded job reassigned. ${notifyResult.sent} offer email${notifyResult.sent === 1 ? "" : "s"} sent.`
          : "Stranded job reassigned."
    );
    await loadData();
    setReassigningJobId(null);
  }

  function getNextOpenSlot(jobId: string) {
    return jobSlots
      .filter((x) => x.job_id === jobId)
      .sort((a, b) => a.slot_number - b.slot_number)
      .find((x) => x.status !== "accepted");
  }
  async function deleteJob(jobId: string) {
    const confirmed = window.confirm("Delete this job? This cannot be undone.");
    if (!confirmed) return;

    setError("");
    setActionMessage("");

    const { error } = await supabase
      .from("turnover_jobs")
      .delete()
      .eq("id", jobId);

    if (error) {
      setError(error.message);
      alert(error.message);
      return;
    }

    setActionMessage("Job deleted.");
    await loadData();
  }
  async function reassignOpenJob(jobId: string) {
    const cleanerAccountId = reassignSelections[jobId];
    if (!cleanerAccountId) {
      setError("Please select a cleaner account before reassigning.");
      return;
    }
    async function deleteJob(jobId: string) {
      const confirmDelete = confirm("Delete this job? This cannot be undone.");
      if (!confirmDelete) return;

      setError("");
      setActionMessage("");

      const { error } = await supabase
        .from("turnover_jobs")
        .delete()
        .eq("id", jobId);

      if (error) {
        setError(error.message);
        return;
      }

      setActionMessage("Job deleted.");
      await loadData();
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
        offer_email_sent_at: null,
        offer_reminder_sent_at: null,
        day_of_reminder_sent_at: null,
      })
      .eq("id", slot.id);

    if (error) {
      setError(error.message);
      setReassigningJobId(null);
      return;
    }

    const notifyResult = await notifyJobOffers("cleaner", [slot.id]);
    setActionMessage(
      notifyResult.errors.length > 0
        ? "Job reassigned. Offer email notification needs attention."
        : notifyResult.sent > 0
          ? `Job reassigned. ${notifyResult.sent} offer email${notifyResult.sent === 1 ? "" : "s"} sent.`
          : "Job reassigned."
    );
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
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Could not verify your admin session.");
      }

      const response = await fetch("/api/admin/delete-cleaner-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
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
  async function inviteGroundsFromForm() {
    if (!inviteGroundsEmail.trim()) {
      setError("Grounds email is required to send an invite.");
      return;
    }

    const invite = await createOrganizationInvite({
      email: inviteGroundsEmail,
      fullName: inviteGroundsName || undefined,
      phone: inviteGroundsPhone || undefined,
      role: "grounds",
    });

    if (!invite) return;

    setInviteGroundsName("");
    setInviteGroundsEmail("");
    setInviteGroundsPhone("");
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
        organization_id: currentOrganizationId,
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

    if (!groundsJobScheduledFor) {
      setError(jobMode === "recurring" ? "Select a start date for the recurring grounds job." : "Select a date for the grounds job.");
      return;
    }

    setError("");
    setActionMessage("");

    const unitsNeeded = Number(groundsJobUnitsNeeded || "1");

    if (jobMode === "recurring") {
      const startDate = new Date(`${groundsJobScheduledFor}T12:00:00`);
      const dayOfWeek = Number.isNaN(startDate.getTime()) ? null : startDate.getDay();
      const dayOfMonth = Number.isNaN(startDate.getTime()) ? null : startDate.getDate();

      const recurringPayload = {
        organization_id: currentOrganizationId,
        property_id: groundsJobPropertyId,
        task_type: groundsJobType,
        label: null,
        notes: groundsJobNotes.trim() || null,
        frequency_type: recurringType,
        interval_days: null,
        day_of_week: recurringType === "weekly" || recurringType === "biweekly" ? dayOfWeek : null,
        day_of_month: recurringType === "monthly" ? dayOfMonth : null,
        semi_monthly_day_1: recurringType === "semi_monthly" ? dayOfMonth : null,
        semi_monthly_day_2: recurringType === "semi_monthly" ? Math.min((dayOfMonth || 1) + 14, 28) : null,
        anchor_date: recurringType === "weekly" || recurringType === "biweekly" ? groundsJobScheduledFor : null,
        start_date: groundsJobScheduledFor,
        end_date: null,
        next_run_date: groundsJobScheduledFor,
        grounds_units_needed: unitsNeeded,
        grounds_units_required_strict: groundsJobUnitsStrict,
        show_team_status_to_grounds: groundsJobShowTeamStatus,
        needs_secure_access: groundsJobNeedsSecureAccess,
        needs_garage_access: groundsJobNeedsGarageAccess,
        active: true,
      };

      const { error: recurringError } = await supabase
        .from("property_grounds_recurring_rules")
        .insert(recurringPayload);

      if (recurringError) {
        setError(recurringError.message || "Could not create recurring grounds rule.");
        return;
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
      setJobMode("single");
      setRecurringType("weekly");
      setActionMessage("Recurring grounds rule created.");
      await loadData();
      return;
    }

    const propertyAssignments = groundsAssignments
      .filter((assignment) => assignment.property_id === groundsJobPropertyId)
      .sort((a, b) => a.priority - b.priority);

    const assignedAccounts = propertyAssignments.slice(0, unitsNeeded);
    const staffingStatus = getGroundsJobStaffingStatus(unitsNeeded, assignedAccounts.length);
    const initialStatus = assignedAccounts.length > 0 ? "offered" : "open";

    const payload = {
      organization_id: currentOrganizationId,
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

      const { data: insertedSlots, error: slotError } = await supabase
        .from("grounds_job_slots")
        .insert(slotRows)
        .select("id");

      if (slotError) {
        setError(`Grounds job created, but slot creation failed: ${slotError.message}`);
        await loadData();
        return;
      }

      const notifyResult = await notifyJobOffers(
        "grounds",
        (insertedSlots ?? []).map((slot) => slot.id)
      );

      if (notifyResult.errors.length > 0) {
        setActionMessage("Grounds job created. Offer email notification needs attention.");
      } else if (notifyResult.sent > 0) {
        setActionMessage(
          `Grounds job created. ${notifyResult.sent} offer email${notifyResult.sent === 1 ? "" : "s"} sent.`
        );
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
    setJobMode("single");
    setRecurringType("weekly");
    if (assignedAccounts.length === 0) {
      setActionMessage("Grounds job created.");
    }
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
  async function saveSelectedPropertyOwner() {
    if (!selectedPropertyId) return;

    const trimmedEmail = selectedPropertyOwnerEmail.trim().toLowerCase();
    const trimmedName = selectedPropertyOwnerName.trim();

    setError("");
    setActionMessage("");
    setSavingSelectedPropertyOwner(true);

    try {
      const existingAccess = ownerPropertyAccess.find(
        (row) => row.property_id === selectedPropertyId
      );

      if (!trimmedEmail) {
        if (existingAccess) {
          const { error } = await supabase
            .from("owner_property_access")
            .delete()
            .eq("id", existingAccess.id);

          if (error) throw error;
        }

        setActionMessage("Owner link removed from property.");
        await loadData();
        return;
      }

      let ownerAccountId: string | null = null;

      const existingOwner = ownerAccounts.find(
        (owner) => owner.email.trim().toLowerCase() === trimmedEmail
      );

      if (existingOwner) {
        ownerAccountId = existingOwner.id;

        const updates: Record<string, any> = {};
        if (trimmedName && trimmedName !== (existingOwner.full_name || "")) {
          updates.full_name = trimmedName;
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateOwnerError } = await supabase
            .from("owner_accounts")
            .update(updates)
            .eq("id", existingOwner.id);

          if (updateOwnerError) throw updateOwnerError;
        }
      } else {
        const { data: insertedOwner, error: insertOwnerError } = await supabase
          .from("owner_accounts")
          .insert({
            organization_id: currentOrganizationId,
            email: trimmedEmail,
            full_name: trimmedName || null,
            is_active: true,
          })
          .select()
          .single();

        if (insertOwnerError || !insertedOwner) {
          throw new Error(insertOwnerError?.message || "Could not create owner account.");
        }

        ownerAccountId = insertedOwner.id;
      }

      if (!ownerAccountId) {
        throw new Error("Could not determine owner account.");
      }

      if (existingAccess) {
        const { error: updateAccessError } = await supabase
          .from("owner_property_access")
          .update({
            owner_account_id: ownerAccountId,
          })
          .eq("id", existingAccess.id);

        if (updateAccessError) throw updateAccessError;
      } else {
        const { error: insertAccessError } = await supabase
          .from("owner_property_access")
          .insert({
            owner_account_id: ownerAccountId,
            property_id: selectedPropertyId,
          });

        if (insertAccessError) throw insertAccessError;
      }
      setSelectedPropertyOwnerDirty(false);
      setActionMessage("Owner saved for property.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not save owner for property.");
    } finally {
      setSavingSelectedPropertyOwner(false);
    }
  }

  async function uploadSelectedPropertyCoverPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    e.target.value = "";

    if (!selectedPropertyId) {
      setError("Please select a property first.");
      setPropertyCoverError("Please select a property first.");
      return;
    }

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file for the cover photo.");
      setPropertyCoverError("Please choose an image file for the cover photo.");
      return;
    }

    setError("");
    setActionMessage("");
    setPropertyCoverError("");
    setPropertyCoverMessage("Uploading cover photo...");
    setUploadingPropertyCover(true);

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${selectedPropertyId}/cover/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("property-sop-images")
        .upload(filePath, file, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("property-sop-images").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("properties")
        .update({
          cover_photo_url: publicUrl,
        })
        .eq("id", selectedPropertyId);

      if (updateError) throw updateError;

      setProperties((prev) =>
        prev.map((property) =>
          property.id === selectedPropertyId
            ? { ...property, cover_photo_url: publicUrl }
            : property
        )
      );
      setPropertyCoverMessage("Cover photo uploaded.");
      setActionMessage("Property cover photo updated.");
      await loadData();
    } catch (err: any) {
      const message = err?.message || "Could not upload property cover photo.";
      const helpfulMessage = message.includes("cover_photo_url")
        ? `${message} Run supabase/add_property_cover_photo.sql in Supabase, then try again.`
        : message;
      setPropertyCoverError(helpfulMessage);
      setPropertyCoverMessage("");
      setError(helpfulMessage);
    } finally {
      setUploadingPropertyCover(false);
    }
  }

  async function removeSelectedPropertyCoverPhoto() {
    if (!selectedPropertyId) return;

    const confirmed = window.confirm("Remove this property's cover photo?");
    if (!confirmed) return;

    setError("");
    setActionMessage("");
    setPropertyCoverError("");
    setPropertyCoverMessage("Removing cover photo...");
    setUploadingPropertyCover(true);

    try {
      const { error } = await supabase
        .from("properties")
        .update({
          cover_photo_url: null,
        })
        .eq("id", selectedPropertyId);

      if (error) throw error;

      setProperties((prev) =>
        prev.map((property) =>
          property.id === selectedPropertyId
            ? { ...property, cover_photo_url: null }
            : property
        )
      );
      setPropertyCoverMessage("Cover photo removed.");
      setActionMessage("Property cover photo removed.");
      await loadData();
    } catch (err: any) {
      const message = err?.message || "Could not remove property cover photo.";
      setPropertyCoverError(message);
      setPropertyCoverMessage("");
      setError(message);
    } finally {
      setUploadingPropertyCover(false);
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
          source: row.source.trim().toLowerCase(),
          ical_url: row.ical_url.trim(),
          is_active: row.is_active,
        }))
        .filter((row) => row.source || row.ical_url);

      for (const row of normalizedRows) {
        if (!row.source) {
          throw new Error("Each calendar row needs a source.");
        }
        if (!PROPERTY_CALENDAR_SOURCE_OPTIONS.some((option) => option.value === row.source)) {
          throw new Error("Calendar source must be Airbnb or VRBO.");
        }
        if (!row.ical_url) {
          throw new Error(`Calendar URL is missing for ${getCalendarSourceLabel(row.source)}.`);
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
      setActionMessage(`Calendars saved. ${normalizedRows.length} feed${normalizedRows.length === 1 ? "" : "s"} configured, ${activeCount} active. Run "Sync Now" to create cleaning jobs from future checkouts.`);
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not save calendars.");
    } finally {
      setSavingCalendars(false);
    }
  }

  async function importBookingHistory(file: File | null) {
    if (!selectedPropertyId) {
      setError("Please select a property first.");
      return;
    }

    if (!file) {
      setError("Please choose a CSV file to import.");
      return;
    }

    setError("");
    setActionMessage("");
    setImportingBookingHistory(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Could not verify your admin session.");
      }

      const formData = new FormData();
      formData.append("propertyId", selectedPropertyId);
      formData.append("file", file);

      const response = await fetch("/api/admin/import-booking-history", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Could not import booking history.");
      }

      setActionMessage(
        `Imported ${payload?.imported || 0} booking histor${payload?.imported === 1 ? "y row" : "y rows"} for ${payload?.propertyName || "this property"}.`
      );
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not import booking history.");
    } finally {
      setImportingBookingHistory(false);
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

  async function uploadDocumentVaultFiles() {
    if (!currentOrganizationId) {
      setError("No organization selected.");
      return;
    }

    if (documentVaultFiles.length === 0) {
      setError("Choose at least one document to upload.");
      return;
    }

    setError("");
    setActionMessage("");
    setUploadingDocumentVaultFiles(true);

    try {
      for (let i = 0; i < documentVaultFiles.length; i++) {
        const file = documentVaultFiles[i];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const propertySegment = documentVaultPropertyId === "all" ? "organization" : documentVaultPropertyId;
        const filePath = `${currentOrganizationId}/${propertySegment}/${Date.now()}-${i}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("document-vault")
          .upload(filePath, file, { cacheControl: "3600", upsert: false });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        const { error: insertError } = await supabase.from("document_vault_files").insert({
          organization_id: currentOrganizationId,
          property_id: documentVaultPropertyId === "all" ? null : documentVaultPropertyId,
          title: documentVaultTitle.trim() || file.name.replace(/\.[^.]+$/, ""),
          category: documentVaultCategory,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || null,
          storage_path: filePath,
          created_by_profile_id: currentAdminUserId,
        });

        if (insertError) {
          await supabase.storage.from("document-vault").remove([filePath]);
          throw new Error(insertError.message);
        }
      }

      setDocumentVaultTitle("");
      setDocumentVaultFiles([]);
      setActionMessage(`${documentVaultFiles.length} document${documentVaultFiles.length === 1 ? "" : "s"} uploaded.`);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err, "Could not upload document. Run the document vault SQL first if the table or bucket is missing."));
    } finally {
      setUploadingDocumentVaultFiles(false);
    }
  }

  async function openDocumentVaultFile(document: DocumentVaultRow) {
    setOpeningDocumentVaultId(document.id);
    setError("");

    try {
      const { data, error } = await supabase.storage
        .from("document-vault")
        .createSignedUrl(document.storage_path, 10 * 60, {
          download: document.file_name,
        });

      if (error || !data?.signedUrl) {
        throw new Error(error?.message || "Could not create download link.");
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(getErrorMessage(err, "Could not open this document."));
    } finally {
      setOpeningDocumentVaultId(null);
    }
  }

  async function deleteDocumentVaultFile(document: DocumentVaultRow) {
    const confirmed = window.confirm(`Delete ${document.title || document.file_name}? This removes it from the document vault.`);
    if (!confirmed) return;

    setDeletingDocumentVaultId(document.id);
    setError("");
    setActionMessage("");

    try {
      const { error: deleteError } = await supabase
        .from("document_vault_files")
        .delete()
        .eq("id", document.id);

      if (deleteError) throw deleteError;

      await supabase.storage.from("document-vault").remove([document.storage_path]);
      setDocumentVaultRows((rows) => rows.filter((row) => row.id !== document.id));
      setActionMessage("Document deleted.");
    } catch (err) {
      setError(getErrorMessage(err, "Could not delete document."));
    } finally {
      setDeletingDocumentVaultId(null);
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

  function formatFileSize(bytes?: number | null) {
    if (!bytes || bytes <= 0) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
    return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
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
        organization_id: currentOrganizationId,
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

  const teamAvailabilityRows = useMemo(() => {
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + 14);
    const windowEndYmd = toYmd(windowEnd);
    const rows: Array<{
      id: string;
      kind: "Cleaner" | "Grounds";
      name: string;
      members: string;
      active: boolean;
      todayCount: number;
      upcomingCount: number;
      pendingOffers: number;
      nextJobDate: string | null;
      status: "Available" | "Busy today" | "Booked soon" | "Needs response" | "Inactive";
      tone: string;
    }> = [];

    for (const account of cleanerAccounts) {
      const accountSlots = jobSlots.filter((slot) => slot.cleaner_account_id === account.id);
      const relevantSlots = accountSlots.filter((slot) => {
        const job = jobs.find((entry) => entry.id === slot.job_id);
        const jobDate = job?.scheduled_for || extractCheckoutDate(job?.notes || null);
        return !!jobDate && jobDate >= todayYmd && jobDate <= windowEndYmd && slot.status !== "declined";
      });
      const dates = relevantSlots
        .map((slot) => {
          const job = jobs.find((entry) => entry.id === slot.job_id);
          return job?.scheduled_for || extractCheckoutDate(job?.notes || null);
        })
        .filter((value): value is string => !!value)
        .sort();
      const todayCount = dates.filter((date) => date === todayYmd).length;
      const pendingOffers = relevantSlots.filter((slot) => slot.status === "offered").length;
      const members = cleanerMembersByAccountId[account.id] ?? [];
      let status: "Available" | "Busy today" | "Booked soon" | "Needs response" | "Inactive" = "Available";
      if (account.active === false) status = "Inactive";
      else if (pendingOffers > 0) status = "Needs response";
      else if (todayCount > 0) status = "Busy today";
      else if (dates.length > 0) status = "Booked soon";

      rows.push({
        id: `cleaner-${account.id}`,
        kind: "Cleaner",
        name: account.display_name || account.email || "Cleaner account",
        members: members.length ? members.map((member) => member.full_name || member.email || member.id).join(", ") : account.email || "No linked members",
        active: account.active !== false,
        todayCount,
        upcomingCount: dates.length,
        pendingOffers,
        nextJobDate: dates[0] || null,
        status,
        tone:
          status === "Available"
            ? "border-[#bbdfc0] bg-[#f0fbf2] text-[#236b30]"
            : status === "Needs response"
              ? "border-[#f0b4b4] bg-[#fff5f5] text-[#8a2e22]"
              : status === "Inactive"
                ? "border-[#d8c7ab] bg-[#f6f2eb] text-[#6f6255]"
                : "border-[#f1cf8f] bg-[#fff8e8] text-[#8a6112]",
      });
    }

    for (const account of groundsAccounts) {
      const accountSlots = groundsJobSlots.filter((slot) => slot.grounds_account_id === account.id);
      const relevantSlots = accountSlots.filter((slot) => {
        const job = groundsJobs.find((entry) => entry.id === slot.job_id);
        const jobDate = job?.scheduled_for || null;
        return !!jobDate && jobDate >= todayYmd && jobDate <= windowEndYmd && slot.status !== "declined";
      });
      const dates = relevantSlots
        .map((slot) => groundsJobs.find((entry) => entry.id === slot.job_id)?.scheduled_for || null)
        .filter((value): value is string => !!value)
        .sort();
      const todayCount = dates.filter((date) => date === todayYmd).length;
      const pendingOffers = relevantSlots.filter((slot) => slot.status === "offered").length;
      const members = groundsMembersByAccountId[account.id] ?? [];
      let status: "Available" | "Busy today" | "Booked soon" | "Needs response" | "Inactive" = "Available";
      if (account.active === false) status = "Inactive";
      else if (pendingOffers > 0) status = "Needs response";
      else if (todayCount > 0) status = "Busy today";
      else if (dates.length > 0) status = "Booked soon";

      rows.push({
        id: `grounds-${account.id}`,
        kind: "Grounds",
        name: account.display_name || account.email || "Grounds account",
        members: members.length ? members.map((member) => member.full_name || member.email || member.id).join(", ") : account.email || "No linked members",
        active: account.active !== false,
        todayCount,
        upcomingCount: dates.length,
        pendingOffers,
        nextJobDate: dates[0] || null,
        status,
        tone:
          status === "Available"
            ? "border-[#bbdfc0] bg-[#f0fbf2] text-[#236b30]"
            : status === "Needs response"
              ? "border-[#f0b4b4] bg-[#fff5f5] text-[#8a2e22]"
              : status === "Inactive"
                ? "border-[#d8c7ab] bg-[#f6f2eb] text-[#6f6255]"
                : "border-[#f1cf8f] bg-[#fff8e8] text-[#8a6112]",
      });
    }

    return rows.sort((a, b) => {
      const order = ["Needs response", "Busy today", "Booked soon", "Available", "Inactive"];
      const statusDiff = order.indexOf(a.status) - order.indexOf(b.status);
      if (statusDiff !== 0) return statusDiff;
      return a.name.localeCompare(b.name);
    });
  }, [
    cleanerAccounts,
    groundsAccounts,
    jobSlots,
    groundsJobSlots,
    jobs,
    groundsJobs,
    todayYmd,
    now,
    cleanerMembersByAccountId,
    groundsMembersByAccountId,
  ]);

  const teamAvailabilityStats = useMemo(() => {
    const available = teamAvailabilityRows.filter((row) => row.status === "Available").length;
    const busyToday = teamAvailabilityRows.filter((row) => row.status === "Busy today").length;
    const needsResponse = teamAvailabilityRows.filter((row) => row.status === "Needs response").length;
    const bookedSoon = teamAvailabilityRows.filter((row) => row.status === "Booked soon").length;

    return {
      total: teamAvailabilityRows.length,
      available,
      busyToday,
      needsResponse,
      bookedSoon,
    };
  }, [teamAvailabilityRows]);

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
    setJobWorkflowTab(type === "waiting" ? "active" : "exceptions");

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

  const jobReliabilityRows = useMemo(() => {
    const rows: Array<{
      id: string;
      kind: "Cleaner" | "Grounds";
      kindApi: "cleaner" | "grounds";
      slotId: string;
      propertyName: string;
      accountName: string;
      scheduledFor: string | null | undefined;
      status: string;
      notificationLabel: string;
      notificationTone: string;
      offeredAt?: string | null;
      expiresAt?: string | null;
      acceptedAt?: string | null;
      declinedAt?: string | null;
      overdue: boolean;
    }> = [];

    for (const job of jobs) {
      if (selectedJobsPropertyFilter !== "all" && job.property_id !== selectedJobsPropertyFilter) continue;
      const slots = jobSlotsByJobId[job.id] ?? [];
      for (const slot of slots) {
        const expiresAt = slot.expires_at ? new Date(slot.expires_at) : null;
        rows.push({
          id: `cleaner-${slot.id}`,
          kind: "Cleaner",
          kindApi: "cleaner",
          slotId: slot.id,
          propertyName: getPropertyName(job.property_id),
          accountName: getCleanerAccountName(slot.cleaner_account_id),
          scheduledFor: job.scheduled_for || extractCheckoutDate(job.notes),
          status: slot.status,
          notificationLabel: getJobNotificationLabel(slot),
          notificationTone: getJobNotificationTone(slot),
          offeredAt: slot.offered_at,
          expiresAt: slot.expires_at,
          acceptedAt: slot.accepted_at,
          declinedAt: slot.declined_at,
          overdue: slot.status === "offered" && !!expiresAt && expiresAt.getTime() < now.getTime(),
        });
      }
    }

    for (const job of groundsJobs) {
      if (selectedJobsPropertyFilter !== "all" && job.property_id !== selectedJobsPropertyFilter) continue;
      const slots = groundsJobSlotsByJobId[job.id] ?? [];
      for (const slot of slots) {
        const expiresAt = slot.expires_at ? new Date(slot.expires_at) : null;
        rows.push({
          id: `grounds-${slot.id}`,
          kind: "Grounds",
          kindApi: "grounds",
          slotId: slot.id,
          propertyName: getPropertyName(job.property_id),
          accountName: getGroundsAccountName(slot.grounds_account_id),
          scheduledFor: job.scheduled_for,
          status: slot.status,
          notificationLabel: getJobNotificationLabel(slot),
          notificationTone: getJobNotificationTone(slot),
          offeredAt: slot.offered_at,
          expiresAt: slot.expires_at,
          acceptedAt: slot.accepted_at,
          declinedAt: slot.declined_at,
          overdue: slot.status === "offered" && !!expiresAt && expiresAt.getTime() < now.getTime(),
        });
      }
    }

    return rows.sort((a, b) => {
      const aNeedsAttention = (a.status === "offered" && !a.notificationLabel.includes("sent")) || a.overdue || a.status === "declined";
      const bNeedsAttention = (b.status === "offered" && !b.notificationLabel.includes("sent")) || b.overdue || b.status === "declined";
      if (aNeedsAttention !== bNeedsAttention) return aNeedsAttention ? -1 : 1;
      return new Date(b.offeredAt || b.acceptedAt || b.declinedAt || 0).getTime() - new Date(a.offeredAt || a.acceptedAt || a.declinedAt || 0).getTime();
    });
  }, [jobs, groundsJobs, selectedJobsPropertyFilter, jobSlotsByJobId, groundsJobSlotsByJobId, now]);

  const jobReliabilityStats = useMemo(() => {
    const total = jobReliabilityRows.length;
    const accepted = jobReliabilityRows.filter((row) => row.status === "accepted").length;
    const waiting = jobReliabilityRows.filter((row) => row.status === "offered").length;
    const overdue = jobReliabilityRows.filter((row) => row.overdue).length;
    const declined = jobReliabilityRows.filter((row) => row.status === "declined").length;
    const emailPending = jobReliabilityRows.filter(
      (row) => row.status === "offered" && row.notificationLabel === "Offer email pending"
    ).length;

    return {
      total,
      accepted,
      waiting,
      overdue,
      declined,
      emailPending,
      acceptedRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
    };
  }, [jobReliabilityRows]);

  const failedNotificationRows = useMemo(
    () =>
      jobReliabilityRows.filter(
        (row) =>
          row.status === "offered" &&
          (row.notificationLabel === "Offer email pending" || row.overdue)
      ),
    [jobReliabilityRows]
  );

  const failedNotificationStats = useMemo(() => {
    const overdue = failedNotificationRows.filter((row) => row.overdue).length;
    const cleaner = failedNotificationRows.filter((row) => row.kindApi === "cleaner").length;
    const grounds = failedNotificationRows.filter((row) => row.kindApi === "grounds").length;

    return {
      total: failedNotificationRows.length,
      overdue,
      cleaner,
      grounds,
    };
  }, [failedNotificationRows]);

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


  const todayAtGlanceItems = useMemo(() => {
    const propertyById = new Map(properties.map((property) => [property.id, property]));

    const cleaningItems = jobs
      .filter((job) => {
        const jobDate = job.scheduled_for || extractCheckoutDate(job.notes);
        return jobDate === todayYmd;
      })
      .map((job) => {
        const property = propertyById.get(job.property_id) || null;
        const slots = jobSlotsByJobId[job.id] ?? [];
        const waiting = slots.some((slot) => slot.status === "offered" || slot.status === "stranded");
        return {
          id: `cleaning-${job.id}`,
          date: todayYmd,
          sortDate: `${todayYmd}T09:00:00`,
          kind: "Cleaning",
          title: "Cleaning",
          propertyName: property?.name || getPropertyName(job.property_id),
          city: getCityFromAddress(property?.address),
          status: waiting ? "Waiting" : job.status || "Scheduled",
        };
      });

    const groundsItems = groundsJobs
      .filter((job) => job.scheduled_for === todayYmd)
      .map((job) => {
        const property = propertyById.get(job.property_id) || null;
        const slots = groundsJobSlots.filter((slot) => slot.job_id === job.id);
        return {
          id: `grounds-${job.id}`,
          date: todayYmd,
          sortDate: `${todayYmd}T12:00:00`,
          kind: "Grounds",
          title:
            GROUNDS_JOB_TYPE_OPTIONS.find((option) => option.value === job.job_type)?.label ||
            job.job_type ||
            "Grounds job",
          propertyName: property?.name || getPropertyName(job.property_id),
          city: getCityFromAddress(property?.address),
          status: getGroundsJobDisplayStatus(job, slots),
        };
      });

    return [...cleaningItems, ...groundsItems].sort((a, b) =>
      a.sortDate.localeCompare(b.sortDate) || a.propertyName.localeCompare(b.propertyName)
    );
  }, [jobs, groundsJobs, properties, todayYmd, jobSlotsByJobId, groundsJobSlots]);

  const occupiedTodayProperties = useMemo(() => {
    const propertyById = new Map(properties.map((property) => [property.id, property]));
    return propertyBookingEvents
      .filter((event) => event.checkin_date <= todayYmd && event.checkout_date > todayYmd)
      .map((event) => {
        const property = propertyById.get(event.property_id) || null;
        return {
          id: event.id,
          propertyName: property?.name || property?.address || "Unknown property",
          city: getCityFromAddress(property?.address),
          source: getBookingSourceLabel(event.source),
          summary: event.summary || "Reserved",
          guestCount: Number.isFinite(Number(event.guest_count)) ? Number(event.guest_count) : null,
          checkinDate: event.checkin_date,
          checkoutDate: event.checkout_date,
        };
      })
      .sort((a, b) => a.checkoutDate.localeCompare(b.checkoutDate) || a.propertyName.localeCompare(b.propertyName));
  }, [properties, propertyBookingEvents, todayYmd]);

  const todayAtGlanceCounts = useMemo(() => {
    return {
      cleaning: todayAtGlanceItems.filter((item) => item.kind === "Cleaning").length,
      grounds: todayAtGlanceItems.filter((item) => item.kind === "Grounds").length,
      occupied: occupiedTodayProperties.length,
      waiting: waitingJobs.length,
      overdue: overdueWaitingJobs.length,
      flags: openMaintenanceFlags.length,
    };
  }, [todayAtGlanceItems, occupiedTodayProperties.length, waitingJobs.length, overdueWaitingJobs.length, openMaintenanceFlags.length]);


  const resolvedMaintenanceFlags = useMemo(
    () =>
      filteredMaintenanceFlags.filter((flag) => {
        const stateLower = String(getMaintenanceFlagState(flag) || "").toLowerCase();
        return stateLower.includes("resolved") || stateLower.includes("closed") || stateLower.includes("done");
      }),
    [filteredMaintenanceFlags]
  );

  const recentlyAcceptedInvites = useMemo(() => {
    const cutoffMs = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const acceptedTeamInvites = organizationInvites
      .filter((invite) => invite.accepted_at && new Date(invite.accepted_at).getTime() >= cutoffMs)
      .map((invite) => ({
        id: invite.id,
        label: `${invite.full_name || invite.email} accepted ${invite.role} invite`,
        acceptedAt: invite.accepted_at || "",
      }));

    const acceptedOwnerInvites = ownerAccounts
      .filter((owner) => owner.invite_accepted_at && new Date(owner.invite_accepted_at).getTime() >= cutoffMs)
      .map((owner) => ({
        id: owner.id,
        label: `${owner.full_name || owner.email} accepted owner invite`,
        acceptedAt: owner.invite_accepted_at || "",
      }));

    return [...acceptedTeamInvites, ...acceptedOwnerInvites].sort((a, b) =>
      b.acceptedAt.localeCompare(a.acceptedAt)
    );
  }, [organizationInvites, ownerAccounts]);

  const invitationStatusRows = useMemo(() => {
    const teamRows = organizationInvites.map((invite) => {
      const status = invite.accepted_at
        ? "accepted"
        : invite.status === "revoked"
          ? "revoked"
          : invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()
            ? "expired"
            : invite.status || "sent";

      return {
        id: `team-${invite.id}`,
        sourceId: invite.id,
        kind: "team" as const,
        name: invite.full_name || invite.email,
        email: invite.email,
        role: invite.role,
        status,
        sentAt: invite.sent_at || invite.created_at || null,
        acceptedAt: invite.accepted_at || null,
        expiresAt: invite.expires_at || null,
        canRevoke: !invite.accepted_at && (invite.status === "pending" || invite.status === "sent" || !invite.status),
      };
    });

    const ownerRows = ownerAccounts
      .filter((owner) => owner.invite_sent_at || owner.invite_accepted_at)
      .map((owner) => ({
        id: `owner-${owner.id}`,
        sourceId: owner.id,
        kind: "owner" as const,
        name: owner.full_name || owner.email,
        email: owner.email,
        role: "owner" as const,
        status: owner.invite_accepted_at ? "accepted" : "sent",
        sentAt: owner.invite_sent_at || null,
        acceptedAt: owner.invite_accepted_at || null,
        expiresAt: null,
        canRevoke: false,
      }));

    return [...teamRows, ...ownerRows].sort((a, b) => {
      const aDate = a.acceptedAt || a.sentAt || "";
      const bDate = b.acceptedAt || b.sentAt || "";
      return bDate.localeCompare(aDate);
    });
  }, [organizationInvites, ownerAccounts]);

  const filteredDocumentVaultRows = useMemo(
    () =>
      documentVaultPropertyId === "all"
        ? documentVaultRows
        : documentVaultRows.filter((document) => document.property_id === documentVaultPropertyId),
    [documentVaultRows, documentVaultPropertyId]
  );

  const documentVaultStats = useMemo(() => {
    const totalSize = documentVaultRows.reduce((sum, document) => sum + (document.file_size || 0), 0);
    const propertyLinked = documentVaultRows.filter((document) => !!document.property_id).length;
    const categories = new Set(documentVaultRows.map((document) => document.category || "General"));

    return {
      total: documentVaultRows.length,
      propertyLinked,
      categories: categories.size,
      totalSize,
    };
  }, [documentVaultRows]);

  const propertyHealthRows = useMemo(() => {
    return properties
      .map((property) => {
        const ownerAccess = ownerPropertyAccess.find((access) => access.property_id === property.id);
        const owner = ownerAccounts.find((account) => account.id === ownerAccess?.owner_account_id);
        const calendarCount = propertyCalendars.filter((calendar) => calendar.property_id === property.id).length;
        const cleanerAssignmentCount = assignments.filter((assignment) => assignment.property_id === property.id).length;
        const groundsAssignmentCount = groundsAssignments.filter((assignment) => assignment.property_id === property.id).length;
        const openFlags = maintenanceFlags.filter((flag) => {
          if (flag.property_id !== property.id) return false;
          const state = String(getMaintenanceFlagState(flag) || "").toLowerCase();
          return !(state.includes("resolved") || state.includes("closed") || state.includes("done"));
        });
        const urgentFlags = openFlags.filter((flag) => {
          const urgency = String(flag.urgency || flag.priority || flag.severity || "").toLowerCase();
          return urgency.includes("urgent") || urgency.includes("critical") || urgency.includes("high");
        });
        const strandedCount = strandedJobs.filter((job) => job.property_id === property.id).length;
        const accessReady = accessRows.some(
          (row) => row.property_id === property.id && (!!row.door_code || !!row.alarm_code || !!row.notes)
        );
        const hasInvoiceRates = propertyInvoiceRates.some((rate) => rate.property_id === property.id);
        const documentCount = documentVaultRows.filter((document) => document.property_id === property.id).length;
        const sopCount = sops.filter((sop) => sop.property_id === property.id).length;

        const issues: string[] = [];
        let score = 100;

        if (!owner) {
          score -= 20;
          issues.push("Owner not linked");
        } else if (!owner.invite_accepted_at) {
          score -= 8;
          issues.push("Owner invite not accepted");
        }

        if (calendarCount === 0) {
          score -= 20;
          issues.push("No booking calendar");
        }

        if (cleanerAssignmentCount === 0) {
          score -= 18;
          issues.push("No cleaner assignment");
        }

        if (groundsAssignmentCount === 0) {
          score -= 8;
          issues.push("No grounds assignment");
        }

        if (!accessReady) {
          score -= 8;
          issues.push("No access notes");
        }

        if (openFlags.length > 0) {
          score -= Math.min(20, openFlags.length * 7);
          issues.push(`${openFlags.length} open maintenance flag${openFlags.length === 1 ? "" : "s"}`);
        }

        if (urgentFlags.length > 0) {
          score -= 10;
          issues.push(`${urgentFlags.length} urgent flag${urgentFlags.length === 1 ? "" : "s"}`);
        }

        if (strandedCount > 0) {
          score -= Math.min(18, strandedCount * 9);
          issues.push(`${strandedCount} stranded job${strandedCount === 1 ? "" : "s"}`);
        }

        if (!hasInvoiceRates) {
          score -= 5;
          issues.push("Invoice rates not saved");
        }

        if (sopCount === 0) {
          score -= 4;
          issues.push("No SOP notes");
        }

        score = Math.max(0, Math.min(100, score));

        const status =
          score >= 85 ? "Healthy" :
          score >= 65 ? "Needs polish" :
          score >= 40 ? "Needs attention" :
          "At risk";

        const tone =
          score >= 85 ? "border-[#bbdfc0] bg-[#f0fbf2] text-[#236b30]" :
          score >= 65 ? "border-[#f1cf8f] bg-[#fff8e8] text-[#8a6112]" :
          score >= 40 ? "border-[#f0b4b4] bg-[#fff5f5] text-[#8a2e22]" :
          "border-[#ef4444] bg-[#fee2e2] text-[#991b1b]";

        return {
          id: property.id,
          property,
          score,
          status,
          tone,
          issues,
          ownerName: owner?.full_name || owner?.email || "No owner",
          calendarCount,
          cleanerAssignmentCount,
          groundsAssignmentCount,
          openFlagCount: openFlags.length,
          strandedCount,
          accessReady,
          hasInvoiceRates,
          documentCount,
          sopCount,
        };
      })
      .sort(
        (a, b) =>
          a.score - b.score ||
          (a.property.name || a.property.address || "").localeCompare(b.property.name || b.property.address || "")
      );
  }, [
    properties,
    ownerPropertyAccess,
    ownerAccounts,
    propertyCalendars,
    assignments,
    groundsAssignments,
    maintenanceFlags,
    strandedJobs,
    accessRows,
    propertyInvoiceRates,
    documentVaultRows,
    sops,
  ]);

  const propertyHealthStats = useMemo(() => {
    const average =
      propertyHealthRows.length > 0
        ? Math.round(propertyHealthRows.reduce((sum, row) => sum + row.score, 0) / propertyHealthRows.length)
        : 0;
    const atRisk = propertyHealthRows.filter((row) => row.score < 65).length;
    const healthy = propertyHealthRows.filter((row) => row.score >= 85).length;
    const topIssues = propertyHealthRows.reduce<Record<string, number>>((counts, row) => {
      for (const issue of row.issues.slice(0, 4)) {
        counts[issue] = (counts[issue] || 0) + 1;
      }
      return counts;
    }, {});

    return {
      average,
      atRisk,
      healthy,
      topIssues: Object.entries(topIssues)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4),
    };
  }, [propertyHealthRows]);

  const operationsAlerts = useMemo(() => {
    const alerts: Array<{
      key: string;
      label: string;
      tone: "amber" | "red" | "green";
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

  function getJobNotificationLabel(slot: JobSlot | GroundsJobSlot) {
    if (slot.status === "offered") {
      if (slot.offer_email_sent_at) return `Offer email sent ${formatDateTime(slot.offer_email_sent_at)}`;
      return "Offer email pending";
    }

    if (slot.status === "accepted") {
      if (slot.day_of_reminder_sent_at) return `Day-of reminder sent ${formatDateTime(slot.day_of_reminder_sent_at)}`;
      return "Day-of reminder pending";
    }

    if (slot.offer_reminder_sent_at) return `Reminder sent ${formatDateTime(slot.offer_reminder_sent_at)}`;
    return "No active email notice";
  }

  function getJobNotificationTone(slot: JobSlot | GroundsJobSlot) {
    if (slot.status === "offered" && !slot.offer_email_sent_at) {
      return "border-[#f0b4b4] bg-[#fff5f5] text-[#8a2e22]";
    }

    if (slot.offer_email_sent_at || slot.offer_reminder_sent_at || slot.day_of_reminder_sent_at) {
      return "border-[#bbdfc0] bg-[#f0fbf2] text-[#236b30]";
    }

    return "border-[#d8c7ab] bg-white text-[#6f6255]";
  }

  const menuGroups: Array<{
    label: string;
    items: Array<{
      key: AdminSection;
      label: string;
      hint: string;
      accent: string;
      activeClass: string;
    }>;
  }> = [
    {
      label: "Operations",
      items: [
        {
          key: "home",
          label: "Home",
          hint: "Daily snapshot",
          accent: "bg-[#3b82f6]",
          activeClass: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
        },
        {
          key: "notifications",
          label: "Notifications",
          hint: "Items needing action",
          accent: "bg-[#f97316]",
          activeClass: "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]",
        },
        {
          key: "calendar",
          label: "Calendar",
          hint: "Bookings and schedules",
          accent: "bg-[#14b8a6]",
          activeClass: "border-[#99f6e4] bg-[#ecfdf5] text-[#0f766e]",
        },
        {
          key: "chat",
          label: "Chat",
          hint: "In-app messages",
          accent: "bg-[#06b6d4]",
          activeClass: "border-[#a5f3fc] bg-[#ecfeff] text-[#0e7490]",
        },
        {
          key: "jobs",
          label: "Jobs",
          hint: "Cleaning and grounds work",
          accent: "bg-[#22c55e]",
          activeClass: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]",
        },
        {
          key: "maintenance",
          label: "Maintenance Flags",
          hint: "Open issues",
          accent: "bg-[#ef4444]",
          activeClass: "border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]",
        },
      ],
    },
    {
      label: "Billing",
      items: [
        {
          key: "invoices",
          label: "Invoices",
          hint: "Owner billing",
          accent: "bg-[#f59e0b]",
          activeClass: "border-[#fde68a] bg-[#fffbeb] text-[#b45309]",
        },
      ],
    },
    {
      label: "Properties",
      items: [
        {
          key: "properties",
          label: "Properties",
          hint: "Listings and setup",
          accent: "bg-[#0ea5e9]",
          activeClass: "border-[#bae6fd] bg-[#f0f9ff] text-[#0369a1]",
        },
        {
          key: "assignments",
          label: "Assignments",
          hint: "Cleaner and grounds coverage",
          accent: "bg-[#84cc16]",
          activeClass: "border-[#d9f99d] bg-[#f7fee7] text-[#4d7c0f]",
        },
        {
          key: "documents",
          label: "Documents",
          hint: "Vault and property files",
          accent: "bg-[#7c3aed]",
          activeClass: "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9]",
        },
        {
          key: "backup",
          label: "Backup",
          hint: "Exports and snapshots",
          accent: "bg-[#475569]",
          activeClass: "border-[#cbd5e1] bg-[#f8fafc] text-[#334155]",
        },
      ],
    },
    {
      label: "People",
      items: [
        {
          key: "cleanerAccounts",
          label: "Cleaner Accounts",
          hint: "Cleaner profiles",
          accent: "bg-[#10b981]",
          activeClass: "border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]",
        },
        {
          key: "groundsAccounts",
          label: "Grounds Accounts",
          hint: "Grounds profiles",
          accent: "bg-[#0f766e]",
          activeClass: "border-[#99f6e4] bg-[#f0fdfa] text-[#115e59]",
        },
        {
          key: "invites",
          label: "Invites",
          hint: "Invitation status",
          accent: "bg-[#8b5cf6]",
          activeClass: "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9]",
        },
        {
          key: "users",
          label: "Users",
          hint: "Admin access",
          accent: "bg-[#6366f1]",
          activeClass: "border-[#c7d2fe] bg-[#eef2ff] text-[#4338ca]",
        },
      ],
    },
  ];

  const defaultAdminMenuOrder = menuGroups.flatMap((group) => group.items.map((item) => item.key));
  const adminMenuItemsByKey = new Map(menuGroups.flatMap((group) => group.items.map((item) => [item.key, item] as const)));
  const orderedAdminMenuItems = [
    ...adminMenuOrder.filter((key) => adminMenuItemsByKey.has(key)),
    ...defaultAdminMenuOrder.filter((key) => !adminMenuOrder.includes(key)),
  ]
    .filter((key, index, keys) => keys.indexOf(key) === index)
    .map((key) => adminMenuItemsByKey.get(key))
    .filter(Boolean) as Array<(typeof menuGroups)[number]["items"][number]>;

  const unreadChatCount = useMemo(() => {
    if (!currentAdminUserId) return 0;

    return chatConversations.reduce((total, conversation) => {
      if (chatHiddenItems.some((item) => item.conversation_id === conversation.id && !item.message_id)) return total;

      const myParticipant = chatParticipants.find(
        (participant) =>
          participant.conversation_id === conversation.id &&
          participant.participant_profile_id === currentAdminUserId
      );
      const lastReadAt = myParticipant?.last_read_at ? new Date(myParticipant.last_read_at).getTime() : 0;
      if (Number.isNaN(lastReadAt)) return total;

      return (
        total +
        chatMessages.filter((message) => {
          if (message.conversation_id !== conversation.id) return false;
          if (chatHiddenItems.some((item) => item.message_id === message.id)) return false;
          if (message.sender_profile_id === currentAdminUserId) return false;
          const createdAt = message.created_at ? new Date(message.created_at).getTime() : 0;
          return createdAt > lastReadAt;
        }).length
      );
    }, 0);
  }, [chatConversations, chatHiddenItems, chatMessages, chatParticipants, currentAdminUserId]);

  const notificationCenterItems = useMemo(() => {
    const sentUnpaidInvoices = ownerInvoices.filter((invoice) => invoice.status === "sent");
    const runningDraftInvoices = ownerInvoices.filter((invoice) => invoice.status === "draft");
    const lowHealthProperties = propertyHealthRows.filter((row) => row.score < 65);

    const items: Array<{
      key: string;
      title: string;
      detail: string;
      count: number;
      tone: "red" | "amber" | "blue" | "green" | "purple";
      actionLabel: string;
      onClick: () => void;
    }> = [];

    if (unreadChatCount > 0) {
      items.push({
        key: "chat",
        title: "Unread chat messages",
        detail: "New in-app messages are waiting for admin review.",
        count: unreadChatCount,
        tone: "blue",
        actionLabel: "Open chat",
        onClick: () => setActiveSection("chat"),
      });
    }

    if (failedNotificationStats.total > 0) {
      items.push({
        key: "notification-queue",
        title: "Job emails need retry",
        detail: `${failedNotificationStats.overdue} overdue offer${failedNotificationStats.overdue === 1 ? "" : "s"} and ${failedNotificationStats.total} pending email${failedNotificationStats.total === 1 ? "" : "s"}.`,
        count: failedNotificationStats.total,
        tone: failedNotificationStats.overdue > 0 ? "red" : "amber",
        actionLabel: "Open queue",
        onClick: () => {
          setActiveSection("jobs");
          setJobWorkflowTab("notifications");
        },
      });
    }

    if (strandedJobs.length > 0) {
      items.push({
        key: "stranded-jobs",
        title: "Stranded jobs",
        detail: "Cleaning jobs need manual assignment or review.",
        count: strandedJobs.length,
        tone: "red",
        actionLabel: "Review jobs",
        onClick: () => jumpToJobs("stranded"),
      });
    }

    if (maintenanceFlagCounts.urgent > 0 || maintenanceFlagCounts.open > 0) {
      items.push({
        key: "maintenance",
        title: maintenanceFlagCounts.urgent > 0 ? "Urgent maintenance flags" : "Open maintenance flags",
        detail: `${maintenanceFlagCounts.open} open maintenance flag${maintenanceFlagCounts.open === 1 ? "" : "s"} across the workspace.`,
        count: maintenanceFlagCounts.urgent || maintenanceFlagCounts.open,
        tone: maintenanceFlagCounts.urgent > 0 ? "red" : "amber",
        actionLabel: "Open flags",
        onClick: () => setActiveSection("maintenance"),
      });
    }

    if (recentlyAcceptedInvites.length > 0) {
      items.push({
        key: "invites",
        title: "Recently accepted invites",
        detail: "New users accepted invitations and may need assignment or review.",
        count: recentlyAcceptedInvites.length,
        tone: "green",
        actionLabel: "Open invites",
        onClick: () => setActiveSection("invites"),
      });
    }

    if (sentUnpaidInvoices.length > 0) {
      items.push({
        key: "unpaid-invoices",
        title: "Sent unpaid invoices",
        detail: "Invoices have been sent and are still marked unpaid.",
        count: sentUnpaidInvoices.length,
        tone: "purple",
        actionLabel: "Open invoices",
        onClick: () => {
          setActiveSection("invoices");
          setInvoiceWorkflowTab("history");
        },
      });
    }

    if (runningDraftInvoices.length > 0) {
      items.push({
        key: "invoice-drafts",
        title: "Running invoice drafts",
        detail: "Draft invoices are being held for later sending.",
        count: runningDraftInvoices.length,
        tone: "amber",
        actionLabel: "Open drafts",
        onClick: () => {
          setActiveSection("invoices");
          setInvoiceWorkflowTab("history");
        },
      });
    }

    if (lowHealthProperties.length > 0) {
      items.push({
        key: "property-health",
        title: "Properties need attention",
        detail: "Some properties have low setup or operations health scores.",
        count: lowHealthProperties.length,
        tone: "amber",
        actionLabel: "Open health",
        onClick: () => {
          setActiveSection("properties");
          setPropertyWorkflowTab("health");
        },
      });
    }

    return items.sort((a, b) => {
      const order = { red: 0, amber: 1, blue: 2, purple: 3, green: 4 };
      return order[a.tone] - order[b.tone] || b.count - a.count;
    });
  }, [
    unreadChatCount,
    failedNotificationStats.total,
    failedNotificationStats.overdue,
    strandedJobs.length,
    maintenanceFlagCounts.open,
    maintenanceFlagCounts.urgent,
    recentlyAcceptedInvites.length,
    ownerInvoices,
    propertyHealthRows,
  ]);

  const notificationCenterCount = useMemo(
    () => notificationCenterItems.reduce((sum, item) => sum + item.count, 0),
    [notificationCenterItems]
  );

  function getAdminMenuBadge(section: AdminSection) {
    if (section === "notifications" && notificationCenterCount > 0) return notificationCenterCount > 99 ? "99+" : String(notificationCenterCount);
    if (section === "chat" && unreadChatCount > 0) return unreadChatCount > 99 ? "99+" : String(unreadChatCount);
    if (section === "jobs" && strandedJobs.length > 0) return String(strandedJobs.length);
    if (section === "maintenance" && maintenanceFlagCounts.urgent > 0) return String(maintenanceFlagCounts.urgent);
    if (section === "invites" && recentlyAcceptedInvites.length > 0) return String(recentlyAcceptedInvites.length);
    if (section === "invoices" && ownerInvoices.length > 0) return String(ownerInvoices.length);
    return "";
  }

  function getChatConversationUnreadCount(conversationId: string) {
    if (!currentAdminUserId) return 0;
    if (isChatConversationHidden(conversationId)) return 0;

    const myParticipant = chatParticipants.find(
      (participant) =>
        participant.conversation_id === conversationId &&
        participant.participant_profile_id === currentAdminUserId
    );
    const lastReadAt = myParticipant?.last_read_at ? new Date(myParticipant.last_read_at).getTime() : 0;
    if (Number.isNaN(lastReadAt)) return 0;

    return chatMessages.filter((message) => {
      if (message.conversation_id !== conversationId) return false;
      if (isChatMessageHidden(message.id)) return false;
      if (message.sender_profile_id === currentAdminUserId) return false;
      const createdAt = message.created_at ? new Date(message.created_at).getTime() : 0;
      return createdAt > lastReadAt;
    }).length;
  }

  function isChatConversationHidden(conversationId: string) {
    return chatHiddenItems.some((item) => item.conversation_id === conversationId && !item.message_id);
  }

  function isChatMessageHidden(messageId: string) {
    return chatHiddenItems.some((item) => item.message_id === messageId);
  }

  function selectAdminSection(section: AdminSection) {
    if (section === "properties") {
      setPropertyWorkflowTab("directory");
    }
    setActiveSection(section);
    setShowAdminNav(false);
  }

  function toggleAdminMenuOrientation() {
    setAdminMenuOrientation((current) => {
      const next = current === "side" ? "top" : "side";
      if (typeof window !== "undefined") {
        window.localStorage.setItem("admin-menu-orientation", next);
      }
      return next;
    });
  }

  function saveAdminMenuOrder(order: AdminSection[]) {
    setAdminMenuOrder(order);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("admin-menu-order", JSON.stringify(order));
    }
  }

  function resetAdminMenuOrder() {
    saveAdminMenuOrder([]);
    setDraggingAdminMenuKey(null);
  }

  function moveDraggedAdminMenuItem(targetKey: AdminSection) {
    if (!draggingAdminMenuKey || draggingAdminMenuKey === targetKey) return;

    const currentOrder = orderedAdminMenuItems.map((item) => item.key);
    const fromIndex = currentOrder.indexOf(draggingAdminMenuKey);
    const toIndex = currentOrder.indexOf(targetKey);
    if (fromIndex < 0 || toIndex < 0) return;

    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, moved);
    saveAdminMenuOrder(nextOrder);
  }

  function getAdminMenuDragProps(key: AdminSection) {
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLButtonElement>) => {
        setDraggingAdminMenuKey(key);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", key);
      },
      onDragOver: (event: DragEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      },
      onDrop: (event: DragEvent<HTMLButtonElement>) => {
        event.preventDefault();
        moveDraggedAdminMenuItem(key);
      },
      onDragEnd: () => setDraggingAdminMenuKey(null),
    };
  }

  function getProfileDisplayName(profileId?: string | null) {
    if (!profileId) return "";

    const profile =
      profiles.find((profile) => profile.id === profileId) ||
      (currentAdminProfile?.id === profileId ? currentAdminProfile : null);

    const displayName = profile?.full_name?.trim() || profile?.email?.trim();
    if (displayName) return displayName;
    if (profileId === currentAdminUserId) return "You";
    return "Unknown user";
  }

  function renderAdminNavigation(orientation: AdminMenuOrientation = "side") {
    const isTop = orientation === "top";

    if (isTop) {
      return (
        <nav className="flex flex-wrap gap-2" aria-label="Admin sections">
          {orderedAdminMenuItems.map((item) => {
            const active = activeSection === item.key;
            const badge = getAdminMenuBadge(item.key);
            const dragging = draggingAdminMenuKey === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => selectAdminSection(item.key)}
                {...getAdminMenuDragProps(item.key)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                  active
                    ? `${item.activeClass} shadow-[0_10px_20px_rgba(36,28,21,0.08)]`
                    : item.key === "chat" && unreadChatCount > 0
                      ? "border-[#a5f3fc] bg-[#ecfeff] text-[#0e7490] hover:bg-white"
                      : "border-[#eadfce] bg-white text-[#5f5245] hover:border-[#d8c7ab] hover:bg-[#fcfaf7]"
                } ${dragging ? "scale-95 opacity-60" : "cursor-grab active:cursor-grabbing"}`}
                title="Drag to reorder"
              >
                <span className={`h-5 w-1.5 rounded-full ${item.accent}`} aria-hidden="true" />
                <span>{item.label}</span>
                {badge ? (
                  <span
                    className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold leading-none ${
                      item.key === "maintenance" || item.key === "jobs"
                        ? "bg-[#dc2626] text-white"
                        : active
                          ? "bg-white/80 text-current"
                          : "bg-[#241c15] text-[#f8f2e8]"
                    }`}
                  >
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
          {adminMenuOrder.length > 0 ? (
            <button
              type="button"
              onClick={resetAdminMenuOrder}
              className="inline-flex min-h-10 items-center rounded-full border border-[#d8c7ab] bg-white px-3 py-2 text-sm font-semibold text-[#6f6255] transition hover:bg-[#fcfaf7]"
            >
              Reset order
            </button>
          ) : null}
        </nav>
      );
    }

    return (
      <nav className="space-y-5" aria-label="Admin sections">
          <div>
            <div className="flex items-center justify-between gap-3 px-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9a8b78]">
                Navigation
              </div>
              {adminMenuOrder.length > 0 ? (
                <button
                  type="button"
                  onClick={resetAdminMenuOrder}
                  className="rounded-full border border-[#d8c7ab] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#6f6255] transition hover:bg-[#fcfaf7]"
                >
                  Reset
                </button>
              ) : null}
            </div>
            <div className="mt-2 space-y-1.5">
              {orderedAdminMenuItems.map((item) => {
                const active = activeSection === item.key;
                const badge = getAdminMenuBadge(item.key);
                const dragging = draggingAdminMenuKey === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => selectAdminSection(item.key)}
                    {...getAdminMenuDragProps(item.key)}
                    className={`group flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition ${
                      active
                        ? `${item.activeClass} shadow-[0_12px_24px_rgba(36,28,21,0.08)]`
                        : item.key === "chat" && unreadChatCount > 0
                          ? "border-[#a5f3fc] bg-[#ecfeff] text-[#0e7490] hover:bg-white"
                          : "border-transparent bg-transparent text-[#5f5245] hover:border-[#eadfce] hover:bg-white"
                    } ${dragging ? "scale-[0.98] opacity-60" : "cursor-grab active:cursor-grabbing"}`}
                    title="Drag to reorder"
                  >
                    <span className={`${isTop ? "h-7" : "h-9"} w-1.5 rounded-full ${item.accent}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-5">{item.label}</span>
                      <span className={`mt-0.5 block text-xs leading-4 ${active ? "opacity-75" : "text-[#8a7b68]"}`}>
                        {item.hint}
                      </span>
                    </span>
                    {badge ? (
                      <span
                        className={`min-w-6 rounded-full px-2 py-1 text-center text-xs font-bold leading-none ${
                          item.key === "maintenance" || item.key === "jobs"
                            ? "bg-[#dc2626] text-white"
                            : active
                              ? "bg-white/80 text-current"
                              : "bg-[#241c15] text-[#f8f2e8]"
                        }`}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
      </nav>
    );
  }

  function renderNotificationCenterSection() {
    const toneClasses = {
      red: "border-[#f0b4b4] bg-[#fff5f5] text-[#8a2e22]",
      amber: "border-[#f1cf8f] bg-[#fff8e8] text-[#8a6112]",
      blue: "border-[#a5f3fc] bg-[#ecfeff] text-[#0e7490]",
      green: "border-[#bbdfc0] bg-[#f0fbf2] text-[#236b30]",
      purple: "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9]",
    };

    return (
      <div className="space-y-6">
        <section className="rounded-[30px] border border-[#fed7aa] bg-[linear-gradient(180deg,#fffaf5_0%,#fff7ed_100%)] p-5 shadow-[0_18px_45px_rgba(249,115,22,0.08)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#c2410c]">Notification Center</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#431407]">Items needing attention</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#7c4a24]">
                A single place for active alerts from chat, jobs, maintenance, invitations, invoices, and property health.
              </p>
            </div>
            <span className="rounded-full border border-[#fed7aa] bg-white px-3 py-1 text-xs font-semibold text-[#c2410c]">
              {notificationCenterCount} active
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Unread chat", value: unreadChatCount, tone: toneClasses.blue },
              { label: "Job issues", value: strandedJobs.length + failedNotificationStats.total, tone: strandedJobs.length + failedNotificationStats.total > 0 ? toneClasses.red : toneClasses.green },
              { label: "Maintenance", value: maintenanceFlagCounts.open, tone: maintenanceFlagCounts.urgent > 0 ? toneClasses.red : toneClasses.amber },
              { label: "Property health", value: propertyHealthStats.atRisk, tone: propertyHealthStats.atRisk > 0 ? toneClasses.amber : toneClasses.green },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-[20px] border px-4 py-3 shadow-sm ${stat.tone}`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-75">{stat.label}</div>
                <div className="mt-2 text-3xl font-semibold">{stat.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-xl font-semibold tracking-tight text-[#241c15]">Active notifications</h3>
              <p className="mt-1 text-sm text-[#7f7263]">Highest priority items stay at the top.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-2 text-sm font-semibold text-[#5f5245] transition hover:bg-white"
            >
              Refresh
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {notificationCenterItems.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-4 py-8 text-center text-sm text-[#7f7263]">
                Nothing needs attention right now.
              </div>
            ) : (
              notificationCenterItems.map((item) => (
                <div key={item.key} className={`rounded-[22px] border p-4 shadow-sm ${toneClasses[item.tone]}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-semibold">{item.title}</h4>
                        <span className="rounded-full border border-current/20 bg-white/70 px-2.5 py-0.5 text-xs font-semibold">
                          {item.count}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 opacity-85">{item.detail}</p>
                    </div>
                    <button
                      type="button"
                      onClick={item.onClick}
                      className="rounded-full bg-[#241c15] px-4 py-2 text-sm font-semibold text-[#f8f2e8] transition hover:bg-[#352a21]"
                    >
                      {item.actionLabel}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[24px] border border-[#fed7aa] bg-[#fff7ed] p-4 text-sm leading-6 text-[#7c4a24]">
          This center shows current in-app attention items. It does not create extra database polling; it summarizes data the admin portal already loads or receives through realtime.
        </section>
      </div>
    );
  }

  function renderHomeSection() {
    const onboardingPropertyIds = new Set(properties.map((property) => property.id));
    const onboardingPropertyCalendars = propertyCalendars.filter((calendar) =>
      onboardingPropertyIds.has(calendar.property_id)
    );
    const onboardingBookingEvents = propertyBookingEvents.filter((event) =>
      onboardingPropertyIds.has(event.property_id)
    );
    const onboardingOwnerAccountIds = new Set(
      ownerPropertyAccess
        .filter((access) => onboardingPropertyIds.has(access.property_id))
        .map((access) => access.owner_account_id)
    );
    const onboardingOwnerAccounts = ownerAccounts.filter((owner) =>
      onboardingOwnerAccountIds.has(owner.id)
    );

    const adminOnboardingSteps: OnboardingStep[] = [
      {
        id: "property",
        title: "Add your first property",
        description: "Create the property record that jobs, calendars, invoices, access notes, and owners will connect to.",
        complete: properties.length > 0,
        actionLabel: "Open properties",
        onAction: () => setActiveSection("properties"),
      },
      {
        id: "calendar",
        title: "Connect a booking calendar",
        description: "Add an Airbnb, VRBO, or other iCal feed so the system can create schedule context automatically.",
        complete: properties.length > 0 && (onboardingPropertyCalendars.length > 0 || onboardingBookingEvents.length > 0),
        actionLabel: "Open calendar",
        onAction: () => setActiveSection("calendar"),
      },
      {
        id: "invites",
        title: "Invite your team",
        description: "Send cleaner, grounds, or owner invites so each person can use the right portal.",
        complete:
          properties.length > 0 &&
          (organizationInvites.length > 0 ||
            cleanerAccounts.length > 0 ||
            groundsAccounts.length > 0 ||
            onboardingOwnerAccounts.length > 0),
        actionLabel: "Open invites",
        onAction: () => setActiveSection("invites"),
      },
      {
        id: "assignments",
        title: "Assign cleaner and grounds coverage",
        description: "Link staff accounts to properties so job offers can go to the right people.",
        complete: assignments.length > 0 || groundsAssignments.length > 0,
        actionLabel: "Open assignments",
        onAction: () => setActiveSection("assignments"),
      },
      {
        id: "jobs",
        title: "Review jobs and exceptions",
        description: "Check active cleaning and grounds work, then clear stranded jobs or staffing issues.",
        complete: jobs.length > 0 || groundsJobs.length > 0,
        actionLabel: "Open jobs",
        onAction: () => setActiveSection("jobs"),
      },
      {
        id: "invoices",
        title: "Set invoice defaults and rates",
        description: "Add branding, taxes, payment instructions, and property-specific cleaning or grounds rates.",
        complete: properties.length > 0 && (!!invoiceSettings || propertyInvoiceRates.length > 0 || ownerInvoices.length > 0),
        actionLabel: "Open invoices",
        onAction: () => setActiveSection("invoices"),
      },
      {
        id: "documents",
        title: "Add documents or SOP details",
        description: "Store instructions, photos, and files that help staff do the work consistently.",
        complete: documentVaultRows.length > 0 || sops.length > 0 || sopImages.length > 0,
        actionLabel: "Open documents",
        onAction: () => setActiveSection("documents"),
      },
      {
        id: "chat",
        title: "Try chat",
        description: "Start a chat with staff or owners so communication stays in the portal.",
        complete: chatConversations.length > 0,
        actionLabel: "Open chat",
        onAction: () => setActiveSection("chat"),
      },
    ];

    return (
      <div className="space-y-6">
        <OnboardingChecklist
          storageKey={`admin-onboarding:${currentOrganizationId || "default"}`}
          eyebrow="Getting started"
          title="Set up your workspace"
          description="Work through these once for a new organization. Each step opens the area where the setup happens, and you can hide or dismiss this card anytime."
          steps={adminOnboardingSteps}
        />

        <div className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a7b68]">
                Home
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#241c15]">
                Today at a glance
              </h2>
              <p className="mt-1 text-sm text-[#7f7263]">
                {new Date().toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => router.push("/help")}
                className="rounded-full bg-[#b48d4e] px-4 py-2 text-black"
              >
                Help
              </button>
              <button
                type="button"
                onClick={() => void syncCalendarsNow()}
                disabled={syncingCalendarsNow}
                className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-4 py-2 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {syncingCalendarsNow ? "Syncing..." : "Sync all calendars"}
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("jobs")}
                className="inline-flex items-center justify-center rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-2 text-sm font-medium text-[#5f4c3b] transition hover:bg-[#f7f1e8]"
              >
                View jobs
              </button>
              <button
                type="button"
                onClick={() => setShowSupport(true)}
                className="inline-flex items-center justify-center rounded-full border border-[#d8c7ab] bg-[#fff7ed] px-4 py-2 text-sm font-medium text-[#7a4b1f] hover:bg-[#ffedd5]"
              >
                Support
              </button>
            </div>
          </div>

          <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)_minmax(210px,0.52fr)]">
            <div className="space-y-4">
              <div className="rounded-[24px] border border-[#cfe1ff] bg-[#eef5ff] p-4 shadow-[0_10px_30px_rgba(59,130,246,0.10)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#4f6ea8]">
                      Today
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-[#1f3b63]">
                      Today&apos;s schedule
                    </h3>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#2957a4]">
                    {todaysCleaningJobs.length + todaysGroundsJobs.length} jobs
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {todaysCleaningJobs.map((job) => {
                    const property = properties.find((p) => p.id === job.property_id);
                    return (
                      <div
                        key={`today-cleaning-${job.id}`}
                        className="rounded-[18px] border border-[#b9d1fb] bg-white px-4 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="inline-flex items-center rounded-full bg-[#2563eb] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                              Cleaning
                            </div>
                            <p className="mt-1 text-[15px] font-semibold text-[#1c2b45]">
                              {property?.name || property?.address || "Unknown property"}
                            </p>
                            <p className="mt-0.5 text-sm text-[#5f6f86]">
                              {getCityFromAddress(property?.address)}
                            </p>
                          </div>
                          <div className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-semibold text-[#2f62b6]">
                            Cleaning
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {todaysGroundsJobs.map((job) => {
                    const property = properties.find((p) => p.id === job.property_id);
                    return (
                      <div
                        key={`today-grounds-${job.id}`}
                        className="rounded-[18px] border border-[#bde7cf] bg-white px-4 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="inline-flex items-center rounded-full bg-[#16a34a] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                              Grounds
                            </div>
                            <p className="mt-1 text-[15px] font-semibold text-[#20432f]">
                              {property?.name || property?.address || "Unknown property"}
                            </p>
                            <p className="mt-0.5 text-sm text-[#5d7767]">
                              {getCityFromAddress(property?.address)}
                            </p>
                          </div>
                          <div className="rounded-full bg-[#e9f9ef] px-3 py-1 text-xs font-semibold text-[#218552]">
                            Grounds
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {todaysCleaningJobs.length === 0 && todaysGroundsJobs.length === 0 && (
                    <div className="rounded-[16px] border border-dashed border-[#b9d1fb] bg-white/80 px-4 py-3 text-sm text-[#5f6f86]">
                      No jobs scheduled for today.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-[#f6d7a8] bg-[#fff4dd] p-4 shadow-[0_10px_30px_rgba(245,158,11,0.10)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#a56a06]">
                      Tomorrow
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-[#7a4b00]">
                      Coming up next
                    </h3>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#9a6206]">
                    {adminDataLoaded ? `${tomorrowsCleaningJobs.length + tomorrowsGroundsJobs.length} jobs` : "Loading"}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {tomorrowsCleaningJobs.map((job) => {
                    const property = properties.find((p) => p.id === job.property_id);
                    return (
                      <div
                        key={`tomorrow-cleaning-${job.id}`}
                        className="rounded-[16px] border border-[#f1cf8f] bg-white px-4 py-2.5"
                      >
                        <div className="inline-flex items-center rounded-full bg-[#2563eb] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                          Cleaning
                        </div>
                        <p className="mt-1 text-[15px] font-semibold text-[#5f3a00]">
                          {property?.name || property?.address || "Unknown property"}
                        </p>
                        <p className="mt-0.5 text-sm text-[#8b6a32]">
                          {getCityFromAddress(property?.address)}
                        </p>
                      </div>
                    );
                  })}

                  {tomorrowsGroundsJobs.map((job) => {
                    const property = properties.find((p) => p.id === job.property_id);
                    return (
                      <div
                        key={`tomorrow-grounds-${job.id}`}
                        className="rounded-[16px] border border-[#f1cf8f] bg-white px-4 py-2.5"
                      >
                        <div className="inline-flex items-center rounded-full bg-[#16a34a] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                          Grounds
                        </div>
                        <p className="mt-1 text-[15px] font-semibold text-[#5f3a00]">
                          {property?.name || property?.address || "Unknown property"}
                        </p>
                        <p className="mt-0.5 text-sm text-[#8b6a32]">
                          {getCityFromAddress(property?.address)}
                        </p>
                      </div>
                    );
                  })}

                  {!adminDataLoaded ? (
                    <div className="rounded-[16px] border border-dashed border-[#f1cf8f] bg-white/80 px-4 py-3 text-sm text-[#8b6a32]">
                      Loading tomorrow&apos;s schedule...
                    </div>
                  ) : tomorrowsCleaningJobs.length === 0 && tomorrowsGroundsJobs.length === 0 ? (
                    <div className="rounded-[16px] border border-dashed border-[#f1cf8f] bg-white/80 px-4 py-3 text-sm text-[#8b6a32]">
                      Nothing lined up for tomorrow yet.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-[#bde7cf] bg-[#eefcf3] p-4 shadow-[0_10px_30px_rgba(22,163,74,0.10)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2f6b2f]">
                    Occupied
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-[#20432f]">
                    Properties with guests today
                  </h3>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#218552]">
                  {occupiedTodayProperties.length} occupied
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {occupiedTodayProperties.length === 0 ? (
                  <div className="rounded-[16px] border border-dashed border-[#bde7cf] bg-white/80 px-4 py-3 text-sm text-[#5d7767]">
                    No properties are currently marked occupied from synced calendars.
                  </div>
                ) : (
                  occupiedTodayProperties.map((item) => (
                    <div
                      key={`occupied-${item.id}`}
                      className="rounded-[16px] border border-[#bde7cf] bg-white px-4 py-3"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row lg:flex-col sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="inline-flex items-center rounded-full bg-[#16a34a] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                            Occupied
                          </div>
                          <p className="mt-1 text-[15px] font-semibold text-[#20432f]">
                            {item.propertyName}
                          </p>
                          <p className="mt-0.5 text-sm text-[#5d7767]">
                            {item.city || item.source}
                          </p>
                          <p className="mt-1 text-sm text-[#456452]">
                            {item.summary}
                          </p>
                        </div>
                        <div className="shrink-0 text-left text-sm">
                          <p className="font-semibold text-[#20432f]">
                            {item.guestCount ? `${item.guestCount} guest${item.guestCount === 1 ? "" : "s"}` : "Guests unknown"}
                          </p>
                          <p className="mt-1 text-xs font-medium text-[#5d7767]">
                            Out {formatDateLabel(item.checkoutDate)}
                          </p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#2f6b2f]">
                            {item.source}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a7b68]">
                Snapshot
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-[16px] border border-[#eadfce] bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a7b68]">
                    Cleaning today
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[#241c15]">
                    {todaysCleaningJobs.length}
                  </p>
                </div>

                <div className="rounded-[16px] border border-[#eadfce] bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a7b68]">
                    Grounds today
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[#241c15]">
                    {todaysGroundsJobs.length}
                  </p>
                </div>

                <div className="rounded-[16px] border border-[#eadfce] bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a7b68]">
                    Occupied today
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[#241c15]">
                    {occupiedTodayProperties.length}
                  </p>
                </div>

                <div className="rounded-[16px] border border-[#eadfce] bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a7b68]">
                    Open flags
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[#241c15]">
                    {openMaintenanceFlagsCount}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  function renderInvitesSection() {
    return (
      <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-4 shadow-[0_18px_45px_rgba(0,0,0,0.05)] md:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a7b68]">Team access</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#241c15]">Invitation status</h2>
            <p className="mt-1 text-sm text-[#7f7263]">
              Track who has been invited, who has accepted, and revoke cleaner or grounds invites that should no longer work.
            </p>
          </div>
          <span className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-3 py-1 text-xs font-semibold text-[#6f6255]">
            {invitationStatusRows.length} invite{invitationStatusRows.length === 1 ? "" : "s"} tracked
          </span>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {invitationStatusRows.length > 0 ? (
            invitationStatusRows.map((invite) => (
              <div key={invite.id} className="rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#241c15]">{invite.name}</span>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getInviteStatusTone(invite.status)}`}>
                        {formatInviteStatus(invite.status)}
                      </span>
                      <span className="rounded-full border border-[#d8c7ab] bg-white px-2.5 py-0.5 text-[11px] font-semibold capitalize text-[#6f6255]">
                        {invite.role}
                      </span>
                    </div>
                    <div className="mt-1 break-all text-sm text-[#7f7263]">{invite.email}</div>
                    <div className="mt-2 grid gap-1 text-xs text-[#7f7263]">
                      {invite.sentAt ? <div>Sent: {formatDateTime(invite.sentAt)}</div> : null}
                      {invite.acceptedAt ? <div>Accepted: {formatDateTime(invite.acceptedAt)}</div> : null}
                      {invite.expiresAt && invite.status !== "accepted" ? <div>Expires: {formatDateTime(invite.expiresAt)}</div> : null}
                    </div>
                  </div>
                  {invite.kind === "team" && invite.canRevoke ? (
                    <button
                      type="button"
                      onClick={() => void deleteOrganizationInvite(invite.sourceId)}
                      disabled={deletingOrganizationInviteId === invite.sourceId}
                      className="shrink-0 rounded-full border border-[#efc6c6] bg-[#fff5f5] px-4 py-2 text-sm font-medium text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:opacity-60"
                    >
                      {deletingOrganizationInviteId === invite.sourceId ? "Revoking..." : "Revoke invite"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[18px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-4 py-5 text-sm text-[#7f7263]">
              No invitations have been sent yet.
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderChatSection() {
    const chatRecipientOptions = [
      ...profiles
        .filter((profile) => profile.id !== currentAdminUserId)
        .map((profile) => ({
          value: `profile:${profile.id}`,
          label: `${profile.full_name || profile.email || "User"} (${profile.role})`,
          detail: profile.email || "",
        })),
      ...ownerAccounts.map((owner) => ({
        value: `owner:${owner.id}`,
        label: `${owner.full_name || owner.email} (owner)`,
        detail: owner.email,
      })),
    ];
    const visibleChatConversations = chatConversations.filter((conversation) => !isChatConversationHidden(conversation.id));
    const selectedConversation =
      visibleChatConversations.find((conversation) => conversation.id === selectedChatConversationId) ||
      visibleChatConversations[0] ||
      null;
    const activeConversationId = selectedConversation?.id || "";
    const selectedConversationMessages = activeConversationId
      ? chatMessages.filter((message) => message.conversation_id === activeConversationId && !isChatMessageHidden(message.id))
      : [];
    const selectedConversationParticipants = activeConversationId
      ? chatParticipants.filter((participant) => participant.conversation_id === activeConversationId)
      : [];

    return (
      <div className="space-y-6">
        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a7b68]">In-app chat</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#241c15]">Chat</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#7f7263]">
                Start conversations with cleaners, grounds users, owners, or other admins. This first version is in-app only and does not send email alerts.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  chatRealtimeReady
                    ? "border-[#bbdfc0] bg-[#f0fbf2] text-[#236b30]"
                    : "border-[#d8c7ab] bg-[#fcfaf7] text-[#6f6255]"
                }`}
              >
                {chatRealtimeReady ? "Live" : "Connecting"}
              </span>
              <span className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-3 py-1 text-xs font-semibold text-[#6f6255]">
                {visibleChatConversations.length} conversation{visibleChatConversations.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[360px_1fr]">
            <div className="space-y-4">
              <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                <h3 className="text-base font-semibold text-[#241c15]">Start a conversation</h3>
                <div className="mt-4 grid gap-3">
                  <select
                    className="rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                    value={chatRecipientTarget}
                    onChange={(e) => setChatRecipientTarget(e.target.value)}
                  >
                    <option value="">Choose recipient</option>
                    {chatRecipientOptions.map((recipient) => (
                      <option key={recipient.value} value={recipient.value}>
                        {recipient.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                    placeholder="Subject (optional)"
                    value={chatSubject}
                    onChange={(e) => setChatSubject(e.target.value)}
                  />
                  <textarea
                    className="min-h-[120px] rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                    placeholder="Start the chat"
                    value={chatMessageBody}
                    onChange={(e) => setChatMessageBody(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => void createChatConversation()}
                    disabled={creatingChatConversation}
                    className="rounded-full bg-[#241c15] px-4 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60"
                  >
                    {creatingChatConversation ? "Starting..." : "Start conversation"}
                  </button>
                </div>
              </div>

              <div className="rounded-[24px] border border-[#eadfce] bg-white p-3">
                <div className="px-1 pb-2 text-sm font-semibold text-[#241c15]">Conversations</div>
                <div className="space-y-2">
                  {visibleChatConversations.length > 0 ? (
                    visibleChatConversations.map((conversation) => {
                      const selected = activeConversationId === conversation.id;
                      const recipientSummary = getChatConversationRecipientSummary(conversation);
                      const conversationUnreadCount = getChatConversationUnreadCount(conversation.id);
                      const lastMessage = chatMessages
                        .filter((message) => message.conversation_id === conversation.id && !isChatMessageHidden(message.id))
                        .at(-1);

                      return (
                        <div
                          key={conversation.id}
                          className={`rounded-[18px] border transition ${
                            selected
                              ? "border-[#241c15] bg-[#241c15] text-[#f8f2e8]"
                              : conversationUnreadCount > 0
                                ? "border-[#a5f3fc] bg-[#ecfeff] text-[#0e7490] shadow-[0_10px_22px_rgba(6,182,212,0.10)]"
                              : "border-[#eadfce] bg-[#fcfaf7] text-[#241c15] hover:bg-white"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedChatConversationId(conversation.id)}
                            className="block w-full px-3 pt-3 text-left"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-sm font-semibold">{getChatConversationTitle(conversation)}</div>
                              {conversationUnreadCount > 0 ? (
                                <span
                                  className={`rounded-full px-2 py-1 text-[11px] font-bold leading-none ${
                                    selected ? "bg-[#f8f2e8] text-[#241c15]" : "bg-[#0891b2] text-white"
                                  }`}
                                >
                                  {conversationUnreadCount > 99 ? "99+" : conversationUnreadCount} new
                                </span>
                              ) : null}
                            </div>
                            <div className={`mt-1 text-xs font-medium ${selected ? "text-[#f5e9d8]" : "text-[#5f5144]"}`}>
                              With: {recipientSummary}
                            </div>
                            <div className={`mt-1 line-clamp-2 text-xs ${selected ? "text-[#eadfce]" : "text-[#7f7263]"}`}>
                              {lastMessage?.body || "No chat yet"}
                            </div>
                          </button>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className={`px-3 pb-3 text-[11px] ${selected ? "text-[#d8c7ab]" : "text-[#8a7b68]"}`}>
                              {conversation.last_message_at || conversation.updated_at || conversation.created_at
                                ? formatDateTime(conversation.last_message_at || conversation.updated_at || conversation.created_at || "")
                                : "New"}
                            </span>
                            <button
                              type="button"
                              onClick={() => void hideChatConversationForMe(conversation)}
                              className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                                selected
                                  ? "border-[#f8f2e8]/30 text-[#f8f2e8]"
                                  : "border-[#efc6c6] bg-white text-[#8a2e22]"
                              }`}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-3 py-4 text-sm text-[#7f7263]">
                      No chats yet. Run the chat SQL, then start the first one.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-4">
              {selectedConversation ? (
                <>
                  <div className="flex flex-col gap-2 border-b border-[#eadfce] pb-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-[#241c15]">{getChatConversationTitle(selectedConversation)}</h3>
                      <div className="mt-1 text-sm text-[#7f7263]">
                        With: {getChatConversationRecipientSummary(selectedConversation)}
                      </div>
                      <div className="mt-1 text-xs text-[#8a7b68]">
                        All participants: {selectedConversationParticipants.map((participant) => getChatParticipantSummary(participant)).join(" | ")}
                      </div>
                    </div>
                    <span className="rounded-full border border-[#d8c7ab] bg-white px-3 py-1 text-xs font-semibold text-[#6f6255]">
                      In-app only
                    </span>
                  </div>

                  <div ref={chatThreadScrollRef} className="mt-4 max-h-[440px] space-y-3 overflow-y-auto pr-1">
                    {selectedConversationMessages.length > 0 ? (
                      selectedConversationMessages.map((message) => {
                        const isMine = message.sender_profile_id === currentAdminUserId;
                        const sender = profiles.find((profile) => profile.id === message.sender_profile_id);
                        return (
                          <div
                            key={message.id}
                            className={`rounded-[18px] border px-4 py-3 ${
                              isMine
                                ? "ml-auto max-w-[85%] border-[#d8c7ab] bg-white"
                                : "mr-auto max-w-[85%] border-[#d4c2ea] bg-[#fbf8ff]"
                            }`}
                          >
                            <div className="text-xs font-semibold text-[#7f7263]">
                              {isMine ? "You" : sender?.full_name || sender?.email || "Participant"}
                            </div>
                            <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#241c15]">{message.body}</div>
                            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[#8a7b68]">
                              <span>{message.created_at ? formatDateTime(message.created_at) : ""}</span>
                              <button
                                type="button"
                                onClick={() => void hideChatMessageForMe(message)}
                                className="rounded-full border border-[#efc6c6] bg-[#fff5f5] px-2 py-1 font-semibold text-[#8a2e22] transition hover:bg-[#fff0f0]"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-[#d8c7ab] bg-white px-4 py-5 text-sm text-[#7f7263]">
                        No chat replies in this conversation yet.
                      </div>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3">
                    <textarea
                      className="min-h-[110px] rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                      placeholder="Write a reply"
                      value={chatReplyBody}
                      onChange={(e) => setChatReplyBody(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => void sendChatReply()}
                      disabled={sendingChatMessage}
                      className="justify-self-end rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60"
                    >
                      {sendingChatMessage ? "Sending..." : "Send reply"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-[20px] border border-dashed border-[#d8c7ab] bg-white px-4 py-8 text-center text-sm text-[#7f7263]">
                  Choose or start a conversation.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderUsersSection() {
    return (
      <div className="rounded-[30px] border border-[#e7ddd0] bg-white p-4 md:p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">User Management</h2>
          <p className="mt-1 text-sm text-[#7f7263]">
            Approve pending users, change access roles, remove users from the portal, or permanently delete them.
          </p>
          <div className="mt-2 text-sm font-medium text-[#8a6112]">

          </div>
          <div className="mt-3 rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3 text-sm text-[#6f6255]">
            <span className="font-semibold text-[#241c15]">How access works:</span> Users are linked to Cleaner and/or Grounds teams. Properties are assigned to those teams.
          </div>
          <button
            type="button"
            onClick={() => setActiveSection("invites")}
            className="mt-3 rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-medium text-[#5f4c3b] transition hover:bg-[#fcfaf7]"
          >
            View invitation status
          </button>
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
  function getOwnerForProperty(propertyId: string) {
    const accessRow = ownerPropertyAccess.find((row) => row.property_id === propertyId);
    if (!accessRow) return null;
    return ownerAccounts.find((owner) => owner.id === accessRow.owner_account_id) || null;
  }

  function getInvoiceOwnerId() {
    if (invoiceOwnerId) return invoiceOwnerId;
    if (!invoicePropertyId) return "";
    return getOwnerForProperty(invoicePropertyId)?.id || "";
  }

  function getPropertiesForOwner(ownerAccountId: string) {
    const linkedPropertyIds = new Set(
      ownerPropertyAccess
        .filter((row) => row.owner_account_id === ownerAccountId)
        .map((row) => row.property_id)
    );

    return properties.filter((property) => linkedPropertyIds.has(property.id));
  }

  function getOwnerInviteStatus(owner: OwnerAccountRow | null) {
    if (!owner) return "No owner linked";
    if (owner.invite_accepted_at) return "Active";
    if (owner.invite_sent_at) return "Invite sent";
    return "Not invited";
  }

  function getInviteStatusTone(status: string) {
    if (status === "accepted") return "border-[#bbdfc0] bg-[#f0fbf2] text-[#236b30]";
    if (status === "revoked" || status === "expired") return "border-[#efc6c6] bg-[#fff5f5] text-[#8a2e22]";
    return "border-[#f1cf8f] bg-[#fff8e8] text-[#8a6112]";
  }

  function formatInviteStatus(status: string) {
    if (status === "accepted") return "Accepted";
    if (status === "revoked") return "Revoked";
    if (status === "expired") return "Expired";
    if (status === "pending") return "Pending";
    return "Sent";
  }

  function getChatParticipantLabel(participant: ChatParticipantRow | undefined) {
    if (!participant) return "Conversation";
    return participant.display_name || participant.email || participant.participant_role || "Participant";
  }

  function getChatOtherParticipants(conversation: ChatConversationRow) {
    return chatParticipants.filter(
      (participant) =>
        participant.conversation_id === conversation.id &&
        participant.participant_profile_id !== currentAdminUserId
    );
  }

  function getChatParticipantRoleLabel(participant: ChatParticipantRow) {
    if (participant.participant_type === "owner" || participant.participant_role === "owner") return "owner";
    if (participant.participant_role === "grounds") return "grounds";
    if (participant.participant_role === "cleaner") return "cleaner";
    if (participant.participant_role === "admin") return "admin";
    return participant.participant_role || participant.participant_type || "participant";
  }

  function getChatParticipantSummary(participant: ChatParticipantRow | undefined) {
    if (!participant) return "Participant";
    return `${getChatParticipantLabel(participant)} (${getChatParticipantRoleLabel(participant)})`;
  }

  function getChatConversationRecipientSummary(conversation: ChatConversationRow) {
    const others = getChatOtherParticipants(conversation);
    if (others.length === 0) return "No recipient listed";
    return others.map((participant) => getChatParticipantSummary(participant)).join(" | ");
  }

  function getChatConversationTitle(conversation: ChatConversationRow) {
    if (conversation.subject?.trim()) return conversation.subject.trim();
    const otherParticipant = getChatOtherParticipants(conversation)[0];
    return getChatParticipantLabel(otherParticipant);
  }

  async function hideChatConversationForMe(conversation: ChatConversationRow) {
    if (!currentAdminUserId) {
      setError("No admin sign-in was found.");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${getChatConversationTitle(conversation)}" from your chat list?\n\nThis only hides it for you. Other participants will still see the chat.`
    );
    if (!confirmed) return;

    const hiddenItem: ChatHiddenItemRow = {
      id: `local-${conversation.id}`,
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      message_id: null,
      hidden_by_profile_id: currentAdminUserId,
      hidden_at: new Date().toISOString(),
    };

    setChatHiddenItems((current) =>
      current.some((item) => item.conversation_id === conversation.id && !item.message_id)
        ? current
        : [...current, hiddenItem]
    );

    const { error: hideError } = await supabase.from("chat_hidden_items").insert({
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      message_id: null,
      hidden_by_profile_id: currentAdminUserId,
    });

    if (hideError && hideError.code !== "23505") {
      setChatHiddenItems((current) => current.filter((item) => item.id !== hiddenItem.id));
      setError(getErrorMessage(hideError, "Could not delete that chat from your view. Run the chat delete SQL first."));
    }
  }

  async function hideChatMessageForMe(message: ChatMessageRow) {
    if (!currentAdminUserId) {
      setError("No admin sign-in was found.");
      return;
    }

    const confirmed = window.confirm("Delete this message from your view? Other participants will still see it.");
    if (!confirmed) return;

    const hiddenItem: ChatHiddenItemRow = {
      id: `local-${message.id}`,
      organization_id: message.organization_id,
      conversation_id: message.conversation_id,
      message_id: message.id,
      hidden_by_profile_id: currentAdminUserId,
      hidden_at: new Date().toISOString(),
    };

    setChatHiddenItems((current) =>
      current.some((item) => item.message_id === message.id) ? current : [...current, hiddenItem]
    );

    const { error: hideError } = await supabase.from("chat_hidden_items").insert({
      organization_id: message.organization_id,
      conversation_id: message.conversation_id,
      message_id: message.id,
      hidden_by_profile_id: currentAdminUserId,
    });

    if (hideError && hideError.code !== "23505") {
      setChatHiddenItems((current) => current.filter((item) => item.id !== hiddenItem.id));
      setError(getErrorMessage(hideError, "Could not delete that message from your view. Run the chat delete SQL first."));
    }
  }

  async function createChatConversation() {
    if (!currentOrganizationId || !currentAdminUserId) {
      setError("No admin organization session was found.");
      return;
    }

    const body = chatMessageBody.trim();
    if (!chatRecipientTarget) {
      setError("Choose who this message is for.");
      return;
    }

    if (!body) {
      setError("Write the first chat before starting the conversation.");
      return;
    }

    const [targetType, targetId] = chatRecipientTarget.split(":");
    const targetProfile = targetType === "profile" ? profiles.find((profile) => profile.id === targetId) : null;
    const targetOwner = targetType === "owner" ? ownerAccounts.find((owner) => owner.id === targetId) : null;

    if (!targetProfile && !targetOwner) {
      setError("Could not find that chat recipient.");
      return;
    }

    setCreatingChatConversation(true);
    setError("");
    setActionMessage("");

    try {
      const { data: conversation, error: conversationError } = await supabase
        .from("chat_conversations")
        .insert({
          organization_id: currentOrganizationId,
          subject: chatSubject.trim() || null,
          context_type: "direct",
          created_by_profile_id: currentAdminUserId,
        })
        .select()
        .single();

      if (conversationError) throw conversationError;

      const participants = [
        {
          organization_id: currentOrganizationId,
          conversation_id: conversation.id,
          participant_type: "profile",
          participant_profile_id: currentAdminUserId,
          participant_role: "admin",
          display_name: profiles.find((profile) => profile.id === currentAdminUserId)?.full_name || "Admin",
          email: profiles.find((profile) => profile.id === currentAdminUserId)?.email || null,
          last_read_at: new Date().toISOString(),
        },
        targetProfile
          ? {
              organization_id: currentOrganizationId,
              conversation_id: conversation.id,
              participant_type: "profile",
              participant_profile_id: targetProfile.id,
              participant_role: targetProfile.role,
              display_name: targetProfile.full_name || targetProfile.email,
              email: targetProfile.email,
              last_read_at: null,
            }
          : {
              organization_id: currentOrganizationId,
              conversation_id: conversation.id,
              participant_type: "owner",
              participant_owner_account_id: targetOwner?.id,
              participant_role: "owner",
              display_name: targetOwner?.full_name || targetOwner?.email,
              email: targetOwner?.email,
              last_read_at: null,
            },
      ];

      const { error: participantsError } = await supabase.from("chat_participants").insert(participants);
      if (participantsError) throw participantsError;

      const { error: messageError } = await supabase.from("chat_messages").insert({
        organization_id: currentOrganizationId,
        conversation_id: conversation.id,
        sender_profile_id: currentAdminUserId,
        body,
      });

      if (messageError) throw messageError;

      setSelectedChatConversationId(conversation.id);
      setChatRecipientTarget("");
      setChatSubject("");
      setChatMessageBody("");
      setActionMessage("Conversation started.");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err, "Could not start conversation. Run the chat foundation SQL if this is the first time using chat."));
    } finally {
      setCreatingChatConversation(false);
    }
  }

  async function sendChatReply() {
    const activeConversation =
      chatConversations.find((conversation) => conversation.id === selectedChatConversationId) ||
      chatConversations[0] ||
      null;

    if (!currentOrganizationId || !currentAdminUserId || !activeConversation) {
      setError("Choose a conversation before sending a reply.");
      return;
    }

    const body = chatReplyBody.trim();
    if (!body) {
      setError("Write a reply before sending.");
      return;
    }

    setSendingChatMessage(true);
    setError("");
    setActionMessage("");

    try {
      const { error: messageError } = await supabase.from("chat_messages").insert({
        organization_id: currentOrganizationId,
        conversation_id: activeConversation.id,
        sender_profile_id: currentAdminUserId,
        body,
      });

      if (messageError) throw messageError;

      setChatReplyBody("");
      setActionMessage("Chat reply sent.");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err, "Could not send chat reply."));
    } finally {
      setSendingChatMessage(false);
    }
  }

  async function inviteOwnerForProperty(propertyId: string, ownerEmail: string, ownerName: string) {
    const trimmedEmail = ownerEmail.trim().toLowerCase();
    const trimmedName = ownerName.trim();

    if (!propertyId) {
      setError("Property is required.");
      return;
    }

    if (!trimmedEmail) {
      setError("Owner email is required before sending an invite.");
      return;
    }

    setError("");
    setActionMessage("");
    setSendingOwnerInviteId(propertyId);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setError("Could not verify your admin session.");
      setSendingOwnerInviteId(null);
      return;
    }

    const response = await fetch("/api/admin/invite-owner", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        propertyId,
        ownerEmail: trimmedEmail,
        ownerName: trimmedName,
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setError(result?.error || "Failed to send owner invite.");
      setSendingOwnerInviteId(null);
      return;
    }

    setActionMessage(`Invite sent to ${trimmedEmail}.`);
    setSendingOwnerInviteId(null);
    await loadData();
  }

  async function linkSelectedOwnerToProperty() {
    if (!selectedPropertyId) {
      setError("Select a property first.");
      return;
    }

    if (!ownerLinkTargetPropertyId) {
      setError("Choose another property to link.");
      return;
    }

    const trimmedEmail = selectedPropertyOwnerEmail.trim().toLowerCase();

    if (!trimmedEmail) {
      setError("Save an owner email before linking more properties.");
      return;
    }

    const owner = ownerAccounts.find((account) => account.email.trim().toLowerCase() === trimmedEmail);

    if (!owner) {
      setError("Save this owner first, then link additional properties.");
      return;
    }

    const alreadyLinked = ownerPropertyAccess.some(
      (row) => row.owner_account_id === owner.id && row.property_id === ownerLinkTargetPropertyId
    );

    if (alreadyLinked) {
      setActionMessage("Owner is already linked to that property.");
      setOwnerLinkTargetPropertyId("");
      return;
    }

    setError("");
    setActionMessage("");
    setLinkingOwnerProperty(true);

    try {
      const { error } = await supabase.from("owner_property_access").insert({
        owner_account_id: owner.id,
        property_id: ownerLinkTargetPropertyId,
      });

      if (error) throw error;

      setOwnerLinkTargetPropertyId("");
      setActionMessage("Owner linked to additional property.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not link owner to property.");
    } finally {
      setLinkingOwnerProperty(false);
    }
  }

  function getLineItemTotal(item: OwnerInvoiceLineItem) {
    return Number(item.quantity || 0) * Number(item.rate || 0);
  }

  function getInvoiceLineItemsTotal(items: OwnerInvoiceLineItem[]) {
    return items.reduce((sum, item) => sum + getLineItemTotal(item), 0);
  }

  function getInvoiceTaxLinesForSubtotal(subtotal: number) {
    return invoiceTaxLines
      .filter((line) => line.enabled !== false)
      .map((line) => {
        const rawLabel = line.label.trim();
        const rate = Math.max(Number(line.rate || 0), 0);
        const amount = Math.round(subtotal * (rate / 100) * 100) / 100;
        return {
          id: line.id,
          label: rawLabel || "Tax",
          rate,
          amount,
          hasValue: !!rawLabel || rate > 0 || amount > 0,
        };
      })
      .filter((line) => line.hasValue)
      .map(({ hasValue, ...line }) => line);
  }

  function getInvoiceTaxTotal(subtotal: number) {
    return getInvoiceTaxLinesForSubtotal(subtotal).reduce((sum, line) => sum + line.amount, 0);
  }

  function getPropertyInvoiceRate(propertyId: string) {
    const draft = propertyInvoiceRateDrafts[propertyId];
    const saved = propertyInvoiceRates.find((rate) => rate.property_id === propertyId);

    return {
      turnover: Number(draft?.turnover ?? saved?.turnover_rate ?? invoiceSettings?.default_turnover_rate ?? 0),
      grounds: Number(draft?.grounds ?? saved?.grounds_rate ?? invoiceSettings?.default_grounds_rate ?? 0),
      billTurnover: draft?.billTurnover ?? saved?.bill_turnover_to_owner ?? false,
      billGrounds: draft?.billGrounds ?? saved?.bill_grounds_to_owner ?? false,
    };
  }

  function updatePropertyInvoiceRateDraft(
    propertyId: string,
    field: "turnover" | "grounds" | "billTurnover" | "billGrounds",
    value: string | boolean
  ) {
    setDirtyPropertyInvoiceRateIds((ids) => {
      const next = new Set(ids);
      next.add(propertyId);
      return next;
    });
    setPropertyInvoiceRateDrafts((drafts) => ({
      ...drafts,
      [propertyId]: {
        turnover: drafts[propertyId]?.turnover ?? "0",
        grounds: drafts[propertyId]?.grounds ?? "0",
        billTurnover: drafts[propertyId]?.billTurnover ?? false,
        billGrounds: drafts[propertyId]?.billGrounds ?? false,
        [field]: value,
      },
    }));
  }

  function getSavedPropertyInvoiceRate(propertyId: string) {
    const saved = propertyInvoiceRates.find((rate) => rate.property_id === propertyId);

    return {
      turnover: Number(saved?.turnover_rate ?? invoiceSettings?.default_turnover_rate ?? 0),
      grounds: Number(saved?.grounds_rate ?? invoiceSettings?.default_grounds_rate ?? 0),
      billTurnover: saved?.bill_turnover_to_owner ?? false,
      billGrounds: saved?.bill_grounds_to_owner ?? false,
    };
  }

  function hasUnsavedPropertyInvoiceRate(propertyId: string) {
    const draft = propertyInvoiceRateDrafts[propertyId];
    if (!draft) return false;

    const saved = getSavedPropertyInvoiceRate(propertyId);
    return (
      Number(draft.turnover || 0) !== saved.turnover ||
      Number(draft.grounds || 0) !== saved.grounds ||
      draft.billTurnover !== saved.billTurnover ||
      draft.billGrounds !== saved.billGrounds
    );
  }

  function escapeCsvCell(value: string | number | null | undefined) {
    const text = String(value ?? "");
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function downloadTextFile(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function getBackupBaseName(label: string) {
    const organizationLabel =
      currentOrganizationBilling?.name ||
      myOrganizations.find((organization) => organization.organization_id === currentOrganizationId)?.organization_name ||
      "estate-ops";
    const organizationName = organizationLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return `${organizationName || "estate-ops"}-${label}-${toYmd(new Date())}`;
  }

  function downloadCsvFile(filename: string, rows: Array<Array<string | number | null | undefined>>) {
    const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
    downloadTextFile(filename, csv, "text/csv;charset=utf-8");
  }

  function downloadFullBackupJson() {
    const backup = {
      exported_at: new Date().toISOString(),
      organization: {
        id: currentOrganizationId,
        name:
          currentOrganizationBilling?.name ||
          myOrganizations.find((organization) => organization.organization_id === currentOrganizationId)?.organization_name ||
          null,
      },
      counts: {
        properties: properties.length,
        cleaner_accounts: cleanerAccounts.length,
        grounds_accounts: groundsAccounts.length,
        owner_accounts: ownerAccounts.length,
        turnover_jobs: jobs.length,
        grounds_jobs: groundsJobs.length,
        owner_invoices: ownerInvoices.length,
        document_vault_files: documentVaultRows.length,
        maintenance_flags: maintenanceFlags.length,
      },
      data: {
        properties,
        property_access: accessRows,
        property_calendars: propertyCalendars,
        property_sops: sops,
        property_sop_images: sopImages,
        cleaner_accounts: cleanerAccounts,
        cleaner_account_members: cleanerAccountMembers,
        cleaner_assignments: assignments,
        turnover_jobs: jobs,
        turnover_job_slots: jobSlots,
        grounds_accounts: groundsAccounts,
        grounds_account_members: groundsAccountMembers,
        grounds_assignments: groundsAssignments,
        grounds_jobs: groundsJobs,
        grounds_job_slots: groundsJobSlots,
        grounds_recurring_rules: groundsRecurringRules,
        owner_accounts: ownerAccounts,
        owner_property_access: ownerPropertyAccess,
        owner_invoices: ownerInvoices,
        invoice_settings: invoiceSettings,
        property_invoice_rates: propertyInvoiceRates,
        document_vault_files: documentVaultRows,
        maintenance_flags: maintenanceFlags,
        maintenance_flag_images: maintenanceFlagImages,
        organization_invites: organizationInvites,
      },
    };

    downloadTextFile(
      `${getBackupBaseName("full-backup")}.json`,
      JSON.stringify(backup, null, 2),
      "application/json;charset=utf-8"
    );
    setActionMessage("Full JSON backup downloaded.");
  }

  function downloadBackupCsv(kind: "properties" | "people" | "jobs" | "invoices" | "documents") {
    if (kind === "properties") {
      downloadCsvFile(`${getBackupBaseName("properties")}.csv`, [
        ["Property", "Address", "Cleaner units", "Strict cleaner units", "Show cleaner team status", "Owner"],
        ...properties.map((property) => {
          const ownerAccess = ownerPropertyAccess.find((access) => access.property_id === property.id);
          const owner = ownerAccounts.find((account) => account.id === ownerAccess?.owner_account_id);
          return [
            property.name,
            property.address,
            property.default_cleaner_units_needed,
            property.cleaner_units_required_strict ? "yes" : "no",
            property.show_team_status_to_cleaners ? "yes" : "no",
            owner?.full_name || owner?.email || "",
          ];
        }),
      ]);
    }

    if (kind === "people") {
      downloadCsvFile(`${getBackupBaseName("people")}.csv`, [
        ["Type", "Name", "Email", "Phone", "Active", "Members"],
        ...cleanerAccounts.map((account) => [
          "Cleaner",
          account.display_name,
          account.email,
          account.phone,
          account.active === false ? "no" : "yes",
          (cleanerMembersByAccountId[account.id] ?? []).map((member) => member.full_name || member.email || member.id).join("; "),
        ]),
        ...groundsAccounts.map((account) => [
          "Grounds",
          account.display_name,
          account.email,
          account.phone,
          account.active === false ? "no" : "yes",
          (groundsMembersByAccountId[account.id] ?? []).map((member) => member.full_name || member.email || member.id).join("; "),
        ]),
        ...ownerAccounts.map((owner) => [
          "Owner",
          owner.full_name,
          owner.email,
          "",
          owner.is_active ? "yes" : "no",
          "",
        ]),
      ]);
    }

    if (kind === "jobs") {
      downloadCsvFile(`${getBackupBaseName("jobs")}.csv`, [
        ["Type", "Property", "Scheduled", "Status", "Staffing status", "Slots accepted", "Slots offered"],
        ...jobs.map((job) => {
          const slots = jobSlotsByJobId[job.id] ?? [];
          return [
            "Cleaning",
            getPropertyName(job.property_id),
            job.scheduled_for || extractCheckoutDate(job.notes),
            job.status,
            job.staffing_status,
            slots.filter((slot) => slot.status === "accepted").length,
            slots.filter((slot) => slot.status === "offered").length,
          ];
        }),
        ...groundsJobs.map((job) => {
          const slots = groundsJobSlotsByJobId[job.id] ?? [];
          return [
            "Grounds",
            getPropertyName(job.property_id),
            job.scheduled_for,
            job.status,
            job.staffing_status,
            slots.filter((slot) => slot.status === "accepted").length,
            slots.filter((slot) => slot.status === "offered").length,
          ];
        }),
      ]);
    }

    if (kind === "invoices") {
      downloadCsvFile(`${getBackupBaseName("invoices")}.csv`, [
        ["Invoice", "Owner", "Property", "Status", "Issue date", "Due date", "Subtotal", "Tax", "Total", "Sent"],
        ...ownerInvoices.map((invoice) => {
          const owner = ownerAccounts.find((account) => account.id === invoice.owner_account_id);
          const property = properties.find((entry) => entry.id === invoice.property_id);
          return [
            invoice.invoice_number,
            owner?.full_name || owner?.email || "",
            property?.name || property?.address || "",
            invoice.status,
            invoice.issue_date,
            invoice.due_date,
            Number(invoice.subtotal || 0).toFixed(2),
            Number(invoice.tax_total || 0).toFixed(2),
            Number(invoice.total || 0).toFixed(2),
            invoice.sent_at,
          ];
        }),
      ]);
    }

    if (kind === "documents") {
      downloadCsvFile(`${getBackupBaseName("documents")}.csv`, [
        ["Title", "Category", "Property", "File name", "Size", "Mime type", "Storage path", "Created"],
        ...documentVaultRows.map((document) => [
          document.title,
          document.category,
          document.property_id ? getPropertyName(document.property_id) : "Organization-wide",
          document.file_name,
          document.file_size,
          document.mime_type,
          document.storage_path,
          document.created_at,
        ]),
      ]);
    }

    setActionMessage("CSV export downloaded.");
  }

  function downloadInvoiceCsv(
    invoice: OwnerInvoiceRow,
    owner: OwnerAccountRow | null | undefined,
    property: Property | null | undefined
  ) {
    const rows = [
      [
        "InvoiceNo",
        "Customer",
        "CustomerEmail",
        "InvoiceDate",
        "DueDate",
        "Status",
        "Property",
        "Category",
        "ProductService",
        "Description",
        "Qty",
        "Rate",
        "Amount",
        "TaxLabel",
        "TaxRate",
        "TaxLines",
        "TaxTotal",
        "InvoiceTotal",
        "ReceiptUrls",
      ],
      ...invoice.line_items.map((item) => {
        const quantity = Number(item.quantity || 0);
        const rate = Number(item.rate || 0);
        return [
          invoice.invoice_number,
          owner?.full_name || owner?.email || "",
          owner?.email || "",
          invoice.issue_date,
          invoice.due_date || "",
          invoice.status,
          property?.name || property?.address || "All properties",
          item.category || "other",
          item.category === "turnover"
            ? "Turnover Cleaning"
            : item.category === "grounds"
              ? "Grounds Service"
              : "Property Expense",
          item.description,
          quantity,
          rate.toFixed(2),
          (quantity * rate).toFixed(2),
          normalizeTaxLines(invoice.tax_lines)[0]?.label || "",
          Number(normalizeTaxLines(invoice.tax_lines)[0]?.rate || 0).toFixed(3),
          normalizeTaxLines(invoice.tax_lines)
            .map((line) => `${line.label} ${line.rate}%`)
            .join("; "),
          Number(invoice.tax_total || 0).toFixed(2),
          Number(invoice.total || 0).toFixed(2),
          (item.receipt_urls || []).join(" "),
        ];
      }),
    ];

    const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${invoice.invoice_number}-quickbooks.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function updateInvoiceLineItem(id: string, updates: Partial<OwnerInvoiceLineItem>) {
    setInvoiceDraftDirty(true);
    setInvoiceLineItems((items) =>
      items.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }

  function updateInvoiceTaxLine(id: string, updates: Partial<OwnerInvoiceTaxLine>) {
    setInvoiceSettingsDirty(true);
    setInvoiceTaxLines((lines) =>
      lines.map((line) => (line.id === id ? { ...line, ...updates } : line))
    );
  }

  function addInvoiceTaxLine() {
    setInvoiceSettingsDirty(true);
    setInvoiceTaxLines((lines) => [
      ...lines,
      { id: `tax-${Date.now()}`, label: "", rate: "", enabled: true },
    ]);
  }

  function removeInvoiceTaxLine(id: string) {
    setInvoiceSettingsDirty(true);
    setInvoiceTaxLines((lines) =>
      lines.length === 1 ? [{ id: "tax-1", label: "Tax", rate: "0", enabled: true }] : lines.filter((line) => line.id !== id)
    );
  }

  async function uploadInvoiceLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    e.target.value = "";

    if (!file) return;
    if (!currentOrganizationId) {
      setError("Choose an organization before uploading a logo.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file for the invoice logo.");
      return;
    }

    setUploadingInvoiceLogo(true);
    setError("");
    setActionMessage("");

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${currentOrganizationId}/logos/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("invoice-assets")
        .upload(filePath, file, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("invoice-assets").getPublicUrl(filePath);

      setInvoiceLogoUrl(publicUrl);
      setInvoiceSettingsDirty(true);
      setActionMessage("Invoice logo uploaded. Save defaults to keep it.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not upload invoice logo. Make sure the invoice-assets storage bucket exists."));
    } finally {
      setUploadingInvoiceLogo(false);
    }
  }

  async function uploadInvoiceReceipts(lineItemId: string, files: FileList | null) {
    if (!files?.length) return;
    if (!currentOrganizationId) {
      setError("Choose an organization before uploading receipts.");
      return;
    }

    setUploadingReceiptLineItemId(lineItemId);
    setError("");
    setActionMessage("");

    try {
      const uploaded: Array<{ url: string; name: string }> = [];

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${currentOrganizationId}/receipts/${lineItemId}/${Date.now()}-${i}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("invoice-assets")
          .upload(filePath, file, { cacheControl: "3600", upsert: false });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("invoice-assets").getPublicUrl(filePath);

        uploaded.push({ url: publicUrl, name: file.name });
      }

      setInvoiceLineItems((items) =>
        items.map((item) =>
          item.id === lineItemId
            ? {
                ...item,
                receipt_urls: [...(item.receipt_urls || []), ...uploaded.map((receipt) => receipt.url)],
                receipt_names: [...(item.receipt_names || []), ...uploaded.map((receipt) => receipt.name)],
              }
            : item
        )
      );
      setInvoiceDraftDirty(true);
      setActionMessage(`${uploaded.length} receipt${uploaded.length === 1 ? "" : "s"} attached.`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not upload receipt. Make sure the invoice-assets storage bucket exists."));
    } finally {
      setUploadingReceiptLineItemId(null);
    }
  }

  async function uploadExternalInvoiceFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    if (!currentOrganizationId) {
      setError("Choose an organization before uploading an invoice.");
      return;
    }

    const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Upload a PDF or image invoice file.");
      return;
    }

    setUploadingExternalInvoice(true);
    setError("");
    setActionMessage("");

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${currentOrganizationId}/uploaded-invoices/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("invoice-assets")
        .upload(filePath, file, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("invoice-assets").getPublicUrl(filePath);

      setExternalInvoiceUrl(publicUrl);
      setExternalInvoiceName(file.name);
      setExternalInvoiceContentType(file.type || "application/octet-stream");
      if (!externalInvoiceNumber.trim()) {
        setExternalInvoiceNumber(file.name.replace(/\.[^.]+$/, "").slice(0, 40));
      }
      setActionMessage("Uploaded invoice attached. Review the details, then save or send it.");
    } catch (err) {
      setError(getErrorMessage(err, "Could not upload invoice. Make sure the invoice-assets storage bucket exists."));
    } finally {
      setUploadingExternalInvoice(false);
    }
  }

  function removeInvoiceReceipt(lineItemId: string, receiptIndex: number) {
    setInvoiceDraftDirty(true);
    setInvoiceLineItems((items) =>
      items.map((item) => {
        if (item.id !== lineItemId) return item;
        return {
          ...item,
          receipt_urls: (item.receipt_urls || []).filter((_, index) => index !== receiptIndex),
          receipt_names: (item.receipt_names || []).filter((_, index) => index !== receiptIndex),
        };
      })
    );
  }

  function getEmptyInvoiceLineItem(): OwnerInvoiceLineItem {
    return { id: `custom-${Date.now()}`, description: "", category: "expense", quantity: 1, rate: "" };
  }

  function resetInvoiceComposer() {
    setEditingOwnerInvoiceId(null);
    setInvoiceOwnerId("");
    setInvoicePropertyId("");
    setInvoiceIssueDate(getTodayYmd());
    setInvoiceDueDate(getDefaultDueDateYmd());
    setInvoiceNotes("");
    setInvoiceCcEmails("");
    setInvoiceLineItems([getEmptyInvoiceLineItem()]);
    setInvoiceDraftDirty(false);
  }

  function loadOwnerInvoiceDraft(invoice: OwnerInvoiceRow) {
    if (invoice.invoice_source === "uploaded") {
      setError("Uploaded invoice files can be resent from history, but they cannot be edited in the invoice builder.");
      return;
    }

    setEditingOwnerInvoiceId(invoice.id);
    setInvoiceOwnerId(invoice.owner_account_id);
    setInvoicePropertyId(invoice.property_id || "");
    setInvoiceIssueDate(invoice.issue_date || getTodayYmd());
    setInvoiceDueDate(invoice.due_date || "");
    setInvoiceNotes(invoice.notes || "");
    setInvoiceHeaderText(invoice.header_text || invoiceSettings?.header_text || "");
    setInvoicePaymentInstructions(invoice.payment_instructions || invoiceSettings?.payment_instructions || "");
    setInvoiceCompanyName(invoice.company_name || invoiceSettings?.company_name || "");
    setInvoiceLogoUrl(invoice.logo_url || invoiceSettings?.logo_url || "");
    setInvoiceFromEmail(invoice.from_email || invoiceSettings?.from_email || "");
    setInvoiceReplyToEmail(invoice.reply_to_email || invoiceSettings?.reply_to_email || "");
    setInvoiceLineItems(invoice.line_items.length > 0 ? invoice.line_items : [getEmptyInvoiceLineItem()]);
    const loadedTaxLines = normalizeTaxLines(invoice.tax_lines).map((line) => ({
      id: line.id,
      label: line.label,
      rate: line.rate,
      enabled: true,
    }));
    if (loadedTaxLines.length > 0) {
      setInvoiceTaxLines(loadedTaxLines);
    }
    setInvoiceWorkflowTab("running");
    setInvoiceDraftDirty(false);
    setActionMessage(`Loaded running invoice ${invoice.invoice_number}.`);
    setError("");
  }

  function toggleInvoiceHistorySection(section: keyof typeof invoiceHistoryOpenSections) {
    setInvoiceHistoryOpenSections((sections) => ({
      ...sections,
      [section]: !sections[section],
    }));
  }

  function getValidInvoiceLineItems() {
    return invoiceLineItems
      .map((item) => ({
        ...item,
        description: item.description.trim(),
        quantity: Number(item.quantity || 0),
        rate: Number(item.rate || 0),
        receipt_urls: item.receipt_urls || [],
        receipt_names: item.receipt_names || [],
      }))
      .filter((item) => item.description && item.quantity > 0);
  }

  function getInvoiceRecipientContext() {
    const property = properties.find((item) => item.id === invoicePropertyId) || null;
    const owner = ownerAccounts.find((account) => account.id === getInvoiceOwnerId()) || null;

    return {
      owner,
      property,
      ownerName: owner?.full_name || owner?.email || "Owner",
      ownerEmail: owner?.email || "",
      propertyName: property?.name || property?.address || "All linked properties",
    };
  }

  function addInvoiceLineItem() {
    setInvoiceDraftDirty(true);
    setInvoiceLineItems((items) => [
      ...items,
      {
        id: `custom-${Date.now()}`,
        description: "",
        category: "expense",
        quantity: 1,
        rate: 0,
      },
    ]);
  }

  function removeInvoiceLineItem(id: string) {
    setInvoiceDraftDirty(true);
    setInvoiceLineItems((items) =>
      items.length === 1 ? items : items.filter((item) => item.id !== id)
    );
  }

  function autoPopulateInvoiceItems() {
    if (!invoicePropertyId) {
      setError("Choose a property before auto-populating invoice items.");
      return;
    }

    const {
      turnover: turnoverRate,
      grounds: groundsRate,
      billTurnover,
      billGrounds,
    } = getPropertyInvoiceRate(invoicePropertyId);
    const generated: OwnerInvoiceLineItem[] = [];

    if (invoiceAutoTurnover && billTurnover && turnoverRate > 0) {
      for (const job of jobs.filter((item) => item.property_id === invoicePropertyId)) {
        generated.push({
          id: `turnover-${job.id}`,
          description: `Turnover cleaning - ${formatDateLabel(job.scheduled_for || job.created_at?.slice(0, 10) || null)}`,
          category: "turnover",
          quantity: Number(job.cleaner_units_needed || 1),
          rate: turnoverRate,
          source_id: job.id,
        });
      }
    }

    if (invoiceAutoGrounds && billGrounds && groundsRate > 0) {
      for (const job of groundsJobs.filter((item) => item.property_id === invoicePropertyId)) {
        generated.push({
          id: `grounds-${job.id}`,
          description: `${job.job_type || "Grounds service"} - ${formatDateLabel(job.scheduled_for || job.created_at?.slice(0, 10) || null)}`,
          category: "grounds",
          quantity: Number(job.grounds_units_needed || 1),
          rate: groundsRate,
          source_id: job.id,
        });
      }
    }

    setInvoiceLineItems((items) => {
      const customItems = items.filter((item) => !item.source_id && item.description.trim());
      return generated.length > 0
        ? [...generated, ...customItems]
        : customItems.length > 0
          ? customItems
          : [{ id: "custom-1", description: "", category: "expense", quantity: 1, rate: 0 }];
    });
    setInvoiceDraftDirty(true);
    setActionMessage(
      generated.length > 0
        ? `Added ${generated.length} job line item${generated.length === 1 ? "" : "s"} from this property.`
        : "No billable jobs found. Check that this property is set to bill the owner for cleaning or grounds, and that rates are saved."
    );
  }

  async function saveInvoiceSettings() {
    if (!currentOrganizationId) return;

    setSavingInvoiceSettings(true);
    setError("");
    setActionMessage("");

    try {
      const savedTaxLines = invoiceTaxLines
        .map((line) => ({
          id: line.id,
          label: line.label.trim(),
          rate: Number(line.rate || 0),
          enabled: line.enabled !== false,
        }))
        .filter((line) => line.label || line.rate > 0);
      const { error } = await supabase.from("organization_invoice_settings").upsert({
        organization_id: currentOrganizationId,
        company_name: invoiceCompanyName.trim() || null,
        logo_url: invoiceLogoUrl.trim() || null,
        from_email: invoiceFromEmail.trim().toLowerCase() || null,
        reply_to_email: invoiceReplyToEmail.trim().toLowerCase() || null,
        header_text: invoiceHeaderText.trim() || null,
        tax_lines: savedTaxLines,
        auto_add_turnover: invoiceAutoTurnover,
        auto_add_grounds: invoiceAutoGrounds,
        payment_instructions: invoicePaymentInstructions.trim() || null,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      const rateRows = properties.map((property) => ({
        organization_id: currentOrganizationId,
        property_id: property.id,
        turnover_rate: Number(propertyInvoiceRateDrafts[property.id]?.turnover || 0),
        grounds_rate: Number(propertyInvoiceRateDrafts[property.id]?.grounds || 0),
        bill_turnover_to_owner: propertyInvoiceRateDrafts[property.id]?.billTurnover ?? false,
        bill_grounds_to_owner: propertyInvoiceRateDrafts[property.id]?.billGrounds ?? false,
        updated_at: new Date().toISOString(),
      }));

      if (rateRows.length > 0) {
        const { error: rateError } = await supabase
          .from("property_invoice_rates")
          .upsert(rateRows, { onConflict: "property_id" });

        if (rateError) throw rateError;
      }

      setInvoiceSettingsDirty(false);
      setDirtyPropertyInvoiceRateIds(new Set());
      setActionMessage("Invoice defaults saved.");
      await loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not save invoice defaults."));
    } finally {
      setSavingInvoiceSettings(false);
    }
  }

  async function savePropertyInvoiceRate(propertyId: string) {
    if (!currentOrganizationId) return;

    const property = properties.find((item) => item.id === propertyId);
    if (!property) {
      setError("Property not found.");
      return;
    }

    const draft = propertyInvoiceRateDrafts[propertyId] || {
      turnover: "0",
      grounds: "0",
      billTurnover: false,
      billGrounds: false,
    };

    setSavingPropertyRateId(propertyId);
    setError("");
    setActionMessage("");

    try {
      const payload = {
        organization_id: currentOrganizationId,
        property_id: propertyId,
        turnover_rate: Number(draft.turnover || 0),
        grounds_rate: Number(draft.grounds || 0),
        bill_turnover_to_owner: draft.billTurnover,
        bill_grounds_to_owner: draft.billGrounds,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("property_invoice_rates")
        .upsert(payload, { onConflict: "property_id" });

      if (error) throw error;

      setPropertyInvoiceRates((rates) => {
        const nextRate = payload as PropertyInvoiceRateRow;
        const existing = rates.some((rate) => rate.property_id === propertyId);
        return existing
          ? rates.map((rate) => (rate.property_id === propertyId ? nextRate : rate))
          : [nextRate, ...rates];
      });
      setDirtyPropertyInvoiceRateIds((ids) => {
        const next = new Set(ids);
        next.delete(propertyId);
        return next;
      });
      setActionMessage(`Saved invoice rates for ${property.name || property.address || "property"}.`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not save property invoice rates."));
    } finally {
      setSavingPropertyRateId(null);
    }
  }

  async function createOwnerInvoice(status: "draft" | "sent" = "draft") {
    if (!currentOrganizationId) return;
    const effectiveOwnerId = getInvoiceOwnerId();
    const editingInvoice = editingOwnerInvoiceId
      ? ownerInvoices.find((invoice) => invoice.id === editingOwnerInvoiceId)
      : null;

    if (!effectiveOwnerId) {
      setError("Choose an owner for this invoice.");
      return;
    }

    const validLineItems = getValidInvoiceLineItems();

    if (validLineItems.length === 0) {
      setError("Add at least one invoice line item.");
      return;
    }

    const subtotal = getInvoiceLineItemsTotal(validLineItems);
    const taxLines = getInvoiceTaxLinesForSubtotal(subtotal);
    const taxTotal = taxLines.reduce((sum, line) => sum + line.amount, 0);
    const total = subtotal + taxTotal;
    const invoiceNumber = editingInvoice?.invoice_number || `INV-${Date.now().toString().slice(-8)}`;

    setCreatingInvoice(true);
    setError("");
    setActionMessage("");

    try {
      const timestamp = new Date().toISOString();
      const invoicePayload = {
        owner_account_id: effectiveOwnerId,
        property_id: invoicePropertyId || null,
        invoice_number: invoiceNumber,
        status,
        issue_date: invoiceIssueDate || getTodayYmd(),
        due_date: invoiceDueDate || null,
        company_name: invoiceCompanyName.trim() || null,
        logo_url: invoiceLogoUrl.trim() || null,
        from_email: invoiceFromEmail.trim().toLowerCase() || null,
        reply_to_email: invoiceReplyToEmail.trim().toLowerCase() || null,
        header_text: invoiceHeaderText.trim() || null,
        tax_lines: taxLines,
        notes: invoiceNotes.trim() || null,
        payment_instructions: invoicePaymentInstructions.trim() || null,
        line_items: validLineItems,
        subtotal,
        tax_total: taxTotal,
        total,
        sent_at: status === "sent" ? timestamp : editingInvoice?.sent_at || null,
        sent_by_profile_id: status === "sent" ? currentAdminUserId : null,
        updated_at: timestamp,
      };

      const { data, error } = editingOwnerInvoiceId
        ? await supabase
            .from("owner_invoices")
            .update(invoicePayload)
            .eq("id", editingOwnerInvoiceId)
            .eq("organization_id", currentOrganizationId)
            .select()
            .single()
        : await supabase
            .from("owner_invoices")
            .insert({
              organization_id: currentOrganizationId,
              ...invoicePayload,
              sent_at: status === "sent" ? timestamp : null,
              sent_by_profile_id: status === "sent" ? currentAdminUserId : null,
              created_by_profile_id: currentAdminUserId,
            })
            .select()
            .single();

      if (error) throw error;

      if (status === "sent" && data?.id) {
        await sendOwnerInvoiceEmail(data.id, invoiceCcEmails);
      }

      setActionMessage(
        status === "sent"
          ? editingOwnerInvoiceId
            ? "Running invoice sent to owner."
            : "Invoice created and sent to owner."
          : editingOwnerInvoiceId
            ? "Running invoice updated."
            : "Running invoice draft created."
      );
      if (status === "sent") {
        resetInvoiceComposer();
      } else {
        setEditingOwnerInvoiceId(data?.id || editingOwnerInvoiceId);
        setInvoiceDraftDirty(false);
      }
      await loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not create invoice."));
    } finally {
      setCreatingInvoice(false);
    }
  }

  async function createUploadedOwnerInvoice(status: "draft" | "sent" = "draft") {
    if (!currentOrganizationId) return;
    const effectiveOwnerId = getInvoiceOwnerId();
    const amount = Number(externalInvoiceAmount || 0);

    if (!effectiveOwnerId) {
      setError("Choose an owner for this uploaded invoice.");
      return;
    }

    if (!externalInvoiceUrl) {
      setError("Upload an invoice file before saving.");
      return;
    }

    if (amount < 0 || Number.isNaN(amount)) {
      setError("Enter a valid invoice amount.");
      return;
    }

    const invoiceNumber = externalInvoiceNumber.trim() || `UPL-${Date.now().toString().slice(-8)}`;

    setCreatingInvoice(true);
    setError("");
    setActionMessage("");

    try {
      const uploadedLineItems: OwnerInvoiceLineItem[] =
        amount > 0
          ? [
              {
                id: "uploaded-invoice",
                description: externalInvoiceName || "Uploaded invoice",
                category: "other",
                quantity: 1,
                rate: amount,
              },
            ]
          : [];

      const { data, error } = await supabase
        .from("owner_invoices")
        .insert({
          organization_id: currentOrganizationId,
          owner_account_id: effectiveOwnerId,
          property_id: invoicePropertyId || null,
          invoice_number: invoiceNumber,
          status,
          issue_date: invoiceIssueDate || getTodayYmd(),
          due_date: invoiceDueDate || null,
          company_name: invoiceCompanyName.trim() || null,
          logo_url: invoiceLogoUrl.trim() || null,
          from_email: invoiceFromEmail.trim().toLowerCase() || null,
          reply_to_email: invoiceReplyToEmail.trim().toLowerCase() || null,
          header_text: invoiceHeaderText.trim() || null,
          notes: invoiceNotes.trim() || null,
          payment_instructions: invoicePaymentInstructions.trim() || null,
          line_items: uploadedLineItems,
          subtotal: amount,
          tax_lines: [],
          tax_total: 0,
          total: amount,
          invoice_source: "uploaded",
          uploaded_invoice_url: externalInvoiceUrl,
          uploaded_invoice_name: externalInvoiceName || `${invoiceNumber}.pdf`,
          uploaded_invoice_content_type: externalInvoiceContentType || "application/pdf",
          sent_at: status === "sent" ? new Date().toISOString() : null,
          sent_by_profile_id: status === "sent" ? currentAdminUserId : null,
          created_by_profile_id: currentAdminUserId,
        })
        .select()
        .single();

      if (error) throw error;

      if (status === "sent" && data?.id) {
        await sendOwnerInvoiceEmail(data.id, invoiceCcEmails);
      }

      setExternalInvoiceUrl("");
      setExternalInvoiceName("");
      setExternalInvoiceContentType("");
      setExternalInvoiceNumber("");
      setExternalInvoiceAmount("");
      setInvoiceNotes("");
      setInvoiceDraftDirty(false);
      setActionMessage(status === "sent" ? "Uploaded invoice saved and emailed." : "Uploaded invoice saved as draft.");
      await loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not save uploaded invoice."));
    } finally {
      setCreatingInvoice(false);
    }
  }

  async function sendOwnerInvoiceEmail(invoiceId: string, ccEmails = "") {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error("Could not verify your admin session.");
    }

    const response = await fetch("/api/admin/send-owner-invoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ invoiceId, ccEmails }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || "Could not send invoice email.");
    }
  }

  async function previewInvoicePdf() {
    const validLineItems = getValidInvoiceLineItems();

    if (validLineItems.length === 0) {
      setError("Add at least one invoice line item before previewing the PDF.");
      return;
    }

    setError("");
    setPreviewingInvoicePdf(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Could not verify your admin session.");
      }

      const context = getInvoiceRecipientContext();
      const subtotal = getInvoiceLineItemsTotal(validLineItems);
      const taxLines = getInvoiceTaxLinesForSubtotal(subtotal);
      const taxTotal = taxLines.reduce((sum, line) => sum + line.amount, 0);
      const response = await fetch("/api/admin/preview-owner-invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          invoiceNumber: "PREVIEW",
          companyName: invoiceCompanyName.trim() || "Property invoice",
          logoUrl: invoiceLogoUrl.trim() || null,
          ownerName: context.ownerName,
          ownerEmail: context.ownerEmail,
          propertyName: context.propertyName,
          issueDate: invoiceIssueDate || getTodayYmd(),
          dueDate: invoiceDueDate || null,
          headerText: invoiceHeaderText.trim() || null,
          notes: invoiceNotes.trim() || null,
          paymentInstructions: invoicePaymentInstructions.trim() || null,
          subtotal,
          taxLines,
          taxTotal,
          total: subtotal + taxTotal,
          lineItems: validLineItems,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Could not generate invoice PDF preview.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not preview invoice PDF."));
    } finally {
      setPreviewingInvoicePdf(false);
    }
  }

  async function sendExistingOwnerInvoice(invoiceId: string) {
    setSendingInvoiceId(invoiceId);
    setError("");
    setActionMessage("");

    try {
      await sendOwnerInvoiceEmail(invoiceId, invoiceCcEmails);
      setActionMessage("Invoice sent to owner.");
      await loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not send invoice."));
    } finally {
      setSendingInvoiceId(null);
    }
  }

  async function updateOwnerInvoiceStatus(invoice: OwnerInvoiceRow, status: OwnerInvoiceRow["status"]) {
    setUpdatingInvoiceStatusId(invoice.id);
    setError("");
    setActionMessage("");

    try {
      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === "sent" && !invoice.sent_at) {
        updates.sent_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("owner_invoices")
        .update(updates)
        .eq("id", invoice.id)
        .eq("organization_id", currentOrganizationId);

      if (error) throw error;

      setOwnerInvoices((invoices) =>
        invoices.map((item) => (item.id === invoice.id ? { ...item, status } : item))
      );
      setActionMessage(status === "paid" ? "Invoice marked as paid." : "Invoice marked as unpaid.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not update invoice status."));
    } finally {
      setUpdatingInvoiceStatusId(null);
    }
  }

  async function deleteOwnerInvoice(invoice: OwnerInvoiceRow) {
    const confirmed = window.confirm(
      `Delete invoice ${invoice.invoice_number}?\n\nThis permanently removes it from admin and owner invoice history. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingInvoiceId(invoice.id);
    setError("");
    setActionMessage("");

    try {
      const { error } = await supabase
        .from("owner_invoices")
        .delete()
        .eq("id", invoice.id)
        .eq("organization_id", currentOrganizationId);

      if (error) throw error;

      setOwnerInvoices((invoices) => invoices.filter((item) => item.id !== invoice.id));
      if (editingOwnerInvoiceId === invoice.id) {
        resetInvoiceComposer();
      }
      setActionMessage(`Invoice ${invoice.invoice_number} deleted.`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not delete invoice."));
    } finally {
      setDeletingInvoiceId(null);
    }
  }

  function renderInvoicesSection() {
    const ownerProperties = invoiceOwnerId ? getPropertiesForOwner(invoiceOwnerId) : properties;
    const invoiceSubtotal = getInvoiceLineItemsTotal(invoiceLineItems);
    const invoiceTaxLinesWithAmounts = getInvoiceTaxLinesForSubtotal(invoiceSubtotal);
    const invoiceTaxTotal = invoiceTaxLinesWithAmounts.reduce((sum, line) => sum + line.amount, 0);
    const invoiceTotal = invoiceSubtotal + invoiceTaxTotal;
    const editingInvoice = editingOwnerInvoiceId
      ? ownerInvoices.find((invoice) => invoice.id === editingOwnerInvoiceId)
      : null;
    const draftInvoices = ownerInvoices.filter((invoice) => invoice.status === "draft");
    const activeInvoices = ownerInvoices.filter((invoice) => invoice.status === "sent");
    const paidInvoices = ownerInvoices.filter((invoice) => invoice.status === "paid" || invoice.status === "void");
    const invoiceWorkflowOptions: Array<{ key: InvoiceWorkflowTab; title: string; description: string; meta: string }> = [
      {
        key: "create",
        title: "Create owner invoice",
        description: "Build a regular invoice, preview the PDF, then send it to the owner.",
        meta: `${activeInvoices.length} unpaid`,
      },
      {
        key: "running",
        title: "Create running invoice",
        description: "Open or save a draft that you add to throughout the month before sending.",
        meta: `${draftInvoices.length} draft${draftInvoices.length === 1 ? "" : "s"}`,
      },
      {
        key: "existing",
        title: "Send existing invoice",
        description: "Upload a PDF or image invoice from another system and email it through the portal.",
        meta: "Upload file",
      },
      {
        key: "defaults",
        title: "Defaults and rates",
        description: "Set branding, taxes, payment instructions, and property-specific cleaning rates.",
        meta: `${properties.length} propert${properties.length === 1 ? "y" : "ies"}`,
      },
      {
        key: "history",
        title: "Invoice history",
        description: "Review drafts, sent invoices, paid invoices, downloads, and resend actions.",
        meta: `${ownerInvoices.length} total`,
      },
    ];
    const showInvoiceDefaults = invoiceWorkflowTab === "defaults";
    const showExistingInvoiceUpload = invoiceWorkflowTab === "existing";
    const showInvoiceBuilder = invoiceWorkflowTab === "create" || invoiceWorkflowTab === "running";
    const showInvoiceHistory = invoiceWorkflowTab === "history" || invoiceWorkflowTab === "running";
    const renderInvoiceHistoryCard = (invoice: OwnerInvoiceRow) => {
      const owner = ownerAccounts.find((item) => item.id === invoice.owner_account_id);
      const property = properties.find((item) => item.id === invoice.property_id);
      const isPaidInvoice = invoice.status === "paid";
      const isDraftInvoice = invoice.status === "draft";

      return (
        <div
          key={invoice.id}
          className={`rounded-[20px] border p-4 shadow-sm ${
            isDraftInvoice
              ? "border-[#d4c2ea] bg-[#fbf8ff] shadow-[0_16px_34px_rgba(91,62,126,0.08)]"
              : isPaidInvoice
                ? "border-[#9bd4a3] bg-[#edf9ef] shadow-[0_16px_34px_rgba(35,107,48,0.08)]"
                : "border-[#f0b8b8] bg-[#fff1f1] shadow-[0_16px_34px_rgba(153,27,27,0.08)]"
          }`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-semibold ${
                  isDraftInvoice ? "text-[#5f3f86]" : isPaidInvoice ? "text-[#123f1b]" : "text-[#7f1d1d]"
                }`}>
                  {invoice.invoice_number}
                </span>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  isDraftInvoice
                    ? "border-[#d4c2ea] bg-white text-[#6f4b9a]"
                    : isPaidInvoice
                      ? "border-[#bbdfc0] bg-[#f0fbf2] text-[#236b30]"
                      : "border-[#fecaca] bg-white text-[#991b1b]"
                }`}>
                  {isDraftInvoice ? "running draft" : isPaidInvoice ? "paid" : invoice.status}
                </span>
                {invoice.invoice_source === "uploaded" ? (
                  <span className="rounded-full border border-[#d4c2ea] bg-white px-2.5 py-0.5 text-xs font-semibold text-[#6f4b9a]">
                    uploaded file
                  </span>
                ) : null}
              </div>
              <div className={`mt-1 text-sm ${
                isDraftInvoice ? "text-[#6f4b9a]" : isPaidInvoice ? "text-[#2f5f36]" : "text-[#7f4242]"
              }`}>
                {owner?.full_name || owner?.email || "Owner"} | {property?.name || property?.address || "All properties"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className={`text-lg font-semibold ${
                isDraftInvoice ? "text-[#5f3f86]" : isPaidInvoice ? "text-[#123f1b]" : "text-[#7f1d1d]"
              }`}>
                {formatCurrency(invoice.total)}
              </div>
              {isDraftInvoice && invoice.invoice_source !== "uploaded" ? (
                <button
                  type="button"
                  onClick={() => loadOwnerInvoiceDraft(invoice)}
                  className="rounded-full border border-[#d4c2ea] bg-white px-4 py-2 text-sm font-medium text-[#6f4b9a] hover:bg-[#f6efff]"
                >
                  Open draft
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => downloadInvoiceCsv(invoice, owner, property)}
                className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-medium text-[#5f4c3b] hover:bg-[#f7f1e8]"
              >
                CSV
              </button>
              {invoice.uploaded_invoice_url ? (
                <a
                  href={invoice.uploaded_invoice_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[#d4c2ea] bg-white px-4 py-2 text-sm font-medium text-[#6f4b9a] hover:bg-[#f6efff]"
                >
                  File
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => void updateOwnerInvoiceStatus(invoice, invoice.status === "paid" ? "sent" : "paid")}
                disabled={updatingInvoiceStatusId === invoice.id}
                className={`rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-60 ${
                  invoice.status === "paid"
                    ? "border-[#d8c7ab] bg-white text-[#5f4c3b] hover:bg-[#f7f1e8]"
                    : "border-[#bbdfc0] bg-[#f0fbf2] text-[#236b30] hover:bg-[#e4f7e8]"
                }`}
              >
                {updatingInvoiceStatusId === invoice.id
                  ? "Updating..."
                  : invoice.status === "paid"
                    ? "Mark unpaid"
                    : "Mark paid"}
              </button>
              <button
                type="button"
                onClick={() => void sendExistingOwnerInvoice(invoice.id)}
                disabled={sendingInvoiceId === invoice.id}
                className="rounded-full bg-[#241c15] px-4 py-2 text-sm font-medium text-[#f8f2e8] disabled:opacity-60"
              >
                {sendingInvoiceId === invoice.id
                  ? "Sending..."
                  : invoice.invoice_source === "uploaded"
                    ? invoice.status === "draft"
                      ? "Send file"
                      : "Resend file"
                    : invoice.status === "draft"
                      ? "Send PDF"
                      : "Resend PDF"}
              </button>
              <button
                type="button"
                onClick={() => void deleteOwnerInvoice(invoice)}
                disabled={deletingInvoiceId === invoice.id}
                className="rounded-full border border-[#efc6c6] bg-[#fff5f5] px-4 py-2 text-sm font-medium text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:opacity-60"
              >
                {deletingInvoiceId === invoice.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      );
    };
    const renderInvoiceHistoryGroup = (
      key: keyof typeof invoiceHistoryOpenSections,
      title: string,
      invoices: OwnerInvoiceRow[],
      emptyLabel: string
    ) => (
      <div className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7]">
        <button
          type="button"
          onClick={() => toggleInvoiceHistorySection(key)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="font-semibold text-[#241c15]">{title}</span>
          <span className="rounded-full border border-[#d8c7ab] bg-white px-3 py-1 text-xs font-semibold text-[#6f6255]">
            {invoices.length} {invoiceHistoryOpenSections[key] ? "Hide" : "Show"}
          </span>
        </button>
        {invoiceHistoryOpenSections[key] ? (
          <div className="space-y-3 border-t border-[#eadfce] p-3">
            {invoices.length > 0 ? (
              invoices.map(renderInvoiceHistoryCard)
            ) : (
              <div className="rounded-[18px] border border-dashed border-[#d8c7ab] bg-white p-4 text-sm text-[#7f7263]">
                {emptyLabel}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );

    return (
      <div className="space-y-6">
        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a7b68]">Owner billing</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#241c15]">Invoices</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#7f7263]">
              Choose the invoice task you want to work on. Each area stays focused so you do not have to scroll through every invoice tool at once.
            </p>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-5">
            {invoiceWorkflowOptions.map((option) => {
              const selected = invoiceWorkflowTab === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setInvoiceWorkflowTab(option.key)}
                  className={`rounded-[20px] border p-4 text-left transition ${
                    selected
                      ? "border-[#241c15] bg-[#241c15] text-[#f8f2e8] shadow-[0_16px_34px_rgba(36,28,21,0.16)]"
                      : "border-[#eadfce] bg-[#fcfaf7] text-[#241c15] hover:border-[#d8c7ab] hover:bg-white"
                  }`}
                >
                  <div className={`text-sm font-semibold ${selected ? "text-white" : "text-[#241c15]"}`}>
                    {option.title}
                  </div>
                  <p className={`mt-2 text-xs leading-5 ${selected ? "text-[#eadfce]" : "text-[#6f6255]"}`}>
                    {option.description}
                  </p>
                  <div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    selected
                      ? "border-white/20 bg-white/10 text-[#f8f2e8]"
                      : "border-[#d8c7ab] bg-white text-[#6f6255]"
                  }`}>
                    {option.meta}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className={`${showInvoiceDefaults ? "" : "hidden"} rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a7b68]">Owner billing</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#241c15]">Defaults and rates</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#7f7263]">
                Set your invoice branding, auto-fill job charges from turnover and grounds work, then add custom expenses like supplies.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void saveInvoiceSettings()}
              disabled={savingInvoiceSettings}
              className="rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60"
            >
              {savingInvoiceSettings ? "Saving..." : "Save defaults"}
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-4">
              <h3 className="text-base font-semibold text-[#241c15]">Branding and header</h3>
              <div className="mt-4 grid gap-3">
                <input
                  className="rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  placeholder="Company name"
                  value={invoiceCompanyName}
                  onChange={(e) => {
                    setInvoiceSettingsDirty(true);
                    setInvoiceCompanyName(e.target.value);
                  }}
                />
                {invoiceLogoUrl ? (
                  <div className="rounded-[18px] border border-[#d9ccbb] bg-white p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-[14px] border border-[#eadfce] bg-[#fcfaf7]">
                          <img
                            src={invoiceLogoUrl}
                            alt="Invoice logo preview"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[#241c15]">Logo uploaded</div>
                          <div className="mt-1 text-xs text-[#7f7263]">This logo will appear on invoice emails and previews.</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-[#d8c7ab] bg-white px-3 py-1.5 text-xs font-medium text-[#5f4c3b] transition hover:bg-[#f7f1e8]">
                          Replace
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingInvoiceLogo}
                            onChange={(e) => void uploadInvoiceLogo(e)}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setInvoiceSettingsDirty(true);
                            setInvoiceLogoUrl("");
                          }}
                          className="rounded-full border border-[#efc6c6] bg-[#fff5f5] px-3 py-1.5 text-xs font-medium text-[#8a2e22]"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm font-medium text-[#5f4c3b] transition hover:bg-[#f7f1e8]">
                    {uploadingInvoiceLogo ? "Uploading logo..." : "Upload logo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingInvoiceLogo}
                      onChange={(e) => void uploadInvoiceLogo(e)}
                    />
                  </label>
                )}
                <input
                  className="rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  placeholder="From email (must be verified in Resend)"
                  value={invoiceFromEmail}
                  onChange={(e) => {
                    setInvoiceSettingsDirty(true);
                    setInvoiceFromEmail(e.target.value);
                  }}
                />
                <input
                  className="rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  placeholder="Reply-to email"
                  value={invoiceReplyToEmail}
                  onChange={(e) => {
                    setInvoiceSettingsDirty(true);
                    setInvoiceReplyToEmail(e.target.value);
                  }}
                />
                <textarea
                  className="min-h-[96px] rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  placeholder="Custom invoice header"
                  value={invoiceHeaderText}
                  onChange={(e) => {
                    setInvoiceSettingsDirty(true);
                    setInvoiceHeaderText(e.target.value);
                  }}
                />
                <textarea
                  className="min-h-[80px] rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  placeholder="Payment instructions"
                  value={invoicePaymentInstructions}
                  onChange={(e) => {
                    setInvoiceSettingsDirty(true);
                    setInvoicePaymentInstructions(e.target.value);
                  }}
                />
                <div className="rounded-[18px] border border-[#eadfce] bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[#241c15]">Taxes</div>
                    <button
                      type="button"
                      onClick={addInvoiceTaxLine}
                      className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-3 py-1.5 text-xs font-medium text-[#5f4c3b] transition hover:bg-[#f7f1e8]"
                    >
                      Add tax
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {invoiceTaxLines.map((taxLine) => (
                      <div key={taxLine.id} className={`grid gap-2 rounded-[16px] border p-2 sm:grid-cols-[110px_1fr_120px_auto] sm:items-end ${
                        taxLine.enabled === false
                          ? "border-[#eadfce] bg-[#f7f3ee] opacity-70"
                          : "border-[#eadfce] bg-[#fcfaf7]"
                      }`}>
                        <label className="flex items-center gap-2 rounded-[14px] bg-white px-3 py-2 text-xs font-semibold text-[#5f5245] sm:mb-0.5">
                          <input
                            type="checkbox"
                            checked={taxLine.enabled !== false}
                            onChange={(e) => updateInvoiceTaxLine(taxLine.id, { enabled: e.target.checked })}
                            className="h-4 w-4 accent-[#b48d4e]"
                          />
                          Apply
                        </label>
                        <label className="text-xs font-medium text-[#5f5245]">
                          Tax label
                          <input
                            className="mt-1 w-full rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none focus:border-[#b48d4e]"
                            placeholder="HST, GST, PST, VAT"
                            value={taxLine.label}
                            onChange={(e) => updateInvoiceTaxLine(taxLine.id, { label: e.target.value })}
                          />
                        </label>
                        <label className="text-xs font-medium text-[#5f5245]">
                          Rate %
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            className="mt-1 w-full rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none focus:border-[#b48d4e]"
                            placeholder="13"
                            value={taxLine.rate}
                            onChange={(e) => updateInvoiceTaxLine(taxLine.id, { rate: e.target.value })}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => removeInvoiceTaxLine(taxLine.id)}
                          className="rounded-full border border-[#efc6c6] bg-[#fff5f5] px-3 py-2 text-xs font-medium text-[#8a2e22]"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-[#eadfce] bg-white p-4">
              <h3 className="text-base font-semibold text-[#241c15]">Property rates</h3>
              <div className="mt-4 max-h-[280px] space-y-3 overflow-y-auto pr-1">
                {properties.length === 0 ? (
                  <div className="rounded-[18px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] p-4 text-sm text-[#7f7263]">
                    Add properties before setting invoice rates.
                  </div>
                ) : (
                  properties.map((property) => {
                    const draft = propertyInvoiceRateDrafts[property.id] || {
                      turnover: "0",
                      grounds: "0",
                      billTurnover: false,
                      billGrounds: false,
                    };
                    const saved = getSavedPropertyInvoiceRate(property.id);
                    const hasUnsavedChanges = hasUnsavedPropertyInvoiceRate(property.id);

                    return (
                      <div key={property.id} className="rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-[#241c15]">
                              {property.name || property.address || "Unnamed property"}
                            </div>
                            <div className="mt-1 text-xs text-[#7f7263]">
                              Saved: turnover {formatCurrency(saved.turnover)} | grounds {formatCurrency(saved.grounds)}
                            </div>
                            <div className="mt-1 text-xs text-[#7f7263]">
                              Auto-bill: cleaning {saved.billTurnover ? "on" : "off"} | grounds {saved.billGrounds ? "on" : "off"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void savePropertyInvoiceRate(property.id)}
                            disabled={savingPropertyRateId === property.id || !hasUnsavedChanges}
                            className="rounded-full bg-[#241c15] px-3 py-1.5 text-xs font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingPropertyRateId === property.id
                              ? "Saving..."
                              : hasUnsavedChanges
                                ? "Save rates"
                                : "Saved"}
                          </button>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-medium text-[#5f5245]">
                            Cleaning rate
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="mt-1 w-full rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none focus:border-[#b48d4e]"
                              value={draft.turnover}
                              onChange={(e) => updatePropertyInvoiceRateDraft(property.id, "turnover", e.target.value)}
                            />
                          </label>
                          <label className="text-xs font-medium text-[#5f5245]">
                            Grounds rate
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="mt-1 w-full rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none focus:border-[#b48d4e]"
                              value={draft.grounds}
                              onChange={(e) => updatePropertyInvoiceRateDraft(property.id, "grounds", e.target.value)}
                            />
                          </label>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-[#5f5245] sm:grid-cols-2">
                          <label className="flex items-center gap-2 rounded-[14px] border border-[#eadfce] bg-white px-3 py-2">
                            <input
                              type="checkbox"
                              checked={draft.billTurnover}
                              onChange={(e) => updatePropertyInvoiceRateDraft(property.id, "billTurnover", e.target.checked)}
                              className="h-4 w-4 accent-[#b48d4e]"
                            />
                            Bill owner for cleanings
                          </label>
                          <label className="flex items-center gap-2 rounded-[14px] border border-[#eadfce] bg-white px-3 py-2">
                            <input
                              type="checkbox"
                              checked={draft.billGrounds}
                              onChange={(e) => updatePropertyInvoiceRateDraft(property.id, "billGrounds", e.target.checked)}
                              className="h-4 w-4 accent-[#b48d4e]"
                            />
                            Bill owner for grounds
                          </label>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="mt-4 grid gap-2 text-sm text-[#5f5245]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={invoiceAutoTurnover}
                    onChange={(e) => {
                      setInvoiceSettingsDirty(true);
                      setInvoiceAutoTurnover(e.target.checked);
                    }}
                  />
                  Auto-populate turnover jobs
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={invoiceAutoGrounds}
                    onChange={(e) => {
                      setInvoiceSettingsDirty(true);
                      setInvoiceAutoGrounds(e.target.checked);
                    }}
                  />
                  Auto-populate grounds jobs
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className={`${showExistingInvoiceUpload ? "" : "hidden"} rounded-[30px] border border-[#d4c2ea] bg-[#fbf8ff] p-5 shadow-[0_18px_45px_rgba(91,62,126,0.06)]`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6f4b9a]">Uploaded invoices</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-[#241c15]">Send an existing invoice file</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6f6255]">
                Upload a PDF or image invoice from another system, then save or email it through the same owner invoice history.
              </p>
            </div>
            <span className="rounded-full border border-[#d4c2ea] bg-white px-3 py-1 text-xs font-semibold text-[#6f4b9a]">
              Uses selected owner/property above
            </span>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="md:col-span-2 flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed border-[#bda4dd] bg-white px-4 py-6 text-center transition hover:bg-[#f6efff]">
                <span className="text-sm font-semibold text-[#241c15]">
                  {uploadingExternalInvoice
                    ? "Uploading invoice..."
                    : externalInvoiceName
                      ? externalInvoiceName
                      : "Upload invoice PDF or image"}
                </span>
                <span className="mt-1 text-xs text-[#7f7263]">
                  This file becomes the invoice attachment owners receive and download.
                </span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  disabled={uploadingExternalInvoice}
                  onChange={(e) => void uploadExternalInvoiceFile(e.target.files)}
                />
              </label>

              <input
                className="rounded-[18px] border border-[#d4c2ea] bg-white px-4 py-3 text-sm outline-none focus:border-[#6f4b9a]"
                placeholder="Invoice number (optional)"
                value={externalInvoiceNumber}
                onChange={(e) => setExternalInvoiceNumber(e.target.value)}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                className="rounded-[18px] border border-[#d4c2ea] bg-white px-4 py-3 text-sm outline-none focus:border-[#6f4b9a]"
                placeholder="Invoice amount"
                value={externalInvoiceAmount}
                onChange={(e) => setExternalInvoiceAmount(e.target.value)}
              />

              {externalInvoiceUrl ? (
                <div className="md:col-span-2 flex flex-wrap items-center gap-2 rounded-[18px] border border-[#d4c2ea] bg-white px-4 py-3 text-sm text-[#5f5245]">
                  <a href={externalInvoiceUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#6f4b9a] underline">
                    Preview uploaded invoice
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setExternalInvoiceUrl("");
                      setExternalInvoiceName("");
                      setExternalInvoiceContentType("");
                    }}
                    className="rounded-full border border-[#efc6c6] bg-[#fff5f5] px-3 py-1 text-xs font-medium text-[#8a2e22]"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </div>

            <div className="rounded-[22px] border border-[#d4c2ea] bg-white p-4">
              <div className="text-sm font-semibold text-[#241c15]">How it will send</div>
              <p className="mt-2 text-sm leading-6 text-[#6f6255]">
                The email uses your invoice branding and owner portal link. The uploaded file is attached as the invoice document.
              </p>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => void createUploadedOwnerInvoice("draft")}
                  disabled={creatingInvoice || uploadingExternalInvoice}
                  className="rounded-full border border-[#d4c2ea] bg-white px-4 py-2.5 text-sm font-medium text-[#5f4c3b] transition hover:bg-[#f6efff] disabled:opacity-60"
                >
                  Save uploaded draft
                </button>
                <button
                  type="button"
                  onClick={() => void createUploadedOwnerInvoice("sent")}
                  disabled={creatingInvoice || uploadingExternalInvoice}
                  className="rounded-full bg-[#5f3f86] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#4b316b] disabled:opacity-60"
                >
                  Save and email uploaded invoice
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={`${showInvoiceBuilder ? "" : "hidden"} rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]`}>
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div>
              <div className={`mb-4 rounded-[22px] border p-4 ${
                editingInvoice
                  ? "border-[#d4c2ea] bg-[#fbf8ff]"
                  : "border-[#eadfce] bg-[#fcfaf7]"
              }`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8a7b68]">
                      {editingInvoice ? "Running invoice open" : "Invoice builder"}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-[#241c15]">
                      {editingInvoice
                        ? `${editingInvoice.invoice_number} is being edited`
                        : invoiceWorkflowTab === "running"
                          ? "Create a running invoice"
                          : "Create owner invoice"}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-[#6f6255]">
                      {invoiceWorkflowTab === "running"
                        ? "Save as draft to keep adding cleaning, grounds, supplies, and receipts until you are ready to send it."
                        : "Build an invoice, preview the PDF, and send it to the owner when it is ready."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resetInvoiceComposer}
                    className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-medium text-[#5f4c3b] transition hover:bg-[#f7f1e8]"
                  >
                    Start new invoice
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <select
                  className="rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  value={invoicePropertyId}
                  onChange={(e) => {
                    const propertyId = e.target.value;
                    const linkedOwner = propertyId ? getOwnerForProperty(propertyId) : null;
                    setInvoiceDraftDirty(true);
                    setInvoicePropertyId(propertyId);
                    setInvoiceOwnerId(linkedOwner?.id || "");
                  }}
                >
                  <option value="">Choose property</option>
                  {ownerProperties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name || property.address || "Unnamed property"}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  value={getInvoiceOwnerId()}
                  onChange={(e) => {
                    setInvoiceDraftDirty(true);
                    setInvoiceOwnerId(e.target.value);
                    setInvoicePropertyId("");
                  }}
                >
                  <option value="">Owner auto-selected</option>
                  {ownerAccounts.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.full_name || owner.email}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className="rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  value={invoiceIssueDate}
                  onChange={(e) => {
                    setInvoiceDraftDirty(true);
                    setInvoiceIssueDate(e.target.value);
                  }}
                />
                <input
                  type="date"
                  className="rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  value={invoiceDueDate}
                  onChange={(e) => {
                    setInvoiceDraftDirty(true);
                    setInvoiceDueDate(e.target.value);
                  }}
                />
                <input
                  className="rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e] md:col-span-2"
                  placeholder="CC email addresses, separated by commas"
                  value={invoiceCcEmails}
                  onChange={(e) => {
                    setInvoiceDraftDirty(true);
                    setInvoiceCcEmails(e.target.value);
                  }}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={autoPopulateInvoiceItems}
                  className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-2 text-sm font-medium text-[#5f4c3b] transition hover:bg-[#f7f1e8]"
                >
                  Auto-populate from jobs
                </button>
                <button
                  type="button"
                  onClick={addInvoiceLineItem}
                  className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-medium text-[#5f4c3b] transition hover:bg-[#fcfaf7]"
                >
                  Add custom expense
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {invoiceLineItems.map((item) => (
                  <div key={item.id} className="rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] p-3">
                    <div className="grid gap-2 md:grid-cols-[1fr_130px_110px_120px_auto] md:items-end">
                      <label className="text-xs font-medium text-[#5f5245]">
                        Description
                        <input
                          className="mt-1 w-full rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none focus:border-[#b48d4e]"
                          placeholder="Line item description"
                          value={item.description}
                          onChange={(e) => updateInvoiceLineItem(item.id, { description: e.target.value })}
                        />
                      </label>
                      <label className="text-xs font-medium text-[#5f5245]">
                        Category
                        <select
                          className="mt-1 w-full rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none focus:border-[#b48d4e]"
                          value={item.category}
                          onChange={(e) => updateInvoiceLineItem(item.id, { category: e.target.value as OwnerInvoiceLineItem["category"] })}
                        >
                          <option value="turnover">Turnover</option>
                          <option value="grounds">Grounds</option>
                          <option value="expense">Expense</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label className="text-xs font-medium text-[#5f5245]">
                        Quantity
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="mt-1 w-full rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none focus:border-[#b48d4e]"
                          value={item.quantity}
                          onChange={(e) => updateInvoiceLineItem(item.id, { quantity: e.target.value })}
                        />
                      </label>
                      <label className="text-xs font-medium text-[#5f5245]">
                        Rate
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="mt-1 w-full rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none focus:border-[#b48d4e]"
                          value={item.rate}
                          onChange={(e) => updateInvoiceLineItem(item.id, { rate: e.target.value })}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeInvoiceLineItem(item.id)}
                        className="rounded-full border border-[#efc6c6] bg-[#fff5f5] px-3 py-2 text-sm text-[#8a2e22]"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#eadfce] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f4c3b]">
                        Line total: {formatCurrency(getLineItemTotal(item))}
                      </span>
                      <label className="inline-flex cursor-pointer items-center rounded-full border border-[#d8c7ab] bg-white px-3 py-1.5 text-xs font-medium text-[#5f4c3b] hover:bg-[#f7f1e8]">
                        {uploadingReceiptLineItemId === item.id ? "Uploading..." : "Attach receipt"}
                        <input
                          type="file"
                          multiple
                          accept="image/*,.pdf"
                          className="hidden"
                          disabled={uploadingReceiptLineItemId === item.id}
                          onChange={(e) => void uploadInvoiceReceipts(item.id, e.target.files)}
                        />
                      </label>
                      {(item.receipt_urls || []).map((url, receiptIndex) => (
                        <span key={`${url}-${receiptIndex}`} className="inline-flex items-center gap-2 rounded-full border border-[#d8c7ab] bg-white px-3 py-1.5 text-xs text-[#5f4c3b]">
                          <a href={url} target="_blank" rel="noreferrer" className="underline">
                            {item.receipt_names?.[receiptIndex] || `Receipt ${receiptIndex + 1}`}
                          </a>
                          <button
                            type="button"
                            onClick={() => removeInvoiceReceipt(item.id, receiptIndex)}
                            className="font-semibold text-[#8a2e22]"
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <textarea
                className="mt-4 min-h-[90px] w-full rounded-[20px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                placeholder="Invoice notes"
                value={invoiceNotes}
                onChange={(e) => {
                  setInvoiceDraftDirty(true);
                  setInvoiceNotes(e.target.value);
                }}
              />
            </div>

            <aside className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8a7b68]">Preview</div>
              <div className="mt-3 rounded-[18px] border border-[#eadfce] bg-white p-4">
                {invoiceLogoUrl ? (
                  <img src={invoiceLogoUrl} alt="" className="mb-3 max-h-16 max-w-[180px] object-contain" />
                ) : null}
                <div className="text-lg font-semibold text-[#241c15]">{invoiceCompanyName || "Company name"}</div>
                <p className="mt-2 text-sm leading-6 text-[#6f6255]">{invoiceHeaderText || "Invoice header"}</p>
                <div className="mt-4 border-t border-[#eadfce] pt-3 text-sm text-[#5f5245]">
                  <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(invoiceSubtotal)}</span></div>
                  {invoiceTaxLinesWithAmounts.map((taxLine) =>
                    taxLine.rate > 0 || taxLine.amount > 0 ? (
                      <div key={taxLine.id} className="mt-2 flex justify-between">
                        <span>{taxLine.label} ({taxLine.rate}%)</span>
                        <span>{formatCurrency(taxLine.amount)}</span>
                      </div>
                    ) : null
                  )}
                  <div className="mt-2 flex justify-between text-lg font-semibold text-[#241c15]"><span>Total</span><span>{formatCurrency(invoiceTotal)}</span></div>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => void createOwnerInvoice("draft")}
                  disabled={creatingInvoice}
                  className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2.5 text-sm font-medium text-[#5f4c3b] transition hover:bg-[#fcfaf7] disabled:opacity-60"
                >
                  {editingInvoice ? "Save running invoice" : "Save as running invoice"}
                </button>
                <button
                  type="button"
                  onClick={() => void previewInvoicePdf()}
                  disabled={previewingInvoicePdf}
                  className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2.5 text-sm font-medium text-[#5f4c3b] transition hover:bg-[#fcfaf7] disabled:opacity-60"
                >
                  {previewingInvoicePdf ? "Opening..." : "Preview PDF"}
                </button>
                <button
                  type="button"
                  onClick={() => void createOwnerInvoice("sent")}
                  disabled={creatingInvoice}
                  className="rounded-full bg-[#241c15] px-4 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60"
                >
                  {creatingInvoice ? "Working..." : editingInvoice ? "Send running invoice" : "Create and send PDF"}
                </button>
              </div>
            </aside>
          </div>
        </section>

        <section className={`${showInvoiceHistory ? "" : "hidden"} rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-[#241c15]">Invoice history</h3>
              <p className="mt-1 text-sm text-[#7f7263]">
                Running drafts stay here until you open, update, and send them.
              </p>
            </div>
            <span className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-3 py-1 text-xs font-semibold text-[#6f6255]">
              {ownerInvoices.length} total
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {renderInvoiceHistoryGroup("drafts", "Running drafts", draftInvoices, "No running invoice drafts yet.")}
            {renderInvoiceHistoryGroup("active", "Sent and unpaid", activeInvoices, "No sent unpaid invoices.")}
            {renderInvoiceHistoryGroup("paid", "Paid and closed", paidInvoices, "No paid or closed invoices.")}
          </div>
        </section>
      </div>
    );
  }

  function renderAddPropertySection() {
    return (
      <section id="maintenance-flags-section" className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Add Property</h2>
            <p className="mt-1 text-sm text-[#7f7263]">
              Add a managed property manually or connect an Airbnb iCal feed to import bookings and create turnover jobs automatically.
            </p>
          </div>
          <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">
            Fast setup
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPropertyEntryMode("manual")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              propertyEntryMode === "manual"
                ? "bg-[#241c15] text-[#f8f2e8]"
                : "border border-[#d8c7ab] bg-white text-[#5f5245] hover:bg-[#fcfaf7]"
            }`}
          >
            Manual entry
          </button>
          <button
            type="button"
            onClick={() => setPropertyEntryMode("airbnb")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              propertyEntryMode === "airbnb"
                ? "bg-[#241c15] text-[#f8f2e8]"
                : "border border-[#d8c7ab] bg-white text-[#5f5245] hover:bg-[#fcfaf7]"
            }`}
          >
            Airbnb calendar import
          </button>
        </div>

        {propertyEntryMode === "manual" ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
            <div className="space-y-3">
              <input
                className="w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                placeholder="Property name"
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
              />

              <div className="grid gap-2 md:grid-cols-[1.3fr_0.7fr]">
                <input
                  className="w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  placeholder="Street Address"
                  value={propertyStreet}
                  onChange={(e) => setPropertyStreet(e.target.value)}
                />

                <input
                  className="w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  placeholder="Zip/Postal Code"
                  value={propertyPostal}
                  onChange={(e) => setPropertyPostal(e.target.value)}
                />
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <input
                  className="w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  placeholder="City"
                  value={propertyCity}
                  onChange={(e) => setPropertyCity(e.target.value)}
                />

                <input
                  className="w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  placeholder="State/Province"
                  value={propertyProvince}
                  onChange={(e) => setPropertyProvince(e.target.value)}
                />
              </div>

              <textarea
                className="min-h-[108px] w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                placeholder="Internal notes"
                value={propertyNotes}
                onChange={(e) => setPropertyNotes(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <div className="rounded-[22px] border border-[#eadfce] bg-[#fffaf4] p-4">
                <div className="text-sm font-medium text-[#5f5245]">Owner portal access</div>
                <p className="mt-1 text-xs text-[#8a7b68]">
                  Link the owner now so the property starts in the right portal.
                </p>

                <div className="mt-3 space-y-2">
                  <input
                    className="w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                    placeholder="Owner name"
                    value={propertyOwnerName}
                    onChange={(e) => setPropertyOwnerName(e.target.value)}
                  />
                  <input
                    className="w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                    placeholder="Owner email"
                    value={propertyOwnerEmail}
                    onChange={(e) => setPropertyOwnerEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                <div className="text-sm font-medium text-[#5f5245]">Cleaning defaults</div>

                <div className="mt-3 space-y-3">
                  <select
                    className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                    value={propertyUnitsNeeded}
                    onChange={(e) => setPropertyUnitsNeeded(e.target.value)}
                  >
                    <option value="1">Default cleaner units: 1</option>
                    <option value="2">Default cleaner units: 2</option>
                    <option value="3">Default cleaner units: 3</option>
                  </select>

                  <label className="flex items-start gap-2 text-sm text-[#6f6255]">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={propertyUnitsStrict}
                      onChange={(e) => setPropertyUnitsStrict(e.target.checked)}
                    />
                    <span>Full team required before the job is fully staffed</span>
                  </label>

                  <label className="flex items-start gap-2 text-sm text-[#6f6255]">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={propertyShowTeamStatus}
                      onChange={(e) => setPropertyShowTeamStatus(e.target.checked)}
                    />
                    <span>Show team status on cleaner page</span>
                  </label>
                </div>
              </div>

              <button
                className="inline-flex w-full items-center justify-center rounded-full bg-[#241c15] px-5 py-3 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]"
                onClick={() => void addProperty()}
              >
                Add Property
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-[22px] border border-[#eadfce] bg-[#fffaf4] p-4">
              <div className="text-sm font-medium text-[#5f5245]">What is automatic</div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <div className="rounded-[16px] border border-[#eadfce] bg-white px-4 py-3 text-sm text-[#6f6255]">
                  1. Paste the Airbnb iCal export URL from the listing calendar.
                </div>
                <div className="rounded-[16px] border border-[#eadfce] bg-white px-4 py-3 text-sm text-[#6f6255]">
                  2. Gulera OS creates the property and saves the active Airbnb feed.
                </div>
                <div className="rounded-[16px] border border-[#eadfce] bg-white px-4 py-3 text-sm text-[#6f6255]">
                  3. It immediately syncs booking dates, invoice history events, and future turnover jobs.
                </div>
              </div>
              <p className="mt-3 text-xs leading-6 text-[#8a7b68]">
                Airbnb does not expose full listing/owner data through a public one-click import here,
                so the listing name, address, owner, and photo still need to be entered or pasted once.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
              <div className="space-y-3">
                <input
                  className="w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  placeholder="Airbnb listing title"
                  value={airbnbImportName}
                  onChange={(e) => setAirbnbImportName(e.target.value)}
                />

                <div className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-[#5f5245]">Paste Airbnb address line</div>
                      <p className="mt-1 text-xs text-[#8a7b68]">
                        Example: 304 Oakwood ave, Crystal Beach, ON L0S 1B0
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={applyAirbnbAddressLine}
                      className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-medium text-[#5f5245] transition hover:bg-[#fffaf4]"
                    >
                      Autofill address
                    </button>
                  </div>

                  <input
                    className="mt-3 w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                    placeholder="Paste address copied from Airbnb"
                    value={airbnbImportAddress}
                    onChange={(e) => setAirbnbImportAddress(e.target.value)}
                  />

                  <div className="mt-3 grid gap-2 md:grid-cols-[1.3fr_0.7fr]">
                    <input
                      className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                      placeholder="Street Address"
                      value={airbnbImportStreet}
                      onChange={(e) => setAirbnbImportStreet(e.target.value)}
                    />

                    <input
                      className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                      placeholder="Zip/Postal Code"
                      value={airbnbImportPostal}
                      onChange={(e) => setAirbnbImportPostal(e.target.value)}
                    />
                  </div>

                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <input
                      className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                      placeholder="City"
                      value={airbnbImportCity}
                      onChange={(e) => setAirbnbImportCity(e.target.value)}
                    />

                    <input
                      className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                      placeholder="State/Province"
                      value={airbnbImportProvince}
                      onChange={(e) => setAirbnbImportProvince(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    className="w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                    placeholder="Airbnb iCal export URL (https://... or webcal://...)"
                    value={airbnbImportCalendarUrl}
                    onChange={(e) => setAirbnbImportCalendarUrl(normalizeIcalUrl(e.target.value))}
                  />

                  <input
                    className="w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                    placeholder="Cover photo URL (optional)"
                    value={airbnbImportCoverPhotoUrl}
                    onChange={(e) => setAirbnbImportCoverPhotoUrl(e.target.value)}
                  />
                </div>

                <input
                  className="w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  placeholder="Airbnb listing URL (optional)"
                  value={airbnbImportListingUrl}
                  onChange={(e) => setAirbnbImportListingUrl(e.target.value)}
                />

                <textarea
                  className="min-h-[108px] w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                  placeholder="Internal notes or Airbnb setup reminders"
                  value={airbnbImportNotes}
                  onChange={(e) => setAirbnbImportNotes(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <div className="rounded-[22px] border border-[#eadfce] bg-[#fffaf4] p-4">
                  <div className="text-sm font-medium text-[#5f5245]">Owner portal access</div>
                  <p className="mt-1 text-xs text-[#8a7b68]">
                    The owner link is optional, but adding it here finishes the full Airbnb onboarding flow.
                  </p>

                  <div className="mt-3 space-y-2">
                    <input
                      className="w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                      placeholder="Owner name"
                      value={airbnbImportOwnerName}
                      onChange={(e) => setAirbnbImportOwnerName(e.target.value)}
                    />
                    <input
                      className="w-full rounded-[18px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                      placeholder="Owner email"
                      value={airbnbImportOwnerEmail}
                      onChange={(e) => setAirbnbImportOwnerEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                  <div className="text-sm font-medium text-[#5f5245]">What gets created</div>

                  <div className="mt-3 space-y-3 text-sm text-[#6f6255]">
                    <div className="rounded-[16px] border border-[#eadfce] bg-white px-4 py-3">
                      Property with the Airbnb title, address, notes, and optional cover photo.
                    </div>
                    <div className="rounded-[16px] border border-[#eadfce] bg-white px-4 py-3">
                      Active Airbnb calendar feed saved and synced immediately.
                    </div>
                    <div className="rounded-[16px] border border-[#eadfce] bg-white px-4 py-3">
                      Booking events and future turnover jobs from the Airbnb iCal feed.
                    </div>
                    <div className="rounded-[16px] border border-[#eadfce] bg-white px-4 py-3">
                      Optional owner account and owner portal link if you fill the email.
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <select
                      className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                      value={propertyUnitsNeeded}
                      onChange={(e) => setPropertyUnitsNeeded(e.target.value)}
                    >
                      <option value="1">Default cleaner units: 1</option>
                      <option value="2">Default cleaner units: 2</option>
                      <option value="3">Default cleaner units: 3</option>
                    </select>

                    <label className="flex items-start gap-2 text-sm text-[#6f6255]">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={propertyUnitsStrict}
                        onChange={(e) => setPropertyUnitsStrict(e.target.checked)}
                      />
                      <span>Full team required before the job is fully staffed</span>
                    </label>

                    <label className="flex items-start gap-2 text-sm text-[#6f6255]">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={propertyShowTeamStatus}
                        onChange={(e) => setPropertyShowTeamStatus(e.target.checked)}
                      />
                      <span>Show team status on cleaner page</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    className="inline-flex flex-1 items-center justify-center rounded-full bg-[#241c15] px-5 py-3 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60"
                    onClick={() => void addAirbnbProperty()}
                    disabled={importingAirbnbProperty}
                  >
                    {importingAirbnbProperty ? "Importing and syncing..." : "Import and Sync Airbnb"}
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full border border-[#d8c7ab] bg-white px-5 py-3 text-sm font-medium text-[#5f5245] transition hover:bg-[#fcfaf7]"
                    onClick={resetAirbnbImportForm}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  function renderPropertyWorkflowCards() {
    const propertyWithOwnerCount = properties.filter((property) => !!getOwnerForProperty(property.id)).length;
    const propertyWithCalendarCount = properties.filter((property) =>
      propertyCalendars.some((calendar) => calendar.property_id === property.id)
    ).length;
    const unassignedCleanerCount = properties.filter(
      (property) => !assignments.some((assignment) => assignment.property_id === property.id)
    ).length;

    const cards: Array<{
      key: PropertyWorkflowTab;
      title: string;
      description: string;
      meta: string;
      action: string;
    }> = [
      {
        key: "add",
        title: "Add property",
        description: "Create a manual property or import an Airbnb calendar feed and sync it.",
        meta: "Manual or Airbnb",
        action: "Open setup form",
      },
      {
        key: "setup",
        title: "Setup selected property",
        description: "Manage owner link, access notes, calendars, SOP photos, staffing defaults, and cover photo.",
        meta: selectedPropertyId ? properties.find((property) => property.id === selectedPropertyId)?.name || "Selected" : "Choose property",
        action: "Manage details",
      },
      {
        key: "directory",
        title: "Property directory",
        description: "Review all properties, owner status, assignments, calendars, and admin reset tools.",
        meta: `${properties.length} total | ${propertyWithOwnerCount} owner-linked | ${propertyWithCalendarCount} with calendars`,
        action: "Review properties",
      },
      {
        key: "health",
        title: "Property health",
        description: "Score every property for owner link, calendars, staffing, maintenance, access, and billing setup.",
        meta: `${propertyHealthStats.average}% average | ${propertyHealthStats.atRisk} need attention`,
        action: "Open scorecard",
      },
    ];

    return (
      <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a7b68]">Property tools</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#241c15]">Properties</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#7f7263]">
              Choose the property task you want to work on. Each area stays focused so you do not have to scroll through every property tool at once.
            </p>
          </div>
          <span className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-3 py-1 text-xs font-semibold text-[#6f6255]">
            {unassignedCleanerCount} need cleaner assignment
          </span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const active = propertyWorkflowTab === card.key;

            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setPropertyWorkflowTab(card.key)}
                className={`min-h-[154px] rounded-[18px] border p-4 text-left transition ${
                  active
                    ? "border-[#241c15] bg-[#241c15] text-[#f8f2e8] shadow-[0_18px_34px_rgba(36,28,21,0.16)]"
                    : "border-[#eadfce] bg-[#fcfaf7] text-[#241c15] hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_14px_28px_rgba(36,28,21,0.08)]"
                }`}
              >
                <div className="text-base font-semibold">{card.title}</div>
                <p className={`mt-3 text-sm leading-6 ${active ? "text-[#eadfce]" : "text-[#6f6255]"}`}>
                  {card.description}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${active ? "border-[#eadfce]/40 bg-white/10 text-[#f8f2e8]" : "border-[#d8c7ab] bg-white text-[#6f6255]"}`}>
                    {card.meta}
                  </span>
                  <span className={`text-xs font-semibold ${active ? "text-[#f8f2e8]" : "text-[#8a7b68]"}`}>
                    {card.action}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function renderPropertiesSection() {
    return (
      <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Properties</h2>
          <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">
            {properties.length}
          </span>
        </div>

        {properties.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-4 py-6 text-sm leading-6 text-[#7f7263]">
            <div>No properties are loaded for this organization yet.</div>
            <div className="mt-1">
              If jobs are showing property names, reload the directory; it uses the same property data as Jobs.
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              className="mt-4 rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-semibold text-[#6f6255] transition hover:bg-[#fffaf4]"
            >
              Reload properties
            </button>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {properties.map((p) => {
            const propertyCalendarCount = propertyCalendars.filter(
              (calendar) => calendar.property_id === p.id
            ).length;
            const owner = getOwnerForProperty(p.id);
            const ownerStatus = getOwnerInviteStatus(owner);

            const assignedCleanerNames = assignments
              .filter((assignment) => assignment.property_id === p.id)
              .map((assignment) => {
                const account = cleanerAccounts.find(
                  (cleaner) => cleaner.id === assignment.cleaner_account_id
                );
                return account?.display_name || "Unknown cleaner team";
              });

            const assignedGroundsNames = groundsAssignments
              .filter((assignment) => assignment.property_id === p.id)
              .map((assignment) => {
                const account = groundsAccounts.find(
                  (grounds) => grounds.id === assignment.grounds_account_id
                );
                return account?.display_name || "Unknown grounds team";
              });

            return (
              <div key={p.id} className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-semibold">{p.name}</div>
                      <div className="mt-1 text-sm text-[#6f6255]">{p.address || "No address"}</div>
                      <div className="mt-2 line-clamp-2 text-sm text-[#8a7b68]">{p.notes || "No notes"}</div>
                    </div>

                    <div className="flex w-full flex-wrap gap-2 md:w-auto md:max-w-[220px] md:justify-end">
                      {owner ? (
                        <button
                          className="flex-1 rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm text-[#5f5245] transition hover:bg-[#fffaf4] disabled:opacity-50 md:flex-none"
                          onClick={() => void inviteOwnerForProperty(p.id, owner.email || "", owner.full_name || "")}
                          disabled={sendingOwnerInviteId === p.id || !owner.email}
                        >
                          {sendingOwnerInviteId === p.id
                            ? "Sending..."
                            : owner.invite_sent_at
                              ? "Resend invite"
                              : "Send invite"}
                        </button>
                      ) : null}

                      <button
                        className="flex-1 rounded-[14px] border border-[#efc6c6] bg-[#fff5f5] px-3 py-2 text-sm text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:opacity-50 md:flex-none"
                        onClick={() => void deleteProperty(p)}
                        disabled={deletingPropertyId === p.id}
                      >
                        {deletingPropertyId === p.id ? "Deleting..." : "Delete property"}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-[#eadfce] bg-white px-3 py-1 text-[#7f7263]">
                      {propertyCalendarCount} calendar{propertyCalendarCount === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-full border border-[#eadfce] bg-white px-3 py-1 text-[#7f7263]">
                      {p.default_cleaner_units_needed} unit{p.default_cleaner_units_needed === 1 ? "" : "s"}
                      {p.cleaner_units_required_strict ? ", strict" : ", flexible"}
                    </span>
                    <span className="rounded-full border border-[#eadfce] bg-white px-3 py-1 text-[#7f7263]">
                      Owner {ownerStatus}
                    </span>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-[18px] border border-[#eadfce] bg-white/80 p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#8a7b68]">
                        Assigned staff
                      </div>

                      <div className="space-y-2">
                        <div className="rounded-[12px] border border-[#dbe7ff] bg-[#f5f9ff] px-3 py-2">
                          <div className="text-xs font-semibold text-[#214a8a]">Cleaner team</div>
                          <div className="mt-1 text-sm text-[#5f5245]">
                            {assignedCleanerNames.length > 0 ? (
                              assignedCleanerNames.join(", ")
                            ) : (
                              <span className="font-medium text-[#b42318]">No cleaner team assigned</span>
                            )}
                          </div>
                        </div>

                        <div className="rounded-[12px] border border-[#d9efdf] bg-[#f3fbf5] px-3 py-2">
                          <div className="text-xs font-semibold text-[#21643a]">Grounds team</div>
                          <div className="mt-1 text-sm text-[#5f5245]">
                            {assignedGroundsNames.length > 0
                              ? assignedGroundsNames.join(", ")
                              : "No grounds team assigned"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[18px] border border-[#eadfce] bg-white/80 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a7b68]">
                          Owner portal
                        </div>
                        <span className="rounded-full border border-[#eadfce] bg-[#fffaf4] px-3 py-1 text-[11px] font-medium text-[#7f7263]">
                          {ownerStatus}
                        </span>
                      </div>
                      <div className="text-sm text-[#5f5245]">
                        {owner?.full_name || "No owner name added"}
                      </div>
                      <div className="mt-1 text-sm text-[#8a7b68]">
                        {owner?.email || "No owner email linked yet"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        )}
        <div className="mt-5 rounded-[22px] border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">Reset Organization Data</p>
          <p className="mt-1 text-xs text-red-600">
            This will permanently delete all data for the current organization. This cannot be undone.
          </p>

          <input
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
            placeholder='Type "WIPE ALL DATA" to enable reset'
            className="mt-3 w-full rounded-[12px] border border-red-200 bg-white px-3 py-2 text-sm outline-none"
          />

          <button
            type="button"
            onClick={() => void handleResetOrganization()}
            disabled={resetConfirmText.trim().toUpperCase() !== "WIPE ALL DATA" || resettingOrganization}
            className="mt-3 rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resettingOrganization ? "Resetting..." : "Reset Organization Data"}
          </button>
        </div>
      </section>
    );
  }

  function renderPropertyHealthSection() {
    return (
      <div className="space-y-6">
        <section className="rounded-[30px] border border-[#bbf7d0] bg-[linear-gradient(180deg,#f8fff9_0%,#effdf3_100%)] p-5 shadow-[0_18px_45px_rgba(34,197,94,0.08)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#15803d]">Property Health</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#14532d]">Health score dashboard</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#3f7050]">
                Scores flag setup gaps that tend to create operational trouble: owner links, calendars, staffing, access notes, maintenance, stranded jobs, SOPs, and invoice rates.
              </p>
            </div>
            <span className="rounded-full border border-[#bbf7d0] bg-white px-3 py-1 text-xs font-semibold text-[#15803d]">
              {propertyHealthStats.average}% average
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Average score", value: `${propertyHealthStats.average}%`, tone: "border-[#bbf7d0] bg-white text-[#14532d]" },
              { label: "Healthy", value: propertyHealthStats.healthy, tone: "border-[#bbdfc0] bg-[#f0fbf2] text-[#236b30]" },
              { label: "Need attention", value: propertyHealthStats.atRisk, tone: "border-[#f0b4b4] bg-[#fff5f5] text-[#8a2e22]" },
              { label: "Properties", value: properties.length, tone: "border-[#bbf7d0] bg-white text-[#14532d]" },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-[20px] border px-4 py-3 shadow-sm ${stat.tone}`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-75">{stat.label}</div>
                <div className="mt-2 text-3xl font-semibold">{stat.value}</div>
              </div>
            ))}
          </div>

          {propertyHealthStats.topIssues.length > 0 ? (
            <div className="mt-5 rounded-[20px] border border-[#bbf7d0] bg-white p-4">
              <div className="text-sm font-semibold text-[#14532d]">Most common issues</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {propertyHealthStats.topIssues.map(([issue, count]) => (
                  <span key={issue} className="rounded-full border border-[#d9f99d] bg-[#f7fee7] px-3 py-1 text-xs font-semibold text-[#4d7c0f]">
                    {issue}: {count}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-xl font-semibold tracking-tight text-[#241c15]">Property scorecards</h3>
              <p className="mt-1 text-sm text-[#7f7263]">Lowest scores appear first so the next cleanup target is obvious.</p>
            </div>
            <span className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-3 py-1 text-xs font-semibold text-[#6f6255]">
              {propertyHealthRows.length} tracked
            </span>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {propertyHealthRows.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-4 py-5 text-sm text-[#7f7263]">
                No properties yet.
              </div>
            ) : (
              propertyHealthRows.map((row) => (
                <div key={row.id} className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-4 shadow-sm">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-semibold text-[#241c15]">{row.property.name || row.property.address || "Unnamed property"}</div>
                      <div className="mt-1 text-sm text-[#6f6255]">{row.property.address || "No address"}</div>
                      <div className="mt-2 text-sm text-[#8a7b68]">Owner: {row.ownerName}</div>
                    </div>
                    <div className={`rounded-[20px] border px-4 py-3 text-center ${row.tone}`}>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-75">{row.status}</div>
                      <div className="mt-1 text-3xl font-semibold">{row.score}%</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
                    <div className="rounded-[14px] border border-[#eadfce] bg-white px-3 py-2 text-[#6f6255]">
                      Calendars: <span className="font-semibold text-[#241c15]">{row.calendarCount}</span>
                    </div>
                    <div className="rounded-[14px] border border-[#eadfce] bg-white px-3 py-2 text-[#6f6255]">
                      Cleaners: <span className="font-semibold text-[#241c15]">{row.cleanerAssignmentCount}</span>
                    </div>
                    <div className="rounded-[14px] border border-[#eadfce] bg-white px-3 py-2 text-[#6f6255]">
                      Grounds: <span className="font-semibold text-[#241c15]">{row.groundsAssignmentCount}</span>
                    </div>
                    <div className="rounded-[14px] border border-[#eadfce] bg-white px-3 py-2 text-[#6f6255]">
                      Open flags: <span className="font-semibold text-[#241c15]">{row.openFlagCount}</span>
                    </div>
                    <div className="rounded-[14px] border border-[#eadfce] bg-white px-3 py-2 text-[#6f6255]">
                      Stranded jobs: <span className="font-semibold text-[#241c15]">{row.strandedCount}</span>
                    </div>
                    <div className="rounded-[14px] border border-[#eadfce] bg-white px-3 py-2 text-[#6f6255]">
                      Docs/SOPs: <span className="font-semibold text-[#241c15]">{row.documentCount}/{row.sopCount}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {row.issues.length === 0 ? (
                      <span className="rounded-full border border-[#bbdfc0] bg-[#f0fbf2] px-3 py-1 text-xs font-semibold text-[#236b30]">
                        No obvious setup gaps
                      </span>
                    ) : (
                      row.issues.slice(0, 5).map((issue) => (
                        <span key={issue} className="rounded-full border border-[#f0b4b4] bg-[#fff5f5] px-3 py-1 text-xs font-semibold text-[#8a2e22]">
                          {issue}
                        </span>
                      ))
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPropertyId(row.id);
                        setPropertyWorkflowTab("setup");
                      }}
                      className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-semibold text-[#5f5245] transition hover:bg-[#fffaf4]"
                    >
                      Open setup
                    </button>
                    {row.openFlagCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedJobsPropertyFilter(row.id);
                          setActiveSection("maintenance");
                        }}
                        className="rounded-full border border-[#f0b4b4] bg-[#fff5f5] px-4 py-2 text-sm font-semibold text-[#8a2e22] transition hover:bg-[#fff0f0]"
                      >
                        View flags
                      </button>
                    ) : null}
                    {row.strandedCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedJobsPropertyFilter(row.id);
                          setActiveSection("jobs");
                          setJobWorkflowTab("exceptions");
                        }}
                        className="rounded-full border border-[#f0b4b4] bg-[#fff5f5] px-4 py-2 text-sm font-semibold text-[#8a2e22] transition hover:bg-[#fff0f0]"
                      >
                        View stranded jobs
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderCleanerAccountsSection() {
    return (
      <div className="space-y-6">
        <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <h2 className="text-xl font-semibold tracking-tight">Invite Cleaner</h2>
          <p className="mt-1 text-sm text-[#7f7263]">
            Invite a new cleaner to create their account and join this company.
          </p>

          <div className="mt-5 space-y-3">
            <input
              className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
              placeholder="Cleaner name"
              value={inviteCleanerName}
              onChange={(e) => setInviteCleanerName(e.target.value)}
            />

            <input
              className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
              placeholder="Cleaner email"

              value={inviteCleanerEmail}
              onChange={(e) => setInviteCleanerEmail(e.target.value)}
            />
            <input
              className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
              placeholder="Cleaner phone (optional)"
              value={inviteCleanerPhone}
              onChange={(e) => setInviteCleanerPhone(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void inviteCleanerFromForm()}
                className="inline-flex items-center justify-center rounded-full border border-[#d8c7ab] bg-white px-5 py-2.5 text-sm font-medium text-[#241c15] transition hover:bg-[#fcfaf7]"
              >
                Invite Cleaner
              </button>

              <button
                type="button"
                onClick={() =>
                  void resendOrganizationInvite({
                    email: inviteCleanerEmail,
                    role: "cleaner",
                  })
                }
                className="inline-flex items-center justify-center rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-5 py-2.5 text-sm font-medium text-[#5f5245] transition hover:bg-white"
              >
                Resend Invite
              </button>
            </div>
            {pendingCleanerInvites.length > 0 ? (
              <div className="mt-5 rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                <div className="mb-2 text-sm font-medium text-[#5f5245]">
                  Cleaner Invites
                </div>

                <div className="space-y-3">
                  {pendingCleanerInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className="rounded-[16px] border border-[#e7ddd0] bg-white px-4 py-3"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-sm font-medium text-[#241c15]">
                            {invite.full_name || invite.email}
                            {duplicateCleanerInviteEmails.has(invite.email.trim().toLowerCase()) ? (
                              <span className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                Duplicate
                              </span>
                            ) : null}
                          </div>
                          <div className="text-sm text-[#7f7263]">{invite.email}</div>
                          <div className="mt-1 text-xs text-[#8a7b68]">
                            Status: {invite.status || "sent"}
                            {invite.sent_at
                              ? ` • Sent ${new Date(invite.sent_at).toLocaleDateString()}`
                              : ""}
                            {invite.expires_at
                              ? ` • Expires ${new Date(invite.expires_at).toLocaleDateString()}`
                              : ""}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void resendOrganizationInvite({
                                email: invite.email,
                                role: "cleaner",
                              })
                            }
                            className="inline-flex items-center justify-center rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-2 text-sm font-medium text-[#5f5245] transition hover:bg-white"
                          >
                            Resend Invite
                          </button>

                          <button
                            type="button"
                            onClick={() => void deleteOrganizationInvite(invite.id)}
                            disabled={deletingOrganizationInviteId === invite.id}
                            className="inline-flex items-center justify-center rounded-full border border-[#efc6c6] bg-[#fff5f5] px-4 py-2 text-sm font-medium text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingOrganizationInviteId === invite.id ? "Revoking..." : "Revoke"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
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

            <div className="mt-3 flex flex-wrap gap-3">
              <button
                className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]"
                onClick={() => void addCleanerAccount()}
              >
                Link Selected Cleaners
              </button>


            </div>
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
          <h2 className="text-xl font-semibold tracking-tight">Invite Grounds</h2>
          <p className="mt-1 text-sm text-[#7f7263]">
            Invite a new grounds user to create their account and join this company.
          </p>

          <div className="mt-5 space-y-3">
            <input
              className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
              placeholder="Grounds name"
              value={inviteGroundsName}
              onChange={(e) => setInviteGroundsName(e.target.value)}
            />

            <input
              className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
              placeholder="Grounds email"
              value={inviteGroundsEmail}
              onChange={(e) => setInviteGroundsEmail(e.target.value)}
            />
            <input
              className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
              placeholder="Grounds phone (optional)"
              value={inviteGroundsPhone}
              onChange={(e) => setInviteGroundsPhone(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void inviteGroundsFromForm()}
                className="inline-flex items-center justify-center rounded-full border border-[#d8c7ab] bg-white px-5 py-2.5 text-sm font-medium text-[#241c15] transition hover:bg-[#fcfaf7]"
              >
                Invite Grounds
              </button>

              <button
                type="button"
                onClick={() =>
                  void resendOrganizationInvite({
                    email: inviteGroundsEmail,
                    role: "grounds",
                  })
                }
                className="inline-flex items-center justify-center rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-5 py-2.5 text-sm font-medium text-[#5f5245] transition hover:bg-white"
              >
                Resend Invite
              </button>
            </div>
            {pendingGroundsInvites.length > 0 ? (
              <div className="mt-5 rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                <div className="mb-2 text-sm font-medium text-[#5f5245]">
                  Grounds Invites
                </div>

                <div className="space-y-3">
                  {pendingGroundsInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className="rounded-[16px] border border-[#e7ddd0] bg-white px-4 py-3"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-sm font-medium text-[#241c15]">
                            {invite.full_name || invite.email}
                            {duplicateGroundsInviteEmails.has(invite.email.trim().toLowerCase()) ? (
                              <span className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                Duplicate
                              </span>
                            ) : null}
                          </div>
                          <div className="text-sm text-[#7f7263]">{invite.email}</div>
                          <div className="mt-1 text-xs text-[#8a7b68]">
                            Status: {invite.status || "sent"}
                            {invite.sent_at
                              ? ` • Sent ${new Date(invite.sent_at).toLocaleDateString()}`
                              : ""}
                            {invite.expires_at
                              ? ` • Expires ${new Date(invite.expires_at).toLocaleDateString()}`
                              : ""}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void resendOrganizationInvite({
                                email: invite.email,
                                role: "grounds",
                              })
                            }
                            className="inline-flex items-center justify-center rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-2 text-sm font-medium text-[#5f5245] transition hover:bg-white"
                          >
                            Resend Invite
                          </button>

                          <button
                            type="button"
                            onClick={() => void deleteOrganizationInvite(invite.id)}
                            disabled={deletingOrganizationInviteId === invite.id}
                            className="inline-flex items-center justify-center rounded-full border border-[#efc6c6] bg-[#fff5f5] px-4 py-2 text-sm font-medium text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingOrganizationInviteId === invite.id ? "Revoking..." : "Revoke"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
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

            <div className="mt-3 flex flex-wrap gap-3">
              <button
                className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]"
                onClick={() => void addGroundsAccount()}
              >
                Link Selected Grounds Users
              </button>


            </div>
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
        <section className="rounded-[30px] border border-[#d7e7d0] bg-[linear-gradient(180deg,#f8fff5_0%,#eefbea_100%)] p-5 shadow-[0_18px_45px_rgba(60,120,48,0.08)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3f7b45]">Availability</div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#1f4b24]">Cleaner and grounds availability</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#557257]">
                See who is free, booked, or waiting on job offers before assigning more work. This view looks at the next 14 days.
              </p>
            </div>
            <span className="rounded-full border border-[#bddbbd] bg-white px-3 py-1 text-xs font-semibold text-[#3f7b45]">
              {teamAvailabilityStats.total} teams tracked
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Available", value: teamAvailabilityStats.available, tone: "border-[#bbdfc0] bg-[#f0fbf2] text-[#236b30]" },
              { label: "Busy today", value: teamAvailabilityStats.busyToday, tone: "border-[#f1cf8f] bg-[#fff8e8] text-[#8a6112]" },
              { label: "Booked soon", value: teamAvailabilityStats.bookedSoon, tone: "border-[#c7dcf5] bg-[#f1f7ff] text-[#275b8a]" },
              { label: "Need response", value: teamAvailabilityStats.needsResponse, tone: "border-[#f0b4b4] bg-[#fff5f5] text-[#8a2e22]" },
              { label: "Total teams", value: teamAvailabilityStats.total, tone: "border-[#bddbbd] bg-white text-[#1f4b24]" },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-[20px] border px-4 py-3 shadow-sm ${stat.tone}`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-75">{stat.label}</div>
                <div className="mt-2 text-3xl font-semibold">{stat.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {teamAvailabilityRows.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-[#bddbbd] bg-white px-4 py-5 text-sm text-[#557257]">
                No cleaner or grounds accounts exist yet.
              </div>
            ) : (
              teamAvailabilityRows.map((row) => (
                <div key={row.id} className="rounded-[22px] border border-[#bddbbd] bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-[#1f4b24]">{row.name}</h3>
                        <span className="rounded-full border border-[#bddbbd] bg-[#f8fff7] px-2 py-0.5 text-[11px] font-semibold text-[#3f7b45]">
                          {row.kind}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-[#557257]">{row.members}</div>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${row.tone}`}>
                      {row.status}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 text-xs text-[#6f8a71] sm:grid-cols-4">
                    <div>
                      <span className="font-semibold text-[#1f4b24]">{row.todayCount}</span> today
                    </div>
                    <div>
                      <span className="font-semibold text-[#1f4b24]">{row.upcomingCount}</span> next 14 days
                    </div>
                    <div>
                      <span className="font-semibold text-[#1f4b24]">{row.pendingOffers}</span> pending offers
                    </div>
                    <div>Next: {formatScheduledFor(row.nextJobDate)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[30px] border border-[#b8d8ea] bg-[#f4fbff] p-5 shadow-[0_18px_45px_rgba(37,99,135,0.08)]">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#26708f]">Cleaning</div>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#12394a]">Assign Cleaner to Property</h2>
            </div>
            <span className="rounded-full border border-[#b8d8ea] bg-white px-3 py-1 text-xs font-semibold text-[#26708f]">Turnovers</span>
          </div>
          <p className="mt-1 text-sm text-[#4f6e7c]">
            Choose an approved cleaner and assign them as primary or backup. If they are not linked to a cleaner account yet, the system will create that link automatically.
          </p>

          <div className="mt-5 space-y-3">
            <select className="w-full rounded-[20px] border border-[#b8d8ea] bg-white px-4 py-3 text-sm outline-none focus:border-[#26708f]" value={assignmentPropertyId} onChange={(e) => setAssignmentPropertyId(e.target.value)}>
              <option value="">Select property</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <select className="w-full rounded-[20px] border border-[#b8d8ea] bg-white px-4 py-3 text-sm outline-none focus:border-[#26708f]" value={assignmentCleanerProfileId} onChange={(e) => setAssignmentCleanerProfileId(e.target.value)}>
              <option value="">Select cleaner</option>
              {eligibleCleanerProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name || profile.email || profile.id}
                </option>
              ))}
            </select>

            <select className="w-full rounded-[20px] border border-[#b8d8ea] bg-white px-4 py-3 text-sm outline-none focus:border-[#26708f]" value={assignmentPriority} onChange={(e) => setAssignmentPriority(e.target.value)}>
              <option value="1">Primary</option>
              <option value="2">Backup</option>
              <option value="3">Second Backup</option>
            </select>

            <button className="inline-flex items-center justify-center rounded-full bg-[#17637f] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#124d63]" onClick={() => void addAssignment()}>
              Save Assignment
            </button>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#b8d8ea] bg-[#f8fcff] p-5 shadow-[0_18px_45px_rgba(37,99,135,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight text-[#12394a]">Cleaner Assignments</h2>
            <span className="rounded-full border border-[#b8d8ea] bg-white px-3 py-1 text-xs font-medium text-[#26708f]">{assignments.length}</span>
          </div>
          <div className="space-y-3">
            {assignments.map((a) => {
              const members = cleanerMembersByAccountId[a.cleaner_account_id] ?? [];
              const memberLabel = members.length
                ? members.map((m) => m.full_name || m.email || m.id).join(", ")
                : getCleanerAccountName(a.cleaner_account_id);

              return (
                <div key={a.id} className="rounded-[22px] border border-[#b8d8ea] bg-white p-4 shadow-sm">
                  <div className="text-base font-semibold text-[#12394a]">{getPropertyName(a.property_id)}</div>
                  <div className="mt-1 text-sm text-[#4f6e7c]">{memberLabel}</div>
                  <div className="mt-1 text-xs text-[#6a8793]">Cleaner account: {getCleanerAccountName(a.cleaner_account_id)}</div>
                  <div className="mt-2 inline-flex rounded-full border border-[#b8d8ea] bg-[#eef8fd] px-3 py-1 text-xs font-medium text-[#26708f]">
                    {getPriorityLabel(a.priority)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-[30px] border border-[#bddbbd] bg-[#f5fff4] p-5 shadow-[0_18px_45px_rgba(68,126,72,0.08)]">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3f7b45]">Grounds</div>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#1f4b24]">Assign Grounds to Property</h2>
            </div>
            <span className="rounded-full border border-[#bddbbd] bg-white px-3 py-1 text-xs font-semibold text-[#3f7b45]">Exterior work</span>
          </div>
          <p className="mt-1 text-sm text-[#557257]">
            Choose a grounds-capable user and assign them as primary or backup for grounds work. If they are not linked to a grounds account yet, the system will create that link automatically.
          </p>

          <div className="mt-5 space-y-3">
            <select className="w-full rounded-[20px] border border-[#bddbbd] bg-white px-4 py-3 text-sm outline-none focus:border-[#3f7b45]" value={groundsAssignmentPropertyId} onChange={(e) => setGroundsAssignmentPropertyId(e.target.value)}>
              <option value="">Select property</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <select className="w-full rounded-[20px] border border-[#bddbbd] bg-white px-4 py-3 text-sm outline-none focus:border-[#3f7b45]" value={groundsAssignmentProfileId} onChange={(e) => setGroundsAssignmentProfileId(e.target.value)}>
              <option value="">Select grounds user</option>
              {eligibleGroundsProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name || profile.email || profile.id}
                </option>
              ))}
            </select>

            <select className="w-full rounded-[20px] border border-[#bddbbd] bg-white px-4 py-3 text-sm outline-none focus:border-[#3f7b45]" value={groundsAssignmentPriority} onChange={(e) => setGroundsAssignmentPriority(e.target.value)}>
              <option value="1">Primary</option>
              <option value="2">Backup</option>
              <option value="3">Second Backup</option>
            </select>

            <button className="inline-flex items-center justify-center rounded-full bg-[#2f6f36] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#24562a]" onClick={() => void addGroundsAssignment()}>
              Save Grounds Assignment
            </button>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#bddbbd] bg-[#f8fff7] p-5 shadow-[0_18px_45px_rgba(68,126,72,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight text-[#1f4b24]">Grounds Assignments</h2>
            <span className="rounded-full border border-[#bddbbd] bg-white px-3 py-1 text-xs font-medium text-[#3f7b45]">{groundsAssignments.length}</span>
          </div>
          <div className="space-y-3">
            {groundsAssignments.map((a) => {
              const members = groundsMembersByAccountId[a.grounds_account_id] ?? [];
              const memberLabel = members.length ? members.map((m) => m.full_name || m.email || m.id).join(", ") : getGroundsAccountName(a.grounds_account_id);

              return (
                <div key={a.id} className="rounded-[22px] border border-[#bddbbd] bg-white p-4 shadow-sm">
                  <div className="text-base font-semibold text-[#1f4b24]">{getPropertyName(a.property_id)}</div>
                  <div className="mt-1 text-sm text-[#557257]">{memberLabel}</div>
                  <div className="mt-1 text-xs text-[#6f8a71]">Grounds account: {getGroundsAccountName(a.grounds_account_id)}</div>
                  <div className="mt-2 inline-flex rounded-full border border-[#bddbbd] bg-[#eff9ee] px-3 py-1 text-xs font-medium text-[#3f7b45]">
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

  function renderJobsWorkflowCards() {
    const exceptionCount = filteredStrandedJobs.length + recentDeclinedJobs.length;
    const cards: Array<{
      key: JobWorkflowTab;
      title: string;
      description: string;
      meta: string;
      action: string;
    }> = [
      {
        key: "cleaning",
        title: "Create cleaning job",
        description: "Create a turnover job and offer slots to the cleaner teams assigned to that property.",
        meta: `${properties.length} properties`,
        action: "Open cleaner form",
      },
      {
        key: "grounds",
        title: "Create grounds job",
        description: "Create one-time or recurring exterior work, then review grounds job slots.",
        meta: `${groundsJobs.length} grounds jobs | ${groundsRecurringRules.length} recurring`,
        action: "Open grounds tools",
      },
      {
        key: "active",
        title: "Active cleaning jobs",
        description: "Review cleaning jobs, filter by property, watch acceptance status, and reassign open slots.",
        meta: `${filteredJobs.length} shown | ${waitingJobs.length} waiting`,
        action: "Review jobs",
      },
      {
        key: "reliability",
        title: "Job reliability",
        description: "See whether cleaner and grounds offers were emailed, accepted, declined, or overdue.",
        meta: `${jobReliabilityStats.emailPending} email pending | ${jobReliabilityStats.overdue} overdue`,
        action: "Open dashboard",
      },
      {
        key: "notifications",
        title: "Notification queue",
        description: "Retry cleaner and grounds offer emails that have not been sent or are overdue.",
        meta: `${failedNotificationStats.total} pending | ${failedNotificationStats.overdue} overdue`,
        action: "Review queue",
      },
      {
        key: "exceptions",
        title: "Exceptions",
        description: "Handle stranded jobs and recent declines without scrolling through creation forms.",
        meta: `${exceptionCount} item${exceptionCount === 1 ? "" : "s"} need review`,
        action: "Review issues",
      },
    ];

    return (
      <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a7b68]">Job tools</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#241c15]">Jobs</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#7f7263]">
              Choose the job task you want to work on. Creation, active work, and exceptions stay separated.
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            exceptionCount > 0
              ? "border-[#f0b4b4] bg-[#fff5f5] text-[#8a2e22]"
              : "border-[#d8c7ab] bg-[#fcfaf7] text-[#6f6255]"
          }`}>
            {exceptionCount} exception{exceptionCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {cards.map((card) => {
            const active = jobWorkflowTab === card.key;
            const isExceptionCard = card.key === "exceptions" && exceptionCount > 0;

            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setJobWorkflowTab(card.key)}
                className={`min-h-[170px] rounded-[18px] border p-4 text-left transition ${
                  active
                    ? "border-[#241c15] bg-[#241c15] text-[#f8f2e8] shadow-[0_18px_34px_rgba(36,28,21,0.16)]"
                    : isExceptionCard
                      ? "border-[#f0b4b4] bg-[#fff5f5] text-[#7e1f1f] hover:-translate-y-0.5 hover:bg-white"
                      : "border-[#eadfce] bg-[#fcfaf7] text-[#241c15] hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_14px_28px_rgba(36,28,21,0.08)]"
                }`}
              >
                <div className="text-base font-semibold">{card.title}</div>
                <p className={`mt-3 text-sm leading-6 ${active ? "text-[#eadfce]" : isExceptionCard ? "text-[#8b3838]" : "text-[#6f6255]"}`}>
                  {card.description}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${active ? "border-[#eadfce]/40 bg-white/10 text-[#f8f2e8]" : "border-[#d8c7ab] bg-white text-[#6f6255]"}`}>
                    {card.meta}
                  </span>
                  <span className={`text-xs font-semibold ${active ? "text-[#f8f2e8]" : isExceptionCard ? "text-[#8a2e22]" : "text-[#8a7b68]"}`}>
                    {card.action}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function renderJobsSection() {
    return (
      <div className="space-y-6" id="jobs-section">
        {renderJobsWorkflowCards()}

        {jobWorkflowTab === "cleaning" ? (
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

            <input
              type="date"
              className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e] focus:bg-white"
              value={jobScheduledFor}
              onChange={(e) => setJobScheduledFor(e.target.value)}
            />

            <textarea className="min-h-[120px] w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Job notes. Optional. You can still include a checkout date here if needed." value={jobNotes} onChange={(e) => setJobNotes(e.target.value)} />

            <button type="button" className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]" onClick={() => void createJob()}>
              Create Cleaning Job
            </button>
          </div>
        </section>
        ) : null}

        {jobWorkflowTab === "grounds" ? (
        <>
        <section className="rounded-[30px] border border-[#d8e8d8] bg-[linear-gradient(180deg,#f8fcf8_0%,#f2f8f2_100%)] p-5 shadow-[0_18px_45px_rgba(28,86,39,0.08)]">
          <h2 className="text-xl font-semibold tracking-tight text-[#23422c]">Create Grounds Job</h2>
          <p className="mt-1 text-sm text-[#5b7460]">
            Create a grounds job. Grounds slots are offered automatically from the property&apos;s grounds assignments.
          </p>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setJobMode("single")}
              className={`rounded-full px-4 py-2 text-sm ${jobMode === "single"
                ? "bg-[#23422c] text-white"
                : "border border-[#b7cfb7] bg-white text-[#23422c]"
                }`}
            >
              One-time
            </button>

            <button
              type="button"
              onClick={() => setJobMode("recurring")}
              className={`rounded-full px-4 py-2 text-sm ${jobMode === "recurring"
                ? "bg-[#23422c] text-white"
                : "border border-[#b7cfb7] bg-white text-[#23422c]"
                }`}
            >
              Recurring
            </button>
          </div>

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

            {jobMode === "single" ? (
              <input
                type="date"
                className="w-full rounded-[20px] border border-[#b7cfb7] bg-white px-4 py-3 text-sm outline-none focus:border-[#4f8a5b]"
                value={groundsJobScheduledFor}
                onChange={(e) => setGroundsJobScheduledFor(e.target.value)}
              />
            ) : (
              <div className="space-y-3 rounded-[20px] border border-[#cfe2cf] bg-white p-4">
                <div>
                  <p className="text-sm font-semibold text-[#23422c]">Recurring schedule</p>
                  <p className="mt-1 text-xs text-[#5b7460]">Choose how often this grounds job should repeat and when it should start.</p>
                </div>

                <select
                  className="w-full rounded-[16px] border border-[#b7cfb7] bg-white px-4 py-3 text-sm outline-none focus:border-[#4f8a5b]"
                  value={recurringType}
                  onChange={(e) => setRecurringType(e.target.value)}
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="semi_monthly">Semi-monthly</option>
                  <option value="monthly">Monthly</option>
                </select>

                <input
                  type="date"
                  className="w-full rounded-[16px] border border-[#b7cfb7] bg-white px-4 py-3 text-sm outline-none focus:border-[#4f8a5b]"
                  value={groundsJobScheduledFor}
                  onChange={(e) => setGroundsJobScheduledFor(e.target.value)}
                />
              </div>
            )}
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

            <button className="inline-flex items-center justify-center rounded-full bg-[#23422c] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#1b3423]" onClick={() => void createGroundsJob()}>
              {jobMode === "recurring" ? "Create Recurring Grounds Rule" : "Create Grounds Job"}
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
                            <div className={`mt-2 inline-flex rounded-full border px-2 py-1 font-semibold ${getJobNotificationTone(slot)}`}>
                              {getJobNotificationLabel(slot)}
                            </div>
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
        </>
        ) : null}



        {jobWorkflowTab === "reliability" ? (
        <section className="rounded-[30px] border border-[#d8e7f3] bg-[linear-gradient(180deg,#f7fbff_0%,#eef7ff_100%)] p-5 shadow-[0_18px_45px_rgba(22,78,125,0.08)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#25637f]">Reliability</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17384a]">Job Reliability Dashboard</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#4c6b7b]">
                Track whether staff were notified and how each cleaner or grounds offer is moving through acceptance.
              </p>
            </div>
            <select
              className="rounded-full border border-[#bdd8e8] bg-white px-4 py-2 text-sm font-medium text-[#31566a] outline-none transition focus:border-[#31799c]"
              value={selectedJobsPropertyFilter}
              onChange={(e) => setSelectedJobsPropertyFilter(e.target.value)}
            >
              <option value="all">All properties</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name || property.address || "Unnamed property"}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              { label: "Slots tracked", value: jobReliabilityStats.total, tone: "border-[#bdd8e8] bg-white text-[#17384a]" },
              { label: "Accepted", value: jobReliabilityStats.accepted, tone: "border-[#bbdfc0] bg-[#f0fbf2] text-[#236b30]" },
              { label: "Waiting", value: jobReliabilityStats.waiting, tone: "border-[#f1cf8f] bg-[#fff8e8] text-[#8a6112]" },
              { label: "Overdue", value: jobReliabilityStats.overdue, tone: "border-[#f0b4b4] bg-[#fff5f5] text-[#8a2e22]" },
              { label: "Declined", value: jobReliabilityStats.declined, tone: "border-[#e5c2ef] bg-[#fbf5ff] text-[#6d3f80]" },
              { label: "Accepted rate", value: `${jobReliabilityStats.acceptedRate}%`, tone: "border-[#bdd8e8] bg-white text-[#17384a]" },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-[20px] border px-4 py-3 shadow-sm ${stat.tone}`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-75">{stat.label}</div>
                <div className="mt-2 text-3xl font-semibold">{stat.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[24px] border border-[#bdd8e8] bg-white p-4">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[#17384a]">Staff offer trail</h3>
                <p className="mt-1 text-sm text-[#4c6b7b]">
                  Items needing attention stay at the top.
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                jobReliabilityStats.emailPending > 0 || jobReliabilityStats.overdue > 0
                  ? "border-[#f0b4b4] bg-[#fff5f5] text-[#8a2e22]"
                  : "border-[#bbdfc0] bg-[#f0fbf2] text-[#236b30]"
              }`}>
                {jobReliabilityStats.emailPending + jobReliabilityStats.overdue} need attention
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {jobReliabilityRows.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-[#bdd8e8] bg-[#f7fbff] px-4 py-5 text-sm text-[#4c6b7b]">
                  No cleaner or grounds slots found for this filter yet.
                </div>
              ) : (
                jobReliabilityRows.map((row) => (
                  <div
                    key={row.id}
                    className={`rounded-[18px] border px-4 py-3 ${
                      row.overdue
                        ? "border-[#f0b4b4] bg-[#fff5f5]"
                        : row.status === "accepted"
                          ? "border-[#bbdfc0] bg-[#f0fbf2]"
                          : row.status === "declined"
                            ? "border-[#e5c2ef] bg-[#fbf5ff]"
                            : "border-[#bdd8e8] bg-[#f7fbff]"
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[#17384a]">{row.propertyName}</span>
                          <span className="rounded-full border border-[#bdd8e8] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#31566a]">
                            {row.kind}
                          </span>
                          {row.overdue ? (
                            <span className="rounded-full border border-[#f0b4b4] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#8a2e22]">
                              Overdue
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-sm text-[#4c6b7b]">{row.accountName}</div>
                        <div className="mt-1 text-xs text-[#6d8795]">
                          Scheduled: {formatScheduledFor(row.scheduledFor)} | Offered: {formatDateTime(row.offeredAt)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[#bdd8e8] bg-white px-3 py-1 text-xs font-semibold capitalize text-[#31566a]">
                          {row.status}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${row.notificationTone}`}>
                          {row.notificationLabel}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-[#4c6b7b] sm:grid-cols-3">
                      <div>Expires: {formatDateTime(row.expiresAt)}</div>
                      <div>Accepted: {formatDateTime(row.acceptedAt)}</div>
                      <div>Declined: {formatDateTime(row.declinedAt)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
        ) : null}

        {jobWorkflowTab === "notifications" ? (
        <section className="rounded-[30px] border border-[#f0c9a5] bg-[linear-gradient(180deg,#fffaf3_0%,#fff4e6_100%)] p-5 shadow-[0_18px_45px_rgba(168,105,28,0.08)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9a650d]">Notification Queue</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#2b2118]">Failed and pending job emails</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#6f6255]">
                These are cleaner and grounds job offers that still need an email sent, plus overdue offers that may need a resend.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                className="rounded-full border border-[#e5caa6] bg-white px-4 py-2 text-sm font-medium text-[#5f4422] outline-none transition focus:border-[#b7791f]"
                value={selectedJobsPropertyFilter}
                onChange={(e) => setSelectedJobsPropertyFilter(e.target.value)}
              >
                <option value="all">All properties</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name || property.address || "Unnamed property"}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void retryAllPendingJobNotifications()}
                disabled={retryingNotificationBatch || failedNotificationRows.length === 0}
                className="rounded-full bg-[#2b2118] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4a3829] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {retryingNotificationBatch ? "Retrying..." : "Retry all pending"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Pending emails", value: failedNotificationStats.total, tone: "border-[#e5caa6] bg-white text-[#2b2118]" },
              { label: "Overdue offers", value: failedNotificationStats.overdue, tone: "border-[#f0b4b4] bg-[#fff5f5] text-[#8a2e22]" },
              { label: "Cleaner slots", value: failedNotificationStats.cleaner, tone: "border-[#c7dcf5] bg-[#f1f7ff] text-[#275b8a]" },
              { label: "Grounds slots", value: failedNotificationStats.grounds, tone: "border-[#c7e2c8] bg-[#f3fbf3] text-[#2d6b35]" },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-[20px] border px-4 py-3 shadow-sm ${stat.tone}`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-75">{stat.label}</div>
                <div className="mt-2 text-3xl font-semibold">{stat.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[24px] border border-[#e5caa6] bg-white p-4">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[#2b2118]">Queue</h3>
                <p className="mt-1 text-sm text-[#6f6255]">
                  Retry sends one offer email through the same notification system used when jobs are created.
                </p>
              </div>
              <span className="rounded-full border border-[#e5caa6] bg-[#fffaf3] px-3 py-1 text-xs font-semibold text-[#7b520f]">
                {failedNotificationStats.total} waiting
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {failedNotificationRows.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-[#e5caa6] bg-[#fffaf3] px-4 py-5 text-sm text-[#6f6255]">
                  No failed or pending job offer emails for this filter.
                </div>
              ) : (
                failedNotificationRows.map((row) => (
                  <div
                    key={row.id}
                    className={`rounded-[18px] border px-4 py-3 ${
                      row.overdue ? "border-[#f0b4b4] bg-[#fff5f5]" : "border-[#e5caa6] bg-[#fffaf3]"
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[#2b2118]">{row.propertyName}</span>
                          <span className="rounded-full border border-[#e5caa6] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#6f6255]">
                            {row.kind}
                          </span>
                          {row.overdue ? (
                            <span className="rounded-full border border-[#f0b4b4] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#8a2e22]">
                              Overdue response
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-sm text-[#6f6255]">{row.accountName}</div>
                        <div className="mt-1 text-xs text-[#8b7a68]">
                          Scheduled: {formatScheduledFor(row.scheduledFor)} | Offered: {formatDateTime(row.offeredAt)} | Expires: {formatDateTime(row.expiresAt)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${row.notificationTone}`}>
                          {row.notificationLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => void retryJobNotification(row.kindApi, [row.slotId], row.id)}
                          disabled={retryingNotificationBatch || retryingNotificationSlotId === row.id}
                          className="rounded-full bg-[#2b2118] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#4a3829] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {retryingNotificationSlotId === row.id ? "Retrying..." : "Retry email"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
        ) : null}

        {jobWorkflowTab === "active" ? (
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
                        <div className={`mt-2 inline-flex rounded-full border px-2 py-1 font-semibold ${getJobNotificationTone(slot)}`}>
                          {getJobNotificationLabel(slot)}
                        </div>
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
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteJob(job.id);
                      }}
                      className="rounded-full border border-[#efc6c6] bg-[#fff5f5] px-4 py-1.5 text-xs font-medium text-[#8a2e22] hover:bg-[#ffecec]"
                    >
                      Delete Job
                    </button>
                  </div>
                </div>

              );
            })}
          </div>
        </section>
        ) : null}

        {jobWorkflowTab === "exceptions" && filteredStrandedJobs.length > 0 ? (
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

        {jobWorkflowTab === "exceptions" && recentDeclinedJobs.length > 0 ? (
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
        {jobWorkflowTab === "exceptions" && filteredStrandedJobs.length === 0 && recentDeclinedJobs.length === 0 ? (
          <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <div className="rounded-[22px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-5 py-8 text-sm text-[#8a7b68]">
              No stranded jobs or recent declines for the current filter.
            </div>
          </section>
        ) : null}
      </div>
    );
  }
  function renderCalendarSection() {
    return (
      <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Admin Calendar</h2>
            <p className="mt-1 text-sm text-[#7f7263]">
              Month view of scheduled cleaning jobs. New iCal feeds appear here after calendars are saved and synced into future checkout jobs.
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
                      setActiveSection("jobs");
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
    );
  }
  function renderPropertySetupSection() {
    const selectedOwner = selectedPropertyOwnerEmail
      ? ownerAccounts.find(
        (owner) =>
          owner.email.trim().toLowerCase() === selectedPropertyOwnerEmail.trim().toLowerCase()
      ) || null
      : null;
    const selectedOwnerProperties = selectedOwner ? getPropertiesForOwner(selectedOwner.id) : [];
    const selectedOwnerPropertyIds = new Set(selectedOwnerProperties.map((property) => property.id));
    const ownerLinkPropertyOptions = selectedOwner
      ? properties.filter((property) => !selectedOwnerPropertyIds.has(property.id))
      : [];
    const selectedProperty = properties.find((property) => property.id === selectedPropertyId) || null;
    const selectedPropertySavedCalendars = propertyCalendars.filter(
      (calendar) => calendar.property_id === selectedPropertyId
    );
    const propertySetupTabs: Array<{ id: PropertySetupTab; label: string }> = [
      { id: "overview", label: "Overview" },
      { id: "access", label: "Access" },
      { id: "calendars", label: "Calendars" },
      { id: "sops", label: "SOPs" },
    ];

    return (
      <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <h2 className="text-xl font-semibold tracking-tight">Property Setup</h2>
        <p className="mt-1 text-sm text-[#7f7263]">Manage access notes, booking calendars, and visual SOPs.</p>

        <div className="mt-5">
          <select
            className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
          >
            <option value="">Select property</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {selectedPropertyId ? (
          <>
            <div className="mt-6 rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-[#241c15]">
                    {selectedProperty?.name || "Selected property"}
                  </h3>
                  <p className="mt-1 text-sm text-[#7f7263]">
                    {selectedProperty?.address || "No address saved yet"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-[#d8c7ab] bg-white px-3 py-1 text-xs font-medium text-[#6f6255]">
                      {selectedPropertySavedCalendars.length} calendar
                      {selectedPropertySavedCalendars.length === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-full border border-[#d8c7ab] bg-white px-3 py-1 text-xs font-medium text-[#6f6255]">
                      {selectedSops.length} SOP{selectedSops.length === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-full border border-[#d8c7ab] bg-white px-3 py-1 text-xs font-medium text-[#6f6255]">
                      {selectedPropertyOwnerEmail ? "Owner linked" : "No owner linked"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {propertySetupTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPropertySetupTab(tab.id)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        propertySetupTab === tab.id
                          ? "bg-[#241c15] text-[#f8f2e8]"
                          : "border border-[#d8c7ab] bg-white text-[#5f5245] hover:bg-[#fffaf4]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {propertySetupTab === "overview" ? (
              <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-6">
                  <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-5">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-semibold text-[#241c15]">Owner Portal</h3>
                      <span className="rounded-full border border-[#d8c7ab] bg-white px-3 py-1 text-xs font-medium text-[#6f6255]">
                        {selectedPropertyOwnerEmail ? "Owner linked" : "No owner linked"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#7f7263]">
                      Link or update the owner for this property.
                    </p>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <input
                        value={selectedPropertyOwnerName}
                        onChange={(e) => {
                          setSelectedPropertyOwnerName(e.target.value);
                          setSelectedPropertyOwnerDirty(true);
                        }}
                        placeholder="Owner name"
                        className="w-full rounded-[16px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                      />

                      <input
                        value={selectedPropertyOwnerEmail}
                        onChange={(e) => {
                          setSelectedPropertyOwnerEmail(e.target.value);
                          setSelectedPropertyOwnerDirty(true);
                        }}
                        placeholder="Owner email"
                        className="w-full rounded-[16px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={saveSelectedPropertyOwner}
                        disabled={!selectedPropertyId || savingSelectedPropertyOwner}
                        className="rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingSelectedPropertyOwner ? "Saving..." : "Save owner"}
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          if (!selectedPropertyId) {
                            setError("Select a property first.");
                            return;
                          }

                          const trimmedEmail = selectedPropertyOwnerEmail.trim().toLowerCase();
                          const trimmedName = selectedPropertyOwnerName.trim();

                          if (!trimmedEmail) {
                            setError("Owner email is required before sending an invite.");
                            return;
                          }

                          await saveSelectedPropertyOwner();
                          await inviteOwnerForProperty(
                            selectedPropertyId,
                            trimmedEmail,
                            trimmedName
                          );
                        }}
                        disabled={
                          !selectedPropertyId ||
                          savingSelectedPropertyOwner ||
                          sendingOwnerInviteId === selectedPropertyId
                        }
                        className="rounded-full border border-[#d8c7ab] bg-white px-5 py-2.5 text-sm font-medium text-[#5f5245] transition hover:bg-[#fcfaf7] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {sendingOwnerInviteId === selectedPropertyId ? "Sending..." : "Send invite"}
                      </button>

                      {selectedPropertyOwnerEmail ? (
                        <button
                          type="button"
                          onClick={async () => {
                            setSelectedPropertyOwnerName("");
                            setSelectedPropertyOwnerEmail("");
                            await saveSelectedPropertyOwner();
                          }}
                          disabled={!selectedPropertyId || savingSelectedPropertyOwner}
                          className="rounded-full border border-[#e7c6c1] bg-white px-5 py-2.5 text-sm font-medium text-[#8a2e22] transition hover:bg-[#fff4f2] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Remove owner link
                        </button>
                      ) : null}
                    </div>

                    {selectedOwner ? (
                      <div className="mt-4 rounded-[18px] border border-[#eadfce] bg-white px-4 py-3">
                        <div className="text-sm font-semibold text-[#241c15]">
                          Owner property access
                        </div>
                        <p className="mt-1 text-xs text-[#8a7b68]">
                          This owner can switch between every property linked here.
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedOwnerProperties.map((property) => (
                            <span
                              key={property.id}
                              className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#6f6255]"
                            >
                              {property.name || property.address || "Unnamed property"}
                            </span>
                          ))}
                        </div>

                        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
                          <select
                            value={ownerLinkTargetPropertyId}
                            onChange={(e) => setOwnerLinkTargetPropertyId(e.target.value)}
                            className="w-full rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#b48d4e]"
                          >
                            <option value="">Link this owner to another property</option>
                            {ownerLinkPropertyOptions.map((property) => (
                              <option key={property.id} value={property.id}>
                                {property.name || property.address || property.id}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => void linkSelectedOwnerToProperty()}
                            disabled={!ownerLinkTargetPropertyId || linkingOwnerProperty}
                            className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-5 py-2 text-sm font-medium text-[#5f5245] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {linkingOwnerProperty ? "Linking..." : "Link property"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-[#241c15]">Property Staffing Defaults</h3>
                        <p className="mt-1 text-sm text-[#7f7263]">
                          Edit cleaner units, full-team requirement, and team status visibility.
                        </p>
                      </div>

                      <button
                        className="inline-flex items-center justify-center rounded-full border border-[#efc6c6] bg-[#fff5f5] px-5 py-2.5 text-sm font-medium text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:opacity-50"
                        onClick={() => {
                          const property = properties.find((p) => p.id === selectedPropertyId);
                          if (property) void deleteProperty(property);
                        }}
                        disabled={deletingPropertyId === selectedPropertyId}
                      >
                        {deletingPropertyId === selectedPropertyId ? "Deleting..." : "Delete property"}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-[#5f5245]">Cleaner units needed</label>
                        <select
                          className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                          value={selectedPropertyUnitsNeeded}
                          onChange={(e) => {
                            setSelectedPropertyUnitsNeeded(e.target.value);
                            setPropertyDefaultsDirty(true);
                          }}
                        >
                          <option value="1">1 cleaner unit</option>
                          <option value="2">2 cleaner units</option>
                          <option value="3">3 cleaner units</option>
                        </select>
                      </div>

                      <label className="flex items-center gap-2 rounded-[18px] border border-[#eadfce] bg-white px-4 py-3 text-sm text-[#6f6255]">
                        <input
                          type="checkbox"
                          checked={selectedPropertyUnitsStrict}
                          onChange={(e) => {
                            setSelectedPropertyUnitsStrict(e.target.checked);
                            setPropertyDefaultsDirty(true);
                          }}
                        />
                        Property must have full team
                      </label>

                      <label className="flex items-center gap-2 rounded-[18px] border border-[#eadfce] bg-white px-4 py-3 text-sm text-[#6f6255]">
                        <input
                          type="checkbox"
                          checked={selectedPropertyShowTeamStatus}
                          onChange={(e) => {
                            setSelectedPropertyShowTeamStatus(e.target.checked);
                            setPropertyDefaultsDirty(true);
                          }}
                        />
                        Show team status to cleaners
                      </label>
                    </div>

                    <div className="mt-4">
                      <button
                        className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60"
                        onClick={() => void saveSelectedPropertyDefaults()}
                        disabled={savingSelectedPropertyDefaults}
                      >
                        {savingSelectedPropertyDefaults ? "Saving..." : "Save Property Setup"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-[#241c15]">Property cover photo</h3>
                      <p className="mt-1 text-sm text-[#7f7263]">
                        Add a photo owners can use to visually switch between properties.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <label className="inline-flex cursor-pointer items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]">
                        {uploadingPropertyCover ? "Uploading..." : "Upload cover photo"}
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          disabled={uploadingPropertyCover}
                          onChange={(e) => void uploadSelectedPropertyCoverPhoto(e)}
                        />
                      </label>

                      {selectedProperty?.cover_photo_url ? (
                        <button
                          type="button"
                          onClick={() => void removeSelectedPropertyCoverPhoto()}
                          disabled={uploadingPropertyCover}
                          className="rounded-full border border-[#e7c6c1] bg-white px-5 py-2.5 text-sm font-medium text-[#8a2e22] transition hover:bg-[#fff4f2] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Remove photo
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {propertyCoverError ? (
                    <div className="mt-4 rounded-[16px] border border-[#e7c6c1] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2e22]">
                      {propertyCoverError}
                    </div>
                  ) : null}

                  {propertyCoverMessage ? (
                    <div className="mt-4 rounded-[16px] border border-[#cfe4cf] bg-[#f4fbf4] px-4 py-3 text-sm text-[#2f6b2f]">
                      {propertyCoverMessage}
                    </div>
                  ) : null}

                  <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadfce] bg-white shadow-sm">
                    {selectedProperty?.cover_photo_url ? (
                      <div>
                        <div className="relative bg-[#1f1812]">
                          <img
                            src={selectedProperty.cover_photo_url}
                            alt={selectedProperty.name || "Property cover photo"}
                            className="h-72 w-full object-cover"
                          />
                        </div>
                        <div className="flex flex-col gap-1 border-t border-[#eadfce] bg-[#fffaf4] px-4 py-3 text-sm text-[#6f6255]">
                          <span className="font-medium text-[#241c15]">
                            {selectedProperty.name || "Property cover photo"}
                          </span>
                          <span className="text-xs text-[#8a7b68]">
                            Owner portal cover preview
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-72 items-center justify-center bg-[linear-gradient(135deg,#f8f2e8,#eadfce)] px-6 text-center text-sm text-[#7f7263]">
                        No cover photo added yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {propertySetupTab === "access" ? (
              <div className="mt-6 rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-5">
                <h3 className="text-lg font-semibold text-[#241c15]">Access Notes</h3>
                <p className="mt-1 text-sm text-[#7f7263]">
                  Keep codes and entry instructions separate from the rest of property setup.
                </p>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#5f5245]">Door code</label>
                    <input
                      className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                      placeholder="Front door / smart lock code"
                      value={doorCode}
                      onChange={(e) => {
                        setDoorCode(e.target.value);
                        setAccessDirty(true);
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#5f5245]">Alarm code</label>
                    <input
                      className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                      placeholder="Alarm panel code"
                      value={alarmCode}
                      onChange={(e) => {
                        setAlarmCode(e.target.value);
                        setAccessDirty(true);
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-[#5f5245]">Extra access notes</label>
                  <textarea
                    className="min-h-[150px] w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                    placeholder="Entry directions, tricky locks, gate notes, etc."
                    value={accessNotes}
                    onChange={(e) => {
                      setAccessNotes(e.target.value);
                      setAccessDirty(true);
                    }}
                  />
                </div>

                <button
                  className="mt-4 inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]"
                  onClick={() => void saveAccess()}
                >
                  Save Access
                </button>
              </div>
            ) : null}

            {propertySetupTab === "calendars" ? (
              <div className="mt-6 rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-[#241c15]">Booking Calendars</h3>
                    <p className="mt-1 text-sm text-[#7f7263]">
                      Add Airbnb and VRBO iCal feeds here, then sync to create future jobs from checkout dates.
                    </p>
                  </div>

                  <div className="rounded-[18px] border border-[#eadfce] bg-white px-4 py-3 text-sm text-[#6f6255]">
                    Draft rows: {calendarRowsDraft.length}. Saved: {selectedPropertySavedCalendars.length}.
                  </div>
                </div>

                {selectedPropertySavedCalendars.length > 0 ? (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {selectedPropertySavedCalendars.map((calendar) => (
                      <div
                        key={calendar.id}
                        className="rounded-[18px] border border-[#eadfce] bg-white px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-[#241c15]">
                            {getCalendarSourceLabel(calendar.source)}
                          </div>
                          <div className="text-xs text-[#8a7b68]">
                            {calendar.is_active === false ? "Inactive" : "Active"}
                          </div>
                        </div>
                        <div className="mt-2 break-all text-xs text-[#8a7b68]">{calendar.ical_url}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {calendarRowsDraft.length === 0 ? (
                  <div className="mt-4 rounded-[18px] border border-dashed border-[#d8c7ab] bg-white px-4 py-4 text-sm text-[#7f7263]">
                    No draft calendar rows yet.
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    {calendarRowsDraft.map((row, index) => (
                      <div
                        key={row.id ?? `draft-${index}`}
                        className="rounded-[20px] border border-[#eadfce] bg-white p-4"
                      >
                        <div className="grid gap-3">
                          <div>
                            <label className="mb-2 block text-sm font-medium text-[#5f5245]">
                              Source
                            </label>
                            <select
                              className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                              value={row.source.trim().toLowerCase()}
                              onChange={(e) =>
                                updateCalendarDraftRow(index, "source", e.target.value)
                              }
                            >
                              <option value="">Choose source</option>
                              {PROPERTY_CALENDAR_SOURCE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
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
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full border border-[#241c15] bg-white px-5 py-2.5 text-sm font-medium text-[#241c15] transition hover:bg-[#f7f3ee]"
                    onClick={addCalendarDraftRow}
                  >
                    Add Calendar
                  </button>

                  <button
                    className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60"
                    onClick={() => void saveCalendars()}
                    disabled={savingCalendars}
                  >
                    {savingCalendars ? "Saving..." : "Save Calendars"}
                  </button>

                  <button
                    className="inline-flex items-center justify-center rounded-full border border-[#241c15] bg-white px-5 py-2.5 text-sm font-medium text-[#241c15] transition hover:bg-[#f7f3ee] disabled:opacity-60"
                    onClick={() => void syncCalendarsNow()}
                    disabled={syncingCalendarsNow}
                  >
                    {syncingCalendarsNow ? "Syncing..." : "Sync Calendars Now"}
                  </button>
                </div>

                <div className="mt-5 rounded-[20px] border border-[#eadfce] bg-white p-4">
                  <div className="text-sm font-medium text-[#241c15]">Import booking history</div>
                  <p className="mt-1 text-sm text-[#7f7263]">
                    Backfill older stays when platform iCal feeds do not include enough history.
                    Upload a CSV with columns like <span className="font-medium text-[#5f5245]">source</span>, <span className="font-medium text-[#5f5245]">guest</span> or <span className="font-medium text-[#5f5245]">summary</span>, <span className="font-medium text-[#5f5245]">checkin</span>, and <span className="font-medium text-[#5f5245]">checkout</span>.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-5 py-2.5 text-sm font-medium text-[#5f5245] transition hover:bg-white">
                      Choose CSV
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          void importBookingHistory(file);
                          e.currentTarget.value = "";
                        }}
                        disabled={importingBookingHistory}
                      />
                    </label>
                    <div className="text-xs text-[#8a7b68]">
                      Sample headers: <span className="font-medium">source, guest, checkin, checkout</span>
                    </div>
                  </div>
                  {importingBookingHistory ? (
                    <div className="mt-3 text-sm text-[#7f7263]">Importing booking history...</div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {propertySetupTab === "sops" ? (
              <div className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
                <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-5">
                  <h3 className="text-lg font-semibold text-[#241c15]">Add SOP Note</h3>
                  <div className="mt-4 space-y-3">
                    <input
                      className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                      placeholder="SOP title"
                      value={sopTitle}
                      onChange={(e) => setSopTitle(e.target.value)}
                    />
                    <textarea
                      className="min-h-[120px] w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]"
                      placeholder="Optional note or instruction"
                      value={sopContent}
                      onChange={(e) => setSopContent(e.target.value)}
                    />

                    <div className="rounded-[20px] border border-dashed border-[#d8c7ab] bg-white p-4">
                      <label className="mb-2 block text-sm font-medium text-[#5f5245]">SOP photos</label>
                      <input type="file" accept="image/*" multiple onChange={handleSopFilesChange} className="block w-full text-sm text-[#6c5f51]" />
                      <div className="mt-3 text-sm text-[#7f7263]">
                        {sopFiles.length > 0 ? `${sopFiles.length} image${sopFiles.length === 1 ? "" : "s"} selected` : "No images selected yet."}
                      </div>
                    </div>

                    <button
                      className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60"
                      onClick={() => void addSop()}
                      disabled={uploadingSop}
                    >
                      {uploadingSop ? "Uploading..." : "Add SOP"}
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-lg font-semibold text-[#241c15]">Existing SOP Notes</h3>
                  <div className="space-y-4">
                    {selectedSops.length === 0 ? (
                      <div className="rounded-[24px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-5 py-6 text-sm text-[#8a7b68]">
                        No SOP notes yet.
                      </div>
                    ) : null}

                    {selectedSops.map((s) => {
                      const images = sopImagesBySopId[s.id] ?? [];
                      return (
                        <div key={s.id} className="rounded-[26px] border border-[#eadfce] bg-white p-4 shadow-sm">
                          <div className="text-base font-semibold text-[#241c15]">{s.title || "Untitled"}</div>
                          <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#6f6255]">{s.content || "No details"}</div>
                          {images.length > 0 ? (
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              {images.map((image) => (
                                <a key={image.id} href={image.image_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] transition hover:shadow-md">
                                  <img src={image.image_url} alt={image.caption || s.title || "SOP image"} className="h-44 w-full cursor-zoom-in object-cover" />
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
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-6 rounded-[24px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-5 py-8 text-sm text-[#8a7b68]">
            Select a property to manage calendars, SOPs, and access details.
          </div>
        )}
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

                      const flaggedByName = getProfileDisplayName(flag.flagged_by_profile_id);
                      const resolvedByName = getProfileDisplayName(flag.resolved_by_profile_id);
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

                                {flaggedByName ? (
                                  <div>
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Flagged by</div>
                                    <div>{flaggedByName}</div>
                                  </div>
                                ) : null}

                                {flag.resolved_at ? (
                                  <div>
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Resolved</div>
                                    <div>{formatDateTime(flag.resolved_at)}</div>
                                  </div>
                                ) : null}

                                {resolvedByName ? (
                                  <div>
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Resolved by</div>
                                    <div>{resolvedByName}</div>
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
                        const flaggedByName = getProfileDisplayName(flag.flagged_by_profile_id);
                        const resolvedByName = getProfileDisplayName(flag.resolved_by_profile_id);
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
                                  {flaggedByName ? (
                                    <div>
                                      <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Flagged by</div>
                                      <div>{flaggedByName}</div>
                                    </div>
                                  ) : null}
                                  {flag.resolved_at ? (
                                    <div>
                                      <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Resolved</div>
                                      <div>{formatDateTime(flag.resolved_at)}</div>
                                    </div>
                                  ) : null}
                                  {resolvedByName ? (
                                    <div>
                                      <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Resolved by</div>
                                      <div>{resolvedByName}</div>
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

  function renderDocumentVaultSection() {
    const categories = ["General", "Owner", "Property", "Insurance", "Tax", "Vendor", "Maintenance", "Invoice", "Legal"];

    return (
      <div className="space-y-6">
        <section className="rounded-[30px] border border-[#ddd6fe] bg-[linear-gradient(180deg,#fbfaff_0%,#f5f3ff_100%)] p-5 shadow-[0_18px_45px_rgba(109,40,217,0.08)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6d28d9]">Document Vault</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#2f1b63]">Property and operations files</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#66548d]">
                Store insurance, owner documents, vendor paperwork, receipts, permits, and other files in one searchable place.
              </p>
            </div>
            <span className="rounded-full border border-[#c4b5fd] bg-white px-3 py-1 text-xs font-semibold text-[#6d28d9]">
              {documentVaultStats.total} document{documentVaultStats.total === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Documents", value: documentVaultStats.total },
              { label: "Linked to properties", value: documentVaultStats.propertyLinked },
              { label: "Categories", value: documentVaultStats.categories },
              { label: "Stored size", value: formatFileSize(documentVaultStats.totalSize) },
            ].map((stat) => (
              <div key={stat.label} className="rounded-[20px] border border-[#ddd6fe] bg-white px-4 py-3 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7c6aa7]">{stat.label}</div>
                <div className="mt-2 text-3xl font-semibold text-[#2f1b63]">{stat.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border border-[#ddd6fe] bg-white p-5 shadow-[0_18px_45px_rgba(109,40,217,0.06)]">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <div className="rounded-[24px] border border-[#ddd6fe] bg-[#fbfaff] p-4">
              <h3 className="text-lg font-semibold text-[#2f1b63]">Upload documents</h3>
              <div className="mt-4 space-y-3">
                <select
                  className="w-full rounded-[18px] border border-[#c4b5fd] bg-white px-4 py-3 text-sm outline-none focus:border-[#7c3aed]"
                  value={documentVaultPropertyId}
                  onChange={(e) => setDocumentVaultPropertyId(e.target.value)}
                >
                  <option value="all">Organization-wide document</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name || property.address || "Unnamed property"}
                    </option>
                  ))}
                </select>

                <select
                  className="w-full rounded-[18px] border border-[#c4b5fd] bg-white px-4 py-3 text-sm outline-none focus:border-[#7c3aed]"
                  value={documentVaultCategory}
                  onChange={(e) => setDocumentVaultCategory(e.target.value)}
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                <input
                  className="w-full rounded-[18px] border border-[#c4b5fd] bg-white px-4 py-3 text-sm outline-none focus:border-[#7c3aed]"
                  placeholder="Document title optional"
                  value={documentVaultTitle}
                  onChange={(e) => setDocumentVaultTitle(e.target.value)}
                />

                <label className="block rounded-[18px] border border-dashed border-[#c4b5fd] bg-white px-4 py-4 text-sm text-[#66548d]">
                  <span className="font-semibold text-[#6d28d9]">Choose files</span>
                  <input
                    type="file"
                    className="sr-only"
                    multiple
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setDocumentVaultFiles(Array.from(e.target.files ?? []))}
                  />
                  <div className="mt-2 text-xs">
                    {documentVaultFiles.length > 0
                      ? `${documentVaultFiles.length} file${documentVaultFiles.length === 1 ? "" : "s"} selected`
                      : "PDFs, images, spreadsheets, and documents can be stored here."}
                  </div>
                </label>

                <button
                  type="button"
                  onClick={() => void uploadDocumentVaultFiles()}
                  disabled={uploadingDocumentVaultFiles}
                  className="w-full rounded-full bg-[#6d28d9] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#5b21b6] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploadingDocumentVaultFiles ? "Uploading..." : "Upload to vault"}
                </button>
              </div>
            </div>

            <div className="rounded-[24px] border border-[#ddd6fe] bg-[#fbfaff] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-[#2f1b63]">Vault files</h3>
                  <p className="mt-1 text-sm text-[#66548d]">Filter by property using the upload property selector.</p>
                </div>
                <span className="rounded-full border border-[#c4b5fd] bg-white px-3 py-1 text-xs font-semibold text-[#6d28d9]">
                  {filteredDocumentVaultRows.length} shown
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {filteredDocumentVaultRows.length === 0 ? (
                  <div className="rounded-[18px] border border-dashed border-[#c4b5fd] bg-white px-4 py-5 text-sm text-[#66548d]">
                    No documents found. If you have not run the document vault SQL yet, the vault will be ready after that setup is complete.
                  </div>
                ) : (
                  filteredDocumentVaultRows.map((document) => (
                    <div key={document.id} className="rounded-[18px] border border-[#ddd6fe] bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="break-words text-base font-semibold text-[#2f1b63]">{document.title || document.file_name}</h4>
                            <span className="rounded-full border border-[#c4b5fd] bg-[#f5f3ff] px-2.5 py-0.5 text-[11px] font-semibold text-[#6d28d9]">
                              {document.category || "General"}
                            </span>
                          </div>
                          <div className="mt-1 break-all text-sm text-[#66548d]">{document.file_name}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#7c6aa7]">
                            <span>{document.property_id ? getPropertyName(document.property_id) : "Organization-wide"}</span>
                            <span>{formatFileSize(document.file_size)}</span>
                            <span>{document.created_at ? formatDateTime(document.created_at) : "Unknown time"}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void openDocumentVaultFile(document)}
                            disabled={openingDocumentVaultId === document.id}
                            className="rounded-full border border-[#c4b5fd] bg-white px-4 py-2 text-sm font-semibold text-[#6d28d9] transition hover:bg-[#f5f3ff] disabled:opacity-60"
                          >
                            {openingDocumentVaultId === document.id ? "Opening..." : "Download"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteDocumentVaultFile(document)}
                            disabled={deletingDocumentVaultId === document.id}
                            className="rounded-full border border-[#fecaca] bg-[#fff5f5] px-4 py-2 text-sm font-semibold text-[#b91c1c] transition hover:bg-[#fff1f2] disabled:opacity-60"
                          >
                            {deletingDocumentVaultId === document.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderBackupSection() {
    const exportCards: Array<{
      title: string;
      description: string;
      meta: string;
      action: string;
      onClick: () => void;
      tone: string;
    }> = [
      {
        title: "Full backup",
        description: "Download one JSON snapshot containing the main organization records loaded in admin.",
        meta: `${properties.length + jobs.length + groundsJobs.length + ownerInvoices.length} core records`,
        action: "Download JSON",
        onClick: downloadFullBackupJson,
        tone: "border-[#cbd5e1] bg-[#f8fafc] text-[#334155]",
      },
      {
        title: "Properties",
        description: "Property directory, ownership link, staffing defaults, and basic listing details.",
        meta: `${properties.length} properties`,
        action: "Download CSV",
        onClick: () => downloadBackupCsv("properties"),
        tone: "border-[#bae6fd] bg-[#f0f9ff] text-[#0369a1]",
      },
      {
        title: "People",
        description: "Cleaner, grounds, and owner account exports with linked team member names.",
        meta: `${cleanerAccounts.length + groundsAccounts.length + ownerAccounts.length} accounts`,
        action: "Download CSV",
        onClick: () => downloadBackupCsv("people"),
        tone: "border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]",
      },
      {
        title: "Jobs",
        description: "Cleaning and grounds job status, schedule, staffing status, and slot counts.",
        meta: `${jobs.length + groundsJobs.length} jobs`,
        action: "Download CSV",
        onClick: () => downloadBackupCsv("jobs"),
        tone: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]",
      },
      {
        title: "Invoices",
        description: "Owner invoice totals, status, owner, property, issue date, due date, and sent date.",
        meta: `${ownerInvoices.length} invoices`,
        action: "Download CSV",
        onClick: () => downloadBackupCsv("invoices"),
        tone: "border-[#fde68a] bg-[#fffbeb] text-[#b45309]",
      },
      {
        title: "Document index",
        description: "Vault metadata, property links, storage paths, categories, and file sizes.",
        meta: `${documentVaultRows.length} documents`,
        action: "Download CSV",
        onClick: () => downloadBackupCsv("documents"),
        tone: "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9]",
      },
    ];

    return (
      <div className="space-y-6">
        <section className="rounded-[30px] border border-[#cbd5e1] bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-[0_18px_45px_rgba(51,65,85,0.08)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#475569]">Backup Center</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#1e293b]">Exports and snapshots</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#64748b]">
                Download a local backup or targeted CSVs for bookkeeping, offline review, and support troubleshooting.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadFullBackupJson}
              className="rounded-full bg-[#1e293b] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#334155]"
            >
              Download full backup
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Properties", value: properties.length },
              { label: "Staff accounts", value: cleanerAccounts.length + groundsAccounts.length },
              { label: "Jobs", value: jobs.length + groundsJobs.length },
              { label: "Invoices", value: ownerInvoices.length },
            ].map((stat) => (
              <div key={stat.label} className="rounded-[20px] border border-[#cbd5e1] bg-white px-4 py-3 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#64748b]">{stat.label}</div>
                <div className="mt-2 text-3xl font-semibold text-[#1e293b]">{stat.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border border-[#cbd5e1] bg-white p-5 shadow-[0_18px_45px_rgba(51,65,85,0.06)]">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-xl font-semibold tracking-tight text-[#1e293b]">Export options</h3>
              <p className="mt-1 text-sm text-[#64748b]">
                CSV exports are easier to open in Excel or import into other tools. JSON is best for a complete snapshot.
              </p>
            </div>
            <span className="rounded-full border border-[#cbd5e1] bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[#475569]">
              Generated from current admin data
            </span>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {exportCards.map((card) => (
              <div key={card.title} className={`rounded-[22px] border p-4 shadow-sm ${card.tone}`}>
                <div className="flex min-h-[170px] flex-col justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold">{card.title}</div>
                    <p className="mt-2 text-sm leading-6 opacity-85">{card.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full border border-current/20 bg-white/70 px-3 py-1 text-xs font-semibold">
                      {card.meta}
                    </span>
                    <button
                      type="button"
                      onClick={card.onClick}
                      className="rounded-full bg-[#1e293b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#334155]"
                    >
                      {card.action}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-[#e2e8f0] bg-[#f8fafc] p-4 text-sm leading-6 text-[#475569]">
          This is a local export center, not an automated offsite database backup yet. It gives you practical downloadable copies now, while a future server-side backup can add scheduled encrypted storage.
        </section>
      </div>
    );
  }

  function renderActiveSection() {
    switch (activeSection) {
      case "home":
        return renderHomeSection();
      case "notifications":
        return renderNotificationCenterSection();
      case "users":
        return renderUsersSection();
      case "properties":
        return (
          <div className="space-y-6">
            {renderPropertyWorkflowCards()}
            {propertyWorkflowTab === "add" ? renderAddPropertySection() : null}
            {propertyWorkflowTab === "setup" ? renderPropertySetupSection() : null}
            {propertyWorkflowTab === "directory" ? renderPropertiesSection() : null}
            {propertyWorkflowTab === "health" ? renderPropertyHealthSection() : null}
          </div>
        );
      case "cleanerAccounts":
        return renderCleanerAccountsSection();
      case "groundsAccounts":
        return renderGroundsAccountsSection();
      case "invites":
        return renderInvitesSection();
      case "chat":
        return renderChatSection();
      case "assignments":
        return renderAssignmentsSection();
      case "jobs":
        return renderJobsSection();
      case "calendar":
        return renderCalendarSection();
      case "maintenance":
        return renderMaintenanceSection();
      case "documents":
        return renderDocumentVaultSection();
      case "backup":
        return renderBackupSection();
      case "invoices":
        return renderInvoicesSection();
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
              <div className="flex h-[90px] w-[90px] items-center justify-center rounded-[18px] border border-white/20 bg-white/10 backdrop-blur">
                <Image
                  src="/guleraoslogo.png"
                  alt="GuleraOS"
                  width={120}
                  height={120}
                  className="h-[70px] w-auto"
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
    <main className="admin-shell min-h-screen">
      <div className={`mx-auto grid w-full max-w-[1800px] gap-4 p-4 pb-[45vh] transition-[grid-template-columns,gap] duration-500 ease-out md:p-6 md:pb-[45vh] 2xl:max-w-[calc(100vw-96px)] ${
        adminMenuOrientation === "side"
          ? "lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start xl:grid-cols-[270px_minmax(0,1fr)] 2xl:gap-8"
          : "lg:grid-cols-1"
      }`}>
        <aside
          className={`hidden transition-all duration-500 ease-out lg:block ${
            adminMenuOrientation === "side"
              ? "lg:sticky lg:top-6 lg:translate-y-0 lg:opacity-100"
              : "lg:pointer-events-none lg:absolute lg:-translate-y-4 lg:scale-95 lg:opacity-0"
          }`}
        >
          <div className="admin-premium-surface rounded-[28px] border p-4">
            <div className="mb-5 rounded-[20px] border border-[#dce7ef] bg-white/90 px-4 py-4">
              <div className="admin-kicker text-xs font-semibold uppercase text-[#64748b]">Admin</div>
              <div className="mt-1 text-xl font-semibold tracking-tight text-[#17202a]">Workspace</div>
            </div>
            <button
              type="button"
              onClick={toggleAdminMenuOrientation}
              className="mb-4 flex w-full items-center justify-between rounded-[16px] border border-[#d9e3ee] bg-white/90 px-4 py-3 text-sm font-semibold text-[#475569] transition hover:bg-white"
            >
              <span>Move menu</span>
              <span className="rounded-full bg-[#17202a] px-3 py-1 text-xs text-white">Top</span>
            </button>
            {renderAdminNavigation("side")}
          </div>
        </aside>

        <div className="min-w-0">
        <div className="admin-premium-surface mb-6 overflow-hidden rounded-[28px] border">
          <div className="relative overflow-hidden px-6 py-7 md:px-8 md:py-8">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(240,249,255,0.96)_0%,rgba(240,253,244,0.82)_50%,rgba(255,247,237,0.92)_100%)]" aria-hidden="true" />
            <div className="absolute right-0 top-0 h-36 w-72 rounded-bl-[80px] bg-[#bae6fd]/35" aria-hidden="true" />
            <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="admin-brand-orb flex h-[116px] w-[172px] shrink-0 items-center justify-center rounded-[26px] border border-white/80 px-5 shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
                  <Image
                    src="/guleraoslogo.png"
                    alt="GuleraOS"
                    width={300}
                    height={100}
                    className="h-auto w-full max-w-[132px]"
                    priority
                  />
                </div>
                <div className="max-w-3xl">
                  <div className="admin-kicker text-xs font-semibold uppercase text-[#0f766e]">GULERAOS</div>
                  <div className="mt-1 inline-flex max-w-full items-center rounded-full border border-[#cbd5e1] bg-white/85 px-3 py-1 text-sm font-semibold text-[#334155] shadow-sm">
                    <span className="mr-1 text-[#64748b]">Company:</span>
                    <span className="truncate">{currentOrganizationLabel}</span>
                  </div>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17202a] md:text-5xl">
                    Property operations, elevated.
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#475569] md:text-base">
                    Staffing, scheduling, maintenance, billing, and owner communication in one focused workspace.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-[#bae6fd] bg-white/80 px-3 py-1 text-xs font-semibold text-[#0369a1]">
                      Live operations
                    </span>
                    <span className="rounded-full border border-[#bbf7d0] bg-white/80 px-3 py-1 text-xs font-semibold text-[#15803d]">
                      {properties.length} properties
                    </span>
                    <span className="rounded-full border border-[#fed7aa] bg-white/80 px-3 py-1 text-xs font-semibold text-[#c2410c]">
                      {notificationCenterCount} alerts
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {currentPortalRole === "platform_admin" ? (
                  <button
                    type="button"
                    onClick={() => router.push("/platform")}
                    className="inline-flex items-center justify-center rounded-full border border-[#cbd5e1] bg-white/80 px-5 py-2.5 text-sm font-medium text-[#334155] shadow-sm transition hover:bg-white"
                  >
                    SaaS Tower
                  </button>
                ) : null}
                {myOrganizations.length > 1 ? (
                  <select
                    value={currentOrganizationId || ""}
                    onChange={(event) => {
                      const nextOrganizationId = event.target.value;
                      if (!nextOrganizationId) return;
                      if (typeof window !== "undefined") {
                        window.localStorage.setItem(ADMIN_SELECTED_ORGANIZATION_KEY, nextOrganizationId);
                      }
                      setAdminDataLoaded(false);
                      setCurrentOrganizationId(nextOrganizationId);
                    }}
                    className="rounded-full border border-[#cbd5e1] bg-white/90 px-4 py-2.5 text-sm font-medium text-[#334155] shadow-sm outline-none transition hover:bg-white focus:border-[#38bdf8]"
                    aria-label="Choose organization"
                  >
                    {myOrganizations.map((organization) => (
                      <option key={organization.organization_id} value={organization.organization_id}>
                        {organization.organization_name || organization.organization_slug || "Organization"}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  onClick={() => setShowSupport(true)}
                  className="inline-flex items-center justify-center rounded-full border border-[#fde68a] bg-[#fef3c7] px-5 py-2.5 text-sm font-medium text-[#7c5a10] shadow-sm hover:bg-[#fde68a]"
                >
                  Support
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full border border-[#cbd5e1] bg-[#17202a] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#263241]"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    window.location.href = "/login";
                  }}
                >
                  Logout
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-[#e2e8f0] bg-white/72 px-4 py-3 md:hidden">
            <button
              type="button"
              onClick={() => setShowMobileWorkspaceStats((current) => !current)}
              className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-[#d8e4ef] bg-white/85 px-4 py-3 text-left shadow-sm"
            >
              <span>
                <span className="block text-sm font-semibold text-[#17202a]">Workspace stats</span>
                <span className="mt-0.5 block text-xs text-[#64748b]">
                  {properties.length} properties | {jobs.length + groundsJobs.length} jobs | {ownerInvoices.length} invoices
                </span>
              </span>
              <span className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-3 py-1 text-xs font-semibold text-[#6f6255]">
                {showMobileWorkspaceStats ? "Hide" : "Show"}
              </span>
            </button>
          </div>

          <div className={`${showMobileWorkspaceStats ? "grid" : "hidden"} gap-3 border-t border-[#e2e8f0] bg-white/72 px-6 py-4 sm:grid-cols-2 md:grid md:grid-cols-4 xl:grid-cols-8 md:px-8`}>
            {[
              { label: "Properties", value: properties.length, tone: "border-[#bae6fd] bg-[#f0f9ff]" },
              { label: "Cleaner Accounts", value: cleanerAccounts.length, tone: "border-[#a7f3d0] bg-[#ecfdf5]" },
              { label: "Grounds Accounts", value: groundsAccounts.length, tone: "border-[#99f6e4] bg-[#f0fdfa]" },
              { label: "Assignments", value: assignments.length + groundsAssignments.length, tone: "border-[#d9f99d] bg-[#f7fee7]" },
              { label: "Jobs", value: jobs.length + groundsJobs.length, tone: "border-[#bbf7d0] bg-[#f0fdf4]" },
              { label: "Invoices", value: ownerInvoices.length, tone: "border-[#fde68a] bg-[#fffbeb]" },
              { label: "Users", value: profiles.length, tone: "border-[#c7d2fe] bg-[#eef2ff]" },
              { label: "Flags", value: maintenanceFlags.length, tone: "border-[#fecaca] bg-[#fff1f2]" },
            ].map((item) => (
              <div key={item.label} className={`rounded-[20px] border px-4 py-4 shadow-sm ${item.tone}`}>
                <div className="admin-kicker text-[11px] uppercase text-[#64748b]">{item.label}</div>
                <div className="mt-2 text-3xl font-semibold text-[#17202a]">{item.value}</div>
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

        {currentOrganizationBilling ? (
          <div
            className={`mb-6 rounded-[24px] border px-4 py-4 shadow-sm ${
              trialExpired
                ? "border-[#f5c2c7] bg-[#fff1f2] text-[#8a2e22]"
                : trialEndingSoon
                  ? "border-[#ecd7a8] bg-[#fff8e8] text-[#8a6112]"
                  : "border-[#d8c7ab] bg-[#fcfaf7] text-[#5f5245]"
            }`}
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em]">
                  {currentTrialStatus === "active"
                    ? "Billing Ready"
                    : trialExpired
                      ? "Trial Ended"
                      : "Free Trial"}
                </div>
                <div className="mt-1 text-sm leading-6">
                  {currentTrialStatus === "active"
                    ? "This organization is marked as active for future billing integration."
                    : trialExpired
                      ? "This organization’s free trial has ended. Billing enforcement is not turned on yet, but this workspace is now flagged for a future upgrade flow."
                      : trialDaysRemaining === null
                        ? "This organization is in trial mode while billing is being prepared."
                        : trialDaysRemaining === 0
                          ? "This organization’s free trial ends today."
                          : `${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"} left in the free trial.`}
                </div>
                <div className="mt-1 text-xs opacity-80">
                  Status: {currentTrialStatus}
                  {currentOrganizationBilling.trial_ends_at
                    ? ` • Trial ends ${new Date(currentOrganizationBilling.trial_ends_at).toLocaleDateString()}`
                    : ""}
                </div>
              </div>

              <div className="rounded-full border border-current/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em]">
                Pricing coming later
              </div>
            </div>
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
                        : alert.tone === "green"
                          ? "border-[#bbdfc0] bg-[#f0fbf2] text-[#236b30] hover:bg-[#e4f7e8]"
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

        {adminMenuOrientation === "top" ? (
          <div className="mb-6 hidden origin-top rounded-[24px] border border-[#e7ddd0] bg-[#fbf8f4] p-3 shadow-[0_18px_45px_rgba(0,0,0,0.05)] transition-all duration-500 ease-out lg:block">
            <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a7b68]">Admin Menu</div>
              </div>
              <button
                type="button"
                onClick={toggleAdminMenuOrientation}
                className="inline-flex items-center justify-center rounded-full border border-[#d8c7ab] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f5245] transition hover:bg-[#fcfaf7]"
              >
                Use side menu
              </button>
            </div>
            {renderAdminNavigation("top")}
          </div>
        ) : null}

        <div className="mb-6 hidden rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <div className="hidden text-xs uppercase tracking-[0.24em] text-[#8a7b68]">Today at a Glance</div>
                <div className="hidden rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#6f6255]">
                  {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                </div>
              </div>
              <div className="mt-3 hidden grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: "Cleaning Today", value: todayAtGlanceCounts.cleaning },
                  { label: "Grounds Today", value: todayAtGlanceCounts.grounds },
                  { label: "Waiting", value: todayAtGlanceCounts.waiting },
                  { label: "Overdue", value: todayAtGlanceCounts.overdue },
                  { label: "Open Flags", value: todayAtGlanceCounts.flags },
                ].map((item) => (
                  <div key={item.label} className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-4 shadow-sm">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#8a7b68]">{item.label}</div>
                    <div className="mt-2 text-3xl font-semibold text-[#241c15]">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full lg:max-w-xl hidden">
              <div className="rounded-[26px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#241c15]">Today’s Schedule</div>
                    <div className="mt-1 text-sm text-[#7f7263]">
                      Quick view of today’s jobs by property and town.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSection("jobs");
                      setAdminSelectedDate(todayYmd);
                      setTimeout(() => {
                        document.getElementById("admin-calendar-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 50);
                    }}
                    className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-xs font-medium text-[#6f6255] transition hover:bg-[#fffdf9]"
                  >
                    Open day view
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {todayAtGlanceItems.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-[#d8c7ab] bg-white px-4 py-4 text-sm text-[#7f7263]">
                      Nothing scheduled today.
                    </div>
                  ) : (
                    todayAtGlanceItems.slice(0, 8).map((item) => (
                      <div key={item.id} className="rounded-[18px] border border-[#eadfce] bg-white px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${item.kind === "Cleaning" ? "bg-[#fff4dd] text-[#8a6112]" : "bg-[#edf7ef] text-[#2f6b2f]"}`}>
                                {item.kind}
                              </span>
                              <span className="text-sm font-semibold text-[#241c15]">{item.title}</span>
                            </div>
                            <div className="mt-1 text-sm text-[#6f6255]">
                              {item.propertyName}{item.city ? ` · ${item.city}` : ""}
                            </div>
                          </div>
                          <div className="text-xs font-medium text-[#8a7b68]">{item.status}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-[24px] border border-[#e7ddd0] bg-white p-3 shadow-[0_18px_45px_rgba(0,0,0,0.05)] lg:hidden">
          <button
            type="button"
            onClick={() => setShowAdminNav(true)}
            className="flex w-full items-center justify-between rounded-[18px] border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-3 text-left text-sm font-semibold text-[#241c15]"
          >
            <span>
              Menu
              <span className="ml-2 text-xs font-medium text-[#8a7b68]">
                {orderedAdminMenuItems.find((item) => item.key === activeSection)?.label}
              </span>
            </span>
            <span className="rounded-full border border-[#d8c7ab] bg-white px-3 py-1 text-xs text-[#6f6255]">
              Open
            </span>
          </button>
        </div>

        {showAdminNav ? (
          <div className="fixed inset-0 z-50 bg-[#241c15]/35 p-4 backdrop-blur-sm lg:hidden">
            <div className="ml-auto flex h-full max-w-sm flex-col rounded-[28px] border border-[#e7ddd0] bg-[#fbf8f4] p-4 shadow-[0_30px_70px_rgba(0,0,0,0.22)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a7b68]">Admin</div>
                  <div className="mt-1 text-xl font-semibold text-[#241c15]">Navigation</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdminNav(false)}
                  className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-semibold text-[#6f6255]"
                >
                  Close
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {renderAdminNavigation("side")}
              </div>
            </div>
          </div>
        ) : null}

        {renderActiveSection()}
        </div>
      </div>

      {error || actionMessage ? (
        <div
          className={`fixed bottom-4 left-4 right-4 z-[45] rounded-[24px] border px-4 py-3 text-sm shadow-[0_18px_45px_rgba(0,0,0,0.16)] backdrop-blur sm:left-auto sm:max-w-xl ${
            error
              ? "border-[#e7c6c1] bg-[#fff4f2]/95 text-[#8a2e22]"
              : "border-[#cfe4cf] bg-[#f4fbf4]/95 text-[#2f6b2f]"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em]">
                {error ? "Needs attention" : "Update complete"}
              </div>
              <div className="mt-1 leading-5">{error || actionMessage}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (error) setError("");
                if (actionMessage) setActionMessage("");
              }}
              className="rounded-full border border-current/20 px-3 py-1 text-xs font-semibold opacity-80 transition hover:opacity-100"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

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
      {showSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-[#241c15]">Report an issue</h2>

            <input
              type="text"
              placeholder="Subject"
              value={supportSubject}
              onChange={(e) => setSupportSubject(e.target.value)}
              className="mt-4 w-full rounded-[16px] border border-[#eadfce] px-4 py-3"
            />

            <textarea
              placeholder="Describe the issue..."
              value={supportMessage}
              onChange={(e) => setSupportMessage(e.target.value)}
              className="mt-3 w-full rounded-[16px] border border-[#eadfce] px-4 py-3 min-h-[120px]"
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowSupport(false)}
                className="rounded-full border px-4 py-2"
              >
                Cancel
              </button>

              <button
                onClick={async () => {
                  if (!supportMessage.trim()) {
                    alert("Please describe the issue.");
                    return;
                  }

                  try {
                    setSendingSupport(true);

                    const {
                      data: { user },
                    } = await supabase.auth.getUser();

                    if (!user) {
                      alert("You must be signed in to submit a support request.");
                      return;
                    }

                    let organizationId: string | null = null;

                    const { data: membership } = await supabase
                      .from("organization_members")
                      .select("organization_id")
                      .eq("user_id", user.id)
                      .maybeSingle();

                    organizationId = membership?.organization_id ?? null;

                    const { error } = await supabase.from("support_tickets").insert({
                      user_id: user.id,
                      organization_id: organizationId,
                      subject: supportSubject.trim() || "Support request",
                      message: supportMessage.trim(),
                      status: "open",
                    });

                    if (error) {
                      console.error("Support ticket insert failed:", error);
                      alert(`Error submitting: ${error.message}`);
                      return;
                    }

                    const { error: emailError } = await supabase.functions.invoke(
                      "send-support-email",
                      {
                        body: {
                          subject: supportSubject,
                          message: supportMessage,
                          userEmail: user.email,
                        },
                      }
                    );

                    setShowSupport(false);
                    setSupportMessage("");
                    setSupportSubject("");

                    if (emailError) {
                      console.error("Support email failed:", emailError);
                      alert("Ticket saved, but email failed.");
                      return;
                    }

                    alert("Submitted.");
                  } catch (error) {
                    console.error("Unexpected support submit error:", error);
                    alert("Something went wrong submitting your request.");
                  } finally {
                    setSendingSupport(false);
                  }
                }}
                disabled={sendingSupport}
                className="rounded-full bg-[#1f2937] px-5 py-2 text-white disabled:opacity-60"
              >
                {sendingSupport ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function getCalendarSourceLabel(source: string | null | undefined) {
  const normalized = (source || "").trim().toLowerCase();
  return (
    PROPERTY_CALENDAR_SOURCE_OPTIONS.find((option) => option.value === normalized)?.label ||
    source ||
    "Unnamed calendar"
  );
}
