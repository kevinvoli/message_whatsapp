'use client';
import React, { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction } from 'react';

// Define the shape of the context value
interface ChatContextType {
  messages: any[];
  setMessages: Dispatch<SetStateAction<any[]>>;
  activeConversation: any | null;
  setActiveConversation: Dispatch<SetStateAction<any | null>>;
}

// Create the context with a default value that matches the interface
const ChatContext = createContext<ChatContextType>({
  messages: [],
  setMessages: () => {},
  activeConversation: null,
  setActiveConversation: () => {},
});

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [activeConversation, setActiveConversation] = useState<any | null>(null);

  // Add functions to interact with chat state, e.g., sendMessage, setActiveConversation, etc.

  return (
    <ChatContext.Provider value={{ messages, setMessages, activeConversation, setActiveConversation }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);
