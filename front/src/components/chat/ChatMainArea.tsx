import { Conversation, Message } from "@/types/chat";
import ChatHeader from "./ChatHeader";
import ClientInfoBanner from "./ClientInfoBanner";
import MessageList from "./MessageList";
import MessageComposer from "./MessageComposer";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";
import { useSocket } from "@/contexts/SocketProvider";
import { useChatStore } from "@/store/chatStore";
import { useCallback } from "react";
import { Phone } from "lucide-react";


export default function ChatMainArea({


}) {

    const { isConnected: isWebSocketConnected } = useSocket();
    const {
        conversations,
        selectedConversation,
        messages,
        isLoading,
        error,
        selectConversation,
        sendMessage,
        onTypingStart,
        onTypingStop,
        loadConversations,

    } = useChatStore();


    const handleSendMessage = useCallback(async (text: string) => {

        if (!selectedConversation) {
            console.error('❌ Impossible d\'envoyer: aucune conversation sélectionnée');
            return;
        }
        console.log("conversation selectionne", selectedConversation);

        sendMessage(text);
    }, [selectedConversation, sendMessage]);

    const totalMessages = selectedConversation ? selectedConversation.messages?.length : 0;
    const totalUnread = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);
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
                            <ChatHeader currentConv={selectedConversation}
                                totalMessages={totalMessages || 0} />
                                
                            <ChatMessages messages={messages} />
                        </>

                    )}

                    <ChatInput
                        chat_id={selectedConversation?.chat_id}
                        onSendMessage={sendMessage}
                        onTypingStart={onTypingStart}
                        onTypingStop={onTypingStop}
                        isConnected={isWebSocketConnected}
                    />

                    {/* Affiche une erreur s'il y en a une */}*
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
                                : 'Sélectionnez une conversation'}
                        </p>
                    </div>
                </div>
            )}



        </div>
    );
}