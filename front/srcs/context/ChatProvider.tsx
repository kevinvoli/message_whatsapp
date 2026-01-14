
'use client';

import { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { useWebSocketContext } from './WebSocketContext';
import { Conversation, Message } from '@/types/chat';

interface ChatContextProps {
  conversations: Conversation[];
  messages: Message[];
  sendMessage: (message: string) => void;
}

const ChatContext = createContext<ChatContextProps | null>(null);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const { socket } = useWebSocketContext();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (socket) {
      socket.on('conversation:list', (conversations: Conversation[]) => {
        setConversations(conversations);
      });

      socket.on('message:received', (message: Message) => {
        setMessages((prevMessages) => [...prevMessages, message]);
      });

      socket.on('messages:get', (messages: Message[]) => {
        setMessages(messages);
      });
    }

    return () => {
      if (socket) {
        socket.off('conversation:list');
        socket.off('message:received');
        socket.off('messages:get');
      }
    };
  }, [socket]);

  const sendMessage = (message: string) => {
    if (socket) {
      socket.emit('agent:message', { content: message });
    }
  };

  return (
    <ChatContext.Provider value={{ conversations, messages, sendMessage }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
