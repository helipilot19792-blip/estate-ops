"use client";

import { FormEvent, useMemo, useState } from "react";

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
          page: "help",
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
    <section className="rounded-[24px] border border-[#d8c7ad] bg-white p-5 shadow-[0_14px_32px_rgba(36,28,21,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8a7b68]">
            AI Helper
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#241c15]">Ask how to use the app</h2>
        </div>
        <div className="rounded-full border border-[#e7ddd0] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#6f6255]">
          Uses help files
        </div>
      </div>

      <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] p-3">
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

      <div className="mt-4 flex flex-wrap gap-2">
        {STARTERS.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => void ask(starter)}
            disabled={loading}
            className="rounded-full border border-[#e7ddd0] bg-[#fcfaf7] px-3 py-1.5 text-xs font-medium text-[#5f5245] transition hover:bg-white disabled:opacity-60"
          >
            {starter}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask a question..."
          className="min-h-11 flex-1 rounded-full border border-[#d8c7ad] bg-white px-4 text-sm text-[#241c15] outline-none transition placeholder:text-[#9a8b7a] focus:border-[#b48d4e] focus:ring-2 focus:ring-[#b48d4e]/20"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="min-h-11 rounded-full bg-[#b48d4e] px-5 text-sm font-semibold text-white transition hover:bg-[#9c783f] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Ask
        </button>
      </form>
    </section>
  );
}

