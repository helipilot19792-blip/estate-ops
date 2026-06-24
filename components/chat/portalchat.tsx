"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { TEAM_BULLETIN_CONTEXT_TYPE } from "@/lib/team-bulletin";

type ChatConversationRow = {
  id: string;
  organization_id: string;
  subject: string | null;
  context_type?: string | null;
  last_message_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ChatParticipantRow = {
  id: string;
  organization_id: string;
  conversation_id: string;
  participant_type: "profile" | "owner" | string;
  participant_profile_id?: string | null;
  participant_owner_account_id?: string | null;
  participant_role?: string | null;
  display_name?: string | null;
  email?: string | null;
  last_read_at?: string | null;
  created_at?: string | null;
};

type ChatMessageRow = {
  id: string;
  organization_id: string;
  conversation_id: string;
  sender_profile_id?: string | null;
  body: string;
  created_at?: string | null;
};
type ChatHiddenItemRow = {
  id: string;
  organization_id: string;
  conversation_id: string;
  message_id?: string | null;
  hidden_by_profile_id?: string | null;
  hidden_by_owner_account_id?: string | null;
  hidden_at?: string | null;
};

export type PortalChatParticipant =
  | {
      type: "profile";
      profileId: string;
      displayName?: string | null;
      email?: string | null;
      role?: string | null;
    }
  | {
      type: "owner";
      ownerAccountId: string;
      profileId?: string | null;
      displayName?: string | null;
      email?: string | null;
      role?: string | null;
    };

type PortalChatProps = {
  participant: PortalChatParticipant | null;
  title?: string;
  subtitle?: string;
  className?: string;
  targetConversationId?: string;
  allowStartConversation?: boolean;
  onUnreadCountChange?: (count: number) => void;
  onConversationRead?: (conversationId: string, readAt: string) => void;
};

function formatChatDate(value?: string | null) {
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
    return { ok: false, sent: 0, errors: ["Missing auth token for push notification."] };
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
    sent: Number(payload?.sent || 0),
    errors: Array.isArray(payload?.errors)
      ? payload.errors
      : payload?.error
        ? [String(payload.error)]
        : response.ok
          ? []
          : ["Push notification failed."],
  };
}

async function hideChatItem(conversationId: string, messageId?: string | null) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Missing auth token for chat delete.");
  }

  const response = await fetch("/api/chat/hide", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ conversationId, messageId: messageId || null }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "Could not delete that chat item from your view.");
  }
}

async function startOwnerChat(ownerAccountId: string, subject: string, message: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Missing auth token for chat.");
  }

  const response = await fetch("/api/chat/owner-start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ ownerAccountId, subject, message }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "Could not start chat.");
  }

  return {
    conversationId: String(payload?.conversationId || ""),
    messageId: String(payload?.messageId || ""),
  };
}

