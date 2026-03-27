import { useCallback, useEffect, useState } from "react";
import ChatHeader from "./ChatHeader";
import ClientInfoBanner from "./ClientInfoBanner";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";
import { useSocket } from "@/contexts/SocketProvider";
import { useChatStore } from "@/store/chatStore";
import { Megaphone, Phone } from "lucide-react";
import { Conversation, ConversationNote, transformToNote } from "@/types/chat";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function ReferralBanner({ conv }: { conv: Conversation }) {
  if (!conv.referral_source_id) return null;
  const label = conv.referral_source_type === 'ad'
    ? 'Client venu via une publicité Meta'
    : conv.referral_source_type === 'post'
    ? 'Client venu via un post Meta'
    : 'Client venu via Meta';
  return (
    <div className="flex items-center gap-2 bg-orange-50 border-b border-orange-100 px-4 py-1.5 text-xs text-orange-700">
      <Megaphone className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="font-medium">{label}</span>
      {conv.referral_headline && (
        <span className="truncate text-orange-500">&ldquo;{conv.referral_headline}&rdquo;</span>
      )}
    </div>
  );
}

export default function ChatMainArea() {
  const { isConnected: isWebSocketConnected } = useSocket();
  const {
    conversations,
    selectedConversation,
    messages,
    isLoading,
    error,
    sendMessage,
    onTypingStart,
    onTypingStop,
  } = useChatStore();

  const [notes, setNotes] = useState<ConversationNote[]>([]);

  const loadNotes = useCallback(async (chatId: string) => {
    try {
      const resp = await fetch(`${API_URL}/conversations/${encodeURIComponent(chatId)}/notes`, {
        credentials: 'include',
      });
      if (resp.ok) {
        const data: unknown[] = await resp.json();
        setNotes(data.map((n) => transformToNote(n as Record<string, unknown>)));
      }
    } catch {
      // silencieux — ne pas bloquer l'UI
    }
  }, []);

  useEffect(() => {
    if (selectedConversation?.chat_id) {
      void loadNotes(selectedConversation.chat_id);
    } else {
      setNotes([]);
    }
  }, [selectedConversation?.chat_id, loadNotes]);

  const handleAddNote = useCallback(async (content: string) => {
    if (!selectedConversation?.chat_id) return;
    try {
      const resp = await fetch(
        `${API_URL}/conversations/${encodeURIComponent(selectedConversation.chat_id)}/notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ content }),
        },
      );
      if (resp.ok) {
        const raw: unknown = await resp.json();
        setNotes((prev) => [...prev, transformToNote(raw as Record<string, unknown>)]);
      }
    } catch {
      // silencieux
    }
  }, [selectedConversation?.chat_id]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    if (!selectedConversation?.chat_id) return;
    try {
      const resp = await fetch(
        `${API_URL}/conversations/${encodeURIComponent(selectedConversation.chat_id)}/notes/${noteId}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (resp.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      }
    } catch {
      // silencieux
    }
  }, [selectedConversation?.chat_id]);

  const totalMessages = selectedConversation ? messages?.length : 0;

  return (
    <div className="flex-1 flex flex-col">
      {selectedConversation ? (
        <>
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
                <p className="text-gray-500">Chargement...</p>
              </div>
            </div>
          ) : (
            <>
              <ChatHeader
                currentConv={selectedConversation}
                totalMessages={totalMessages || 0}
              />
              <ClientInfoBanner currentConv={selectedConversation} />
              <ReferralBanner conv={selectedConversation} />
              <ChatMessages
                messages={messages}
                currentConv={selectedConversation}
                notes={notes}
                onDeleteNote={(id) => void handleDeleteNote(id)}
              />
            </>
          )}

              <ChatInput
                chat_id={selectedConversation?.chat_id}
                onSendMessage={sendMessage}
                onTypingStart={onTypingStart}
                onTypingStop={onTypingStop}
                isConnected={isWebSocketConnected}
                disabled={!!selectedConversation?.readonly}
                onAddNote={handleAddNote}
              />

          {error && (
            <div className="bg-red-100 border-t border-red-200 p-2 text-center">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Phone className="w-20 h-20 mx-auto mb-4 opacity-50" />
            <p className="text-xl font-semibold">
              {conversations.length === 0
                ? 'Aucune conversation disponible'
                : 'Selectionnez une conversation'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
