"use client";

import { useEffect, useState } from "react";

const DISMISS_DURATION_MS = 60 * 60 * 1000;
const DISMISS_STORAGE_PREFIX = "admin-operations-alerts-hidden-until";

type OperationsAlert = {
  key: string;
  label: string;
  tone: "amber" | "red" | "green";
  onClick: () => void;
};

type AdminOperationsAlertsProps = {
  operationsAlerts: OperationsAlert[];
  organizationId?: string | null;
};

export default function AdminOperationsAlerts({
  operationsAlerts,
  organizationId,
}: AdminOperationsAlertsProps) {
  const [dismissalReady, setDismissalReady] = useState(false);
  const [hiddenUntil, setHiddenUntil] = useState<number | null>(null);
  const storageKey = `${DISMISS_STORAGE_PREFIX}:${organizationId || "default"}`;

  useEffect(() => {
    const savedUntil = Number(window.localStorage.getItem(storageKey) || 0);

    if (Number.isFinite(savedUntil) && savedUntil > Date.now()) {
      setHiddenUntil(savedUntil);
    } else {
      window.localStorage.removeItem(storageKey);
      setHiddenUntil(null);
    }

    setDismissalReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hiddenUntil) return;

    const remainingMs = hiddenUntil - Date.now();
    if (remainingMs <= 0) {
      window.localStorage.removeItem(storageKey);
      setHiddenUntil(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      window.localStorage.removeItem(storageKey);
      setHiddenUntil(null);
    }, remainingMs);

    return () => window.clearTimeout(timeout);
  }, [hiddenUntil, storageKey]);

  function hideTemporarily() {
    const nextHiddenUntil = Date.now() + DISMISS_DURATION_MS;
    window.localStorage.setItem(storageKey, String(nextHiddenUntil));
    setHiddenUntil(nextHiddenUntil);
  }

  if (!dismissalReady || hiddenUntil || operationsAlerts.length === 0) {
    return null;
  }

  return (
    <div className="sticky top-3 z-40 mb-6 rounded-[30px] border border-[#e7ddd0] bg-[rgba(255,255,255,0.94)] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-[#241c15]">Operations Alerts</div>
          <div className="mt-1 text-sm text-[#7f7263]">
            Important items across jobs and maintenance.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {operationsAlerts.map((alert) => (
            <button
              key={alert.key}
              onClick={alert.onClick}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${alert.key === "maintenance-urgent"
                ? "animate-pulse border-[#b91c1c] bg-[#dc2626] text-white shadow-[0_8px_22px_rgba(185,28,28,0.28)] hover:bg-[#b91c1c]"
                : alert.tone === "red"
                  ? "border-[#fecaca] bg-[#fff1f2] text-[#991b1b] hover:bg-[#ffe4e6]"
                  : alert.tone === "green"
                    ? "border-[#bbdfc0] bg-[#f0fbf2] text-[#236b30] hover:bg-[#e4f7e8]"
                    : "border-[#ecd7a8] bg-[#fff8e8] text-[#8a6112] hover:bg-[#fff2cf]"
                }`}
            >
              <span>{alert.label}</span>
              <span className="rounded-full border border-current/20 px-2 py-0.5 text-[11px]">
                View
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={hideTemporarily}
            aria-label="Hide operations alerts for one hour"
            title="Hide for one hour"
            className="inline-flex items-center rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-2 text-sm font-medium text-[#6f6255] transition hover:bg-white"
          >
            Hide for now
          </button>
        </div>
      </div>
    </div>
  );
}
