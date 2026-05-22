"use client";

import { FormEvent, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type HelpMessage = {
  role: "user" | "assistant";
  content: string;
};

const STARTERS = [
  "How do I set up a new property?",
  "Why would a job be stranded?",
  "How do push alerts work?",
  "Where do owners see invoices?",
];

export default function HelpAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<HelpMessage[]>([
    {
      role: "assistant",
      content: "Ask me how to use GuleraOS. I can help with setup, jobs, chat, invoices, alerts, and portals.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

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
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.answer) {
        throw new Error(data?.error || "The helper could not answer right now.");
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
              : "The helper could not answer right now. Try again in a moment.",
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

  return (
    <div className="fixed bottom-4 right-4 z-[90] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 sm:bottom-5 sm:right-5">
      {open ? (
        <section className="w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-[22px] border border-[#d8c7ad] bg-white shadow-[0_22px_60px_rgba(36,28,21,0.24)]">
          <div className="flex items-start justify-between gap-3 border-b border-[#eadfce] bg-[#fcfaf7] px-4 py-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8a7b68]">
                AI Helper
              </div>
              <h2 className="mt-1 text-base font-semibold tracking-tight text-[#241c15]">Ask about this app</h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close AI helper"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e0d2bf] bg-white text-lg leading-none text-[#5f5245] transition hover:bg-[#f7f1e8]"
            >
              x
            </button>
          </div>

          <div className="max-h-[min(390px,52vh)] space-y-3 overflow-y-auto bg-[#fcfaf7] p-3">
            {messages.map((message, index) => (
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
                Thinking...
              </div>
            ) : null}
          </div>

          <div className="border-t border-[#eadfce] bg-white p-3">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => void ask(starter)}
                  disabled={loading}
                  className="shrink-0 rounded-full border border-[#e7ddd0] bg-[#fcfaf7] px-3 py-1.5 text-xs font-medium text-[#5f5245] transition hover:bg-white disabled:opacity-60"
                >
                  {starter}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask a question..."
                className="min-h-11 min-w-0 flex-1 rounded-full border border-[#d8c7ad] bg-white px-4 text-sm text-[#241c15] outline-none transition placeholder:text-[#9a8b7a] focus:border-[#b48d4e] focus:ring-2 focus:ring-[#b48d4e]/20"
              />
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send AI helper question"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#b48d4e] text-sm font-semibold text-white transition hover:bg-[#9c783f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {">"}
              </button>
            </form>
          </div>
        </section>
      ) : null}

        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={open ? "Close AI helper" : "Open AI helper"}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-[#e8d8bf] bg-[#241c15] text-xl font-semibold text-[#f8f2e8] shadow-[0_14px_35px_rgba(36,28,21,0.24)] transition hover:-translate-y-0.5 hover:bg-[#33271c]"
        >
          ?
        </button>
    </div>
  );
}
