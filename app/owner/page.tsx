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
  scheduled_for?: string | null;
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
  const checkoutMatch = normalized.match(/Checkout date\s*:\s*(\d{4}-\d{2}-\d{2})/i);

  return {
    sourceLabel,
    guest: guestMatch?.[1]?.trim() || null,
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
      <div className="text-[11px] uppercase tracking-[0.22em] text-[#bfa67b]">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-[#f7f1e8]">{value}</div>
      {subtext ? <div className="mt-2 text-sm text-[#cdbda0]">{subtext}</div> : null}
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
          <div className="text-xs uppercase tracking-[0.18em] text-[#bfa67b]">
            {formatDateLabel(item.date)}
          </div>
        </div>

        {item.subtitle ? (
          <div className="mt-1 text-sm leading-relaxed text-[#cdbda0]">{item.subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}

function ReportIssueModal({
  open,
  onClose,
  propertyId,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
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

    if (!notes.trim()) {
      setError("Please describe the issue.");
      return;
    }

    setSaving(true);
    setError("");

    const { data: flag, error: insertError } = await supabase
      .from("property_maintenance_flags")
      .insert({
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
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#bfa67b]">Owner Portal</div>
            <h3 className="mt-2 text-xl font-semibold text-[#f7f1e8]">Report an Issue</h3>
            <p className="mt-1 text-sm text-[#cdbda0]">
              Send us a concern and it will be added to the maintenance queue.
            </p>
          </div>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[#bfa67b]">Category</label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {ISSUE_CATEGORIES.map((item) => {
                  const selected = item === category;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCategory(item)}
                      className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                        selected
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
              <label className="text-xs uppercase tracking-[0.18em] text-[#bfa67b]">Priority</label>
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
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      urgency === item.value
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
              <label className="text-xs uppercase tracking-[0.18em] text-[#bfa67b]">Details</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Example: The kitchen sink is leaking under the cabinet."
                className="mt-2 min-h-[130px] w-full rounded-2xl border border-white/8 bg-[#100c08] px-4 py-3 text-sm text-[#f7f1e8] outline-none transition focus:border-[#b08b47]"
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[#bfa67b]">Photos</label>

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

              <div className="mt-2 text-xs text-[#9f9079]">
                Use your camera or photo library to help explain the issue.
              </div>

              {files.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <div className="text-sm text-[#cdbda0]">
                    {files.length} photo{files.length === 1 ? "" : "s"} selected
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {files.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-xs text-[#cdbda0]"
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
  const [groundsJobs, setGroundsJobs] = useState<GroundsJob[]>([]);
  const [groundsRecurringRules, setGroundsRecurringRules] = useState<GroundsRecurringRule[]>([]);
  const [flags, setFlags] = useState<MaintenanceFlag[]>([]);
  const [flagImages, setFlagImages] = useState<MaintenanceFlagImage[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSuccess, setReportSuccess] = useState("");

  const selectedPropertyId = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("property") || "";
  }, []);

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
      setGroundsJobs([]);
      setGroundsRecurringRules([]);
      setFlags([]);
      setFlagImages([]);
      setLoading(false);
      return;
    }

    const [
      propertiesRes,
      turnoverRes,
      groundsRes,
      groundsRecurringRulesRes,
      flagsRes,
      flagImagesRes,
    ] = await Promise.all([
      supabase
        .from("properties")
        .select("id,name,address,notes")
        .in("id", propertyIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("turnover_jobs")
        .select("id,property_id,status,notes,created_at,scheduled_for")
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false }),
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
      groundsRes,
      groundsRecurringRulesRes,
      flagsRes,
      flagImagesRes,
    ]) {
      if (res.error) {
        setError(res.error.message);
        setLoading(false);
        return;
      }
    }

    setProperties((propertiesRes.data ?? []) as Property[]);
    setTurnoverJobs((turnoverRes.data ?? []) as TurnoverJob[]);
    setGroundsJobs((groundsRes.data ?? []) as GroundsJob[]);
    setGroundsRecurringRules((groundsRecurringRulesRes.data ?? []) as GroundsRecurringRule[]);
    setFlags((flagsRes.data ?? []) as MaintenanceFlag[]);
    setFlagImages((flagImagesRes.data ?? []) as MaintenanceFlagImage[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const selectedProperty =
    properties.find((property) => property.id === selectedPropertyId) || properties[0] || null;

  const propertyTurnoverJobs = useMemo(() => {
    if (!selectedProperty) return [];
    return turnoverJobs.filter((job) => job.property_id === selectedProperty.id);
  }, [selectedProperty, turnoverJobs]);

  const propertyGroundsJobs = useMemo(() => {
    if (!selectedProperty) return [];
    return groundsJobs.filter((job) => job.property_id === selectedProperty.id);
  }, [selectedProperty, groundsJobs]);

  const propertyGroundsRecurringRules = useMemo(() => {
    if (!selectedProperty) return [];
    return groundsRecurringRules.filter((rule) => rule.property_id === selectedProperty.id && rule.active);
  }, [selectedProperty, groundsRecurringRules]);

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
    return propertyTurnoverJobs
      .map((job) => {
        const booking = parseBookingFromNotes(job.notes);
        return { job, booking };
      })
      .filter((item) => !!item.booking.checkoutDate && isFutureOrToday(item.booking.checkoutDate))
      .sort((a, b) => (a.booking.checkoutDate || "").localeCompare(b.booking.checkoutDate || ""))[0] || null;
  }, [propertyTurnoverJobs]);

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

      if (booking.checkoutDate && isFutureOrToday(booking.checkoutDate)) {
        items.push({
          id: `booking-${job.id}`,
          type: "booking",
          title: "Upcoming booking / turnover",
          date: booking.checkoutDate,
          subtitle:
            booking.guest || booking.sourceLabel
              ? [booking.guest, booking.sourceLabel].filter(Boolean).join(" • ")
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
  }, [propertyTurnoverJobs, propertyGroundsJobs, propertyGroundsRecurringRules, openFlags]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0f0d0a] px-4 py-10 text-[#f7f1e8]">
        <div className="mx-auto max-w-6xl rounded-[32px] border border-white/8 bg-[#15110d] p-8">
          Loading owner dashboard...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#0f0d0a] px-4 py-10 text-[#f7f1e8]">
        <div className="mx-auto max-w-6xl rounded-[32px] border border-red-500/20 bg-red-950/20 p-8">
          {error}
        </div>
      </main>
    );
  }

  if (!selectedProperty) {
    return (
      <main className="min-h-screen bg-[#0f0d0a] px-4 py-10 text-[#f7f1e8]">
        <div className="mx-auto max-w-6xl rounded-[32px] border border-white/8 bg-[#15110d] p-8">
          No property found yet.
        </div>
      </main>
    );
  }

  const bookingInfo = upcomingBooking?.booking || null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(176,139,71,0.14),transparent_28%),#0f0d0a] px-4 py-6 text-[#f7f1e8] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(23,18,13,0.98)_0%,rgba(14,11,8,1)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
          <div className="flex flex-col gap-6 px-6 py-7 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-[#bfa67b]">
                Owner Dashboard
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#f7f1e8] sm:text-4xl">
                {selectedProperty.name || "Property Overview"}
              </h1>
              <p className="mt-2 text-base text-[#cdbda0]">
                {getCityFromAddress(selectedProperty.address) || selectedProperty.address || "Location unavailable"}
              </p>
              {ownerAccount?.email ? (
                <div className="mt-3 text-sm text-[#9f9079]">{ownerAccount.email}</div>
              ) : null}
            </div>

         <div className="flex flex-wrap gap-3">
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
            value={bookingInfo?.checkoutDate ? formatDateLabel(bookingInfo.checkoutDate) : "Not available"}
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

        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-[28px] border border-white/8 bg-[#15110d] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#bfa67b]">
                  At a Glance
                </div>
                <h2 className="mt-2 text-xl font-semibold text-[#f7f1e8]">Upcoming Activity</h2>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {timelineItems.length > 0 ? (
                timelineItems.map((item) => <TimelineRow key={item.id} item={item} />)
              ) : (
                <div className="rounded-2xl border border-white/7 bg-white/[0.02] px-4 py-5 text-sm text-[#cdbda0]">
                  Nothing upcoming has been scheduled yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/8 bg-[#15110d] p-5 sm:p-6">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#bfa67b]">Active Issues</div>
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

                    <div className="mt-3 text-xs uppercase tracking-[0.18em] text-[#bfa67b]">
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
      </div>

      <ReportIssueModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        propertyId={selectedProperty.id}
        onSubmitted={() => {
          setReportSuccess("Issue submitted successfully.");
          setTimeout(() => setReportSuccess(""), 3500);
          void loadData();
        }}
      />
    </main>
  );
}
