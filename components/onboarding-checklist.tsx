"use client";

import { useEffect, useMemo, useState } from "react";

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  complete: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

type OnboardingChecklistProps = {
  storageKey: string;
  eyebrow: string;
  title: string;
  description: string;
  steps: OnboardingStep[];
  tone?: "admin" | "staff";
};

export default function OnboardingChecklist({
  storageKey,
  eyebrow,
  title,
  description,
  steps,
  tone = "admin",
}: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [manualCompletions, setManualCompletions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(`${storageKey}:dismissed`) === "1");
      setCollapsed(window.localStorage.getItem(`${storageKey}:collapsed`) === "1");
      setManualCompletions(JSON.parse(window.localStorage.getItem(`${storageKey}:manual`) || "{}"));
    } catch {
      setDismissed(false);
      setCollapsed(false);
      setManualCompletions({});
    }
  }, [storageKey]);

  const visibleSteps = useMemo(
    () =>
      steps.map((step) => ({
        ...step,
        complete: step.complete || !!manualCompletions[step.id],
      })),
    [manualCompletions, steps]
  );

  const completedCount = visibleSteps.filter((step) => step.complete).length;
  const totalCount = visibleSteps.length;
  const allComplete = totalCount > 0 && completedCount === totalCount;

  function persistDismissed(value: boolean) {
    setDismissed(value);
    try {
      window.localStorage.setItem(`${storageKey}:dismissed`, value ? "1" : "0");
    } catch {
      // Local storage is a convenience only.
    }
  }

  function persistCollapsed(value: boolean) {
    setCollapsed(value);
    try {
      window.localStorage.setItem(`${storageKey}:collapsed`, value ? "1" : "0");
    } catch {
      // Local storage is a convenience only.
    }
  }

  function toggleManualComplete(stepId: string) {
    const next = {
      ...manualCompletions,
      [stepId]: !manualCompletions[stepId],
    };
    setManualCompletions(next);
    try {
      window.localStorage.setItem(`${storageKey}:manual`, JSON.stringify(next));
    } catch {
      // Local storage is a convenience only.
    }
  }

  if (dismissed) return null;

  const isStaff = tone === "staff";
  const shellClass = isStaff
    ? "border-[#7a5c2e]/35 bg-[#17130f] text-[#f8f2e8]"
    : "border-[#e5d7c3] bg-[#fffdf9] text-[#241c15]";
  const mutedClass = isStaff ? "text-[#d7c6a7]" : "text-[#6f6254]";
  const stepClass = isStaff
    ? "border-[#7a5c2e]/30 bg-[#100d0a]"
    : "border-[#eadfce] bg-[#fcfaf7]";

  return (
    <section className={`rounded-[28px] border p-4 shadow-[0_18px_45px_rgba(0,0,0,0.06)] sm:p-5 ${shellClass}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b48d4e]">{eyebrow}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">{title}</h2>
          <p className={`mt-2 max-w-3xl text-sm leading-6 ${mutedClass}`}>{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#b48d4e]/35 bg-[#b48d4e]/12 px-3 py-1 text-xs font-semibold text-[#b48d4e]">
            {completedCount} of {totalCount}
          </span>
          <button
            type="button"
            onClick={() => persistCollapsed(!collapsed)}
            className="rounded-full border border-current/15 px-3 py-1 text-xs font-semibold opacity-85 transition hover:opacity-100"
          >
            {collapsed ? "Show" : "Hide"}
          </button>
          <button
            type="button"
            onClick={() => persistDismissed(true)}
            className="rounded-full border border-current/15 px-3 py-1 text-xs font-semibold opacity-85 transition hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      </div>

      {!collapsed ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {visibleSteps.map((step) => (
            <div key={step.id} className={`rounded-[20px] border p-4 ${stepClass}`}>
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggleManualComplete(step.id)}
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    step.complete
                      ? "border-emerald-400 bg-emerald-500 text-white"
                      : "border-[#cdbb9d] bg-white/10 text-transparent"
                  }`}
                  aria-label={step.complete ? `Mark ${step.title} incomplete` : `Mark ${step.title} complete`}
                >
                  ✓
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">{step.title}</h3>
                      <p className={`mt-1 text-sm leading-6 ${mutedClass}`}>{step.description}</p>
                    </div>
                    {step.onAction && step.actionLabel ? (
                      <button
                        type="button"
                        onClick={step.onAction}
                        className="shrink-0 rounded-full bg-[#241c15] px-3 py-1.5 text-xs font-semibold text-[#f8f2e8] transition hover:bg-[#352a21]"
                      >
                        {step.actionLabel}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {allComplete && !collapsed ? (
        <div className="mt-4 rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700">
          Setup checklist complete. You can dismiss this card when you are comfortable.
        </div>
      ) : null}
    </section>
  );
}
