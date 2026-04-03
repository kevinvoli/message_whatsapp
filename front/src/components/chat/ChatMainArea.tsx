import ChatHeader from "./ChatHeader";
import ClientInfoBanner from "./ClientInfoBanner";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";
import { useSocket } from "@/contexts/SocketProvider";
import { useChatStore } from "@/store/chatStore";
import { Phone } from "lucide-react";

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

  const totalMessages = selectedConversation ? messages?.length : 0;

  // Fenêtre de messagerie 23h : si le client n'a pas écrit depuis plus de 23h,
  // l'envoi de messages ordinaires est interdit côté WhatsApp.
  const WINDOW_MS = 23 * 60 * 60 * 1000;
  const lastClientAt = selectedConversation?.last_client_message_at;
  const windowExpired =
    selectedConversation != null &&
    (!lastClientAt || Date.now() - new Date(lastClientAt).getTime() > WINDOW_MS);

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
                disabled={!!selectedConversation?.readonly || windowExpired || selectedConversation?.status === 'fermé'}
                windowExpired={windowExpired}
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
