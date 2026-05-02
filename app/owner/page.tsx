"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type Property = {
  id: string;
  organization_id: string;
  name: string | null;
  address: string | null;
  notes: string | null;
  cover_photo_url?: string | null;
};

type TurnoverJob = {
  id: string;
  property_id: string;
  status: string | null;
  notes: string | null;
  created_at?: string | null;
  scheduled_for?: string | null;
};

type BookingEvent = {
  id: string;
  property_id: string;
  source: string | null;
  summary: string | null;
  checkin_date: string;
  checkout_date: string;
  created_at?: string | null;
};

type GroundsJob = {
  id: string;
  property_id: string;
  status: string | null;
  notes: string | null;
  created_at?: string | null;
  scheduled_for?: string | null;
  job_type?: string | null;
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
  active: boolean;
};

type OwnerInvoiceLineItem = {
  id: string;
  description: string;
  category?: string;
  quantity: number;
  rate: number;
  receipt_urls?: string[];
  receipt_names?: string[];
};

type OwnerInvoice = {
  id: string;
  owner_account_id: string;
  property_id: string | null;
  invoice_number: string;
  status: "sent" | "paid";
  issue_date: string;
  due_date: string | null;
  company_name: string | null;
  logo_url: string | null;
  header_text: string | null;
  notes: string | null;
  payment_instructions: string | null;
  line_items: OwnerInvoiceLineItem[];
  subtotal: number;
  tax_total: number;
  total: number;
  sent_at?: string | null;
};

type MaintenanceFlagImage = {
  id: string;
  flag_id: string;
  image_url: string;
  caption?: string | null;
  sort_order: number;
};

type MaintenanceFlag = {
  id: string;
  property_id?: string | null;
  source?: string | null;
  category?: string | null;
  urgency?: string | null;
  status?: string | null;
  notes?: string | null;
  created_at?: string | null;
  flagged_at?: string | null;
  resolved_at?: string | null;
};

type TimelineItem = {
  id: string;
  type: "cleaning" | "grounds" | "booking" | "issue";
  title: string;
  date: string | null;
  subtitle?: string | null;
  tone?: "gold" | "emerald" | "sky" | "rose";
};

type OwnerTab = "overview" | "insights" | "invoices";

type BookingInsight = {
  id: string;
  sourceLabel: string | null;
  guest: string | null;
  checkinDate: string;
  checkoutDate: string;
  nights: number;
};

const ISSUE_CATEGORIES = [
  "General concern",
  "Damage",
  "Cleaning issue",
  "Supplies",
  "Lock / access",
  "Plumbing",
  "Electrical",
  "Lawn / exterior",
  "Pest issue",
  "Safety issue",
  "Other",
] as const;

function getCityFromAddress(address?: string | null) {
  if (!address) return "";
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return address;
}

