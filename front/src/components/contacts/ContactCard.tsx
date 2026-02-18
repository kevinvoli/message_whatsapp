'use client';

import React from 'react';
import { User } from 'lucide-react';
import { Contact } from '@/types/chat';
import { formatConversationTime } from '@/lib/dateUtils';
import { getCallStatusColor, getCallStatusLabel } from '@/types/chat';

interface ContactCardProps {
  contact: Contact;
  isSelected: boolean;
  onClick: () => void;
}

export function ContactCard({ contact, isSelected, onClick }: ContactCardProps) {
  const lastActivity = contact.last_call_date ?? contact.last_message_date ?? contact.updatedAt;

  const priorityDot: Record<string, string> = {
    haute:   'bg-red-500',
    moyenne: 'bg-yellow-400',
    basse:   'bg-gray-300',
  };

  return (
    <div
      onClick={onClick}
      className={`p-4 border-b border-gray-100 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-green-50 border-l-4 border-l-green-600'
          : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar — même style que ConversationItem */}
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center shrink-0 relative">
          <User className="w-6 h-6 text-green-600" />
          {contact.priority === 'haute' && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">!</span>
            </div>
          )}
        </div>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-gray-800 truncate">{contact.name}</h3>
            <span className="text-xs text-gray-500 shrink-0 ml-1">
              {formatConversationTime(lastActivity)}
            </span>
          </div>

          <p className="text-sm text-gray-600 truncate">{contact.contact}</p>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Badge statut appel */}
            <span className={`text-xs px-2 py-0.5 rounded-full ${getCallStatusColor(contact.call_status)}`}>
              {getCallStatusLabel(contact.call_status)}
            </span>

            {/* Priorité si pas haute (haute = pastille rouge) */}
            {contact.priority && contact.priority !== 'haute' && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <span className={`w-1.5 h-1.5 rounded-full ${priorityDot[contact.priority] ?? 'bg-gray-300'}`} />
                {contact.priority}
              </span>
            )}

            {/* Nb appels */}
            {contact.call_count > 0 && (
              <span className="text-xs text-gray-400">{contact.call_count} appel{contact.call_count > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
