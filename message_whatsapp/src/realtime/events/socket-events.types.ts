// src/realtime/events/socket-events.types.ts
// Interfaces de payload pour chaque événement socket.
// À utiliser dans les publishers (TICKET-02-D) et les mappers (TICKET-02-E).

import { ChatEventType, ContactEventType, MessageSendErrorCode } from './socket-events.constants';

// ─── Types génériques ────────────────────────────────────────────────────────

export interface ChatSocketEvent<T = unknown> {
  type: ChatEventType;
  payload: T;
}

export interface ContactSocketEvent<T = unknown> {
  type: ContactEventType;
  payload: T;
}

// ─── Payloads conversation ───────────────────────────────────────────────────

export interface ConversationSocketPayload {
  id: string;
  chat_id: string;
  name: string;
  status: string;
  poste_id: string | null;
  channel_id?: string;
  last_msg_client_channel_id?: string;
  contact_client: string;
  unread_count: number;
  last_activity_at: string | null;
  is_pinned: boolean;
  is_muted: boolean;
  is_archived: boolean;
  read_only: boolean;
  assigned_at: string | null;
  first_response_deadline_at: string | null;
  last_client_message_at: string | null;
  last_message?: MessageSocketPayload | null;
  contact?: unknown | null;
}

export interface ConversationListPayload {
  conversations: ConversationSocketPayload[];
  hasMore: boolean;
  nextCursor: { activityAt: string; chatId: string } | null;
}

export interface ConversationRemovedPayload {
  chat_id: string;
}

export interface ConversationReadonlyPayload {
  chat_id: string;
  read_only: boolean;
}

export interface TotalUnreadUpdatePayload {
  totalUnread: number;
}

// ─── Payloads message ────────────────────────────────────────────────────────

export interface MessageSocketPayload {
  id: string;
  chat_id: string;
  text: string | null;
  type: string;
  direction: string;
  from_me: boolean;
  from: string;
  from_name: string;
  status: string;
  timestamp: string;
  createdAt: string;
  quoted_message_id?: string | null;
  quotedMessage?: MessageSocketPayload | null;
}

export interface MessageListPayload {
  chat_id: string;
  messages: MessageSocketPayload[];
  hasMore: boolean;
}

export interface MessageAddPayload extends MessageSocketPayload {
  tempId?: string;
}

export interface MessageStatusUpdatePayload {
  message_id: string;
  external_id: string;
  chat_id: string;
  status: string;
  error_code?: number;
  error_title?: string;
}

export interface MessageSendErrorPayload {
  chat_id: string;
  tempId?: string;
  code: MessageSendErrorCode;
  message: string;
}

// ─── Payloads contact ────────────────────────────────────────────────────────

export interface ContactRemovedPayload {
  contact_id: string;
  chat_id: string;
}

export interface CallLogNewPayload {
  contact_id: string;
  call_log: unknown;
}

export interface CallLogListPayload {
  contact_id: string;
  call_logs: unknown[];
}

// ─── Payload queue ───────────────────────────────────────────────────────────

export interface QueueUpdatedPayload {
  timestamp: string;
  reason: string;
  data: unknown[];
}
