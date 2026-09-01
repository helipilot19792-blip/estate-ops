"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Check, Clock3, Lightbulb, RefreshCw, TrendingDown, X } from "lucide-react";
import type { BookingGapSuggestion, BookingSeasonalitySignal } from "@/lib/booking-gap-watch";
import { supabase } from "@/lib/supabase";

type BookingGapWatchPayload = {
  ok: boolean;
  error?: string;
  generatedAt?: string;
  analyzedPropertyCount?: number;
  suggestions?: BookingGapSuggestion[];
  seasonality?: BookingSeasonalitySignal;
  seasonallyConsolidatedCount?: number;
  actionsSupported?: boolean;
};

function formatDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00`);
  const checkout = new Date(`${endDate}T12:00:00`);
  checkout.setDate(checkout.getDate() - 1);
  const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (startDate === checkout.toISOString().slice(0, 10)) return startLabel;
  const endLabel = checkout.toLocaleDateString(undefined, {
    month: start.getMonth() === checkout.getMonth() ? undefined : "short",
    day: "numeric",
  });
  return `${startLabel}–${endLabel}`;
}

function getUrgencyClasses(urgency: BookingGapSuggestion["urgency"]) {
  if (urgency === "high") return "border-[#f2c3b9] bg-[#fff5f2] text-[#9f3d2a]";
  if (urgency === "medium") return "border-[#ecd5a6] bg-[#fff8e8] text-[#8a5a13]";
  return "border-[#cfe1ff] bg-[#f3f8ff] text-[#3563a8]";
}

export default function BookingGapWatch({ organizationId }: { organizationId: string }) {
  const [payload, setPayload] = useState<BookingGapWatchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingKey, setActingKey] = useState("");
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [showEmptyDetails, setShowEmptyDetails] = useState(false);

  const loadSuggestions = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Please sign in again to scan booking gaps.");

      const response = await fetch(
        `/api/admin/booking-gap-suggestions?organizationId=${encodeURIComponent(organizationId)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal }
      );
      const nextPayload = (await response.json().catch(() => null)) as BookingGapWatchPayload | null;
      if (!response.ok || !nextPayload?.ok) {
        throw new Error(nextPayload?.error || "Could not scan booking gaps.");
      }
      setPayload(nextPayload);
      setShowEmptyDetails(false);
    } catch (loadError) {
      if ((loadError as { name?: string })?.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Could not scan booking gaps.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSuggestions(controller.signal);
    return () => controller.abort();
  }, [loadSuggestions]);

  async function actOnSuggestion(
    suggestion: BookingGapSuggestion,
    action: "dismissed" | "snoozed" | "handled"
  ) {
    setActingKey(suggestion.key);
    setError("");
    setMessage("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Please sign in again to update this suggestion.");

      const response = await fetch("/api/admin/booking-gap-suggestions", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          propertyId: suggestion.propertyId,
          suggestionKey: suggestion.key,
          action,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Could not update this suggestion.");
      }

      setPayload((current) => ({
        ...(current ?? { ok: true }),
        suggestions: (current?.suggestions ?? []).filter((item) => item.key !== suggestion.key),
      }));
      setShowEmptyDetails(false);
      setMessage(
        action === "snoozed"
          ? "Suggestion snoozed for 7 days."
          : action === "handled"
            ? "Suggestion marked as handled."
            : "Suggestion dismissed."
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not update this suggestion.");
    } finally {
      setActingKey("");
    }
  }

  const suggestions = useMemo(() => payload?.suggestions ?? [], [payload?.suggestions]);
  const visibleSuggestions = useMemo(
    () => (expanded ? suggestions : suggestions.slice(0, 3)),
    [expanded, suggestions]
  );

  if (payload && suggestions.length === 0 && !loading && !error && !showEmptyDetails) {
    const compactStatus = message
      ? message
      : payload.seasonality?.isSlowSeason
        ? "Slow-season mode · no urgent suggestions"
        : "No promotion suggestions right now";

    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowEmptyDetails(true)}
          className="group inline-flex max-w-full items-center gap-3 rounded-full border border-[#d8c7ab] bg-white/96 px-4 py-2.5 text-left shadow-[0_14px_35px_rgba(36,28,21,0.08)] transition hover:-translate-y-0.5 hover:bg-[#fcfaf7]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff8e8] text-[#9a6b24] ring-1 ring-[#ddc99f]">
            <Lightbulb size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[#241c15]">Booking Gap Watch</span>
            <span className="block truncate text-xs text-[#7f7263]">{compactStatus}</span>
          </span>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f0fbf4] text-[#2f6b3f]">
            <Check size={15} />
          </span>
        </button>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[30px] border border-[#dcc9a7] bg-[#fffdf8] shadow-[0_18px_45px_rgba(96,67,31,0.07)]">
      <div className="border-b border-[#eadfce] bg-[linear-gradient(135deg,#fff8e8_0%,#f8fbff_100%)] px-5 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-[16px] border border-[#ddc99f] bg-white p-2.5 text-[#9a6b24] shadow-sm">
              <Lightbulb size={20} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8a6c3b]">
                Booking Gap Watch
              </p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-[#241c15]">
                Promotion opportunities
              </h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6f6255]">
                Reviews synced reservations for approaching gaps and suggests a manual promotion when a date may need attention.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {payload && suggestions.length === 0 ? (
              <button
                type="button"
                onClick={() => setShowEmptyDetails(false)}
                className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-semibold text-[#5f4c3b] transition hover:bg-[#fcfaf7]"
              >
                Minimize
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void loadSuggestions()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-semibold text-[#5f4c3b] transition hover:bg-[#fcfaf7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              {loading ? "Scanning" : "Scan again"}
            </button>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full border border-[#d6e4f5] bg-[#f5f9ff] px-3 py-1.5 text-[#3563a8]">
            {payload?.analyzedPropertyCount ?? 0} connected propert{payload?.analyzedPropertyCount === 1 ? "y" : "ies"}
          </span>
          <span className="rounded-full border border-[#eadfce] bg-white px-3 py-1.5 text-[#6f6255]">
            Suggestions only · no automatic pricing changes
          </span>
        </div>

        {message ? (
          <div className="mb-4 rounded-[16px] border border-[#bfe1ca] bg-[#f0fbf4] px-4 py-3 text-sm font-medium text-[#27633d]">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mb-4 rounded-[16px] border border-[#f0c7bf] bg-[#fff5f2] px-4 py-3 text-sm text-[#963f2f]">
            {error}
          </div>
        ) : null}

        {payload?.seasonality?.isSlowSeason ? (
          <div className="mb-4 rounded-[20px] border border-[#c9d7ec] bg-[#f4f7fc] p-4 text-[#314765]">
            <div className="flex items-start gap-3">
              <div className="rounded-[14px] border border-[#c9d7ec] bg-white p-2 text-[#4b6590] shadow-sm">
                <TrendingDown size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold">Portfolio slow-season pattern detected</h4>
                  <span className="rounded-full border border-[#c9d7ec] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4b6590]">
                    {payload.seasonality.confidence} confidence
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-[#52657f]">
                  {payload.seasonality.slowingPropertyCount} of {payload.seasonality.evaluatedPropertyCount} properties with enough history show the same slowdown. Currently booked occupancy moved from {payload.seasonality.recentOccupancyPercent}% over the previous 60 nights to {payload.seasonality.upcomingOccupancyPercent}% over the next 30 nights.
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-[#3d526f]">
                  Gap Watch grouped {payload.seasonallyConsolidatedCount ?? 0} routine opening{payload.seasonallyConsolidatedCount === 1 ? "" : "s"} into this summary. Only unusually short or urgent opportunities appear below.
                </p>
                <p className="mt-2 text-xs leading-5 text-[#66778e]">
                  This is a portfolio trend signal, not a revenue forecast. It creates no push or email notifications.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {loading && !payload ? (
          <div className="rounded-[20px] border border-dashed border-[#dcc9a7] bg-white px-5 py-8 text-center text-sm text-[#7f7263]">
            Comparing upcoming reservations and open nights…
          </div>
        ) : visibleSuggestions.length > 0 ? (
          <div className="space-y-3">
            {visibleSuggestions.map((suggestion) => (
              <article key={suggestion.key} className="rounded-[22px] border border-[#e7ddd0] bg-white p-4 shadow-[0_8px_24px_rgba(36,28,21,0.04)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${getUrgencyClasses(suggestion.urgency)}`}>
                        {suggestion.urgency} priority
                      </span>
                      <span className="rounded-full border border-[#e7ddd0] bg-[#fcfaf7] px-2.5 py-1 text-xs font-semibold text-[#6f6255]">
                        {suggestion.propertyName}
                      </span>
                    </div>
                    <h4 className="mt-2 text-base font-semibold text-[#241c15]">{suggestion.title}</h4>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#6f6255]">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarRange size={15} />
                        {formatDateRange(suggestion.startDate, suggestion.endDate)}
                      </span>
                      <span>{suggestion.nights} night{suggestion.nights === 1 ? "" : "s"}</span>
                      <span className="font-semibold text-[#8a5a13]">Suggested: {suggestion.suggestedDiscountPercent}%</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#6f6255]">{suggestion.reason}</p>
                    <p className="mt-1 text-sm font-medium leading-6 text-[#43372c]">{suggestion.recommendation}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-[250px] lg:justify-end">
                    <button
                      type="button"
                      onClick={() => void actOnSuggestion(suggestion, "handled")}
                      disabled={actingKey === suggestion.key || payload?.actionsSupported === false}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#241c15] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#352a21] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Check size={14} /> Mark handled
                    </button>
                    <button
                      type="button"
                      onClick={() => void actOnSuggestion(suggestion, "snoozed")}
                      disabled={actingKey === suggestion.key || payload?.actionsSupported === false}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-3.5 py-2 text-xs font-semibold text-[#5f4c3b] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Clock3 size={14} /> Snooze 7 days
                    </button>
                    <button
                      type="button"
                      onClick={() => void actOnSuggestion(suggestion, "dismissed")}
                      disabled={actingKey === suggestion.key || payload?.actionsSupported === false}
                      className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-2 text-xs font-semibold text-[#7f7263] transition hover:border-[#eadfce] hover:bg-[#fcfaf7] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <X size={14} /> Dismiss
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {suggestions.length > 3 ? (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="w-full rounded-[16px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#6f6255] transition hover:bg-white"
              >
                {expanded ? "Show fewer suggestions" : `Show ${suggestions.length - 3} more suggestion${suggestions.length - 3 === 1 ? "" : "s"}`}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-[20px] border border-dashed border-[#cddfce] bg-[#f7fcf8] px-5 py-7 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#3f7a4e] shadow-sm">
              <Check size={19} />
            </div>
            <p className="mt-3 text-sm font-semibold text-[#315b3c]">
              {payload?.analyzedPropertyCount === 0
                ? "Connect a booking calendar to begin watching for gaps."
                : payload?.seasonality?.isSlowSeason
                  ? "Routine gaps are grouped into the slow-season summary. No unusually urgent opportunity needs separate attention."
                : "No approaching booking gaps need a promotion suggestion right now."}
            </p>
          </div>
        )}

        {payload?.actionsSupported === false ? (
          <p className="mt-4 text-xs text-[#963f2f]">
            Suggestions are visible, but action buttons require the latest database migration.
          </p>
        ) : null}
        <p className="mt-4 text-xs leading-5 text-[#8a7b68]">
          Booking Gap Watch never publishes promotions, changes nightly rates, or contacts guests. Suggested discounts are starting points for manual review.
        </p>
      </div>
    </section>
  );
}
