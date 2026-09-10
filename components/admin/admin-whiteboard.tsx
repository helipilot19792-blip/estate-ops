"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Task = {
  id: string; title: string; notes: string; due_date: string | null;
  completed_at: string | null; completed_by: string | null;
};

export default function AdminWhiteboard({ organizationId }: { organizationId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const version = useRef(0);
  const mounted = useRef(true);
  const request = useCallback(async (method = "GET", body?: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Please sign in again to open the whiteboard.");
    const response = await fetch(`/api/admin/whiteboard?organizationId=${encodeURIComponent(organizationId)}`, {
      method, cache: "no-store", signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "Whiteboard is temporarily unavailable. Please retry.");
    return result;
  }, [organizationId]);

  const refresh = useCallback(async () => {
    const current = ++version.current;
    try {
      const result = await request();
      if (mounted.current && current === version.current) { setTasks(result.tasks); setError(""); }
    } catch (err) {
      if (mounted.current && current === version.current) setError(err instanceof Error ? err.message : "Could not load tasks.");
    } finally {
      if (mounted.current && current === version.current) setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60_000);
    return () => { mounted.current = false; window.removeEventListener("focus", onFocus); window.clearInterval(timer); };
  }, [refresh]);

  async function addTask(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); version.current++;
    try {
      const result = await request("POST", { title, notes, dueDate });
      if (!mounted.current) return;
      version.current++;
      setTasks((rows) => [result.task, ...rows.filter((row) => row.id !== result.task.id)]);
      setTitle(""); setNotes(""); setDueDate("");
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : "Could not add task."); }
    finally { if (mounted.current) setSaving(false); }
  }

  async function toggle(task: Task) {
    setBusy(task.id); setError(""); version.current++;
    try {
      const result = await request("PATCH", { id: task.id, completed: !task.completed_at });
      if (!mounted.current) return;
      version.current++;
      setTasks((rows) => rows.map((row) => row.id === task.id ? result.task : row));
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : "Could not update task."); }
    finally { if (mounted.current) setBusy(null); }
  }

  const pending = tasks.filter((task) => !task.completed_at);
  const completed = tasks.filter((task) => task.completed_at).sort((a, b) => b.completed_at!.localeCompare(a.completed_at!));
  const inputClass = "w-full rounded-xl border border-[#ded3c4] bg-white px-3 py-2 text-sm text-[#241c15]";
  const row = (task: Task) => (
    <li key={task.id} className={`flex items-start gap-3 rounded-2xl border p-4 ${task.completed_at ? "border-[#e5e7e2] bg-[#f6f8f4] text-[#758071]" : "border-[#eadfce] bg-white text-[#241c15]"}`}>
      <input type="checkbox" checked={!!task.completed_at} disabled={busy !== null}
        onChange={() => void toggle(task)} aria-label={`${task.completed_at ? "Reopen" : "Complete"} ${task.title}`}
        className="mt-1 h-5 w-5 shrink-0 accent-[#2f7d4f]" />
      <div className="min-w-0 flex-1">
        <div className={`break-words font-semibold ${task.completed_at ? "line-through" : ""}`}>{task.title}</div>
        {task.notes ? <p className="mt-1 whitespace-pre-wrap break-words text-sm">{task.notes}</p> : null}
        {task.due_date ? <p className="mt-2 text-xs">Due {new Date(`${task.due_date}T12:00:00`).toLocaleDateString()}</p> : null}
        {task.completed_at ? <p className="mt-2 text-xs">Completed {new Date(task.completed_at).toLocaleString()}</p> : null}
        {busy === task.id ? <p role="status" className="mt-1 text-xs">Saving…</p> : null}
      </div>
    </li>
  );

  return (
    <section className="rounded-[28px] border border-[#eadfce] bg-[#fffdf9] p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-2xl font-semibold text-[#241c15]">Whiteboard</h2><p className="mt-1 text-sm text-[#756656]">Shared tasks · Only this organization’s admins</p></div>
        <button type="button" onClick={() => void refresh()} disabled={saving || busy !== null} className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm disabled:opacity-50">Refresh</button>
      </div>
      {error ? <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      <form onSubmit={(event) => void addTask(event)} className="my-6 space-y-3 rounded-2xl border border-[#eadfce] bg-[#f8f4ed] p-4">
        <label className="block text-sm font-medium">New task<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to be done?" className={`${inputClass} mt-1`} disabled={saving} /></label>
        <details><summary className="cursor-pointer text-sm text-[#6f6255]">Add notes or a due date</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px]">
            <label className="text-sm">Notes<textarea maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} className={`${inputClass} mt-1`} disabled={saving} /></label>
            <label className="text-sm">Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={`${inputClass} mt-1`} disabled={saving} /></label>
          </div>
        </details>
        <button disabled={saving || loading || !title.trim()} className="rounded-full bg-[#241c15] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Adding…" : "Add task"}</button>
      </form>
      {loading ? <p role="status">Loading tasks…</p> : <>
        <h3 className="mb-3 font-semibold">To do ({pending.length})</h3>
        <ul className="space-y-2">{pending.map(row)}</ul>
        {!pending.length ? <p className="rounded-2xl border border-dashed border-[#d8c7ab] p-6 text-sm text-[#756656]">{error ? "Tasks could not be loaded. Use Refresh to try again." : "Nothing outstanding. Add a task above whenever you need one."}</p> : null}
        <details className="mt-6"><summary className="cursor-pointer font-semibold text-[#65735e]">Completed ({completed.length})</summary>
          <ul className="mt-3 space-y-2">{completed.map(row)}</ul>
          {!completed.length ? <p className="mt-3 text-sm text-[#756656]">Checked tasks will appear here. Uncheck a task to reopen it.</p> : null}
        </details>
      </>}
    </section>
  );
}
