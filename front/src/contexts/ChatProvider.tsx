'use client';
import React, { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction } from 'react';

// Define the shape of the context's value
interface ChatContextType {
  messages: any[];
  setMessages: Dispatch<SetStateAction<any[]>>;
  activeConversation: any;
  setActiveConversation: Dispatch<SetStateAction<any>>;
}

// Create the context with a default value that matches the type
const ChatContext = createContext<ChatContextType>({
  messages: [],
  setMessages: () => {}, // empty function as default
  activeConversation: null,
  setActiveConversation: () => {}, // empty function as default
});

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [activeConversation, setActiveConversation] = useState<any>(null);

  // Add functions to interact with chat state, e.g., sendMessage, setActiveConversation, etc.

  return (
    <ChatContext.Provider value={{ messages, setMessages, activeConversation, setActiveConversation }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);
