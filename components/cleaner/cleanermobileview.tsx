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
  toYmd,
  selectedDate,
  setSelectedDate,
}: CleanerViewProps) {

  const next7JobDates = Array.from(
    new Set(
      cleanerJobs
        .map((item) => normalizeJobDate(item.jobDate))
        .filter((value): value is string => Boolean(value))
        .sort()
    )
  ).slice(0, 7);
    function normalizeJobDate(value: string | null | undefined) {
    if (!value) return null;
    return value.slice(0, 10);
  }

  const visibleJobs = selectedDate
    ? cleanerJobs.filter((item) => normalizeJobDate(item.jobDate) === selectedDate)
    : cleanerJobs;

  return (
    <main className="min-h-screen bg-[#0f0d0a] text-[#f5efe4] px-3 py-4">
      <div className="max-w-md mx-auto space-y-4">

        {/* HEADER */}
        <div className="rounded-2xl border border-[#7a5c2e]/30 p-4 bg-[#15110d]">
          <h1 className="text-xl font-semibold">Cleaner Jobs</h1>
          <p className="text-sm text-[#cdbda0]">
            Tap a job to view details
          </p>
        </div>

        {/* 7 DAY STRIP */}
        <div className="flex gap-2 overflow-x-auto pb-1">
              {next7JobDates.map((ymd) => {
            const jobsForDay = cleanerJobs.filter(
              (j) => normalizeJobDate(j.jobDate) === ymd
            );

            const hasOffered = jobsForDay.some(
              (j) => (j.slot.status || "").toLowerCase() === "offered"
            );

            const allAccepted =
              jobsForDay.length > 0 &&
              jobsForDay.every(
                (j) => (j.slot.status || "").toLowerCase() === "accepted"
              );

            return (
              <button
                key={ymd}
                onClick={() => {
                  if (selectedDate === ymd) {
                    setSelectedDate(null);
                    return;
                  }

                  setSelectedDate(ymd);

                  const first = jobsForDay[0];
                  if (first) {
                    setSelectedSlotId(first.slot.id);
                  } else {
                    setSelectedSlotId(null);
                  }
                }}
                className={`min-w-[70px] rounded-xl border p-2 text-center ${
                  selectedDate === ymd
                    ? "ring-2 ring-[#e7c98a] border-[#e7c98a] bg-[#2a2118] text-white"
                    : hasOffered
                      ? "border-red-500 bg-red-900/40 text-white"
                      : allAccepted
                        ? "border-emerald-500 bg-emerald-900/30 text-emerald-200"
                        : "border-[#7a5c2e]/20 bg-[#100d0a]"
                }`}
              >
                <div
                  className={`text-xs ${
                    selectedDate === ymd
                      ? "text-white"
                      : hasOffered
                        ? "text-white"
                        : allAccepted
                          ? "text-emerald-100"
                          : "text-[#b08b47]"
                  }`}
                >
                  {formatDateLabel(ymd)}
                </div>

                <div
                  className={`mt-1 text-xs ${
                    hasOffered
                      ? "text-red-100"
                      : allAccepted
                        ? "text-emerald-100"
                        : "text-[#e7c98a]"
                  }`}
                >
                  {jobsForDay.length} job{jobsForDay.length === 1 ? "" : "s"}
                </div>
              </button>
            );
          })}
        </div>

                {/* JOB LIST */}
        {selectedDate && (
          <button
            onClick={() => setSelectedDate(null)}
            className="rounded-full border border-[#b08b47]/40 px-3 py-2 text-sm text-[#f5efe4] hover:bg-[#1b1510]"
          >
            Show all jobs
          </button>
        )}
               {visibleJobs.map((item) => {
          const isSelected = selectedSlotId === item.slot.id;
          const tone = getStatusTone(item.slot.status, item.job.staffing_status);

          return (
            <div
              key={item.slot.id}
              className={`rounded-2xl border p-4 ${
                isSelected ? tone.selectedRing : tone.card
              }`}
            >
              {/* HEADER CLICK */}
              <button
                onClick={() =>
                  setSelectedSlotId(isSelected ? null : item.slot.id)
                }
                className="w-full text-left"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className={`text-xs mb-1 ${tone.badge}`}>
                      {getSlotDisplayStatus(
                        item.slot.status,
                        item.job.staffing_status
                      )}
                    </div>

                    <div className="text-lg font-semibold">
                      {formatDateLabel(item.jobDate)}
                    </div>

                    <div className="text-sm text-[#cdbda0] mt-1">
                      {getTeamMessage(item)}
                    </div>
                  </div>

                  <div className={`h-3 w-3 rounded-full ${tone.dot}`} />
                </div>
              </button>

              {/* EXPANDED */}
              {isSelected && (
                <div className="mt-4 space-y-3 border-t border-[#7a5c2e]/20 pt-3">

                  <div className="text-sm text-[#e8ddca] whitespace-pre-wrap">
                    {item.job.notes || "No job notes"}
                  </div>

                  {/* ACTIONS */}
                  {(item.slot.status || "").toLowerCase() === "offered" && (
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleAcceptJob}
                        disabled={actionLoading !== null}
                        className="flex-1 bg-emerald-500 text-black py-2 rounded-xl font-medium"
                      >
                        {actionLoading === "accept"
                          ? "Accepting..."
                          : "Accept"}
                      </button>

                      <button
                        onClick={handleDeclineJob}
                        disabled={actionLoading !== null}
                        className="flex-1 bg-red-500 text-white py-2 rounded-xl font-medium"
                      >
                        {actionLoading === "decline"
                          ? "Declining..."
                          : "Decline"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}