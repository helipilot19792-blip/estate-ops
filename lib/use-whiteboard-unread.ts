"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useWhiteboardUnread(organizationId: string | null, userId: string | null) {
  const [state, setState] = useState({ organizationId, userId, count: 0 });
  const refresh = useCallback(async () => {
    if (!organizationId || !userId) return;
    const { data, error } = await supabase.rpc("whiteboard_unread_count", { org: organizationId });
    if (!error) setState({ organizationId, userId, count: Number(data) || 0 });
  }, [organizationId, userId]);
  useEffect(() => {
    // refresh updates state only after the asynchronous database request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(onFocus, 60_000);
    return () => { window.removeEventListener("focus", onFocus); window.clearInterval(timer); };
  }, [refresh]);
  const markSeen = useCallback(async (ids: string[]) => {
    if (!organizationId || !userId || document.visibilityState !== "visible") return;
    for (let start = 0; start < ids.length; start += 500) {
      const { error } = await supabase.from("admin_whiteboard_task_reads").upsert(
        ids.slice(start, start + 500).map((task_id) => ({ profile_id: userId, task_id })),
        { onConflict: "profile_id,task_id", ignoreDuplicates: true }
      );
      if (error) return;
    }
    await refresh();
  }, [organizationId, userId, refresh]);
  return { count: state.organizationId === organizationId && state.userId === userId ? state.count : 0, markSeen };
}
