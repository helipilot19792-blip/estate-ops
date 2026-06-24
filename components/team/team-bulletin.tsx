"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  fetchTeamBulletinSummary,
  TEAM_BULLETIN_RETENTION_DAYS,
  type TeamBulletinPortal,
} from "@/lib/team-bulletin";

type ChatConversationRow = {
  id: string;
  organization_id: string;
  subject: string | null;
  context_type?: string | null;
  updated_at?: string | null;
};

type ChatParticipantRow = {
  id: string;
  organization_id: string;
  conversation_id: string;
  participant_profile_id?: string | null;
  participant_role?: string | null;
  display_name?: string | null;
  email?: string | null;
  last_read_at?: string | null;
};

type ChatMessageRow = {
  id: string;
  organization_id: string;
  conversation_id: string;
  sender_profile_id?: string | null;
  body: string;
  created_at?: string | null;
};

type TeamBulletinProps = {
  portal: TeamBulletinPortal;
  organizationId: string;
  profileId: string;
  displayName?: string | null;
  email?: string | null;
  role?: string | null;
  title?: string;
  subtitle?: string;
  className?: string;
  initialConversationId?: string;
  onUnreadCountChange?: (count: number) => void;
};

function formatBulletinDate(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  return fallback;
}

async function notifyChatPush(messageId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, errors: ["Missing auth token for bulletin notification."] };
  }

  const response = await fetch("/api/chat/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ messageId }),
  });
  const payload = await response.json().catch(() => null);

  return {
    ok: response.ok && payload?.ok !== false,
    errors: Array.isArray(payload?.errors)
      ? payload.errors
      : payload?.error
        ? [String(payload.error)]
        : response.ok
          ? []
          : ["Push notification failed."],
  };
}

async function manageBulletin(params: {
  organizationId: string;
  action: "delete-message" | "clear-board" | "prune-old";
  messageIds?: string[];
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Missing auth token for bulletin management.");
  }

  const response = await fetch("/api/team-bulletin/manage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      organizationId: params.organizationId,
      action: params.action,
      messageIds: params.messageIds || [],
    }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "Could not manage the team bulletin board.");
  }

  return payload;
}

