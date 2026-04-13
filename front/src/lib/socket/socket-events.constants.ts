// front/src/lib/socket/socket-events.constants.ts
// Noms d'événements Socket.IO — miroir du fichier backend.
// Fichier source (backend) : message_whatsapp/src/realtime/events/socket-events.constants.ts
// Ces deux fichiers DOIVENT rester identiques — vérification obligatoire à la PR.

// ─── Canaux (noms d'événements socket.io) ───────────────────────────────────

export const SOCKET_CHANNEL_CHAT    = 'chat:event' as const;
export const SOCKET_CHANNEL_CONTACT = 'contact:event' as const;
export const SOCKET_CHANNEL_QUEUE   = 'queue:updated' as const;

// ─── Client → Serveur (emit) ────────────────────────────────────────────────

export const SOCKET_CLIENT_EVENTS = {
  CONVERSATIONS_GET:    'conversations:get',
  CONTACT_GET_DETAIL:   'contact:get_detail',
  CONTACTS_GET:         'contacts:get',
  CALL_LOGS_GET:        'call_logs:get',
  CHAT_EVENT:           'chat:event',
  MESSAGES_GET:         'messages:get',
  MESSAGES_READ:        'messages:read',
  MESSAGE_SEND:         'message:send',
  MESSAGE_SEND_MEDIA:   'message:send:media',
  QUEUE_GET:            'queue:get',
} as const;

export type SocketClientEvent = typeof SOCKET_CLIENT_EVENTS[keyof typeof SOCKET_CLIENT_EVENTS];

// ─── Serveur → Client : types sur chat:event ────────────────────────────────

export const CHAT_EVENT_TYPES = {
  CONVERSATION_LIST:          'CONVERSATION_LIST',
  CONVERSATION_UPSERT:        'CONVERSATION_UPSERT',
  CONVERSATION_ASSIGNED:      'CONVERSATION_ASSIGNED',
  CONVERSATION_REMOVED:       'CONVERSATION_REMOVED',
  CONVERSATION_READONLY:      'CONVERSATION_READONLY',
  CONVERSATION_STATUS_CHANGE: 'CONVERSATION_STATUS_CHANGE',
  TOTAL_UNREAD_UPDATE:        'TOTAL_UNREAD_UPDATE',
  MESSAGE_LIST:               'MESSAGE_LIST',
  MESSAGE_LIST_PREPEND:       'MESSAGE_LIST_PREPEND',
  MESSAGE_ADD:                'MESSAGE_ADD',
  MESSAGE_STATUS_UPDATE:      'MESSAGE_STATUS_UPDATE',
  MESSAGE_SEND_ERROR:         'MESSAGE_SEND_ERROR',
  RATE_LIMITED:               'RATE_LIMITED',
  TYPING_START:               'TYPING_START',
  TYPING_STOP:                'TYPING_STOP',
} as const;

export type ChatEventType = typeof CHAT_EVENT_TYPES[keyof typeof CHAT_EVENT_TYPES];

// ─── Codes d'erreur MESSAGE_SEND_ERROR ──────────────────────────────────────

export const MESSAGE_SEND_ERROR_CODES = {
  CONVERSATION_CLOSED:       'CONVERSATION_CLOSED',
  WINDOW_EXPIRED:            'WINDOW_EXPIRED',
  CHANNEL_NOT_FOUND:         'CHANNEL_NOT_FOUND',
  WHAPI_TRANSIENT_ERROR:     'WHAPI_TRANSIENT_ERROR',
  WHAPI_PERMANENT_ERROR:     'WHAPI_PERMANENT_ERROR',
  RESPONSE_TIMEOUT_EXCEEDED: 'RESPONSE_TIMEOUT_EXCEEDED',
  MESSAGE_SEND_FAILED:       'MESSAGE_SEND_FAILED',
} as const;

export type MessageSendErrorCode = typeof MESSAGE_SEND_ERROR_CODES[keyof typeof MESSAGE_SEND_ERROR_CODES];

// ─── Serveur → Client : types sur contact:event ─────────────────────────────

export const CONTACT_EVENT_TYPES = {
  CONTACT_LIST:                'CONTACT_LIST',
  CONTACT_DETAIL:              'CONTACT_DETAIL',
  CONTACT_UPSERT:              'CONTACT_UPSERT',
  CONTACT_REMOVED:             'CONTACT_REMOVED',
  CONTACT_CALL_STATUS_UPDATED: 'CONTACT_CALL_STATUS_UPDATED',
  CALL_LOG_NEW:                'CALL_LOG_NEW',
  CALL_LOG_LIST:               'CALL_LOG_LIST',
} as const;

export type ContactEventType = typeof CONTACT_EVENT_TYPES[keyof typeof CONTACT_EVENT_TYPES];
