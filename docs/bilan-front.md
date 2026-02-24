# Bilan Complet Frontend (front/)

*Genere le 16/02/2026*

---

## 1. Stack Technique

| Composant | Version |
|-----------|---------|
| Next.js (App Router) | 16.1.1 |
| React | 19.2.3 |
| TypeScript | 5 |
| Tailwind CSS | 4 |
| Zustand | 5.0.10 |
| Socket.IO Client | 4.8.3 |
| Axios | 1.13.2 |
| Lucide React | 0.562.0 |

**Env:** API `http://localhost:3002`, Socket `http://localhost:3001`

---

## 2. Architecture Fichiers

```
front/src/
├── app/
│   ├── layout.tsx              # Root layout + providers
│   ├── page.tsx                # Redirect vers /whatsapp
│   ├── login/page.tsx          # Page login
│   └── whatsapp/page.tsx       # Interface principale WhatsApp
├── components/
│   ├── auth/loginForm.tsx      # Formulaire login
│   ├── sidebar/
│   │   ├── Sidebar.tsx         # Conteneur sidebar (conversations/contacts)
│   │   ├── UserHeader.tsx      # Info user, connexion, toggle vue
│   │   ├── ConversationList.tsx # Liste conversations
│   │   ├── ConversationItem.tsx # Item conversation unique
│   │   └── ConversationFilters.tsx # Filtres (tous, non lus, actifs...)
│   ├── chat/
│   │   ├── ChatMainArea.tsx    # Zone chat principale
│   │   ├── ChatHeader.tsx      # Header chat (nom, statut, appel)
│   │   ├── ChatMessages.tsx    # Conteneur messages
│   │   ├── ChatMessage.tsx     # Message unique + medias
│   │   ├── ChatInput.tsx       # Saisie message + typing
│   │   └── ClientInfoBanner.tsx # Banniere info client
│   ├── contact/
│   │   ├── contactListview.tsx # Vue liste contacts (filtres, tri, recherche)
│   │   └── quickFilter.tsx     # Filtres rapides (inutilise)
│   ├── conversation/
│   │   ├── callButton.tsx      # Bouton appel + modal statut
│   │   └── conversationOptionMenu.tsx # Menu changement statut conversation
│   ├── helper/
│   │   ├── mediaBubble.tsx     # Wrapper bulle media
│   │   └── TypingBadge.tsx     # Badge indicateur typing
│   ├── ui/
│   │   ├── button.tsx          # STUB VIDE
│   │   ├── input.tsx           # STUB VIDE
│   │   ├── card.tsx            # STUB VIDE
│   │   └── typingIndicator.tsx # Animation points typing
│   └── WebSocketEvents.tsx     # CRITIQUE: Tous les handlers socket
├── contexts/
│   ├── AuthProvider.tsx        # Context auth (login, session, JWT cookie)
│   └── SocketProvider.tsx      # Context Socket.IO
├── store/
│   ├── chatStore.ts            # Zustand: conversations, messages, typing
│   ├── contactStore.ts         # Zustand: contacts
│   └── stats.store.ts          # Zustand: stats (minimal)
├── lib/
│   ├── contactApi.ts           # API REST (login, profile, call status)
│   ├── logger.ts               # Utilitaire logging
│   └── utils.ts                # Fonctions utilitaires
└── types/
    └── chat.ts                 # Types TS + transformers (843 lignes)
```

---

## 3. State Management

### chatStore (Zustand)
- `conversations: Conversation[]`
- `messages: Message[]`
- `selectedConversation: Conversation | null`
- `typingStatus: Record<string, boolean>`
- `socket: Socket | null`
- `isLoading, error`

Actions: `loadConversations`, `selectConversation`, `sendMessage`, `onTypingStart/Stop`, `setConversations`, `setMessages`, `addMessage`, `updateConversation`, `addConversation`, `removeConversationBychat_id`, `updateMessageStatus`, `setTyping`, `clearTyping`, `reset`

### contactStore (Zustand)
- `contacts: Contact[]`, `selectedContact`, `socket`

Actions: `loadContacts`, `selectContact`, `setContacts`, `upsertContact`, `removeContact`, `reset`

### AuthProvider (Context)
- JWT HTTP-only cookie (pas de token en localStorage)
- `login(email, password)`, `logout()`, `user`, `initialized`

### SocketProvider (Context)
- `socket: Socket | null`, `isConnected: boolean`
- Connexion WebSocket avec `withCredentials: true`

