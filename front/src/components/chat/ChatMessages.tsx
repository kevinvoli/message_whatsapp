import React, { useEffect, useRef } from 'react';
import { Clock, Check, CheckCheck } from 'lucide-react';
import { Conversation, Message } from '@/types/chat';
import { MediaBubble } from '../helper/mediaBubble';
import ChatMessage from './ChatMessage';

interface ChatMessagesProps {
  messages: Message[];
  currentConv: Conversation;
}



const ChatMessages: React.FC<ChatMessagesProps> = ({ messages, currentConv }) => {

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // console.log("message a affiche", messages);

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

  // console.log("le message a afficher coté chate", messages);


  const formatTime = (date: Date) => {
    try {
      // Vérifie si la date est valide avant de la formater
      const d = new Date(date);
      if (isNaN(d.getTime())) {
        return '--:--';
      }
      return d.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '--:--';
    }
  };


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);



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
      <div className="text-center mb-6">
        <div className="inline-block bg-white px-4 py-2 rounded-full shadow-sm">
          <p className="text-xs text-gray-500">Début de la conversation - {currentConv?.createdAt?.toString()}</p>
        </div>
      </div>
      {messages.map((msg, index) => {

        return <ChatMessage key={msg.id} msg={msg} index={index} />

      })}
      </div>
      <div ref={messagesEndRef} />
    </div>

  );
};

export default ChatMessages;