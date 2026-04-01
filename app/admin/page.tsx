
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
  default_cleaner_units_needed?: number | null;
  cleaner_units_required_strict?: boolean | null;
  show_team_status_to_cleaners?: boolean | null;
};

type CleanerAccount = {
  id: string;
  display_name: string | null;
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
};

type Job = {
  id: string;
  property_id: string;
  status: string | null;
  staffing_status?: string | null;
  notes: string | null;
  created_at?: string | null;
  scheduled_for?: string | null;
  cleaner_units_needed?: number | null;
  cleaner_units_required_strict?: boolean | null;
  show_team_status_to_cleaners?: boolean | null;
};

type JobSlot = {
  id: string;
  job_id: string;
  slot_number: number;
  cleaner_account_id: string | null;
  status: string | null;
  offered_at?: string | null;
  expires_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  accepted_by_profile_id?: string | null;
  declined_by_profile_id?: string | null;
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
  cleaner_units_needed?: number | null;
  cleaner_units_required_strict?: boolean | null;
  staffing_status?: string | null;
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
  if (match?.[1]) return match[1];
  return null;
}

function getResponseWindowHours(jobDate: string | null, now: Date) {
  if (!jobDate) return 8;

  const job = new Date(`${jobDate}T12:00:00`);
  const diffHours = (job.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours > 24 * 7) return 48;
  if (diffHours > 48) return 8;
  return 2;
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

function staffingLabel(status?: string | null, fallback?: string | null) {
  if (status === "fully_staffed") return "Fully staffed";
  if (status === "partially_filled") return "Partially filled";
  if (status === "ready") return "Ready";
  if (status === "stranded") return "Stranded";
  if (status === "unfilled") return "Unfilled";
  return fallback || "Unknown";
}

export default function AdminPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

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
  const [highlightedJobId, setHighlightedJobId] = useState<string | null>(null);
  const [jobsExpanded, setJobsExpanded] = useState(false);
  const [reassignSelections, setReassignSelections] = useState<Record<string, string>>({});
  const [reassigningJobId, setReassigningJobId] = useState<string | null>(null);
  const [reofferingJobId, setReofferingJobId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const [propertyName, setPropertyName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [propertyNotes, setPropertyNotes] = useState("");
  const [propertyCleanerUnitsNeeded, setPropertyCleanerUnitsNeeded] = useState("1");
  const [propertyCleanerUnitsStrict, setPropertyCleanerUnitsStrict] = useState(false);
  const [propertyShowTeamStatus, setPropertyShowTeamStatus] = useState(true);

  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountMemberIds, setNewAccountMemberIds] = useState<string[]>([]);
  const [creatingAccount, setCreatingAccount] = useState(false);

  const [assignmentPropertyId, setAssignmentPropertyId] = useState("");
  const [assignmentCleanerAccountId, setAssignmentCleanerAccountId] = useState("");
  const [assignmentPriority, setAssignmentPriority] = useState("1");

  const [jobPropertyId, setJobPropertyId] = useState("");
  const [jobNotes, setJobNotes] = useState("");
  const [jobCleanerUnitsNeeded, setJobCleanerUnitsNeeded] = useState("");
  const [jobStrictMode, setJobStrictMode] = useState("inherit");

  const [selectedPropertyId, setSelectedPropertyId] = useState("");
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
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  async function loadData() {
    setError("");

    const { data: p, error: pErr } = await supabase
      .from("properties")
      .select("*")
      .order("created_at", { ascending: false });
    if (pErr) return setError(pErr.message);

    const { data: ca, error: caErr } = await supabase
      .from("cleaner_accounts")
      .select("*")
      .order("created_at", { ascending: false });
    if (caErr) return setError(caErr.message);

    const { data: cam, error: camErr } = await supabase
      .from("cleaner_account_members")
      .select("*")
      .order("created_at", { ascending: true });
    if (camErr) return setError(camErr.message);

    const { data: a, error: aErr } = await supabase
      .from("property_cleaner_account_assignments")
      .select("*")
      .order("priority", { ascending: true });
    if (aErr) return setError(aErr.message);

    const { data: j, error: jErr } = await supabase
      .from("turnover_jobs")
      .select("*")
      .order("created_at", { ascending: false });
    if (jErr) return setError(jErr.message);

    const { data: js, error: jsErr } = await supabase
      .from("turnover_job_slots")
      .select("*")
      .order("job_id", { ascending: false })
      .order("slot_number", { ascending: true });
    if (jsErr) return setError(jsErr.message);

    const { data: sj, error: sjErr } = await supabase
      .from("admin_stranded_jobs")
      .select("*")
      .order("created_at", { ascending: true });
    if (sjErr) return setError(sjErr.message);

    const { data: ar, error: arErr } = await supabase
      .from("property_access")
      .select("*");
    if (arErr) return setError(arErr.message);

    const { data: s, error: sErr } = await supabase
      .from("property_sops")
      .select("*")
      .order("created_at", { ascending: false });
    if (sErr) return setError(sErr.message);

    const { data: si, error: siErr } = await supabase
      .from("property_sop_images")
      .select("*")
      .order("sort_order", { ascending: true });
    if (siErr) return setError(siErr.message);

    const { data: pr, error: prErr } = await supabase
      .from("profiles")
      .select("id,email,full_name,phone,role,created_at")
      .order("created_at", { ascending: false });
    if (prErr) return setError(prErr.message);

    const { data: pc, error: pcErr } = await supabase
      .from("property_calendars")
      .select("*")
      .order("created_at", { ascending: false });
    if (pcErr) return setError(pcErr.message);

    setProperties((p ?? []) as Property[]);
    setCleanerAccounts((ca ?? []) as CleanerAccount[]);
    setCleanerAccountMembers((cam ?? []) as CleanerAccountMember[]);
    setAssignments((a ?? []) as Assignment[]);
    setJobs((j ?? []) as Job[]);
    setJobSlots((js ?? []) as JobSlot[]);
    setStrandedJobs((sj ?? []) as StrandedJob[]);
    setAccessRows((ar ?? []) as AccessRow[]);
    setSops((s ?? []) as SopRow[]);
    setSopImages((si ?? []) as SopImageRow[]);
    setProfiles((pr ?? []) as ProfileRow[]);
    setPropertyCalendars((pc ?? []) as PropertyCalendarRow[]);

    setReassignSelections((prev) => {
      const next = { ...prev };
      for (const job of (sj ?? []) as StrandedJob[]) {
        if (!next[job.id]) {
          next[job.id] = "";
        }
      }
      return next;
    });
  }

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
      loadData();
    }
  }, [checkingAuth]);

  useEffect(() => {
    if (checkingAuth) return;

    const interval = setInterval(() => {
      loadData();
    }, 15000);

    return () => clearInterval(interval);
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
  }, [selectedPropertyId, accessRows, propertyCalendars]);

  useEffect(() => {
    if (!highlightedJobId) return;

    const timeout = setTimeout(() => {
      setHighlightedJobId(null);
    }, 4000);

    return () => clearTimeout(timeout);
  }, [highlightedJobId]);

  function handleSopFilesChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setSopFiles(files);
  }

  function toggleNewAccountMember(profileId: string) {
    setNewAccountMemberIds((prev) =>
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId]
    );
  }

  async function updateUserRole(profileId: string, newRole: string) {
    setError("");
    setSavingRoleId(profileId);

    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", profileId);

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
      default_cleaner_units_needed: Number(propertyCleanerUnitsNeeded || "1"),
      cleaner_units_required_strict: propertyCleanerUnitsStrict,
      show_team_status_to_cleaners: propertyShowTeamStatus,
    });

    if (error) {
      setError(error.message);
      return;
    }

    setPropertyName("");
    setPropertyAddress("");
    setPropertyNotes("");
    setPropertyCleanerUnitsNeeded("1");
    setPropertyCleanerUnitsStrict(false);
    setPropertyShowTeamStatus(true);
    loadData();
  }

  async function createCleanerAccount() {
    if (!newAccountName.trim()) {
      setError("Please enter a team/account name.");
      return;
    }

    if (newAccountMemberIds.length === 0) {
      setError("Please choose at least one cleaner profile.");
      return;
    }

    setError("");
    setCreatingAccount(true);

    try {
      const { data: account, error: accountError } = await supabase
        .from("cleaner_accounts")
        .insert({
          display_name: newAccountName.trim(),
        })
        .select("*")
        .single();

      if (accountError || !account) {
        throw accountError || new Error("Could not create cleaner account.");
      }

      const rows = newAccountMemberIds.map((profileId) => ({
        cleaner_account_id: account.id,
        profile_id: profileId,
      }));

      const { error: memberError } = await supabase
        .from("cleaner_account_members")
        .insert(rows);

      if (memberError) {
        throw memberError;
      }

      setNewAccountName("");
      setNewAccountMemberIds([]);
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not create cleaner account.");
    } finally {
      setCreatingAccount(false);
    }
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
    loadData();
  }

  async function createJob() {
    if (!jobPropertyId) return;

    const extractedDate = extractCheckoutDate(jobNotes.trim() || null);
    const payload: Record<string, any> = {
      property_id: jobPropertyId,
      notes: jobNotes.trim() || null,
      scheduled_for: extractedDate,
    };

    if (jobCleanerUnitsNeeded.trim()) {
      payload.cleaner_units_needed = Number(jobCleanerUnitsNeeded);
    }

    if (jobStrictMode === "yes") {
      payload.cleaner_units_required_strict = true;
    } else if (jobStrictMode === "no") {
      payload.cleaner_units_required_strict = false;
    }

    const { error } = await supabase.from("turnover_jobs").insert(payload);

    if (error) {
      setError(error.message);
      return;
    }

    setJobPropertyId("");
    setJobNotes("");
    setJobCleanerUnitsNeeded("");
    setJobStrictMode("inherit");
    loadData();
  }

  async function reofferJob(jobId: string) {
    setError("");
    setReofferingJobId(jobId);

    const { error } = await supabase.rpc("create_slots_for_job", {
      p_job_id: jobId,
    });

    if (error) {
      setError(error.message);
      setReofferingJobId(null);
      return;
    }

    await loadData();
    setReofferingJobId(null);
  }

  async function reassignStrandedJob(jobId: string) {
    const cleanerAccountId = reassignSelections[jobId];

    if (!cleanerAccountId) {
      setError("Please select a cleaner team/account before offering.");
      return;
    }

    setError("");
    setReassigningJobId(jobId);

    try {
      const slots = jobSlots
        .filter((slot) => slot.job_id === jobId)
        .sort((a, b) => a.slot_number - b.slot_number);

      const targetSlot =
        slots.find((slot) => slot.status === "stranded") ||
        slots.find((slot) => slot.status === "declined") ||
        slots.find((slot) => slot.status === "offered");

      if (!targetSlot) {
        throw new Error("No slot is available to reassign.");
      }

      const job = jobs.find((x) => x.id === jobId);
      const jobDate = job?.scheduled_for || extractCheckoutDate(job?.notes ?? null);
      const hours = getResponseWindowHours(jobDate, new Date());

      const { error } = await supabase
        .from("turnover_job_slots")
        .update({
          cleaner_account_id: cleanerAccountId,
          status: "offered",
          offered_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
          accepted_at: null,
          declined_at: null,
          accepted_by_profile_id: null,
          declined_by_profile_id: null,
        })
        .eq("id", targetSlot.id);

      if (error) {
        throw error;
      }

      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not reassign stranded job.");
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

    loadData();
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
            .update({
              ical_url: airbnbCalendarUrl.trim(),
              is_active: airbnbCalendarActive,
            })
            .eq("id", existingAirbnb.id);

          if (error) {
            setError(error.message);
            return;
          }
        } else {
          const { error } = await supabase.from("property_calendars").insert({
            property_id: selectedPropertyId,
            source: "airbnb",
            ical_url: airbnbCalendarUrl.trim(),
            is_active: airbnbCalendarActive,
          });

          if (error) {
            setError(error.message);
            return;
          }
        }
      } else if (existingAirbnb) {
        const { error } = await supabase
          .from("property_calendars")
          .delete()
          .eq("id", existingAirbnb.id);

        if (error) {
          setError(error.message);
          return;
        }
      }

      if (vrboCalendarUrl.trim()) {
        if (existingVrbo) {
          const { error } = await supabase
            .from("property_calendars")
            .update({
              ical_url: vrboCalendarUrl.trim(),
              is_active: vrboCalendarActive,
            })
            .eq("id", existingVrbo.id);

          if (error) {
            setError(error.message);
            return;
          }
        } else {
          const { error } = await supabase.from("property_calendars").insert({
            property_id: selectedPropertyId,
            source: "vrbo",
            ical_url: vrboCalendarUrl.trim(),
            is_active: vrboCalendarActive,
          });

          if (error) {
            setError(error.message);
            return;
          }
        }
      } else if (existingVrbo) {
        const { error } = await supabase
          .from("property_calendars")
          .delete()
          .eq("id", existingVrbo.id);

        if (error) {
          setError(error.message);
          return;
        }
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
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          setError("Image upload failed: " + uploadError.message);
          return;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("property-sop-images").getPublicUrl(filePath);

        const { error: imageInsertError } = await supabase
          .from("property_sop_images")
          .insert({
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

  function getPropertyName(id: string) {
    return properties.find((p) => p.id === id)?.name || id;
  }

  function getProfileName(profileId: string) {
    const profile = profiles.find((p) => p.id === profileId);
    return profile?.full_name || profile?.email || profileId;
  }

  function getCleanerAccountName(id: string | null | undefined) {
    if (!id) return "Unassigned";
    const account = cleanerAccounts.find((c) => c.id === id);
    if (account?.display_name) return account.display_name;

    const memberIds = cleanerAccountMembers
      .filter((m) => m.cleaner_account_id === id)
      .map((m) => getProfileName(m.profile_id));

    return memberIds.length ? memberIds.join(" / ") : id;
  }

  function getCleanerAccountMemberSummary(id: string) {
    const memberIds = cleanerAccountMembers
      .filter((m) => m.cleaner_account_id === id)
      .map((m) => getProfileName(m.profile_id));
    return memberIds.length ? memberIds.join(", ") : "No members linked";
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
      if (!map[image.sop_id]) {
        map[image.sop_id] = [];
      }
      map[image.sop_id].push(image);
    }
    return map;
  }, [sopImages]);

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === selectedPropertyId) || null,
    [properties, selectedPropertyId]
  );

  const cleanerProfiles = useMemo(
    () =>
      profiles
        .filter((profile) => profile.role === "cleaner")
        .sort((a, b) =>
          (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "")
        ),
    [profiles]
  );

  const assignmentsByPropertyId = useMemo(() => {
    const map: Record<string, Assignment[]> = {};
    for (const assignment of assignments) {
      if (!map[assignment.property_id]) {
        map[assignment.property_id] = [];
      }
      map[assignment.property_id].push(assignment);
    }

    for (const propertyId of Object.keys(map)) {
      map[propertyId].sort((a, b) => a.priority - b.priority);
    }

    return map;
  }, [assignments]);

  const slotsByJobId = useMemo(() => {
    const map: Record<string, JobSlot[]> = {};
    for (const slot of jobSlots) {
      if (!map[slot.job_id]) {
        map[slot.job_id] = [];
      }
      map[slot.job_id].push(slot);
    }

    for (const jobId of Object.keys(map)) {
      map[jobId].sort((a, b) => a.slot_number - b.slot_number);
    }

    return map;
  }, [jobSlots]);

  function getActiveCountdownMs(jobId: string) {
    const slots = slotsByJobId[jobId] ?? [];
    const activeOffered = slots
      .filter((slot) => slot.status === "offered" && !!slot.expires_at)
      .sort((a, b) => new Date(a.expires_at || 0).getTime() - new Date(b.expires_at || 0).getTime());

    if (!activeOffered.length || !activeOffered[0].expires_at) return null;
    return new Date(activeOffered[0].expires_at).getTime() - now.getTime();
  }

  const visibleJobs = jobsExpanded ? jobs : jobs.slice(0, 3);

  const recentDeclinedSlots = useMemo(() => {
    return [...jobSlots]
      .filter((slot) => slot.status === "declined" && !!slot.declined_at)
      .sort((a, b) => {
        const aTime = a.declined_at ? new Date(a.declined_at).getTime() : 0;
        const bTime = b.declined_at ? new Date(b.declined_at).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 10);
  }, [jobSlots]);

  const stats = useMemo(() => {
    const activeStranded = jobs.filter((j) => j.staffing_status === "stranded").length;
    const readyJobs = jobs.filter((j) =>
      j.staffing_status === "ready" || j.staffing_status === "fully_staffed"
    ).length;

    return {
      stranded: activeStranded,
      ready: readyJobs,
    };
  }, [jobs]);

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
                <div className="text-xs uppercase tracking-[0.28em] text-[#8a7b68]">
                  Estate of Mind
                </div>
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
                  <div className="mb-2 text-xs uppercase tracking-[0.32em] text-[#d8c7ab]">
                    Estate of Mind
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                    Luxury Operations Portal
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#e7dccb] md:text-base">
                    Full system upgrade mode: cleaner teams, shared cleaner accounts, multi-staff
                    jobs, stranded recovery, access details, users, and visual SOPs.
                  </p>
                </div>
              </div>

              <button
                className="inline-flex items-center justify-center rounded-full border border-[#d6b36a]/40 bg-white/10 px-5 py-2.5 text-sm font-medium text-[#f6efe4] shadow-sm transition hover:bg-white/20 active:scale-[0.98] cursor-pointer"
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = "/login";
                }}
              >
                Logout
              </button>
            </div>
          </div>

          <div className="grid gap-3 border-t border-[#efe6dc] bg-[#fbf8f4] px-6 py-4 md:grid-cols-6 md:px-8">
            {[
              { label: "Properties", value: properties.length },
              { label: "Cleaner Accounts", value: cleanerAccounts.length },
              { label: "Assignments", value: assignments.length },
              { label: "Jobs", value: jobs.length },
              { label: "Ready", value: stats.ready },
              { label: "Stranded", value: stats.stranded },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[24px] border border-[#eadfce] bg-white px-4 py-4 shadow-sm"
              >
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#8a7b68]">
                  {item.label}
                </div>
                <div className="mt-2 text-3xl font-semibold text-[#241c15]">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {strandedJobs.length > 0 && (
          <div className="sticky top-0 z-40 mb-4 rounded-[20px] border border-[#f0b4b4] bg-[#7e1f1f] px-4 py-3 text-white shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">
                🚨 {strandedJobs.length} stranded job{strandedJobs.length === 1 ? "" : "s"} need
                attention
              </div>

              <button
                onClick={() => {
                  const el = document.getElementById("jobs-section");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
                className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/10"
              >
                View Jobs
              </button>
            </div>
          </div>
        )}

        {strandedJobs.length > 0 ? (
          <div className="mb-6 rounded-[30px] border border-[#f0b4b4] bg-[linear-gradient(135deg,#fff5f5_0%,#ffe9e9_100%)] p-5 shadow-[0_18px_45px_rgba(140,32,32,0.12)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-[#b14b4b]">
                  Immediate Attention Needed
                </div>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#7e1f1f] animate-pulse">
                  🚨 {strandedJobs.length} stranded job{strandedJobs.length === 1 ? "" : "s"}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8b3838]">
                  These jobs have run out of valid offers or need a new team assigned.
                </p>
              </div>

              <div className="rounded-[20px] border border-[#efc3c3] bg-white/80 px-4 py-3 text-sm text-[#7e1f1f] shadow-sm">
                Oldest waiting:
                <div className="mt-1 font-semibold">{formatDateTime(strandedJobs[0]?.created_at)}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {strandedJobs.map((job) => {
                const remainingMs = getActiveCountdownMs(job.id);
                const countdownTone = getCountdownTone(remainingMs);

                return (
                  <div
                    key={job.id}
                    className="rounded-[22px] border border-[#efc3c3] bg-white px-4 py-4 shadow-sm transition hover:shadow-md"
                  >
                    <div
                      onClick={() => {
                        setHighlightedJobId(job.id);
                        setJobsExpanded(true);

                        setTimeout(() => {
                          const el = document.getElementById("job-" + job.id);
                          if (el) {
                            el.scrollIntoView({ behavior: "smooth", block: "center" });
                          }
                        }, 50);
                      }}
                      className="cursor-pointer"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="text-base font-semibold text-[#241c15]">
                            {job.property_name || getPropertyName(job.property_id || "")}
                          </div>
                          <div className="mt-1 text-sm text-[#6f6255]">
                            {job.property_address || "No address"}
                          </div>
                          <div className="mt-2 text-sm text-[#8a7b68]">
                            Staffing:{" "}
                            <span className="font-medium text-[#7e1f1f]">
                              {staffingLabel(job.staffing_status, job.status)}
                            </span>
                          </div>
                          <div className="mt-1 text-sm text-[#8a7b68]">
                            Needed: {job.cleaner_units_needed || 1} cleaner unit
                            {(job.cleaner_units_needed || 1) === 1 ? "" : "s"}
                            {job.cleaner_units_required_strict ? " (strict)" : " (at least one can proceed)"}
                          </div>
                          <div className="mt-1 text-sm text-[#8a7b68]">
                            Cleaning date: {formatScheduledFor(job.scheduled_for || extractCheckoutDate(job.notes))}
                          </div>
                          {remainingMs !== null && (
                            <div className={`mt-2 text-sm font-semibold ${countdownTone}`}>
                              {remainingMs < 0
                                ? `Overdue by ${formatRemaining(remainingMs)}`
                                : `Current offer expires in ${formatRemaining(remainingMs)}`}
                            </div>
                          )}
                        </div>

                        <div className="rounded-[18px] border border-[#f1d0d0] bg-[#fff8f8] px-4 py-3 text-sm text-[#8b3838]">
                          <div>Created: {formatDateTime(job.created_at)}</div>
                          <div className="mt-1">Status: {staffingLabel(job.staffing_status, job.status)}</div>
                        </div>
                      </div>

                      <div className="mt-3 text-sm leading-6 text-[#6f6255]">{job.notes || "No notes"}</div>
                    </div>

                    <div className="mt-4 rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] p-3">
                      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-[#8a7b68]">
                        Offer to cleaner team/account
                      </div>

                      <div className="flex flex-col gap-2 md:flex-row">
                        <select
                          value={reassignSelections[job.id] ?? ""}
                          onChange={(e) =>
                            setReassignSelections((prev) => ({
                              ...prev,
                              [job.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-[16px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#b48d4e]"
                        >
                          <option value="">Select cleaner team/account</option>
                          {cleanerAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {getCleanerAccountName(account.id)}
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={() => reassignStrandedJob(job.id)}
                          disabled={
                            reassigningJobId === job.id || !(reassignSelections[job.id] ?? "")
                          }
                          className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-4 py-2 text-sm font-medium text-[#f8f2e8] shadow-[0_10px_24px_rgba(36,28,21,0.18)] transition hover:bg-[#352a21] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {reassigningJobId === job.id ? "Offering..." : "Offer Team"}
                        </button>

                        <button
                          onClick={() => reofferJob(job.id)}
                          disabled={reofferingJobId === job.id}
                          className="rounded-full bg-[#b48d4e] px-4 py-2 text-sm text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {reofferingJobId === job.id ? "Rebuilding..." : "Rebuild Offers"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {recentDeclinedSlots.length > 0 && (
          <div className="mb-6 rounded-[30px] border border-[#f2d2c4] bg-[linear-gradient(135deg,#fff8f4_0%,#fff2eb_100%)] p-5 shadow-[0_18px_45px_rgba(140,80,32,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-[#b16a4b]">
                  Recent Activity
                </div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#8a4526]">
                  Recently Declined Slots
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8a5d4b]">
                  Latest team/account declines on turnover job slots.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {recentDeclinedSlots.map((slot) => {
                const job = jobs.find((j) => j.id === slot.job_id);
                if (!job) return null;

                return (
                  <div
                    key={slot.id}
                    className="rounded-[22px] border border-[#edd8cc] bg-white px-4 py-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-base font-semibold text-[#241c15]">
                          {getPropertyName(job.property_id)}
                        </div>
                        <div className="mt-1 text-sm text-[#6f6255]">
                          Team: <span className="font-medium">{getCleanerAccountName(slot.cleaner_account_id)}</span>
                        </div>
                        <div className="mt-1 text-sm text-[#8a7b68]">
                          Cleaning date: {formatScheduledFor(job.scheduled_for || extractCheckoutDate(job.notes))}
                        </div>
                        <div className="mt-3 text-sm leading-6 text-[#6f6255]">{job.notes || "No notes"}</div>
                      </div>

                      <div className="rounded-[18px] border border-[#efe1d8] bg-[#fcfaf7] px-4 py-3 text-sm text-[#8a5d4b]">
                        <div>Declined: {formatDateTime(slot.declined_at)}</div>
                        <div className="mt-1">Offered: {formatDateTime(slot.offered_at)}</div>
                        <div className="mt-1">Job: {staffingLabel(job.staffing_status, job.status)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error ? (
          <div className="mb-6 rounded-[24px] border border-[#e7c6c1] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2e22] shadow-sm">
            {error}
          </div>
        ) : null}

        <div className="mb-6 rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">User Management</h2>
              <p className="mt-1 text-sm text-[#7f7263]">
                Approve pending users and change access roles. Cleaner users can then be linked into shared teams/accounts below.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="grid gap-4 rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4 md:grid-cols-[1.3fr_1fr_1fr_180px]"
              >
                <div>
                  <div className="text-base font-semibold text-[#241c15]">
                    {profile.full_name || "No name"}
                  </div>
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
                    onChange={(e) => updateUserRole(profile.id, e.target.value)}
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
            <p className="mt-1 text-sm text-[#7f7263]">
              Add a managed property and set the default staffing requirement.
            </p>

            <div className="mt-5 space-y-3">
              <input
                className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                placeholder="Property name"
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
              />
              <input
                className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                placeholder="Address"
                value={propertyAddress}
                onChange={(e) => setPropertyAddress(e.target.value)}
              />
              <textarea
                className="min-h-[110px] w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                placeholder="Internal notes"
                value={propertyNotes}
                onChange={(e) => setPropertyNotes(e.target.value)}
              />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-[#8a7b68]">
                    Default cleaner units needed
                  </div>
                  <select
                    className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#b48d4e]"
                    value={propertyCleanerUnitsNeeded}
                    onChange={(e) => setPropertyCleanerUnitsNeeded(e.target.value)}
                  >
                    <option value="1">1 cleaner unit</option>
                    <option value="2">2 cleaner units</option>
                    <option value="3">3 cleaner units</option>
                  </select>
                </div>
                <div className="space-y-3 rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3">
                  <label className="flex items-center gap-2 text-sm text-[#6f6255]">
                    <input
                      type="checkbox"
                      checked={propertyCleanerUnitsStrict}
                      onChange={(e) => setPropertyCleanerUnitsStrict(e.target.checked)}
                    />
                    Property must have full team
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[#6f6255]">
                    <input
                      type="checkbox"
                      checked={propertyShowTeamStatus}
                      onChange={(e) => setPropertyShowTeamStatus(e.target.checked)}
                    />
                    Show team status to cleaners
                  </label>
                </div>
              </div>
              <button
                className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] shadow-[0_10px_24px_rgba(36,28,21,0.18)] transition hover:bg-[#352a21] active:scale-[0.98] cursor-pointer"
                onClick={addProperty}
              >
                Add Property
              </button>
            </div>
          </section>

          <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <h2 className="text-xl font-semibold tracking-tight">Cleaner Teams / Accounts</h2>
            <p className="mt-1 text-sm text-[#7f7263]">
              Link one or more cleaner logins to the same working team. This is where a husband/wife team can share the same job content.
            </p>

            <div className="mt-5 space-y-3">
              <input
                className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                placeholder="Team/account name (example: Sam + Sean)"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
              />

              <div className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                <div className="mb-3 text-xs uppercase tracking-[0.18em] text-[#8a7b68]">
                  Select cleaner members
                </div>
                <div className="max-h-52 space-y-2 overflow-auto">
                  {cleanerProfiles.map((profile) => (
                    <label
                      key={profile.id}
                      className="flex items-center gap-2 rounded-[14px] border border-[#eadfce] bg-white px-3 py-2 text-sm text-[#6f6255]"
                    >
                      <input
                        type="checkbox"
                        checked={newAccountMemberIds.includes(profile.id)}
                        onChange={() => toggleNewAccountMember(profile.id)}
                      />
                      <span>{profile.full_name || profile.email || "Unnamed cleaner"}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] shadow-[0_10px_24px_rgba(36,28,21,0.18)] transition hover:bg-[#352a21] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={createCleanerAccount}
                disabled={creatingAccount}
              >
                {creatingAccount ? "Creating..." : "Create Cleaner Team"}
              </button>
            </div>
          </section>

          <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <h2 className="text-xl font-semibold tracking-tight">Assign Team to Property</h2>
            <p className="mt-1 text-sm text-[#7f7263]">
              Set primary and backup team/account order for each property.
            </p>

            <div className="mt-5 space-y-3">
              <select
                className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition focus:border-[#b48d4e] focus:bg-white"
                value={assignmentPropertyId}
                onChange={(e) => setAssignmentPropertyId(e.target.value)}
              >
                <option value="">Select property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition focus:border-[#b48d4e] focus:bg-white"
                value={assignmentCleanerAccountId}
                onChange={(e) => setAssignmentCleanerAccountId(e.target.value)}
              >
                <option value="">Select cleaner team/account</option>
                {cleanerAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {getCleanerAccountName(account.id)}
                  </option>
                ))}
              </select>

              <select
                className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition focus:border-[#b48d4e] focus:bg-white"
                value={assignmentPriority}
                onChange={(e) => setAssignmentPriority(e.target.value)}
              >
                <option value="1">Primary</option>
                <option value="2">Backup</option>
                <option value="3">Second Backup</option>
              </select>

              <button
                className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] shadow-[0_10px_24px_rgba(36,28,21,0.18)] transition hover:bg-[#352a21] active:scale-[0.98] cursor-pointer"
                onClick={addAssignment}
              >
                Save Assignment
              </button>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <h2 className="text-xl font-semibold tracking-tight">Create Job</h2>
            <p className="mt-1 text-sm text-[#7f7263]">
              Create a turnover job. The backend now builds the slot offers automatically based on the property team assignments and staffing rules.
            </p>

            <div className="mt-5 space-y-3">
              <select
                className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition focus:border-[#b48d4e] focus:bg-white"
                value={jobPropertyId}
                onChange={(e) => setJobPropertyId(e.target.value)}
              >
                <option value="">Select property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <textarea
                className="min-h-[120px] w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                placeholder="Job notes. Example: Checkout date: 2026-04-08"
                value={jobNotes}
                onChange={(e) => setJobNotes(e.target.value)}
              />

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                  placeholder="Optional units override (1,2,3)"
                  value={jobCleanerUnitsNeeded}
                  onChange={(e) => setJobCleanerUnitsNeeded(e.target.value)}
                />

                <select
                  className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition focus:border-[#b48d4e] focus:bg-white"
                  value={jobStrictMode}
                  onChange={(e) => setJobStrictMode(e.target.value)}
                >
                  <option value="inherit">Use property strictness</option>
                  <option value="yes">Require full team for this job</option>
                  <option value="no">At least one cleaner can proceed</option>
                </select>
              </div>

              <button
                className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] shadow-[0_10px_24px_rgba(36,28,21,0.18)] transition hover:bg-[#352a21] active:scale-[0.98] cursor-pointer"
                onClick={createJob}
              >
                Create Job
              </button>
            </div>
          </section>

          <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)] xl:col-span-2">
            <h2 className="text-xl font-semibold tracking-tight">Property Setup</h2>
            <p className="mt-1 text-sm text-[#7f7263]">
              Manage access notes, booking calendars, and visual SOPs.
            </p>

            <div className="mt-5">
              <select
                className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition focus:border-[#b48d4e] focus:bg-white"
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

            {selectedProperty ? (
              <div className="mt-4 rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4 text-sm text-[#6f6255]">
                <div>
                  Default staffing:{" "}
                  <span className="font-medium">
                    {selectedProperty.default_cleaner_units_needed || 1} cleaner unit
                    {(selectedProperty.default_cleaner_units_needed || 1) === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-1">
                  Strict full-team requirement:{" "}
                  <span className="font-medium">
                    {selectedProperty.cleaner_units_required_strict ? "Yes" : "No"}
                  </span>
                </div>
                <div className="mt-1">
                  Show team status to cleaners:{" "}
                  <span className="font-medium">
                    {selectedProperty.show_team_status_to_cleaners === false ? "No" : "Yes"}
                  </span>
                </div>
              </div>
            ) : null}

            {selectedPropertyId ? (
              <div className="mt-6 grid gap-6 lg:grid-cols-3">
                <div className="rounded-[26px] border border-[#eadfce] bg-[#fcfaf7] p-5">
                  <h3 className="text-lg font-semibold">Access Notes</h3>
                  <div className="mt-4 space-y-3">
                    <input
                      className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                      placeholder="Door code"
                      value={doorCode}
                      onChange={(e) => setDoorCode(e.target.value)}
                    />
                    <input
                      className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                      placeholder="Alarm code"
                      value={alarmCode}
                      onChange={(e) => setAlarmCode(e.target.value)}
                    />
                    <textarea
                      className="min-h-[120px] w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                      placeholder="Access notes"
                      value={accessNotes}
                      onChange={(e) => setAccessNotes(e.target.value)}
                    />
                    <button
                      className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] shadow-[0_10px_24px_rgba(36,28,21,0.18)] transition hover:bg-[#352a21] active:scale-[0.98] cursor-pointer"
                      onClick={saveAccess}
                    >
                      Save Access
                    </button>
                  </div>
                </div>

                <div className="rounded-[26px] border border-[#eadfce] bg-[#fcfaf7] p-5">
                  <h3 className="text-lg font-semibold">Booking Calendars</h3>
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#5f5245]">
                        Airbnb iCal URL
                      </label>
                      <input
                        className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                        placeholder="Paste Airbnb calendar URL"
                        value={airbnbCalendarUrl}
                        onChange={(e) => setAirbnbCalendarUrl(e.target.value)}
                      />
                      <label className="mt-2 flex items-center gap-2 text-sm text-[#6f6255]">
                        <input
                          type="checkbox"
                          checked={airbnbCalendarActive}
                          onChange={(e) => setAirbnbCalendarActive(e.target.checked)}
                        />
                        Active
                      </label>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#5f5245]">
                        VRBO iCal URL
                      </label>
                      <input
                        className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                        placeholder="Paste VRBO calendar URL"
                        value={vrboCalendarUrl}
                        onChange={(e) => setVrboCalendarUrl(e.target.value)}
                      />
                      <label className="mt-2 flex items-center gap-2 text-sm text-[#6f6255]">
                        <input
                          type="checkbox"
                          checked={vrboCalendarActive}
                          onChange={(e) => setVrboCalendarActive(e.target.checked)}
                        />
                        Active
                      </label>
                    </div>

                    <button
                      className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] shadow-[0_10px_24px_rgba(36,28,21,0.18)] transition hover:bg-[#352a21] active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={saveCalendars}
                      disabled={savingCalendars}
                    >
                      {savingCalendars ? "Saving..." : "Save Calendars"}
                    </button>
                  </div>
                </div>

                <div className="rounded-[26px] border border-[#eadfce] bg-[#fcfaf7] p-5">
                  <h3 className="text-lg font-semibold">Add SOP Note</h3>
                  <div className="mt-4 space-y-3">
                    <input
                      className="w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                      placeholder="SOP title"
                      value={sopTitle}
                      onChange={(e) => setSopTitle(e.target.value)}
                    />
                    <textarea
                      className="min-h-[120px] w-full rounded-[18px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                      placeholder="Optional note or instruction"
                      value={sopContent}
                      onChange={(e) => setSopContent(e.target.value)}
                    />

                    <div className="rounded-[20px] border border-dashed border-[#d8c7ab] bg-white p-4">
                      <label className="mb-2 block text-sm font-medium text-[#5f5245]">
                        SOP photos
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleSopFilesChange}
                        className="block w-full text-sm text-[#6c5f51]"
                      />
                      {sopFiles.length > 0 ? (
                        <div className="mt-3 text-sm text-[#7f7263]">
                          {sopFiles.length} image{sopFiles.length === 1 ? "" : "s"} selected
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-[#a39584]">No images selected yet.</div>
                      )}
                    </div>

                    <button
                      className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] shadow-[0_10px_24px_rgba(36,28,21,0.18)] transition hover:bg-[#352a21] active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={addSop}
                      disabled={uploadingSop}
                    >
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
                    <div className="rounded-[24px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-5 py-6 text-sm text-[#8a7b68]">
                      No SOP notes yet.
                    </div>
                  ) : null}

                  {selectedSops.map((s) => {
                    const images = sopImagesBySopId[s.id] ?? [];

                    return (
                      <div
                        key={s.id}
                        className="rounded-[26px] border border-[#eadfce] bg-white p-4 shadow-sm"
                      >
                        <div className="text-base font-semibold text-[#241c15]">
                          {s.title || "Untitled"}
                        </div>

                        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#6f6255]">
                          {s.content || "No details"}
                        </div>

                        {images.length > 0 ? (
                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {images.map((image) => (
                              <a
                                key={image.id}
                                href={image.image_url}
                                target="_blank"
                                rel="noreferrer"
                                className="block overflow-hidden rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] transition hover:shadow-md"
                              >
                                <img
                                  src={image.image_url}
                                  alt={image.caption || s.title || "SOP image"}
                                  className="h-48 w-full cursor-zoom-in object-cover"
                                />
                                {image.caption ? (
                                  <div className="px-3 py-2 text-sm text-[#6f6255]">
                                    {image.caption}
                                  </div>
                                ) : null}
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
              <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">
                {properties.length}
              </span>
            </div>
            <div className="space-y-3">
              {properties.map((p) => (
                <div key={p.id} className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                  <div className="text-base font-semibold">{p.name}</div>
                  <div className="mt-1 text-sm text-[#6f6255]">{p.address || "No address"}</div>
                  <div className="mt-2 text-sm text-[#8a7b68]">{p.notes || "No notes"}</div>
                  <div className="mt-2 text-sm text-[#8a7b68]">
                    Staffing default: {p.default_cleaner_units_needed || 1} unit
                    {(p.default_cleaner_units_needed || 1) === 1 ? "" : "s"} /{" "}
                    {p.cleaner_units_required_strict ? "strict full-team" : "flexible"}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Cleaner Accounts</h2>
              <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">
                {cleanerAccounts.length}
              </span>
            </div>
            <div className="space-y-3">
              {cleanerAccounts.map((account) => (
                <div
                  key={account.id}
                  className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4"
                >
                  <div className="text-base font-semibold">
                    {account.display_name || getCleanerAccountName(account.id)}
                  </div>
                  <div className="mt-1 text-sm text-[#6f6255]">
                    Members: {getCleanerAccountMemberSummary(account.id)}
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
              <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">
                {assignments.length}
              </span>
            </div>
            <div className="space-y-3">
              {assignments.map((a) => (
                <div key={a.id} className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                  <div className="text-base font-semibold">{getPropertyName(a.property_id)}</div>
                  <div className="mt-1 text-sm text-[#6f6255]">
                    {getCleanerAccountName(a.cleaner_account_id)}
                  </div>
                  <div className="mt-2 inline-flex rounded-full border border-[#d8c7ab] bg-white px-3 py-1 text-xs font-medium text-[#7f7263]">
                    {getPriorityLabel(a.priority)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            id="jobs-section"
            className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold tracking-tight">Jobs</h2>
                <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">
                  {jobs.length}
                </span>
              </div>

              {jobs.length > 3 ? (
                <button
                  onClick={() => setJobsExpanded((prev) => !prev)}
                  className="rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-3 py-1.5 text-xs font-medium text-[#6f6255] transition hover:bg-white"
                >
                  {jobsExpanded ? "Collapse Jobs" : `Show All ${jobs.length} Jobs`}
                </button>
              ) : null}
            </div>

            <div className="space-y-3">
              {visibleJobs.map((job) => {
                const remainingMs = getActiveCountdownMs(job.id);
                const countdownTone = getCountdownTone(remainingMs);
                const slots = slotsByJobId[job.id] ?? [];
                const acceptedCount = slots.filter((slot) => slot.status === "accepted").length;
                const offeredCount = slots.filter((slot) => slot.status === "offered").length;
                const declinedCount = slots.filter((slot) => slot.status === "declined").length;
                const strandedCount = slots.filter((slot) => slot.status === "stranded").length;

                const jobCardClass =
                  job.staffing_status === "stranded"
                    ? "border-2 border-red-500 bg-red-50 shadow-lg"
                    : job.staffing_status === "fully_staffed" || job.staffing_status === "ready"
                    ? "border border-[#cfe3d1] bg-[#f7fcf7] hover:shadow-sm"
                    : job.staffing_status === "partially_filled"
                    ? "border border-[#ead9b0] bg-[#fffaf0] hover:shadow-sm"
                    : highlightedJobId === job.id
                    ? "border-2 border-[#b48d4e] bg-[#fffaf3] shadow-lg"
                    : "border border-[#eadfce] bg-[#fcfaf7] hover:shadow-sm";

                return (
                  <div
                    key={job.id}
                    id={"job-" + job.id}
                    onClick={() => setHighlightedJobId(job.id)}
                    className={`rounded-[22px] p-4 transition cursor-pointer ${jobCardClass}`}
                  >
                    <div className="text-base font-semibold">{getPropertyName(job.property_id)}</div>

                    <div className="mt-2 text-sm text-[#6f6255]">
                      Status:{" "}
                      <span className="font-medium text-[#241c15]">
                        {staffingLabel(job.staffing_status, job.status)}
                      </span>
                    </div>

                    <div className="mt-1 text-sm text-[#8a7b68]">
                      Team progress:{" "}
                      <span className="font-medium">
                        {acceptedCount}/{job.cleaner_units_needed || 1} accepted
                      </span>
                    </div>

                    <div className="mt-1 text-sm text-[#8a7b68]">
                      Slots: {offeredCount} offered, {declinedCount} declined, {strandedCount} stranded
                    </div>

                    <div className="mt-1 text-sm text-[#8a7b68]">
                      Cleaning date: {formatScheduledFor(job.scheduled_for || extractCheckoutDate(job.notes))}
                    </div>

                    {remainingMs !== null && (
                      <div className={`mt-1 text-sm font-semibold ${countdownTone}`}>
                        {remainingMs < 0
                          ? `Offer overdue by ${formatRemaining(remainingMs)}`
                          : `Offer expires in ${formatRemaining(remainingMs)}`}
                      </div>
                    )}

                    <div className="mt-3 text-sm leading-6 text-[#6f6255]">{job.notes || "No notes"}</div>

                    {slots.length > 0 ? (
                      <div className="mt-3 rounded-[18px] border border-[#eadfce] bg-white/80 p-3">
                        <div className="mb-2 text-xs uppercase tracking-[0.18em] text-[#8a7b68]">
                          Slot breakdown
                        </div>
                        <div className="space-y-2">
                          {slots.map((slot) => (
                            <div
                              key={slot.id}
                              className="flex flex-col gap-1 rounded-[14px] border border-[#efe6dc] bg-[#fcfaf7] px-3 py-2 text-sm text-[#6f6255] md:flex-row md:items-center md:justify-between"
                            >
                              <div>
                                Slot {slot.slot_number}:{" "}
                                <span className="font-medium">
                                  {getCleanerAccountName(slot.cleaner_account_id)}
                                </span>
                              </div>
                              <div className="text-[#8a7b68]">
                                {slot.status || "unknown"}
                                {slot.expires_at ? ` • expires ${formatDateTime(slot.expires_at)}` : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
