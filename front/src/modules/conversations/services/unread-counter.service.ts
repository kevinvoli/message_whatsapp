/**
 * TICKET-08-A — Calcul du compteur non-lu.
 *
 * Fonction pure extraite de `chatStore.addMessage`.
 */
import { Conversation, Message } from '@/types/chat';

/**
 * Calcule le nouvel `unreadCount` d'une conversation lorsqu'un message arrive.
 *
 * @param conversation  La conversation cible telle qu'elle existe dans le store.
 * @param message       Le nouveau message entrant.
 * @param isActive      Vrai si cette conversation est actuellement sélectionnée.
 */
export function computeUnreadCount(
  conversation: Conversation,
  message: Message,
  isActive: boolean,
): number {
  if (isActive) return 0;
  if (message.from_me) return conversation.unreadCount ?? 0;
  return (conversation.unreadCount ?? 0) + 1;
}
