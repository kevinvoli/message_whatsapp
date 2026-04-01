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
    const typingStatus    = useChatStore((state) => state.typingStatus);
    const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
    const sentinelRef     = useRef<HTMLDivElement>(null);

    // Remettre à 50 quand la liste change (nouveau filtre / nouvelle recherche)
    useEffect(() => {
        setVisibleCount(INITIAL_VISIBLE);
    }, [filteredConversations]);

    // Charger plus quand le sentinel devient visible
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisibleCount((c) => Math.min(c + LOAD_MORE_STEP, filteredConversations.length));
                }
            },
            { threshold: 0.1 },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [filteredConversations.length]);

    const visible = filteredConversations.slice(0, visibleCount);
    const hasMore = visibleCount < filteredConversations.length;

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
            {hasMore && (
                <div ref={sentinelRef} className="h-8 flex items-center justify-center text-xs text-gray-400">
                    Chargement…
                </div>
            )}
        </div>
    );
}
