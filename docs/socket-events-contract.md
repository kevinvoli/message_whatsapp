# Contrats d'événements Socket.IO

**Date :** 2026-04-14  
**TICKET :** TICKET-11-B  
**Dépendance :** TICKET-01-C (contrats socket typés localement)

> Ce document est la référence normative des canaux et événements Socket.IO échangés entre le backend NestJS et le frontend React (opérateurs commerciaux).
>
> **Source de vérité des noms :**
> - Backend : `message_whatsapp/src/realtime/events/socket-events.constants.ts`  
> - Frontend (miroir) : `front/src/lib/socket/socket-events.constants.ts`  
> - Ces deux fichiers doivent rester identiques. Vérification obligatoire à chaque PR.

---

## Architecture de transport

```
Client (front)  ←── Socket.IO ───→  WhatsappMessageGateway (NestJS)
                                          │
                                    RealtimeServerService
                                          │
                          ┌───────────────┼───────────────┐
                    ConversationPublisher  │         QueuePublisher
                    AgentConnectionService │
```

- **Rooms** : chaque poste rejoint la room `poste:{poste_id}` à la connexion
- **Auth** : token JWT dans le handshake `auth.token` — validé par `SocketAuthService`
- **Throttle** : `SocketThrottleGuard` — max 20 req/10s par client et par type d'événement

---

## Canaux (noms d'événements Socket.IO)

| Constante | Valeur string | Direction | Description |
|-----------|--------------|-----------|-------------|
| `SOCKET_CHANNEL_CHAT` | `chat:event` | bidirectionnel | Chat, messages, conversations |
| `SOCKET_CHANNEL_CONTACT` | `contact:event` | S → C | Contacts, call logs |
| `SOCKET_CHANNEL_QUEUE` | `queue:updated` | S → C | Mise à jour file d'attente |

---

## Événements Client → Serveur

### `conversations:get`
**Émetteur :** `ConversationSlice.loadConversations()` / `loadMoreConversations()`  
**Handler backend :** `WhatsappMessageGateway.handleGetConversations()`  
**Réponse attendue :** `chat:event { type: 'CONVERSATION_LIST', payload: ... }`

```typescript
// Payload envoyé (optionnel)
{
  search?: string;                              // filtre texte libre
  cursor?: { activityAt: string; chatId: string }; // pagination keyset
}
```

---

### `messages:get`
**Émetteur :** `MessageSlice.loadMoreMessages()` / `ConversationSlice.selectConversation()`  
**Handler backend :** `WhatsappMessageGateway.handleGetMessages()`  
**Réponse attendue :** `chat:event { type: 'MESSAGE_LIST' | 'MESSAGE_LIST_PREPEND', ... }`

```typescript
{
  chat_id: string;
  limit?: number;     // défaut 50
  before?: string;    // ISO timestamp — active MESSAGE_LIST_PREPEND si présent
}
```

---

### `messages:read`
**Émetteur :** `ConversationSlice.selectConversation()` + handler `MESSAGE_ADD` (message entrant)  
**Handler backend :** `WhatsappMessageGateway.handleMarkAsRead()`  
**Effets :** `unread_count = 0` en DB, émet `CONVERSATION_UPSERT` + `TOTAL_UNREAD_UPDATE`

```typescript
{ chat_id: string }
```

---

### `message:send`
**Émetteur :** `MessageSlice.sendMessage()`  
**Handler backend :** `WhatsappMessageGateway.handleSendMessage()`  
**Effets :** envoie le message via Whapi/Meta, émet `MESSAGE_ADD` + `CONVERSATION_UPSERT`

```typescript
{
  chat_id: string;
  text: string;
  tempId: string;             // UUID temporaire généré côté client
  quotedMessageId?: string;   // pour la fonctionnalité Reply
}
```

> **Idempotence :** le backend déduplique par `tempId` (TTL 10s) et par `chat_id:text` (cooldown 1,5s).

---

### `chat:event` (C → S)
**Émetteur :** `ConversationSlice` (TYPING_START/STOP, CONVERSATION_STATUS_CHANGE)  
**Handler backend :** `WhatsappMessageGateway.handleChatEvent()`

```typescript
// TYPING
{ type: 'TYPING_START' | 'TYPING_STOP', payload: { chat_id: string } }

// Changement de statut (admin)
{ type: 'CONVERSATION_STATUS_CHANGE', payload: { chat_id: string; status: WhatsappChatStatus } }
```

