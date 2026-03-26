export const EVENTS = {
  CONVERSATION_UPSERT: 'conversation.upsert',
  CONVERSATION_REMOVED: 'conversation.removed',
  CONVERSATION_ASSIGNED: 'conversation.assigned',
  CONVERSATION_REASSIGNED: 'conversation.reassigned',
  CONVERSATION_SET_READONLY: 'conversation.set.readonly',
  MESSAGE_NOTIFY_NEW: 'message.notify.new',
  CONTACT_UPSERT: 'contact.upsert',
  CONTACT_REMOVED: 'contact.removed',
  CONTACT_CALL_STATUS_UPDATED: 'contact.call.status.updated',
  CALL_LOG_NEW: 'call.log.new',
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

export interface ConversationSetReadonlyEvent {
  chat: import('src/whatsapp_chat/entities/whatsapp_chat.entity').WhatsappChat;
}

export interface MessageNotifyNewEvent {
  message: import('src/whatsapp_message/entities/whatsapp_message.entity').WhatsappMessage;
  chat: import('src/whatsapp_chat/entities/whatsapp_chat.entity').WhatsappChat;
}

export interface ContactUpsertEvent {
  contact: import('src/contact/entities/contact.entity').Contact;
}

export interface ContactRemovedEvent {
  contact: import('src/contact/entities/contact.entity').Contact;
}

export interface ContactCallStatusUpdatedEvent {
  contact: import('src/contact/entities/contact.entity').Contact;
}

export interface CallLogNewEvent {
  contact: import('src/contact/entities/contact.entity').Contact;
  callLog: import('src/call-log/entities/call_log.entity').CallLog;
}