export default function PortalChat({
  participant,
  title = "Chat",
  subtitle = "Chat with property management without sending an email for every reply.",
  className = "",
  targetConversationId = "",
  allowStartConversation = false,
  onUnreadCountChange,
  onConversationRead,
}: PortalChatProps) {
  const [authProfileId, setAuthProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [conversations, setConversations] = useState<ChatConversationRow[]>([]);
  const [participants, setParticipants] = useState<ChatParticipantRow[]>([]);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [hiddenItems, setHiddenItems] = useState<ChatHiddenItemRow[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [startSubject, setStartSubject] = useState("");
  const [startBody, setStartBody] = useState("");
  const [realtimeReady, setRealtimeReady] = useState(false);
  const chatThreadScrollRef = useRef<HTMLDivElement | null>(null);

  const participantType = participant?.type || "";
  const participantProfileId = participant?.type === "profile" ? participant.profileId : "";
  const participantOwnerAccountId = participant?.type === "owner" ? participant.ownerAccountId : "";
  const participantOwnerProfileId = participant?.type === "owner" ? participant.profileId || "" : "";
  const participantKey =
    participantType === "profile"
      ? `profile:${participantProfileId}`
      : participantType === "owner"
        ? `owner:${participantOwnerAccountId}`
        : "";

  const loadChat = useCallback(async () => {
    if (!participantType) {
      setConversations([]);
      setParticipants([]);
      setMessages([]);
      setSelectedConversationId("");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setAuthProfileId(user?.id || null);

      let participantQuery = supabase
        .from("chat_participants")
        .select("id,organization_id,conversation_id,participant_type,participant_profile_id,participant_owner_account_id,participant_role,display_name,email,last_read_at,created_at")
        .order("created_at", { ascending: false });

      participantQuery =
        participantType === "profile"
          ? participantQuery.eq("participant_profile_id", participantProfileId)
          : participantQuery.eq("participant_owner_account_id", participantOwnerAccountId);

      const { data: ownParticipantRows, error: ownParticipantError } = await participantQuery;
      if (ownParticipantError) throw ownParticipantError;

      const conversationIds = Array.from(
        new Set((ownParticipantRows || []).map((row) => row.conversation_id).filter(Boolean))
      );

      if (conversationIds.length === 0) {
        setConversations([]);
        setParticipants([]);
        setMessages([]);
        setHiddenItems([]);
        setSelectedConversationId("");
        return;
      }

      const hiddenQuery = supabase
        .from("chat_hidden_items")
        .select("id,organization_id,conversation_id,message_id,hidden_by_profile_id,hidden_by_owner_account_id,hidden_at")
        .in("conversation_id", conversationIds);

      const scopedHiddenQuery =
        participantType === "profile"
          ? hiddenQuery.eq("hidden_by_profile_id", participantProfileId)
          : hiddenQuery.eq("hidden_by_owner_account_id", participantOwnerAccountId);

      const [conversationResult, participantResult, messageResult, hiddenResult] = await Promise.all([
        supabase
          .from("chat_conversations")
          .select("id,organization_id,subject,context_type,last_message_at,created_at,updated_at")
          .in("id", conversationIds)
          .order("updated_at", { ascending: false }),
        supabase
          .from("chat_participants")
          .select("id,organization_id,conversation_id,participant_type,participant_profile_id,participant_owner_account_id,participant_role,display_name,email,last_read_at,created_at")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: true }),
        supabase
          .from("chat_messages")
          .select("id,organization_id,conversation_id,sender_profile_id,body,created_at")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: true }),
        scopedHiddenQuery,
      ]);

      if (conversationResult.error) throw conversationResult.error;
      if (participantResult.error) throw participantResult.error;
      if (messageResult.error) throw messageResult.error;

      const loadedConversations = ((conversationResult.data || []) as ChatConversationRow[]).filter(
        (conversation) => conversation.context_type !== TEAM_BULLETIN_CONTEXT_TYPE
      );
      setConversations(loadedConversations);
      setParticipants((participantResult.data || []) as ChatParticipantRow[]);
      setMessages((messageResult.data || []) as ChatMessageRow[]);
      setHiddenItems(hiddenResult.error ? [] : ((hiddenResult.data || []) as ChatHiddenItemRow[]));
      setSelectedConversationId((current) =>
        targetConversationId && loadedConversations.some((conversation) => conversation.id === targetConversationId)
          ? targetConversationId
          : current && loadedConversations.some((conversation) => conversation.id === current)
            ? current
            : loadedConversations[0]?.id || ""
      );
    } catch (err) {
      setError(getErrorMessage(err, "Could not load chat yet. Make sure the chat SQL has been run."));
    } finally {
      setLoading(false);
    }
  }, [participantOwnerAccountId, participantProfileId, participantType, targetConversationId]);

  useEffect(() => {
    void loadChat();
  }, [loadChat, participantKey]);

  const ownProfileId = participantType === "profile" ? participantProfileId : participantOwnerProfileId || authProfileId;
  const conversationIdsKey = useMemo(
    () => conversations.map((conversation) => conversation.id).sort().join(","),
    [conversations]
  );
  const isConversationHidden = useCallback(
    (conversationId: string) => hiddenItems.some((item) => item.conversation_id === conversationId && !item.message_id),
    [hiddenItems]
  );
  const isMessageHidden = useCallback(
    (messageId: string) => hiddenItems.some((item) => item.message_id === messageId),
    [hiddenItems]
  );
  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => !isConversationHidden(conversation.id)),
    [conversations, isConversationHidden]
  );
  const selectedConversation =
    visibleConversations.find((conversation) => conversation.id === selectedConversationId) ||
    visibleConversations[0] ||
    null;
  const activeConversationId = selectedConversation?.id || "";
  const selectedMessages = useMemo(
    () => messages.filter((message) => message.conversation_id === activeConversationId && !isMessageHidden(message.id)),
    [activeConversationId, isMessageHidden, messages]
  );
  const selectedParticipants = useMemo(
    () => participants.filter((row) => row.conversation_id === activeConversationId),
    [activeConversationId, participants]
  );
  const unreadByConversation = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!ownProfileId) return counts;

    for (const conversation of visibleConversations) {
      const myParticipant = participants.find((row) => {
        if (row.conversation_id !== conversation.id) return false;
        if (participantType === "profile") return row.participant_profile_id === participantProfileId;
        if (participantType === "owner") return row.participant_owner_account_id === participantOwnerAccountId;
        return false;
      });
      const lastReadAt = myParticipant?.last_read_at ? new Date(myParticipant.last_read_at).getTime() : 0;
      if (Number.isNaN(lastReadAt)) continue;

      counts[conversation.id] =
        messages.filter((message) => {
          if (message.conversation_id !== conversation.id) return false;
          if (isMessageHidden(message.id)) return false;
          if (message.sender_profile_id === ownProfileId) return false;
          const createdAt = message.created_at ? new Date(message.created_at).getTime() : 0;
          return createdAt > lastReadAt;
        }).length;
    }

    return counts;
  }, [isMessageHidden, messages, ownProfileId, participantOwnerAccountId, participantProfileId, participantType, participants, visibleConversations]);
  const unreadCount = useMemo(
    () => Object.values(unreadByConversation).reduce((total, count) => total + count, 0),
    [unreadByConversation]
  );

  async function markConversationRead(conversationId: string) {
    if (!conversationId || !ownProfileId) return;

    const readAt = new Date().toISOString();
    onConversationRead?.(conversationId, readAt);
    setParticipants((current) =>
      current.map((row) => {
        if (row.conversation_id !== conversationId) return row;
        if (participantType === "profile" && row.participant_profile_id === participantProfileId) {
          return { ...row, last_read_at: readAt };
        }
        if (participantType === "owner" && row.participant_owner_account_id === participantOwnerAccountId) {
          return { ...row, last_read_at: readAt };
        }
        return row;
      })
    );

    const { error: readError } = await supabase.rpc("mark_chat_conversation_read", {
      conversation_id_to_mark: conversationId,
    });

    if (readError) {
      console.warn("Could not mark chat conversation read", readError);
    }
  }

  useEffect(() => {
    const conversationIds = new Set(conversations.map((conversation) => conversation.id));
    if (!participantKey) {
      setRealtimeReady(false);
      return;
    }

    let channel = supabase.channel(`portal-chat-realtime-${participantKey}`);
    channel = channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_participants",
        filter:
          participantType === "profile"
            ? `participant_profile_id=eq.${participantProfileId}`
            : `participant_owner_account_id=eq.${participantOwnerAccountId}`,
      },
      () => {
        void loadChat();
      }
    );

    if (conversationIds.size > 0) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          const incoming = payload.new as ChatMessageRow;
          if (!conversationIds.has(incoming.conversation_id)) return;

          setHiddenItems((current) =>
            current.filter((item) => !(item.conversation_id === incoming.conversation_id && !item.message_id))
          );
          setMessages((current) =>
            current.some((message) => message.id === incoming.id) ? current : [...current, incoming]
          );
          setConversations((current) =>
            current.map((conversation) =>
              conversation.id === incoming.conversation_id
                ? {
                    ...conversation,
                    last_message_at: incoming.created_at,
                    updated_at: incoming.created_at,
                  }
                : conversation
            )
          );
        }
      );
    }

    channel.subscribe((status) => {
      setRealtimeReady(status === "SUBSCRIBED");
    });

    return () => {
      setRealtimeReady(false);
      void supabase.removeChannel(channel);
    };
  }, [conversationIdsKey, loadChat, participantKey, participantOwnerAccountId, participantProfileId, participantType]);

  useEffect(() => {
    if (!activeConversationId) return;
    void markConversationRead(activeConversationId);
  }, [activeConversationId, selectedMessages.length]);

  useEffect(() => {
    if (!targetConversationId) return;
    if (!visibleConversations.some((conversation) => conversation.id === targetConversationId)) return;
    setSelectedConversationId(targetConversationId);
  }, [targetConversationId, visibleConversations]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [onUnreadCountChange, unreadCount]);

  useEffect(() => {
    const thread = chatThreadScrollRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [activeConversationId, selectedMessages.length]);

  function getOtherParticipants(conversation: ChatConversationRow) {
    return participants.filter((row) => {
      if (row.conversation_id !== conversation.id) return false;
      if (participantType === "profile") return row.participant_profile_id !== participantProfileId;
      if (participantType === "owner") return row.participant_owner_account_id !== participantOwnerAccountId;
      return true;
    });
  }

  function getParticipantLabel(row: ChatParticipantRow | undefined) {
    return row?.display_name || row?.email || row?.participant_role || "Participant";
  }

  function getParticipantRoleLabel(row: ChatParticipantRow | undefined) {
    if (!row) return "participant";
    if (row.participant_type === "owner" || row.participant_role === "owner") return "owner";
    if (row.participant_role === "grounds") return "grounds";
    if (row.participant_role === "cleaner") return "cleaner";
    if (row.participant_role === "admin") return "admin";
    return row.participant_role || row.participant_type || "participant";
  }

  function getParticipantSummary(row: ChatParticipantRow | undefined) {
    if (!row) return "Property management";
    return `${getParticipantLabel(row)} (${getParticipantRoleLabel(row)})`;
  }

  function getConversationOtherSummary(conversation: ChatConversationRow) {
    const others = getOtherParticipants(conversation);
    if (others.length === 0) return "Property management";
    return others.map((row) => getParticipantSummary(row)).join(" | ");
  }

  function getConversationTitle(conversation: ChatConversationRow) {
    if (conversation.subject?.trim()) return conversation.subject.trim();
    return getParticipantLabel(getOtherParticipants(conversation)[0]);
  }

  function getSenderLabel(message: ChatMessageRow) {
    if (message.sender_profile_id && message.sender_profile_id === ownProfileId) return "You";
    const sender = participants.find((row) => row.participant_profile_id === message.sender_profile_id);
    return sender?.display_name || sender?.email || "Property management";
  }

  async function sendReply() {
    const body = replyBody.trim();

    if (!selectedConversation || !ownProfileId) {
      setError("This chat is not linked to your sign-in yet.");
      return;
    }

    if (!body) {
      setError("Write a reply before sending.");
      return;
    }

    setSending(true);
    setError("");

    try {
      const { data: insertedMessage, error: insertError } = await supabase
        .from("chat_messages")
        .insert({
          organization_id: selectedConversation.organization_id,
          conversation_id: selectedConversation.id,
          sender_profile_id: ownProfileId,
          body,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      setReplyBody("");
      const pushResult = insertedMessage?.id ? await notifyChatPush(insertedMessage.id) : null;
      if (pushResult && !pushResult.ok) {
        setError(`Reply sent, but push notification failed: ${pushResult.errors.join(" ")}`);
      }
      await loadChat();
    } catch (err) {
      setError(getErrorMessage(err, "Could not send chat reply."));
    } finally {
      setSending(false);
    }
  }

  async function createOwnerConversation() {
    if (participantType !== "owner" || !participantOwnerAccountId) {
      setError("This chat is not linked to your owner account yet.");
      return;
    }

    const body = startBody.trim();
    if (!body) {
      setError("Write a message before starting a chat.");
      return;
    }

    setSending(true);
    setError("");

    try {
      const result = await startOwnerChat(participantOwnerAccountId, startSubject.trim(), body);
      setStartSubject("");
      setStartBody("");

      const pushResult = result.messageId ? await notifyChatPush(result.messageId) : null;
      if (pushResult && !pushResult.ok) {
        setError(`Chat started, but push notification failed: ${pushResult.errors.join(" ")}`);
      }
      await loadChat();
      if (result.conversationId) setSelectedConversationId(result.conversationId);
    } catch (err) {
      setError(getErrorMessage(err, "Could not start chat."));
    } finally {
      setSending(false);
    }
  }

  async function hideConversationForMe(conversation: ChatConversationRow) {
    const confirmed = window.confirm(
      `Delete "${getConversationTitle(conversation)}" from your chat list?\n\nThis only hides it for you. Other participants will still see the chat.`
    );
    if (!confirmed) return;

    const hiddenItem: ChatHiddenItemRow = {
      id: `local-${conversation.id}`,
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      message_id: null,
      hidden_by_profile_id: participantType === "profile" ? participantProfileId : null,
      hidden_by_owner_account_id: participantType === "owner" ? participantOwnerAccountId : null,
      hidden_at: new Date().toISOString(),
    };

    setHiddenItems((current) =>
      current.some((item) => item.conversation_id === conversation.id && !item.message_id)
        ? current
        : [...current, hiddenItem]
    );

    try {
      await hideChatItem(conversation.id);
    } catch (hideError) {
      setHiddenItems((current) => current.filter((item) => item.id !== hiddenItem.id));
      setError(getErrorMessage(hideError, "Could not delete that chat from your view yet."));
    }
  }

  async function hideMessageForMe(message: ChatMessageRow) {
    const confirmed = window.confirm("Delete this message from your view? Other participants will still see it.");
    if (!confirmed) return;

    const hiddenItem: ChatHiddenItemRow = {
      id: `local-${message.id}`,
      organization_id: message.organization_id,
      conversation_id: message.conversation_id,
      message_id: message.id,
      hidden_by_profile_id: participantType === "profile" ? participantProfileId : null,
      hidden_by_owner_account_id: participantType === "owner" ? participantOwnerAccountId : null,
      hidden_at: new Date().toISOString(),
    };

    setHiddenItems((current) =>
      current.some((item) => item.message_id === message.id) ? current : [...current, hiddenItem]
    );

    try {
      await hideChatItem(message.conversation_id, message.id);
    } catch (hideError) {
      setHiddenItems((current) => current.filter((item) => item.id !== hiddenItem.id));
      setError(getErrorMessage(hideError, "Could not delete that message from your view yet."));
    }
  }

  if (!participant) return null;

  return (
    <section className={`rounded-[30px] border border-white/8 bg-[#15110d] p-5 text-[#f7f1e8] shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:p-6 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#e7c98a]">Chat</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            {unreadCount > 0 ? (
              <span className="rounded-full bg-[#d3322b] px-2 py-0.5 text-xs font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#e6d8bf]">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${
              realtimeReady
                ? "border-emerald-400/30 bg-emerald-950/20 text-emerald-200"
                : "border-[#b08b47]/35 bg-[#b08b47]/10 text-[#f1d9a5]"
            }`}
          >
            {realtimeReady ? "Live" : "Connecting"}
          </span>
          <button
            type="button"
            onClick={() => void loadChat()}
            disabled={loading}
            className="rounded-full border border-[#b08b47]/35 bg-[#b08b47]/10 px-4 py-2 text-sm font-semibold text-[#f1d9a5] transition hover:bg-[#b08b47]/16 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-950/20 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-3">
          {allowStartConversation && participantType === "owner" ? (
            <div className="mb-3 rounded-[20px] border border-[#e3c177]/20 bg-[#e3c177]/8 p-3">
              <div className="text-sm font-semibold text-[#fff8e8]">Start a chat</div>
              <div className="mt-3 grid gap-2">
                <input
                  className="rounded-2xl border border-white/12 bg-[#0f0c09] px-3 py-2 text-sm text-[#f7f1e8] outline-none placeholder:text-[#8f806b] focus:border-[#b08b47]"
                  placeholder="Subject (optional)"
                  value={startSubject}
                  onChange={(event) => setStartSubject(event.target.value)}
                />
                <textarea
                  className="min-h-[92px] rounded-2xl border border-white/12 bg-[#0f0c09] px-3 py-2 text-sm text-[#f7f1e8] outline-none placeholder:text-[#8f806b] focus:border-[#b08b47]"
                  placeholder="Message property management"
                  value={startBody}
                  onChange={(event) => setStartBody(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => void createOwnerConversation()}
                  disabled={sending}
                  className="justify-self-start rounded-full bg-[#e3c177] px-4 py-2 text-sm font-semibold text-[#17120d] transition hover:bg-[#f0d28b] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? "Starting..." : "Start chat"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="px-1 pb-2 text-sm font-semibold">
            {visibleConversations.length} chat{visibleConversations.length === 1 ? "" : "s"}
          </div>
          <div className="space-y-2">
            {visibleConversations.length > 0 ? (
              visibleConversations.map((conversation) => {
                const selected = conversation.id === activeConversationId;
                const otherSummary = getConversationOtherSummary(conversation);
                const conversationUnreadCount = unreadByConversation[conversation.id] || 0;
                const lastMessage = messages
                  .filter((message) => message.conversation_id === conversation.id && !isMessageHidden(message.id))
                  .at(-1);

                return (
                  <div
                    key={conversation.id}
                    className={`rounded-[18px] border transition ${
                      selected
                        ? "border-[#e3c177]/70 bg-[#e3c177]/16 text-[#fff8e8]"
                        : conversationUnreadCount > 0
                          ? "border-[#d3322b]/55 bg-[#d3322b]/12 text-[#f7f1e8]"
                        : "border-white/8 bg-black/15 text-[#f7f1e8] hover:bg-white/[0.05]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedConversationId(conversation.id)}
                      className="block w-full px-3 pt-3 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{getConversationTitle(conversation)}</div>
                        {conversationUnreadCount > 0 ? (
                          <span className="rounded-full bg-[#d3322b] px-2 py-0.5 text-[11px] font-bold text-white">
                            {conversationUnreadCount > 99 ? "99+" : conversationUnreadCount}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs font-medium text-[#f1d9a5]">
                        With: {otherSummary}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs text-[#ccb99a]">
                        {lastMessage?.body || "No replies yet"}
                      </div>
                    </button>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="px-3 pb-3 text-[11px] uppercase tracking-[0.14em] text-[#e7c98a]">
                        {formatChatDate(conversation.last_message_at || conversation.updated_at || conversation.created_at) || "New"}
                      </span>
                      <button
                        type="button"
                        onClick={() => void hideConversationForMe(conversation)}
                        className="mb-3 mr-3 rounded-full border border-red-300/30 bg-red-950/20 px-2 py-1 text-[11px] font-semibold text-red-100 transition hover:bg-red-950/30"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[18px] border border-dashed border-white/12 bg-black/15 px-4 py-5 text-sm leading-6 text-[#e6d8bf]">
                No chats yet. Start a chat or reply when property management messages you.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-white/8 bg-black/15 p-4">
          {selectedConversation ? (
            <>
              <div className="border-b border-white/8 pb-4">
                <h3 className="text-lg font-semibold">{getConversationTitle(selectedConversation)}</h3>
                <div className="mt-1 text-sm text-[#ccb99a]">
                  With: {getConversationOtherSummary(selectedConversation)}
                </div>
                <div className="mt-1 text-xs text-[#9e8f78]">
                  All participants: {selectedParticipants.map((row) => getParticipantSummary(row)).join(" | ")}
                </div>
              </div>

              <div ref={chatThreadScrollRef} className="mt-4 max-h-[380px] space-y-3 overflow-y-auto pr-1">
                {selectedMessages.length > 0 ? (
                  selectedMessages.map((message) => {
                    const isMine = message.sender_profile_id === ownProfileId;

                    return (
                      <div
                        key={message.id}
                        className={`rounded-[18px] border px-4 py-3 ${
                          isMine
                            ? "ml-auto max-w-[86%] border-[#b08b47]/28 bg-[#b08b47]/12"
                            : "mr-auto max-w-[86%] border-white/10 bg-white/[0.04]"
                        }`}
                      >
                        <div className="text-xs font-semibold text-[#e7c98a]">{getSenderLabel(message)}</div>
                        <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#f7f1e8]">{message.body}</div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[#ccb99a]">
                          <span>{formatChatDate(message.created_at)}</span>
                          <button
                            type="button"
                            onClick={() => void hideMessageForMe(message)}
                            className="rounded-full border border-red-300/30 bg-red-950/20 px-2 py-1 font-semibold text-red-100 transition hover:bg-red-950/30"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[18px] border border-dashed border-white/12 bg-white/[0.03] px-4 py-5 text-sm text-[#e6d8bf]">
                    No chat replies yet.
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-3">
                <textarea
                  className="min-h-[110px] rounded-[18px] border border-white/12 bg-[#0f0c09] px-4 py-3 text-sm text-[#f7f1e8] outline-none placeholder:text-[#8f806b] focus:border-[#b08b47]"
                  placeholder="Write a reply"
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => void sendReply()}
                  disabled={sending}
                  className="justify-self-end rounded-full bg-[#e3c177] px-5 py-2.5 text-sm font-semibold text-[#17120d] transition hover:bg-[#f0d28b] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? "Sending..." : "Send reply"}
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-[20px] border border-dashed border-white/12 bg-white/[0.03] px-4 py-8 text-center text-sm text-[#e6d8bf]">
              Choose a chat to read and reply.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
