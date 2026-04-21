
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import type { GroundsJob, GroundsViewProps } from "@/components/grounds/groundsshell";


const MAINTENANCE_CATEGORIES = [
  "Cleaning issue",
  "Found items",
  "Damage",
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
  availableProperties: Array<{
    id: string;
    organization_id: string;
    name: string | null;
    address: string | null;
  }>;
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
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      setError("Your grounds profile could not be confirmed.");
      return;
    }
    setSaving(true);
    setError("");

    const selectedProperty = availableProperties.find(
      (property) => property.id === propertyId
    );

    if (!selectedProperty?.organization_id) {
      setError("Organization could not be determined for this property.");
      setSaving(false);
      return;
    }

    const { data: flag, error: insertError } = await supabase
      .from("property_maintenance_flags")
      .insert({
        organization_id: selectedProperty.organization_id,
        property_id: propertyId,
        source: "grounds",
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
        const { error: imageInsertError } = await supabase
          .from("property_maintenance_flag_images")
          .insert(uploads);

        if (imageInsertError) {
          console.error(imageInsertError);
        }
      }
    }

    setSaving(false);
    onSubmitted?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-2xl rounded-[28px] border border-[#356046]/35 bg-[#12100c] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#356046]/20 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[#7fb685]">Maintenance</p>
            <h3 className="mt-1 text-xl font-semibold text-[#f2fbf4]">Report Issue</h3>
            <p className="mt-1 text-sm text-[#b9d3c0]">
              Keep it fast. Pick the property, tap the issue type, and add a short note.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#356046]/30 px-3 py-1.5 text-sm text-[#eef7ef] transition hover:bg-[#173022]"
          >
            Close
          </button>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-[#7fb685]">Property</label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#356046]/25 bg-[#0d1611] px-4 py-3 text-sm text-[#eef7ef] outline-none transition focus:border-[#7fb685]"
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
            <div className="text-xs uppercase tracking-[0.18em] text-[#7fb685]">Category</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {MAINTENANCE_CATEGORIES.map((item) => {
                const isSelected = category === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${isSelected
                      ? "border-[#e7c98a] bg-[#7fb685]/20 text-[#f2fbf4] ring-2 ring-[#7fb685]/45"
                      : "border-[#356046]/25 bg-[#0f1b14] text-[#d8eadc] hover:bg-[#19140f]"
                      }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-[#7fb685]">Urgency</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {MAINTENANCE_URGENCY_OPTIONS.map((option) => {
                const isSelected = urgency === option.value;
                const selectedClass =
                  option.value === "urgent"
                    ? "border-red-400/80 bg-red-500 text-white"
                    : option.value === "normal"
                      ? "border-amber-300/60 bg-amber-400/20 text-[#f2fbf4]"
                      : "border-sky-300/45 bg-sky-400/10 text-sky-100";

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setUrgency(option.value)}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${isSelected
                      ? selectedClass
                      : "border-[#356046]/25 bg-[#0f1b14] text-[#d8eadc] hover:bg-[#19140f]"
                      }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-[#7fb685]">Quick note</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Example: Kitchen sink leaking under cabinet."
              className="mt-2 min-h-[120px] w-full rounded-2xl border border-[#356046]/25 bg-[#0d1611] px-4 py-3 text-sm text-[#eef7ef] outline-none transition focus:border-[#7fb685]"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-[#7fb685]">Photos</label>
            <label className="mt-2 flex cursor-pointer items-center justify-center rounded-2xl border border-[#356046]/25 bg-[#0f1b14] px-4 py-3 text-sm text-[#eef7ef] hover:bg-[#19140f]">
              📸 Take / Add Photos
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
                  if (!e.target.files) return;
                  setFiles(Array.from(e.target.files));
                }}
                className="hidden"
              />
            </label>

            {files.length > 0 && (
              <p className="mt-1 text-xs text-[#b9d3c0]">
                {files.length} photo(s) selected
              </p>
            )}
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
              className="rounded-full bg-[#7fb685] px-5 py-2.5 text-sm font-semibold text-[#120f0b] transition hover:bg-[#93c89a] disabled:opacity-50"
            >
              {saving ? "Reporting..." : "Report Issue"}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-full border border-[#356046]/35 px-5 py-2.5 text-sm font-semibold text-[#eef7ef] transition hover:bg-[#173022] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function parseDesktopJobNotes(notes: string | null) {
  if (!notes) {
    return {
      summaryLines: ["No job notes."],
      detailLines: [],
    };
  }

  const cleaned = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\[AUTO_SYNC:/i.test(line))
    .filter((line) => !/^Auto-created from .*calendar sync\.?$/i.test(line));

  return {
    summaryLines: cleaned.slice(0, 3),
    detailLines: cleaned,
  };
}
function JobCard({
  item,
  isSelected,
  propertyName,
  propertyAddress,
  onClick,
  tone,
  waiting,
  remainingMs,
  countdownTone,
  formatDateLabel,
  formatDateTimeLabel,
  formatRemaining,
  getSlotDisplayStatus,
  getTeamMessage,
  selectedJobProperty,
  selectedJobAccess,
  selectedJobSops,
  sopImagesBySopId,
  actionLoading,
  handleAcceptJob,
  handleDeclineJob,
  handleCloseDetails,
  availableProperties,
  currentProfileId,
}: {
  item: GroundsJob;
  isSelected: boolean;
  propertyName: string;
  propertyAddress: string;
  onClick: () => void;
  tone: ReturnType<GroundsViewProps["getStatusTone"]>;
  waiting: boolean;
  remainingMs: number | null;
  countdownTone: string;
  formatDateLabel: (dateString: string | null) => string;
  formatDateTimeLabel: (dateString: string | null | undefined) => string;
  formatRemaining: (ms: number) => string;
  getSlotDisplayStatus: GroundsViewProps["getSlotDisplayStatus"];
  getTeamMessage: GroundsViewProps["getTeamMessage"];
  selectedJobProperty: GroundsViewProps["selectedJobProperty"];
  selectedJobAccess: GroundsViewProps["selectedJobAccess"];
  selectedJobSops: GroundsViewProps["selectedJobSops"];
  sopImagesBySopId: GroundsViewProps["sopImagesBySopId"];
  actionLoading: GroundsViewProps["actionLoading"];
  handleAcceptJob: GroundsViewProps["handleAcceptJob"];
  handleDeclineJob: GroundsViewProps["handleDeclineJob"];
  handleCloseDetails: GroundsViewProps["handleCloseDetails"];
  availableProperties: GroundsViewProps["properties"];
  currentProfileId: string | null;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSubmittedMessage, setReportSubmittedMessage] = useState("");
  const parsedNotes = parseDesktopJobNotes(item.job.notes);
  const selectedStatus = (item.slot.status || "").toLowerCase().trim();
  const isOffered = selectedStatus === "offered";
  const isAccepted = selectedStatus === "accepted";

  return (
    <div
      className={[
        "rounded-2xl border p-5 text-left transition duration-200",
        tone.card,
        isSelected ? tone.selectedRing : "hover:-translate-y-[1px] hover:bg-[#18120e]",
      ].join(" ")}
    >
      <button type="button" onClick={onClick} className="block w-full text-left">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={tone.badge}>
                {getSlotDisplayStatus(item.slot.status, item.job.staffing_status)}
              </span>

              {isSelected && (
                <span className="rounded-full border border-[#7fb685]/35 bg-[#7fb685]/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#f0d59f]">
                  Open
                </span>
              )}
            </div>

            <h3 className="mt-3 text-lg font-semibold text-[#f2fbf4]">{propertyName}</h3>
            <p className="mt-1 text-sm text-[#a9c9b0]">{propertyAddress}</p>

            <p className="mt-2 text-sm font-medium text-[#f0d59f]">
              Service date: {formatDateLabel(item.jobDate)}
            </p>

            <p className="mt-2 text-sm text-[#d9c5a1]">{getTeamMessage(item)}</p>

            {waiting && remainingMs !== null && (
              <p className={`mt-2 text-sm font-semibold ${countdownTone}`}>
                {remainingMs < 0
                  ? `Overdue by ${formatRemaining(remainingMs)}`
                  : `Accept within ${formatRemaining(remainingMs)}`}
              </p>
            )}
          </div>

          <div className="flex items-start md:justify-end">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#356046]/25 bg-[#120f0b] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#d9c5a1]">
              <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
              {isSelected ? "Tap to close" : "Tap to open"}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[#7fb685]">Job Summary</p>
          <div className="mt-2 space-y-1 text-sm text-[#d8eadc]">
            {parsedNotes.summaryLines.length > 0 ? (
              parsedNotes.summaryLines.slice(0, 3).map((line, index) => <p key={index}>{line}</p>)
            ) : (
              <p>No job notes.</p>
            )}
          </div>
        </div>
      </button>

      {isSelected && (
        <div className="mt-5 border-t border-[#356046]/20 pt-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#7fb685]">Job details</p>
              <h3 className="mt-1 text-xl font-semibold text-[#f2fbf4]">
                {selectedJobProperty?.name || propertyName}
              </h3>
              <p className="mt-1 text-sm text-[#a9c9b0]">
                {selectedJobProperty?.address || propertyAddress}
              </p>
              <p className="mt-2 text-sm text-[#e7c98a]">
                Service date: {formatDateLabel(item.jobDate)}
              </p>
              <p className="mt-2 text-sm text-[#d9c5a1]">{getTeamMessage(item)}</p>
            </div>

            <div>
              <span
                className={`inline-flex w-fit rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em] ${isOffered
                  ? "border border-red-400/70 bg-red-500 text-white animate-pulse"
                  : isAccepted
                    ? "border border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                    : "border border-[#356046]/35 bg-[#7fb685]/10 text-[#e7c98a]"
                  }`}
              >
                {getSlotDisplayStatus(item.slot.status ?? null, item.job.staffing_status ?? null)}
              </span>

              {isOffered && remainingMs !== null && (
                <div className={`mt-3 text-sm font-semibold ${countdownTone}`}>
                  {remainingMs < 0
                    ? `Overdue by ${formatRemaining(remainingMs)}`
                    : `Accept within ${formatRemaining(remainingMs)}`}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#356046]/20 bg-[#0f1b14] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[#7fb685]">Slot Offered</p>
              <p className="mt-2 text-sm text-[#d8eadc]">{formatDateTimeLabel(item.slot.offered_at)}</p>
            </div>

            <div className="rounded-2xl border border-[#356046]/20 bg-[#0f1b14] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[#7fb685]">Slot Accepted</p>
              <p className="mt-2 text-sm text-[#d8eadc]">{formatDateTimeLabel(item.slot.accepted_at)}</p>
            </div>

            <div className="rounded-2xl border border-[#356046]/20 bg-[#0f1b14] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[#7fb685]">Slot Declined</p>
              <p className="mt-2 text-sm text-[#d8eadc]">{formatDateTimeLabel(item.slot.declined_at)}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#356046]/20 bg-[#0f1b14] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[#7fb685]">Team Slots</p>
              <p className="mt-2 text-sm text-[#d8eadc]">
                {item.acceptedSlots} accepted of {item.totalSlots}
              </p>
            </div>

            <div className="rounded-2xl border border-[#356046]/20 bg-[#0f1b14] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[#7fb685]">Job Status</p>
              <p className="mt-2 text-sm text-[#d8eadc]">
                {item.job.staffing_status || item.job.status || "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-[#356046]/20 bg-[#0f1b14] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[#7fb685]">Slot Number</p>
              <p className="mt-2 text-sm text-[#d8eadc]">{item.slot.slot_number ?? "—"}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {isOffered && (
              <>
                <button
                  type="button"
                  onClick={() => void handleAcceptJob()}
                  disabled={actionLoading !== null}
                  className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-[#08110c] transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  {actionLoading === "accept" ? "Accepting..." : "Accept Job"}
                </button>

                <button
                  type="button"
                  onClick={() => void handleDeclineJob()}
                  disabled={actionLoading !== null}
                  className="rounded-full bg-red-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-400 disabled:opacity-50"
                >
                  {actionLoading === "decline" ? "Declining..." : "Decline Job"}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="rounded-full border border-[#7fb685]/45 bg-[#7fb685]/10 px-5 py-2 text-sm font-medium text-[#eef7ef] transition hover:bg-[#7fb685]/20"
            >
              Report Issue
            </button>

            <button
              type="button"
              onClick={handleCloseDetails}
              className="rounded-full border border-[#356046]/50 px-5 py-2 text-sm font-medium text-[#eef7ef] transition hover:bg-[#1f3a2a]"
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
            availableProperties={availableProperties}
            defaultPropertyId={selectedJobProperty?.id || item.job.property_id}
            currentProfileId={currentProfileId}
            onSubmitted={() => {
              setReportSubmittedMessage("Issue reported successfully.");
              setTimeout(() => setReportSubmittedMessage(""), 3500);
            }}
          />

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#356046]/20 bg-[#0f1b14] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#7fb685]">Job Notes</p>
              <div className="mt-2 space-y-2 text-sm text-[#d8eadc]">
                {parsedNotes.summaryLines.map((line, index) => (
                  <p key={`summary-${index}`}>{line}</p>
                ))}
                {parsedNotes.detailLines.map((line, index) => (
                  <p key={`detail-${index}`}>{line}</p>
                ))}
                {parsedNotes.summaryLines.length === 0 && parsedNotes.detailLines.length === 0 && (
                  <p>No job notes.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[#356046]/20 bg-[#0f1b14] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#7fb685]">Access Details</p>
              <div className="mt-2 space-y-2 text-sm text-[#d8eadc]">
                {item.job.needs_secure_access || item.job.needs_garage_access ? (
                  <>
                    <p><span className="text-[#a9c9b0]">Door code:</span> {selectedJobAccess?.door_code || "Not added"}</p>
                    <p><span className="text-[#a9c9b0]">Alarm code:</span> {selectedJobAccess?.alarm_code || "Not added"}</p>
                    <p className="whitespace-pre-wrap">
                      <span className="text-[#a9c9b0]">Notes:</span> {selectedJobAccess?.notes || "No access notes added yet."}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[#b9d3c0]">This grounds job does not require secure interior access.</p>
                    <p className="whitespace-pre-wrap">
                      <span className="text-[#a9c9b0]">Notes:</span> {selectedJobAccess?.notes || "No access notes added yet."}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[#356046]/20 bg-[#0f1b14] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[#7fb685]">Property Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[#d8eadc]">
              {selectedJobProperty?.notes || "No property notes."}
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-[#356046]/20 bg-[#0f1b14] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[#7fb685]">SOPs</p>

            {selectedJobSops.length === 0 ? (
              <p className="mt-2 text-sm text-[#b9d3c0]">No SOPs added yet.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {selectedJobSops.map((sop) => {
                  const images = sopImagesBySopId.get(sop.id) || [];

                  return (
                    <div
                      key={sop.id}
                      className="rounded-2xl border border-[#356046]/15 bg-[#14221a] p-4"
                    >
                      {sop.title && (
                        <h4 className="text-base font-semibold text-[#f2fbf4]">{sop.title}</h4>
                      )}

                      {sop.content && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-[#d8eadc]">
                          {sop.content}
                        </p>
                      )}

                      {images.length > 0 && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {images.map((image) => (
                            <a
                              key={image.id}
                              href={image.image_url}
                              target="_blank"
                              rel="noreferrer"
                              className="block overflow-hidden rounded-xl border border-[#356046]/20"
                            >
                              <img
                                src={image.image_url}
                                alt={image.caption || sop.title || "SOP image"}
                                className="h-40 w-full object-cover transition hover:scale-[1.02]"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GroundsDesktopView({
  loading,
  signingOut,
  actionLoading,
  profile,
  groundsAccount,
  properties,
  pageError,
  accountWarning,
  jobsWarning,
  calendarMonth,
  setCalendarMonth,
  selectedDate,
  setSelectedDate,
  selectedSlotId,
  setSelectedSlotId,
  jobsCollapsed,
  setJobsCollapsed,
  now,
  unacceptedJobs,
  unacceptedCount,
  jobsByDate,
  calendarDays,
  filteredJobs,
  activeJobs,
  historyJobs,
  collapsedPreviewJob,
  hiddenJobsCount,
  selectedDateLabel,
  selectedGroundsJob,
  selectedJobProperty,
  selectedJobAccess,
  selectedJobSops,
  sopImagesBySopId,
  handleDateClick,
  handleJobClick,
  scrollToJobsSection,
  handleAcceptJob,
  handleDeclineJob,
  handleCloseDetails,
  handleSignOut,
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
}: GroundsViewProps) {
  const [jobView, setJobView] = useState<"active" | "history">("active");

  const visibleJobs = jobView === "history" ? historyJobs : activeJobs;

  function renderJobList(items: GroundsJob[], emptyText: string) {
    if (items.length === 0) {
      return <p className="text-sm text-[#b9d3c0]">{emptyText}</p>;
    }

    return (
      <div className="space-y-4">
        {items.map((item) => {
          const property = properties.find((p) => p.id === item.job.property_id);
          const tone = getStatusTone(item.slot.status, item.job.staffing_status);
          const waiting = (item.slot.status || "").toLowerCase().trim() === "offered";
          const remainingMs = waiting ? getTimeRemainingMs(item, now) : null;

          return (
            <JobCard
              key={item.slot.id}
              item={item}
              isSelected={selectedSlotId === item.slot.id}
              propertyName={property?.name || "Property job"}
              propertyAddress={property?.address || "No property address"}
              onClick={() => handleJobClick(item.slot.id)}
              tone={tone}
              waiting={waiting}
              remainingMs={remainingMs}
              countdownTone={getCountdownTone(remainingMs)}
              formatDateLabel={formatDateLabel}
              formatDateTimeLabel={formatDateTimeLabel}
              formatRemaining={formatRemaining}
              getSlotDisplayStatus={getSlotDisplayStatus}
              getTeamMessage={getTeamMessage}
              selectedJobProperty={
                selectedGroundsJob?.slot.id === item.slot.id ? selectedJobProperty : property || null
              }
              selectedJobAccess={
                selectedGroundsJob?.slot.id === item.slot.id ? selectedJobAccess : null
              }
              selectedJobSops={
                selectedGroundsJob?.slot.id === item.slot.id ? selectedJobSops : []
              }
              sopImagesBySopId={sopImagesBySopId}
              actionLoading={actionLoading}
              handleAcceptJob={handleAcceptJob}
              handleDeclineJob={handleDeclineJob}
              handleCloseDetails={handleCloseDetails}
              availableProperties={properties}
              currentProfileId={profile?.id || null}

            />
          );
        })}
      </div>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0d1611] text-[#eef7ef]">
        <div className="mx-auto w-full max-w-6xl overflow-x-hidden px-3 py-4 sm:px-6 sm:py-8">
          <div className="animate-pulse rounded-3xl border border-[#356046]/30 bg-[#17130f] p-8">
            <div className="h-8 w-48 rounded bg-[#2a2219]" />
            <div className="mt-6 h-5 w-72 rounded bg-[#2a2219]" />
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <div className="h-56 rounded-2xl bg-[#2a2219]" />
              <div className="h-56 rounded-2xl bg-[#2a2219]" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (pageError) {
    return (
      <main className="min-h-screen bg-[#0d1611] text-[#eef7ef]">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="rounded-3xl border border-red-500/30 bg-[#17130f] p-8">
            <div className="mb-4 flex items-center gap-4">
              <Image
                src="/eomlogo.png"
                alt="Estate of Mind logo"
                width={64}
                height={64}
                className="h-16 w-auto object-contain"
              />
              <div>
                <h1 className="text-2xl font-semibold text-[#eef7ef]">Gulera OS Grounds</h1>
                <p className="text-sm text-[#a9c9b0]">Estate of Mind Property Management</p>
              </div>
            </div>

            <p className="rounded-2xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200">
              {pageError}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0d1611] text-[#eef7ef]">
      <div className="mx-auto w-full max-w-6xl overflow-x-hidden px-3 py-4 sm:px-6 sm:py-8">
        <div className="overflow-hidden rounded-3xl border border-[#356046]/35 bg-[linear-gradient(180deg,#17130f_0%,#100d09_100%)] shadow-2xl">
          <div className="border-b border-[#356046]/25 px-4 py-5 sm:px-6 sm:py-6 md:px-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <Image
                  src="/eomlogo.png"
                  alt="Estate of Mind logo"
                  width={84}
                  height={84}
                  className="h-14 w-auto object-contain sm:h-16 md:h-20"
                  priority
                />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.25em] text-[#7fb685]">
                    Grounds Portal
                  </p>
                  <h1 className="mt-1 break-words text-lg font-semibold text-[#f2fbf4] sm:text-2xl md:text-3xl">
                    Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}
                  </h1>
                  <p className="mt-1 break-words text-sm text-[#a9c9b0]">
                    {groundsAccount?.display_name
                      ? `Account: ${groundsAccount.display_name}`
                      : "Your assigned jobs, access notes, and SOPs."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                {canSwitchToCleaner ? (
                  <button
                    onClick={handleSwitchToCleaner}
                    className="rounded-full border border-[#b08b47]/70 px-5 py-2 text-sm font-medium text-[#f5efe4] transition hover:bg-[#1f1812]"
                  >
                    {cleanerWaitingCount > 0
                      ? `Switch to Cleaner (${cleanerWaitingCount})`
                      : "Switch to Cleaner"}
                  </button>
                ) : null}

                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="rounded-full border border-[#7fb685]/70 px-5 py-2 text-sm font-medium text-[#eef7ef] transition hover:bg-[#7fb685] hover:text-[#120f0b] disabled:opacity-50"
                >
                  {signingOut ? "Signing out..." : "Sign out"}
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-4 py-5 sm:px-6 sm:py-6 md:px-8">
            {profile?.role === "pending" && (
              <section className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5">
                <h2 className="text-lg font-semibold text-[#eef7ef]">Account awaiting approval</h2>
                <p className="mt-2 text-sm text-[#e6d8be]">
                  Your account has been created, but admin approval is still needed before full
                  grounds access is granted.
                </p>
              </section>
            )}

            {accountWarning && (
              <section className="rounded-2xl border border-amber-500/25 bg-amber-950/20 p-4 text-sm text-[#e6d8be]">
                {accountWarning}
              </section>
            )}

            {canSwitchToCleaner ? (
              <section className="rounded-2xl border border-[#b08b47]/30 bg-[#1b1611] p-4 text-[#f5efe4]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-[#d8c7ab]">Cleaner Access</p>
                    <p className="mt-1 text-sm text-[#e6d8be]">
                      {cleanerWaitingCount > 0
                        ? `You also have ${cleanerWaitingCount} cleaner job${cleanerWaitingCount === 1 ? "" : "s"} waiting.`
                        : "You are also linked to the Cleaner portal."}
                    </p>
                  </div>

                  <button
                    onClick={handleSwitchToCleaner}
                    className="rounded-full border border-[#b08b47]/60 px-4 py-2 text-sm font-medium text-[#f5efe4] transition hover:bg-[#241c15]"
                  >
                    {cleanerWaitingCount > 0 ? "View cleaner jobs" : "Open Cleaner"}
                  </button>
                </div>
              </section>
            ) : null}

            {unacceptedCount > 0 && (
              <section className="sticky top-0 z-40 rounded-2xl border border-red-400/60 bg-red-600 p-4 text-white shadow-[0_0_28px_rgba(239,68,68,0.28)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-red-100">
                      Immediate Attention Needed
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      🚨 {unacceptedCount} job{unacceptedCount === 1 ? "" : "s"} waiting for your
                      response
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      if (unacceptedJobs[0]) {
                        setSelectedSlotId(unacceptedJobs[0].slot.id);
                      }
                      setJobView("active");
                      scrollToJobsSection();
                    }}
                    className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
                  >
                    View urgent jobs
                  </button>
                </div>
              </section>
            )}

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-[#356046]/25 bg-[#14221a] p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#7fb685]">Assigned Properties</p>
                <p className="mt-3 text-3xl font-semibold text-[#f2fbf4]">{properties.length}</p>
              </div>

              <div
                className={`rounded-2xl border p-5 ${unacceptedCount > 0
                  ? "border-red-500/60 bg-[linear-gradient(180deg,rgba(90,18,18,0.78)_0%,rgba(21,17,13,1)_100%)] shadow-[0_0_28px_rgba(239,68,68,0.16)]"
                  : "border-[#356046]/25 bg-[#14221a]"
                  }`}
              >
                <p className="text-xs uppercase tracking-[0.2em] text-[#7fb685]">Jobs Waiting</p>
                <p className="mt-3 text-3xl font-semibold text-[#f2fbf4]">{unacceptedCount}</p>
              </div>

              <div className="rounded-2xl border border-[#356046]/25 bg-[#14221a] p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#7fb685]">Visible Slots</p>
                <p className="mt-3 text-3xl font-semibold text-[#f2fbf4]">{filteredJobs.length}</p>
              </div>

              <div className="rounded-2xl border border-[#356046]/25 bg-[#14221a] p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#7fb685]">Grounds Account</p>
                <p className="mt-3 text-lg font-semibold text-[#f2fbf4]">
                  {groundsAccount?.display_name || "Not linked"}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-[#356046]/25 bg-[#14221a] p-3 sm:p-5">
              <div className="mb-5 space-y-3">
                <div>
                  <h2 className="text-xl font-semibold text-[#f2fbf4]">Cleaning Calendar</h2>
                  <p className="mt-1 text-sm text-[#b9d3c0]">
                    Tap a date to filter jobs for that day.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#356046]/20 bg-[#0f1b14] p-3">
                  <div className="text-center text-sm font-medium text-[#f2fbf4]">
                    {formatMonthLabel(calendarMonth)}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() =>
                        setCalendarMonth(
                          new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                        )
                      }
                      className="rounded-full border border-[#356046]/40 px-3 py-2 text-sm text-[#eef7ef] hover:bg-[#173022]"
                    >
                      Prev
                    </button>

                    <button
                      onClick={() =>
                        setCalendarMonth(
                          new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                        )
                      }
                      className="rounded-full border border-[#356046]/40 px-3 py-2 text-sm text-[#eef7ef] hover:bg-[#173022]"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>

              <div className="mb-3 hidden grid-cols-7 gap-2 text-center text-xs uppercase tracking-[0.16em] text-[#7fb685] sm:grid">
                <div>Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
                {calendarDays.map((day) => {
                  const ymd = toYmd(day);
                  const dayJobs = jobsByDate.get(ymd) || [];
                  const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                  const isSelected = selectedDate === ymd;
                  const isToday = ymd === toYmd(new Date());
                  const hasUnacceptedOnDay = dayJobs.some(
                    (item) => (item.slot.status || "").toLowerCase().trim() === "offered"
                  );

                  return (
                    <div
                      key={ymd}
                      className={[
                        "min-h-[88px] rounded-2xl border p-2 sm:min-h-[120px]",
                        isSelected
                          ? "border-[#7fb685] bg-[#221a13]"
                          : hasUnacceptedOnDay
                            ? "border-red-500/50 bg-[linear-gradient(180deg,rgba(68,16,16,0.58)_0%,rgba(16,13,10,1)_100%)]"
                            : "border-[#356046]/20 bg-[#0f1b14]",
                        !isCurrentMonth ? "opacity-45" : "",
                      ].join(" ")}
                    >
                      <button
                        onClick={() => handleDateClick(ymd)}
                        className="flex w-full items-start justify-between rounded-xl px-1 py-1 text-left"
                      >
                        <span
                          className={[
                            "text-sm font-medium",
                            isToday ? "text-[#e7c98a]" : "text-[#f2fbf4]",
                          ].join(" ")}
                        >
                          {day.getDate()}
                        </span>

                        {dayJobs.length > 0 && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] ${hasUnacceptedOnDay
                              ? "bg-red-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.28)]"
                              : "bg-[#7fb685]/15 text-[#e7c98a]"
                              }`}
                          >
                            {dayJobs.length}
                          </span>
                        )}
                      </button>

                      <div className="mt-2 space-y-1.5">
                        {dayJobs.slice(0, 3).map((item) => {
                          const property = properties.find((p) => p.id === item.job.property_id);
                          const isJobSelected = selectedSlotId === item.slot.id;
                          const tone = getStatusTone(item.slot.status, item.job.staffing_status);
                          const waiting = (item.slot.status || "").toLowerCase().trim() === "offered";

                          return (
                            <button
                              key={item.slot.id}
                              onClick={() => handleJobClick(item.slot.id)}
                              className={[
                                "block w-full truncate rounded-lg px-2 py-1.5 text-left text-[11px] transition",
                                isJobSelected
                                  ? "bg-[#7fb685] text-[#120f0b]"
                                  : waiting
                                    ? "bg-red-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.25)] animate-pulse"
                                    : "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/25",
                              ].join(" ")}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                                <span>{property?.name || "Property"}</span>
                              </span>
                            </button>
                          );
                        })}

                        {dayJobs.length > 3 && (
                          <button
                            onClick={() => handleDateClick(ymd)}
                            className="text-[11px] text-[#bfa67b]"
                          >
                            +{dayJobs.length - 3} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    setSelectedDate(null);
                    setSelectedSlotId(unacceptedJobs[0]?.slot.id ?? null);
                    setJobsCollapsed(false);
                    setJobView("active");
                  }}
                  className="rounded-full border border-[#356046]/40 px-4 py-2 text-sm text-[#eef7ef] hover:bg-[#173022]"
                >
                  Show all jobs
                </button>

                {selectedDateLabel && (
                  <div className="rounded-full border border-[#7fb685]/30 bg-[#7fb685]/10 px-4 py-2 text-sm text-[#e7c98a]">
                    Filtering: {selectedDateLabel}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-[#356046]/25 bg-[#14221a] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[#f2fbf4]">
                    Jobs {selectedDateLabel ? `for ${selectedDateLabel}` : ""}
                  </h2>
                  <p className="mt-1 text-sm text-[#b9d3c0]">
                    {jobView === "active"
                      ? jobsCollapsed
                        ? "Active Jobs is the default view. Expand to see the full active schedule."
                        : "Showing all active and urgent jobs."
                      : "History is a separate view for past jobs only."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex rounded-full border border-[#7fb685]/35 bg-[#0f1b14] p-1">
                    <button
                      onClick={() => setJobView("active")}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${jobView === "active"
                        ? "bg-[#7fb685] text-[#120f0b]"
                        : "text-[#eef7ef] hover:bg-[#173022]"
                        }`}
                    >
                      Active Jobs ({activeJobs.length})
                    </button>

                    <button
                      onClick={() => setJobView("history")}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${jobView === "history"
                        ? "bg-[#7fb685] text-[#120f0b]"
                        : "text-[#eef7ef] hover:bg-[#173022]"
                        }`}
                    >
                      Job History ({historyJobs.length})
                    </button>
                  </div>

                  {jobView === "active" && (
                    <button
                      onClick={() => setJobsCollapsed((current) => !current)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#7fb685]/45 bg-[#173022] px-4 py-2 text-sm text-[#eef7ef] hover:bg-[#1f3a2a]"
                    >
                      <span>{jobsCollapsed ? "Expand jobs" : "Collapse jobs"}</span>
                      <span>{jobsCollapsed ? "▼" : "▲"}</span>
                    </button>
                  )}
                </div>
              </div>

              {jobsWarning && (
                <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3 text-sm text-[#e6d8be]">
                  {jobsWarning}
                </p>
              )}

              <div className="mt-4">
                {jobView === "active" && jobsCollapsed ? (
                  <div className="mb-4 rounded-2xl border border-[#7fb685]/20 bg-[#110d09] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#7fb685]/35 bg-[#7fb685]/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-[#e7c98a]">
                        Active View
                      </span>

                      {collapsedPreviewJob && (
                        <span
                          className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em] ${(collapsedPreviewJob.slot.status || "").toLowerCase().trim() === "offered"
                            ? "border border-red-400/70 bg-red-500 text-white animate-pulse"
                            : "border border-sky-400/25 bg-sky-400/10 text-sky-200"
                            }`}
                        >
                          {(collapsedPreviewJob.slot.status || "").toLowerCase().trim() === "offered"
                            ? "Needs Response"
                            : "Next Upcoming Job"}
                        </span>
                      )}

                      {hiddenJobsCount > 0 && (
                        <span className="rounded-full border border-[#356046]/30 bg-[#1a140f] px-3 py-1 text-xs text-[#d8c7ab]">
                          {hiddenJobsCount} more scheduled job{hiddenJobsCount === 1 ? "" : "s"} hidden
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mb-4 rounded-2xl border border-[#7fb685]/20 bg-[#110d09] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#7fb685]/35 bg-[#7fb685]/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-[#e7c98a]">
                        {jobView === "active" ? "Active View" : "History View"}
                      </span>
                      <span className="rounded-full border border-[#356046]/30 bg-[#1a140f] px-3 py-1 text-xs text-[#d8c7ab]">
                        {visibleJobs.length} visible job{visibleJobs.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                )}

                {jobView === "active" ? (
                  jobsCollapsed ? (
                    collapsedPreviewJob ? (
                      <JobCard
                        item={collapsedPreviewJob}
                        isSelected={selectedSlotId === collapsedPreviewJob.slot.id}
                        propertyName={
                          properties.find((p) => p.id === collapsedPreviewJob.job.property_id)?.name ||
                          "Property job"
                        }
                        propertyAddress={
                          properties.find((p) => p.id === collapsedPreviewJob.job.property_id)?.address ||
                          "No property address"
                        }
                        onClick={() => handleJobClick(collapsedPreviewJob.slot.id)}
                        tone={getStatusTone(
                          collapsedPreviewJob.slot.status,
                          collapsedPreviewJob.job.staffing_status
                        )}
                        waiting={
                          (collapsedPreviewJob.slot.status || "").toLowerCase().trim() === "offered"
                        }
                        remainingMs={
                          (collapsedPreviewJob.slot.status || "").toLowerCase().trim() === "offered"
                            ? getTimeRemainingMs(collapsedPreviewJob, now)
                            : null
                        }
                        countdownTone={getCountdownTone(
                          (collapsedPreviewJob.slot.status || "").toLowerCase().trim() === "offered"
                            ? getTimeRemainingMs(collapsedPreviewJob, now)
                            : null
                        )}
                        formatDateLabel={formatDateLabel}
                        formatDateTimeLabel={formatDateTimeLabel}
                        formatRemaining={formatRemaining}
                        getSlotDisplayStatus={getSlotDisplayStatus}
                        getTeamMessage={getTeamMessage}
                        selectedJobProperty={
                          selectedGroundsJob?.slot.id === collapsedPreviewJob.slot.id
                            ? selectedJobProperty
                            : properties.find((p) => p.id === collapsedPreviewJob.job.property_id) || null
                        }
                        selectedJobAccess={
                          selectedGroundsJob?.slot.id === collapsedPreviewJob.slot.id ? selectedJobAccess : null
                        }
                        selectedJobSops={
                          selectedGroundsJob?.slot.id === collapsedPreviewJob.slot.id ? selectedJobSops : []
                        }
                        sopImagesBySopId={sopImagesBySopId}
                        actionLoading={actionLoading}
                        handleAcceptJob={handleAcceptJob}
                        handleDeclineJob={handleDeclineJob}
                        handleCloseDetails={handleCloseDetails}
                        availableProperties={properties}
                        currentProfileId={profile?.id || null}
                      />
                    ) : (
                      <p className="text-sm text-[#b9d3c0]">
                        {selectedDate ? "No active jobs for that date." : "No active jobs assigned yet."}
                      </p>
                    )
                  ) : (
                    renderJobList(
                      activeJobs,
                      selectedDate ? "No active jobs for that date." : "No active jobs assigned yet."
                    )
                  )
                ) : (
                  renderJobList(
                    historyJobs,
                    selectedDate ? "No history jobs for that date." : "No job history yet."
                  )
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