---

## 4. Authentification

1. POST `/auth/login` (email + password) → cookie HTTP-only auto
2. GET `/auth/profile` au bootstrap → restaure session
3. POST `/auth/logout` → clear state + redirect
4. Protection route: check `user` dans WhatsAppPage et LoginPage

---

## 5. Endpoints REST

| Endpoint | Methode | Usage |
|----------|---------|-------|
| `/auth/login` | POST | Login |
| `/auth/profile` | GET | Restaurer session |
| `/auth/logout` | POST | Deconnexion |
| `/contact/{id}/call-status` | PATCH | Maj statut appel contact |

---

## 6. Inventaire Complet Events Socket.IO

### 6.1 Events EMIS par le front (Client → Serveur)

| Event | Payload | Source | Usage |
|-------|---------|--------|-------|
| `conversations:get` | `{}` | chatStore, WebSocketEvents | Charger toutes les conversations |
| `contacts:get` | `{}` | WebSocketEvents | Charger tous les contacts |
| `messages:get` | `{ chat_id }` | chatStore, WebSocketEvents | Charger messages d'une conversation |
| `messages:read` | `{ chat_id }` | chatStore | Marquer conversation comme lue |
| `message:send` | `{ chat_id, text, tempId }` | chatStore | Envoyer un message |
| `chat:event` (TYPING_START) | `{ type: "TYPING_START", payload: { chat_id } }` | chatStore | Signal debut frappe |
| `chat:event` (TYPING_STOP) | `{ type: "TYPING_STOP", payload: { chat_id } }` | chatStore | Signal fin frappe |

### 6.2 Events ECOUTES par le front (Serveur → Client)

| Event | Type | Gere par le front? | Handler |
|-------|------|---------------------|---------|
| `chat:event` | `CONVERSATION_LIST` | OUI | WebSocketEvents → setConversations |
| `chat:event` | `MESSAGE_LIST` | OUI | WebSocketEvents → setMessages |
| `chat:event` | `MESSAGE_ADD` | OUI | WebSocketEvents → addMessage (avec remplacement tempId) |
| `chat:event` | `CONVERSATION_UPSERT` | OUI | WebSocketEvents → updateConversation |
| `chat:event` | `CONVERSATION_ASSIGNED` | OUI | WebSocketEvents → addConversation |
| `chat:event` | `CONVERSATION_REMOVED` | OUI | WebSocketEvents → removeConversationBychat_id |
| `chat:event` | `CONVERSATION_READONLY` | OUI | WebSocketEvents → (handler present) |
| `chat:event` | `TYPING_START` | OUI | WebSocketEvents → setTyping (auto-clear 6s) |
| `chat:event` | `TYPING_STOP` | OUI | WebSocketEvents → clearTyping |
| `chat:event` | `MESSAGE_SEND_ERROR` | OUI | WebSocketEvents → (handler present) |
| `chat:event` | `MESSAGE_STATUS_UPDATE` | OUI | WebSocketEvents → updateMessageStatus |
| `chat:event` | `RATE_LIMITED` | OUI | WebSocketEvents → logger.warn |
| `contact:event` | `CONTACT_LIST` | OUI | WebSocketEvents → setContacts |
| `contact:event` | `CONTACT_UPSERT` | OUI | WebSocketEvents → upsertContact |
| `contact:event` | `CONTACT_REMOVED` | OUI | WebSocketEvents → removeContact |
| `contact:event` | `CONTACT_CALL_STATUS_UPDATED` | OUI | WebSocketEvents → upsertContact |
| `queue:updated` | - | **NON** | **MANQUANT** (pas pertinent pour le front commercial) |
| `error` | - | OUI | WebSocketEvents → log error |
| `connect` | - | OUI | WebSocketEvents → refreshAfterConnect |
| `reconnect` | - | OUI | WebSocketEvents → refreshAfterConnect |
| `disconnect` | - | OUI | SocketProvider → setIsConnected(false) |

---

## 7. Events NON GERES par le front

### 7.1 MESSAGE_STATUS_UPDATE - CRITIQUE

**Emis par le backend:**
```typescript
this.server.to(`tenant:${tenantId}`).emit('chat:event', {
  type: 'MESSAGE_STATUS_UPDATE',
  payload: {
    message_id: string,
    external_id: string,
    chat_id: string,
    status: string, // 'delivered' | 'read' | 'failed'
    error_code?: number,
    error_title?: string,
  }
});
```

