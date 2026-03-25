export const EVENTS = {
  CONVERSATION_UPSERT: 'conversation.upsert',
  CONVERSATION_REMOVED: 'conversation.removed',
  CONVERSATION_ASSIGNED: 'conversation.assigned',
  CONVERSATION_REASSIGNED: 'conversation.reassigned',
} as const;

export interface ConversationUpsertEvent {
  chatId: string;
}

export interface ConversationRemovedEvent {
  chatId: string;
  oldPosteId: string;
}

export interface ConversationAssignedEvent {
  chatId: string;
}

export interface ConversationReassignedEvent {
  chat: import('src/whatsapp_chat/entities/whatsapp_chat.entity').WhatsappChat;
  oldPosteId: string;
  newPosteId: string;
}
