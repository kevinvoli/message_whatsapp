import React, { useEffect, useRef } from 'react';
import ConversationItem from './ConversationItem';
import { Conversation } from '@/types/chat';
import { useChatStore } from '@/store/chatStore';

interface ConversationListProps {
    filteredConversations: Conversation[];
    filterStatus: string;
    selectedConv: string;
    selectedConversation: Conversation | null;
    onSelectConversation: (conv: Conversation) => void;
}

export default function ConversationList({
    filteredConversations,
    filterStatus,
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
    // Compteur d'auto-loads consécutifs pour le filtre actif.
    // Remis à 0 quand filteredCount dépasse le seuil ou quand le filtre change.
    const autoLoadCountRef = useRef(0);

    // Sentinel — déclenche le chargement serveur par scroll manuel.
    // conversationCursor en dépendance : quand une page est chargée, l'observer
    // est recréé et se déclenche immédiatement si le sentinel est déjà visible.
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

    // Reset du compteur d'auto-load quand le filtre change
    useEffect(() => {
        autoLoadCountRef.current = 0;
    }, [filterStatus]);

    // Auto-load limité : quand un filtre produit moins de 10 résultats, on charge
    // automatiquement jusqu'à 3 pages supplémentaires (900 conversations max).
    // Au-delà, le scroll manuel prend le relais pour éviter de tout charger en cas
    // de filtre avec 0 résultats sur un poste de 2000+ conversations.
    const filteredCount = filteredConversations.length;
    useEffect(() => {
        if (filteredCount >= 10) {
            autoLoadCountRef.current = 0; // reset dès qu'on a assez de résultats
            return;
        }
        if (!hasMoreConversations || isLoadingMoreConversations) return;
        if (autoLoadCountRef.current >= 3) return; // plafond atteint
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const rect = sentinel.getBoundingClientRect();
        if (rect.top >= window.innerHeight) return;
        const timer = setTimeout(() => {
            autoLoadCountRef.current += 1;
            loadMoreConversations();
        }, 600);
        return () => clearTimeout(timer);
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