function formatDateLabel(dateString: string | null | undefined) {
  if (!dateString) return "Not scheduled";
  const hasTime = dateString.includes("T");
  const d = hasTime ? new Date(dateString) : new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateString;

  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeYmd(value?: string | null) {
  if (!value) return null;
  return value.slice(0, 10);
}

function parseBookingFromNotes(notes: string | null) {
  if (!notes) {
    return {
      sourceLabel: null as string | null,
      guest: null as string | null,
      checkinDate: null as string | null,
      checkoutDate: null as string | null,
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
  const checkinMatch = normalized.match(/Check-in date\s*:\s*(\d{4}-\d{2}-\d{2})/i);
  const checkoutMatch = normalized.match(/Checkout date\s*:\s*(\d{4}-\d{2}-\d{2})/i);

  return {
    sourceLabel,
    guest: guestMatch?.[1]?.trim() || null,
    checkinDate: checkinMatch?.[1] || null,
    checkoutDate: checkoutMatch?.[1] || null,
  };
}

function isResolved(flag: MaintenanceFlag) {
  if (flag.resolved_at) return true;
  const state = String(flag.status || "").toLowerCase().trim();
  return state === "resolved" || state === "closed" || state === "done";
}

function isFutureOrToday(dateYmd: string | null) {
  if (!dateYmd) return false;
  const today = new Date();
  const todayYmd = [
    today.getFullYear(),
    `${today.getMonth() + 1}`.padStart(2, "0"),
    `${today.getDate()}`.padStart(2, "0"),
  ].join("-");
  return dateYmd >= todayYmd;
}

function getBookingSourceLabel(source: string | null | undefined) {
  const normalized = (source || "").trim().toLowerCase();
  if (normalized === "airbnb") return "Airbnb";
  if (normalized === "vrbo") return "VRBO";
  if (normalized === "booking" || normalized === "booking.com") return "Booking.com";
  return normalized ? normalized.toUpperCase() : null;
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

function getMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "short",
  });
}

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function getDaysInMonth(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function getLastMonthKeys(count: number) {
  const today = new Date();
  const keys: string[] = [];

  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(getMonthKey(new Date(today.getFullYear(), today.getMonth() - i, 1)));
  }

  return keys;
}

function getDateRangeNights(startYmd: string, endYmd: string) {
  const start = new Date(`${startYmd}T12:00:00`);
  const end = new Date(`${endYmd}T12:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function countBookedNightsInMonth(booking: BookingInsight, monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const bookingStart = new Date(`${booking.checkinDate}T12:00:00`);
  const bookingEnd = new Date(`${booking.checkoutDate}T12:00:00`);

  if (Number.isNaN(bookingStart.getTime()) || Number.isNaN(bookingEnd.getTime())) return 0;

  const overlapStart = bookingStart > monthStart ? bookingStart : monthStart;
  const overlapEnd = bookingEnd < monthEnd ? bookingEnd : monthEnd;
  const nights = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86400000);

  return Math.max(0, nights);
}

function countBookedNightsInWindow(bookings: BookingInsight[], days: number) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + days);

  return bookings.reduce((total, booking) => {
    const bookingStart = new Date(`${booking.checkinDate}T12:00:00`);
    const bookingEnd = new Date(`${booking.checkoutDate}T12:00:00`);

    if (Number.isNaN(bookingStart.getTime()) || Number.isNaN(bookingEnd.getTime())) {
      return total;
    }

    const overlapStart = bookingStart > start ? bookingStart : start;
    const overlapEnd = bookingEnd < end ? bookingEnd : end;
    const nights = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86400000);

    return total + Math.max(0, nights);
  }, 0);
}

function getGroundsLabel(jobType?: string | null) {
  switch ((jobType || "").toLowerCase()) {
    case "lawn_cut":
      return "Grounds service • Lawn cut";
    case "yard_cleanup":
      return "Grounds service • Yard cleanup";
    case "snow_clear":
      return "Grounds service • Snow clearing";
    case "salt":
      return "Grounds service • Salt / ice";
    case "garbage_out":
      return "Grounds service • Garbage out";
    case "recycling_out":
      return "Grounds service • Recycling out";
    case "bulk_pickup_out":
      return "Grounds service • Bulk pickup";
    default:
      return "Grounds service";
  }
}

function formatRecurringGroundsLabel(rule: GroundsRecurringRule) {
  if (rule.label?.trim()) return rule.label.trim();
  return getGroundsLabel(rule.task_type || "grounds");
}

function getNextRecurringDate(rule: GroundsRecurringRule) {
  if (!rule.active) return null;

  const today = new Date();
  const todayYmd = normalizeYmd(today.toISOString()) || "";
  const nextRun = normalizeYmd(rule.next_run_date);
  if (nextRun && isFutureOrToday(nextRun)) return nextRun;

  const startDate = normalizeYmd(rule.start_date);
  if (startDate && isFutureOrToday(startDate)) return startDate;

  if (rule.end_date) {
    const endDate = normalizeYmd(rule.end_date);
    if (endDate && endDate < todayYmd) return null;
  }

  if (rule.frequency_type === "weekly" || rule.frequency_type === "biweekly") {
    const intervalDays =
      rule.frequency_type === "biweekly"
        ? 14
        : Math.max(rule.interval_days || 7, 7);

    const anchor = rule.anchor_date || rule.start_date;
    if (!anchor) return null;

    const cursor = new Date(`${anchor}T12:00:00`);
    if (Number.isNaN(cursor.getTime())) return null;

    while ((normalizeYmd(cursor.toISOString()) || "") < todayYmd) {
      cursor.setDate(cursor.getDate() + intervalDays);
    }

    return normalizeYmd(cursor.toISOString());
  }

  if (rule.frequency_type === "monthly") {
    const base = new Date();
    const startDateValue = new Date(`${rule.start_date}T12:00:00`);
    const fallbackDay = Number.isNaN(startDateValue.getTime()) ? 1 : startDateValue.getDate();
    const targetDay = Math.max(1, Math.min(rule.day_of_month || fallbackDay || 1, 28));

    let candidate = new Date(base.getFullYear(), base.getMonth(), targetDay);
    if ((normalizeYmd(candidate.toISOString()) || "") < todayYmd) {
      candidate = new Date(base.getFullYear(), base.getMonth() + 1, targetDay);
    }
    return normalizeYmd(candidate.toISOString());
  }

  if (rule.frequency_type === "semi_monthly") {
    const d1 = Math.max(1, Math.min(rule.semi_monthly_day_1 || 1, 28));
    const d2 = Math.max(1, Math.min(rule.semi_monthly_day_2 || 15, 28));
    const base = new Date();
    const candidates = [
      new Date(base.getFullYear(), base.getMonth(), d1),
      new Date(base.getFullYear(), base.getMonth(), d2),
      new Date(base.getFullYear(), base.getMonth() + 1, d1),
      new Date(base.getFullYear(), base.getMonth() + 1, d2),
    ];

    for (const candidate of candidates) {
      const ymd = normalizeYmd(candidate.toISOString());
      if (ymd && ymd >= todayYmd) return ymd;
    }
  }

  return null;
}

function StatCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string | null;
}) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm">
      <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-[#f7f1e8]">{value}</div>
      {subtext ? <div className="mt-2 text-sm text-[#e6d8bf]">{subtext}</div> : null}
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const toneClass =
    item.tone === "emerald"
      ? "bg-emerald-400"
      : item.tone === "sky"
        ? "bg-sky-400"
        : item.tone === "rose"
          ? "bg-rose-400"
          : "bg-[#b08b47]";

  return (
    <div className="flex gap-4 rounded-2xl border border-white/7 bg-white/[0.02] px-4 py-4">
      <div className="flex flex-col items-center">
        <div className={`mt-1 h-2.5 w-2.5 rounded-full ${toneClass}`} />
        <div className="mt-2 h-full w-px bg-white/10" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-[#f7f1e8]">{item.title}</div>
          <div className="text-xs uppercase tracking-[0.18em] text-[#e7c98a]">
            {formatDateLabel(item.date)}
          </div>
        </div>

        {item.subtitle ? (
          <div className="mt-1 text-sm leading-relaxed text-[#e6d8bf]">{item.subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}

function ReportIssueModal({
  open,
  onClose,
  propertyId,
  organizationId,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  organizationId: string;
  onSubmitted: () => void;
}) {
  const [category, setCategory] = useState<string>("General concern");
  const [urgency, setUrgency] = useState<string>("normal");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setCategory("General concern");
    setUrgency("normal");
    setNotes("");
    setFiles([]);
    setSaving(false);
    setError("");
  }, [open]);

  if (!open) return null;

  function appendFiles(newFiles: FileList | null) {
    if (!newFiles?.length) return;
    setFiles((prev) => [...prev, ...Array.from(newFiles)]);
  }

  async function handleSubmit() {
    if (!propertyId) {
      setError("Property not found.");
      return;
    }

    if (!organizationId) {
      setError("Organization not found.");
      return;
    }

    if (!notes.trim()) {
      setError("Please describe the issue.");
      return;
    }

    setSaving(true);
    setError("");

    const { data: flag, error: insertError } = await supabase
      .from("property_maintenance_flags")
      .insert({
        organization_id: organizationId,
        property_id: propertyId,
        source: "owner",
        category,
        urgency,
        status: "open",
        notes: notes.trim(),
        flagged_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !flag) {
      setError(insertError?.message || "Could not submit issue.");
      setSaving(false);
      return;
    }

    if (files.length > 0) {
      const uploads: Array<{ flag_id: string; image_url: string; sort_order: number }> = [];

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${flag.id}/${Date.now()}-${i}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("maintenance-flag-images")
          .upload(filePath, file);

        if (uploadError) {
          console.error(uploadError);
          continue;
        }

        const { data } = supabase.storage
          .from("maintenance-flag-images")
          .getPublicUrl(filePath);

        uploads.push({
          flag_id: flag.id,
          image_url: data.publicUrl,
          sort_order: i,
        });
      }

      if (uploads.length > 0) {
        const { error: imageInsertError } = await supabase
          .from("property_maintenance_flag_images")
          .insert(uploads);

        if (imageInsertError) {
          console.error(imageInsertError);
        }
      }
    }

    setSaving(false);
    onSubmitted();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/70 px-4 py-4 sm:py-6">
      <div className="flex min-h-full items-start justify-center">
        <div className="my-auto w-full max-w-xl rounded-[28px] border border-white/10 bg-[#17120d] shadow-[0_30px_90px_rgba(0,0,0,0.45)] max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-h-[calc(100vh-3rem)]">
          <div className="border-b border-white/8 px-5 py-4 sm:px-6">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">Owner Portal</div>
            <h3 className="mt-2 text-xl font-semibold text-[#f7f1e8]">Report an Issue</h3>
            <p className="mt-1 text-sm text-[#e6d8bf]">
              Send us a concern and it will be added to the maintenance queue.
            </p>
          </div>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[#e7c98a]">Category</label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {ISSUE_CATEGORIES.map((item) => {
                  const selected = item === category;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCategory(item)}
                      className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${selected
                        ? "border-[#e7c98a] bg-[#b08b47]/20 text-[#f7f1e8]"
                        : "border-white/8 bg-white/[0.03] text-[#e8ddca] hover:bg-white/[0.05]"
                        }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[#e7c98a]">Priority</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { value: "low", label: "Low" },
                  { value: "normal", label: "Normal" },
                  { value: "urgent", label: "Urgent" },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setUrgency(item.value)}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${urgency === item.value
                      ? item.value === "urgent"
                        ? "border-red-400/70 bg-red-500 text-white"
                        : "border-[#e7c98a] bg-[#b08b47]/20 text-[#f7f1e8]"
                      : "border-white/8 bg-white/[0.03] text-[#e8ddca] hover:bg-white/[0.05]"
                      }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[#e7c98a]">Details</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Example: The kitchen sink is leaking under the cabinet."
                className="mt-2 min-h-[130px] w-full rounded-2xl border border-white/8 bg-[#100c08] px-4 py-3 text-sm text-[#f7f1e8] outline-none transition focus:border-[#b08b47]"
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[#e7c98a]">Photos</label>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => appendFiles(e.target.files)}
                className="hidden"
              />

              <input
                ref={libraryInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => appendFiles(e.target.files)}
                className="hidden"
              />

              <div className="mt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="rounded-full bg-[#b08b47] px-4 py-2.5 text-sm font-semibold text-[#17120d]"
                >
                  Take Photo
                </button>

                <button
                  type="button"
                  onClick={() => libraryInputRef.current?.click()}
                  className="rounded-full border border-white/12 px-4 py-2.5 text-sm font-semibold text-[#f7f1e8] transition hover:bg-white/[0.05]"
                >
                  Add Photos
                </button>
              </div>

              <div className="mt-2 text-xs text-[#ccb99a]">
                Use your camera or photo library to help explain the issue.
              </div>

              {files.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <div className="text-sm text-[#e6d8bf]">
                    {files.length} photo{files.length === 1 ? "" : "s"} selected
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {files.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-xs text-[#e6d8bf]"
                      >
                        {file.name}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-500/25 bg-red-950/20 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <div className="sticky bottom-0 flex flex-wrap gap-3 border-t border-white/8 bg-[#17120d] pt-4">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={saving}
                className="rounded-full bg-[#b08b47] px-5 py-2.5 text-sm font-semibold text-[#17120d] transition hover:brightness-110 disabled:opacity-60"
              >
                {saving ? "Submitting..." : "Submit Issue"}
              </button>

              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-full border border-white/12 px-5 py-2.5 text-sm font-semibold text-[#f7f1e8] transition hover:bg-white/[0.05]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OwnerPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ownerAccount, setOwnerAccount] = useState<OwnerAccountRow | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [turnoverJobs, setTurnoverJobs] = useState<TurnoverJob[]>([]);
  const [bookingEvents, setBookingEvents] = useState<BookingEvent[]>([]);
  const [groundsJobs, setGroundsJobs] = useState<GroundsJob[]>([]);
  const [groundsRecurringRules, setGroundsRecurringRules] = useState<GroundsRecurringRule[]>([]);
  const [ownerInvoices, setOwnerInvoices] = useState<OwnerInvoice[]>([]);
  const [flags, setFlags] = useState<MaintenanceFlag[]>([]);
  const [flagImages, setFlagImages] = useState<MaintenanceFlagImage[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSuccess, setReportSuccess] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [activeOwnerTab, setActiveOwnerTab] = useState<OwnerTab>("overview");

  async function signOutOwner() {
    await supabase.auth.signOut();
    window.location.href = "/owner/login";
  }

  const flagImagesByFlagId = useMemo(() => {
    const map = new Map<string, MaintenanceFlagImage[]>();
    for (const image of flagImages) {
      const list = map.get(image.flag_id) || [];
      list.push(image);
      map.set(image.flag_id, list);
    }
    return map;
  }, [flagImages]);

  async function loadData() {
    setLoading(true);
    setError("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      window.location.href = "/owner/login";
      return;
    }

    const email = user.email.trim().toLowerCase();

    const { data: ownerRes, error: ownerError } = await supabase
      .from("owner_accounts")
      .select("*")
      .eq("email", email)
      .maybeSingle<OwnerAccountRow>();

    if (ownerError) {
      setError(ownerError.message);
      setLoading(false);
      return;
    }

    if (!ownerRes) {
      setError("No owner account is linked to this sign-in.");
      setLoading(false);
      return;
    }

    setOwnerAccount(ownerRes);

    const { data: accessRows, error: accessError } = (await supabase
      .from("owner_property_access")
      .select("*")
      .eq("owner_account_id", ownerRes.id)) as {
        data: OwnerPropertyAccessRow[] | null;
        error: { message: string } | null;
      };

    if (accessError) {
      setError(accessError.message);
      setLoading(false);
      return;
    }

    const propertyIds = (accessRows ?? []).map((row) => row.property_id);

    if (propertyIds.length === 0) {
      setProperties([]);
      setTurnoverJobs([]);
      setBookingEvents([]);
      setGroundsJobs([]);
      setGroundsRecurringRules([]);
      setOwnerInvoices([]);
      setFlags([]);
      setFlagImages([]);
      setLoading(false);
      return;
    }

    const [
      propertiesRes,
      turnoverRes,
      bookingEventsRes,
      groundsRes,
      groundsRecurringRulesRes,
      ownerInvoicesRes,
      flagsRes,
      flagImagesRes,
    ] = await Promise.all([
      supabase
        .from("properties")
        .select("*")
        .in("id", propertyIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("turnover_jobs")
        .select("id,property_id,status,notes,created_at,scheduled_for")
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("property_booking_events")
        .select("id,property_id,source,summary,checkin_date,checkout_date,created_at")
        .in("property_id", propertyIds)
        .order("checkin_date", { ascending: false }),
      supabase
        .from("grounds_jobs")
        .select("id,property_id,status,notes,created_at,scheduled_for,job_type")
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("property_grounds_recurring_rules")
        .select("id,property_id,task_type,label,notes,frequency_type,interval_days,day_of_week,day_of_month,semi_monthly_day_1,semi_monthly_day_2,anchor_date,start_date,end_date,next_run_date,active")
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("owner_invoices")
        .select("id,owner_account_id,property_id,invoice_number,status,issue_date,due_date,company_name,logo_url,header_text,notes,payment_instructions,line_items,subtotal,tax_total,total,sent_at")
        .eq("owner_account_id", ownerRes.id)
        .in("status", ["sent", "paid"])
        .order("issue_date", { ascending: false }),
      supabase
        .from("property_maintenance_flags")
        .select("id,property_id,source,category,urgency,status,notes,created_at,flagged_at,resolved_at")
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("property_maintenance_flag_images")
        .select("id,flag_id,image_url,caption,sort_order")
        .order("sort_order", { ascending: true }),
    ]);

    for (const res of [
      propertiesRes,
      turnoverRes,
      bookingEventsRes,
      groundsRes,
      groundsRecurringRulesRes,
      ownerInvoicesRes,
      flagsRes,
      flagImagesRes,
    ]) {
      if (res.error) {
        if (
          res === bookingEventsRes &&
          ((res.error as any).code === "PGRST205" ||
            String(res.error.message || "").includes("property_booking_events"))
        ) {
          continue;
        }

        setError(res.error.message);
        setLoading(false);
        return;
      }
    }

    const loadedProperties = (propertiesRes.data ?? []) as Property[];
    setProperties(loadedProperties);
    setTurnoverJobs((turnoverRes.data ?? []) as TurnoverJob[]);
    setBookingEvents(bookingEventsRes.error ? [] : ((bookingEventsRes.data ?? []) as BookingEvent[]));
    setGroundsJobs((groundsRes.data ?? []) as GroundsJob[]);
    setGroundsRecurringRules((groundsRecurringRulesRes.data ?? []) as GroundsRecurringRule[]);
    setOwnerInvoices((ownerInvoicesRes.data ?? []) as OwnerInvoice[]);
    setFlags((flagsRes.data ?? []) as MaintenanceFlag[]);
    setFlagImages((flagImagesRes.data ?? []) as MaintenanceFlagImage[]);
    setSelectedPropertyId((currentPropertyId) => {
      if (loadedProperties.some((property) => property.id === currentPropertyId)) {
        return currentPropertyId;
      }

      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const propertyFromUrl = params.get("property") || "";
        if (loadedProperties.some((property) => property.id === propertyFromUrl)) {
          return propertyFromUrl;
        }
      }

      return loadedProperties[0]?.id || "";
    });
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const selectedProperty =
    properties.find((property) => property.id === selectedPropertyId) || properties[0] || null;

  function handleOwnerPropertyChange(propertyId: string) {
    setSelectedPropertyId(propertyId);

    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (propertyId) {
      url.searchParams.set("property", propertyId);
    } else {
      url.searchParams.delete("property");
    }
    window.history.replaceState(null, "", url.toString());
  }

  const propertyTurnoverJobs = useMemo(() => {
    if (!selectedProperty) return [];
    return turnoverJobs.filter((job) => job.property_id === selectedProperty.id);
  }, [selectedProperty, turnoverJobs]);

  const propertyBookingEvents = useMemo(() => {
    if (!selectedProperty) return [];
    return bookingEvents.filter((event) => event.property_id === selectedProperty.id);
  }, [selectedProperty, bookingEvents]);

  const propertyGroundsJobs = useMemo(() => {
    if (!selectedProperty) return [];
    return groundsJobs.filter((job) => job.property_id === selectedProperty.id);
  }, [selectedProperty, groundsJobs]);

  const propertyGroundsRecurringRules = useMemo(() => {
    if (!selectedProperty) return [];
    return groundsRecurringRules.filter((rule) => rule.property_id === selectedProperty.id && rule.active);
  }, [selectedProperty, groundsRecurringRules]);

  const propertyOwnerInvoices = useMemo(() => {
    if (!selectedProperty) return ownerInvoices;
    return ownerInvoices.filter(
      (invoice) => !invoice.property_id || invoice.property_id === selectedProperty.id
    );
  }, [selectedProperty, ownerInvoices]);

  const propertyFlags = useMemo(() => {
    if (!selectedProperty) return [];
    return flags.filter((flag) => flag.property_id === selectedProperty.id);
  }, [selectedProperty, flags]);

  const openFlags = useMemo(() => propertyFlags.filter((flag) => !isResolved(flag)), [propertyFlags]);

  const nextCleaning = useMemo(() => {
    return propertyTurnoverJobs
      .filter((job) => isFutureOrToday(normalizeYmd(job.scheduled_for)))
      .sort((a, b) => (normalizeYmd(a.scheduled_for) || "").localeCompare(normalizeYmd(b.scheduled_for) || ""))[0] || null;
  }, [propertyTurnoverJobs]);

  const nextGroundsJob = useMemo(() => {
    return propertyGroundsJobs
      .filter((job) => isFutureOrToday(normalizeYmd(job.scheduled_for)))
      .sort((a, b) => (normalizeYmd(a.scheduled_for) || "").localeCompare(normalizeYmd(b.scheduled_for) || ""))[0] || null;
  }, [propertyGroundsJobs]);

  const nextRecurringGroundsRule = useMemo(() => {
    return propertyGroundsRecurringRules
      .map((rule) => ({ rule, nextDate: getNextRecurringDate(rule) }))
      .filter((item) => !!item.nextDate)
      .sort((a, b) => (a.nextDate || "").localeCompare(b.nextDate || ""))[0] || null;
  }, [propertyGroundsRecurringRules]);

  const nextGrounds = nextGroundsJob
    ? {
      date: nextGroundsJob.scheduled_for,
      label: getGroundsLabel(nextGroundsJob.job_type),
      subtext: "Upcoming exterior service",
    }
    : nextRecurringGroundsRule
      ? {
        date: nextRecurringGroundsRule.nextDate,
        label: formatRecurringGroundsLabel(nextRecurringGroundsRule.rule),
        subtext: "Recurring grounds schedule",
      }
      : null;

  const upcomingBooking = useMemo(() => {
    const eventBooking =
      propertyBookingEvents
        .filter((event) => isFutureOrToday(event.checkin_date))
        .sort((a, b) => a.checkin_date.localeCompare(b.checkin_date))[0] || null;

    if (eventBooking) {
      return {
        job: null,
        booking: {
          sourceLabel: getBookingSourceLabel(eventBooking.source),
          guest: eventBooking.summary,
          checkinDate: eventBooking.checkin_date,
          checkoutDate: eventBooking.checkout_date,
        },
      };
    }

    return propertyTurnoverJobs
      .map((job) => {
        const booking = parseBookingFromNotes(job.notes);
        return { job, booking };
      })
      .filter((item) => !!item.booking.checkinDate && isFutureOrToday(item.booking.checkinDate))
      .sort((a, b) => (a.booking.checkinDate || "").localeCompare(b.booking.checkinDate || ""))[0] || null;
  }, [propertyBookingEvents, propertyTurnoverJobs]);

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    for (const job of propertyTurnoverJobs) {
      const booking = parseBookingFromNotes(job.notes);

      if (isFutureOrToday(normalizeYmd(job.scheduled_for))) {
        items.push({
          id: `cleaning-${job.id}`,
          type: "cleaning",
          title: "Scheduled cleaning",
          date: normalizeYmd(job.scheduled_for),
          subtitle: booking.guest
            ? `Prepared for ${booking.guest}${booking.sourceLabel ? ` • ${booking.sourceLabel}` : ""}`
            : "Upcoming cleaning visit",
          tone: "gold",
        });
      }

      if (booking.checkinDate && isFutureOrToday(booking.checkinDate)) {
        items.push({
          id: `booking-${job.id}`,
          type: "booking",
          title: "Upcoming booking",
          date: booking.checkinDate,
          subtitle:
            booking.guest || booking.sourceLabel
              ? [booking.guest, booking.sourceLabel].filter(Boolean).join(" • ")
              : "Upcoming reservation activity",
          tone: "sky",
        });
      }
    }

    if (propertyBookingEvents.length > 0) {
      for (const event of propertyBookingEvents) {
        if (!isFutureOrToday(event.checkin_date)) continue;

        const sourceLabel = getBookingSourceLabel(event.source);

        items.push({
          id: `booking-event-${event.id}`,
          type: "booking",
          title: "Upcoming booking",
          date: event.checkin_date,
          subtitle:
            event.summary || sourceLabel
              ? [event.summary, sourceLabel].filter(Boolean).join(" â€¢ ")
              : "Upcoming reservation activity",
          tone: "sky",
        });
      }
    }

    for (const job of propertyGroundsJobs) {
      if (!isFutureOrToday(normalizeYmd(job.scheduled_for))) continue;

      items.push({
        id: `grounds-${job.id}`,
        type: "grounds",
        title: getGroundsLabel(job.job_type),
        date: normalizeYmd(job.scheduled_for),
        subtitle: job.notes?.trim() || "Upcoming exterior service",
        tone: "emerald",
      });
    }

    for (const rule of propertyGroundsRecurringRules) {
      const nextDate = getNextRecurringDate(rule);
      if (!nextDate) continue;

      items.push({
        id: `grounds-rule-${rule.id}`,
        type: "grounds",
        title: `${formatRecurringGroundsLabel(rule)} • Recurring`,
        date: nextDate,
        subtitle: rule.notes?.trim() || "Recurring grounds schedule",
        tone: "emerald",
      });
    }

    for (const flag of openFlags) {
      items.push({
        id: `issue-${flag.id}`,
        type: "issue",
        title: `Open issue${flag.category ? ` • ${flag.category}` : ""}`,
        date: flag.flagged_at || flag.created_at || null,
        subtitle: flag.notes || "Issue reported",
        tone: "rose",
      });
    }

    return items
      .sort((a, b) => {
        const aDate = a.date || "9999-12-31";
        const bDate = b.date || "9999-12-31";
        return aDate.localeCompare(bDate);
      })
      .slice(0, 8);
  }, [propertyTurnoverJobs, propertyBookingEvents, propertyGroundsJobs, propertyGroundsRecurringRules, openFlags]);

  const bookingInsights = useMemo<BookingInsight[]>(() => {
    if (propertyBookingEvents.length > 0) {
      return propertyBookingEvents
        .map((event) => {
          const nights = getDateRangeNights(event.checkin_date, event.checkout_date);
          if (nights <= 0) return null;

          return {
            id: event.id,
            sourceLabel: getBookingSourceLabel(event.source),
            guest: event.summary,
            checkinDate: event.checkin_date,
            checkoutDate: event.checkout_date,
            nights,
          } satisfies BookingInsight;
        })
        .filter((booking): booking is BookingInsight => !!booking)
        .sort((a, b) => a.checkinDate.localeCompare(b.checkinDate));
    }

    return propertyTurnoverJobs
      .map((job) => {
        const booking = parseBookingFromNotes(job.notes);
        if (!booking.checkinDate || !booking.checkoutDate) return null;

        const nights = getDateRangeNights(booking.checkinDate, booking.checkoutDate);
        if (nights <= 0) return null;

        return {
          id: job.id,
          sourceLabel: booking.sourceLabel,
          guest: booking.guest,
          checkinDate: booking.checkinDate,
          checkoutDate: booking.checkoutDate,
          nights,
        } satisfies BookingInsight;
      })
      .filter((booking): booking is BookingInsight => !!booking)
      .sort((a, b) => a.checkinDate.localeCompare(b.checkinDate));
  }, [propertyBookingEvents, propertyTurnoverJobs]);

  const bookingInsightStats = useMemo(() => {
    const monthKeys = getLastMonthKeys(12);
    const monthly = monthKeys.map((monthKey) => {
      const bookedNights = bookingInsights.reduce(
        (total, booking) => total + countBookedNightsInMonth(booking, monthKey),
        0
      );
      const bookings = bookingInsights.filter((booking) => booking.checkinDate.slice(0, 7) === monthKey);
      const daysInMonth = getDaysInMonth(monthKey);

      return {
        monthKey,
        label: getMonthLabel(monthKey),
        bookedNights,
        bookingCount: bookings.length,
        occupancyRate: daysInMonth > 0 ? Math.round((bookedNights / daysInMonth) * 100) : 0,
      };
    });

    const totalBookedNights = monthly.reduce((total, month) => total + month.bookedNights, 0);
    const totalBookingCount = monthly.reduce((total, month) => total + month.bookingCount, 0);
    const averageStay =
      bookingInsights.length > 0
        ? bookingInsights.reduce((total, booking) => total + booking.nights, 0) / bookingInsights.length
        : 0;
    const averageOccupancy =
      monthly.length > 0
        ? Math.round(monthly.reduce((total, month) => total + month.occupancyRate, 0) / monthly.length)
        : 0;
    const bestMonth = [...monthly].sort((a, b) => b.occupancyRate - a.occupancyRate)[0] || null;
    const maxBookedNights = Math.max(1, ...monthly.map((month) => month.bookedNights));
    const maxBookingCount = Math.max(1, ...monthly.map((month) => month.bookingCount));
    const next30 = countBookedNightsInWindow(bookingInsights, 30);
    const next60 = countBookedNightsInWindow(bookingInsights, 60);
    const next90 = countBookedNightsInWindow(bookingInsights, 90);

    const sourceCounts = bookingInsights.reduce<Record<string, number>>((counts, booking) => {
      const label = booking.sourceLabel || "Other";
      counts[label] = (counts[label] || 0) + booking.nights;
      return counts;
    }, {});

    const sourceMix = Object.entries(sourceCounts)
      .map(([label, nights]) => ({
        label,
        nights,
        percentage: totalBookedNights > 0 ? Math.round((nights / totalBookedNights) * 100) : 0,
      }))
      .sort((a, b) => b.nights - a.nights);

    const gapBuckets = {
      oneNight: 0,
      twoNight: 0,
      threeNight: 0,
      fourPlus: 0,
    };

    for (let i = 1; i < bookingInsights.length; i += 1) {
      const gap = getDateRangeNights(bookingInsights[i - 1].checkoutDate, bookingInsights[i].checkinDate);
      if (gap <= 0) continue;
      if (gap === 1) gapBuckets.oneNight += 1;
      else if (gap === 2) gapBuckets.twoNight += 1;
      else if (gap === 3) gapBuckets.threeNight += 1;
      else gapBuckets.fourPlus += 1;
    }

    return {
      monthly,
      totalBookedNights,
      totalBookingCount,
      averageStay,
      averageOccupancy,
      bestMonth,
      maxBookedNights,
      maxBookingCount,
      bookingPace: [
        { label: "Next 30", days: 30, bookedNights: next30, percentage: Math.round((next30 / 30) * 100) },
        { label: "Next 60", days: 60, bookedNights: next60, percentage: Math.round((next60 / 60) * 100) },
        { label: "Next 90", days: 90, bookedNights: next90, percentage: Math.round((next90 / 90) * 100) },
      ],
      sourceMix,
      gapBuckets,
      recentBookings: [...bookingInsights].reverse().slice(0, 6),
    };
  }, [bookingInsights]);

  if (loading) {
    return (
    <main className="owner-shell min-h-screen bg-[#0f0d0a] px-4 py-10 text-[#f7f1e8]">
        <div className="mx-auto max-w-6xl rounded-[32px] border border-white/8 bg-[#15110d] p-8">
          Loading owner dashboard...
        </div>
      </main>
    );
  }

  if (error) {
    return (
    <main className="owner-shell min-h-screen bg-[#0f0d0a] px-4 py-10 text-[#f7f1e8]">
        <div className="mx-auto max-w-2xl rounded-[32px] border border-red-500/20 bg-red-950/20 p-8">
          <div className="text-[11px] uppercase tracking-[0.22em] text-red-200">
            Owner access
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-[#f7f1e8]">
            We could not open this owner portal.
          </h1>
          <p className="mt-3 text-sm leading-6 text-red-100">
            {error}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void signOutOwner()}
              className="rounded-full bg-[#b08b47] px-5 py-2.5 text-sm font-semibold text-[#17120d] transition hover:brightness-110"
            >
              Sign out and use a different email
            </button>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-full border border-white/12 px-5 py-2.5 text-sm font-semibold text-[#f7f1e8] transition hover:bg-white/[0.05]"
            >
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!selectedProperty) {
    return (
    <main className="owner-shell min-h-screen bg-[#0f0d0a] px-4 py-10 text-[#f7f1e8]">
        <div className="mx-auto max-w-2xl rounded-[32px] border border-white/8 bg-[#15110d] p-8">
          <h1 className="text-2xl font-semibold text-[#f7f1e8]">No property found yet.</h1>
          <p className="mt-3 text-sm leading-6 text-[#e6d8bf]">
            This owner account is active, but no properties are linked to it yet.
          </p>
          <button
            type="button"
            onClick={() => void signOutOwner()}
            className="mt-6 rounded-full bg-[#b08b47] px-5 py-2.5 text-sm font-semibold text-[#17120d] transition hover:brightness-110"
          >
            Sign out and use a different email
          </button>
        </div>
      </main>
    );
  }

  const bookingInfo = upcomingBooking?.booking || null;

  return (
    <main className="owner-shell min-h-screen px-4 py-6 text-[#f7f1e8] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(23,18,13,0.98)_0%,rgba(14,11,8,1)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
          {selectedProperty.cover_photo_url ? (
            <div className="relative h-64 overflow-hidden sm:h-80">
              <img
                src={selectedProperty.cover_photo_url}
                alt={selectedProperty.name || "Property cover photo"}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,13,10,0.12)_0%,rgba(15,13,10,0.78)_100%)]" />
              <div className="absolute inset-x-0 bottom-0 px-6 py-6 sm:px-8">
                <div className="max-w-2xl">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[#ead7b8]">
                    Owner Dashboard
                  </div>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                    {selectedProperty.name || "Property Overview"}
                  </h1>
                  <p className="mt-2 text-base text-[#f2e5d0]">
                    {getCityFromAddress(selectedProperty.address) || selectedProperty.address || "Location unavailable"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-6 px-6 py-7 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              {!selectedProperty.cover_photo_url ? (
                <>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[#e7c98a]">
                    Owner Dashboard
                  </div>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#f7f1e8] sm:text-4xl">
                    {selectedProperty.name || "Property Overview"}
                  </h1>
                  <p className="mt-2 text-base text-[#e6d8bf]">
                    {getCityFromAddress(selectedProperty.address) || selectedProperty.address || "Location unavailable"}
                  </p>
                </>
              ) : (
                <div className="text-sm text-[#e6d8bf]">
                  {getCityFromAddress(selectedProperty.address) || selectedProperty.address || "Location unavailable"}
                </div>
              )}

              {ownerAccount?.email ? (
                <div className="mt-3 text-sm text-[#ccb99a]">{ownerAccount.email}</div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              {properties.length > 1 ? (
                <select
                  value={selectedProperty.id}
                  onChange={(e) => handleOwnerPropertyChange(e.target.value)}
                  className="min-w-[220px] rounded-full border border-white/12 bg-[#15110d] px-5 py-3 text-sm font-semibold text-[#f7f1e8] outline-none transition hover:bg-white/[0.05] focus:border-[#b08b47]"
                >
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name || property.address || "Unnamed property"}
                    </option>
                  ))}
                </select>
              ) : null}

              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="rounded-full bg-[#b08b47] px-5 py-3 text-sm font-semibold text-[#17120d] transition hover:brightness-110"
              >
                Report an Issue
              </button>

              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = "/owner/login";
                }}
                className="rounded-full border border-white/12 px-5 py-3 text-sm font-semibold text-[#f7f1e8] transition hover:bg-white/[0.05]"
              >
                Logout
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[26px] border border-white/8 bg-[#15110d] p-2">
          <div className="grid gap-2 lg:grid-cols-3">
            {[
              { key: "overview" as OwnerTab, label: "Overview", subtext: "Operations and upcoming activity" },
              { key: "insights" as OwnerTab, label: "Booking Insights", subtext: "Occupancy trends and booking history" },
              { key: "invoices" as OwnerTab, label: "Invoices", subtext: "Statements and property charges" },
            ].map((tab) => {
              const isActive = activeOwnerTab === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveOwnerTab(tab.key)}
                  className={`rounded-[22px] px-5 py-4 text-left transition ${isActive
                    ? "bg-[linear-gradient(135deg,#b08b47,#e3c177)] text-[#17120d] shadow-[0_16px_40px_rgba(176,139,71,0.22)]"
                    : "bg-white/[0.03] text-[#f7f1e8] hover:bg-white/[0.06]"
                    }`}
                >
                  <div className="text-sm font-semibold">{tab.label}</div>
                  <div className={`mt-1 text-xs ${isActive ? "text-[#382511]" : "text-[#ccb99a]"}`}>
                    {tab.subtext}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {activeOwnerTab === "overview" ? (
          <>
        {properties.length > 1 ? (
          <section className="rounded-[28px] border border-white/8 bg-[#15110d] p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">
                  Properties
                </div>
                <h2 className="mt-2 text-xl font-semibold text-[#f7f1e8]">
                  Switch by photo
                </h2>
              </div>
              <div className="text-sm text-[#ccb99a]">
                {properties.length} linked properties
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {properties.map((property) => {
                const isSelected = property.id === selectedProperty.id;

                return (
                  <button
                    key={property.id}
                    type="button"
                    onClick={() => handleOwnerPropertyChange(property.id)}
                    className={`overflow-hidden rounded-[22px] border text-left transition ${isSelected
                      ? "border-[#b08b47] bg-[#201911] shadow-[0_0_0_1px_rgba(176,139,71,0.35)]"
                      : "border-white/8 bg-white/[0.02] hover:border-white/18 hover:bg-white/[0.04]"
                      }`}
                  >
                    {property.cover_photo_url ? (
                      <img
                        src={property.cover_photo_url}
                        alt={property.name || "Property cover photo"}
                        className="h-32 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-32 items-center justify-center bg-[radial-gradient(circle_at_top,rgba(176,139,71,0.32),transparent_36%),linear-gradient(135deg,#2a2119,#14100c)] px-4 text-center text-xs uppercase tracking-[0.2em] text-[#e7c98a]">
                        No photo
                      </div>
                    )}

                    <div className="px-4 py-3">
                      <div className="truncate text-sm font-semibold text-[#f7f1e8]">
                        {property.name || "Unnamed property"}
                      </div>
                      <div className="mt-1 truncate text-xs text-[#ccb99a]">
                        {getCityFromAddress(property.address) || property.address || "Location unavailable"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {reportSuccess ? (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">
            {reportSuccess}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Next Cleaning"
            value={nextCleaning ? formatDateLabel(nextCleaning.scheduled_for) : "Not scheduled"}
            subtext="Upcoming interior turnover"
          />
          <StatCard
            label="Next Grounds Service"
            value={nextGrounds ? formatDateLabel(nextGrounds.date) : "Not scheduled"}
            subtext={
              nextGrounds
                ? `${nextGrounds.label}${nextGrounds.subtext ? ` • ${nextGrounds.subtext}` : ""}`
                : "No exterior service scheduled"
            }
          />
          <StatCard
            label="Upcoming Booking"
            value={bookingInfo?.checkinDate ? formatDateLabel(bookingInfo.checkinDate) : "Not available"}
            subtext={
              bookingInfo
                ? [bookingInfo.guest, bookingInfo.sourceLabel].filter(Boolean).join(" • ") || "Booking found from sync"
                : "No synced upcoming booking found"
            }
          />
          <StatCard
            label="Active Issues"
            value={String(openFlags.length)}
            subtext={openFlags.length > 0 ? "Maintenance items currently open" : "No active issues right now"}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] border border-white/8 bg-[#15110d] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">
                  Today at a Glance
                </div>
                <h2 className="mt-2 text-xl font-semibold text-[#f7f1e8]">Upcoming Activity</h2>
              </div>
              <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-[0.18em] text-[#e7c98a]">
                {Math.min(timelineItems.length, 4)} shown
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {timelineItems.length > 0 ? (
                timelineItems.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-white/7 bg-white/[0.02] px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#f7f1e8]">{item.title}</div>
                        {item.subtitle ? (
                          <div className="mt-1 line-clamp-2 text-sm text-[#e6d8bf]">{item.subtitle}</div>
                        ) : null}
                      </div>
                      <div
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.tone === "emerald"
                          ? "bg-emerald-400"
                          : item.tone === "sky"
                            ? "bg-sky-400"
                            : item.tone === "rose"
                              ? "bg-rose-400"
                              : "bg-[#b08b47]"
                          }`}
                      />
                    </div>
                    <div className="mt-3 text-xs uppercase tracking-[0.18em] text-[#e7c98a]">
                      {formatDateLabel(item.date)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/7 bg-white/[0.02] px-4 py-5 text-sm text-[#e6d8bf] sm:col-span-2">
                  Nothing upcoming has been scheduled yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/8 bg-[#15110d] p-5 sm:p-6">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">Active Issues</div>
            <h2 className="mt-2 text-xl font-semibold text-[#f7f1e8]">Maintenance Status</h2>

            <div className="mt-5 space-y-3">
              {openFlags.length > 0 ? (
                openFlags.slice(0, 6).map((flag) => (
                  <div
                    key={flag.id}
                    className="rounded-2xl border border-red-500/20 bg-red-950/15 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[#f7f1e8]">
                        {flag.category || "Open issue"}
                      </div>
                      <div className="rounded-full border border-red-400/30 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-red-200">
                        {flag.urgency || "open"}
                      </div>
                    </div>

                    <div className="mt-2 text-sm leading-relaxed text-[#d8c7ab]">
                      {flag.notes || "Issue reported"}
                    </div>

                    {(flagImagesByFlagId.get(flag.id) || []).length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(flagImagesByFlagId.get(flag.id) || []).slice(0, 4).map((image) => (
                          <img
                            key={image.id}
                            src={image.image_url}
                            alt="Issue attachment"
                            className="h-16 w-16 rounded-xl object-cover"
                          />
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-3 text-xs uppercase tracking-[0.18em] text-[#e7c98a]">
                      Reported {formatDateLabel(flag.flagged_at || flag.created_at)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/15 px-4 py-5 text-sm text-emerald-200">
                  No active issues at the moment.
                </div>
              )}
            </div>
          </div>
        </section>
          </>
        ) : activeOwnerTab === "insights" ? (
          <>
            <section className="overflow-hidden rounded-[32px] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(176,139,71,0.22),transparent_30%),linear-gradient(180deg,#18130f_0%,#100d0a_100%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.26)] sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[#e7c98a]">
                    Booking Performance
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#f7f1e8] sm:text-3xl">
                    Occupancy story for {selectedProperty.name || "this property"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#e6d8bf]">
                    Built from synced booking calendar data. Financial ROI can be added later once nightly rate and cost assumptions are available.
                  </p>
                </div>

                <div className="rounded-full border border-[#b08b47]/30 bg-[#b08b47]/10 px-4 py-2 text-sm font-semibold text-[#f1d9a5]">
                  Last 12 months
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Avg Occupancy"
                  value={`${bookingInsightStats.averageOccupancy}%`}
                  subtext="Average monthly booked-night coverage"
                />
                <StatCard
                  label="Booked Nights"
                  value={String(bookingInsightStats.totalBookedNights)}
                  subtext="Total nights found in synced bookings"
                />
                <StatCard
                  label="Reservations"
                  value={String(bookingInsightStats.totalBookingCount)}
                  subtext="Bookings with check-in dates in the period"
                />
                <StatCard
                  label="Avg Stay"
                  value={`${bookingInsightStats.averageStay.toFixed(1)} nights`}
                  subtext={bookingInsightStats.bestMonth ? `Best month: ${bookingInsightStats.bestMonth.label}` : "Based on synced stays"}
                />
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
              <div className="rounded-[30px] border border-white/8 bg-[#15110d] p-5 sm:p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">
                      Occupancy Trend
                    </div>
                    <h3 className="mt-2 text-xl font-semibold text-[#f7f1e8]">
                      Monthly booked nights
                    </h3>
                  </div>
                  <div className="text-sm text-[#ccb99a]">
                    Bars show occupied nights, labels show occupancy.
                  </div>
                </div>

                <div className="mt-6 grid h-72 grid-cols-12 items-end gap-2 rounded-[24px] border border-white/7 bg-black/20 px-4 pb-5 pt-6">
                  {bookingInsightStats.monthly.map((month) => (
                    <div key={month.monthKey} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
                      <div className="text-[10px] font-semibold text-[#ead7b8]">
                        {month.occupancyRate}%
                      </div>
                      <div className="flex h-48 w-full items-end justify-center">
                        <div
                          className="w-full max-w-9 rounded-t-full bg-[linear-gradient(180deg,#f2d48a_0%,#b08b47_58%,#67491e_100%)] shadow-[0_0_24px_rgba(176,139,71,0.24)]"
                          style={{
                            height: `${Math.max(6, (month.bookedNights / bookingInsightStats.maxBookedNights) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[#ccb99a]">
                        {month.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[30px] border border-white/8 bg-[#15110d] p-5 sm:p-6">
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">
                  Booking Pace
                </div>
                <h3 className="mt-2 text-xl font-semibold text-[#f7f1e8]">
                  Future demand
                </h3>

                <div className="mt-6 space-y-5">
                  {bookingInsightStats.bookingPace.map((pace) => (
                    <div key={pace.label}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-[#f7f1e8]">{pace.label} days</div>
                        <div className="text-sm text-[#e6d8bf]">
                          {pace.bookedNights}/{pace.days} nights
                        </div>
                      </div>
                      <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/8">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#b08b47,#f0d28b)]"
                          style={{ width: `${Math.min(100, pace.percentage)}%` }}
                        />
                      </div>
                      <div className="mt-1 text-xs text-[#ccb99a]">{pace.percentage}% booked</div>
                    </div>
                  ))}
                </div>

                <div className="mt-7 rounded-[22px] border border-[#b08b47]/20 bg-[#b08b47]/10 p-4">
                  <div className="text-sm font-semibold text-[#f7f1e8]">Read this as booking pace</div>
                  <p className="mt-2 text-sm leading-6 text-[#e6d8bf]">
                    A high next-30 score means the near-term calendar is filling. A low next-90 score can still be normal for slower seasons.
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-3">
              <div className="rounded-[30px] border border-white/8 bg-[#15110d] p-5 sm:p-6">
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">
                  Source Mix
                </div>
                <h3 className="mt-2 text-xl font-semibold text-[#f7f1e8]">Booked nights by source</h3>

                <div className="mt-6 space-y-4">
                  {bookingInsightStats.sourceMix.length > 0 ? (
                    bookingInsightStats.sourceMix.map((source) => (
                      <div key={source.label}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-semibold text-[#f7f1e8]">{source.label}</span>
                          <span className="text-[#e6d8bf]">{source.nights} nights</span>
                        </div>
                        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/8">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#f0d28b,#b08b47)]"
                            style={{ width: `${Math.max(4, source.percentage)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-white/7 bg-white/[0.02] px-4 py-5 text-sm text-[#e6d8bf]">
                      No booking source data found yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[30px] border border-white/8 bg-[#15110d] p-5 sm:p-6">
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">
                  Gap Opportunities
                </div>
                <h3 className="mt-2 text-xl font-semibold text-[#f7f1e8]">Empty windows between stays</h3>

                <div className="mt-6 grid grid-cols-4 gap-3">
                  {[
                    { label: "1 night", value: bookingInsightStats.gapBuckets.oneNight },
                    { label: "2 nights", value: bookingInsightStats.gapBuckets.twoNight },
                    { label: "3 nights", value: bookingInsightStats.gapBuckets.threeNight },
                    { label: "4+ nights", value: bookingInsightStats.gapBuckets.fourPlus },
                  ].map((bucket) => {
                    const maxGap = Math.max(
                      1,
                      bookingInsightStats.gapBuckets.oneNight,
                      bookingInsightStats.gapBuckets.twoNight,
                      bookingInsightStats.gapBuckets.threeNight,
                      bookingInsightStats.gapBuckets.fourPlus
                    );

                    return (
                      <div key={bucket.label} className="flex h-44 flex-col items-center justify-end rounded-2xl border border-white/7 bg-black/20 px-3 py-4">
                        <div className="text-lg font-semibold text-[#f7f1e8]">{bucket.value}</div>
                        <div className="mt-3 flex h-24 w-full items-end justify-center">
                          <div
                            className="w-7 rounded-t-full bg-[linear-gradient(180deg,#c5f2d0,#45a36f)]"
                            style={{ height: `${Math.max(8, (bucket.value / maxGap) * 100)}%` }}
                          />
                        </div>
                        <div className="mt-3 text-center text-[10px] uppercase tracking-[0.14em] text-[#ccb99a]">
                          {bucket.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[30px] border border-white/8 bg-[#15110d] p-5 sm:p-6">
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">
                  Reservation Volume
                </div>
                <h3 className="mt-2 text-xl font-semibold text-[#f7f1e8]">Bookings by month</h3>

                <div className="mt-6 space-y-3">
                  {bookingInsightStats.monthly.map((month) => (
                    <div key={month.monthKey} className="grid grid-cols-[42px_1fr_32px] items-center gap-3">
                      <div className="text-xs uppercase tracking-[0.14em] text-[#ccb99a]">{month.label}</div>
                      <div className="h-3 overflow-hidden rounded-full bg-white/8">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#7dd3fc,#2563eb)]"
                          style={{ width: `${Math.max(3, (month.bookingCount / bookingInsightStats.maxBookingCount) * 100)}%` }}
                        />
                      </div>
                      <div className="text-right text-sm font-semibold text-[#f7f1e8]">{month.bookingCount}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-[30px] border border-white/8 bg-[#15110d] p-5 sm:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">
                    Booking History
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-[#f7f1e8]">Recent synced stays</h3>
                </div>
                <div className="text-sm text-[#ccb99a]">
                  {bookingInsights.length} stays found
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {bookingInsightStats.recentBookings.length > 0 ? (
                  bookingInsightStats.recentBookings.map((booking) => (
                    <div key={booking.id} className="rounded-2xl border border-white/7 bg-white/[0.02] px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[#f7f1e8]">
                            {booking.guest || "Guest stay"}
                          </div>
                          <div className="mt-1 text-sm text-[#e6d8bf]">
                            {formatDateLabel(booking.checkinDate)} to {formatDateLabel(booking.checkoutDate)}
                          </div>
                        </div>
                        <div className="rounded-full border border-[#b08b47]/25 bg-[#b08b47]/10 px-3 py-1 text-xs font-semibold text-[#f1d9a5]">
                          {booking.nights} nights
                        </div>
                      </div>
                      <div className="mt-3 text-xs uppercase tracking-[0.18em] text-[#ccb99a]">
                        {booking.sourceLabel || "Source unavailable"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/7 bg-white/[0.02] px-4 py-5 text-sm text-[#e6d8bf] md:col-span-2">
                    No synced booking history was found yet. Once calendar sync creates bookings with check-in and checkout dates, insights will populate here.
                  </div>
                )}
              </div>
            </section>
          </>
        ) : (
          <section className="rounded-[30px] border border-white/8 bg-[#15110d] p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">
                  Owner Invoices
                </div>
                <h2 className="mt-2 text-xl font-semibold text-[#f7f1e8]">
                  Statements for {selectedProperty.name || "this property"}
                </h2>
              </div>
              <div className="rounded-full border border-[#b08b47]/30 bg-[#b08b47]/10 px-4 py-2 text-sm font-semibold text-[#f1d9a5]">
                {propertyOwnerInvoices.length} invoice{propertyOwnerInvoices.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {propertyOwnerInvoices.length > 0 ? (
                propertyOwnerInvoices.map((invoice) => {
                  const invoiceProperty = properties.find((property) => property.id === invoice.property_id);
                  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];

                  return (
                    <div key={invoice.id} className="overflow-hidden rounded-[24px] border border-white/8 bg-white/[0.02]">
                      <div className="border-b border-white/8 px-5 py-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            {invoice.logo_url ? (
                              <img src={invoice.logo_url} alt="" className="mb-3 max-h-14 max-w-[180px] object-contain" />
                            ) : null}
                            <div className="text-lg font-semibold text-[#f7f1e8]">
                              {invoice.company_name || "Property invoice"}
                            </div>
                            <div className="mt-1 text-sm text-[#ccb99a]">
                              {invoice.invoice_number} · {invoiceProperty?.name || invoiceProperty?.address || "All linked properties"}
                            </div>
                          </div>
                          <div className="text-left md:text-right">
                            <div className="text-2xl font-semibold text-[#f7f1e8]">{formatCurrency(invoice.total)}</div>
                            <div className="mt-1 text-sm text-[#e6d8bf]">
                              {invoice.status === "paid" ? "Paid" : "Due"} {invoice.due_date ? formatDateLabel(invoice.due_date) : "on receipt"}
                            </div>
                          </div>
                        </div>
                        {invoice.header_text ? (
                          <p className="mt-4 text-sm leading-6 text-[#e6d8bf]">{invoice.header_text}</p>
                        ) : null}
                      </div>

                      <div className="divide-y divide-white/8">
                        {lineItems.map((item, index) => {
                          const quantity = Number(item.quantity || 0);
                          const rate = Number(item.rate || 0);
                          return (
                            <div key={item.id || `${invoice.id}-${index}`} className="grid gap-2 px-5 py-3 text-sm md:grid-cols-[1fr_90px_110px_120px] md:items-center">
                              <div className="font-medium text-[#f7f1e8]">
                                {item.description}
                                {(item.receipt_urls || []).length > 0 ? (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {(item.receipt_urls || []).map((url, receiptIndex) => (
                                      <a
                                        key={`${url}-${receiptIndex}`}
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-full border border-[#b08b47]/25 bg-[#b08b47]/10 px-3 py-1 text-xs font-semibold text-[#f1d9a5]"
                                      >
                                        {item.receipt_names?.[receiptIndex] || `Receipt ${receiptIndex + 1}`}
                                      </a>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <div className="text-[#ccb99a] md:text-right">Qty {quantity}</div>
                              <div className="text-[#ccb99a] md:text-right">{formatCurrency(rate)}</div>
                              <div className="font-semibold text-[#f7f1e8] md:text-right">{formatCurrency(quantity * rate)}</div>
                            </div>
                          );
                        })}
                      </div>

                      {(invoice.notes || invoice.payment_instructions) ? (
                        <div className="border-t border-white/8 px-5 py-4 text-sm leading-6 text-[#e6d8bf]">
                          {invoice.notes ? <p>{invoice.notes}</p> : null}
                          {invoice.payment_instructions ? (
                            <p className="mt-2">
                              <span className="font-semibold text-[#f7f1e8]">Payment:</span> {invoice.payment_instructions}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-white/7 bg-white/[0.02] px-4 py-5 text-sm text-[#e6d8bf]">
                  No invoices have been sent for this property yet.
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <ReportIssueModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        propertyId={selectedProperty.id}
        organizationId={selectedProperty.organization_id}
        onSubmitted={() => {
          setReportSuccess("Issue submitted successfully.");
          setTimeout(() => setReportSuccess(""), 3500);
          void loadData();
        }}
      />
    </main>
  );
}