---

### `contacts:get`
**Émetteur :** à la connexion / refresh  
**Réponse attendue :** `contact:event { type: 'CONTACT_LIST', payload: Contact[] }`

---

### `contact:get_detail`
**Payload :** `{ chat_id: string }`  
**Réponse attendue :** `contact:event { type: 'CONTACT_DETAIL', payload: Contact | null }`

---

### `call_logs:get`
**Payload :** `{ contact_id: string }`  
**Réponse attendue :** `contact:event { type: 'CALL_LOG_LIST', payload: { contact_id, call_logs } }`

---

## Événements Serveur → Client : canal `chat:event`

| Type | Émetteur backend | Consommateur frontend | Description |
|------|-----------------|----------------------|-------------|
| `CONVERSATION_LIST` | `AgentConnectionService.sendConversationsToClient()` | `ConversationSlice.setConversations()` / `appendConversations()` | Liste complète ou page suivante |
| `CONVERSATION_ASSIGNED` | `ConversationPublisher.emitConversationAssigned()` | `ConversationSlice.addConversation()` | Nouvelle conversation assignée au poste |
| `CONVERSATION_UPSERT` | `ConversationPublisher` / gateway / publishers | `ConversationSlice.updateConversation()` | Mise à jour d'une conversation existante |
| `CONVERSATION_REMOVED` | `ConversationPublisher.emitConversationRemoved()` | `ConversationSlice.removeConversationBychat_id()` | Conversation retirée du poste (réassignation) |
| `CONVERSATION_READONLY` | `ConversationPublisher.emitConversationReadonly()` | patch interne `upsertConversationPatch()` | Conversation passée en lecture seule |
| `TOTAL_UNREAD_UPDATE` | gateway `handleMarkAsRead()` | `ConversationSlice.setTotalUnread()` | Compteur global non lus pour le poste |
| `MESSAGE_LIST` | gateway `handleGetMessages()` | `MessageSlice.setMessages()` | Historique initial de messages |
| `MESSAGE_LIST_PREPEND` | gateway `handleGetMessages()` (with `before`) | `MessageSlice.prependMessages()` | Messages plus anciens (scroll up) |
| `MESSAGE_ADD` | gateway `notifyNewMessage()` / `handleSendMessage()` | `MessageSlice.addMessage()` ou réconciliation `tempId` | Nouveau message (entrant ou sortant) |
| `MESSAGE_STATUS_UPDATE` | gateway `notifyStatusUpdate()` | `MessageSlice.updateMessageStatus()` | Statut message mis à jour (delivered, read, failed) |
| `MESSAGE_SEND_ERROR` | gateway `handleSendMessage()` | router → log + patch message `status: 'error'` | Erreur d'envoi (avec code) |
| `TYPING_START` | gateway `handleChatEvent()` / `emitTyping()` | `ConversationSlice.setTyping()` | Agent ou auto-message en cours de saisie |
| `TYPING_STOP` | gateway `handleChatEvent()` / `emitTyping()` | `ConversationSlice.clearTyping()` | Fin de saisie |
| `RATE_LIMITED` | gateway throttle | log uniquement | Événement bloqué par le throttle |

### Payload `CONVERSATION_ASSIGNED` / `CONVERSATION_UPSERT`
Produit par `mapConversation()` (`src/realtime/mappers/socket-conversation.mapper.ts`) :

```typescript
{
  id: string;
  chat_id: string;
  poste_id: string | null;
  poste?: { id, name, code };
  name: string;             // nom du client
  client_phone: string;
  status: 'nouveau' | 'actif' | 'en attente' | 'converti' | 'fermé';
  unreadCount: number;
  last_message?: { id, text, from_me, timestamp, ... };
  last_activity_at?: string;
  last_client_message_at?: string;
  last_poste_message_at?: string;
  first_response_deadline_at?: string;
  channel_id?: string;
  last_msg_client_channel_id?: string;
  // ... autres champs conversation
}
```

> **Note :** le frontend normalise `'en attente'` → `'attente'` dans `transformToConversation()`.

### Payload `MESSAGE_ADD`
Produit par `mapMessage()` (`src/realtime/mappers/socket-message.mapper.ts`) :

