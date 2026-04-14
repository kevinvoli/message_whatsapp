import React, { useCallback, useEffect, useRef } from 'react';
import { Conversation, Message } from '@/types/chat';
import ChatMessage from './ChatMessage';
import { formatDateLong } from '@/lib/dateUtils';
import { useChatStore } from '@/store/chatStore';

interface ChatMessagesProps {
  messages: Message[];
  currentConv: Conversation;
}



const ChatMessages: React.FC<ChatMessagesProps> = ({ messages, currentConv }) => {

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const { loadMoreMessages, isLoadingMore, hasMoreMessages } = useChatStore();

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = (audioEl: HTMLAudioElement) => {
    if (
      currentAudioRef.current &&
      currentAudioRef.current !== audioEl
    ) {
      currentAudioRef.current.pause();
    }
    currentAudioRef.current = audioEl;
  };

  const handleLoadMore = useCallback(() => {
    loadMoreMessages();
  }, [loadMoreMessages]);

  // Scroll infini — observer le sentinel en haut de la liste
  // Désactivé pour les canaux dédiés (historique non pertinent)
  useEffect(() => {
    if (currentConv.channel_dedicated) return;
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && hasMoreMessages) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [currentConv.channel_dedicated, isLoadingMore, hasMoreMessages, handleLoadMore]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length > 0 && messages[messages.length - 1]?.id]);



  // Si aucun message
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <p className="text-lg">Aucun message</p>
          <p className="text-sm mt-2">Envoyez le premier message pour démarrer la conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
      <div className="max-w-4xl mx-auto space-y-3">
        {/* Sentinel pour le scroll infini (chargement des anciens messages) */}
        {!currentConv.channel_dedicated && hasMoreMessages && (
          <div ref={topSentinelRef} className="flex justify-center py-2">
            {isLoadingMore && (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400" />
            )}
          </div>
        )}
        <div className="text-center mb-6">
          <div className="inline-block bg-white px-4 py-2 rounded-full shadow-sm">
            <p className="text-xs text-gray-500">Début de la conversation - {formatDateLong(currentConv?.createdAt)}</p>
          </div>
        </div>
        {messages.map((msg, index) => (
          <ChatMessage key={msg.id} msg={msg} index={index} />
        ))}
      </div>
      <div ref={messagesEndRef} />
    </div>

  );
};

export default ChatMessages;