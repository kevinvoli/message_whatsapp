import { Conversation } from '@/types/chat';
import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ConversationFiltersProps {
    conversations: Conversation[];
    totalUnread: number;
    filterStatus: string;
    setFilterStatus: (status: string) => void;
}

export default function ConversationFilters({ conversations, totalUnread, filterStatus, setFilterStatus }: ConversationFiltersProps) {
    const [showPosteLoad, setShowPosteLoad] = useState(false);

    const counts = useMemo(() => ({
        all:       conversations.length,
        nouveau:   conversations.filter((c) => !c.last_poste_message_at).length,
        attente:   conversations.filter((c) => c.status === 'attente').length,
    }), [conversations]);

    // Charge par poste : grouper les conversations actives par poste
    const posteLoad = useMemo(() => {
        const map = new Map<string, { name: string; active: number; total: number }>();
        for (const c of conversations) {
            const key = c.poste_id || 'inconnu';
            const name = c.poste?.name ?? c.poste_id ?? 'Sans poste';
            const entry = map.get(key) ?? { name, active: 0, total: 0 };
            entry.total++;
            if (c.status === 'actif') entry.active++;
            map.set(key, entry);
        }
        return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.active - a.active);
    }, [conversations]);

    const multiPoste = posteLoad.length > 1;

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
            <div className="px-3 pt-2 pb-1 flex items-center gap-2 overflow-x-auto">
                {btn('all',     'Tous',        counts.all)}
                {btn('unread',  'Non lus',     totalUnread)}
                {btn('nouveau', 'Nouveaux',    counts.nouveau)}
                {counts.attente > 0 && btn('attente', `En attente (${counts.attente})`, undefined)}
            </div>

            {multiPoste && (
                <div className="px-3 pb-2">
                    <button
                        onClick={() => setShowPosteLoad(v => !v)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        {showPosteLoad ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        Charge par poste
                    </button>
                    {showPosteLoad && (
                        <div className="mt-1.5 space-y-1">
                            {posteLoad.map((p) => {
                                const pct = p.total > 0 ? Math.round(p.active / p.total * 100) : 0;
                                const color = pct >= 75 ? 'bg-red-400' : pct >= 40 ? 'bg-orange-400' : 'bg-green-400';
                                return (
                                    <div key={p.id} className="flex items-center gap-2 text-xs">
                                        <span className="w-24 truncate text-gray-600">{p.name}</span>
                                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                            <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-gray-500 w-16 text-right">{p.active} actif{p.active !== 1 ? 's' : ''}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
