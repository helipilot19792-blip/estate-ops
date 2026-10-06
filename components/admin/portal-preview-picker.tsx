"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Account = { id: string; portal: "cleaner" | "owner"; name: string; email: string | null };

export default function PortalPreviewPicker({ organizationId }: { organizationId: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Please sign in again.");
        const response = await fetch(`/api/admin/portal-preview?organizationId=${encodeURIComponent(organizationId)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal, cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load portal accounts.");
        if (!controller.signal.aborted) setAccounts(result.accounts);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load portal accounts.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [organizationId]);
  const account = accounts.find(row => `${row.portal}:${row.id}` === selected);
  const url = account ? `/admin/portal-preview?organizationId=${encodeURIComponent(organizationId)}&portal=${account.portal}&accountId=${encodeURIComponent(account.id)}` : "";
  return (
    <section className="rounded-[30px] border border-[#e7ddd0] bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-[#241c15]">View portal as…</h3>
      <p className="mt-1 text-sm leading-6 text-[#7f7263]">Preview a cleaner or owner account in this organization. Changes and messages are disabled, and each preview is recorded in the audit log.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-medium text-[#5f5245]">
          Person or account
          <select value={selected} onChange={event => setSelected(event.target.value)} disabled={loading || Boolean(error)} className="mt-1 block w-full rounded-xl border border-[#d8c7ab] bg-white px-3 py-3">
            <option value="">{loading ? "Loading accounts…" : "Select an account"}</option>
            {accounts.map(row => <option key={`${row.portal}:${row.id}`} value={`${row.portal}:${row.id}`}>{row.name} — {row.portal}{row.email ? ` (${row.email})` : ""}</option>)}
          </select>
        </label>
        {account ? <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#241c15] px-5 py-3 text-center text-sm font-semibold text-white">Open read-only preview ↗</a>
          : <button disabled className="rounded-full bg-[#eee7dc] px-5 py-3 text-sm font-semibold text-[#8a7b68]">Open read-only preview</button>}
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      {!loading && !error && !accounts.length ? <p className="mt-3 text-sm text-[#7f7263]">No cleaner or owner accounts in this organization yet.</p> : null}
    </section>
  );
}
