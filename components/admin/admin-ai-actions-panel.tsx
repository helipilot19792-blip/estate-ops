"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ProposedAction =
  | {
      id: string;
      kind: "invoice_reminder";
      priority: "high" | "medium";
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

  const visibleActions = useMemo(() => actions.slice(0, 6), [actions]);

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

  function dismissAction(actionId: string) {
    setActions((current) => current.filter((item) => item.id !== actionId));
  }

  if (!visible) return null;

  return (
    <section className="mb-6 rounded-[28px] border border-[#dbeafe] bg-[#f8fbff] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3563a8]">AI Actions</div>
          <h2 className="mt-1 text-xl font-semibold text-[#17202a]">Supervised follow-ups</h2>
          <p className="mt-1 text-sm text-[#5f6f86]">
            Suggestions are generated from today&apos;s jobs and unpaid invoices. Nothing is sent until an admin approves it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadActions()}
          disabled={loading}
          className="rounded-full border border-[#b9d1fb] bg-white px-4 py-2 text-sm font-semibold text-[#2957a4] transition hover:bg-[#eef5ff] disabled:opacity-60"
        >
          {loading ? "Refreshing..." : "Refresh actions"}
        </button>
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
            No AI follow-ups are waiting for approval right now.
          </div>
        ) : null}

        {visibleActions.map((action) => (
          <div key={action.id} className="rounded-[22px] border border-[#d9e6f7] bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                      action.priority === "high"
                        ? "bg-[#fff1f2] text-[#991b1b]"
                        : "bg-[#eef5ff] text-[#2957a4]"
                    }`}
                  >
                    {action.priority}
                  </span>
                  <span className="rounded-full bg-[#fcfaf7] px-2.5 py-1 text-[11px] font-semibold text-[#6f6255]">
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
                  onClick={() => dismissAction(action.id)}
                  disabled={busyId === action.id}
                  className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-semibold text-[#5f5245] transition hover:bg-[#fcfaf7] disabled:opacity-60"
                >
                  Dismiss
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
