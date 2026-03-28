"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { WhatsappMessage } from '../lib/definitions';
import { Search, RefreshCw } from 'lucide-react';
import { resolveAdminMessageText } from '../lib/utils';
import { formatDateTimeWithSeconds } from '@/app/lib/dateUtils';
import { Spinner } from './Spinner';
import { Pagination } from './Pagination';
import { getMessages } from '@/app/lib/api';

interface MessagesViewProps {
    onRefresh?: () => void;
    selectedPeriod?: string;
}

export default function MessagesView({ onRefresh, selectedPeriod = 'today' }: MessagesViewProps) {
    const [messages, setMessages] = useState<WhatsappMessage[]>([]);
    const [total, setTotal] = useState(0);
    const [limit, setLimit] = useState(50);
    const [offset, setOffset] = useState(0);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (l: number, o: number) => {
        setLoading(true);
        try {
            const result = await getMessages(l, o, selectedPeriod);
            setMessages(result.data);
            setTotal(result.total);
        } finally {
            setLoading(false);
        }
    }, [selectedPeriod]);

    useEffect(() => {
        void load(limit, offset);
    }, [load, limit, offset]);

    // Reset à la page 0 quand la période change
    useEffect(() => { setOffset(0); }, [selectedPeriod]);

    const filtered = search.trim()
        ? messages.filter((m) =>
              m.chat_id?.toLowerCase().includes(search.toLowerCase()) ||
              resolveAdminMessageText(m)?.toLowerCase().includes(search.toLowerCase()) ||
              m.poste?.name?.toLowerCase().includes(search.toLowerCase()),
          )
        : messages;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-end">
                <button
                    type="button"
                    onClick={() => void load(limit, offset)}
                    title="Rafraîchir"
                    aria-label="Rafraîchir"
                    className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="flex-1 relative">
                    <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Rechercher par conversation, message, poste..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conversation</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Direction</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Poste</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expéditeur</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filtered.map((msg) => (
                                <tr key={msg.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900 text-sm">{msg.chat_id}</td>
                                    <td className="px-6 py-4 text-gray-700 max-w-xs truncate">{resolveAdminMessageText(msg)}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            msg.status === 'READ' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                                        }`}>
                                            {msg.status ?? '—'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-700">{msg.direction}</td>
                                    <td className="px-6 py-4 text-gray-700">{msg.poste?.name ?? '—'}</td>
                                    <td className="px-6 py-4">
                                        {msg.direction === 'IN' ? (
                                          <span className="inline-flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                                            <span className="text-gray-700 text-sm">{msg.from_name || msg.from || msg.chat_id.split('@')[0]}</span>
                                          </span>
                                        ) : msg.commercial ? (
                                          <span className="inline-flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                                            <span className="text-gray-700 text-sm">{msg.commercial.name}</span>
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />
                                            <span className="text-purple-700 text-sm font-medium">Admin</span>
                                          </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-medium text-blue-900">{formatDateTimeWithSeconds(msg.timestamp)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {loading && (
                        <div className="flex justify-center py-6">
                            <Spinner />
                        </div>
                    )}
                    {!loading && filtered.length === 0 && (
                        <p className="text-center text-gray-500 py-6">Aucun message trouvé.</p>
                    )}
                </div>

                <Pagination
                    total={total}
                    limit={limit}
                    offset={offset}
                    onPageChange={(o) => setOffset(o)}
                    onLimitChange={(l) => { setLimit(l); setOffset(0); }}
                />
            </div>
        </div>
    );
}
