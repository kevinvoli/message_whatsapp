"use client";

import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, User, MessageCircleMore } from 'lucide-react';
import { getMessagesForChat, sendMessage } from '@/app/lib/api'; // Import sendMessage
import { Spinner } from './Spinner';

interface ConversationsViewProps {
    initialChats: WhatsappChat[];
    onChatUpdated: () => void;
}

export default function ConversationsView({ initialChats, onChatUpdated }: ConversationsViewProps) {
    const [chats, setChats] = useState<WhatsappChat[]>(initialChats);
    const [selectedChat, setSelectedChat] = useState<WhatsappChat | null>(null);
    const [messages, setMessages] = useState<WhatsappMessage[]>([]);
    const [messageInput, setMessageInput] = useState('');
    const [loadingChats, setLoadingChats] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Removed: const token = typeof window !== 'undefined' ? localStorage.getItem('jwt_token') : null;

    useEffect(() => {
        setChats(initialChats);
        // If a chat was previously selected, try to re-select it to refresh its data
        if (selectedChat) {
            const updatedSelectedChat = initialChats.find(chat => chat.id === selectedChat.id);
            if (updatedSelectedChat) {
                setSelectedChat(updatedSelectedChat);
            } else {
                setSelectedChat(null); // Chat might have been deleted
            }
        }
    }, [initialChats]);

    useEffect(() => {
        if (selectedChat) {
            fetchMessages(selectedChat.chat_id);
        } else {
            setMessages([]);
        }
    }, [selectedChat]);

    useEffect(() => {
        // Scroll to bottom when messages change
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const fetchMessages = async (chatId: string) => {
        // Removed: if (!token) { setError("Authentication token is missing."); return; }
        setLoadingMessages(true);
        setError(null);
        try {
            const fetchedMessages = await getMessagesForChat(chatId); // Removed token parameter
            setMessages(fetchedMessages);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch messages.");
        } finally {
            setLoadingMessages(false);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        // Removed: if (!messageInput.trim() || !selectedChat || !token) { return; }
        if (!messageInput.trim() || !selectedChat) { // Keep checks for messageInput and selectedChat
            return;
        }

        const currentMessageText = messageInput;
        setMessageInput(''); // Clear input immediately for better UX
        scrollToBottom();

        // Optimistic update
        const newMessage: WhatsappMessage = {
            id: `temp-${Date.now()}`,
            chat_id: selectedChat.chat_id,
            text: currentMessageText,
            direction: 'OUT',
            status: 'SENT',
            timestamp: new Date().toISOString(),
            is_deleted: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, newMessage]);


        try {
            // TODO: Dynamically get the actual poste_id for the logged-in admin
            const PLACEHOLDER_POSTE_ID = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'; // Replace with actual poste_id
            const sentMessage = await sendMessage( // Removed token parameter
                selectedChat.chat_id,
                currentMessageText,
                PLACEHOLDER_POSTE_ID,
                selectedChat.channel_id // Assuming channel_id is available on the chat object
            );

            // Replace optimistic update with actual message from backend
            setMessages(prev => prev.map(msg => msg.id === newMessage.id ? sentMessage : msg));
            onChatUpdated(); // Refresh parent data to update last message etc.
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to send message.");
            // Revert optimistic update on error
            setMessages(prev => prev.filter(msg => msg.id !== newMessage.id));
        }
    };

    return (
        <div className="flex h-full bg-gray-100 rounded-lg shadow-sm overflow-hidden">
            {/* Left Panel: Chat List */}
            <div className="w-1/3 border-r border-gray-200 bg-white flex flex-col">
                <div className="p-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <MessageSquare className="w-5 h-5" /> Conversations
                    </h3>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loadingChats ? (
                        <div className="flex justify-center items-center py-4"><Spinner /></div>
                    ) : chats.length === 0 ? (
                        <p className="text-center text-gray-500 py-4">Aucune conversation trouvée.</p>
                    ) : (
                        chats.map(chat => (
                            <div
                                key={chat.id}
                                className={`flex items-center p-4 border-b border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors ${
                                    selectedChat?.id === chat.id ? 'bg-blue-100' : ''
                                }`}
                                onClick={() => setSelectedChat(chat)}
                            >
                                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-blue-800 font-bold">
                                    {chat.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="ml-3 flex-1">
                                    <p className="font-semibold text-gray-800">{chat.name}</p>
                                    <p className="text-sm text-gray-500 truncate">
                                        {/* Display last message text if available */}
                                        {chat.messages && chat.messages.length > 0
                                            ? chat.messages[chat.messages.length - 1].text
                                            : "No messages yet."}
                                    </p>
                                </div>
                                {chat.unread_count > 0 && (
                                    <span className="flex-shrink-0 ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                                        {chat.unread_count}
                                    </span>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Right Panel: Message Area */}
            <div className="w-2/3 flex flex-col bg-gray-50">
                {selectedChat ? (
                    <>
                        <div className="p-4 border-b border-gray-200 bg-white flex items-center">
                            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-blue-800 font-bold">
                                {selectedChat.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="ml-3">
                                <h3 className="font-semibold text-gray-800">{selectedChat.name}</h3>
                                <p className="text-sm text-gray-500">{selectedChat.contact_client}</p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {loadingMessages ? (
                                <div className="flex justify-center items-center h-full"><Spinner /></div>
                            ) : messages.length === 0 ? (
                                <p className="text-center text-gray-500">Aucun message dans cette conversation.</p>
                            ) : (
                                messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex ${msg.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className={`max-w-xs px-4 py-2 rounded-lg shadow ${
                                            msg.direction === 'OUT' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-800'
                                        }`}>
                                            <p>{msg.text}</p>
                                            <span className="block text-right text-xs mt-1 opacity-75">
                                                {new Date(msg.timestamp).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 bg-white flex items-center gap-2">
                            <input
                                type="text"
                                value={messageInput}
                                onChange={(e) => setMessageInput(e.target.value)}
                                placeholder="Écrire un message..."
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={loadingMessages}
                            />
                            <button
                                type="submit"
                                className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
                                disabled={loadingMessages || !messageInput.trim()}
                            >
                                {loadingMessages ? <Spinner size="small" /> : <Send className="w-5 h-5" />}
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col justify-center items-center text-gray-500">
                        <MessageCircleMore className="w-16 h-16 mb-4" />
                        <p className="text-lg">Sélectionnez une conversation pour commencer.</p>
                    </div>
                )}
            </div>
        </div>
    );
}