# Analyse complete du flux des messages et conversations

## RESUME

Analyse du flux complet des messages depuis les webhooks WhatsApp jusqu'a l'affichage sur les plateformes front (agent) et admin, ainsi que le flux inverse (agent envoie un message au client).

---

## 1. FLUX ENTRANT (Client WhatsApp -> Webhook -> Backend -> Frontend)

### ETAPE 1 : Point d'entree Webhook

**Endpoints** :
- `POST /webhooks/whapi` - Fournisseur Whapi
- `POST /webhooks/whatsapp` - Meta/WhatsApp Business Account

**Validation** :
- Verification signature HMAC (WHAPI_WEBHOOK_SECRET_HEADER + WHAPI_WEBHOOK_SECRET_VALUE)
- Resolution du tenant via channel_id -> provider_mappings
- Validation du schema du payload

**Feature Flag** `FF_UNIFIED_WEBHOOK_ROUTER` (defaut: true) :
```
├── NOUVEAU PATH : unified-ingress.service.ts
├── LEGACY PATH : traitement direct via whapi.service.ts
└── SHADOW : Execute les deux si FF_SHADOW_UNIFIED active
```

### ETAPE 2 : Normalisation du message

**Fichiers** : `src/webhooks/adapters/whapi.adapter.ts`, `src/webhooks/adapters/meta.adapter.ts`

Les adaptateurs transforment les payloads bruts en `UnifiedMessage` :

```
UnifiedMessage {
  provider: 'whapi' | 'meta'
  providerMessageId: string
  tenantId: string
  channelId: string
  chatId: string        // ex: "2250700000000@s.whatsapp.net"
  from: string
  fromName?: string
  timestamp: number
  direction: 'in' | 'out'
  type: 'text'|'image'|'video'|'audio'|'voice'|'document'|'location'|'interactive'
  text?: string
  media?: { id, mimeType, fileName, fileSize, caption, sha256 }
  location?: { latitude, longitude, name, address }
  interactive?: { kind, id, title, description }
  raw: unknown
}
```

### ETAPE 3 : Dispatcher

**Fichier** : `src/dispatcher/dispatcher.service.ts`

`assignConversation(clientPhone, clientName, traceId)` -> `WhatsappChat | null`

```
1. Chercher conversation existante par chat_id
   └── Si trouvee + agent connecte -> Incrementer unread_count, retourner

2. Obtenir prochain agent disponible via queue (least-loaded)
   └── Si aucun -> Retourner null

3. Si conversation existante sans agent -> Reassigner au prochain agent
   └── Maj poste_id, status (ACTIF|EN_ATTENTE), timestamps

4. Si nouvelle conversation -> Creer avec prochain agent
   └── unread_count: 1, first_response_deadline_at: now + 5 min
```

### ETAPE 4 : Persistance du message

**Fichier** : `src/webhooks/inbound-message.service.ts` (lignes 36-114)

Pour chaque message :
1. **Valider le chat_id** : doit contenir @, pas de groupe (@g.us), digits: 8-20 chars
2. **Assigner la conversation** via le dispatcher
3. **Sauvegarder le message** via `whatsappMessageService.saveIncomingFromUnified()`

**`saveIncomingFromUnified()`** (`src/whatsapp_message/whatsapp_message.service.ts`, lignes 587-686) :
```
1. Verifier duplicata par (tenant_id, provider, provider_message_id, direction)
   └── Si existe -> Retourner l'existant

2. Trouver/creer le contact

3. Mettre a jour le chat avec le dernier channel utilise
   └── last_msg_client_channel_id = channel.channel_id

4. Creer l'entite message :
   - tenant_id, provider, provider_message_id
   - direction: IN, from_me: false
   - status: SENT
   - source: 'whapi' ou 'meta'
   - Relations: chat, channel, contact, poste

5. Sauvegarder en base avec gestion de race condition
```

**Resolution du texte par type** :
| Type | Texte affiche |
|------|---------------|
| text | message.text |
| image | media.caption ?? '[Photo client]' |
| video | media.caption ?? '[Video client]' |
| audio/voice | '[Message vocal client]' |
| document | media.fileName ?? '[Document client]' |
| location | '[Localisation client]' |
| interactive | interactive.title ?? '[Reponse interactive client]' |

### ETAPE 5 : Emission WebSocket

**Fichier** : `src/whatsapp_message/whatsapp_message.gateway.ts` (lignes 538-579)

`notifyNewMessage(message, chat)` :
```
1. Animation typing (2 secondes) si message entrant
   └── emitTyping(chat_id, true)
   └── setTimeout 2s -> emitTyping(chat_id, false)

2. Broadcast MESSAGE_ADD a tous les agents du tenant
   server.to(`tenant:${chat.tenant_id}`).emit('chat:event', {
     type: 'MESSAGE_ADD',
     payload: mapMessage(message)
   })

3. Recuperer les stats mises a jour
   └── lastMessage, unreadCount

4. Broadcast CONVERSATION_UPSERT a tous les agents du tenant
   server.to(`tenant:${chat.tenant_id}`).emit('chat:event', {
     type: 'CONVERSATION_UPSERT',
     payload: mapConversation(chat, lastMessage, unreadCount)
   })
```

**Format mapMessage()** (lignes 732-757) :
```
{
  id, chat_id, from_me, text, timestamp, status,
  from, from_name, poste_id, direction, types,
  medias: [{ id, type, url, mime_type, caption, file_name, file_size, seconds, latitude, longitude }]
}
```

