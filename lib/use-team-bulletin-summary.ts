"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchTeamBulletinSummary, type TeamBulletinPortal } from "@/lib/team-bulletin";

export function useTeamBulletinSummary(params: {
  portal: TeamBulletinPortal;
  organizationId: string;
  enabled?: boolean;
}) {
  const { portal, organizationId, enabled = true } = params;
  const [conversationId, setConversationId] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  const loadSummary = useCallback(async () => {
    if (!enabled || !organizationId) {
      setConversationId("");
      setUnreadCount(0);
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setConversationId("");
        setUnreadCount(0);
        return;
      }

      const summary = await fetchTeamBulletinSummary({
        accessToken: session.access_token,
        portal,
        organizationId,
      });
      setConversationId(summary.conversationId);
      setUnreadCount(summary.unreadCount);
    } catch {
      setConversationId("");
      setUnreadCount(0);
    }
  }, [enabled, organizationId, portal]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!enabled || !conversationId) return;

    const channel = supabase
      .channel(`team-bulletin-summary-${portal}-${organizationId}-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void loadSummary();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, enabled, loadSummary, organizationId, portal]);

  return {
    conversationId,
    unreadCount,
    setUnreadCount,
    refresh: loadSummary,
  };
}
