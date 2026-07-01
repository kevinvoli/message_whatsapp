import ChatHeader from "./ChatHeader";
import ClientInfoBanner from "./ClientInfoBanner";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";
import { useSocket } from "@/contexts/SocketProvider";
import { PanelTop } from 'lucide-react';
import { useChatStore } from "@/store/chatStore";
import { Phone } from "lucide-react";
import { useEffect } from "react";

interface ChatMainAreaProps {
  panelEnabled?: boolean;
  panelOpen?: boolean;
  onTogglePanel?: () => void;
}

export default function ChatMainArea({ panelEnabled, panelOpen, onTogglePanel }: ChatMainAreaProps = {}) {
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
    sendError,
    setSendError,
  } = useChatStore();

  const totalMessages = selectedConversation ? messages?.length : 0;

  const windowExpiresAt = selectedConversation?.window_expires_at;
  const windowExpired =
    selectedConversation != null &&
    !selectedConversation.channel_dedicated &&
    windowExpiresAt != null &&
    new Date(windowExpiresAt).getTime() <= Date.now();

  const noChannel =
    selectedConversation != null && selectedConversation.source === 'inconnu';

  useEffect(() => {
    if (!sendError) return;
    const timer = setTimeout(() => setSendError(null), 5000);
    return () => clearTimeout(timer);
  }, [sendError, setSendError]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {panelEnabled && (
        <div className="flex justify-end border-b border-gray-100 bg-white px-3 py-1.5">
          <button
            onClick={onTogglePanel}
            title="Panneau médias"
            className={`p-1.5 rounded-lg transition-colors ${panelOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <PanelTop className="w-5 h-5" />
          </button>
        </div>
      )}
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
              <ChatMessages
                messages={messages}
                currentConv={selectedConversation}
              />
            </>
          )}

              <ChatInput
                chat_id={selectedConversation?.chat_id}
                onSendMessage={sendMessage}
                onTypingStart={onTypingStart}
                onTypingStop={onTypingStop}
                isConnected={isWebSocketConnected}
                disabled={!!selectedConversation?.readonly || windowExpired || noChannel || selectedConversation?.status === 'fermé' || selectedConversation?.status === 'converti'}
                windowExpired={windowExpired && !noChannel && selectedConversation?.status !== 'fermé' && selectedConversation?.status !== 'converti'}
                conversationClosed={selectedConversation?.status === 'fermé' || selectedConversation?.status === 'converti'}
                noChannel={noChannel}
                lastClientMessageAt={selectedConversation?.last_client_message_at}
                firstResponseDeadlineAt={selectedConversation?.first_response_deadline_at}
              />

          {error && (
            <div className="bg-red-100 border-t border-red-200 p-2 text-center">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
          {sendError && (
            <div className="bg-red-100 border-t border-red-300 p-2 text-center">
              <p className="text-red-700 text-sm font-medium">{sendError}</p>
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