**Impact:** Les coches de statut (envoye → delivre → lu) ne se mettent JAMAIS a jour en temps reel. L'utilisateur voit toujours "sent" meme quand le message est lu par le client.

**Correctif:** Ajouter dans WebSocketEvents.tsx:
```typescript
case 'MESSAGE_STATUS_UPDATE':
  useChatStore.getState().updateMessageStatus(
    payload.chat_id,
    payload.message_id,
    payload.status
  );
  break;
```

### 7.2 RATE_LIMITED - MOYEN

**Emis par le backend quand le throttle est depasse:**
```typescript
client.emit('chat:event', {
  type: 'RATE_LIMITED',
  payload: { event: string }
});
```

**Impact:** L'utilisateur n'est pas averti quand il est rate-limited. Les requetes echouent silencieusement.

**Correctif:** Afficher un toast d'avertissement.

### 7.3 queue:updated - NON PERTINENT

Pas necessaire cote front commercial (seulement utile pour le dashboard admin).

---

## 8. Fonctionnalites Frontend Manquantes / Incompletes

### HAUTE PRIORITE

| # | Fonctionnalite | Fichier | Etat |
|---|---------------|---------|------|
| F1 | ~~MESSAGE_STATUS_UPDATE~~ | WebSocketEvents.tsx | **CORRIGE** - handler ajoute |
| F2 | **Envoi media** (image, video, document) | ChatInput.tsx | Bouton Paperclip present mais non fonctionnel |
| F3 | **Conversation status change** pas envoye au serveur | conversationOptionMenu.tsx | Change local seulement, pas d'emit socket |
| F4 | ~~RATE_LIMITED~~ | WebSocketEvents.tsx | **CORRIGE** - warning log ajoute |

### MOYENNE PRIORITE

| # | Fonctionnalite | Fichier | Etat |
|---|---------------|---------|------|
| F5 | Emoji picker | ChatInput.tsx | Bouton Smile present mais non fonctionnel |
| F6 | Message vocal | ChatInput.tsx | Bouton Mic present mais non fonctionnel |
| F7 | Temps de reponse moyen hardcode "2.5 min" | ChatInput.tsx | Valeur statique, pas calculee |
| F8 | selectContact ne charge pas les messages | contactStore.ts | selectContact ne fait rien de plus que setSelectedContact |
| F9 | onRefresh/onExport callbacks non implementes | contactListview.tsx | Props definies mais jamais connectees |
| F10 | Notifications navigateur | - | Pas de notifications push pour nouveaux messages |

### BASSE PRIORITE

| # | Fonctionnalite | Fichier | Etat |
|---|---------------|---------|------|
| F11 | Composants UI stubs vides | ui/button.tsx, input.tsx, card.tsx | 1 ligne chacun |
| F12 | quickFilter.tsx inutilise | contact/quickFilter.tsx | Jamais importe |
| F13 | Stats store minimal | stats.store.ts | Pas de donnees provenant du serveur |

---

## 9. Flux Conversation WhatsApp - Couverture Complete

### 9.1 Cycle de vie d'un message ENTRANT

| Etape | Backend | Front | Couvert? |
|-------|---------|-------|----------|
| 1. Webhook recoit message | InboundMessageService.handleMessages() | - | OUI (backend) |
| 2. Message persiste en BDD | messageService.create() | - | OUI (backend) |
| 3. Dispatcher assigne conversation | dispatcherService.assignConversation() | - | OUI (backend) |
| 4. Typing indicator emis | gateway.emitTyping(chatId, true) | TYPING_START → setTyping | OUI |
| 5. MESSAGE_ADD emis | gateway.notifyNewMessage() | addMessage() | OUI |
| 6. CONVERSATION_UPSERT emis | gateway.notifyNewMessage() | updateConversation() | OUI |
| 7. Typing stop emis | gateway.emitTyping(chatId, false) | TYPING_STOP → clearTyping | OUI |
| 8. Auto-message envoye (si configure) | autoMessageService | - | OUI (backend) |

### 9.2 Cycle de vie d'un message SORTANT (agent)

