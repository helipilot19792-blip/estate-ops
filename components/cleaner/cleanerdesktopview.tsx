"use client";

import Image from "next/image";
import type { CleanerViewProps } from "@/components/cleaner/cleanershell";

export default function CleanerDesktopView({
  loading,
  signingOut,
  actionLoading,
  profile,
  cleanerAccount,
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
  collapsedPreviewJob,
  hiddenJobsCount,
  selectedDateLabel,
  selectedCleanerJob,
  selectedJobProperty,
  selectedJobAccess,
  selectedJobSops,
  sopImagesBySopId,
  handleDateClick,
  handleJobClick,
  scrollToJobsSection,
  handleAcceptJob,
  handleDeclineJob,
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
}: CleanerViewProps) {
  if (loading) {
    return (
      <main className="min-h-screen bg-[#0f0d0a] text-[#f5efe4]">
        <div className="mx-auto w-full max-w-6xl overflow-x-hidden px-3 py-4 sm:px-6 sm:py-8">
          <div className="animate-pulse rounded-3xl border border-[#7a5c2e]/30 bg-[#17130f] p-8">
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
      <main className="min-h-screen bg-[#0f0d0a] text-[#f5efe4]">
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
                <h1 className="text-2xl font-semibold text-[#f5efe4]">Cleaner Dashboard</h1>
                <p className="text-sm text-[#d4c4a8]">Estate of Mind Property Management</p>
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
    <main className="min-h-screen bg-[#0f0d0a] text-[#f5efe4]">
      <div className="mx-auto w-full max-w-6xl overflow-x-hidden px-3 py-4 sm:px-6 sm:py-8">
        <div className="overflow-hidden rounded-3xl border border-[#7a5c2e]/35 bg-[linear-gradient(180deg,#17130f_0%,#100d09_100%)] shadow-2xl">
          <div className="border-b border-[#7a5c2e]/25 px-4 py-5 sm:px-6 sm:py-6 md:px-8">
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
                  <p className="text-xs uppercase tracking-[0.25em] text-[#b08b47]">
                    Cleaner Portal
                  </p>
                  <h1 className="mt-1 break-words text-lg font-semibold text-[#f8f2e8] sm:text-2xl md:text-3xl">
                    Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}
                  </h1>
                  <p className="mt-1 break-words text-sm text-[#d4c4a8]">
                    {cleanerAccount?.display_name
                      ? `Account: ${cleanerAccount.display_name}`
                      : "Your assigned jobs, access notes, and SOPs."}
                  </p>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="rounded-full border border-[#b08b47]/70 px-5 py-2 text-sm font-medium text-[#f5efe4] transition hover:bg-[#b08b47] hover:text-[#120f0b] disabled:opacity-50"
              >
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </div>

          <div className="grid gap-6 px-4 py-5 sm:px-6 sm:py-6 md:px-8">
            {profile?.role === "pending" && (
              <section className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5">
                <h2 className="text-lg font-semibold text-[#f5efe4]">Account awaiting approval</h2>
                <p className="mt-2 text-sm text-[#e6d8be]">
                  Your account has been created, but admin approval is still needed before full
                  cleaner access is granted.
                </p>
              </section>
            )}

            {accountWarning && (
              <section className="rounded-2xl border border-amber-500/25 bg-amber-950/20 p-4 text-sm text-[#e6d8be]">
                {accountWarning}
              </section>
            )}

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
              <div className="rounded-2xl border border-[#7a5c2e]/25 bg-[#15110d] p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b08b47]">
                  Assigned Properties
                </p>
                <p className="mt-3 text-3xl font-semibold text-[#f8f2e8]">{properties.length}</p>
              </div>

              <div
                className={`rounded-2xl border p-5 ${
                  unacceptedCount > 0
                    ? "border-red-500/60 bg-[linear-gradient(180deg,rgba(90,18,18,0.78)_0%,rgba(21,17,13,1)_100%)] shadow-[0_0_28px_rgba(239,68,68,0.16)]"
                    : "border-[#7a5c2e]/25 bg-[#15110d]"
                }`}
              >
                <p className="text-xs uppercase tracking-[0.2em] text-[#b08b47]">Jobs Waiting</p>
                <p className="mt-3 text-3xl font-semibold text-[#f8f2e8]">{unacceptedCount}</p>
              </div>

              <div className="rounded-2xl border border-[#7a5c2e]/25 bg-[#15110d] p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b08b47]">Visible Slots</p>
                <p className="mt-3 text-3xl font-semibold text-[#f8f2e8]">{filteredJobs.length}</p>
              </div>

              <div className="rounded-2xl border border-[#7a5c2e]/25 bg-[#15110d] p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b08b47]">Cleaner Account</p>
                <p className="mt-3 text-lg font-semibold text-[#f8f2e8]">
                  {cleanerAccount?.display_name || "Not linked"}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-[#7a5c2e]/25 bg-[#15110d] p-3 sm:p-5">
              <div className="mb-5 space-y-3">
                <div>
                  <h2 className="text-xl font-semibold text-[#f8f2e8]">Cleaning Calendar</h2>
                  <p className="mt-1 text-sm text-[#cdbda0]">
                    Tap a date to filter jobs for that day.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-3">
                  <div className="text-center text-sm font-medium text-[#f8f2e8]">
                    {formatMonthLabel(calendarMonth)}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() =>
                        setCalendarMonth(
                          new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                        )
                      }
                      className="rounded-full border border-[#7a5c2e]/40 px-3 py-2 text-sm text-[#f5efe4] hover:bg-[#1b1510]"
                    >
                      Prev
                    </button>

                    <button
                      onClick={() =>
                        setCalendarMonth(
                          new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                        )
                      }
                      className="rounded-full border border-[#7a5c2e]/40 px-3 py-2 text-sm text-[#f5efe4] hover:bg-[#1b1510]"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>

              <div className="mb-3 hidden grid-cols-7 gap-2 text-center text-xs uppercase tracking-[0.16em] text-[#b08b47] sm:grid">
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
                          ? "border-[#b08b47] bg-[#221a13]"
                          : hasUnacceptedOnDay
                            ? "border-red-500/50 bg-[linear-gradient(180deg,rgba(68,16,16,0.58)_0%,rgba(16,13,10,1)_100%)]"
                            : "border-[#7a5c2e]/20 bg-[#100d0a]",
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
                            isToday ? "text-[#e7c98a]" : "text-[#f8f2e8]",
                          ].join(" ")}
                        >
                          {day.getDate()}
                        </span>

                        {dayJobs.length > 0 && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] ${
                              hasUnacceptedOnDay
                                ? "bg-red-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.28)]"
                                : "bg-[#b08b47]/15 text-[#e7c98a]"
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
                                  ? "bg-[#b08b47] text-[#120f0b]"
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
                  }}
                  className="rounded-full border border-[#7a5c2e]/40 px-4 py-2 text-sm text-[#f5efe4] hover:bg-[#1b1510]"
                >
                  Show all jobs
                </button>

                {selectedDateLabel && (
                  <div className="rounded-full border border-[#b08b47]/30 bg-[#b08b47]/10 px-4 py-2 text-sm text-[#e7c98a]">
                    Filtering: {selectedDateLabel}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-[#7a5c2e]/25 bg-[#15110d] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[#f8f2e8]">
                    Jobs {selectedDateLabel ? `for ${selectedDateLabel}` : ""}
                  </h2>
                  <p className="mt-1 text-sm text-[#cdbda0]">
                    {jobsCollapsed
                      ? "Collapsed view showing the most urgent slot first. Expand to see the full schedule."
                      : "Expanded view showing all visible slots in priority order, with waiting jobs first."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {jobsCollapsed ? (
                    <button
                      onClick={() => setJobsCollapsed(false)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#b08b47]/45 bg-[#1b1510] px-4 py-2 text-sm text-[#f5efe4] hover:bg-[#241a14]"
                    >
                      <span>Expand jobs</span>
                      <span>▼</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setJobsCollapsed(true)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#b08b47]/45 bg-[#1b1510] px-4 py-2 text-sm text-[#f5efe4] hover:bg-[#241a14]"
                    >
                      <span>Collapse jobs</span>
                      <span>▲</span>
                    </button>
                  )}
                </div>
              </div>

              {jobsWarning && (
                <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3 text-sm text-[#e6d8be]">
                  {jobsWarning}
                </p>
              )}

              {selectedCleanerJob && (
                <section className="mt-4 rounded-2xl border border-[#b08b47]/30 bg-[#18120e] p-4 shadow-lg sm:p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">
                        Selected Job Details
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-[#f8f2e8]">
                        {selectedJobProperty?.name || "Property job"}
                      </h3>
                      <p className="mt-1 text-sm text-[#d4c4a8]">
                        {selectedJobProperty?.address || "No property address"}
                      </p>
                      <p className="mt-2 text-sm text-[#e7c98a]">
                        Cleaning date: {formatDateLabel(selectedCleanerJob.jobDate)}
                      </p>
                      <p className="mt-2 text-sm text-[#d9c5a1]">
                        {getTeamMessage(selectedCleanerJob)}
                      </p>
                    </div>

                    <div>
                      {(() => {
                        const display = getSlotDisplayStatus(
                          selectedCleanerJob.slot.status ?? null,
                          selectedCleanerJob.job.staffing_status ?? null
                        );
                        const isOffered =
                          (selectedCleanerJob.slot.status || "").toLowerCase().trim() === "offered";
                        const isAccepted =
                          (selectedCleanerJob.slot.status || "").toLowerCase().trim() === "accepted";

                        return (
                          <span
                            className={`inline-flex w-fit rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em] ${
                              isOffered
                                ? "border border-red-400/70 bg-red-500 text-white animate-pulse"
                                : isAccepted
                                  ? "border border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                                  : "border border-[#7a5c2e]/35 bg-[#b08b47]/10 text-[#e7c98a]"
                            }`}
                          >
                            {display}
                          </span>
                        );
                      })()}

                      {(() => {
                        const isOffered =
                          (selectedCleanerJob.slot.status || "").toLowerCase().trim() === "offered";
                        if (!isOffered) return null;

                        const remainingMs = getTimeRemainingMs(selectedCleanerJob, now);
                        if (remainingMs === null) return null;

                        const tone = getCountdownTone(remainingMs);

                        return (
                          <div className={`mt-3 text-sm font-semibold ${tone}`}>
                            {remainingMs < 0
                              ? `Overdue by ${formatRemaining(remainingMs)}`
                              : `Accept within ${formatRemaining(remainingMs)}`}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#b08b47]">
                        Slot Offered
                      </p>
                      <p className="mt-2 text-sm text-[#e8ddca]">
                        {formatDateTimeLabel(selectedCleanerJob.slot.offered_at)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#b08b47]">
                        Slot Accepted
                      </p>
                      <p className="mt-2 text-sm text-[#e8ddca]">
                        {formatDateTimeLabel(selectedCleanerJob.slot.accepted_at)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#b08b47]">
                        Slot Declined
                      </p>
                      <p className="mt-2 text-sm text-[#e8ddca]">
                        {formatDateTimeLabel(selectedCleanerJob.slot.declined_at)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#b08b47]">
                        Team Slots
                      </p>
                      <p className="mt-2 text-sm text-[#e8ddca]">
                        {selectedCleanerJob.acceptedSlots} accepted of{" "}
                        {selectedCleanerJob.totalSlots}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#b08b47]">
                        Job Status
                      </p>
                      <p className="mt-2 text-sm text-[#e8ddca]">
                        {selectedCleanerJob.job.staffing_status ||
                          selectedCleanerJob.job.status ||
                          "—"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#b08b47]">
                        Slot Number
                      </p>
                      <p className="mt-2 text-sm text-[#e8ddca]">
                        {selectedCleanerJob.slot.slot_number ?? "—"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={handleAcceptJob}
                      disabled={
                        actionLoading !== null ||
                        (selectedCleanerJob.slot.status || "").toLowerCase().trim() !== "offered"
                      }
                      className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-[#08110c] transition hover:bg-emerald-400 disabled:opacity-50"
                    >
                      {actionLoading === "accept" ? "Accepting..." : "Accept Job"}
                    </button>

                    <button
                      onClick={handleDeclineJob}
                      disabled={
                        actionLoading !== null ||
                        (selectedCleanerJob.slot.status || "").toLowerCase().trim() !== "offered"
                      }
                      className="rounded-full bg-red-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-400 disabled:opacity-50"
                    >
                      {actionLoading === "decline" ? "Declining..." : "Decline Job"}
                    </button>

                    <button
                      onClick={() => setSelectedSlotId(null)}
                      className="rounded-full border border-[#7a5c2e]/50 px-5 py-2 text-sm font-medium text-[#f5efe4] transition hover:bg-[#241a14]"
                    >
                      Close Details
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">
                        Job Notes
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-[#e8ddca]">
                        {selectedCleanerJob.job.notes || "No job notes."}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">
                        Access Details
                      </p>
                      <div className="mt-2 space-y-2 text-sm text-[#e8ddca]">
                        <p>
                          <span className="text-[#d4c4a8]">Door code:</span>{" "}
                          {selectedJobAccess?.door_code || "Not added"}
                        </p>
                        <p>
                          <span className="text-[#d4c4a8]">Alarm code:</span>{" "}
                          {selectedJobAccess?.alarm_code || "Not added"}
                        </p>
                        <p className="whitespace-pre-wrap">
                          <span className="text-[#d4c4a8]">Notes:</span>{" "}
                          {selectedJobAccess?.notes || "No access notes added yet."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">
                      Property Notes
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[#e8ddca]">
                      {selectedJobProperty?.notes || "No property notes."}
                    </p>
                  </div>

                  <div className="mt-4 rounded-2xl border border-[#7a5c2e]/20 bg-[#100d0a] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">SOPs</p>

                    {selectedJobSops.length === 0 ? (
                      <p className="mt-2 text-sm text-[#cdbda0]">No SOPs added yet.</p>
                    ) : (
                      <div className="mt-3 space-y-4">
                        {selectedJobSops.map((sop) => {
                          const images = sopImagesBySopId.get(sop.id) || [];

                          return (
                            <div
                              key={sop.id}
                              className="rounded-2xl border border-[#7a5c2e]/15 bg-[#15110d] p-4"
                            >
                              {sop.title && (
                                <h4 className="text-base font-semibold text-[#f8f2e8]">
                                  {sop.title}
                                </h4>
                              )}

                              {sop.content && (
                                <p className="mt-2 whitespace-pre-wrap text-sm text-[#e8ddca]">
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
                                      className="block overflow-hidden rounded-xl border border-[#7a5c2e]/20"
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
                </section>
              )}

              {jobsCollapsed ? (
                <div className="mt-4">
                  <div
                    className={`mb-4 rounded-2xl border p-4 ${
                      unacceptedCount > 0
                        ? "border-red-500/45 bg-red-950/25"
                        : "border-[#b08b47]/20 bg-[#110d09]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#b08b47]/35 bg-[#b08b47]/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-[#e7c98a]">
                        Collapsed
                      </span>

                      {collapsedPreviewJob && (
                        <span
                          className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em] ${
                            (collapsedPreviewJob.slot.status || "").toLowerCase().trim() ===
                            "offered"
                              ? "border border-red-400/70 bg-red-500 text-white animate-pulse"
                              : "border border-sky-400/25 bg-sky-400/10 text-sky-200"
                          }`}
                        >
                          {(collapsedPreviewJob.slot.status || "").toLowerCase().trim() ===
                          "offered"
                            ? "Needs Response"
                            : "Next Upcoming Job"}
                        </span>
                      )}

                      {hiddenJobsCount > 0 && (
                        <span className="rounded-full border border-[#7a5c2e]/30 bg-[#1a140f] px-3 py-1 text-xs text-[#d8c7ab]">
                          {hiddenJobsCount} more scheduled job
                          {hiddenJobsCount === 1 ? "" : "s"} hidden
                        </span>
                      )}
                    </div>
                  </div>

                  {!collapsedPreviewJob ? (
                    <p className="text-sm text-[#cdbda0]">
                      {selectedDate ? "No jobs for that date." : "No jobs assigned yet."}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {(() => {
                        const item = collapsedPreviewJob;
                        const property = properties.find((p) => p.id === item.job.property_id);
                        const isSelected = selectedSlotId === item.slot.id;
                        const tone = getStatusTone(item.slot.status, item.job.staffing_status);
                        const waiting = (item.slot.status || "").toLowerCase().trim() === "offered";
                        const remainingMs = waiting ? getTimeRemainingMs(item, now) : null;
                        const countdownTone = getCountdownTone(remainingMs);

                        return (
                          <button
                            key={item.slot.id}
                            onClick={() => handleJobClick(item.slot.id)}
                            className={[
                              "block w-full rounded-2xl border p-5 text-left transition duration-200",
                              tone.card,
                              isSelected
                                ? tone.selectedRing
                                : "hover:-translate-y-[1px] hover:bg-[#18120e]",
                            ].join(" ")}
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={tone.badge}>
                                    {getSlotDisplayStatus(item.slot.status, item.job.staffing_status)}
                                  </span>
                                </div>

                                <h3 className="mt-3 text-lg font-semibold text-[#f8f2e8]">
                                  {property?.name || "Property job"}
                                </h3>

                                <p className="mt-1 text-sm text-[#d4c4a8]">
                                  {property?.address || "No property address"}
                                </p>

                                <p className="mt-2 text-sm font-medium text-[#f0d59f]">
                                  Cleaning date: {formatDateLabel(item.jobDate)}
                                </p>

                                <p className="mt-2 text-sm text-[#d9c5a1]">
                                  {getTeamMessage(item)}
                                </p>

                                {waiting && remainingMs !== null && (
                                  <p className={`mt-2 text-sm font-semibold ${countdownTone}`}>
                                    {remainingMs < 0
                                      ? `Overdue by ${formatRemaining(remainingMs)}`
                                      : `Accept within ${formatRemaining(remainingMs)}`}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-start md:justify-end">
                                <span className="inline-flex items-center gap-2 rounded-full border border-[#7a5c2e]/25 bg-[#120f0b] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#d9c5a1]">
                                  <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                                  Tap to open
                                </span>
                              </div>
                            </div>

                            <div className="mt-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">
                                Job Notes
                              </p>
                              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-[#e8ddca]">
                                {item.job.notes || "No job notes."}
                              </p>
                            </div>
                          </button>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4">
                  {filteredJobs.length === 0 ? (
                    <p className="text-sm text-[#cdbda0]">
                      {selectedDate ? "No jobs for that date." : "No jobs assigned yet."}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {filteredJobs.map((item) => {
                        const property = properties.find((p) => p.id === item.job.property_id);
                        const isSelected = selectedSlotId === item.slot.id;
                        const tone = getStatusTone(item.slot.status, item.job.staffing_status);
                        const waiting = (item.slot.status || "").toLowerCase().trim() === "offered";
                        const remainingMs = waiting ? getTimeRemainingMs(item, now) : null;
                        const countdownTone = getCountdownTone(remainingMs);

                        return (
                          <button
                            key={item.slot.id}
                            onClick={() => handleJobClick(item.slot.id)}
                            className={[
                              "block w-full rounded-2xl border p-5 text-left transition duration-200",
                              tone.card,
                              isSelected
                                ? tone.selectedRing
                                : "hover:-translate-y-[1px] hover:bg-[#18120e]",
                            ].join(" ")}
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={tone.badge}>
                                    {getSlotDisplayStatus(item.slot.status, item.job.staffing_status)}
                                  </span>

                                  {isSelected && (
                                    <span className="rounded-full border border-[#b08b47]/35 bg-[#b08b47]/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#f0d59f]">
                                      Selected
                                    </span>
                                  )}
                                </div>

                                <h3 className="mt-3 text-lg font-semibold text-[#f8f2e8]">
                                  {property?.name || "Property job"}
                                </h3>

                                <p className="mt-1 text-sm text-[#d4c4a8]">
                                  {property?.address || "No property address"}
                                </p>

                                <p className="mt-2 text-sm font-medium text-[#f0d59f]">
                                  Cleaning date: {formatDateLabel(item.jobDate)}
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
                                <span className="inline-flex items-center gap-2 rounded-full border border-[#7a5c2e]/25 bg-[#120f0b] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#d9c5a1]">
                                  <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                                  Tap to open
                                </span>
                              </div>
                            </div>

                            <div className="mt-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-[#b08b47]">
                                Job Notes
                              </p>
                              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-[#e8ddca]">
                                {item.job.notes || "No job notes."}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}