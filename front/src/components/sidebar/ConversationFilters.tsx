import { Conversation } from '@/types/chat';
import React, { useMemo } from 'react';

interface ConversationFiltersProps {
    conversations: Conversation[];
    filterStatus: string;
    setFilterStatus: (status: string) => void;
}

export default function ConversationFilters({ conversations, filterStatus, setFilterStatus }: ConversationFiltersProps) {

    const counts = useMemo(() => ({
        all:            conversations.length,
        active:         conversations.filter((c) => c.window_slot != null && c.is_locked !== true).length,
        rotation_calls: conversations.filter(
            (c) => c.window_slot != null && c.call_status != null && c.call_status !== 'à_appeler'
        ).length,
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
        <div className="border-b border-gray-200 bg-gray-50">
            <div className="px-3 pt-2 pb-2 flex items-center gap-2 overflow-x-auto">
                {btn('all',            'Tous',             counts.all)}
                {btn('active',         'Actives',          counts.active)}
                {btn('rotation_calls', 'Appels rotation',  counts.rotation_calls)}
            </div>
        </div>
    );
}
