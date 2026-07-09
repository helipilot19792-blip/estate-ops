"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ProposedAction =
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
    };

type Props = {
  organizationId: string;
  visible?: boolean;
};

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || "";
}

export default function AdminAiActionsPanel({ organizationId, visible = true }: Props) {
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
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
          organizationId,
          kind: action.kind,
          payload: action.payload,
          draftMessage: drafts[action.id] || action.previewText,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || "Could not approve that action.");
      }

      setNotice(payload?.message || "Action approved.");
      setActions((current) => current.filter((item) => item.id !== action.id));
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Could not approve that action.");
    } finally {
      setBusyId("");
    }
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
      <div className="mb-6 flex justify-end">
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
    <section className="mb-6 rounded-[28px] border border-[#dbeafe] bg-[#f8fbff] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3563a8]">AI Actions</div>
          <h2 className="mt-1 text-xl font-semibold text-[#17202a]">Supervised operator inbox</h2>
          <p className="mt-1 text-sm text-[#5f6f86]">
            The AI watches staffing, billing, and property rules, then prepares actions for approval. Nothing is sent or logged until an admin approves it.
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
                <div className="mt-1 text-sm font-medium text-[#241c15]">{action.recipientLabel}</div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void approveAction(action)}
                  disabled={busyId === action.id}
                  className="rounded-full bg-[#241c15] px-4 py-2 text-sm font-semibold text-[#f8f2e8] transition hover:bg-[#352a21] disabled:opacity-60"
                >
                  {busyId === action.id ? "Working..." : "Approve"}
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
              {action.canEditMessage ? (
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
                <div className="mt-2 text-sm text-[#5f5245]">{action.previewText}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
