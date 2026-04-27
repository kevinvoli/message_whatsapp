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
      // En mode fenêtre glissante, les 10 conversations actives (non verrouillées) sont
      // toujours visibles quel que soit le filtre. Elles disparaissent toutes ensemble
      // lors de la rotation (window_slot → null), pas une par une à la soumission.
      if (conv.window_slot != null && conv.is_locked !== true) {
        return true;
      }

      switch (filterStatus) {
        case 'unread':  return conv.unreadCount > 0;
        // "Nouveaux" = le commercial n'a jamais répondu (last_poste_message_at null).
        case 'nouveau': return !conv.last_poste_message_at;
        // "En attente" = agent hors-ligne, conversation attend la reconnexion
        case 'attente': return conv.status === 'attente';
        default:        return true;
      }
    });
  }, [conversations, filterStatus]);

  return { filterStatus, setFilterStatus, filteredConversations };
}