**Format mapConversation()** (lignes 759-791) :
```
{
  id, chat_id, channel_id, last_msg_client_channel_id,
  name, poste_id, status, unreadCount, createdAt, updatedAt,
  auto_message_status, last_activity_at, last_client_message_at, last_poste_message_at,
  poste: { id, name, is_active },
  last_message: { id, text, timestamp, from_me, status, type }
}
```

### ETAPE 6 : Reception Frontend

**Fichier** : `front/src/components/WebSocketEvents.tsx`

Initialisation socket (lignes 37-52) :
```typescript
socket.on('chat:event', handleChatEvent)
socket.on('contact:event', handleContactEvent)
socket.on('error', handleSocketError)
socket.on('connect', refreshAfterConnect)
```

`handleChatEvent()` (lignes 72-170) traite :

| Type | Action |
|------|--------|
| `MESSAGE_ADD` | Verifier tempId, remplacer message temp ou ajouter |
| `CONVERSATION_UPSERT` | Mettre a jour conversation dans le store |
| `MESSAGE_LIST` | Charger tous les messages du chat |
| `CONVERSATION_REMOVED` | Retirer de la liste |
| `CONVERSATION_ASSIGNED` | Ajouter nouvelle conversation |
| `TYPING_START/STOP` | Afficher/masquer indicateur de frappe |
| `MESSAGE_SEND_ERROR` | Changer status du message en 'error' |

**Store Zustand** (`chatStore.ts`) :
```
addMessage(message)              -> Ajouter au tableau messages
updateConversation(conversation) -> Upsert dans conversations
setMessages(chatId, messages)    -> Remplacer tous les messages du chat
setTyping(chatId)                -> Marquer comme "en train d'ecrire"
clearTyping(chatId)              -> Arreter l'indicateur
```

---

## 2. FLUX SORTANT (Agent envoie -> WhatsApp API -> Client)

### ETAPE 1 : Envoi depuis le Frontend

**Fichier** : `front/src/components/ChatMainArea.tsx`

Quand l'agent clique "envoyer" :
```typescript
1. Creer tempId = crypto.randomUUID()
2. Creer tempMessage = { id: tempId, status: 'sending', ... }
3. addMessage(tempMessage)  // Affichage immediat (optimistic UI)
4. socket.emit('message:send', {
     chat_id: selectedConversation.chat_id,
     text: userInput,
     tempId
   })
5. setUserInput('')  // Vider le champ
```

### ETAPE 2 : Handler Gateway

**Fichier** : `src/whatsapp_message/whatsapp_message.gateway.ts` (lignes 438-533)

`@SubscribeMessage('message:send')` :
```
1. Recuperer l'agent depuis connectedAgents
   └── Verifier que le socket est connecte

2. Trouver le chat par chat_id
   └── Verifier qu'il appartient au tenant de l'agent

3. Resoudre le channel
   └── Priorite: last_msg_client_channel_id -> channel_id -> lastMessage.channel_id
   └── Si aucun -> emit MESSAGE_SEND_ERROR (CHANNEL_NOT_FOUND)

4. Appeler messageService.createAgentMessage({
     chat_id, text, poste_id, channel_id,
     timestamp: now, commercial_id: agent.commercialId
   })

5. Broadcast MESSAGE_ADD avec tempId a tous les agents du tenant

6. Broadcast CONVERSATION_UPSERT avec stats mises a jour
```

### ETAPE 3 : Appel API Whapi

**Fichier** : `src/whatsapp_message/whatsapp_message.service.ts` (lignes 103-219)

`createAgentMessage()` :
```
1. Trouver le chat
2. Trouver le commercial (agent)

3. Verifier le timeout de reponse (fenetre de 24h)
   └── Si dernier message client > 24h -> Erreur

4. ENVOYER VIA WHAPI API
   whapiResponse = communicationWhapiService.sendToWhapiChannel({
     to: extractPhoneNumber(chat_id),
     text, channelId
   })

5. CREER L'ENTITE MESSAGE
   { message_id: whapiResponse.id, direction: OUT, from_me: true,
     status: SENT, source: 'agent_web', ... }

6. SAUVEGARDER EN BASE

7. METTRE A JOUR LE CHAT
   { unread_count: 0, last_poste_message_at: now, last_activity_at: now }
```

### ETAPE 4 : Appel HTTP vers Whapi

**Fichier** : `src/communication_whapi/communication_whapi.service.ts` (lignes 103-168)

`sendToWhapiChannel()` :
```
1. VALIDER
   to = validateWhapiRecipient(data.to)   // Digits 8-20 chars
   body = validateWhapiBody(data.text)     // Max 4096 octets UTF-8

2. TROUVER LE CHANNEL -> Recuperer le token

3. BOUCLE DE RETRY (max 3 tentatives)
   POST https://gate.whapi.cloud/messages/text
   Headers: { Authorization: Bearer ${token} }
   Body: { to, body }

   En cas d'erreur :
   - Transient (408, 429, 500, 502, 503, 504) -> Retry avec backoff exponentiel (250ms, 500ms, 1000ms)
   - Permanent (400, 401, 403, 404) -> Echec immediat
```

### ETAPE 5 : Confirmation de statut

