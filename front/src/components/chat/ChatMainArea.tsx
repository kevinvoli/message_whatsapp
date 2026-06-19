import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import ChatHeader from "./ChatHeader";
import ClientInfoBanner from "./ClientInfoBanner";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";
import { useSocket } from "@/contexts/SocketProvider";
import { useChatStore } from "@/store/chatStore";
import { Phone, PanelTop } from "lucide-react";

const GicopReportPanel = dynamic(() => import("./GicopReportPanel"), { ssr: false });

interface ChatMainAreaProps {
  onOpenContact?: () => void;
  panelEnabled?: boolean;
  panelOpen?: boolean;
  onTogglePanel?: () => void;
}

export default function ChatMainArea({ onOpenContact, panelEnabled, panelOpen, onTogglePanel }: ChatMainAreaProps = {}) {
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

  const [showReportPanel, setShowReportPanel] = useState(false);

  // Fermer le panel quand on change de conversation
  useEffect(() => {
    setShowReportPanel(false);
  }, [selectedConversation?.chat_id]);

  const totalMessages = selectedConversation ? messages?.length : 0;

  // Fenêtre de messagerie : le backend expose customerWindowExpiresAt (date d'expiration
  // faisant autorité, 24h normal / 72h CTWA déjà calculés côté serveur).
  // Exception : les canaux dédiés à un poste ne sont pas soumis à cette restriction.
  // On ne bloque la saisie que si la valeur est non-null ET réellement expirée.
  const windowExpiresAt = selectedConversation?.customerWindowExpiresAt;
  const windowExpired =
    selectedConversation != null &&
    !selectedConversation.channel_dedicated &&
    windowExpiresAt != null &&
    new Date(windowExpiresAt).getTime() <= Date.now();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
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
        <div className="flex flex-1 overflow-hidden">
          {/* Zone principale conversation */}
          <div className="flex flex-col flex-1 overflow-hidden">
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
                  onOpenContact={onOpenContact}
                  showReportPanel={showReportPanel}
                  onToggleReport={() => setShowReportPanel((v) => !v)}
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
              channelId={selectedConversation?.source ?? null}
              channelProvider={selectedConversation?.channel_provider ?? null}
              onSendMessage={sendMessage}
              onTypingStart={onTypingStart}
              onTypingStop={onTypingStop}
              isConnected={isWebSocketConnected}
              disabled={!!selectedConversation?.readonly || windowExpired || selectedConversation?.status === 'fermé' || selectedConversation?.status === 'converti'}
              windowExpired={windowExpired && selectedConversation?.status !== 'fermé' && selectedConversation?.status !== 'converti'}
              conversationClosed={selectedConversation?.status === 'fermé' || selectedConversation?.status === 'converti'}
              lastClientMessageAt={selectedConversation?.last_client_message_at}
              firstResponseDeadlineAt={selectedConversation?.first_response_deadline_at}
            />

            {error && (
              <div className="bg-red-100 border-t border-red-200 p-2 text-center">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Panel rapport GICOP (side panel) */}
          {showReportPanel && (
            <GicopReportPanel
              chatId={selectedConversation.chat_id}
              onClose={() => setShowReportPanel(false)}
            />
          )}
        </div>
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
