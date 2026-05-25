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
    const typingStatus                  = useChatStore((state) => state.typingStatus);
    const hasMoreConversations          = useChatStore((state) => state.hasMoreConversations);
    const isLoadingMoreConversations    = useChatStore((state) => state.isLoadingMoreConversations);
    const loadMoreConversations         = useChatStore((state) => state.loadMoreConversations);
    const hasMoreNouveau                = useChatStore((state) => state.hasMoreNouveau);
    const isLoadingMoreNouveau          = useChatStore((state) => state.isLoadingMoreNouveau);
    const loadMoreNouveauConversations  = useChatStore((state) => state.loadMoreNouveauConversations);
    const currentSearch                 = useChatStore((s) => s.currentSearch);
    const isLoadingNouveau              = useChatStore((s) => s.isLoadingNouveau);

    const sentinelRef = useRef<HTMLDivElement>(null);
    // Compteur d'auto-loads consécutifs pour le filtre actif.
    const autoLoadCountRef = useRef(0);

    // Valeurs dérivées selon l'onglet actif
    const isScrollTab         = filterStatus === 'all' || filterStatus === 'nouveau';
    const hasMoreCurrentTab   = filterStatus === 'nouveau' ? hasMoreNouveau : hasMoreConversations;
    const isLoadingMoreCurrentTab = filterStatus === 'nouveau' ? isLoadingMoreNouveau : isLoadingMoreConversations;
    const loadMoreCurrentTab  = filterStatus === 'nouveau' ? loadMoreNouveauConversations : loadMoreConversations;

    // Refs pour lire les valeurs dynamiques sans recréer l'observer
    const hasMoreRef  = useRef(hasMoreCurrentTab);
    const loadingRef  = useRef(isLoadingMoreCurrentTab);

    // Effet 1 : sync des refs — ne recrée PAS l'observer
    useEffect(() => {
        hasMoreRef.current  = hasMoreCurrentTab;
        loadingRef.current  = isLoadingMoreCurrentTab;
    }, [hasMoreCurrentTab, isLoadingMoreCurrentTab]);

    // Effet 2 : observer stable, recréé seulement au changement d'onglet ou de loadMore
    useEffect(() => {
        if (!isScrollTab) return;

        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            if (!hasMoreRef.current || loadingRef.current) return;
            loadMoreCurrentTab();
        }, { threshold: 0.1 });

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [filterStatus, loadMoreCurrentTab, isScrollTab]);

    // Reset du compteur d'auto-load quand le filtre ou la recherche change
    useEffect(() => {
        autoLoadCountRef.current = 0;
    }, [filterStatus, currentSearch]);

    // Auto-load limité : quand un filtre produit moins de 10 résultats sur l'onglet "all",
    // on charge automatiquement jusqu'à 3 pages supplémentaires.
    const filteredCount = filteredConversations.length;
    useEffect(() => {
        // Auto-load uniquement sur l'onglet "Tous"
        if (filterStatus !== 'all') return;

        if (filteredCount >= 10) {
            autoLoadCountRef.current = 0;
            return;
        }
        if (!hasMoreConversations || isLoadingMoreConversations) return;
        if (autoLoadCountRef.current >= 3) return;
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const rect = sentinel.getBoundingClientRect();
        if (rect.top >= window.innerHeight) return;
        const timer = setTimeout(() => {
            autoLoadCountRef.current += 1;
            loadMoreConversations();
        }, 600);
        return () => clearTimeout(timer);
    }, [filteredCount, hasMoreConversations, isLoadingMoreConversations, loadMoreConversations, filterStatus]);

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
            {isScrollTab && hasMoreCurrentTab && (
                <div ref={sentinelRef} className="h-8 flex items-center justify-center text-xs text-gray-400">
                    {isLoadingMoreCurrentTab ? 'Chargement…' : ''}
                </div>
            )}
            {filterStatus === 'nouveau' && filteredCount === 0 && !isLoadingNouveau && (
                <p className="text-xs text-gray-400 text-center py-4 px-3">
                    Aucune nouvelle conversation.
                </p>
            )}
        </div>
    );
}
