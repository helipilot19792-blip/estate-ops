"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ProposedAction =
  | {
      id: string;
      kind: "turnover_rescue";
      priority: "high" | "medium";
      category: "Staffing";
      title: string;
      reason: string;
      recipientLabel: string;
      channelLabel: "Job offer";
      previewLabel: "Ranked recovery plan";
      previewText: string;
      canEditMessage: false;
      payload: {
        jobId: string;
        slotId: string;
        propertyId: string;
        propertyName: string;
        scheduledFor: string;
        candidates: Array<{
          cleanerAccountId: string;
          targetProfileId: string;
          cleanerName: string;
          assignmentPriority: number;
          score: number;
          reliabilityPercent: number | null;
          completedOrAcceptedJobs: number;
          reasons: string[];
        }>;
      };
    }
  | {
      id: string;
      kind: "invoice_reminder";
      priority: "high" | "medium";
      category: "Billing";
      title: string;
      reason: string;
      recipientLabel: string;
      channelLabel: string;
      previewLabel: string;
      previewText: string;
      canEditMessage: false;
      payload: {
        invoiceId: string;
        recipientEmail: string;
        subject: string;
        messageText: string;
      };
    }
  | {
      id: string;
      kind: "cleaner_follow_up";
      priority: "high" | "medium";
      category: "Staffing";
      title: string;
      reason: string;
      recipientLabel: string;
      channelLabel: string;
      previewLabel: string;
      previewText: string;
      canEditMessage: true;
      payload: {
        targetProfileId: string;
        propertyName: string;
        subject: string;
        jobId: string;
        slotId: string;
      };
    }
  | {
      id: string;
      kind: "guest_registration_reminder";
      priority: "high" | "medium";
      category: "Guest";
      title: string;
      reason: string;
      recipientLabel: string;
      channelLabel: string;
      previewLabel: string;
      previewText: string;
      canEditMessage: true;
      payload: {
        bookingEventId: string;
        propertyId: string;
        propertyName: string;
        checkinDate: string;
      };
    }
  | {
      id: string;
      kind: "staffing_advisory";
      priority: "high" | "medium";
      category: "Supervisor";
      title: string;
      reason: string;
      recipientLabel: "Admin team";
      channelLabel: "Review only";
      previewLabel: "Evidence and recommendation";
      previewText: string;
      canEditMessage: false;
      payload: {
        anomalyCode: string;
        jobId: string;
        propertyId: string;
        confidence: "high" | "medium";
        evidence: string[];
        recommendation: string;
      };
    };

type Props = {
  organizationId: string;
  visible?: boolean;
  assistantRow?: boolean;
};

type DailyBrief = {
  needsActionNow: number;
  atRisk: number;
  waiting: number;
  covered: number;
  generatedAt: string;
};

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || "";
}

