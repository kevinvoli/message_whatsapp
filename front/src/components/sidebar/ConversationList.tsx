import React, { useEffect, useRef, useState } from 'react';
import ConversationItem from './ConversationItem';
import { Conversation } from '@/types/chat';
import { useChatStore } from '@/store/chatStore';

const INITIAL_VISIBLE = 50;
const LOAD_MORE_STEP  = 30;

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
    const typingStatus              = useChatStore((state) => state.typingStatus);
    const hasMoreConversations      = useChatStore((state) => state.hasMoreConversations);
    const isLoadingMoreConversations = useChatStore((state) => state.isLoadingMoreConversations);
    const loadMoreConversations     = useChatStore((state) => state.loadMoreConversations);

    const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Remettre à 50 quand la liste change (nouveau filtre / nouvelle recherche)
    useEffect(() => {
        setVisibleCount(INITIAL_VISIBLE);
    }, [filteredConversations]);

    // Sentinel — déclenche le chargement local OU serveur selon le cas
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) return;

                const localHasMore = visibleCount < filteredConversations.length;
                if (localHasMore) {
                    // Encore des conv en mémoire → afficher la tranche suivante
                    setVisibleCount((c) => Math.min(c + LOAD_MORE_STEP, filteredConversations.length));
                } else if (hasMoreConversations && !isLoadingMoreConversations) {
                    // Fin de la mémoire → demander la page suivante au serveur
                    loadMoreConversations();
                }
            },
            { threshold: 0.1 },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [filteredConversations.length, visibleCount, hasMoreConversations, isLoadingMoreConversations, loadMoreConversations]);

    const visible = filteredConversations.slice(0, visibleCount);
    const showSentinel = visibleCount < filteredConversations.length || hasMoreConversations;

    return (
        <div className="flex-1 overflow-y-auto">
            {visible.map((conv) => (
                <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isSelected={selectedConversation?.id === conv.id}
                    isTyping={!!typingStatus[conv.chat_id]}
                    onClick={() => onSelectConversation(conv)}
                />
            ))}
            {showSentinel && (
                <div ref={sentinelRef} className="h-8 flex items-center justify-center text-xs text-gray-400">
                    {isLoadingMoreConversations ? 'Chargement…' : ''}
                </div>
            )}
        </div>
    );
}