Quand WhatsApp delivre/lit le message :
```
POST /webhooks/whapi { statuses: [...] }
  -> WhapiAdapter.normalizeStatuses() -> UnifiedStatus[]
  -> InboundMessageService.handleStatuses()
  -> UPDATE whatsapp_message SET status = 'delivered'|'read'
```

**PROBLEME** : Les mises a jour de statut ne sont PAS broadcast via socket au frontend. Le frontend ne sait jamais si le message a ete delivre/lu.

---

## 3. CYCLE DE VIE DES CONVERSATIONS

### Creation (Premier message)

**Declencheur** : `dispatcherService.assignConversation()` (lignes 134-166)

```
WhatsappChat {
  chat_id: "2250700000000@s.whatsapp.net"
  name: "John Doe"
  type: "private"
  poste: nextAgent
  status: ACTIF (si agent online) ou EN_ATTENTE (offline)
  unread_count: 1
  assigned_at: now
  assigned_mode: 'ONLINE' | 'OFFLINE'
  first_response_deadline_at: now + 5 minutes
  last_client_message_at: now
}
```

**Broadcast** : `CONVERSATION_ASSIGNED` + `MESSAGE_ADD`

### Changements de statut

| Transition | Declencheur |
|-----------|-------------|
| ACTIF -> EN_ATTENTE | Agent se deconnecte ou timeout SLA |
| EN_ATTENTE -> ACTIF | Agent se connecte ou conversation reassignee |
| ACTIF/EN_ATTENTE -> FERME | Fermeture manuelle ou automatique |
| FERME -> ACTIF | Nouveau message sur conversation fermee |

### Compteur de non-lus

- **Incremente** : A chaque message entrant (direction = IN) via `unread_count += 1`
- **Remis a 0** : Quand l'agent lit via `messages:read` -> `chatService.markChatAsRead(chat_id)`

### Suivi d'activite

| Champ | Mis a jour quand |
|-------|-----------------|
| `last_activity_at` | Chaque message (entrant ou sortant) |
| `last_client_message_at` | Message entrant uniquement |
| `last_poste_message_at` | Message sortant uniquement |
| `last_msg_client_channel_id` | Message entrant (channel utilise par le client) |

### Mode lecture seule (Read-Only)

```
chatRepository.update({ chat_id }, { read_only: true })

Effets :
├── dispatcherService : Retourne null si read_only
├── Traitement du message ignore
└── Broadcast: CONVERSATION_READONLY { chat_id, read_only: true }
```

### Reassignation

```
reinjectConversation(chat)
  1. Vider l'assignation : poste = null, assigned_mode = null
  2. Obtenir prochain agent : queueService.getNextInQueue()
  3. Reassigner avec nouvelles infos
  4. Broadcast :
     ├── CONVERSATION_ASSIGNED -> nouvel agent
     └── CONVERSATION_REMOVED -> ancien agent
```

---

## 4. DIFFERENCES ADMIN vs FRONT

### Plateforme Agent (`/front/src`)

| Aspect | Detail |
|--------|--------|
| **Portee** | Uniquement les conversations assignees a son poste |
| **Messages** | Seulement dans les chats assignes |
| **Permissions** | Envoyer messages, marquer comme lu, gerer chats assignes |
| **Fonctionnalites** | Liste de chats, fil de messages, typing, badges non-lus, contacts |

### Plateforme Admin (`/admin/src`)

| Aspect | Detail |
|--------|--------|
| **Portee** | TOUTES les conversations (cross-postes) |
| **Messages** | Tous les messages de tous les chats |
| **Permissions** | Reassigner conversations, verrouiller chats, voir metriques |
| **Fonctionnalites** | Dashboard, gestion queue, monitoring agents, statistiques |

### Filtrage cote backend

```typescript
// Front : Seulement les chats assignes
let chats = await chatService.findByPosteId(agent.posteId)
chats = chats.filter(c => c.tenant_id === agent.tenantId)

// Admin : Tous les chats du tenant
let chats = await chatService.findByTenantId(adminTenantId)
```

### Evenements supplementaires pour l'Admin

- `queue:updated` : Etat complet de la queue
- Changements de statut des agents
- Alertes violations SLA
- Donnees metriques dashboard

---

## 5. REFERENCE COMPLETE DES EVENEMENTS SOCKET.IO

### Evenements CLIENT -> SERVEUR

| Evenement | Payload | Reponse |
|-----------|---------|---------|
| `conversations:get` | `{ search?: string }` | `chat:event` type `CONVERSATION_LIST` |
| `contacts:get` | aucun | `contact:event` type `CONTACT_LIST` |
| `messages:get` | `{ chat_id: string }` | `chat:event` type `MESSAGE_LIST` |
| `messages:read` | `{ chat_id: string }` | `chat:event` type `CONVERSATION_UPSERT` |
| `message:send` | `{ chat_id, text, tempId }` | `MESSAGE_ADD` + `CONVERSATION_UPSERT` ou `MESSAGE_SEND_ERROR` |
| `chat:event` (typing) | `{ type: 'TYPING_START'\|'TYPING_STOP', payload: { chat_id } }` | Broadcast aux autres agents |

### Evenements SERVEUR -> CLIENT

