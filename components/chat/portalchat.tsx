"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

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

export default function PortalChat({
  participant,
  title = "Chat",
  subtitle = "Chat with property management without sending an email for every reply.",
  className = "",
}: PortalChatProps) {
  const [authProfileId, setAuthProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [conversations, setConversations] = useState<ChatConversationRow[]>([]);
  const [participants, setParticipants] = useState<ChatParticipantRow[]>([]);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [replyBody, setReplyBody] = useState("");

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
        .select("*")
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
        setSelectedConversationId("");
        return;
      }

      const [conversationResult, participantResult, messageResult] = await Promise.all([
        supabase
          .from("chat_conversations")
          .select("*")
          .in("id", conversationIds)
          .order("updated_at", { ascending: false }),
        supabase
          .from("chat_participants")
          .select("*")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: true }),
        supabase
          .from("chat_messages")
          .select("*")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: true }),
      ]);

      if (conversationResult.error) throw conversationResult.error;
      if (participantResult.error) throw participantResult.error;
      if (messageResult.error) throw messageResult.error;

      const loadedConversations = (conversationResult.data || []) as ChatConversationRow[];
      setConversations(loadedConversations);
      setParticipants((participantResult.data || []) as ChatParticipantRow[]);
      setMessages((messageResult.data || []) as ChatMessageRow[]);
      setSelectedConversationId((current) =>
        current && loadedConversations.some((conversation) => conversation.id === current)
          ? current
          : loadedConversations[0]?.id || ""
      );
    } catch (err) {
      setError(getErrorMessage(err, "Could not load chat yet. Make sure the chat SQL has been run."));
    } finally {
      setLoading(false);
    }
  }, [participantOwnerAccountId, participantProfileId, participantType]);

  useEffect(() => {
    void loadChat();
  }, [loadChat, participantKey]);

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) || conversations[0] || null;
  const activeConversationId = selectedConversation?.id || "";
  const selectedMessages = useMemo(
    () => messages.filter((message) => message.conversation_id === activeConversationId),
    [activeConversationId, messages]
  );
  const selectedParticipants = useMemo(
    () => participants.filter((row) => row.conversation_id === activeConversationId),
    [activeConversationId, participants]
  );

  const ownProfileId = participantType === "profile" ? participantProfileId : participantOwnerProfileId || authProfileId;

  function getConversationTitle(conversation: ChatConversationRow) {
    if (conversation.subject?.trim()) return conversation.subject.trim();
    const otherParticipant = participants.find((row) => {
      if (row.conversation_id !== conversation.id) return false;
      if (participantType === "profile") return row.participant_profile_id !== participantProfileId;
      if (participantType === "owner") return row.participant_owner_account_id !== participantOwnerAccountId;
      return true;
    });

    return otherParticipant?.display_name || otherParticipant?.email || "Property management";
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
      const { error: insertError } = await supabase.from("chat_messages").insert({
        organization_id: selectedConversation.organization_id,
        conversation_id: selectedConversation.id,
        sender_profile_id: ownProfileId,
        body,
      });

      if (insertError) throw insertError;

      setReplyBody("");
      await loadChat();
    } catch (err) {
      setError(getErrorMessage(err, "Could not send chat reply."));
    } finally {
      setSending(false);
    }
  }

  if (!participant) return null;

  return (
    <section className={`rounded-[30px] border border-white/8 bg-[#15110d] p-5 text-[#f7f1e8] shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:p-6 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#e7c98a]">Chat</div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#e6d8bf]">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadChat()}
          disabled={loading}
          className="rounded-full border border-[#b08b47]/35 bg-[#b08b47]/10 px-4 py-2 text-sm font-semibold text-[#f1d9a5] transition hover:bg-[#b08b47]/16 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-950/20 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-3">
          <div className="px-1 pb-2 text-sm font-semibold">
            {conversations.length} chat{conversations.length === 1 ? "" : "s"}
          </div>
          <div className="space-y-2">
            {conversations.length > 0 ? (
              conversations.map((conversation) => {
                const selected = conversation.id === activeConversationId;
                const lastMessage = messages
                  .filter((message) => message.conversation_id === conversation.id)
                  .at(-1);

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelectedConversationId(conversation.id)}
                    className={`w-full rounded-[18px] border px-3 py-3 text-left transition ${
                      selected
                        ? "border-[#e3c177]/70 bg-[#e3c177]/16 text-[#fff8e8]"
                        : "border-white/8 bg-black/15 text-[#f7f1e8] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="truncate text-sm font-semibold">{getConversationTitle(conversation)}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-[#ccb99a]">
                      {lastMessage?.body || "No replies yet"}
                    </div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.14em] text-[#e7c98a]">
                      {formatChatDate(conversation.last_message_at || conversation.updated_at || conversation.created_at) || "New"}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-[18px] border border-dashed border-white/12 bg-black/15 px-4 py-5 text-sm leading-6 text-[#e6d8bf]">
                No chats yet. When admin starts a chat with you, it will show here.
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
                  {selectedParticipants
                    .map((row) => row.display_name || row.email || row.participant_role || "Participant")
                    .join(" | ")}
                </div>
              </div>

              <div className="mt-4 max-h-[380px] space-y-3 overflow-y-auto pr-1">
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
                        <div className="mt-2 text-[11px] text-[#ccb99a]">{formatChatDate(message.created_at)}</div>
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
