import { useMemo, useState } from 'react';
import { Conversation } from '@/types/chat';

/**
 * Gère le filtre de statut côté client.
 * La recherche textuelle est côté serveur (useConversationSearch).
 */
export function useConversationFilters(conversations: Conversation[]) {
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      switch (filterStatus) {
        case 'active':
          return conv.window_slot != null && conv.is_locked !== true;
        case 'rotation_calls':
          return conv.window_slot != null
            && conv.call_status != null
            && conv.call_status !== 'à_appeler';
        default: // 'all'
          return true;
      }
    });
  }, [conversations, filterStatus]);

  return { filterStatus, setFilterStatus, filteredConversations };
}