| Evenement | Type | Payload | Declencheur |
|-----------|------|---------|-------------|
| `chat:event` | `MESSAGE_ADD` | Message complet avec medias | Nouveau message (entrant ou sortant) |
| `chat:event` | `CONVERSATION_UPSERT` | Conversation complete | Chat mis a jour |
| `chat:event` | `CONVERSATION_LIST` | `[Conversation, ...]` | Chargement initial ou refresh |
| `chat:event` | `MESSAGE_LIST` | `{ chat_id, messages: [...] }` | Chargement messages d'un chat |
| `chat:event` | `CONVERSATION_REMOVED` | `{ chat_id }` | Conversation reassignee ailleurs |
| `chat:event` | `CONVERSATION_ASSIGNED` | Conversation complete | Nouvelle conversation assignee |
| `chat:event` | `CONVERSATION_READONLY` | `{ chat_id, read_only }` | Chat verrouille |
| `chat:event` | `TYPING_START` | `{ chat_id, commercial_id? }` | Agent/client en train d'ecrire |
| `chat:event` | `TYPING_STOP` | `{ chat_id }` | Arret de frappe |
| `chat:event` | `MESSAGE_SEND_ERROR` | `{ chat_id, tempId, code, message }` | Echec d'envoi |
| `contact:event` | `CONTACT_LIST` | `[Contact, ...]` | Chargement initial |
| `contact:event` | `CONTACT_UPSERT` | Contact complet | Contact mis a jour |
| `contact:event` | `CONTACT_REMOVED` | `{ contact_id, chat_id }` | Contact supprime |
| `contact:event` | `CONTACT_CALL_STATUS_UPDATED` | Contact avec call_status | Statut appel change |
| `queue:updated` | - | `{ timestamp, reason, data: [...] }` | Queue modifiee |

---

## 6. SCHEMA BASE DE DONNEES (cles)

### Relations principales

```
whatsapp_poste
├── 1:N -> whatsapp_chat (poste_id)
├── 1:N -> whatsapp_message (poste_id)
└── 1:N -> whatsapp_commercial (poste_id)

whatsapp_chat
├── N:1 -> whatsapp_poste (poste_id)
├── N:1 -> whapi_channel (channel_id)
├── 1:N -> whatsapp_message (chat_id)
├── 1:N -> whatsapp_media (chat_id)
└── 1:N -> contact (chat_id)

whatsapp_message
├── N:1 -> whatsapp_chat (chat_id)
├── N:1 -> whatsapp_poste (poste_id)
├── N:1 -> whapi_channel (channel_id)
├── N:1 -> contact (contact_id)
├── N:1 -> whatsapp_commercial (commercial_id)
└── 1:N -> whatsapp_media (message_id)
```

---

## 7. PROBLEMES IDENTIFIES DANS LE FLUX

### CRITIQUE

#### 1. Statut de message non broadcast au frontend
**Fichier** : `src/webhooks/inbound-message.service.ts`

Les mises a jour de statut (delivered, read) arrivent via webhook mais ne sont jamais emises via socket au frontend. L'agent voit toujours "envoye" sans jamais voir "delivre" ou "lu".

#### 2. Pas de rate limiting sur les evenements socket
**Fichier** : `src/whatsapp_message/whatsapp_message.gateway.ts`

Tous les handlers acceptent des requetes illimitees. Un client abusif peut spammer des messages ou provoquer des tempetes de requetes.

### MOYEN

#### 3. Resolution du channel en fallback
Le channel est resolu en cascade : `last_msg_client_channel_id` -> `channel_id` -> `lastMessage.channel_id`. Si le compte Whapi du client change, l'agent envoie depuis l'ancien compte.

#### 4. Evenements typing non scopes par tenant
Pas de validation que le chat_id appartient au tenant de l'agent dans le handler typing.

#### 5. Pas d'idempotence pour les messages envoyes via socket
Si le frontend retry avec le meme tempId, le message pourrait etre duplique.

#### 6. Check de duplicata incomplet
La verification de duplicata de message ne filtre pas par chat_id et tenant_id, seulement par provider_message_id et provider.

### BAS

#### 7. Pas de validation de taille pour les medias
Les medias entrants ne sont pas valides en taille. Des fichiers tres volumineux pourraient saturer le stockage.

#### 8. Recherche de conversation insensible a la casse
Le chat_id (telephone) est compare de maniere sensible a la casse.

---

## 8. MAPPING CHAMPS : DOC OFFICIELLE vs CODE (Whapi)

