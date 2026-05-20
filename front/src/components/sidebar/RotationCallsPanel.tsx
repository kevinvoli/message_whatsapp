'use client';

import React from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import ConversationItem from '@/components/sidebar/ConversationItem';
import { Conversation } from '@/types/chat';

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('225') && digits.length === 13) return digits.slice(3);
  return digits;
}

interface RotationCallsPanelProps {
  selectedConversation: Conversation | null;
  onSelectConversation: (conv: Conversation) => void;
}

export default function RotationCallsPanel({
  selectedConversation,
  onSelectConversation,
}: RotationCallsPanelProps) {
  const obligationStatus = useChatStore((s) => s.obligationStatus);
  const conversations = useChatStore((s) => s.conversations);

  const calledPhones = obligationStatus?.calledPhones ?? [];

  // Construire un map phone normalisé → conversation
  const convByPhone = new Map<string, Conversation>();
  for (const conv of conversations) {
    const phone = normalizePhone(conv.chat_id.split('@')[0]);
    if (phone) convByPhone.set(phone, conv);
  }

  const matched: Conversation[] = [];
  const unmatched: string[] = [];

  for (const phone of calledPhones) {
    const conv = convByPhone.get(phone);
    if (conv) {
      matched.push(conv);
    } else {
      unmatched.push(phone);
    }
  }

  if (calledPhones.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-10 text-gray-400">
        <Phone className="w-8 h-8 mb-2 text-gray-200" />
        <p className="text-xs">Aucun appel enregistré pour cette rotation</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Conversations avec WhatsApp */}
      {matched.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 border-b border-gray-100 sticky top-0">
            Avec conversation WhatsApp ({matched.length})
          </div>
          {matched.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedConversation?.id === conv.id}
              onClick={() => onSelectConversation(conv)}
            />
          ))}
        </>
      )}

      {/* Numéros sans conversation WhatsApp */}
      {unmatched.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 border-b border-gray-100 sticky top-0">
            Sans conversation WhatsApp ({unmatched.length})
          </div>
          {unmatched.map((phone) => (
            <div
              key={phone}
              className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 bg-white"
            >
              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <PhoneOff className="w-4 h-4 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 font-medium">{phone}</p>
                <p className="text-xs text-gray-400">Appelé · pas sur WhatsApp</p>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