| Etape | Backend | Front | Couvert? |
|-------|---------|-------|----------|
| 1. Agent tape texte | - | ChatInput → onTypingStart | OUI |
| 2. Agent envoie | - | sendMessage() → emit message:send | OUI |
| 3. Message optimiste affiche | - | addMessage(tempMessage) | OUI |
| 4. Backend recoit | gateway.handleSendMessage() | - | OUI |
| 5. Message persiste en BDD | messageService.create() | - | OUI |
| 6. Envoi via WhatsApp API | whapiSender/metaSender | - | OUI |
| 7. MESSAGE_ADD emis | gateway → emit MESSAGE_ADD | Remplacement tempId | OUI |
| 8. CONVERSATION_UPSERT emis | gateway | updateConversation() | OUI |
| 9. Statut "delivered" arrive | webhook → notifyStatusUpdate | MESSAGE_STATUS_UPDATE → updateMessageStatus | OUI |
| 10. Statut "read" arrive | webhook → notifyStatusUpdate | MESSAGE_STATUS_UPDATE → updateMessageStatus | OUI |
| 11. Statut "failed" arrive | webhook → notifyStatusUpdate | MESSAGE_STATUS_UPDATE → updateMessageStatus (mapped to 'error') | OUI |

### 9.3 Cycle de vie d'une conversation

| Etape | Backend | Front | Couvert? |
|-------|---------|-------|----------|
| 1. Nouvelle conversation creee | dispatcher.assignConversation() | - | OUI |
| 2. CONVERSATION_ASSIGNED emis | gateway | addConversation() | OUI |
| 3. Conversation selectionnee | - | selectConversation() → emit messages:get | OUI |
| 4. Messages charges | gateway → MESSAGE_LIST | setMessages() | OUI |
| 5. Marquer comme lu | - | emit messages:read | OUI |
| 6. CONVERSATION_UPSERT | gateway | updateConversation() | OUI |
| 7. Reassignment | dispatcher | CONVERSATION_REMOVED + ASSIGNED | OUI |
| 8. Read-only | gateway.emitConversationReadonly() | handler present | OUI |
| 9. Changement statut (fermer/convertir) | **PAS D'EMIT SOCKET** | Local seulement | **PARTIEL** |

### 9.4 Cycle de vie d'un contact

| Etape | Backend | Front | Couvert? |
|-------|---------|-------|----------|
| 1. Contact cree (auto) | contactService.findOrCreate() | - | OUI |
| 2. CONTACT_LIST charge | gateway → CONTACT_LIST | setContacts() | OUI |
| 3. CONTACT_UPSERT emis | gateway | upsertContact() | OUI |
| 4. Maj call_status | REST PATCH /contact/{id}/call-status | API + local state | OUI |
| 5. CONTACT_CALL_STATUS_UPDATED | gateway | upsertContact() | OUI |
| 6. CONTACT_REMOVED | gateway | removeContact() | OUI |

---

## 10. Resume des Gaps

### Events backend non geres par le front:
1. ~~`MESSAGE_STATUS_UPDATE`~~ - **CORRIGE** - Les coches delivered/read/failed se mettent a jour en temps reel
2. ~~`RATE_LIMITED`~~ - **CORRIGE** - Warning log quand l'utilisateur est throttle

### Fonctionnalites front incompletes:
3. **Envoi media** - Bouton existe mais ne fait rien
4. **Changement statut conversation** - Pas d'emit socket (local seulement)
5. **Emoji picker** - Bouton existe mais ne fait rien
6. **Message vocal** - Bouton existe mais ne fait rien
7. **Notifications navigateur** - Aucune notification push

### Donnees non exploitees:
8. `closed_at`, `converted_at` - Presentes dans le type Conversation mais pas affichees
9. `auto_message_status` - Present dans le type mais pas visible dans l'UI
10. `first_response_deadline_at` - Pas de timer SLA visible cote agent
11. Stats store vide - Pas de metriques visibles pour l'agent

---

## 11. Recommandations Prioritaires

| Priorite | Action | Effort |
|----------|--------|--------|
| ~~P0~~ | ~~Gerer MESSAGE_STATUS_UPDATE~~ | **FAIT** |
| ~~P0~~ | ~~Gerer RATE_LIMITED~~ | **FAIT** |
| P1 | Implementer envoi media (upload + emit) | 2-4h |
| P1 | Emettre changement statut conversation via socket | 30 min |
| P2 | Ajouter notifications navigateur (Notification API) | 1h |
| P2 | Afficher timer SLA (first_response_deadline_at) | 1h |
| P3 | Emoji picker (bibliotheque emoji-mart) | 2h |
| P3 | Message vocal (MediaRecorder API) | 3-4h |
