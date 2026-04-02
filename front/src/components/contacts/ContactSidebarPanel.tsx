'use client';

import React, { useState, useMemo } from 'react';
import { User } from 'lucide-react';
import { useContactStore } from '@/store/contactStore';
import { useChatStore } from '@/store/chatStore';
import { CallStatus, convToContact } from '@/types/chat';
import { ContactCard } from './ContactCard';

interface ContactSidebarPanelProps {
  searchQuery: string;
}

type FilterKey = 'all' | CallStatus;

export function ContactSidebarPanel({ searchQuery }: ContactSidebarPanelProps) {
  const conversations = useChatStore((s) => s.conversations);
  const { selectedContactDetail, selectContactByChatId } = useContactStore();
  const [filter, setFilter] = useState<FilterKey>('all');

  // Dériver la liste des contacts depuis les conversations
  const contacts = useMemo(
    () => conversations.map(convToContact).filter(Boolean) as NonNullable<ReturnType<typeof convToContact>>[],
    [conversations],
  );

  const counts = useMemo(() => ({
    all:           contacts.length,
    à_appeler:     contacts.filter((c) => c.call_status === 'à_appeler').length,
    rappeler:      contacts.filter((c) => c.call_status === 'rappeler').length,
    non_joignable: contacts.filter((c) => c.call_status === 'non_joignable').length,
    appelé:        contacts.filter((c) => c.call_status === 'appelé').length,
  }), [contacts]);

  const filteredContacts = useMemo(() => {
    let result = [...contacts];

    if (filter !== 'all') {
      result = result.filter((c) => c.call_status === filter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.contact.includes(q),
      );
    }

    return result.sort(
      (a, b) => (b.last_call_date?.getTime() ?? 0) - (a.last_call_date?.getTime() ?? 0),
    );
  }, [contacts, filter, searchQuery]);

  const pills: { key: FilterKey; label: string }[] = [
    { key: 'all',           label: `Tous (${counts.all})`                      },
    { key: 'à_appeler',     label: `À appeler (${counts.à_appeler})`           },
    { key: 'rappeler',      label: `À rappeler (${counts.rappeler})`           },
    { key: 'non_joignable', label: `Non joign. (${counts.non_joignable})`     },
    { key: 'appelé',        label: `Appelés (${counts.appelé})`               },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Barre de filtres */}
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <div className="p-2 flex items-center gap-2 overflow-x-auto">
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
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto">
        {filteredContacts.length === 0 ? (
          <div className="text-center py-10">
            <User className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Aucun contact</p>
          </div>
        ) : (
          filteredContacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              isSelected={selectedContactDetail?.chat_id === contact.chat_id}
              onClick={() => selectContactByChatId(contact.chat_id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
