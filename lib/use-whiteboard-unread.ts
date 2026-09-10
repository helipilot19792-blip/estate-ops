"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useWhiteboardUnread(organizationId: string | null, userId: string | null) {
  const [state, setState] = useState({ organizationId, userId, count: 0 });
  // Scope acknowledgements to this identity; a failed request remains retryable.
  const acknowledgements = useMemo(() => ({ organizationId, userId, ids: new Set<string>() }), [organizationId, userId]);
  const acknowledged = acknowledgements.ids;
  const refresh = useCallback(async () => {
    if (!organizationId || !userId) return;
    const { data, error } = await supabase.rpc("whiteboard_unread_count", { org: organizationId });
    if (!error) setState({ organizationId, userId, count: Number(data) || 0 });
  }, [organizationId, userId]);
  useEffect(() => {
    // refresh updates state only after the asynchronous database request.
    void refresh();
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(onFocus, 60_000);
    return () => { window.removeEventListener("focus", onFocus); window.clearInterval(timer); };
  }, [refresh]);
  const markSeen = useCallback(async (ids: string[]) => {
    if (!organizationId || !userId || document.visibilityState !== "visible") return;
    const unseen = [...new Set(ids)].filter((id) => !acknowledged.has(id));
    if (!unseen.length) return;
    for (let start = 0; start < unseen.length; start += 500) {
      const batch = unseen.slice(start, start + 500);
      batch.forEach((id) => acknowledged.add(id));
      try {
        const { error } = await supabase.from("admin_whiteboard_task_reads").upsert(
          batch.map((task_id) => ({ profile_id: userId, task_id })),
          { onConflict: "profile_id,task_id", ignoreDuplicates: true }
        );
        if (error) throw error;
      } catch {
        batch.forEach((id) => acknowledged.delete(id));
        return;
      }
    }
    await refresh();
  }, [organizationId, userId, refresh, acknowledged]);
  return { count: state.organizationId === organizationId && state.userId === userId ? state.count : 0, markSeen };
}
