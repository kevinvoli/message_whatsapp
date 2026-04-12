import React, { useEffect, useRef } from 'react';
import ConversationItem from './ConversationItem';
import { Conversation } from '@/types/chat';
import { useChatStore } from '@/store/chatStore';

interface ConversationListProps {
    filteredConversations: Conversation[];
    selectedConv: string;
    selectedConversation: Conversation | null;
    onSelectConversation: (conv: Conversation) => void;
}

export default function ConversationList({
    filteredConversations,
    selectedConversation,
    onSelectConversation,
    selectedConv,
}: ConversationListProps) {
    const typingStatus               = useChatStore((state) => state.typingStatus);
    const hasMoreConversations       = useChatStore((state) => state.hasMoreConversations);
    const isLoadingMoreConversations = useChatStore((state) => state.isLoadingMoreConversations);
    const loadMoreConversations      = useChatStore((state) => state.loadMoreConversations);
    const conversationCursor         = useChatStore((state) => state.conversationCursor);

    const sentinelRef = useRef<HTMLDivElement>(null);

    // Sentinel — déclenche le chargement serveur par scroll
    // conversationCursor en dépendance : quand une page est chargée, l'observer
    // est recréé et se déclenche immédiatement si le sentinel est déjà visible
    // (cas filtre actif avec liste courte).
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && hasMoreConversations && !isLoadingMoreConversations) {
                    loadMoreConversations();
                }
            },
            { threshold: 0.1 },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMoreConversations, isLoadingMoreConversations, loadMoreConversations, conversationCursor]);

    // Auto-load : quand le filtre actif produit peu de résultats, charger les
    // pages suivantes automatiquement jusqu'à avoir au moins 10 items ou épuiser
    // les pages. Sans cela, le sentinel sous une liste vide ne se redéclenche pas
    // si son état d'intersection n'a pas changé depuis la dernière observation.
    const filteredCount = filteredConversations.length;
    useEffect(() => {
        if (filteredCount >= 10) return;
        if (!hasMoreConversations || isLoadingMoreConversations) return;
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const rect = sentinel.getBoundingClientRect();
        if (rect.top < window.innerHeight) {
            loadMoreConversations();
        }
    }, [filteredCount, hasMoreConversations, isLoadingMoreConversations, loadMoreConversations]);

    return (
        <div className="flex-1 overflow-y-auto">
            {filteredConversations.map((conv) => (
                <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isSelected={selectedConversation?.id === conv.id}
                    isTyping={!!typingStatus[conv.chat_id]}
                    onClick={() => onSelectConversation(conv)}
                />
            ))}
            {hasMoreConversations && (
                <div ref={sentinelRef} className="h-8 flex items-center justify-center text-xs text-gray-400">
                    {isLoadingMoreConversations ? 'Chargement…' : ''}
                </div>
            )}
        </div>
    );
}