export default function AdminAiActionsPanel({ organizationId, visible = true, assistantRow = false }: Props) {
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, string>>({});
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [reviewingId, setReviewingId] = useState("");
  const [expanded, setExpanded] = useState(false);

  const loadActions = useCallback(async () => {
    if (!organizationId || !visible) return;
    setLoading(true);
    setError("");

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No active admin session was found.");

      const response = await fetch(
        `/api/admin/ai-actions?organizationId=${encodeURIComponent(organizationId)}`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || "Could not load AI actions.");
      }

      const nextActions = (payload?.actions ?? []) as ProposedAction[];
      setActions(nextActions);
      setBrief((payload?.brief ?? null) as DailyBrief | null);
      setSelectedCandidates((current) => {
        const next = { ...current };
        for (const action of nextActions) {
          if (action.kind === "turnover_rescue" && !next[action.id] && action.payload.candidates[0]) {
            next[action.id] = action.payload.candidates[0].cleanerAccountId;
          }
        }
        return next;
      });
      setDrafts((current) => {
        const next = { ...current };
        for (const action of nextActions) {
          if (!(action.id in next)) {
            next[action.id] = action.previewText;
          }
        }
        return next;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load AI actions.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, visible]);

  useEffect(() => {
    void loadActions();
  }, [loadActions]);

  useEffect(() => {
    if (error || notice) {
      setExpanded(true);
    }
  }, [error, notice]);

  const visibleActions = useMemo(() => actions.slice(0, 6), [actions]);
  const pendingCount = visibleActions.length;

  async function approveAction(action: ProposedAction) {
    const selectedCandidate = action.kind === "turnover_rescue"
      ? action.payload.candidates.find((candidate) => candidate.cleanerAccountId === selectedCandidates[action.id])
      : null;
    if (action.kind === "turnover_rescue" && !selectedCandidate) {
      setError("Choose an eligible cleaner before approving this rescue plan.");
      return;
    }

    setBusyId(action.id);
    setError("");
    setNotice("");

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No active admin session was found.");

      const response = await fetch("/api/admin/ai-actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: "approve",
          confirmed: true,
          organizationId,
          actionId: action.id,
          kind: action.kind,
          payload: action.payload,
          selectedCandidateAccountId: selectedCandidate?.cleanerAccountId || null,
          draftMessage: drafts[action.id] || action.previewText,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || "Could not approve that action.");
      }

      setNotice(payload?.message || "Action approved.");
      setActions((current) => current.filter((item) => item.id !== action.id));
      setReviewingId("");
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Could not approve that action.");
    } finally {
      setBusyId("");
    }
  }

  function getApprovalDetails(action: ProposedAction) {
    const draft = drafts[action.id] || action.previewText;

    if (action.kind === "turnover_rescue") {
      const cleaner = action.payload.candidates.find(
        (candidate) => candidate.cleanerAccountId === selectedCandidates[action.id]
      );
      return {
        operation: "Create and send a cleaner job offer",
        recipient: cleaner?.cleanerName || "No cleaner selected",
        destination: "Cleaner job offer notifications",
        subject: `Turnover at ${action.payload.propertyName} on ${action.payload.scheduledFor}`,
        content: `Offer the open turnover slot at ${action.payload.propertyName} on ${action.payload.scheduledFor} to ${cleaner?.cleanerName || "the selected cleaner"}.`,
        effects: [
          "Recheck that the cleaner is active, assigned to this property, has not declined, and has no same-day accepted job.",
          "Assign the open slot to the selected cleaner and change its status to Offered with a response deadline.",
          "Send the existing job-offer email and push notifications available for that cleaner.",
          "Update the turnover job's staffing status and record the approval in the audit log.",
        ],
        confirmLabel: "Confirm & send job offer",
      };
    }

    if (action.kind === "invoice_reminder") {
      return {
        operation: "Send an invoice reminder email",
        recipient: `${action.recipientLabel}${action.payload.recipientEmail ? ` <${action.payload.recipientEmail}>` : ""}`,
        destination: "Owner email",
        subject: action.payload.subject,
        content: action.payload.messageText,
        effects: [
          "Send this email immediately using the invoice's configured sender and reply-to addresses.",
          "Update the invoice's last-reminder time and increase its reminder count by one.",
          "Create a reminder-sent event containing the recipient and email delivery ID.",
        ],
        confirmLabel: "Confirm & send email",
      };
    }

    if (action.kind === "cleaner_follow_up") {
      return {
        operation: "Send a direct chat message",
        recipient: action.recipientLabel,
        destination: "Cleaner chat",
        subject: action.payload.subject,
        content: draft,
        effects: [
          "Send the message immediately from your admin profile.",
          "Create or update the direct conversation with this cleaner.",
          "Store the message in the organization's chat history.",
          "Send the cleaner a push notification with a shortened preview when push notifications are enabled.",
        ],
        confirmLabel: "Confirm & send chat",
      };
    }

    if (action.kind === "guest_registration_reminder") {
      return {
        operation: "Save an important booking note",
        recipient: "Admin team",
        destination: `Booking record for ${action.payload.propertyName}`,
        subject: `Guest registration reminder for ${action.payload.checkinDate}`,
        content: `AI supervisor reminder:\n${draft}`,
        effects: [
          "Append this text to the existing admin note; existing note content will not be replaced.",
          "Mark the booking note as important.",
          "Mark the guest-registration reminder as completed so it is not proposed again.",
          "No message is sent to the guest, owner, or cleaner.",
        ],
        confirmLabel: "Confirm & save booking note",
      };
    }

    return {
      operation: "Acknowledge a supervisor finding",
      recipient: "Admin team",
      destination: "Internal audit history only",
      subject: action.title,
      content: action.previewText,
      effects: [
        "Record that this finding was reviewed, including its evidence and recommendation.",
        "Hide this finding for 24 hours.",
        "No message is sent and no staffing, customer, owner, cleaner, or booking record is changed.",
      ],
      confirmLabel: "Confirm acknowledgement",
    };
  }

  async function dismissAction(action: ProposedAction) {
    setBusyId(action.id);
    setError("");
    setNotice("");

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No active admin session was found.");

      const response = await fetch("/api/admin/ai-actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: "dismiss",
          organizationId,
          actionId: action.id,
          kind: action.kind,
          payload: action.payload,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || "Could not dismiss that action.");
      }

      setNotice(payload?.message || "Action dismissed for now.");
      setActions((current) => current.filter((item) => item.id !== action.id));
    } catch (dismissError) {
      setError(dismissError instanceof Error ? dismissError.message : "Could not dismiss that action.");
    } finally {
      setBusyId("");
    }
  }

  if (!visible) return null;

  if (!expanded) {
    return (
      <div className={assistantRow ? "flex justify-end" : "mb-6 flex justify-end"}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="group inline-flex max-w-full items-center gap-3 rounded-full border border-[#d8c7ab] bg-white/96 px-4 py-2.5 text-left shadow-[0_14px_35px_rgba(36,28,21,0.08)] transition hover:-translate-y-0.5 hover:bg-[#fcfaf7]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#241c15] text-sm font-semibold text-[#f8f2e8]">
            AI
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[#241c15]">AI Copilot</span>
            <span className="block text-xs text-[#7f7263]">
              {loading ? "Checking operations..." : pendingCount > 0 ? `${pendingCount} supervised action${pendingCount === 1 ? "" : "s"} waiting` : "Open supervised operator inbox"}
            </span>
          </span>
          {pendingCount > 0 ? (
            <span className="rounded-full bg-[#eef5ff] px-2.5 py-1 text-xs font-semibold text-[#2957a4]">
              {pendingCount}
            </span>
          ) : null}
        </button>
      </div>
    );
  }

  return (
    <section className={`${assistantRow ? "w-full" : "mb-6"} rounded-[28px] border border-[#dbeafe] bg-[#f8fbff] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3563a8]">AI Actions</div>
          <h2 className="mt-1 text-xl font-semibold text-[#17202a]">Supervised operator inbox</h2>
          <p className="mt-1 text-sm text-[#5f6f86]">
            The AI watches staffing, billing, and property rules, then prepares a visible preview. No customer, owner, cleaner, or booking record is changed until an admin confirms approval.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded-full border border-[#b9d1fb] bg-white px-4 py-2 text-sm font-semibold text-[#2957a4] transition hover:bg-[#eef5ff]"
        >
          Minimize
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void loadActions()}
          disabled={loading}
          className="rounded-full border border-[#b9d1fb] bg-white px-4 py-2 text-sm font-semibold text-[#2957a4] transition hover:bg-[#eef5ff] disabled:opacity-60"
        >
          {loading ? "Refreshing..." : "Refresh actions"}
        </button>
        {pendingCount > 0 ? (
          <div className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#3563a8]">
            {pendingCount} pending
          </div>
        ) : null}
      </div>

      {brief ? (
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { label: "Needs action now", value: brief.needsActionNow, tone: "border-[#fecaca] bg-[#fff7f7] text-[#991b1b]" },
            { label: "At risk", value: brief.atRisk, tone: "border-[#fde3b0] bg-[#fffaf0] text-[#8a5a12]" },
            { label: "Waiting on response", value: brief.waiting, tone: "border-[#bfdbfe] bg-[#f5f9ff] text-[#2957a4]" },
            { label: "Covered", value: brief.covered, tone: "border-[#cfe4cf] bg-[#f4fbf4] text-[#2f6b2f]" },
          ].map((item) => (
            <div key={item.label} className={`rounded-[18px] border px-3 py-3 ${item.tone}`}>
              <div className="text-2xl font-semibold leading-none">{item.value}</div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em]">{item.label}</div>
            </div>
          ))}
        </div>
      ) : null}

      {notice ? (
        <div className="mt-4 rounded-[18px] border border-[#cfe4cf] bg-[#f4fbf4] px-4 py-3 text-sm text-[#2f6b2f]">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-[18px] border border-[#f5c2c7] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2e22]">
          {error}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {visibleActions.length === 0 && !loading ? (
          <div className="rounded-[20px] border border-dashed border-[#bfd4f6] bg-white px-4 py-4 text-sm text-[#5f6f86]">
            No supervised AI actions are waiting for approval right now.
          </div>
        ) : null}

        {visibleActions.map((action) => (
          <div key={action.id} className="rounded-[22px] border border-[#d9e6f7] bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#fcfaf7] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f6255]">
                    {action.category}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                      action.priority === "high"
                        ? "bg-[#fff1f2] text-[#991b1b]"
                        : "bg-[#eef5ff] text-[#2957a4]"
                    }`}
                  >
                    {action.priority} priority
                  </span>
                  <span className="rounded-full bg-[#f8fbff] px-2.5 py-1 text-[11px] font-semibold text-[#2957a4]">
                    {action.channelLabel}
                  </span>
                </div>
                <div className="mt-2 text-base font-semibold text-[#17202a]">{action.title}</div>
                <div className="mt-1 text-sm text-[#5f6f86]">{action.reason}</div>
                <div className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8a7b68]">
                  Recipient
                </div>
                <div className="mt-1 text-sm font-medium text-[#241c15]">
                  {action.kind === "turnover_rescue"
                    ? action.payload.candidates.find((candidate) => candidate.cleanerAccountId === selectedCandidates[action.id])?.cleanerName || action.recipientLabel
                    : action.recipientLabel}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setReviewingId((current) => current === action.id ? "" : action.id)}
                  disabled={busyId === action.id || (action.kind === "turnover_rescue" && action.payload.candidates.length === 0)}
                  className="rounded-full bg-[#241c15] px-4 py-2 text-sm font-semibold text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60"
                >
                  {busyId === action.id
                    ? "Working..."
                    : action.kind === "turnover_rescue" && action.payload.candidates.length === 0
                      ? "No eligible cleaner"
                      : reviewingId === action.id ? "Close approval review" : "Review approval"}
                </button>
                <button
                  type="button"
                  onClick={() => void dismissAction(action)}
                  disabled={busyId === action.id}
                  className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-semibold text-[#5f5245] transition hover:bg-[#fcfaf7] disabled:opacity-60"
                >
                  {busyId === action.id ? "Working..." : "Dismiss for now"}
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7b68]">
                {action.previewLabel}
              </div>
              {action.kind === "turnover_rescue" ? (
                <div className="mt-3 space-y-2">
                  <p className="text-sm leading-6 text-[#5f5245]">{action.previewText}</p>
                  {action.payload.candidates.map((candidate, index) => {
                    const selected = selectedCandidates[action.id] === candidate.cleanerAccountId;
                    return (
                      <label
                        key={candidate.cleanerAccountId}
                        className={`block cursor-pointer rounded-[16px] border p-3 transition ${selected ? "border-[#79a2df] bg-[#f2f7ff] shadow-sm" : "border-[#e5ddd2] bg-white hover:border-[#b9d1fb]"}`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name={`rescue-candidate-${action.id}`}
                            value={candidate.cleanerAccountId}
                            checked={selected}
                            onChange={() => setSelectedCandidates((current) => ({ ...current, [action.id]: candidate.cleanerAccountId }))}
                            className="mt-1"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-[#17202a]">#{index + 1} {candidate.cleanerName}</span>
                              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#3563a8]">Score {candidate.score}</span>
                              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-[#6f6255]">Property priority {candidate.assignmentPriority}</span>
                              {candidate.reliabilityPercent !== null ? (
                                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-[#2f6b2f]">{candidate.reliabilityPercent}% response history</span>
                              ) : null}
                            </div>
                            <ul className="mt-2 space-y-1 text-xs text-[#6f6255]">
                              {candidate.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
                            </ul>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                  {action.payload.candidates.length === 0 ? (
                    <div className="rounded-[14px] border border-[#fecaca] bg-[#fff7f7] px-3 py-2 text-sm text-[#991b1b]">
                      No eligible assigned cleaner remains. Add a backup cleaner or handle this job manually.
                    </div>
                  ) : (
                    <div className="text-xs text-[#5f6f86]">
                      Approval rechecks the assignment and same-day conflicts, creates the formal job offer, sends existing notifications, and keeps the job under review until a cleaner responds.
                    </div>
                  )}
                </div>
              ) : action.canEditMessage ? (
                <textarea
                  value={drafts[action.id] || action.previewText}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [action.id]: event.target.value,
                    }))
                  }
                  rows={4}
                  className="mt-2 w-full rounded-[14px] border border-[#d9ccbb] bg-white px-3 py-2 text-sm text-[#17202a] outline-none focus:border-[#b48d4e]"
                />
              ) : (
                <div className="mt-2 whitespace-pre-line text-sm text-[#5f5245]">{action.previewText}</div>
              )}
            </div>

            {reviewingId === action.id ? (() => {
              const details = getApprovalDetails(action);
              return (
                <div className="mt-4 rounded-[18px] border-2 border-[#79a2df] bg-[#f5f9ff] p-4 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2957a4]">
                    Exactly what you are approving
                  </div>
                  <div className="mt-2 text-base font-semibold text-[#17202a]">{details.operation}</div>
                  <p className="mt-1 text-sm text-[#5f6f86]">
                    Nothing happens when you open this review. The action runs only when you use the confirmation button below.
                  </p>

                  <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                    <div className="rounded-[14px] border border-[#d9e6f7] bg-white p-3">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7b68]">Recipient</dt>
                      <dd className="mt-1 font-medium text-[#17202a]">{details.recipient}</dd>
                    </div>
                    <div className="rounded-[14px] border border-[#d9e6f7] bg-white p-3">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7b68]">Channel / destination</dt>
                      <dd className="mt-1 font-medium text-[#17202a]">{details.destination}</dd>
                    </div>
                  </dl>

                  <div className="mt-3 rounded-[14px] border border-[#d9e6f7] bg-white p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7b68]">Subject / purpose</div>
                    <div className="mt-1 text-sm font-medium text-[#17202a]">{details.subject}</div>
                    <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7b68]">Exact message or saved content</div>
                    <div className="mt-1 whitespace-pre-line text-sm leading-6 text-[#5f5245]">{details.content}</div>
                  </div>

                  <div className="mt-3 rounded-[14px] border border-[#d9e6f7] bg-white p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7b68]">What will happen after confirmation</div>
                    <ol className="mt-2 space-y-1.5 text-sm leading-5 text-[#5f5245]">
                      {details.effects.map((effect, index) => <li key={effect}>{index + 1}. {effect}</li>)}
                    </ol>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void approveAction(action)}
                      disabled={busyId === action.id}
                      className="rounded-full bg-[#241c15] px-4 py-2 text-sm font-semibold text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60"
                    >
                      {busyId === action.id ? "Working..." : details.confirmLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewingId("")}
                      disabled={busyId === action.id}
                      className="rounded-full border border-[#b9d1fb] bg-white px-4 py-2 text-sm font-semibold text-[#2957a4] transition hover:bg-[#eef5ff] disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })() : null}
          </div>
        ))}
      </div>
    </section>
  );
}