**Source** : [Whapi Incoming Webhooks](https://support.whapi.cloud/help-desk/receiving/webhooks/incoming-webhooks-format/incoming-message)

### 8.1 Payload Webhook Whapi (doc officielle)

```json
{
  "messages": [{
    "id": "string",                    // ✅ -> providerMessageId
    "from_me": "boolean",              // ✅ -> direction ('in'|'out')
    "type": "string",                  // ✅ -> type (mappage partiel)
    "chat_id": "string",              // ✅ -> chatId
    "timestamp": "number",            // ✅ -> timestamp
    "source": "string",               // ❌ IGNORE (web|mobile|api|system|business_api)
    "device_id": "number",            // ❌ IGNORE
    "chat_name": "string",            // ❌ IGNORE
    "from": "string",                 // ✅ -> from
    "from_name": "string",            // ✅ -> fromName
    "status": "string",               // ❌ IGNORE (failed|pending|sent|delivered|read|played|deleted)
    "subtype": "string",              // ❌ IGNORE
    "context": {                      // ❌ IGNORE (messages cites/forwarded)
      "quoted_id": "string",
      "quoted_author": "string",
      "quoted_content": {},
      "quoted_type": "string",
      "ad": {}                        // ❌ IGNORE (attribution Facebook Ads)
    },
    "reactions": {},                   // ❌ IGNORE
    "action": {}                      // ❌ IGNORE (edit, delete)
  }],
  "event": {
    "type": "messages",               // ✅ Utilise pour router
    "event": "post|put|patch"         // ⚠️ Seul "post" gere, put/patch ignores
  },
  "channel_id": "string"             // ✅ -> channelId (resolution tenant)
}
```

### 8.2 Types de messages Whapi : couverture

| Type Whapi (doc) | Supporte | Mapping code | Remarque |
|-------------------|----------|--------------|----------|
| `text` | ✅ | `text` | `text.body` extrait |
| `image` | ✅ | `image` | id, mimeType, fileSize, caption, sha256 |
| `video` | ✅ | `video` | idem image + seconds |
| `gif` | ✅ | `video` | Traite comme video |
| `short` | ✅ | `video` | Traite comme video |
| `audio` | ✅ | `audio` | id, mimeType, fileSize, sha256 |
| `voice` | ✅ | `voice` | idem audio + seconds |
| `document` | ✅ | `document` | id, mimeType, fileName, fileSize, sha256 |
| `sticker` | ✅ | `sticker` | id, mimeType, fileSize, sha256 |
| `location` | ✅ | `location` | latitude, longitude, name, address |
| `live_location` | ✅ | `location` | Traite comme location simple |
| `link_preview` | ❌ | `unknown` | **NON GERE** - body, url, title, preview perdus |
| `contact` | ❌ | `unknown` | **NON GERE** - name, vcard perdus |
| `contact_list` | ❌ | `unknown` | **NON GERE** |
| `poll` | ❌ | `unknown` | **NON GERE** - title, options, results perdus |
| `order` | ❌ | `unknown` | **NON GERE** |
| `product` | ❌ | `unknown` | **NON GERE** |
| `catalog` | ❌ | `unknown` | **NON GERE** |
| `group_invite` | ❌ | `unknown` | **NON GERE** |
| `admin_invite` | ❌ | `unknown` | **NON GERE** |
| `hsm` | ❌ | `unknown` | **NON GERE** - messages template |
| `carousel` | ❌ | `unknown` | **NON GERE** |
| `reaction` | ❌ | `unknown` | **NON GERE** - emoji, target perdus |
| `reply` (buttons_reply) | ❌ | `unknown` | **NON GERE** |
| `list` | ⚠️ | `interactive` | Mappe en interactive mais sans extraction des champs |
| `buttons` | ⚠️ | `interactive` | Mappe en interactive mais sans extraction des champs |

### 8.3 Webhook de statut Whapi (doc officielle)

```json
{
  "statuses": [{
    "id": "string",            // ✅ -> providerMessageId
    "code": "number",          // ❌ IGNORE
    "status": "string",        // ✅ -> status (read|delivered|sent|failed)
    "recipient_id": "string",  // ✅ -> recipientId
    "timestamp": "string"      // ✅ -> timestamp (converti en number)
  }],
  "event": { "type": "statuses", "event": "post" },
  "channel_id": "string"      // ✅ -> channelId
}
```

### 8.4 Champ `link` des medias (auto-download)

La doc Whapi indique que le champ `link` n'apparait QUE si l'auto-download est active sur le channel. Sans auto-download, seul `id` est fourni et il faut appeler `GET /media/{id}` pour recuperer le fichier.

**Dans le code** : Le champ `link` n'est PAS extrait par l'adapter. Les medias sont stockes avec `id` uniquement. Le telechargement eventuel se fait ailleurs (non audite ici).

---

## 9. MAPPING CHAMPS : DOC OFFICIELLE vs CODE (Meta WhatsApp Cloud API)

**Source** : [Meta WhatsApp Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components), [360dialog Reference](https://docs.360dialog.com/docs/waba-basics/webhook-events-and-notifications)

### 9.1 Structure enveloppe Meta (doc officielle)

```json
{
  "object": "whatsapp_business_account",    // ✅ Valide (doit etre cette valeur)
  "entry": [{
    "id": "WABA_ID",                        // ✅ Valide (required)
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",    // ❌ IGNORE (pas verifie)
        "metadata": {
          "display_phone_number": "string", // ❌ IGNORE
          "phone_number_id": "string"       // ✅ -> channelId
        },
        "contacts": [{
          "profile": { "name": "string" },  // ✅ -> fromName
          "wa_id": "string"                 // ❌ IGNORE (utilise message.from)
        }],
        "messages": [{...}],                // ✅ -> normalizeMessages()
        "statuses": [{...}],                // ✅ -> normalizeStatuses()
        "errors": [{...}]                   // ❌ IGNORE (erreurs hors-bande)
      },
      "field": "messages"                   // ❌ PAS VERIFIE
    }]
  }]
}
```

### 9.2 Types de messages Meta : couverture

| Type Meta (doc) | Supporte | Mapping code | Remarque |
|-----------------|----------|--------------|----------|
| `text` | ✅ | `text` | `text.body` extrait |
| `image` | ✅ | `image` | id, mimeType, caption, sha256 (**pas de fileSize**) |
| `video` | ✅ | `video` | id, mimeType, caption, sha256 (**pas de fileSize**) |
| `audio` | ✅ | `audio` | id, mimeType, sha256 (**pas de fileSize**) |
| `document` | ✅ | `document` | id, mimeType, fileName, sha256 (**pas de fileSize**) |
| `location` | ✅ | `location` | latitude, longitude, name, address |
| `sticker` | ❌ | `unknown` | **NON GERE** - mime_type, sha256, id perdus |
| `contacts` | ❌ | `unknown` | **NON GERE** - vcard, name, phones perdus |
| `interactive` (list_reply) | ✅ | `interactive` | kind=list_reply, id, title, description |
| `interactive` (button_reply) | ✅ | `interactive` | kind=button_reply, id, title |
| `interactive` (nfm_reply/flow) | ❌ | `unknown` | **NON GERE** - flow_token, response_json perdus |
| `button` (legacy) | ✅ | `interactive` | text -> title, payload -> id |
| `reaction` | ❌ | `unknown` | **NON GERE** - emoji, message_id perdus |
| `order` | ❌ | `unknown` | **NON GERE** - catalog_id, product_items perdus |
| `system` (user_changed_number) | ❌ | `unknown` | **NON GERE** - new_wa_id perdu |
| `request_welcome` | ❌ | `unknown` | **NON GERE** - premier contact |
| `unknown` | ❌ | `unknown` | Erreur 131051 dans le payload |
| `referral` (Click-to-WhatsApp Ads) | ❌ | `unknown` | **NON GERE** - source_url, headline, ctwa_clid perdus |

### 9.3 Webhook de statut Meta (doc officielle)

```json
{
  "statuses": [{
    "id": "wamid.ID",              // ✅ -> providerMessageId
    "status": "sent|delivered|read|failed",  // ✅ -> status
    "timestamp": "string",         // ✅ -> timestamp (converti en number)
    "recipient_id": "string",      // ✅ -> recipientId
    "conversation": {              // ❌ IGNORE
      "id": "string",
      "expiration_timestamp": "string",
      "origin": { "type": "string" }  // user_initiated|business_initiated|referral_conversion
    },
    "pricing": {                   // ❌ IGNORE
      "billable": "boolean",
      "pricing_model": "CBP",
      "category": "service|authentication|marketing|utility"
    },
    "errors": [{                   // ❌ IGNORE
      "code": "number",
      "title": "string"
    }]
  }]
}
```

**Donnees perdues notables** :
- `conversation.origin.type` : Permet de savoir si c'est le client ou le business qui a initie
- `pricing` : Informations de facturation (billable, category)
- `errors` sur les statuts failed : Code et titre de l'erreur de livraison

### 9.4 Champ `context` Meta (messages cites)

```json
"context": {
  "from": "PHONE_NUMBER",           // ❌ IGNORE
  "id": "wamid.ID",                 // ❌ IGNORE (ID du message cite)
  "referred_product": {             // ❌ IGNORE
    "catalog_id": "string",
    "product_retailer_id": "string"
  }
}
```

Le code ne gere **aucun contexte de citation** (reply-to). Ni pour Whapi ni pour Meta.

---

## 10. DIFFERENCES CLES ENTRE PROVIDERS

| Aspect | Whapi (doc) | Meta (doc) | Impact code |
|--------|-------------|------------|-------------|
| **Direction** | `from_me` (boolean) | Toujours entrant | Whapi peut recevoir ses propres messages sortants |
| **Chat ID** | Fourni directement | Construit: `${from}@s.whatsapp.net` | Risque de format inconsistant |
| **Nom contact** | Dans le message (`from_name`) | Dans `contacts[0].profile.name` | Extraction differente par adapter |
| **Taille media** | `file_size` fourni | **Non fourni** | Champ toujours absent pour Meta |
| **Preview media** | `preview` base64 fourni | **Non fourni** | Thumbnails indisponibles pour Meta |
| **Link media** | Fourni si auto-download | Via `GET /media/{id}` avec token | Methodes de recuperation differentes |
| **Sticker** | ✅ Supporte | ❌ Non gere dans le code | Asymetrie de types |
| **Interactive** | Non extrait (null) | Extrait (kind, id, title) | Reponses aux boutons perdues sur Whapi |
| **Reactions** | Disponible (action.type=reaction) | Disponible (type=reaction) | **Jamais gere** |
| **Messages cites** | `context.quoted_id/content` | `context.from/id` | **Jamais gere** |
| **Statut code erreur** | `code` numerique | `errors[{code, title}]` | **Jamais gere** |
| **Fenetre 24h** | Geree cote serveur | Geree par Meta | Double controle necessaire |
| **Timestamp** | `number` natif | `string` a convertir | Conversion dans meta.adapter |

---

## 11. ENVOI SORTANT : ARCHITECTURE CIBLE vs ETAT ACTUEL

### 11.0 Specification : Routage par provider

**Comportement attendu** : Lors de l'envoi d'un message, le systeme DOIT :
1. Determiner le provider du channel de la conversation (`whapi` ou `meta`)
2. Router vers l'endpoint correspondant (Whapi API ou Meta Cloud API)
3. Adapter le format du payload selon le provider cible

```
Agent envoie un message
  |
  v
Resoudre le channel de la conversation
  |
  v
Lire channel.provider
  |
  ├── provider = 'whapi'
  |     └── POST https://gate.whapi.cloud/messages/text
  |           Body: { to, body }
  |           Auth: Bearer {whapi_token}
  |
  └── provider = 'meta'
        └── POST https://graph.facebook.com/v21.0/{phone_number_id}/messages
              Body: { messaging_product: "whatsapp", to, type: "text", text: { body } }
              Auth: Bearer {meta_access_token}
```

### 11.1 Etat actuel du code : ❌ ROUTAGE NON IMPLEMENTE

**Constat** : Le routage sortant est **hardcode sur Whapi uniquement**.

```
whatsapp_message.gateway.ts (handleSendMessage)
    ↓
whatsapp_message.service.ts (createAgentMessage)
    ↓
communication_whapi.service.ts (sendToWhapiChannel) ← HARDCODE, pas de branchement
    ↓
POST https://gate.whapi.cloud/messages/text  ← TOUJOURS Whapi
```

**Infrastructure existante mais non utilisee** :
- `WhapiChannel.provider` : Champ `varchar(32)` present en base, peuple a `'whapi'` par migration
- `ProviderChannel` : Table de mapping `provider -> channel_id` utilisee pour l'INBOUND uniquement
- `WhatsappMessage.provider` : Enregistre le provider en lecture, mais l'ecriture met toujours `'whapi'`

### 11.2 Whapi - Envoi texte (doc officielle)

**Endpoint** : `POST https://gate.whapi.cloud/messages/text`
**Auth** : `Authorization: Bearer {token}`

```json
// Request
{ "to": "string", "body": "string" }

// Response
{ "sent": true, "message": { "id": "string", "status": "string" } }
```

**Dans le code** : `communicationWhapiService.sendToWhapiChannel()` utilise exactement ce format. ✅

**Limites doc officielle** :
- Pas de rate limit strict impose par Whapi (plans payes), mais WhatsApp surveille le comportement
- Recommandation: toujours inclure des delais, du batching, et un controle de debit basique
- Taille max body: non specifiee dans la doc, le code impose 4096 octets UTF-8

### 11.3 Meta - Envoi texte (doc officielle)

**Endpoint** : `POST https://graph.facebook.com/v21.0/{phone_number_id}/messages`
**Auth** : `Authorization: Bearer {access_token}`

```json
// Request
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "string",
  "type": "text",
  "text": { "preview_url": false, "body": "string" }
}

// Response
{
  "messaging_product": "whatsapp",
  "contacts": [{ "input": "string", "wa_id": "string" }],
  "messages": [{ "id": "wamid.ID" }]
}
```

**Dans le code** : ❌ **AUCUNE implementation**. Pas de `CommunicationMetaService`, pas de methode `sendToMetaChannel()`.

### 11.4 Ecarts a combler pour le routage sortant

| Composant | Whapi | Meta | Statut |
|-----------|-------|------|--------|
| **Service d'envoi** | `CommunicationWhapiService` ✅ | `CommunicationMetaService` ❌ | A creer |
| **Endpoint** | `gate.whapi.cloud/messages/text` ✅ | `graph.facebook.com/v21.0/{id}/messages` ❌ | A implementer |
| **Auth token stocke** | `WhapiChannel.token` ✅ | Pas de champ token Meta ❌ | A ajouter au schema |
| **phone_number_id** | Non necessaire | Requis dans l'URL ❌ | = `channel.external_id` probable |
| **Format payload** | `{ to, body }` | `{ messaging_product, to, type, text: {body} }` | Differents |
| **Format reponse** | `{ message: { id } }` | `{ messages: [{ id }] }` | Parsing different |
| **Retry/erreurs** | Implemente ✅ | A dupliquer/adapter ❌ | Memes codes HTTP |
| **Routage dans gateway** | Hardcode ❌ | Inexistant ❌ | Branchement a ajouter |
| **Envoi media** | Non audite | Non audite | A verifier pour les 2 |

### 11.5 Differences cles entre les API d'envoi

| Aspect | Whapi API | Meta Cloud API |
|--------|-----------|----------------|
| **Base URL** | `gate.whapi.cloud` | `graph.facebook.com/v21.0` |
| **ID dans URL** | Non | Oui (`/{phone_number_id}/messages`) |
| **Champ obligatoire** | `to`, `body` | `messaging_product`, `to`, `type`, `text.body` |
| **Format telephone** | Digits bruts (sans +) | Digits bruts (sans +) |
| **Fenetre 24h** | Geree cote Whapi | Geree par Meta (erreur si hors fenetre) |
| **Templates hors 24h** | Endpoint separe | Meme endpoint, `type: "template"` |
| **Rate limit** | Pas de limite stricte | 80 msg/sec (Business), 1000/sec (Enterprise) |
| **Webhook statut** | `{ statuses: [{id, status}] }` | `{ entry[].changes[].value.statuses[{id, status}] }` |

---

## 12. PROBLEMES ENRICHIS PAR LA DOC OFFICIELLE

### BLOQUANT (P0)

#### P0. Routage sortant mono-provider : envoi TOUJOURS via Whapi
**Fichiers** : `whatsapp_message.service.ts`, `communication_whapi.service.ts`

L'envoi de messages est **hardcode sur Whapi**. Quand une conversation est rattachee a un channel Meta, le message est quand meme envoye via l'API Whapi au lieu de l'API Meta Cloud (`graph.facebook.com`).

**Ce qui manque** :
1. `CommunicationMetaService` avec `sendToMetaChannel()` - service d'envoi via Meta Cloud API
2. Branchement dans `createAgentMessage()` : lire `channel.provider` et router vers le bon service
3. Stockage du token Meta (access_token) et du `phone_number_id` sur le channel
4. Adaptation du format payload (Meta exige `messaging_product`, `type`, structure imbriquee)
5. Parsing de la reponse Meta (`messages[0].id` au lieu de `message.id`)

**Impact** : Les conversations entrantes via Meta sont recues correctement, mais les reponses de l'agent partent via Whapi = **echec d'envoi ou envoi depuis le mauvais numero**.

### CRITIQUE

#### P1. Statut de message non broadcast au frontend (confirme)
Les deux providers (Whapi et Meta) envoient des webhooks de statut (sent -> delivered -> read -> failed). Le code les persiste en base mais ne les pousse PAS au frontend via socket.

**Impact** : L'agent ne voit jamais les coches bleues (lu) ni les erreurs de livraison.

#### P2. Erreurs de livraison silencieuses
- **Whapi** : Le champ `code` du statut est ignore
- **Meta** : Le tableau `errors[{code, title}]` sur les statuts `failed` est ignore
- **Impact** : Quand un message echoue a la livraison (numero invalide, bloque, etc.), l'erreur est perdue. L'agent ne sait pas pourquoi.

#### P3. Champ `field` du webhook Meta non verifie
La doc Meta indique que `changes[0].field` doit etre `"messages"`. Le code ne verifie pas ce champ. D'autres types de notifications (account_update, phone_number_quality_update, etc.) pourraient etre traites par erreur.

#### P4. Interactive Whapi completement ignore
L'adapter Whapi met `interactive` a `undefined` pour tous les types. Les reponses aux boutons (`list`, `buttons`, `reply`) de Whapi sont perdues. L'adapter Meta les gere correctement.

### MOYEN

#### P5. Types de messages non geres avec perte de donnees
Les types suivants arrivent dans la doc mais sont ignores par le code :
- **Reactions** (emoji sur un message) - Disponible chez les 2 providers
- **Messages cites/reply-to** (context) - Disponible chez les 2 providers
- **Contacts** (vcard) - Disponible chez les 2 providers
- **Link preview** (Whapi) - URL, titre, description perdus
- **Sticker** (Meta) - Non mappe alors que supporte par Whapi
- **Polls** (Whapi) - Votes, resultats perdus
- **Flows** (Meta nfm_reply) - Donnees de formulaire perdues

#### P6. Donnees de facturation Meta ignorees
Le webhook de statut Meta inclut `pricing.billable`, `pricing.category` et `conversation.origin`. Ces donnees sont essentielles pour le suivi des couts mais sont completement ignorees.

#### P7. Attribution publicitaire perdue
Les messages provenant de Facebook Ads (Click-to-WhatsApp) contiennent des donnees `referral` (source_url, headline, ctwa_clid) et `context.ad`. Ces informations de tracking sont ignorees.

#### P8. Evenements `put` et `patch` Whapi non geres
La doc Whapi indique que les webhooks peuvent avoir `event.event` = `post`, `put` ou `patch` :
- `put` : Message edite/mis a jour
- `patch` : Vote de sondage, mise a jour partielle
Seul `post` est implicitement traite par le code.

### BAS

#### P9. `request_welcome` Meta non gere
Le type `request_welcome` est envoye quand un utilisateur ouvre une conversation pour la premiere fois. Pourrait etre utilise pour envoyer un message d'accueil automatique.

#### P10. `system` Meta non gere
Les messages systeme (user_changed_number) permettent de detecter quand un contact change de numero. Le `new_wa_id` est perdu.

---

## 13. DIAGRAMME DE FLUX RESUME

### Flux entrant
```
Client WhatsApp
  |
  v
POST /webhooks/whapi (ou /webhooks/whatsapp)
  |
  v
Validation HMAC + Resolution tenant
  |
  v
Adapter.normalizeMessages() -> UnifiedMessage[]
  |
  v
InboundMessageService.handleMessages()
  |
  ├── dispatcherService.assignConversation()
  |     ├── Chat existant + agent connecte -> Maj unread
  |     ├── Chat existant + agent offline -> Reassignation
  |     └── Nouveau chat -> Creation + assignation
  |
  ├── messageService.saveIncomingFromUnified()
  |     ├── Check duplicata
  |     ├── Creer/trouver contact
  |     └── Sauvegarder message + medias
  |
  └── gateway.notifyNewMessage()
        ├── emit 'chat:event' MESSAGE_ADD
        └── emit 'chat:event' CONVERSATION_UPSERT
              |
              v
        Frontend (Zustand store -> React re-render)
```

### Flux sortant
```
Agent clique "Envoyer"
  |
  v
Frontend: addMessage(tempMessage) + socket.emit('message:send')
  |
  v
Gateway: @SubscribeMessage('message:send')
  |
  ├── Validation agent + tenant + channel
  |
  ├── messageService.createAgentMessage()
  |     ├── Verifier timeout 24h
  |     ├── communicationWhapiService.sendToWhapiChannel()
  |     |     └── POST https://gate.whapi.cloud/messages/text
  |     |           (retry exponentiel si erreur transient)
  |     ├── Sauvegarder message en base
  |     └── Maj chat: unread=0, last_poste_message_at=now
  |
  └── Broadcast MESSAGE_ADD (avec tempId) + CONVERSATION_UPSERT
        |
        v
  Frontend: remplace tempMessage par message confirme

  ⚠️ Cycle de statut manquant :
  WhatsApp confirme delivery/read via webhook
    -> Backend persiste en base (status = delivered|read)
    -> ❌ PAS DE BROADCAST au frontend
    -> L'agent reste sur "envoye" indefiniment
```
