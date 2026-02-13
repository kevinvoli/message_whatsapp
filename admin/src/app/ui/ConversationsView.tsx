"use client";

import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, User, MessageCircleMore } from 'lucide-react';
import { getMessagesForChat, sendMessage } from '@/app/lib/api'; // Import sendMessage
import { Spinner } from './Spinner';
import { WhatsappChat, WhatsappMessage } from '../lib/definitions';
import { resolveAdminMessageText } from '../lib/utils';
import { useToast } from './ToastProvider';

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
    const [activeTab, setActiveTab] = useState<'conversation' | 'infos'>('conversation');
    const { addToast } = useToast();
    const loadingToastRef = useRef(false);

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
            setActiveTab('conversation');
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

    const getUnreadCount = (chat: WhatsappChat) =>
      chat.unread_count ?? chat.unreadCount ?? 0;

    const formatDateTime = (value?: string | null) =>
      value ? new Date(value).toLocaleString('fr-FR') : '—';

    const formatBool = (value?: boolean) => (value ? 'Oui' : 'Non');

    const resolvePosteLabel = (chat: WhatsappChat) =>
      chat.poste?.name ?? chat.poste_id ?? '—';

    const resolveChannelLabel = (chat: WhatsappChat) =>
      chat.channel?.channel_id ?? chat.channel_id ?? '—';

    const getStatusLabel = (chat: WhatsappChat) =>
      chat.status ? chat.status.replace('_', ' ') : 'attente';

    const formatUptime = (value?: number | null) => {
      if (value === null || value === undefined) return '—';
      const minutes = Math.floor(value / 60);
      if (minutes < 60) return `${minutes} min`;
      const hours = Math.floor(minutes / 60);
      const remaining = minutes % 60;
      return remaining === 0 ? `${hours} h` : `${hours} h ${remaining} min`;
    };

    const formatUptime = (value?: number | null) => {
      if (value === null || value === undefined) return '—';
      const minutes = Math.floor(value / 60);
      if (minutes < 60) return `${minutes} min`;
      const hours = Math.floor(minutes / 60);
      const remaining = minutes % 60;
      return remaining === 0 ? `${hours} h` : `${hours} h ${remaining} min`;
    };

    const DetailItem = ({ label, value }: { label: string; value: string }) => (
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs text-gray-800 text-right">{value}</span>
      </div>
    );

    const InfoCard = ({
      title,
      children,
    }: {
      title: string;
      children: React.ReactNode;
    }) => (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {title}
        </div>
        <div className="space-y-2">{children}</div>
      </div>
    );

    const fetchMessages = async (chatId: string) => {
        // Removed: if (!token) { setError("Authentication token is missing."); return; }
        setLoadingMessages(true);
        if (!loadingToastRef.current) {
            addToast({ type: 'info', message: 'Chargement des messages...' });
            loadingToastRef.current = true;
        }
        try {
            const fetchedMessages = await getMessagesForChat(chatId); // Removed token parameter
            setMessages(fetchedMessages);
        } catch (err) {
            addToast({
                type: 'error',
                message: err instanceof Error ? err.message : "Failed to fetch messages.",
            });
        } finally {
            setLoadingMessages(false);
            loadingToastRef.current = false;
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
            const posteId = selectedChat.poste?.id || selectedChat.poste_id;
            const channelId = selectedChat.channel_id;

            if (!posteId) {
                throw new Error("Impossible d'envoyer: poste_id manquant pour cette conversation.");
            }
            if (!channelId) {
                throw new Error("Impossible d'envoyer: channel_id manquant pour cette conversation.");
            }

            const sentMessage = await sendMessage(
                selectedChat.chat_id,
                currentMessageText,
                posteId,
                channelId
            );

            // Replace optimistic update with actual message from backend
            setMessages(prev => prev.map(msg => msg.id === newMessage.id ? sentMessage : msg));
            onChatUpdated(); // Refresh parent data to update last message etc.
        } catch (err) {
            addToast({
                type: 'error',
                message: err instanceof Error ? err.message : "Failed to send message.",
            });
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
                                        {chat.last_message
                                            ? resolveAdminMessageText(chat.last_message)
                                            : chat.messages && chat.messages.length > 0
                                            ? resolveAdminMessageText(chat.messages[chat.messages.length - 1])
                                            : '[Message client]'}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1 truncate">
                                        {getStatusLabel(chat)} • Poste: {resolvePosteLabel(chat)} • Canal: {resolveChannelLabel(chat)}
                                    </p>
                                </div>
                                {getUnreadCount(chat) > 0 && (
                                    <span className="flex-shrink-0 ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                                        {getUnreadCount(chat)}
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
                                <div className="mt-1 flex flex-wrap gap-2">
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                                        {getStatusLabel(selectedChat)}
                                    </span>
                                    {selectedChat.read_only && (
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
                                            Lecture seule
                                        </span>
                                    )}
                                    {selectedChat.is_archived && (
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                                            Archivée
                                        </span>
                                    )}
                                    {selectedChat.is_muted && (
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                                            Silencieuse
                                        </span>
                                    )}
                                    {selectedChat.is_pinned && (
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                                            Épinglée
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="border-b border-gray-200 bg-white px-4 py-3">
                            <div className="grid grid-cols-2 gap-3">
                                <DetailItem label="Téléphone" value={selectedChat.client_phone ?? selectedChat.contact_client ?? '—'} />
                                <DetailItem label="Contact" value={selectedChat.contact_client ?? '—'} />
                                <DetailItem label="Poste" value={resolvePosteLabel(selectedChat)} />
                                <DetailItem label="Poste code" value={selectedChat.poste?.code ?? '—'} />
                                <DetailItem label="Canal" value={resolveChannelLabel(selectedChat)} />
                                <DetailItem label="Canal uptime" value={formatUptime(selectedChat.channel?.uptime)} />
                                <DetailItem label="Canal version" value={selectedChat.channel?.version ?? '—'} />
                                <DetailItem label="Call status" value={selectedChat.contact?.call_status ?? '—'} />
                                <DetailItem label="Call count" value={String(selectedChat.contact?.call_count ?? 0)} />
                                <DetailItem label="Dernier appel" value={formatDateTime(selectedChat.contact?.last_call_date)} />
                                <DetailItem label="Notes appel" value={selectedChat.contact?.call_notes ?? '—'} />
                                <DetailItem label="Priority" value={selectedChat.contact?.priority ?? '—'} />
                                <DetailItem label="Conversion" value={selectedChat.contact?.conversion_status ?? '—'} />
                                <DetailItem label="Assignée le" value={formatDateTime(selectedChat.assigned_at)} />
                                <DetailItem label="Mode assignation" value={selectedChat.assigned_mode ?? '—'} />
                                <DetailItem label="Deadline 1ère réponse" value={formatDateTime(selectedChat.first_response_deadline_at)} />
                                <DetailItem label="Dernier msg client" value={formatDateTime(selectedChat.last_client_message_at)} />
                                <DetailItem label="Dernier msg poste" value={formatDateTime(selectedChat.last_poste_message_at)} />
                                <DetailItem label="Dernière activité" value={formatDateTime(selectedChat.last_activity_at)} />
                                <DetailItem label="Non lus" value={String(getUnreadCount(selectedChat))} />
                                <DetailItem label="Auto-msg status" value={selectedChat.auto_message_status ?? '—'} />
                                <DetailItem label="Auto-msg step" value={String(selectedChat.auto_message_step ?? 0)} />
                                <DetailItem label="En attente réponse" value={formatBool(selectedChat.waiting_client_reply)} />
                                <DetailItem label="Dernier auto-msg" value={formatDateTime(selectedChat.last_auto_message_sent_at)} />
                                <DetailItem label="Muter jusqu'à" value={formatDateTime(selectedChat.mute_until)} />
                                <DetailItem label="Not spam" value={formatBool(selectedChat.not_spam)} />
                                <DetailItem label="Créée le" value={formatDateTime(selectedChat.createdAt)} />
                                <DetailItem label="Mise à jour" value={formatDateTime(selectedChat.updatedAt)} />
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
                                            <p>{resolveAdminMessageText(msg)}</p>
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
                                className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                                disabled={loadingMessages || !messageInput.trim()}
                            >
                                {loadingMessages ? <Spinner  /> : <Send className="w-5 h-5" />}
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
