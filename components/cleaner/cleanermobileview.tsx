"use client";

import type { CleanerViewProps } from "@/components/cleaner/cleanershell";

export default function CleanerMobileView({
  cleanerJobs,
  selectedCleanerJob,
  selectedSlotId,
  setSelectedSlotId,
  handleAcceptJob,
  handleDeclineJob,
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
}: CleanerViewProps) {
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
        ...cleanerJobs
          .map((item) => normalizeJobDate(item.jobDate))
          .filter((value): value is string => Boolean(value)),
      ].sort()
    )
  ).slice(0, 7);

  const visibleJobs = selectedDate
    ? cleanerJobs.filter((item) => normalizeJobDate(item.jobDate) === selectedDate)
    : cleanerJobs;

  function formatShort(ymd: string) {
    const [year, month, day] = ymd.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
    });
  }

  function openJob(slotId: string) {
    setSelectedSlotId(slotId);
  }

  return (
    <main className="min-h-screen bg-[#0f0d0a] px-3 py-4 text-[#f5efe4]">
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl border border-[#7a5c2e]/30 bg-[#15110d] p-4">
          <h1 className="text-xl font-semibold">Cleaner Jobs</h1>
          <p className="text-sm text-[#cdbda0]">Tap a job to view details</p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {dateStrip.map((ymd) => {
            const jobsForDay = cleanerJobs.filter(
              (item) => normalizeJobDate(item.jobDate) === ymd
            );

            const hasOffered = jobsForDay.some(
              (item) => (item.slot.status || "").toLowerCase().trim() === "offered"
            );

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
                  if (first) {
                    setSelectedSlotId(first.slot.id);
                  }
                }}
                className={`min-w-[74px] rounded-xl border p-2 text-center transition ${
                  isSelected
                    ? "border-[#e7c98a] bg-[#2a2118] text-white ring-2 ring-[#e7c98a]"
                    : hasOffered
                    ? "border-red-500 bg-red-900/40 text-white"
                    : allAccepted
                    ? "border-emerald-500 bg-emerald-900/30 text-emerald-200"
                    : "border-[#7a5c2e]/20 bg-[#100d0a] text-[#f5efe4]"
                }`}
              >
                <div className="text-xs">{formatShort(ymd)}</div>
                <div className="mt-1 text-[11px] text-[#cdbda0]">
                  {jobsForDay.length > 0 ? `${jobsForDay.length} job${jobsForDay.length === 1 ? "" : "s"}` : "—"}
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {visibleJobs.length === 0 ? (
            <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#15110d] p-4 text-sm text-[#cdbda0]">
              {selectedDate ? "No jobs for that date." : "No jobs assigned yet."}
            </div>
          ) : (
            visibleJobs.map((item) => {
              const tone = getStatusTone(item.slot.status, item.job.staffing_status);
              const isSelected = selectedSlotId === item.slot.id;

              return (
                <button
                  key={item.slot.id}
                  onClick={() => openJob(item.slot.id)}
                  className={`block w-full rounded-2xl border p-4 text-left transition ${tone.card} ${
                    isSelected ? tone.selectedRing : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-[#f8f2e8]">
                        {item.job.property_id ? "Property job" : "Property job"}
                      </div>
                      <div className="mt-1 text-sm text-[#d4c4a8]">
                        {formatDateLabel(normalizeJobDate(item.jobDate))}
                      </div>
                      <div className="mt-2 text-sm text-[#d4c4a8]">
                        {getTeamMessage(item)}
                      </div>
                    </div>

                    <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${tone.badge}`}>
                      {getSlotDisplayStatus(item.slot.status, item.job.staffing_status)}
                    </span>
                  </div>

                  {item.job.notes ? (
                    <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-[#e8ddca]">
                      {item.job.notes}
                    </p>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        {selectedCleanerJob ? (
          <section className="rounded-2xl border border-[#7a5c2e]/30 bg-[#15110d] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {selectedJobProperty?.name || "Selected Job"}
                </h2>
                <p className="mt-1 text-sm text-[#d4c4a8]">
                  {selectedJobProperty?.address || "No property address"}
                </p>
                <p className="mt-2 text-sm text-[#f0d59f]">
                  Cleaning date: {formatDateLabel(normalizeJobDate(selectedCleanerJob.jobDate))}
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
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
                <div className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">Job Notes</div>
                <div className="mt-1 whitespace-pre-wrap">
                  {selectedCleanerJob.job.notes || "No job notes."}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">Access</div>
                <div className="mt-1 whitespace-pre-wrap">
                  {selectedJobAccess?.door_code ? `Door code: ${selectedJobAccess.door_code}` : "No door code"}
                  <br />
                  {selectedJobAccess?.alarm_code ? `Alarm code: ${selectedJobAccess.alarm_code}` : "No alarm code"}
                  <br />
                  {selectedJobAccess?.notes || "No access notes."}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">Slot Timing</div>
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
                        <div key={sop.id} className="rounded-xl border border-[#7a5c2e]/20 bg-[#100d0a] p-3">
                          <div className="font-medium text-[#f8f2e8]">{sop.title || "Untitled SOP"}</div>
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
                                    <div className="px-2 py-1 text-xs text-[#d4c4a8]">{image.caption}</div>
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

            {(selectedCleanerJob.slot.status || "").toLowerCase().trim() === "offered" ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  onClick={() => void handleAcceptJob()}
                  disabled={actionLoading !== null}
                  className="rounded-full border border-emerald-500/40 bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/30 disabled:opacity-50"
                >
                  {actionLoading === "accept" ? "Accepting..." : "Accept Job"}
                </button>

                <button
                  onClick={() => void handleDeclineJob()}
                  disabled={actionLoading !== null}
                  className="rounded-full border border-red-500/40 bg-red-500/20 px-4 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/30 disabled:opacity-50"
                >
                  {actionLoading === "decline" ? "Declining..." : "Decline Job"}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
