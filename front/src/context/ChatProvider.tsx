'use client';
import React, { createContext, useContext, useState } from 'react';

const ChatContext = createContext(null);

export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);

  // Add functions to interact with chat state, e.g., sendMessage, setActiveConversation, etc.

  return (
    <ChatContext.Provider value={{ messages, setMessages, activeConversation, setActiveConversation }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);
