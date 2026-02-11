import { Conversation } from '@/types/chat';
import React from 'react';

interface ConversationFiltersProps {
    conversations: Conversation[];
    totalUnread: number;
    filterStatus: string;
    setFilterStatus: (status: string) => void;
}

export default function ConversationFilters({ conversations, totalUnread, filterStatus, setFilterStatus }: ConversationFiltersProps) {
    return (
        <div className="p-3 border-b border-gray-200 bg-gray-50">
            <div className=" p-2 flex items-center gap-2 overflow-x-auto">
                <button
                    onClick={() => setFilterStatus('all')}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                        filterStatus === 'all' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
                    }`}
                >
                    Tous ({conversations.length})
                </button>
                <button
                    onClick={() => setFilterStatus('unread')}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                        filterStatus === 'unread' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
                    }`}
                >
                    Non lus ({totalUnread})
                </button>
                <button
                    onClick={() => setFilterStatus('nouveau')}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                        filterStatus === 'nouveau' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
                    }`}
                >
                    Nouveaux
                </button>
                <button
                    onClick={() => setFilterStatus('urgent')}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                        filterStatus === 'urgent' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
                    }`}
                >
                    Urgents
                </button>
            </div>
        </div>
    );
}
