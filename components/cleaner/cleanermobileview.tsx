"use client";

import { useMemo, useState } from "react";
import type { CleanerJob, CleanerViewProps } from "@/components/cleaner/cleanershell";

type ParsedNotes = {
  source: string | null;
  sourceLabel: string | null;
  guest: string | null;
  checkoutDate: string | null;
  summary: string[];
  details: string[];
};

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
  const [jobView, setJobView] = useState<"active" | "history">("active");

  function normalizeJobDate(value: string | null | undefined) {
    if (!value) return null;
    return value.slice(0, 10);
  }

  function isOffered(status: string | null | undefined) {
    return (status || "").toLowerCase().trim() === "offered";
  }

  function isAccepted(status: string | null | undefined) {
    return (status || "").toLowerCase().trim() === "accepted";
  }

  function isDeclined(status: string | null | undefined) {
    return (status || "").toLowerCase().trim() === "declined";
  }

  function handleCardTap(slotId: string) {
    setSelectedSlotId((current) => (current === slotId ? null : slotId));
  }

  async function onDeclineClick() {
    const confirmed = window.confirm("Are you sure you want to decline this job?");
    if (!confirmed) return;
    await handleDeclineJob();
  }

  function getCalendarUrl(jobId: string) {
    return `/api/cleaner-calendar-event?jobId=${encodeURIComponent(jobId)}`;
  }

  function getParsedNotes(notes: string | null): ParsedNotes {
    const cleanedLines = notes
      ? notes
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .filter((line) => !/^\[AUTO_SYNC:/i.test(line))
          .filter((line) => !/^Auto-created from .*calendar sync\.?$/i.test(line))
      : [];

    const sourceMatch = cleanedLines.find((line) => /^Source\s*:/i.test(line));
    const guestMatch = cleanedLines.find((line) => /^Guest\s*\/\s*reservation\s*:/i.test(line));
    const checkoutMatch = cleanedLines.find((line) => /^Checkout date\s*:/i.test(line));

    const source = sourceMatch?.replace(/^Source\s*:\s*/i, "").trim() || null;
    const guest = guestMatch?.replace(/^Guest\s*\/\s*reservation\s*:\s*/i, "").trim() || null;
    const checkoutDate = checkoutMatch?.replace(/^Checkout date\s*:\s*/i, "").trim() || null;

    const normalizedSource = source?.toLowerCase() || null;
    let sourceLabel: string | null = null;

    if (normalizedSource?.includes("airbnb")) sourceLabel = "Airbnb";
    else if (normalizedSource?.includes("vrbo")) sourceLabel = "VRBO";
    else if (source) sourceLabel = source;

    const remainingDetails = cleanedLines.filter(
      (line) =>
        !/^Property\s*:/i.test(line) &&
        !/^Guest\s*\/\s*reservation\s*:/i.test(line) &&
        !/^Checkout date\s*:/i.test(line) &&
        !/^Source\s*:/i.test(line)
    );

    const summary: string[] = [];
    if (guest) summary.push(guest);
    if (checkoutDate) summary.push(`Checkout ${checkoutDate}`);

    return {
      source,
      sourceLabel,
      guest,
      checkoutDate,
      summary,
      details: remainingDetails,
    };
  }

  function formatShort(ymd: string) {
    const [year, month, day] = ymd.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
    });
  }

  function getPropertyName(item: CleanerJob, selected: boolean) {
    if (selected && selectedCleanerJob?.slot.id === item.slot.id) {
      return selectedJobProperty?.name || "Property";
    }

    const match = properties.find((property) => property.id === item.job.property_id);
    return match?.name || "Property";
  }

  function getPropertyAddress(item: CleanerJob, selected: boolean) {
    if (selected && selectedCleanerJob?.slot.id === item.slot.id) {
      return selectedJobProperty?.address || "";
    }

    const match = properties.find((property) => property.id === item.job.property_id);
    return match?.address || "";
  }

  function getAccentClasses(item: CleanerJob) {
    const slot = (item.slot.status || "").toLowerCase().trim();
    const staffing = (item.job.staffing_status || "").toLowerCase().trim();

    if (slot === "accepted") {
      return {
        rail: "before:bg-emerald-400/90",
        glow: "shadow-[0_10px_30px_rgba(16,185,129,0.08)]",
      };
    }

    if (slot === "offered" || staffing === "stranded") {
      return {
        rail: "before:bg-red-400/95",
        glow: "shadow-[0_14px_36px_rgba(239,68,68,0.12)]",
      };
    }

    if (slot === "declined") {
      return {
        rail: "before:bg-[#7f7366]",
        glow: "shadow-[0_10px_28px_rgba(0,0,0,0.16)]",
      };
    }

    return {
      rail: "before:bg-[#b08b47]",
      glow: "shadow-[0_10px_28px_rgba(0,0,0,0.16)]",
    };
  }

  function renderSourceBadge(sourceLabel: string | null) {
    if (!sourceLabel) return null;

    return (
      <span className="inline-flex items-center rounded-full border border-[#8f7441]/35 bg-[#1a140f] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#ddc089]">
        {sourceLabel}
      </span>
    );
  }

  function renderMetaPill(label: string) {
    return (
      <span className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-[#d4c4a8]">
        {label}
      </span>
    );
  }

  const today = new Date();

  const dateStrip = useMemo(() => {
    return Array.from(
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
  }, [activeJobs, toYmd]);

  const visibleJobs =
    jobView === "history"
      ? selectedDate
        ? historyJobs.filter((item) => normalizeJobDate(item.jobDate) === selectedDate)
        : historyJobs
      : selectedDate
        ? activeJobs.filter((item) => normalizeJobDate(item.jobDate) === selectedDate)
        : activeJobs;

  function renderJobList(items: CleanerJob[], emptyText: string) {
    if (items.length === 0) {
      return (
        <div className="rounded-[24px] border border-[#2b2118] bg-[#12100d] px-4 py-5 text-sm text-[#bcae95]">
          {emptyText}
        </div>
      );
    }

    return items.map((item) => {
      const tone = getStatusTone(item.slot.status, item.job.staffing_status);
      const isSelected = selectedSlotId === item.slot.id;
      const propertyName = getPropertyName(item, isSelected);
      const propertyAddress = getPropertyAddress(item, isSelected);
      const parsedNotes = getParsedNotes(item.job.notes);
      const accent = getAccentClasses(item);
      const displayDate = formatDateLabel(normalizeJobDate(item.jobDate));
      const statusLabel = getSlotDisplayStatus(item.slot.status, item.job.staffing_status);
      const teamMessage = getTeamMessage(item);
      const selectedThisCard = isSelected && selectedCleanerJob?.slot.id === item.slot.id;

      return (
        <article
          key={item.slot.id}
          className={[
            "relative overflow-hidden rounded-[26px] border border-[#2b2118] bg-[linear-gradient(180deg,#17130f_0%,#110f0c_100%)]",
            "before:absolute before:bottom-0 before:left-0 before:top-0 before:w-[3px]",
            "transition-all duration-200",
            accent.rail,
            accent.glow,
            isSelected ? "ring-1 ring-[#d8ba7a]/45" : "",
          ].join(" ")}
        >
          <button
            type="button"
            onClick={() => handleCardTap(item.slot.id)}
            className="block w-full px-4 pb-4 pt-4 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {renderSourceBadge(parsedNotes.sourceLabel)}
                  {isAccepted(item.slot.status) ? renderMetaPill("Accepted") : null}
                  {isDeclined(item.slot.status) ? renderMetaPill("Declined") : null}
                </div>

                <h3 className="mt-3 pr-2 text-[17px] font-semibold leading-tight tracking-[-0.01em] text-[#f6efe4]">
                  {propertyName}
                </h3>

                {propertyAddress ? (
                  <p className="mt-1 line-clamp-1 text-[12px] text-[#8f8373]">{propertyAddress}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#d7c6a8]">
                  <span>{displayDate}</span>
                  <span className="text-[#6e6254]">•</span>
                  <span>{teamMessage}</span>
                </div>
              </div>

              <span
                className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${tone.badge}`}
              >
                {statusLabel}
              </span>
            </div>

            {(parsedNotes.summary.length > 0 || parsedNotes.details.length > 0) && (
              <div className="mt-4 rounded-[20px] border border-white/6 bg-white/[0.025] px-3.5 py-3">
                {parsedNotes.summary.length > 0 ? (
                  <div className="space-y-1.5">
                    {parsedNotes.summary.slice(0, 2).map((line, index) => (
                      <p key={index} className="text-[13px] leading-relaxed text-[#ebe0cc]">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] leading-relaxed text-[#bcae95]">
                    Open for full cleaning details.
                  </p>
                )}

                {parsedNotes.details.length > 0 ? (
                  <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-[#9f937f]">
                    {parsedNotes.details.join(" • ")}
                  </p>
                ) : null}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#8d7b62]">
                {isSelected ? "Tap to collapse" : "Tap to expand"}
              </div>

              <div
                className={`h-8 w-8 rounded-full border border-[#3a2c1c] bg-[#17120e] text-[#dabb82] transition ${
                  isSelected ? "rotate-180" : ""
                } flex items-center justify-center`}
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  className="h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M5 8L10 13L15 8"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </button>

          {selectedThisCard ? (
            <section className="border-t border-[#241c15] px-4 pb-4 pt-4">
              <div className="space-y-4">
                <div className="rounded-[22px] border border-[#2a2118] bg-[#0f0d0b]/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a845e]">
                        Assigned cleaning
                      </div>
                      <h2 className="mt-2 text-[18px] font-semibold leading-tight text-[#f6efe4]">
                        {selectedJobProperty?.name || propertyName}
                      </h2>
                      <p className="mt-1 text-[13px] leading-relaxed text-[#a99982]">
                        {selectedJobProperty?.address || propertyAddress || "No property address"}
                      </p>
                    </div>

                    {renderSourceBadge(parsedNotes.sourceLabel)}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <div className="flex items-start justify-between gap-4 border-b border-white/6 pb-2.5">
                      <span className="text-[12px] text-[#8f8373]">Cleaning date</span>
                      <span className="text-right text-[13px] text-[#f2e6d2]">
                        {formatDateLabel(normalizeJobDate(selectedCleanerJob.jobDate))}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-4 border-b border-white/6 pb-2.5">
                      <span className="text-[12px] text-[#8f8373]">Status</span>
                      <span className="text-right text-[13px] text-[#f2e6d2]">
                        {getSlotDisplayStatus(
                          selectedCleanerJob.slot.status,
                          selectedCleanerJob.job.staffing_status
                        )}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-4">
                      <span className="text-[12px] text-[#8f8373]">Team</span>
                      <span className="text-right text-[13px] text-[#f2e6d2]">
                        {getTeamMessage(selectedCleanerJob)}
                      </span>
                    </div>
                  </div>
                </div>

                {(parsedNotes.guest || parsedNotes.checkoutDate || parsedNotes.details.length > 0) && (
                  <div className="rounded-[22px] border border-[#2a2118] bg-[#14110d] p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a845e]">
                      Stay details
                    </div>

                    <div className="mt-3 space-y-3">
                      {parsedNotes.guest ? (
                        <div className="flex items-start justify-between gap-4 border-b border-white/6 pb-2.5">
                          <span className="text-[12px] text-[#8f8373]">Guest</span>
                          <span className="text-right text-[13px] text-[#f2e6d2]">
                            {parsedNotes.guest}
                          </span>
                        </div>
                      ) : null}

                      {parsedNotes.checkoutDate ? (
                        <div className="flex items-start justify-between gap-4 border-b border-white/6 pb-2.5">
                          <span className="text-[12px] text-[#8f8373]">Checkout</span>
                          <span className="text-right text-[13px] text-[#f2e6d2]">
                            {parsedNotes.checkoutDate}
                          </span>
                        </div>
                      ) : null}

                      {parsedNotes.details.length > 0 ? (
                        <div>
                          <div className="text-[12px] text-[#8f8373]">Notes</div>
                          <div className="mt-2 space-y-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[#e7dcc8]">
                            {parsedNotes.details.map((line, index) => (
                              <p key={`detail-${index}`}>{line}</p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                <div className="rounded-[22px] border border-[#2a2118] bg-[#14110d] p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a845e]">
                    Access
                  </div>

                  <div className="mt-3 space-y-3">
                    <div className="flex items-start justify-between gap-4 border-b border-white/6 pb-2.5">
                      <span className="text-[12px] text-[#8f8373]">Door code</span>
                      <span className="text-right text-[13px] text-[#f2e6d2]">
                        {selectedJobAccess?.door_code || "Not added"}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-4 border-b border-white/6 pb-2.5">
                      <span className="text-[12px] text-[#8f8373]">Alarm code</span>
                      <span className="text-right text-[13px] text-[#f2e6d2]">
                        {selectedJobAccess?.alarm_code || "Not added"}
                      </span>
                    </div>

                    <div>
                      <div className="text-[12px] text-[#8f8373]">Notes</div>
                      <div className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[#e7dcc8]">
                        {selectedJobAccess?.notes || "No access notes."}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[22px] border border-[#2a2118] bg-[#14110d] p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a845e]">
                    Activity
                  </div>

                  <div className="mt-3 space-y-3">
                    <div className="flex items-start justify-between gap-4 border-b border-white/6 pb-2.5">
                      <span className="text-[12px] text-[#8f8373]">Offered</span>
                      <span className="text-right text-[13px] text-[#f2e6d2]">
                        {formatDateTimeLabel(selectedCleanerJob.slot.offered_at)}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-4 border-b border-white/6 pb-2.5">
                      <span className="text-[12px] text-[#8f8373]">Accepted</span>
                      <span className="text-right text-[13px] text-[#f2e6d2]">
                        {formatDateTimeLabel(selectedCleanerJob.slot.accepted_at)}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-4">
                      <span className="text-[12px] text-[#8f8373]">Declined</span>
                      <span className="text-right text-[13px] text-[#f2e6d2]">
                        {formatDateTimeLabel(selectedCleanerJob.slot.declined_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedJobSops.length > 0 ? (
                  <div className="rounded-[22px] border border-[#2a2118] bg-[#14110d] p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a845e]">
                      SOPs
                    </div>

                    <div className="mt-3 space-y-3">
                      {selectedJobSops.map((sop) => {
                        const images = sopImagesBySopId.get(sop.id) || [];

                        return (
                          <div
                            key={sop.id}
                            className="overflow-hidden rounded-[18px] border border-white/6 bg-[#100d0a]"
                          >
                            <div className="px-3.5 py-3">
                              <div className="text-[14px] font-medium text-[#f5efe4]">
                                {sop.title || "Untitled SOP"}
                              </div>

                              <div className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[#cdbda0]">
                                {sop.content || "No SOP notes."}
                              </div>
                            </div>

                            {images.length > 0 ? (
                              <div className="grid grid-cols-2 gap-0.5 border-t border-white/6 bg-white/5">
                                {images.map((image) => (
                                  <a
                                    key={image.id}
                                    href={image.image_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block bg-[#14110d]"
                                  >
                                    <img
                                      src={image.image_url}
                                      alt={image.caption || sop.title || "SOP image"}
                                      className="h-28 w-full object-cover"
                                    />
                                    {image.caption ? (
                                      <div className="px-2.5 py-2 text-[11px] text-[#bcae95]">
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

                <div className="grid grid-cols-1 gap-2 pt-1">
                  {isOffered(selectedCleanerJob.slot.status) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleAcceptJob()}
                        disabled={actionLoading !== null}
                        className="flex min-h-[48px] items-center justify-center rounded-[18px] border border-emerald-400/20 bg-[linear-gradient(180deg,rgba(16,185,129,0.26)_0%,rgba(16,185,129,0.16)_100%)] px-4 text-[14px] font-semibold text-emerald-100 transition hover:border-emerald-300/30 hover:bg-[linear-gradient(180deg,rgba(16,185,129,0.34)_0%,rgba(16,185,129,0.18)_100%)] disabled:opacity-50"
                      >
                        {actionLoading === "accept" ? "Accepting..." : "Accept Job"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void onDeclineClick()}
                        disabled={actionLoading !== null}
                        className="flex min-h-[48px] items-center justify-center rounded-[18px] border border-red-400/20 bg-[linear-gradient(180deg,rgba(239,68,68,0.20)_0%,rgba(239,68,68,0.10)_100%)] px-4 text-[14px] font-medium text-red-100 transition hover:border-red-300/30 hover:bg-[linear-gradient(180deg,rgba(239,68,68,0.28)_0%,rgba(239,68,68,0.14)_100%)] disabled:opacity-50"
                      >
                        {actionLoading === "decline" ? "Declining..." : "Decline Job"}
                      </button>
                    </>
                  ) : null}

                  {isAccepted(selectedCleanerJob.slot.status) ? (
                    <a
                      href={getCalendarUrl(selectedCleanerJob.job.id)}
                      className="flex min-h-[48px] items-center justify-center rounded-[18px] border border-[#8f7441]/30 bg-[#19130e] px-4 text-[14px] font-medium text-[#f4e6cc] transition hover:bg-[#211912]"
                    >
                      Add to Calendar
                    </a>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleCloseDetails}
                    className="flex min-h-[46px] items-center justify-center rounded-[18px] border border-[#31261b] bg-[#110e0b] px-4 text-[13px] font-medium text-[#d7c6a8] transition hover:bg-[#18130f]"
                  >
                    Close Details
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </article>
      );
    });
  }

  return (
    <main className="min-h-screen bg-[#0b0a08] px-3 pb-5 pt-4 text-[#f5efe4]">
      <div className="mx-auto max-w-md space-y-4">
        <section className="overflow-hidden rounded-[28px] border border-[#2a2118] bg-[linear-gradient(180deg,#17130f_0%,#100d0a_100%)] shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <div className="border-b border-[#241c15] px-4 pb-4 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.2em] text-[#987f59]">
                  Estate of Mind
                </div>
                <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-[#f7efe3]">
                  Cleaner Board
                </h1>
                <p className="mt-1 text-[13px] leading-relaxed text-[#a99982]">
                  Clean, focused view of upcoming work and completed jobs.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="shrink-0 rounded-full border border-[#8f7441]/40 bg-[#15110d] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f2e6d2] transition hover:bg-[#211912] disabled:opacity-50"
              >
                {signingOut ? "Signing out..." : "Logout"}
              </button>
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="rounded-[20px] border border-white/6 bg-white/[0.025] px-3.5 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#8f7a57]">
                Logged in
              </div>
              <div className="mt-2 text-[15px] font-medium text-[#f5efe4]">
                {profile?.full_name || cleanerAccount?.display_name || "Cleaner"}
              </div>
              <div className="mt-1 break-all text-[12px] text-[#a99982]">
                {profile?.email || "No email available"}
              </div>
              {cleanerAccount?.display_name ? (
                <div className="mt-2 text-[12px] text-[#cab28a]">
                  Account: {cleanerAccount.display_name}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-[#2a2118] bg-[#100d0a] p-1">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setJobView("active")}
              className={`rounded-[18px] px-4 py-3 text-[13px] font-semibold transition ${
                jobView === "active"
                  ? "bg-[#cfb17a] text-[#120f0b]"
                  : "text-[#e8dcc8] hover:bg-[#17120e]"
              }`}
            >
              Active
              <span className="ml-1 opacity-80">({activeJobs.length})</span>
              {unacceptedCount > 0 ? (
                <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] text-white">
                  {unacceptedCount}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setJobView("history")}
              className={`rounded-[18px] px-4 py-3 text-[13px] font-semibold transition ${
                jobView === "history"
                  ? "bg-[#cfb17a] text-[#120f0b]"
                  : "text-[#e8dcc8] hover:bg-[#17120e]"
              }`}
            >
              History
              <span className="ml-1 opacity-80">({historyJobs.length})</span>
            </button>
          </div>
        </section>

        {jobView === "active" ? (
          <section className="space-y-2">
            <div className="px-1 text-[11px] uppercase tracking-[0.18em] text-[#8f7a57]">
              Quick dates
            </div>

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
                    className={`min-w-[78px] rounded-[18px] border px-3 py-3 text-center transition ${
                      isSelected
                        ? "border-[#d9bb7b] bg-[#241b13] text-white ring-1 ring-[#d9bb7b]"
                        : hasOffered
                          ? "border-red-500/50 bg-red-950/40 text-white"
                          : allAccepted
                            ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-100"
                            : "border-[#2a2118] bg-[#120f0c] text-[#f5efe4]"
                    }`}
                  >
                    <div className="text-[12px] font-medium">{formatShort(ymd)}</div>
                    <div className="mt-1 text-[10px] text-[#b8a88e]">
                      {jobsForDay.length > 0
                        ? `${jobsForDay.length} job${jobsForDay.length === 1 ? "" : "s"}`
                        : "—"}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="rounded-[24px] border border-[#2a2118] bg-[#12100d] px-4 py-4 text-sm text-[#bcae95]">
            Past jobs are separated here so the active list stays focused.
          </div>
        )}

        <section className="space-y-3">
          {jobView === "active"
            ? renderJobList(
                visibleJobs,
                selectedDate ? "No active jobs for that date." : "No active jobs assigned yet."
              )
            : renderJobList(
                visibleJobs,
                selectedDate ? "No history jobs for that date." : "No job history yet."
              )}
        </section>
      </div>
    </main>
  );
}