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
};

type Cleaner = {
  id: string;
  name: string | null;
  email: string | null;
  phone?: string | null;
  active?: boolean | null;
};

type Assignment = {
  id: string;
  property_id: string;
  cleaner_id: string;
  priority: number;
};

type Job = {
  id: string;
  property_id: string;
  status: string | null;
  assigned_cleaner_id: string | null;
  notes: string | null;
  created_at?: string | null;
};

type StrandedJob = {
  id: string;
  property_id: string | null;
  property_name: string | null;
  property_address: string | null;
  status: string | null;
  assigned_cleaner_id: string | null;
  assigned_cleaner_name: string | null;
  assigned_cleaner_email: string | null;
  notes: string | null;
  created_at?: string | null;
  offered_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
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

export default function AdminPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [properties, setProperties] = useState<Property[]>([]);
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
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

  const [propertyName, setPropertyName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [propertyNotes, setPropertyNotes] = useState("");

  const [assignmentPropertyId, setAssignmentPropertyId] = useState("");
  const [assignmentCleanerId, setAssignmentCleanerId] = useState("");
  const [assignmentPriority, setAssignmentPriority] = useState("1");

  const [jobPropertyId, setJobPropertyId] = useState("");
  const [jobNotes, setJobNotes] = useState("");

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

  async function loadData() {
    setError("");

    const { data: p, error: pErr } = await supabase
      .from("properties")
      .select("*")
      .order("created_at", { ascending: false });
    if (pErr) return setError(pErr.message);

    const { data: a, error: aErr } = await supabase
      .from("property_cleaner_assignments")
      .select("*")
      .order("priority", { ascending: true });
    if (aErr) return setError(aErr.message);

    const { data: j, error: jErr } = await supabase
      .from("turnover_jobs")
      .select("*")
      .order("created_at", { ascending: false });
    if (jErr) return setError(jErr.message);

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

    const cleanerProfiles: Cleaner[] = (pr ?? [])
      .filter((profile) => profile.role === "cleaner")
      .map((profile) => ({
        id: profile.id,
        name: profile.full_name ?? null,
        email: profile.email ?? null,
        phone: profile.phone ?? null,
        active: true,
      }))
      .sort((a, b) => {
        const aName = (a.name || a.email || "").toLowerCase();
        const bName = (b.name || b.email || "").toLowerCase();
        return aName.localeCompare(bName);
      });

    setProperties((p ?? []) as Property[]);
    setCleaners(cleanerProfiles);
    setAssignments((a ?? []) as Assignment[]);
    setJobs((j ?? []) as Job[]);
    setStrandedJobs((sj ?? []) as StrandedJob[]);
    setAccessRows((ar ?? []) as AccessRow[]);
    setSops((s ?? []) as SopRow[]);
    setSopImages((si ?? []) as SopImageRow[]);
    setProfiles((pr ?? []) as ProfileRow[]);
    setPropertyCalendars((pc ?? []) as PropertyCalendarRow[]);
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

      if (profileError || !profile) {
        router.push("/login");
        return;
      }

      if (profile.role !== "admin") {
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
    });

    if (error) {
      setError(error.message);
      return;
    }

    setPropertyName("");
    setPropertyAddress("");
    setPropertyNotes("");
    loadData();
  }

  async function addAssignment() {
    if (!assignmentPropertyId || !assignmentCleanerId) return;

    const { error } = await supabase.from("property_cleaner_assignments").insert({
      property_id: assignmentPropertyId,
      cleaner_id: assignmentCleanerId,
      priority: Number(assignmentPriority),
    });

    if (error) {
      setError(error.message);
      return;
    }

    setAssignmentPropertyId("");
    setAssignmentCleanerId("");
    setAssignmentPriority("1");
    loadData();
  }

  async function createJob() {
    if (!jobPropertyId) return;

    const matchingAssignments = assignments
      .filter((a) => a.property_id === jobPropertyId)
      .sort((a, b) => a.priority - b.priority);

    const primaryCleanerId = matchingAssignments[0]?.cleaner_id ?? null;

    const { error } = await supabase.from("turnover_jobs").insert({
      property_id: jobPropertyId,
      status: primaryCleanerId ? "assigned" : "pending",
      assigned_cleaner_id: primaryCleanerId,
      notes: jobNotes.trim() || null,
    });

    if (error) {
      setError(error.message);
      return;
    }

    setJobPropertyId("");
    setJobNotes("");
    loadData();
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

      if (sopError) {
        setError("SOP save failed: " + sopError.message);
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

  function getCleanerName(id: string | null) {
    if (!id) return "Unassigned";
    const cleaner = cleaners.find((c) => c.id === id);
    return cleaner?.name || cleaner?.email || id;
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

  const visibleJobs = jobsExpanded ? jobs : jobs.slice(0, 3);

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
                <div className="mt-1 text-2xl font-semibold">
                  Checking admin access...
                </div>
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
                    Refined control for properties, cleaners, turnover scheduling,
                    access details, users, and visual SOPs.
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

          <div className="grid gap-3 border-t border-[#efe6dc] bg-[#fbf8f4] px-6 py-4 md:grid-cols-5 md:px-8">
            {[
              { label: "Properties", value: properties.length },
              { label: "Cleaners", value: cleaners.length },
              { label: "Assignments", value: assignments.length },
              { label: "Jobs", value: jobs.length },
              { label: "Users", value: profiles.length },
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
                🚨 {strandedJobs.length} stranded job
                {strandedJobs.length === 1 ? "" : "s"} need attention
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
                  🚨 {strandedJobs.length} stranded job
                  {strandedJobs.length === 1 ? "" : "s"}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8b3838]">
                  These jobs are assigned but have not been accepted by a cleaner yet.
                  They need attention before they fall through the cracks.
                </p>
              </div>

              <div className="rounded-[20px] border border-[#efc3c3] bg-white/80 px-4 py-3 text-sm text-[#7e1f1f] shadow-sm">
                Oldest waiting:
                <div className="mt-1 font-semibold">
                  {formatDateTime(strandedJobs[0]?.created_at)}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {strandedJobs.map((job) => (
                <div
                  key={job.id}
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
                  className="rounded-[22px] border border-[#efc3c3] bg-white px-4 py-4 shadow-sm cursor-pointer transition hover:shadow-md"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-base font-semibold text-[#241c15]">
                        {job.property_name || getPropertyName(job.property_id || "")}
                      </div>
                      <div className="mt-1 text-sm text-[#6f6255]">
                        {job.property_address || "No address"}
                      </div>
                      <div className="mt-2 text-sm text-[#8b3838]">
                        Assigned cleaner:{" "}
                        <span className="font-medium text-[#7e1f1f]">
                          {job.assigned_cleaner_name ||
                            job.assigned_cleaner_email ||
                            getCleanerName(job.assigned_cleaner_id)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-[#8a7b68]">
                        Status: {job.status || "unknown"}
                      </div>
                    </div>

                    <div className="rounded-[18px] border border-[#f1d0d0] bg-[#fff8f8] px-4 py-3 text-sm text-[#8b3838]">
                      <div>Created: {formatDateTime(job.created_at)}</div>
                      <div className="mt-1">
                        Offered: {job.offered_at ? formatDateTime(job.offered_at) : "Not recorded"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 text-sm leading-6 text-[#6f6255]">
                    {job.notes || "No notes"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

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
                Approve pending users and change access roles.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {profiles.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-5 py-6 text-sm text-[#8a7b68]">
                No users found.
              </div>
            ) : null}

            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="grid gap-4 rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4 md:grid-cols-[1.3fr_1fr_1fr_180px]"
              >
                <div>
                  <div className="text-base font-semibold text-[#241c15]">
                    {profile.full_name || "No name"}
                  </div>
                  <div className="mt-1 text-sm text-[#6f6255]">
                    {profile.email || "No email"}
                  </div>
                  <div className="mt-1 text-sm text-[#8a7b68]">
                    {profile.phone || "No phone"}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[#8a7b68]">
                    Current role
                  </div>
                  <div className="mt-2 inline-flex rounded-full border border-[#d8c7ab] bg-white px-3 py-1 text-xs font-medium text-[#7f7263]">
                    {profile.role}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[#8a7b68]">
                    Change role
                  </div>
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
              Add a managed property to the system.
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
              <button
                className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-medium text-[#f8f2e8] shadow-[0_10px_24px_rgba(36,28,21,0.18)] transition hover:bg-[#352a21] active:scale-[0.98] cursor-pointer"
                onClick={addProperty}
              >
                Add Property
              </button>
            </div>
          </section>

          <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <h2 className="text-xl font-semibold tracking-tight">Cleaner Accounts</h2>
            <p className="mt-1 text-sm text-[#7f7263]">
              Cleaners come from signed up users whose role is set to cleaner.
            </p>

            <div className="mt-5 rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-4 text-sm text-[#6f6255]">
              Use the User Management section above to change a user from
              <span className="font-medium"> pending </span>
              to
              <span className="font-medium"> cleaner</span>.
              <div className="mt-3 text-[#8a7b68]">
                Once their role is cleaner, they will appear in the assignment dropdown automatically.
              </div>
            </div>
          </section>

          <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <h2 className="text-xl font-semibold tracking-tight">Assign Cleaner</h2>
            <p className="mt-1 text-sm text-[#7f7263]">
              Set primary and backup cleaner order.
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
                value={assignmentCleanerId}
                onChange={(e) => setAssignmentCleanerId(e.target.value)}
              >
                <option value="">Select cleaner</option>
                {cleaners.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.email || "Unnamed cleaner"}
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
              Create a turnover job and auto-assign the primary cleaner.
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
                placeholder="Job notes"
                value={jobNotes}
                onChange={(e) => setJobNotes(e.target.value)}
              />

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
                        <div className="mt-3 text-sm text-[#a39584]">
                          No images selected yet.
                        </div>
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
                          <div className="mt-4 text-sm text-[#a39584]">
                            No images attached.
                          </div>
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
              {properties.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-5 py-6 text-sm text-[#8a7b68]">
                  No properties yet.
                </div>
              ) : null}

              {properties.map((p) => (
                <div key={p.id} className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                  <div className="text-base font-semibold">{p.name}</div>
                  <div className="mt-1 text-sm text-[#6f6255]">{p.address || "No address"}</div>
                  <div className="mt-2 text-sm text-[#8a7b68]">{p.notes || "No notes"}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Cleaners</h2>
              <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">
                {cleaners.length}
              </span>
            </div>
            <div className="space-y-3">
              {cleaners.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-5 py-6 text-sm text-[#8a7b68]">
                  No cleaners yet.
                </div>
              ) : null}

              {cleaners.map((c) => (
                <div key={c.id} className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                  <div className="text-base font-semibold">{c.name || "No name"}</div>
                  <div className="mt-1 text-sm text-[#6f6255]">{c.email || "No email"}</div>
                  <div className="mt-2 text-sm text-[#8a7b68]">{c.phone || "No phone"}</div>
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
              {assignments.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-5 py-6 text-sm text-[#8a7b68]">
                  No assignments yet.
                </div>
              ) : null}

              {assignments.map((a) => (
                <div key={a.id} className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] p-4">
                  <div className="text-base font-semibold">{getPropertyName(a.property_id)}</div>
                  <div className="mt-1 text-sm text-[#6f6255]">{getCleanerName(a.cleaner_id)}</div>
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
              {jobs.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-5 py-6 text-sm text-[#8a7b68]">
                  No jobs yet.
                </div>
              ) : null}

              {visibleJobs.map((job) => (
                <div
                  key={job.id}
                  id={"job-" + job.id}
                  onClick={() => setHighlightedJobId(job.id)}
                  className={`rounded-[22px] p-4 transition cursor-pointer ${
                    highlightedJobId === job.id
                      ? "border-2 border-[#b48d4e] bg-[#fffaf3] shadow-lg"
                      : "border border-[#eadfce] bg-[#fcfaf7] hover:shadow-sm"
                  }`}
                >
                  <div className="text-base font-semibold">{getPropertyName(job.property_id)}</div>
                  <div className="mt-2 text-sm text-[#6f6255]">
                    Status:{" "}
                    <span className="font-medium text-[#241c15]">{job.status || "unknown"}</span>
                  </div>
                  <div className="mt-1 text-sm text-[#8a7b68]">
                    Assigned: {getCleanerName(job.assigned_cleaner_id)}
                  </div>
                  <div className="mt-3 text-sm leading-6 text-[#6f6255]">
                    {job.notes || "No notes"}
                  </div>
                </div>
              ))}
            </div>

            {jobs.length > 3 && !jobsExpanded ? (
              <div className="mt-4 text-sm text-[#8a7b68]">
                Showing 3 of {jobs.length} jobs.
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}