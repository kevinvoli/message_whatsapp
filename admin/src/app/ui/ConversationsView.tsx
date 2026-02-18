"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Send, User, MessageCircleMore, UserRound, Briefcase, Activity, Wifi, PhoneCall, BadgeCheck, Settings, RefreshCw, Lock, Image, Video, Mic, FileText, MapPin } from 'lucide-react';
import { getMessagesForChat, sendMessage } from '@/app/lib/api';
import { Spinner } from './Spinner';
import { WhatsappChat, WhatsappMessage } from '../lib/definitions';
import { resolveAdminMessageText } from '../lib/utils';
import { useToast } from './ToastProvider';
import { useRealtimePolling } from '@/app/hooks/useRealtimePolling';
import { formatDate, formatTime } from '@/app/lib/dateUtils';

interface ConversationsViewProps {
    initialChats: WhatsappChat[];
    onChatUpdated: () => void;
    onRefresh?: () => void;
}

export default function ConversationsView({ initialChats, onChatUpdated, onRefresh }: ConversationsViewProps) {
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
      value ? formatDate(value) : '—';

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


    const badgeClass = (value?: string | null) => {
      if (!value) return 'bg-gray-100 text-gray-700';
      const v = String(value).toLowerCase();
      if (v.includes('actif') || v.includes('online') || v.includes('oui')) {
        return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      }
      if (v.includes('attente') || v.includes('pending') || v.includes('rappeler')) {
        return 'bg-amber-50 text-amber-800 border border-amber-100';
      }
      if (v.includes('fermé') || v.includes('ferme') || v.includes('offline') || v.includes('non')) {
        return 'bg-slate-100 text-slate-700 border border-slate-200';
      }
      if (v.includes('haute') || v.includes('urgent')) {
        return 'bg-rose-50 text-rose-700 border border-rose-100';
      }
      if (v.includes('moyenne')) {
        return 'bg-blue-50 text-blue-700 border border-blue-100';
      }
      if (v.includes('basse')) {
        return 'bg-slate-50 text-slate-700 border border-slate-200';
      }
      if (v.includes('client') || v.includes('converti') || v.includes('prospect')) {
        return 'bg-violet-50 text-violet-700 border border-violet-100';
      }
      return 'bg-gray-100 text-gray-700';
    };

    const DetailItem = ({
      label,
      value,
      badge,
    }: {
      label: string;
      value: string;
      badge?: boolean;
    }) => (
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-slate-500">{label}</span>
        {badge ? (
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${badgeClass(value)}`}>
            {value}
          </span>
        ) : (
          <span className="text-[11px] text-slate-800 text-right">{value}</span>
        )}
      </div>
    );

    const InfoCard = ({
      title,
      icon: Icon,
      accent,
      children,
    }: {
      title: string;
      icon: React.ElementType;
      accent: string;
      children: React.ReactNode;
    }) => (
      <div className="bg-white rounded-md border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06)] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-md flex items-center justify-center ${accent}`}>
              <Icon className="w-3.5 h-3.5" />
            </span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              {title}
            </span>
          </div>
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
        console.log("une foi ici 11111111111111111111111111");
        
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

            console.log("222222222222222222222222222222222222222222222222222");
            
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

    // Silent polling for new messages in the selected chat
    const pollMessages = useCallback(async () => {
        if (!selectedChat) return;
        try {
            const fetched = await getMessagesForChat(selectedChat.chat_id);
            setMessages(prev => {
                // Only update if count changed to avoid unnecessary re-renders
                if (fetched.length !== prev.length) return fetched;
                const lastFetched = fetched[fetched.length - 1];
                const lastCurrent = prev[prev.length - 1];
                if (lastFetched?.id !== lastCurrent?.id) return fetched;
                return prev;
            });
        } catch {
            // Silent fail
        }
    }, [selectedChat]);

    useRealtimePolling(pollMessages, { interval: 3000, enabled: !!selectedChat });

    return (
        <div className="h-full flex flex-col gap-3">
            <div className="flex items-center justify-end">
                {onRefresh && (
                    <button
                        type="button"
                        onClick={onRefresh}
                        title="Rafraîchir"
                        aria-label="Rafraîchir"
                        className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                )}
            </div>
            <div className="flex h-full bg-slate-100 rounded-lg shadow-sm overflow-hidden">
            {/* Left Panel: Chat List */}
            <div className="w-1/3 border-r border-gray-200 bg-white flex flex-col">
                <div className="p-4 border-b border-slate-200 sticky top-0 bg-white z-10">
                    <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
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
                                className={`flex items-center p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors ${
                                    selectedChat?.id === chat.id ? 'bg-slate-100 border-l-2 border-l-slate-900' : ''
                                }`}
                                onClick={() => setSelectedChat(chat)}
                            >
                                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-blue-800 font-bold">
                                    {chat.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="ml-3 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <p className="font-semibold text-slate-800 text-sm">{chat.name}</p>
                                        {chat.read_only && (
                                            <span title="Lecture seule"><Lock className="w-3 h-3 text-amber-600 flex-shrink-0" /></span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 truncate">
                                        {chat.last_message
                                            ? resolveAdminMessageText(chat.last_message)
                                            : chat.messages && chat.messages.length > 0
                                            ? resolveAdminMessageText(chat.messages[chat.messages.length - 1])
                                            : '[Message client]'}
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-1 truncate">
                                        {getStatusLabel(chat)} • Poste: {resolvePosteLabel(chat)} • Canal: {resolveChannelLabel(chat)}
                                    </p>
                                </div>
                                {getUnreadCount(chat) > 0 && (
                                    <span className="flex-shrink-0 ml-2 px-2 py-0.5 bg-slate-900 text-white text-[11px] rounded-full">
                                        {getUnreadCount(chat)}
                                    </span>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Right Panel: Message Area */}
            <div className="w-2/3 flex flex-col bg-slate-50">
                {selectedChat ? (
                    <>
                        <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between gap-4 sticky top-0 z-10">
                            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-blue-800 font-bold">
                                {selectedChat.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="ml-3">
                                <h3 className="font-semibold text-slate-800">{selectedChat.name}</h3>
                                <p className="text-sm text-slate-500">{selectedChat.contact_client}</p>
                                <div className="mt-1 flex flex-wrap gap-2">
                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                        {getStatusLabel(selectedChat)}
                                    </span>
                                    {selectedChat.read_only && (
                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-100">
                                            Lecture seule
                                        </span>
                                    )}
                                    {selectedChat.is_archived && (
                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                            Archivée
                                        </span>
                                    )}
                                    {selectedChat.is_muted && (
                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                            Silencieuse
                                        </span>
                                    )}
                                    {selectedChat.is_pinned && (
                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                                            Épinglée
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('conversation')}
                                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                                        activeTab === 'conversation'
                                            ? 'bg-slate-900 text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    Conversation
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('infos')}
                                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                                        activeTab === 'infos'
                                            ? 'bg-slate-900 text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    Infos
                                </button>
                            </div>
                        </div>

                        {activeTab === 'infos' && (
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <InfoCard title="Client" icon={UserRound} accent="bg-emerald-50 text-emerald-700 border border-emerald-100">
                                        <div className="divide-y divide-slate-100">
                                            <div className="pb-2">
                                                <DetailItem label="Nom" value={selectedChat.name ?? '—'} />
                                            </div>
                                            <div className="pt-2 space-y-2">
                                                <DetailItem label="Téléphone" value={selectedChat.client_phone ?? selectedChat.contact_client ?? '—'} />
                                                <DetailItem label="Contact" value={selectedChat.contact_client ?? '—'} />
                                                <DetailItem label="Statut" value={getStatusLabel(selectedChat)} badge />
                                                <DetailItem label="Non lus" value={String(getUnreadCount(selectedChat))} />
                                            </div>
                                        </div>
                                    </InfoCard>

                                    <InfoCard title="Affectation" icon={Briefcase} accent="bg-blue-50 text-blue-700 border border-blue-100">
                                        <div className="divide-y divide-slate-100">
                                            <div className="pb-2">
                                                <DetailItem label="Poste" value={resolvePosteLabel(selectedChat)} />
                                            </div>
                                            <div className="pt-2 space-y-2">
                                                <DetailItem label="Poste code" value={selectedChat.poste?.code ?? '—'} />
                                                <DetailItem label="Assignée le" value={formatDateTime(selectedChat.assigned_at)} />
                                                <DetailItem label="Mode assignation" value={selectedChat.assigned_mode ?? '—'} badge />
                                                <DetailItem label="Deadline 1ère réponse" value={formatDateTime(selectedChat.first_response_deadline_at)} />
                                            </div>
                                        </div>
                                    </InfoCard>

                                    <InfoCard title="Activité" icon={Activity} accent="bg-amber-50 text-amber-800 border border-amber-100">
                                        <div className="divide-y divide-slate-100">
                                            <div className="pb-2 space-y-2">
                                                <DetailItem label="Dernier msg client" value={formatDateTime(selectedChat.last_client_message_at)} />
                                                <DetailItem label="Dernier msg poste" value={formatDateTime(selectedChat.last_poste_message_at)} />
                                                <DetailItem label="Dernière activité" value={formatDateTime(selectedChat.last_activity_at)} />
                                            </div>
                                            <div className="pt-2 space-y-2">
                                                <DetailItem label="Lecture seule" value={formatBool(selectedChat.read_only)} badge />
                                                <DetailItem label="Archivée" value={formatBool(selectedChat.is_archived)} badge />
                                                <DetailItem label="Silencieuse" value={formatBool(selectedChat.is_muted)} badge />
                                                <DetailItem label="Épinglée" value={formatBool(selectedChat.is_pinned)} badge />
                                            </div>
                                        </div>
                                    </InfoCard>

                                    <InfoCard title="Canal" icon={Wifi} accent="bg-slate-50 text-slate-700 border border-slate-200">
                                        <div className="divide-y divide-slate-100">
                                            <div className="pb-2">
                                                <DetailItem label="Canal" value={resolveChannelLabel(selectedChat)} />
                                            </div>
                                            <div className="pt-2 space-y-2">
                                                <DetailItem label="Uptime" value={formatUptime(selectedChat.channel?.uptime)} />
                                                <DetailItem label="Version" value={selectedChat.channel?.version ?? '—'} />
                                                <DetailItem label="API" value={selectedChat.channel?.api_version ?? '—'} />
                                                <DetailItem label="Core" value={selectedChat.channel?.core_version ?? '—'} />
                                            </div>
                                        </div>
                                    </InfoCard>

                                    <InfoCard title="Appels" icon={PhoneCall} accent="bg-rose-50 text-rose-700 border border-rose-100">
                                        <div className="divide-y divide-slate-100">
                                            <div className="pb-2">
                                                <DetailItem label="Call status" value={selectedChat.contact?.call_status ?? '—'} badge />
                                            </div>
                                            <div className="pt-2 space-y-2">
                                                <DetailItem label="Call count" value={String(selectedChat.contact?.call_count ?? 0)} />
                                                <DetailItem label="Dernier appel" value={formatDateTime(selectedChat.contact?.last_call_date)} />
                                                <DetailItem label="Notes appel" value={selectedChat.contact?.call_notes ?? '—'} />
                                            </div>
                                        </div>
                                    </InfoCard>

                                    <InfoCard title="Qualification" icon={BadgeCheck} accent="bg-violet-50 text-violet-700 border border-violet-100">
                                        <div className="divide-y divide-slate-100">
                                            <div className="pb-2 space-y-2">
                                                <DetailItem label="Priority" value={selectedChat.contact?.priority ?? '—'} badge />
                                                <DetailItem label="Conversion" value={selectedChat.contact?.conversion_status ?? '—'} badge />
                                                <DetailItem label="Not spam" value={formatBool(selectedChat.not_spam)} badge />
                                            </div>
                                            <div className="pt-2 space-y-2">
                                                <DetailItem label="Auto-msg status" value={selectedChat.auto_message_status ?? '—'} badge />
                                                <DetailItem label="Auto-msg step" value={String(selectedChat.auto_message_step ?? 0)} />
                                                <DetailItem label="En attente réponse" value={formatBool(selectedChat.waiting_client_reply)} badge />
                                                <DetailItem label="Dernier auto-msg" value={formatDateTime(selectedChat.last_auto_message_sent_at)} />
                                            </div>
                                        </div>
                                    </InfoCard>

                                    <InfoCard title="Système" icon={Settings} accent="bg-gray-50 text-gray-700 border border-gray-200">
                                        <div className="divide-y divide-slate-100">
                                            <div className="pb-2">
                                                <DetailItem label="Mute jusqu'à" value={formatDateTime(selectedChat.mute_until)} />
                                            </div>
                                            <div className="pt-2 space-y-2">
                                                <DetailItem label="Créée le" value={formatDateTime(selectedChat.createdAt)} />
                                                <DetailItem label="Mise à jour" value={formatDateTime(selectedChat.updatedAt)} />
                                            </div>
                                        </div>
                                    </InfoCard>
                                </div>
                            </div>
                        )}

                        {activeTab === 'conversation' && (
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
                                            {/* Media previews */}
                                            {msg.medias && msg.medias.length > 0 && (
                                                <div className="mb-2 space-y-1">
                                                    {msg.medias.map((media, idx) => {
                                                        const mediaType = media.type ?? media.mime_type?.split('/')[0] ?? '';
                                                        if (mediaType === 'image' && media.url) {
                                                            return (
                                                                <a key={idx} href={media.url} target="_blank" rel="noopener noreferrer">
                                                                    <img src={media.url} alt={media.caption ?? 'Image'} className="max-w-full rounded-md max-h-48 object-cover" />
                                                                </a>
                                                            );
                                                        }
                                                        if (mediaType === 'video') {
                                                            return (
                                                                <div key={idx} className="flex items-center gap-2 p-2 bg-black/10 rounded">
                                                                    <Video className="w-4 h-4 flex-shrink-0" />
                                                                    <span className="text-xs truncate">{media.file_name ?? 'Video'}</span>
                                                                </div>
                                                            );
                                                        }
                                                        if (mediaType === 'audio' || mediaType === 'voice') {
                                                            return (
                                                                <div key={idx} className="flex items-center gap-2 p-2 bg-black/10 rounded">
                                                                    <Mic className="w-4 h-4 flex-shrink-0" />
                                                                    <span className="text-xs">{media.seconds ? `${media.seconds}s` : 'Audio'}</span>
                                                                </div>
                                                            );
                                                        }
                                                        if (mediaType === 'document' || mediaType === 'application') {
                                                            return (
                                                                <div key={idx} className="flex items-center gap-2 p-2 bg-black/10 rounded">
                                                                    <FileText className="w-4 h-4 flex-shrink-0" />
                                                                    <span className="text-xs truncate">{media.file_name ?? 'Document'}</span>
                                                                </div>
                                                            );
                                                        }
                                                        if (mediaType === 'location') {
                                                            return (
                                                                <div key={idx} className="flex items-center gap-2 p-2 bg-black/10 rounded">
                                                                    <MapPin className="w-4 h-4 flex-shrink-0" />
                                                                    <span className="text-xs">
                                                                        {media.latitude && media.longitude
                                                                            ? `${media.latitude.toFixed(4)}, ${media.longitude.toFixed(4)}`
                                                                            : 'Position'}
                                                                    </span>
                                                                </div>
                                                            );
                                                        }
                                                        return (
                                                            <div key={idx} className="flex items-center gap-2 p-2 bg-black/10 rounded">
                                                                <Image className="w-4 h-4 flex-shrink-0" />
                                                                <span className="text-xs truncate">{media.file_name ?? mediaType ?? 'Media'}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            <p>{resolveAdminMessageText(msg)}</p>
                                            <span className="block text-right text-xs mt-1 opacity-75">
                                                {formatTime(msg.timestamp)}
                                                {msg.status && (
                                                    <span className={`ml-1.5 ${
                                                        msg.status === 'READ' ? 'text-blue-300' :
                                                        msg.status === 'DELIVERED' ? 'text-green-300' :
                                                        msg.status === 'FAILED' ? 'text-red-400' : ''
                                                    }`}>
                                                        {msg.status === 'READ' ? '✓✓' :
                                                         msg.status === 'DELIVERED' ? '✓✓' :
                                                         msg.status === 'SENT' ? '✓' :
                                                         msg.status === 'FAILED' ? '✗' : ''}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                        )}

                        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 bg-white flex items-center gap-2 sticky bottom-0">
                            <input
                                type="text"
                                value={messageInput}
                                onChange={(e) => setMessageInput(e.target.value)}
                                placeholder="Écrire un message..."
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={loadingMessages || activeTab !== 'conversation'}
                            />
                            <button
                                type="submit"
                                className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                                disabled={loadingMessages || !messageInput.trim() || activeTab !== 'conversation'}
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
        </div>
    );
}

