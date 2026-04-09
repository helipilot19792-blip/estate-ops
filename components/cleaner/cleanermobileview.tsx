"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CleanerJob, CleanerViewProps } from "@/components/cleaner/cleanershell";

const MAINTENANCE_CATEGORIES = [
  "Cleaning issue",
  "Damage",
  "Found items",
  "Supplies",
  "Lock / access",
  "Plumbing",
  "Electrical",
  "Lawn / exterior",
  "Pest issue",
  "Safety issue",
  "Other",
] as const;

const MAINTENANCE_URGENCY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "urgent", label: "Urgent" },
] as const;

type ReportIssueModalProps = {
  open: boolean;
  onClose: () => void;
  availableProperties: Array<{ id: string; name: string | null; address: string | null }>;
  defaultPropertyId: string;
  currentProfileId: string | null;
  onSubmitted?: () => void;
};

function ReportIssueModal({
  open,
  onClose,
  availableProperties,
  defaultPropertyId,
  currentProfileId,
  onSubmitted,
}: ReportIssueModalProps) {
  const [propertyId, setPropertyId] = useState(defaultPropertyId);
  const [category, setCategory] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!open) return;
    setPropertyId(defaultPropertyId);
    setCategory("");
    setUrgency("normal");
    setNotes("");
    setFiles([]);
    setError("");
    setSaving(false);
  }, [open, defaultPropertyId]);

  if (!open) return null;

  async function handleSubmit() {
    const trimmedNotes = notes.trim();

    if (!propertyId) {
      setError("Please choose a property.");
      return;
    }
    if (!category) {
      setError("Please choose a category.");
      return;
    }
    if (!trimmedNotes) {
      setError("Please add a quick note about what is wrong.");
      return;
    }
    if (!currentProfileId) {
      setError("Your cleaner profile could not be confirmed.");
      return;
    }

    setSaving(true);
    setError("");

    const { data: flag, error: insertError } = await supabase
      .from("property_maintenance_flags")
      .insert({
        property_id: propertyId,
        source: "cleaner",
        category,
        urgency,
        status: "open",
        notes: trimmedNotes,
        flagged_by_profile_id: currentProfileId,
        flagged_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !flag) {
      setError(insertError?.message || "Failed to create issue.");
      setSaving(false);
      return;
    }

    if (files.length > 0) {
      const uploads: Array<{
        flag_id: string;
        image_url: string;
        sort_order: number;
      }> = [];

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
        await supabase.from("property_maintenance_flag_images").insert(uploads);
      }
    }

    setSaving(false);
    onSubmitted?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-[#7a5c2e]/35 bg-[#12100c] shadow-[0_30px_80px_rgba(0,0,0,0.45)] overscroll-contain">
        <div className="flex items-start justify-between gap-4 border-b border-[#7a5c2e]/20 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[#b08b47]">Maintenance</p>
            <h3 className="mt-1 text-xl font-semibold text-[#f8f2e8]">Report Issue</h3>
            <p className="mt-1 text-sm text-[#cdbda0]">
              Keep it fast. Pick the property, tap the issue type, and add a short note.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#7a5c2e]/30 px-3 py-1.5 text-sm text-[#f5efe4] transition hover:bg-[#1b1510]"
          >
            Close
          </button>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">Property</label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#7a5c2e]/25 bg-[#0f0d0a] px-4 py-3 text-sm text-[#f5efe4] outline-none transition focus:border-[#b08b47]"
            >
              <option value="">Choose property</option>
              {availableProperties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name || property.address || "Property"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">Category</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {MAINTENANCE_CATEGORIES.map((item) => {
                const isSelected = category === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      isSelected
                        ? "border-[#e7c98a] bg-[#b08b47]/20 text-[#f8f2e8] ring-2 ring-[#b08b47]/45"
                        : "border-[#7a5c2e]/25 bg-[#100d0a] text-[#e8ddca] hover:bg-[#19140f]"
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">Urgency</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {MAINTENANCE_URGENCY_OPTIONS.map((option) => {
                const isSelected = urgency === option.value;
                const selectedClass =
                  option.value === "urgent"
                    ? "border-red-400/80 bg-red-500 text-white"
                    : option.value === "normal"
                      ? "border-amber-300/60 bg-amber-400/20 text-[#f8f2e8]"
                      : "border-sky-300/45 bg-sky-400/10 text-sky-100";

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setUrgency(option.value)}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      isSelected
                        ? selectedClass
                        : "border-[#7a5c2e]/25 bg-[#100d0a] text-[#e8ddca] hover:bg-[#19140f]"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">Photos</label>
            <label className="mt-2 flex cursor-pointer items-center justify-center rounded-2xl border border-[#7a5c2e]/25 bg-[#100d0a] px-4 py-3 text-sm text-[#f5efe4] hover:bg-[#19140f]">
              📸 Take / Add Photos
              <input
                type="file"
                multiple
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  if (!e.target.files) return;
                  setFiles(Array.from(e.target.files));
                }}
                className="hidden"
              />
            </label>

            {files.length > 0 && (
              <p className="mt-1 text-xs text-[#cdbda0]">{files.length} photo(s) selected</p>
            )}
          </div>

          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">Quick note</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Example: Kitchen sink leaking under cabinet."
              className="mt-2 min-h-[120px] w-full rounded-2xl border border-[#7a5c2e]/25 bg-[#0f0d0a] px-4 py-3 text-sm text-[#f5efe4] outline-none transition focus:border-[#b08b47]"
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/35 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-full bg-[#b08b47] px-5 py-2.5 text-sm font-semibold text-[#120f0b] transition hover:bg-[#c79d53] disabled:opacity-50"
            >
              {saving ? "Reporting..." : "Report Issue"}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-full border border-[#7a5c2e]/35 px-5 py-2.5 text-sm font-semibold text-[#f5efe4] transition hover:bg-[#1b1510] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CleanerMobileView({
  activeJobs,
  historyJobs,
  unacceptedCount,
  selectedCleanerJob,
  selectedSlotId,
  setSelectedSlotId,
  handleAcceptJob,
  handleDeclineJob,
  handleCloseDetails,
  handleSignOut,
  signingOut,
  actionLoading,
  getStatusTone,
  getSlotDisplayStatus,
  getTeamMessage,
  formatDateLabel,
  formatDateTimeLabel,
  toYmd,
  selectedDate,
  setSelectedDate,
  selectedJobProperty,
  selectedJobAccess,
  selectedJobSops,
  sopImagesBySopId,
  profile,
  cleanerAccount,
  properties,
}: CleanerViewProps) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSubmittedMessage, setReportSubmittedMessage] = useState("");
  const [jobView, setJobView] = useState<"active" | "history">("active");
  const reportableProperties = useMemo(() => properties, [properties]);

  function normalizeJobDate(value: string | null | undefined) {
    if (!value) return null;
    return value.slice(0, 10);
  }

  const today = new Date();

  const dateStrip = Array.from(
    new Set(
      [
        ...Array.from({ length: 7 }).map((_, i) => {
          const d = new Date(today);
          d.setDate(today.getDate() + i);
          return toYmd(d);
        }),
        ...activeJobs
          .map((item) => normalizeJobDate(item.jobDate))
          .filter((value): value is string => Boolean(value)),
      ].sort()
    )
  ).slice(0, 7);

  const visibleJobs =
    jobView === "history"
      ? selectedDate
        ? historyJobs.filter((item) => normalizeJobDate(item.jobDate) === selectedDate)
        : historyJobs
      : selectedDate
        ? activeJobs.filter((item) => normalizeJobDate(item.jobDate) === selectedDate)
        : activeJobs;

  function formatShort(ymd: string) {
    const [year, month, day] = ymd.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
    });
  }

  function isOffered(status: string | null | undefined) {
    return (status || "").toLowerCase().trim() === "offered";
  }

  function isAccepted(status: string | null | undefined) {
    return (status || "").toLowerCase().trim() === "accepted";
  }

  function handleCardTap(slotId: string) {
    setSelectedSlotId((current) => (current === slotId ? null : slotId));
  }

  async function onAcceptClick() {
    await handleAcceptJob();
    setSelectedSlotId(null);
    setSelectedDate(null);
  }

  async function onDeclineAndReturn() {
    const confirmed = window.confirm("Are you sure you want to decline this job?");
    if (!confirmed) return;
    await handleDeclineJob();
    setSelectedSlotId(null);
    setSelectedDate(null);
  }

  function getCalendarUrl(jobId: string) {
    return `/api/cleaner-calendar-event?jobId=${encodeURIComponent(jobId)}`;
  }

  function getParsedNotes(notes: string | null) {
    const cleanedLines = notes
      ? notes
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .filter((line) => !/^\[AUTO_SYNC:/i.test(line))
          .filter((line) => !/^Auto-created from .*calendar sync\.?$/i.test(line))
      : [];

    const guestLine =
      cleanedLines.find((line) => /^Guest\s*\/\s*reservation\s*:/i.test(line)) || null;

    const checkoutLine =
      cleanedLines.find((line) => /^Checkout date\s*:/i.test(line)) || null;

    return {
      summaryLines: [guestLine, checkoutLine].filter(Boolean) as string[],
      detailLines: cleanedLines.filter(
        (line) =>
          !/^Property\s*:/i.test(line) &&
          !/^Guest\s*\/\s*reservation\s*:/i.test(line) &&
          !/^Checkout date\s*:/i.test(line)
      ),
    };
  }

  function renderJobList(items: CleanerJob[], emptyText: string) {
    if (items.length === 0) {
      return (
        <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#15110d] p-4 text-sm text-[#cdbda0]">
          {emptyText}
        </div>
      );
    }

    return items.map((item) => {
      const tone = getStatusTone(item.slot.status, item.job.staffing_status);
      const isSelected = selectedSlotId === item.slot.id;
      const propertyName =
        selectedJobProperty?.name ||
        properties.find((p) => p.id === item.job.property_id)?.name ||
        "Property job";
      const propertyAddress =
        selectedJobProperty?.address ||
        properties.find((p) => p.id === item.job.property_id)?.address ||
        "No property address";
      const parsedNotes = getParsedNotes(item.job.notes);

      return (
        <div
          key={item.slot.id}
          className={`rounded-2xl border text-left transition ${tone.card} ${
            isSelected ? tone.selectedRing : ""
          }`}
        >
          <button
            type="button"
            onClick={() => handleCardTap(item.slot.id)}
            className="block w-full p-4 text-left"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold leading-tight text-[#f8f2e8]">
                  {propertyName}
                </div>
                <div className="mt-1 text-sm text-[#d4c4a8]">
                  {formatDateLabel(normalizeJobDate(item.jobDate))}
                </div>
                <div className="mt-2 text-sm leading-snug text-[#d4c4a8]">{getTeamMessage(item)}</div>
              </div>

              <div className="flex items-center justify-between gap-2 sm:w-auto sm:flex-col sm:items-end">
                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${tone.badge}`}>
                  {getSlotDisplayStatus(item.slot.status, item.job.staffing_status)}
                </span>

                <span className="rounded-full border border-[#7a5c2e]/30 bg-[#100d0a] px-3 py-1 text-[11px] font-semibold text-[#f5efe4]">
                  {isSelected ? "Close" : "Open"}
                </span>
              </div>
            </div>

            <div className="mt-3 space-y-1 text-sm text-[#e8ddca]">
              {parsedNotes.summaryLines.length > 0 ? (
                parsedNotes.summaryLines.map((line, index) => <p key={index}>{line}</p>)
              ) : (
                <p>No job notes.</p>
              )}
            </div>
          </button>

          {isSelected && selectedCleanerJob && selectedCleanerJob.slot.id === item.slot.id ? (
            <section className="border-t border-[#7a5c2e]/20 px-3 pb-4 pt-4 sm:px-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-[#d4c4a8]">{propertyAddress}</p>
                  <p className="mt-1 text-sm text-[#f0d59f]">
                    Cleaning date: {formatDateLabel(normalizeJobDate(selectedCleanerJob.jobDate))}
                  </p>
                </div>

                <span
                  className={`w-fit rounded-full px-3 py-1 text-[11px] font-semibold ${
                    getStatusTone(
                      selectedCleanerJob.slot.status,
                      selectedCleanerJob.job.staffing_status
                    ).badge
                  }`}
                >
                  {getSlotDisplayStatus(
                    selectedCleanerJob.slot.status,
                    selectedCleanerJob.job.staffing_status
                  )}
                </span>
              </div>

              <div className="mt-4 space-y-3 text-sm text-[#e8ddca]">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">Team</div>
                  <div className="mt-1">{getTeamMessage(selectedCleanerJob)}</div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">
                    Job Notes
                  </div>
                  <div className="mt-1 space-y-1 whitespace-pre-wrap">
                    {parsedNotes.detailLines.map((line, index) => (
                      <p key={`detail-${index}`}>{line}</p>
                    ))}
                    {parsedNotes.detailLines.length === 0 ? <p>No job notes.</p> : null}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">
                    Access
                  </div>
                  <div className="mt-1 whitespace-pre-wrap">
                    {selectedJobAccess?.door_code
                      ? `Door code: ${selectedJobAccess.door_code}`
                      : "No door code"}
                    <br />
                    {selectedJobAccess?.alarm_code
                      ? `Alarm code: ${selectedJobAccess.alarm_code}`
                      : "No alarm code"}
                    <br />
                    {selectedJobAccess?.notes || "No access notes."}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">
                    Slot Timing
                  </div>
                  <div className="mt-1">
                    Offered: {formatDateTimeLabel(selectedCleanerJob.slot.offered_at)}
                    <br />
                    Accepted: {formatDateTimeLabel(selectedCleanerJob.slot.accepted_at)}
                    <br />
                    Declined: {formatDateTimeLabel(selectedCleanerJob.slot.declined_at)}
                  </div>
                </div>

                {selectedJobSops.length > 0 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">SOPs</div>
                    <div className="mt-2 space-y-3">
                      {selectedJobSops.map((sop) => {
                        const images = sopImagesBySopId.get(sop.id) || [];
                        return (
                          <div
                            key={sop.id}
                            className="rounded-xl border border-[#7a5c2e]/20 bg-[#100d0a] p-3"
                          >
                            <div className="font-medium text-[#f8f2e8]">
                              {sop.title || "Untitled SOP"}
                            </div>
                            <div className="mt-1 whitespace-pre-wrap text-sm text-[#d4c4a8]">
                              {sop.content || "No SOP notes."}
                            </div>

                            {images.length > 0 ? (
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                {images.map((image) => (
                                  <a
                                    key={image.id}
                                    href={image.image_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="overflow-hidden rounded-xl border border-[#7a5c2e]/20 bg-[#15110d]"
                                  >
                                    <img
                                      src={image.image_url}
                                      alt={image.caption || sop.title || "SOP image"}
                                      className="h-24 w-full object-cover"
                                    />
                                    {image.caption ? (
                                      <div className="px-2 py-1 text-xs text-[#d4c4a8]">
                                        {image.caption}
                                      </div>
                                    ) : null}
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2.5">
                {isOffered(selectedCleanerJob.slot.status) ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void onAcceptClick()}
                      disabled={actionLoading !== null}
                      className="min-h-[46px] rounded-full border border-emerald-500/40 bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      {actionLoading === "accept" ? "Accepting..." : "Accept Job"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void onDeclineAndReturn()}
                      disabled={actionLoading !== null}
                      className="min-h-[46px] rounded-full border border-red-500/40 bg-red-500/20 px-4 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/30 disabled:opacity-50"
                    >
                      {actionLoading === "decline" ? "Declining..." : "Decline Job"}
                    </button>
                  </>
                ) : null}

                {isAccepted(selectedCleanerJob.slot.status) ? (
                  <a
                    href={getCalendarUrl(selectedCleanerJob.job.id)}
                    className="min-h-[46px] rounded-full border border-[#b08b47]/40 bg-[#b08b47]/15 px-4 py-3 text-sm font-semibold text-[#f5efe4] transition hover:bg-[#b08b47]/25"
                  >
                    Add to Calendar
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="min-h-[46px] rounded-full border border-[#b08b47]/45 bg-[#b08b47]/10 px-4 py-3 text-sm font-semibold text-[#f5efe4] transition hover:bg-[#b08b47]/20"
                >
                  Report Issue
                </button>

                <button
                  type="button"
                  onClick={handleCloseDetails}
                  className="min-h-[46px] rounded-full border border-[#7a5c2e]/40 bg-[#100d0a] px-4 py-3 text-sm font-semibold text-[#f5efe4] transition hover:bg-[#1b1510]"
                >
                  Close Details
                </button>
              </div>

              {reportSubmittedMessage ? (
                <div className="mt-4 rounded-2xl border border-emerald-500/35 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-200">
                  {reportSubmittedMessage}
                </div>
              ) : null}

              <ReportIssueModal
                open={reportOpen}
                onClose={() => setReportOpen(false)}
                availableProperties={reportableProperties}
                defaultPropertyId={selectedJobProperty?.id || selectedCleanerJob.job.property_id}
                currentProfileId={profile?.id || null}
                onSubmitted={() => {
                  setReportSubmittedMessage("Issue reported successfully.");
                  setTimeout(() => setReportSubmittedMessage(""), 3500);
                }}
              />
            </section>
          ) : null}
        </div>
      );
    });
  }

  return (
    <main className="min-h-screen bg-[#0f0d0a] px-3 py-4 text-[#f5efe4]">
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl border border-[#7a5c2e]/30 bg-[#15110d] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Cleaner Jobs</h1>
              <p className="mt-1 text-sm text-[#cdbda0]">
                Active Jobs is the default view. Job History is in its own tab.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="shrink-0 rounded-full border border-[#b08b47]/60 px-3 py-2 text-xs font-semibold text-[#f5efe4] transition hover:bg-[#b08b47] hover:text-[#120f0b] disabled:opacity-50"
            >
              {signingOut ? "Signing out..." : "Logout"}
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-[#7a5c2e]/20 bg-[#100d0a] p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-[#b08b47]">Logged in as</div>
            <div className="mt-1 text-sm font-medium text-[#f8f2e8]">
              {profile?.full_name || cleanerAccount?.display_name || "Cleaner"}
            </div>
            <div className="mt-1 break-all text-xs text-[#cdbda0]">
              {profile?.email || "No email available"}
            </div>
            {cleanerAccount?.display_name ? (
              <div className="mt-2 text-xs text-[#d4c4a8]">Account: {cleanerAccount.display_name}</div>
            ) : null}
          </div>
        </div>

        <div className="inline-flex w-full rounded-2xl border border-[#7a5c2e]/30 bg-[#100d0a] p-1">
          <button
            type="button"
            onClick={() => setJobView("active")}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
              jobView === "active"
                ? "bg-[#b08b47] text-[#120f0b]"
                : "text-[#f5efe4] hover:bg-[#1b1510]"
            }`}
          >
            Active Jobs ({activeJobs.length})
            {unacceptedCount > 0 ? (
              <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-[11px] text-white">
                {unacceptedCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setJobView("history")}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
              jobView === "history"
                ? "bg-[#b08b47] text-[#120f0b]"
                : "text-[#f5efe4] hover:bg-[#1b1510]"
            }`}
          >
            Job History ({historyJobs.length})
          </button>
        </div>

        {jobView === "active" ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {dateStrip.map((ymd) => {
              const jobsForDay = activeJobs.filter((item) => normalizeJobDate(item.jobDate) === ymd);

              const hasOffered = jobsForDay.some((item) => isOffered(item.slot.status));

              const allAccepted =
                jobsForDay.length > 0 &&
                jobsForDay.every(
                  (item) => (item.slot.status || "").toLowerCase().trim() === "accepted"
                );

              const isSelected = selectedDate === ymd;

              return (
                <button
                  key={ymd}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedDate(null);
                      return;
                    }

                    setSelectedDate(ymd);
                    const first = jobsForDay[0];
                    setSelectedSlotId(first?.slot.id || null);
                  }}
                  className={`min-w-[74px] rounded-xl border p-2 text-center transition ${
                    isSelected
                      ? "border-[#e7c98a] bg-[#2a2118] text-white ring-2 ring-[#e7c98a]"
                      : hasOffered
                        ? "border-red-500 bg-red-900/40 text-white shadow-[0_0_18px_rgba(239,68,68,0.18)]"
                        : allAccepted
                          ? "border-emerald-500 bg-emerald-900/30 text-emerald-200"
                          : "border-[#7a5c2e]/20 bg-[#100d0a] text-[#f5efe4]"
                  }`}
                >
                  <div className="text-xs">{formatShort(ymd)}</div>
                  <div className="mt-1 text-[11px] text-[#cdbda0]">
                    {jobsForDay.length > 0
                      ? `${jobsForDay.length} job${jobsForDay.length === 1 ? "" : "s"}`
                      : "—"}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#15110d] p-4 text-sm text-[#cdbda0]">
            Past jobs are kept here so the active list stays clean.
          </div>
        )}

        <div className="space-y-3">
          {jobView === "active"
            ? renderJobList(
                visibleJobs,
                selectedDate ? "No active jobs for that date." : "No active jobs assigned yet."
              )
            : renderJobList(
                visibleJobs,
                selectedDate ? "No history jobs for that date." : "No job history yet."
              )}
        </div>
      </div>
    </main>
  );
}
