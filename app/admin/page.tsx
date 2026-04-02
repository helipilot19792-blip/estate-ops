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
  source: "airbnb" | "vrbo";
  ical_url: string;
  is_active: boolean | null;
  last_synced_at?: string | null;
  created_at?: string | null;
};

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
  if (ms === null) return "text-[#8a7b68]";
  if (ms < 0) return "text-red-600";
  if (ms <= 2 * 60 * 60 * 1000) return "text-amber-600";
  return "text-[#7f5d28]";
}

export default function AdminPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const [properties, setProperties] = useState<Property[]>([]);
  const [cleanerAccounts, setCleanerAccounts] = useState<CleanerAccount[]>([]);
  const [cleanerAccountMembers, setCleanerAccountMembers] = useState<CleanerAccountMember[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobSlots, setJobSlots] = useState<JobSlot[]>([]);
  const [strandedJobs, setStrandedJobs] = useState<StrandedJob[]>([]);
  const [accessRows, setAccessRows] = useState<AccessRow[]>([]);
  const [sops, setSops] = useState<SopRow[]>([]);
  const [sopImages, setSopImages] = useState<SopImageRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [propertyCalendars, setPropertyCalendars] = useState<PropertyCalendarRow[]>([]);

  const [error, setError] = useState("");
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [savingCalendars, setSavingCalendars] = useState(false);
  const [uploadingSop, setUploadingSop] = useState(false);
  const [jobsExpanded, setJobsExpanded] = useState(false);
  const [reassignSelections, setReassignSelections] = useState<Record<string, string>>({});
  const [reassigningJobId, setReassigningJobId] = useState<string | null>(null);
  const [highlightedJobId, setHighlightedJobId] = useState<string | null>(null);
  const [syncingCalendarsNow, setSyncingCalendarsNow] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const [propertyName, setPropertyName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [propertyNotes, setPropertyNotes] = useState("");
  const [propertyUnitsNeeded, setPropertyUnitsNeeded] = useState("1");
  const [propertyUnitsStrict, setPropertyUnitsStrict] = useState(false);
  const [propertyShowTeamStatus, setPropertyShowTeamStatus] = useState(true);

  const [cleanerAccountName, setCleanerAccountName] = useState("");
  const [cleanerAccountEmail, setCleanerAccountEmail] = useState("");
  const [cleanerAccountPhone, setCleanerAccountPhone] = useState("");
  const [selectedCleanerMemberProfileIds, setSelectedCleanerMemberProfileIds] = useState<string[]>([]);

  const [assignmentPropertyId, setAssignmentPropertyId] = useState("");
  const [assignmentCleanerAccountId, setAssignmentCleanerAccountId] = useState("");
  const [assignmentPriority, setAssignmentPriority] = useState("1");

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

  const [airbnbCalendarUrl, setAirbnbCalendarUrl] = useState("");
  const [vrboCalendarUrl, setVrboCalendarUrl] = useState("");
  const [airbnbCalendarActive, setAirbnbCalendarActive] = useState(true);
  const [vrboCalendarActive, setVrboCalendarActive] = useState(true);

  const [sopTitle, setSopTitle] = useState("");
  const [sopContent, setSopContent] = useState("");
  const [sopFiles, setSopFiles] = useState<File[]>([]);

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

      setCheckingAuth(false);
    }

    checkAuthAndRole();
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
    if (!selectedPropertyId) {
      setDoorCode("");
      setAlarmCode("");
      setAccessNotes("");
      setAirbnbCalendarUrl("");
      setVrboCalendarUrl("");
      setAirbnbCalendarActive(true);
      setVrboCalendarActive(true);
      return;
    }

    const existingAccess = accessRows.find((x) => x.property_id === selectedPropertyId);
    setDoorCode(existingAccess?.door_code ?? "");
    setAlarmCode(existingAccess?.alarm_code ?? "");
    setAccessNotes(existingAccess?.notes ?? "");

    const airbnbCalendar = propertyCalendars.find(
      (x) => x.property_id === selectedPropertyId && x.source === "airbnb"
    );
    const vrboCalendar = propertyCalendars.find(
      (x) => x.property_id === selectedPropertyId && x.source === "vrbo"
    );

    setAirbnbCalendarUrl(airbnbCalendar?.ical_url ?? "");
    setVrboCalendarUrl(vrboCalendar?.ical_url ?? "");
    setAirbnbCalendarActive(airbnbCalendar?.is_active ?? true);
    setVrboCalendarActive(vrboCalendar?.is_active ?? true);

    const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
    setSelectedPropertyUnitsNeeded(String(selectedProperty?.default_cleaner_units_needed || 1));
    setSelectedPropertyUnitsStrict(!!selectedProperty?.cleaner_units_required_strict);
    setSelectedPropertyShowTeamStatus(selectedProperty?.show_team_status_to_cleaners !== false);
  }, [selectedPropertyId, accessRows, propertyCalendars, properties]);

  async function loadData() {
    setError("");

    const [
      propertiesRes,
      cleanerAccountsRes,
      cleanerAccountMembersRes,
      assignmentsRes,
      jobsRes,
      jobSlotsRes,
      strandedJobsRes,
      accessRowsRes,
      sopsRes,
      sopImagesRes,
      profilesRes,
      propertyCalendarsRes,
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
      supabase.from("admin_stranded_jobs").select("*").order("created_at", { ascending: true }),
      supabase.from("property_access").select("*"),
      supabase.from("property_sops").select("*").order("created_at", { ascending: false }),
      supabase.from("property_sop_images").select("*").order("sort_order", { ascending: true }),
      supabase
        .from("profiles")
        .select("id,email,full_name,phone,role,created_at")
        .order("created_at", { ascending: false }),
      supabase.from("property_calendars").select("*").order("created_at", { ascending: false }),
    ]);

    const responses = [
      propertiesRes,
      cleanerAccountsRes,
      cleanerAccountMembersRes,
      assignmentsRes,
      jobsRes,
      jobSlotsRes,
      strandedJobsRes,
      accessRowsRes,
      sopsRes,
      sopImagesRes,
      profilesRes,
      propertyCalendarsRes,
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
    setStrandedJobs((strandedJobsRes.data ?? []) as StrandedJob[]);
    setAccessRows((accessRowsRes.data ?? []) as AccessRow[]);
    setSops((sopsRes.data ?? []) as SopRow[]);
    setSopImages((sopImagesRes.data ?? []) as SopImageRow[]);
    setProfiles((profilesRes.data ?? []) as ProfileRow[]);
    setPropertyCalendars((propertyCalendarsRes.data ?? []) as PropertyCalendarRow[]);

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

  async function updateUserRole(profileId: string, newRole: string) {
    setError("");
    setSavingRoleId(profileId);
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", profileId);
    if (error) {
      setError(error.message);
      setSavingRoleId(null);
      return;
    }
    await loadData();
    setSavingRoleId(null);
  }

  async function addProperty() {
    if (!propertyName.trim()) return;

    const { error } = await supabase.from("properties").insert({
      name: propertyName.trim(),
      address: propertyAddress.trim() || null,
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
    setPropertyAddress("");
    setPropertyNotes("");
    setPropertyUnitsNeeded("1");
    setPropertyUnitsStrict(false);
    setPropertyShowTeamStatus(true);
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
    await loadData();
  }

  async function addAssignment() {
    if (!assignmentPropertyId || !assignmentCleanerAccountId) return;

    const { error } = await supabase.from("property_cleaner_account_assignments").insert({
      property_id: assignmentPropertyId,
      cleaner_account_id: assignmentCleanerAccountId,
      priority: Number(assignmentPriority),
    });

    if (error) {
      setError(error.message);
      return;
    }

    setAssignmentPropertyId("");
    setAssignmentCleanerAccountId("");
    setAssignmentPriority("1");
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
      console.log("CREATE JOB ERROR:", error);
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
        console.log("CREATE SLOTS FALLBACK ERROR:", slotCreate.error);
        setError(
          `Job created, but slot creation failed: ${slotCreate.error.message}`
        );
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
      jobs.find((j) => j.id === jobId)?.scheduled_for || extractCheckoutDate(jobs.find((j) => j.id === jobId)?.notes || null),
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

    await loadData();
    setReassigningJobId(null);
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
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not save property staffing defaults.");
    } finally {
      setSavingSelectedPropertyDefaults(false);
    }
  }

  async function saveCalendars() {
    if (!selectedPropertyId) {
      setError("Please select a property first.");
      return;
    }

    setError("");
    setSavingCalendars(true);

    try {
      const existingAirbnb = propertyCalendars.find(
        (x) => x.property_id === selectedPropertyId && x.source === "airbnb"
      );
      const existingVrbo = propertyCalendars.find(
        (x) => x.property_id === selectedPropertyId && x.source === "vrbo"
      );

      if (airbnbCalendarUrl.trim()) {
        if (existingAirbnb) {
          const { error } = await supabase
            .from("property_calendars")
            .update({ ical_url: airbnbCalendarUrl.trim(), is_active: airbnbCalendarActive })
            .eq("id", existingAirbnb.id);
          if (error) return setError(error.message);
        } else {
          const { error } = await supabase.from("property_calendars").insert({
            property_id: selectedPropertyId,
            source: "airbnb",
            ical_url: airbnbCalendarUrl.trim(),
            is_active: airbnbCalendarActive,
          });
          if (error) return setError(error.message);
        }
      } else if (existingAirbnb) {
        const { error } = await supabase.from("property_calendars").delete().eq("id", existingAirbnb.id);
        if (error) return setError(error.message);
      }

      if (vrboCalendarUrl.trim()) {
        if (existingVrbo) {
          const { error } = await supabase
            .from("property_calendars")
            .update({ ical_url: vrboCalendarUrl.trim(), is_active: vrboCalendarActive })
            .eq("id", existingVrbo.id);
          if (error) return setError(error.message);
        } else {
          const { error } = await supabase.from("property_calendars").insert({
            property_id: selectedPropertyId,
            source: "vrbo",
            ical_url: vrboCalendarUrl.trim(),
            is_active: vrboCalendarActive,
          });
          if (error) return setError(error.message);
        }
      } else if (existingVrbo) {
        const { error } = await supabase.from("property_calendars").delete().eq("id", existingVrbo.id);
        if (error) return setError(error.message);
      }

      await loadData();
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

  const selectedSops = useMemo(
    () => sops.filter((x) => x.property_id === selectedPropertyId),
    [sops, selectedPropertyId]
  );

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

  const eligibleCleanerProfiles = useMemo(
    () => profiles.filter((profile) => profile.role === "cleaner"),
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
    if (offered > 0) return "Awaiting responses";
    if (declined > 0) return "Reoffer needed";
    return job.staffing_status || job.status || "Unknown";
  }

  const visibleJobs = jobsExpanded ? jobs : jobs.slice(0, 3);

  const recentDeclinedJobs = useMemo(
    () =>
      [...jobSlots]
        .filter((slot) => !!slot.declined_at)
        .sort((a, b) => new Date(b.declined_at || 0).getTime() - new Date(a.declined_at || 0).getTime())
        .slice(0, 10),
    [jobSlots]
  );

  const selectedPropertyDefaults = properties.find((p) => p.id === jobPropertyId);

  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-[#f7f3ee] text-[#241c15]">
        <div className="mx-auto max-w-7xl p-6">
          <div className="rounded-[32px] border border-[#e7ddd0] bg-white p-8 shadow-[0_20px_50px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-4">
              <div className="w-[180px]">
                <Image
                  src="/eomlogo.png"
                  alt="Estate of Mind Property Management"
                  width={400}
                  height={120}
                  className="h-auto w-full"
                  priority
                />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-[#8a7b68]">Estate of Mind</div>
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
                    src="/eomlogo.png"
                    alt="Estate of Mind Property Management"
                    width={500}
                    height={160}
                    className="h-auto w-full"
                    priority
                  />
                </div>
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.32em] text-[#d8c7ab]">Estate of Mind</div>
                  <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Luxury Operations Portal</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#e7dccb] md:text-base">
                    Cleaner accounts, staffing rules, shared household logins, turnover scheduling,
                    access details, calendars, and SOPs.
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

          <div className="grid gap-3 border-t border-[#efe6dc] bg-[#fbf8f4] px-6 py-4 md:grid-cols-5 md:px-8">
            {[
              { label: "Properties", value: properties.length },
              { label: "Cleaner Accounts", value: cleanerAccounts.length },
              { label: "Assignments", value: assignments.length },
              { label: "Jobs", value: jobs.length },
              { label: "Users", value: profiles.length },
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

        {strandedJobs.length > 0 && (
          <div className="sticky top-0 z-40 mb-4 rounded-[20px] border border-[#f0b4b4] bg-[#7e1f1f] px-4 py-3 text-white shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">
                🚨 {strandedJobs.length} stranded job{strandedJobs.length === 1 ? "" : "s"} need attention
              </div>
              <button
                onClick={() => document.getElementById("jobs-section")?.scrollIntoView({ behavior: "smooth" })}
                className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/10"
              >
                View Jobs
              </button>
            </div>
          </div>
        )}

        <div className="mb-6 rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">User Management</h2>
              <p className="mt-1 text-sm text-[#7f7263]">Approve pending users and change access roles.</p>
            </div>
          </div>

          <div className="space-y-3">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="grid gap-4 rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4 md:grid-cols-[1.3fr_1fr_1fr_180px]"
              >
                <div>
                  <div className="text-base font-semibold text-[#241c15]">{profile.full_name || "No name"}</div>
                  <div className="mt-1 text-sm text-[#6f6255]">{profile.email || "No email"}</div>
                  <div className="mt-1 text-sm text-[#8a7b68]">{profile.phone || "No phone"}</div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[#8a7b68]">Current role</div>
                  <div className="mt-2 inline-flex rounded-full border border-[#d8c7ab] bg-white px-3 py-1 text-xs font-medium text-[#7f7263]">
                    {profile.role}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[#8a7b68]">Change role</div>
                  <select
                    className="mt-2 w-full rounded-[16px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#b48d4e]"
                    value={profile.role}
                    onChange={(e) => void updateUserRole(profile.id, e.target.value)}
                    disabled={savingRoleId === profile.id}
                  >
                    <option value="pending">pending</option>
                    <option value="cleaner">cleaner</option>
                    <option value="admin">admin</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <div className="w-full text-right text-xs text-[#8a7b68]">
                    {savingRoleId === profile.id ? "Saving..." : "Role updates save instantly"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <h2 className="text-xl font-semibold tracking-tight">Add Property</h2>
            <p className="mt-1 text-sm text-[#7f7263]">Add a managed property and set default staffing rules.</p>

            <div className="mt-5 space-y-3">
              <input className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Property name" value={propertyName} onChange={(e) => setPropertyName(e.target.value)} />
              <input className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Address" value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} />
              <textarea className="min-h-[110px] w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Internal notes" value={propertyNotes} onChange={(e) => setPropertyNotes(e.target.value)} />

              <select className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" value={propertyUnitsNeeded} onChange={(e) => setPropertyUnitsNeeded(e.target.value)}>
                <option value="1">Default cleaner units: 1</option>
                <option value="2">Default cleaner units: 2</option>
                <option value="3">Default cleaner units: 3</option>
              </select>

              <label className="flex items-center gap-2 text-sm text-[#6f6255]">
                <input type="checkbox" checked={propertyUnitsStrict} onChange={(e) => setPropertyUnitsStrict(e.target.checked)} />
                Full team required before the job is fully staffed
              </label>

              <label className="flex items-center gap-2 text-sm text-[#6f6255]">
                <input type="checkbox" checked={propertyShowTeamStatus} onChange={(e) => setPropertyShowTeamStatus(e.target.checked)} />
                Show team status on cleaner page
              </label>

              <button className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]" onClick={() => void addProperty()}>
                Add Property
              </button>
            </div>
          </section>

          <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <h2 className="text-xl font-semibold tracking-tight">Link Existing Cleaner Users</h2>
            <p className="mt-1 text-sm text-[#7f7263]">Real cleaner logins are created from the sign up page. Use this section only when you want multiple existing cleaner users to share the same jobs, such as a husband-and-wife team.</p>

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
            <h2 className="text-xl font-semibold tracking-tight">Assign Cleaner Account</h2>
            <p className="mt-1 text-sm text-[#7f7263]">Set primary and backup cleaner account order.</p>

            <div className="mt-5 space-y-3">
              <select className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" value={assignmentPropertyId} onChange={(e) => setAssignmentPropertyId(e.target.value)}>
                <option value="">Select property</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <select className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" value={assignmentCleanerAccountId} onChange={(e) => setAssignmentCleanerAccountId(e.target.value)}>
                <option value="">Select cleaner account</option>
                {cleanerAccounts.map((c) => <option key={c.id} value={c.id}>{c.display_name || "Unnamed cleaner account"}</option>)}
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
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <h2 className="text-xl font-semibold tracking-tight">Create Job</h2>
            <p className="mt-1 text-sm text-[#7f7263]">Create a turnover job. Slots are created automatically from cleaner account assignments.</p>

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
                Create Job
              </button>
            </div>
          </section>

          <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)] xl:col-span-2">
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
                  <h3 className="text-lg font-semibold">Property Staffing Defaults</h3>
                  <p className="mt-1 text-sm text-[#7f7263]">Edit how many cleaner units this property usually needs, whether the full team must accept, and whether cleaners can see team progress.</p>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#5f5245]">Cleaner units needed</label>
                      <select className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" value={selectedPropertyUnitsNeeded} onChange={(e) => setSelectedPropertyUnitsNeeded(e.target.value)}>
                        <option value="1">1 cleaner unit</option>
                        <option value="2">2 cleaner units</option>
                        <option value="3">3 cleaner units</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 rounded-[18px] border border-[#eadfce] bg-white px-4 py-3 text-sm text-[#6f6255]">
                      <input type="checkbox" checked={selectedPropertyUnitsStrict} onChange={(e) => setSelectedPropertyUnitsStrict(e.target.checked)} />
                      Property must have full team
                    </label>
                    <label className="flex items-center gap-2 rounded-[18px] border border-[#eadfce] bg-white px-4 py-3 text-sm text-[#6f6255]">
                      <input type="checkbox" checked={selectedPropertyShowTeamStatus} onChange={(e) => setSelectedPropertyShowTeamStatus(e.target.checked)} />
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
                      <input className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Front door / smart lock code" value={doorCode} onChange={(e) => setDoorCode(e.target.value)} />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#5f5245]">Alarm code</label>
                      <input className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Alarm panel code" value={alarmCode} onChange={(e) => setAlarmCode(e.target.value)} />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#5f5245]">Extra access notes</label>
                      <textarea className="min-h-[120px] w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Entry directions, tricky locks, gate notes, etc." value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} />
                    </div>
                    <button className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21]" onClick={() => void saveAccess()}>
                      Save Access
                    </button>
                  </div>
                </div>

                <div className="rounded-[26px] border border-[#eadfce] bg-[#fcfaf7] p-5">
                  <h3 className="text-lg font-semibold">Booking Calendars</h3>
                  <p className="mt-1 text-sm text-[#7f7263]">Use Save Calendars after editing URLs. Use Sync Calendars Now to pull the latest Airbnb/VRBO bookings immediately.</p>
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#5f5245]">Airbnb iCal URL</label>
                      <input className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Paste Airbnb calendar URL" value={airbnbCalendarUrl} onChange={(e) => setAirbnbCalendarUrl(e.target.value)} />
                      <label className="mt-2 flex items-center gap-2 text-sm text-[#6f6255]">
                        <input type="checkbox" checked={airbnbCalendarActive} onChange={(e) => setAirbnbCalendarActive(e.target.checked)} /> Active
                      </label>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#5f5245]">VRBO iCal URL</label>
                      <input className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b48d4e]" placeholder="Paste VRBO calendar URL" value={vrboCalendarUrl} onChange={(e) => setVrboCalendarUrl(e.target.value)} />
                      <label className="mt-2 flex items-center gap-2 text-sm text-[#6f6255]">
                        <input type="checkbox" checked={vrboCalendarActive} onChange={(e) => setVrboCalendarActive(e.target.checked)} /> Active
                      </label>
                    </div>

                    <button className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60" onClick={() => void saveCalendars()} disabled={savingCalendars}>
                      {savingCalendars ? "Saving..." : "Save Calendars"}
                    </button>

                    <button className="inline-flex items-center justify-center rounded-full border border-[#241c15] bg-white px-5 py-2.5 text-sm font-medium text-[#241c15] transition hover:bg-[#f7f3ee] disabled:opacity-60" onClick={() => void syncCalendarsNow()} disabled={syncingCalendarsNow}>
                      {syncingCalendarsNow ? "Syncing..." : "Sync Calendars Now"}
                    </button>
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
              <div className="mt-6 rounded-[24px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-5 py-8 text-sm text-[#8a7b68]">Select a property to manage calendars, SOPs, and access details.</div>
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
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Properties</h2>
              <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">{properties.length}</span>
            </div>
            <div className="space-y-3">
              {properties.map((p) => (
                <div key={p.id} className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                  <div className="text-base font-semibold">{p.name}</div>
                  <div className="mt-1 text-sm text-[#6f6255]">{p.address || "No address"}</div>
                  <div className="mt-2 text-sm text-[#8a7b68]">{p.notes || "No notes"}</div>
                  <div className="mt-2 text-xs text-[#8a7b68]">
                    Default staffing: {p.default_cleaner_units_needed} unit{p.default_cleaner_units_needed === 1 ? "" : "s"}
                    {p.cleaner_units_required_strict ? ", strict" : ", flexible"}
                  </div>
                </div>
              ))}
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
                  <div className="text-base font-semibold">{account.display_name || "No name"}</div>
                  <div className="mt-1 text-sm text-[#6f6255]">{account.email || "No email"}</div>
                  <div className="mt-1 text-sm text-[#8a7b68]">{account.phone || "No phone"}</div>
                  <div className="mt-2 text-xs text-[#8a7b68]">
                    Members: {(cleanerMembersByAccountId[account.id] ?? []).map((m) => m.full_name || m.email || m.id).join(", ") || "No linked members"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Assignments</h2>
              <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">{assignments.length}</span>
            </div>
            <div className="space-y-3">
              {assignments.map((a) => (
                <div key={a.id} className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                  <div className="text-base font-semibold">{getPropertyName(a.property_id)}</div>
                  <div className="mt-1 text-sm text-[#6f6255]">{getCleanerAccountName(a.cleaner_account_id)}</div>
                  <div className="mt-2 inline-flex rounded-full border border-[#d8c7ab] bg-white px-3 py-1 text-xs font-medium text-[#7f7263]">{getPriorityLabel(a.priority)}</div>
                </div>
              ))}
            </div>
          </section>

          <section id="jobs-section" className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold tracking-tight">Jobs</h2>
                <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">{jobs.length}</span>
              </div>
              {jobs.length > 3 ? (
                <button onClick={() => setJobsExpanded((prev) => !prev)} className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-3 py-1.5 text-xs font-medium text-[#6f6255] transition hover:bg-white">
                  {jobsExpanded ? "Collapse Jobs" : `Show All ${jobs.length} Jobs`}
                </button>
              ) : null}
            </div>

            <div className="space-y-3">
              {visibleJobs.map((job) => {
                const slots = jobSlotsByJobId[job.id] ?? [];
                const acceptedCount = slots.filter((slot) => slot.status === "accepted").length;
                const firstOfferedAt = slots.find((slot) => !!slot.offered_at)?.offered_at;
                const remainingMs = getTimeRemainingMs(job, firstOfferedAt, now);
                const countdownTone = getCountdownTone(remainingMs);

                return (
                  <div key={job.id} id={`job-${job.id}`} onClick={() => setHighlightedJobId(job.id)} className={`rounded-[22px] p-4 transition cursor-pointer ${highlightedJobId === job.id ? "border-2 border-[#b48d4e] bg-[#fffaf3] shadow-lg" : "border border-[#eadfce] bg-[#fcfaf7] hover:shadow-sm"}`}>
                    <div className="text-base font-semibold">{getPropertyName(job.property_id)}</div>
                    <div className="mt-2 text-sm text-[#6f6255]">Status: <span className="font-medium text-[#241c15]">{getJobDisplayStatus(job, slots)}</span></div>
                    <div className="mt-1 text-sm text-[#8a7b68]">Team progress: {acceptedCount}/{job.cleaner_units_needed} accepted</div>
                    <div className="mt-1 text-sm text-[#8a7b68]">Slots: {slots.filter((slot) => slot.status === "offered").length} offered, {slots.filter((slot) => slot.status === "declined").length} declined, {slots.filter((slot) => slot.status === "stranded").length} stranded</div>
                    <div className="mt-1 text-sm text-[#8a7b68]">Cleaning date: {formatScheduledFor(job.scheduled_for || extractCheckoutDate(job.notes))}</div>
                    {getActiveCountdownMs(job.id) !== null && acceptedCount < job.cleaner_units_needed && (
                      <div className={`mt-1 text-sm font-semibold ${getCountdownTone(getActiveCountdownMs(job.id))}`}>
                        {getActiveCountdownMs(job.id)! < 0 ? `Offer overdue by ${formatRemaining(getActiveCountdownMs(job.id)! )}` : `Current offer expires in ${formatRemaining(getActiveCountdownMs(job.id)! )}`}
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

                    <div className="mt-3 text-sm leading-6 text-[#6f6255]">{job.notes || "No notes"}</div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {strandedJobs.length > 0 ? (
          <div className="mt-6 rounded-[30px] border border-[#f0b4b4] bg-[linear-gradient(135deg,#fff5f5_0%,#ffe9e9_100%)] p-5 shadow-[0_18px_45px_rgba(140,32,32,0.12)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-[#b14b4b]">Immediate Attention Needed</div>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#7e1f1f] animate-pulse">🚨 {strandedJobs.length} stranded job{strandedJobs.length === 1 ? "" : "s"}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8b3838]">These jobs have missing cleaner units and need manual assignment.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {strandedJobs.map((job) => {
                const slots = jobSlotsByJobId[job.id] ?? [];
                const remainingMs = getActiveCountdownMs(job.id);
                const countdownTone = getCountdownTone(remainingMs);

                return (
                  <div key={job.id} className="rounded-[22px] border border-[#efc3c3] bg-white px-4 py-4 shadow-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-base font-semibold text-[#241c15]">{job.property_name || getPropertyName(job.property_id)}</div>
                        <div className="mt-1 text-sm text-[#6f6255]">{job.property_address || "No address"}</div>
                        <div className="mt-1 text-sm text-[#8a7b68]">Staffing: {job.staffing_status || "unknown"}</div>
                        <div className="mt-1 text-sm text-[#8a7b68]">Cleaning date: {formatScheduledFor(job.scheduled_for || extractCheckoutDate(job.notes))}</div>
                        {remainingMs !== null ? (
                          <div className={`mt-2 text-sm font-semibold ${countdownTone}`}>
                            {remainingMs < 0 ? `Overdue by ${formatRemaining(remainingMs)}` : `Response window: ${formatRemaining(remainingMs)}`}
                          </div>
                        ) : null}
                        <div className="mt-3 text-sm leading-6 text-[#6f6255]">{job.notes || "No notes"}</div>
                      </div>

                      <div className="rounded-[18px] border border-[#f1d0d0] bg-[#fff8f8] px-4 py-3 text-sm text-[#8b3838]">
                        <div>Created: {formatDateTime(job.created_at)}</div>
                        <div className="mt-1">Status: {job.status || "unknown"}</div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] p-3">
                      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-[#8a7b68]">Assign missing slot</div>
                      <div className="flex flex-col gap-2 md:flex-row">
                        <select value={reassignSelections[job.id] ?? ""} onChange={(e) => setReassignSelections((prev) => ({ ...prev, [job.id]: e.target.value }))} className="w-full rounded-[16px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#b48d4e]">
                          <option value="">Select cleaner account</option>
                          {cleanerAccounts.map((c) => <option key={c.id} value={c.id}>{c.display_name || "Unnamed cleaner account"}</option>)}
                        </select>
                        <button onClick={() => void reassignStrandedJob(job.id)} disabled={reassigningJobId === job.id || !(reassignSelections[job.id] ?? "")} className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-4 py-2 text-sm font-medium text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60">
                          {reassigningJobId === job.id ? "Assigning..." : "Assign Cleaner Account"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {recentDeclinedJobs.length > 0 ? (
          <div className="mt-6 rounded-[30px] border border-[#f2d2c4] bg-[linear-gradient(135deg,#fff8f4_0%,#fff2eb_100%)] p-5 shadow-[0_18px_45px_rgba(140,80,32,0.08)]">
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
                        <div className="mt-1 text-sm text-[#8a7b68]">Cleaning date: {formatScheduledFor(job?.scheduled_for || extractCheckoutDate(job?.notes || null))}</div>
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
          </div>
        ) : null}
      </div>
    </main>
  );
}
