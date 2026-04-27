/**
 * TICKET-08-A — Logique de fusion de conversation.
 *
 * Fonctions pures extraites de `chatStore.updateConversation`.
 * Sans effet de bord : testables sans Zustand.
 */
import { Conversation, Message } from '@/types/chat';

/**
 * Fusionne une conversation mise à jour dans la liste existante.
 * Préserve : messages locaux, contact_summary, priority.
 * Retrie par last_activity_at DESC.
 */
export function mergeConversationInList(
  conversations: Conversation[],
  updated: Conversation,
  isSelected: boolean,
): Conversation[] {
  return conversations
    .map((c) => {
      if (c.chat_id !== updated.chat_id) return c;

      const preservedMessages =
        updated.messages && updated.messages.length > 0
          ? updated.messages
          : c.messages ?? [];

      const preservedContactSummary = updated.contact_summary ?? c.contact_summary;

      const preservedPriority =
        updated.priority !== 'moyenne'
          ? updated.priority
          : (c.priority ?? updated.priority);

      const unreadCount = isSelected ? 0 : (updated.unreadCount ?? 0);

      return {
        ...updated,
        unreadCount,
        messages: preservedMessages,
        contact_summary: preservedContactSummary,
        priority: preservedPriority,
      };
    })
    .sort((a, b) => {
      // Mode fenêtre glissante : préserver l'ordre par window_slot
      if (a.window_slot != null && b.window_slot != null) return a.window_slot - b.window_slot;
      if (a.window_slot != null) return -1;
      if (b.window_slot != null) return 1;
      // Mode classique : tri par activité récente
      const aTime = a.last_activity_at?.getTime() ?? a.updatedAt.getTime();
      const bTime = b.last_activity_at?.getTime() ?? b.updatedAt.getTime();
      return bTime - aTime;
    });
}

/**
 * Fusionne une conversation dans la conversation sélectionnée.
 * Applique les mêmes préservations que `mergeConversationInList`.
 * Retourne null si non concerné.
 */
export function mergeSelectedConversation(
  current: Conversation | null,
  updated: Conversation,
  existingMessages: Message[],
): { selectedConversation: Conversation; messages?: Message[] } | null {
  if (!current || current.chat_id !== updated.chat_id) return null;

  const preservedContactSummary = updated.contact_summary ?? current.contact_summary;
  const preservedPriority =
    updated.priority !== 'moyenne'
      ? updated.priority
      : (current.priority ?? updated.priority);

  const merged: Conversation = {
    ...updated,
    unreadCount: 0,
    contact_summary: preservedContactSummary,
    priority: preservedPriority,
  };

  if (updated.messages && updated.messages.length > 0) {
    const newIds = new Set(updated.messages.map((m) => m.id));
    const localOnly = existingMessages.filter(
      (m) => !newIds.has(m.id) && m.status === 'sending',
    );
    return { selectedConversation: merged, messages: dedupeMessagesById([...updated.messages, ...localOnly]) };
  }

  if (updated.lastMessage && !existingMessages.find((m) => m.id === updated.lastMessage?.id)) {
    return { selectedConversation: merged, messages: dedupeMessagesById([...existingMessages, updated.lastMessage]) };
  }

  return { selectedConversation: merged };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function dedupeMessagesById(messages: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const m of messages) map.set(m.id, m);
  return Array.from(map.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
