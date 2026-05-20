import { useMemo, useState } from 'react';
import { Conversation } from '@/types/chat';
import { useChatStore } from '@/store/chatStore';

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('225') && digits.length === 13) return digits.slice(3);
  return digits;
}

/**
 * Gère le filtre de statut côté client.
 * La recherche textuelle est côté serveur (useConversationSearch).
 *
 * Le filtre "rotation_calls" utilise obligationStatus.calledPhones
 * (liste des téléphones appelés dans la rotation courante) plutôt que
 * conv.call_status qui n'est pas renseigné par le système de sync DB2.
 */
export function useConversationFilters(conversations: Conversation[]) {
  const [filterStatus, setFilterStatus] = useState('all');
  const obligationStatus = useChatStore((s) => s.obligationStatus);

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      switch (filterStatus) {
        case 'active':
          return conv.window_slot != null && conv.is_locked !== true;
        case 'rotation_calls': {
          if (conv.window_slot == null) return false;
          const calledPhones = obligationStatus?.calledPhones;
          if (!calledPhones?.length) return false;
          const phone = normalizePhone(conv.chat_id.split('@')[0]);
          return phone.length > 0 && calledPhones.includes(phone);
        }
        default: // 'all'
          return true;
      }
    });
  }, [conversations, filterStatus, obligationStatus]);

  return { filterStatus, setFilterStatus, filteredConversations };
}
