"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";

type HelpMessage = {
  role: "user" | "assistant";
  content: string;
};

const STARTER_KEYS = [
  "helpAssistant.starters.property",
  "helpAssistant.starters.stranded",
  "helpAssistant.starters.alerts",
  "helpAssistant.starters.invoices",
] as const;

export default function HelpAssistant() {
  const pathname = usePathname();
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);
  const visibleMessages = useMemo<HelpMessage[]>(
    () =>
      messages.length > 0
        ? messages
        : [
            {
              role: "assistant",
              content: t("helpAssistant.intro"),
            },
          ],
    [messages, t]
  );

  useEffect(() => {
    function handleOpen() {
      setOpen(true);
    }

    window.addEventListener("gulera:open-help-assistant", handleOpen);
    return () => window.removeEventListener("gulera:open-help-assistant", handleOpen);
  }, []);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    const nextMessages: HelpMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/help-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          history: nextMessages.slice(-8),
          page: pathname || "unknown",
          locale,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.answer) {
        throw new Error(data?.error || t("helpAssistant.unavailable"));
      }

      setMessages((current) => [...current, { role: "assistant", content: data.answer }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : t("helpAssistant.tryAgain"),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(input);
  }

  if (!open) return null;

  return (
    <div className="fixed right-4 top-20 z-[90] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 sm:right-5">
        <section className="w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-[22px] border border-[#d8c7ad] bg-white shadow-[0_22px_60px_rgba(36,28,21,0.24)]">
          <div className="flex items-start justify-between gap-3 border-b border-[#eadfce] bg-[#fcfaf7] px-4 py-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8a7b68]">
                {t("helpAssistant.title")}
              </div>
              <h2 className="mt-1 text-base font-semibold tracking-tight text-[#241c15]">
                {t("helpAssistant.heading")}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("helpAssistant.close")}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e0d2bf] bg-white text-lg leading-none text-[#5f5245] transition hover:bg-[#f7f1e8]"
            >
              x
            </button>
          </div>

          <div className="max-h-[min(390px,52vh)] space-y-3 overflow-y-auto bg-[#fcfaf7] p-3">
            {visibleMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-[16px] px-4 py-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "ml-auto max-w-[88%] bg-[#241c15] text-[#f8f2e8]"
                    : "mr-auto max-w-[92%] border border-[#eadfce] bg-white text-[#5f5245]"
                }`}
              >
                {message.content}
              </div>
            ))}
            {loading ? (
              <div className="mr-auto max-w-[92%] rounded-[16px] border border-[#eadfce] bg-white px-4 py-3 text-sm text-[#6f6255]">
                {t("helpAssistant.thinking")}
              </div>
            ) : null}
          </div>

          <div className="border-t border-[#eadfce] bg-white p-3">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {STARTER_KEYS.map((starterKey) => {
                const starter = t(starterKey);
                return (
                <button
                  key={starterKey}
                  type="button"
                  onClick={() => void ask(starter)}
                  disabled={loading}
                  className="shrink-0 rounded-full border border-[#e7ddd0] bg-[#fcfaf7] px-3 py-1.5 text-xs font-medium text-[#5f5245] transition hover:bg-white disabled:opacity-60"
                >
                  {starter}
                </button>
                );
              })}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={t("helpAssistant.inputPlaceholder")}
                className="min-h-11 min-w-0 flex-1 rounded-full border border-[#d8c7ad] bg-white px-4 text-sm text-[#241c15] outline-none transition placeholder:text-[#9a8b7a] focus:border-[#b48d4e] focus:ring-2 focus:ring-[#b48d4e]/20"
              />
              <button
                type="submit"
                disabled={!canSend}
                aria-label={t("helpAssistant.send")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#b48d4e] text-sm font-semibold text-white transition hover:bg-[#9c783f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {">"}
              </button>
            </form>
          </div>
        </section>

    </div>
  );
}
