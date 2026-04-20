'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { User, RefreshCw } from 'lucide-react';
import { useContactStore } from '@/store/contactStore';
import { searchClients, ClientSummary } from '@/lib/contactApi';

interface ContactSidebarPanelProps {
  searchQuery: string;
}

type FilterKey = 'all' | 'my_portfolio';

export function ContactSidebarPanel({ searchQuery }: ContactSidebarPanelProps) {
  const { selectedContactDetail, selectContactByChatId } = useContactStore();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const PAGE = 30;

  const load = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const currentOffset = reset ? 0 : offset;
      const res = await searchClients({
        search: searchQuery.trim() || undefined,
        my_portfolio: filter === 'my_portfolio',
        limit: PAGE,
        offset: currentOffset,
      });
      setClients((prev) => reset ? res.data : [...prev, ...res.data]);
      setTotal(res.total);
      if (reset) setOffset(PAGE);
      else setOffset(currentOffset + PAGE);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filter, offset]);

  useEffect(() => {
    setOffset(0);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filter]);

  const pills: { key: FilterKey; label: string }[] = [
    { key: 'all',          label: 'Tous'        },
    { key: 'my_portfolio', label: 'Mon portefeuille' },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Filtres */}
      <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          {pills.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                filter === key
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => load(true)}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 flex-shrink-0"
          title="Rafraîchir"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Compteur */}
      {total > 0 && (
        <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100 bg-white">
          {total} client{total > 1 ? 's' : ''}
        </div>
      )}

      {/* Liste */}
      <div className="flex-1 overflow-y-auto">
        {!loading && clients.length === 0 ? (
          <div className="text-center py-10">
            <User className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Aucun client trouvé</p>
          </div>
        ) : (
          <>
            {clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                isSelected={selectedContactDetail?.id === client.id}
                onClick={() => selectContactByChatId(client.chat_id)}
              />
            ))}
            {clients.length < total && (
              <button
                onClick={() => load(false)}
                disabled={loading}
                className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 border-t border-gray-100 disabled:opacity-50"
              >
                {loading ? 'Chargement…' : `Voir plus (${total - clients.length} restants)`}
              </button>
            )}
          </>
        )}
        {loading && clients.length === 0 && (
          <div className="text-center py-8">
            <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}
      </div>
    </div>
  );
}

function ClientCard({ client, isSelected, onClick }: {
  client: ClientSummary;
  isSelected: boolean;
  onClick: () => void;
}) {
  const initial = (client.name || '?').charAt(0).toUpperCase();
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-gray-50 ${
        isSelected ? 'bg-green-50' : 'hover:bg-gray-50'
      }`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
        isSelected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
      }`}>
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isSelected ? 'text-green-800' : 'text-gray-900'}`}>
          {client.name}
        </p>
        <p className="text-xs text-gray-400 truncate">{client.phone}</p>
      </div>
      {client.next_follow_up && (
        <span className="text-xs bg-orange-100 text-orange-600 rounded-full px-1.5 py-0.5 flex-shrink-0">
          Relance
        </span>
      )}
    </button>
  );
}