```typescript
{
  id: string;
  chat_id: string;
  text: string;
  from_me: boolean;
  from: string;
  from_name?: string;
  timestamp: string;    // ISO 8601
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'error';
  direction?: 'IN' | 'OUT';
  commercial_id?: string | null;
  poste_id?: string;
  medias?: Array<{ type, url, mime_type, duration, ... }>;
  quotedMessage?: { id, text, from_name, from_me };
  tempId?: string;      // présent uniquement si envoi sortant (réconciliation optimistic)
}
```

### Codes d'erreur `MESSAGE_SEND_ERROR`

| Code | Cause |
|------|-------|
| `CONVERSATION_CLOSED` | Conversation en statut `fermé` |
| `WINDOW_EXPIRED` | Fenêtre 23h WhatsApp expirée (dernier message client > 23h) |
| `CHANNEL_NOT_FOUND` | Channel introuvable pour cette conversation |
| `WHAPI_TRANSIENT_ERROR` | Erreur transitoire Whapi (retry possible) |
| `WHAPI_PERMANENT_ERROR` | Erreur permanente Whapi (pas de retry) |
| `RESPONSE_TIMEOUT_EXCEEDED` | Timeout dépassé en attente de réponse Whapi |
| `MESSAGE_SEND_FAILED` | Erreur générique d'envoi |

---

## Événements Serveur → Client : canal `contact:event`

| Type | Émetteur backend | Consommateur frontend | Description |
|------|-----------------|----------------------|-------------|
| `CONTACT_LIST` | gateway `sendContactsToClient()` | `ContactStore` | Liste complète des contacts du poste |
| `CONTACT_DETAIL` | gateway `handleGetContactDetail()` | `ContactStore.setSelectedContactDetail()` | Détail d'un contact |
| `CONTACT_UPSERT` | gateway `emitContactUpsert()` | `ContactStore.upsertContact()` | Contact créé ou modifié |
| `CONTACT_REMOVED` | gateway `emitContactRemoved()` | `ContactStore.removeContact()` | Contact supprimé |
| `CONTACT_CALL_STATUS_UPDATED` | gateway `emitContactCallStatusUpdated()` | `ContactStore.upsertContact()` | Statut d'appel mis à jour |
| `CALL_LOG_LIST` | gateway `handleGetCallLogs()` | `ContactStore.setCallLogs()` | Historique d'appels d'un contact |
| `CALL_LOG_NEW` | gateway `emitCallLogNew()` | `ContactStore.addCallLog()` | Nouvel appel enregistré |

---

## Événements Serveur → Client : canal `queue:updated`

**Émetteur :** `QueuePublisher.emit()`  
**Consommateur :** `handleQueueUpdated()` dans `socket-event-router.ts` → log uniquement (la queue admin se rafraîchit par polling HTTP)

```typescript
{
  timestamp: string;
  reason: string;   // 'admin_reset' | 'admin_block' | 'admin_unblock' | 'poste_connected' | 'poste_disconnected' | ...
  data: unknown[];  // liste des postes en queue (pour l'admin)
}
```

---

## Réconciliation optimistic (MESSAGE_ADD + tempId)

1. Le client génère un `tempId` (UUID) et ajoute un message temporaire `{ id: tempId, status: 'sending' }` au store
2. Le client émet `message:send` avec `{ text, tempId, ... }`
3. Le backend émet `MESSAGE_ADD` avec `{ ...mapMessage(msg), tempId }`
4. Le frontend (`handleChatEvent`) détecte `tempId` dans le payload :
   - Si trouvé dans `messages[]` → `setMessages()` remplace l'index (réconciliation)
   - Si non trouvé (ex. duplication late) → `addMessage()` (ajout normal)
5. En cas d'erreur : le backend émet `MESSAGE_SEND_ERROR` → le frontend marque le message en `status: 'error'`

---

## Règles de room et filtrage tenant

- À la connexion, le client joint la room `poste:{poste_id}`
- Le backend filtre les messages par canal dédié au poste (`getDedicatedChannelIdsForPoste`)
- Les tenants multi-canaux ne voient que leurs propres conversations (`tenant_id` matching)
- Les conversations sans `tenant_id` (données avant multi-tenant) sont visibles par tous

---

## Tests de référence

- `front/src/modules/realtime/services/socket-event-router.spec.ts` — 8 tests (SC-01 à SC-08)  
  Couvre : CONVERSATION_ASSIGNED, MESSAGE_ADD, réconciliation tempId, CONVERSATION_REMOVED, TOTAL_UNREAD_UPDATE, MESSAGE_STATUS_UPDATE, TYPING_START (autre user), TYPING_START (même user ignoré)
