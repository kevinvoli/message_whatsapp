import { Conversation } from '@/types/chat';
import React, { useMemo } from 'react';

interface ConversationFiltersProps {
    conversations: Conversation[];
    totalUnread: number;
    filterStatus: string;
    setFilterStatus: (status: string) => void;
}

export default function ConversationFilters({ conversations, totalUnread, filterStatus, setFilterStatus }: ConversationFiltersProps) {
    // Compteurs calculés depuis la liste complète chargée (non filtrée).
    // Basés sur les conversations du store — reflètent les pages déjà chargées.
    const counts = useMemo(() => ({
        all:     conversations.length,
        nouveau: conversations.filter((c) => c.status === 'attente').length,
        urgent:  conversations.filter((c) => c.priority === 'haute').length,
    }), [conversations]);

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
                {btn('urgent',  'Urgents',  counts.urgent)}
            </div>
        </div>
    );
}
