"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./whiteboard.module.css";
import WhiteboardCanvas from "@/components/admin/whiteboard-canvas";
import { supabase } from "@/lib/supabase";

type Task = {
  id: string; title: string; notes: string; due_date: string | null;
  assigned_to?: string | null;
  archived_at?: string | null;
  completed_at: string | null; completed_by: string | null;
};

export default function AdminWhiteboard({ organizationId, onDrawingDirtyChange }: { organizationId: string; onDrawingDirtyChange: (dirty: boolean) => void }) {
  const [admins, setAdmins] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [assignedTo, setAssignedTo] = useState("");
  const [adminsError, setAdminsError] = useState("");
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
  const request = useCallback(async (method = "GET", body?: object, resource?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Please sign in again to open the whiteboard.");
    const response = await fetch(`/api/admin/whiteboard?organizationId=${encodeURIComponent(organizationId)}${resource ? `&resource=${encodeURIComponent(resource)}` : ""}`, {
      method, cache: "no-store", signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "Whiteboard is temporarily unavailable. Please retry.");
    return result;
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    request("GET", undefined, "admins").then((result) => {
      if (!cancelled) { setAdmins(result.admins); setAdminsError(""); }
    }).catch((err) => { if (!cancelled) setAdminsError(err instanceof Error ? err.message : "Could not load admins."); });
    return () => { cancelled = true; };
  }, [request]);

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
      const result = await request("POST", { title, notes, dueDate, assignedTo: assignedTo || null });
      if (!mounted.current) return;
      version.current++;
      setTasks((rows) => [result.task, ...rows.filter((row) => row.id !== result.task.id)]);
      setTitle(""); setNotes(""); setDueDate(""); setAssignedTo("");
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : "Could not add task."); }
    finally { if (mounted.current) setSaving(false); }
  }

  async function updateTask(task: Task, changes: { completed?: boolean; assignedTo?: string | null }) {
    setBusy(task.id); setError(""); version.current++;
    try {
      const result = await request("PATCH", { id: task.id, ...changes });
      if (!mounted.current) return;
      version.current++;
      setTasks((rows) => rows.map((row) => row.id === task.id ? result.task : row));
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : "Could not update task."); }
    finally { if (mounted.current) setBusy(null); }
  }

  async function manageHistory(action: "archive" | "restore" | "delete", selected: Task[]) {
    if (!selected.length) return;
    if (action === "delete" && !window.confirm(`Permanently delete ${selected.length === 1 ? `“${selected[0].title}”` : `${selected.length} completed tasks`} for all admins in this organization? This cannot be undone.`)) return;
    setBusy("history"); setError(""); version.current++;
    try {
      // Keep bulk requests bounded, and apply each successful batch immediately.
      for (let start = 0; start < selected.length; start += 500) {
        const result = await request(action === "delete" ? "DELETE" : "PATCH", { action, ids: selected.slice(start, start + 500).map((task) => task.id) });
        if (!mounted.current) return;
        version.current++;
        if (action === "delete") setTasks((rows) => rows.filter((task) => !result.deletedIds.includes(task.id)));
        else setTasks((rows) => rows.map((task) => result.tasks.find((updated: Task) => updated.id === task.id) || task));
      }
      await refresh();
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : "Could not update task history."); }
    finally { if (mounted.current) setBusy(null); }
  }

  const pending = tasks.filter((task) => !task.completed_at);
  const completed = tasks.filter((task) => task.completed_at && !task.archived_at).sort((a, b) => b.completed_at!.localeCompare(a.completed_at!));
  const archived = tasks.filter((task) => task.completed_at && task.archived_at).sort((a, b) => b.archived_at!.localeCompare(a.archived_at!));
  const historyButton = "rounded-lg border border-[#cbd5d0] bg-white/70 px-3 py-1.5 text-xs disabled:opacity-40";
  const inputClass = "w-full rounded-xl border border-[#ded3c4] bg-white px-3 py-2 text-sm text-[#241c15]";
  const row = (task: Task) => (
    <li key={task.id} className={`${styles.note} flex items-start gap-3 rounded-2xl border p-4 ${task.completed_at ? "border-[#e5e7e2] bg-[#f6f8f4] text-[#758071]" : "border-[#eadfce] bg-white text-[#241c15]"}`}>
      <input type="checkbox" checked={!!task.completed_at} disabled={busy !== null}
        onChange={() => void updateTask(task, { completed: !task.completed_at })} aria-label={`${task.completed_at ? "Reopen" : "Complete"} ${task.title}`}
        className="mt-1 h-5 w-5 shrink-0 accent-[#2f7d4f]" />
      <div className="min-w-0 flex-1">
        <div className={`${styles.noteTitle} break-words font-semibold ${task.completed_at ? "line-through" : ""}`}>{task.title}</div>
        {task.notes ? <p className="mt-1 whitespace-pre-wrap break-words text-sm">{task.notes}</p> : null}
        <label className="mt-2 flex flex-wrap items-center gap-2 text-xs">Assigned to
          <select aria-label={`Assign ${task.title}`} value={task.assigned_to || ""} disabled={busy !== null || !!adminsError}
            onChange={(event) => void updateTask(task, { assignedTo: event.target.value || null })} className="max-w-full rounded-lg border border-[#ded3c4] bg-white p-1.5 text-[#241c15]">
            <option value="">Unassigned</option>
            {task.assigned_to && !admins.some((admin) => admin.id === task.assigned_to) ? <option value={task.assigned_to}>Former or unavailable admin</option> : null}
            {admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.full_name || admin.email || "Admin"}</option>)}
          </select>
        </label>
        {task.due_date ? <p className="mt-2 text-xs">Due {new Date(`${task.due_date}T12:00:00`).toLocaleDateString()}</p> : null}
        {task.completed_at ? <p className="mt-2 text-xs">Completed {new Date(task.completed_at).toLocaleString()}</p> : null}
        {task.completed_at ? <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={historyButton} disabled={busy !== null} onClick={() => void manageHistory(task.archived_at ? "restore" : "archive", [task])}>{task.archived_at ? "Restore to completed" : "Archive"}</button>
          <button type="button" className={`${historyButton} text-red-800`} disabled={busy !== null} onClick={() => void manageHistory("delete", [task])}>Delete</button>
        </div> : null}
        {busy === task.id ? <p role="status" className="mt-1 text-xs">Saving…</p> : null}
      </div>
    </li>
  );

  return (
    <section className={styles.board}>
      <div className={`${styles.heading} flex flex-wrap items-center justify-between gap-3`}>
        <div><span className={styles.eyebrow}>ADMIN TEAM · PRIVATE SPACE</span><h2 className={styles.title}>Our whiteboard</h2><p className="mt-2 text-sm text-[#63716c]">A place to sketch ideas, leave notes, and get things done.</p></div>
        <button type="button" onClick={() => void refresh()} disabled={saving || busy !== null} className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm disabled:opacity-50">Refresh</button>
      </div>
      {error ? <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      <WhiteboardCanvas request={request} onDirtyChange={onDrawingDirtyChange} />
      {adminsError ? <p role="alert" className="my-3 text-sm text-red-800">Admin list unavailable: {adminsError}</p> : null}
      <form onSubmit={(event) => void addTask(event)} className={`${styles.composer} my-6 space-y-3 rounded-2xl border border-[#eadfce] bg-[#f8f4ed] p-4`}>
        <div className={styles.sectionTitle}>Leave a note</div>
        <label className="block text-sm font-medium">New task<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to be done?" className={`${inputClass} mt-1`} disabled={saving} /></label>
        <label className="block text-sm">Assign to an admin
          <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} disabled={saving || !!adminsError} className={`${inputClass} mt-1`}>
            <option value="">Unassigned</option>
            {admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.full_name || admin.email || "Admin"}</option>)}
          </select>
        </label>
        <details><summary className="cursor-pointer text-sm text-[#6f6255]">Add notes or a due date</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px]">
            <label className="text-sm">Notes<textarea maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} className={`${inputClass} mt-1`} disabled={saving} /></label>
            <label className="text-sm">Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={`${inputClass} mt-1`} disabled={saving} /></label>
          </div>
        </details>
        <button disabled={saving || loading || !title.trim()} className="rounded-full bg-[#241c15] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Adding…" : "Add task"}</button>
      </form>
      {loading ? <p role="status">Loading tasks…</p> : <>
        <h3 className={`${styles.sectionTitle} mb-5`}>Things to do <span className={styles.count}>{pending.length}</span></h3>
        <ul className={styles.notes}>{pending.map(row)}</ul>
        {!pending.length ? <p className="rounded-2xl border border-dashed border-[#d8c7ab] p-6 text-sm text-[#756656]">{error ? "Tasks could not be loaded. Use Refresh to try again." : "Nothing outstanding. Add a task above whenever you need one."}</p> : null}
        <details className={`${styles.completed} mt-8`}><summary className="cursor-pointer font-semibold text-[#65735e]">Completed ({completed.length})</summary>
          {completed.length > 0 ? <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={historyButton} disabled={busy !== null} onClick={() => void manageHistory("archive", completed)}>Archive all completed</button>
            <button type="button" className={`${historyButton} text-red-800`} disabled={busy !== null} onClick={() => void manageHistory("delete", completed)}>Delete all completed</button>
          </div> : null}
          <ul className={`${styles.notes} mt-5`}>{completed.map(row)}</ul>
          {!completed.length ? <p className="mt-3 text-sm text-[#756656]">Checked tasks will appear here. Uncheck a task to reopen it.</p> : null}
        </details>
        <details className={`${styles.completed} mt-6`}><summary className="cursor-pointer font-semibold text-[#65735e]">Archived ({archived.length})</summary>
          <p className="mt-3 text-sm text-[#756656]">Archived tasks stay here until restored or permanently deleted.</p>
          {archived.length > 0 ? <button type="button" className={`${historyButton} mt-3 text-red-800`} disabled={busy !== null} onClick={() => void manageHistory("delete", archived)}>Delete all archived</button> : null}
          <ul className={`${styles.notes} mt-5`}>{archived.map(row)}</ul>
        </details>
        {busy === "history" ? <p role="status" className="mt-3 text-sm">Updating task history…</p> : null}
      </>}
      <div className={styles.tray} aria-hidden="true">
        <span className={styles.marker} /><span className={styles.marker} /><span className={styles.marker} /><span className={styles.eraser} />
      </div>
    </section>
  );
}