export default function TeamBulletin({
  portal,
  organizationId,
  profileId,
  displayName,
  email,
  role,
  title = "Team Bulletin Board",
  subtitle = "A shared place for updates across admin, cleaners, and grounds.",
  className = "",
  initialConversationId = "",
  onUnreadCountChange,
}: TeamBulletinProps) {
  const [conversation, setConversation] = useState<ChatConversationRow | null>(null);
  const [participants, setParticipants] = useState<ChatParticipantRow[]>([]);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [managingAction, setManagingAction] = useState<"" | "delete-message" | "clear-board" | "prune-old">("");
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const isAdmin = role === "admin";

  const loadBoard = useCallback(async () => {
    if (!organizationId || !profileId) return;

    setLoading(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("No active session was found.");
      }

      const summary = await fetchTeamBulletinSummary({
        accessToken: session.access_token,
        portal,
        organizationId,
      });
      const resolvedConversationId = summary.conversationId || conversationId;
      if (!resolvedConversationId) {
        throw new Error("The team bulletin board is not ready yet.");
      }

      const [conversationResult, participantResult, messageResult] = await Promise.all([
        supabase
          .from("chat_conversations")
          .select("id, organization_id, subject, context_type, updated_at")
          .eq("id", resolvedConversationId)
          .maybeSingle(),
        supabase
          .from("chat_participants")
          .select(
            "id, organization_id, conversation_id, participant_profile_id, participant_role, display_name, email, last_read_at"
          )
          .eq("conversation_id", resolvedConversationId)
          .order("created_at", { ascending: true }),
        supabase
          .from("chat_messages")
          .select("id, organization_id, conversation_id, sender_profile_id, body, created_at")
          .eq("conversation_id", resolvedConversationId)
          .order("created_at", { ascending: true }),
      ]);

      if (conversationResult.error) throw conversationResult.error;
      if (participantResult.error) throw participantResult.error;
      if (messageResult.error) throw messageResult.error;

      setConversationId(resolvedConversationId);
      setConversation(conversationResult.data as ChatConversationRow | null);
      setParticipants((participantResult.data ?? []) as ChatParticipantRow[]);
      setMessages((messageResult.data ?? []) as ChatMessageRow[]);
      onUnreadCountChange?.(summary.unreadCount);
    } catch (err) {
      setError(getErrorMessage(err, "Could not load the team bulletin board yet."));
    } finally {
      setLoading(false);
    }
  }, [conversationId, onUnreadCountChange, organizationId, portal, profileId]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const myParticipant = useMemo(
    () => participants.find((participant) => participant.participant_profile_id === profileId) || null,
    [participants, profileId]
  );

  const unreadCount = useMemo(() => {
    const lastReadAt = myParticipant?.last_read_at ? new Date(myParticipant.last_read_at).getTime() : 0;
    if (Number.isNaN(lastReadAt)) return 0;

    return messages.filter((message) => {
      if (message.sender_profile_id === profileId) return false;
      const createdAt = message.created_at ? new Date(message.created_at).getTime() : 0;
      return createdAt > lastReadAt;
    }).length;
  }, [messages, myParticipant?.last_read_at, profileId]);

  async function markRead() {
    if (!conversationId || !profileId || unreadCount === 0) return;

    const readAt = new Date().toISOString();
    setParticipants((current) =>
      current.map((participant) =>
        participant.participant_profile_id === profileId ? { ...participant, last_read_at: readAt } : participant
      )
    );
    onUnreadCountChange?.(0);

    const { error: readError } = await supabase.rpc("mark_chat_conversation_read", {
      conversation_id_to_mark: conversationId,
    });

    if (readError) {
      console.warn("Could not mark bulletin read", readError);
    }
  }

  useEffect(() => {
    if (!conversationId) return;
    void markRead();
  }, [conversationId, messages.length]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [onUnreadCountChange, unreadCount]);

  useEffect(() => {
    if (!conversationId) {
      setRealtimeReady(false);
      return;
    }

    let channel = supabase.channel(`team-bulletin-${portal}-${conversationId}`);
    channel = channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const incoming = payload.new as ChatMessageRow;
        setMessages((current) => (current.some((message) => message.id === incoming.id) ? current : [...current, incoming]));
        setConversation((current) =>
          current ? { ...current, updated_at: incoming.created_at || current.updated_at } : current
        );
      }
    );
    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "chat_participants",
        filter: `conversation_id=eq.${conversationId}`,
      },
      () => {
        void loadBoard();
      }
    );

    channel.subscribe((status) => {
      setRealtimeReady(status === "SUBSCRIBED");
    });

    return () => {
      setRealtimeReady(false);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, loadBoard, portal]);

  useEffect(() => {
    const thread = threadScrollRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [messages.length]);

  async function sendMessage() {
    const body = messageBody.trim();
    if (!conversationId || !organizationId || !profileId) {
      setError("This bulletin board is not linked to your sign-in yet.");
      return;
    }

    if (!body) {
      setError("Write an update before posting.");
      return;
    }

    setSending(true);
    setError("");

    try {
      const { data: insertedMessage, error: insertError } = await supabase
        .from("chat_messages")
        .insert({
          organization_id: organizationId,
          conversation_id: conversationId,
          sender_profile_id: profileId,
          body,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      setMessageBody("");
      onUnreadCountChange?.(0);
      const pushResult = insertedMessage?.id ? await notifyChatPush(insertedMessage.id) : null;
      if (pushResult && !pushResult.ok) {
        setError(`Post sent, but push notification failed: ${pushResult.errors.join(" ")}`);
      }
      await loadBoard();
    } catch (err) {
      setError(getErrorMessage(err, "Could not post to the team bulletin board."));
    } finally {
      setSending(false);
    }
  }

  function getSenderLabel(message: ChatMessageRow) {
    if (message.sender_profile_id === profileId) return "You";
    const sender = participants.find((participant) => participant.participant_profile_id === message.sender_profile_id);
    return sender?.display_name || sender?.email || "Team member";
  }

  async function deleteMessage(messageId: string) {
    if (!isAdmin) return;
    const confirmed = window.confirm("Delete this bulletin post for everyone?");
    if (!confirmed) return;

    setManagingAction("delete-message");
    setError("");

    try {
      await manageBulletin({
        organizationId,
        action: "delete-message",
        messageIds: [messageId],
      });
      await loadBoard();
    } catch (err) {
      setError(getErrorMessage(err, "Could not delete that bulletin post."));
    } finally {
      setManagingAction("");
    }
  }

  async function clearBoard() {
    if (!isAdmin) return;
    const confirmed = window.confirm("Clear the entire bulletin board for everyone?");
    if (!confirmed) return;

    setManagingAction("clear-board");
    setError("");

    try {
      await manageBulletin({
        organizationId,
        action: "clear-board",
      });
      await loadBoard();
      onUnreadCountChange?.(0);
    } catch (err) {
      setError(getErrorMessage(err, "Could not clear the bulletin board."));
    } finally {
      setManagingAction("");
    }
  }

  async function pruneOldPosts() {
    if (!isAdmin) return;

    setManagingAction("prune-old");
    setError("");

    try {
      await manageBulletin({
        organizationId,
        action: "prune-old",
      });
      await loadBoard();
    } catch (err) {
      setError(getErrorMessage(err, "Could not remove older bulletin posts."));
    } finally {
      setManagingAction("");
    }
  }

  const teamLabel = role === "admin" ? "Admin" : role === "grounds" ? "Grounds" : "Cleaner";

  return (
    <section className={`rounded-[30px] border border-white/8 bg-[#15110d] p-5 text-[#f7f1e8] shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:p-6 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#e7c98a]">Team</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                realtimeReady
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : "border-[#e3c177]/30 bg-[#e3c177]/10 text-[#f0d8a7]"
              }`}
            >
              {realtimeReady ? "Live" : "Connecting"}
            </span>
            {unreadCount > 0 ? (
              <span className="rounded-full border border-[#f59e0b]/40 bg-[#f59e0b]/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#fcd38d]">
                {unreadCount > 99 ? "99+" : unreadCount} new
              </span>
            ) : null}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#d9cbb6]">{subtitle}</p>
        </div>
        <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#e9dece]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#cdb58c]">{teamLabel}</div>
          <div className="mt-1 font-medium">{displayName || email || "Signed in"}</div>
        </div>
      </div>

      {isAdmin ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-black/10 px-4 py-3 text-sm text-[#d9cbb6]">
          <div>Posts older than {TEAM_BULLETIN_RETENTION_DAYS} days are removed automatically.</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void pruneOldPosts()}
              disabled={managingAction !== ""}
              className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#f7f1e8] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {managingAction === "prune-old" ? "Removing old posts..." : "Remove old posts"}
            </button>
            <button
              type="button"
              onClick={() => void clearBoard()}
              disabled={managingAction !== ""}
              className="rounded-full border border-rose-300/30 bg-rose-950/20 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-950/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {managingAction === "clear-board" ? "Clearing..." : "Clear board"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-[20px] border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <div className="mt-6 rounded-[26px] border border-white/8 bg-[#100d0a] p-4 sm:p-5">
        <div
          ref={threadScrollRef}
          className="max-h-[440px] space-y-3 overflow-y-auto rounded-[20px] border border-white/8 bg-black/10 p-3 sm:p-4"
        >
          {loading ? (
            <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-5 text-sm text-[#d9cbb6]">
              Loading bulletin posts...
            </div>
          ) : messages.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm text-[#d9cbb6]">
              No posts yet. The first update here becomes visible to admin, cleaners, and grounds.
            </div>
          ) : (
            messages.map((message) => {
              const mine = message.sender_profile_id === profileId;
              return (
                <article
                  key={message.id}
                  className={`rounded-[20px] border px-4 py-3 ${
                    mine
                      ? "ml-auto max-w-[92%] border-[#c59a43]/30 bg-[#3b2a12] text-[#fff7ea]"
                      : "mr-auto max-w-[92%] border-white/10 bg-white/5 text-[#f7f1e8]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{getSenderLabel(message)}</div>
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[#cdb58c]">
                        {formatBulletinDate(message.created_at)}
                      </div>
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => void deleteMessage(message.id)}
                          disabled={managingAction !== ""}
                          className="rounded-full border border-rose-300/30 bg-rose-950/20 px-2 py-1 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-950/30 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-inherit">{message.body}</div>
                </article>
              );
            })
          )}
        </div>

        <div className="mt-4 rounded-[20px] border border-white/10 bg-white/5 p-3 sm:p-4">
          <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#cdb58c]">
            Post to the whole team
          </label>
          <textarea
            value={messageBody}
            onChange={(event) => setMessageBody(event.target.value)}
            rows={4}
            placeholder="Share a heads-up, schedule change, reminder, or update."
            className="mt-3 w-full rounded-[18px] border border-white/10 bg-[#0f0c09] px-4 py-3 text-sm text-[#f7f1e8] outline-none transition placeholder:text-[#8d7d68] focus:border-[#e3c177]/45"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[#cdb58c]">
              Visible to admin, cleaners, and grounds. Owners cannot see this board.
            </div>
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={sending}
              className="rounded-full border border-[#c59a43]/40 bg-[#d8a94b] px-4 py-2 text-sm font-semibold text-[#2f230f] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Posting..." : "Post update"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
