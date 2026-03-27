import { Conversation, ConversationTag } from '@/types/chat';
import React, { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface ConversationFiltersProps {
    conversations: Conversation[];
    totalUnread: number;
    filterStatus: string;
    setFilterStatus: (status: string) => void;
    filterTagId: string | null;
    setFilterTagId: (id: string | null) => void;
}

export default function ConversationFilters({
    conversations,
    totalUnread,
    filterStatus,
    setFilterStatus,
    filterTagId,
    setFilterTagId,
}: ConversationFiltersProps) {
    const [tags, setTags] = useState<ConversationTag[]>([]);

    useEffect(() => {
        void fetch(`${API_URL}/tags`, { credentials: 'include' })
            .then((r) => r.ok ? r.json() : [])
            .then((data: ConversationTag[]) => setTags(data))
            .catch(() => {});
    }, []);

    return (
        <div className="p-3 border-b border-gray-200 bg-gray-50">
            <div className="p-2 flex items-center gap-2 overflow-x-auto">
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
                <button
                    onClick={() => setFilterStatus('sla')}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                        filterStatus === 'sla' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700'
                    }`}
                >
                    SLA dépassé
                </button>
            </div>
            {tags.length > 0 && (
                <div className="px-2 pb-1 flex items-center gap-2 overflow-x-auto">
                    {filterTagId && (
                        <button
                            onClick={() => setFilterTagId(null)}
                            className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-gray-200 text-gray-700"
                        >
                            ✕ Tag
                        </button>
                    )}
                    {tags.map((tag) => (
                        <button
                            key={tag.id}
                            onClick={() => setFilterTagId(filterTagId === tag.id ? null : tag.id)}
                            className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap text-white transition-opacity"
                            style={{
                                backgroundColor: tag.color,
                                opacity: filterTagId && filterTagId !== tag.id ? 0.5 : 1,
                            }}
                        >
                            {tag.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
