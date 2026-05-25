import { Conversation } from '@/types/chat';
import React, { useMemo } from 'react';
import { useChatStore } from '@/store/chatStore';

interface ConversationFiltersProps {
    conversations: Conversation[];
    totalUnread: number;
    filterStatus: string;
    setFilterStatus: (status: string) => void;
}

export default function ConversationFilters({ conversations, totalUnread, filterStatus, setFilterStatus }: ConversationFiltersProps) {
    const conversationsNouveau = useChatStore((s) => s.conversationsNouveau);

    // Compteurs calculés depuis les tableaux dédiés par onglet (pré-chargés serveur).
    const counts = useMemo(() => ({
        all:     conversations.length,
        // "Nouveau" issu du tableau dédié pré-chargé, pas du filtre local.
        nouveau: conversationsNouveau.length,
    }), [conversations, conversationsNouveau]);

    const btn = (key: string, label: string, count?: number) => (
        <button
            onClick={() => setFilterStatus(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                filterStatus === key ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
        >
            {label}{count !== undefined ? ` (${count})` : ''}
        </button>
    );

    return (
        <div className="p-3 border-b border-gray-200 bg-gray-50">
            <div className="p-2 flex items-center gap-2 overflow-x-auto">
                {btn('all',     'Tous',     counts.all)}
                {btn('unread',  'Non lus',  totalUnread)}
                {btn('nouveau', 'Nouveaux', counts.nouveau)}
            </div>
        </div>
    );
}
