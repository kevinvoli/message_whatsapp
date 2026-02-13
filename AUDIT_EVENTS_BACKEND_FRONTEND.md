# Audit Events Backend/Front

Date: 2026-02-13
Scope:
- Backend: `message_whatsapp` (WebSocket + Webhooks)
- Front: `front` (Socket emit/listen)
- Admin: verification de l absence de listeners socket metier

## 1) Backend -> Inbound Events (Socket)
Source: `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

- `conversations:get` (`@SubscribeMessage`) -> recharge liste conversations (`line 207`)
- `contacts:get` (`@SubscribeMessage`) -> recharge contacts scopes (`line 215`)
- `typing:start` (`@SubscribeMessage`) -> broadcast typing poste (`line 224`)
- `typing:stop` (`@SubscribeMessage`) -> broadcast typing stop poste (`line 245`)
- `messages:get` (`@SubscribeMessage`) -> renvoi `MESSAGE_LIST` (`line 259`)
- `messages:read` (`@SubscribeMessage`) -> renvoi `CONVERSATION_UPSERT` unread=0 (`line 274`)
- `message:send` (`@SubscribeMessage`) -> envoi provider + emit resultat (`line 294`)

## 2) Backend -> Outbound Events (Socket)
Source: `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

Channel `chat:event` (enveloppe `type` + `payload`):
- `CONVERSATION_LIST` (`line 188`)
- `MESSAGE_LIST` (`line 266`)
- `CONVERSATION_UPSERT` (`line 289`, `line 373`, `line 407`)
- `MESSAGE_ADD` (`line 359`, `line 389`)
- `MESSAGE_SEND_ERROR` (`line 310`, `line 347`)
- `CONVERSATION_ASSIGNED` (`line 495`)
- `CONVERSATION_REMOVED` (`line 500`)
- `CONVERSATION_READONLY` (`line 507`)

Channel `contact:event`:
- `CONTACT_LIST` (`line 202`)

Events hors enveloppe:
- `typing:start` (`line 239` + `line 479`)
- `typing:stop` (`line 253` + `line 479`)
- `queue:updated` (`line 517`)

## 3) Backend -> Webhook Events
Source: `message_whatsapp/src/whapi/whapi.controller.ts`

Endpoints:
- `POST /webhooks/whapi` (`line 24`)
- `POST /webhooks/whatsapp` (`line 87`)

Whapi `event.type` supportes:
- traites: `messages`, `statuses` (`line 38`, `line 41`)
- ignores explicitement: `events`, `polls`, `interactive`, `contacts`, `locations`, `live_locations`, `orders`, `products`, `catalogs` (`line 44-52`)

Retours metier:
- `duplicate_ignored` (idempotence) (`line 31`, `line 106`)
- `EVENT_RECEIVED` pour endpoint Meta (`line 113`)

## 4) Front -> Events emis
Sources:
- `front/src/store/chatStore.ts`
- `front/src/store/contactStore.ts`
- `front/src/components/WebSocketEvents.tsx`

Emits principaux:
- `conversations:get` (`chatStore.ts:93`)
- `messages:get` (`chatStore.ts:117`, `WebSocketEvents.tsx:51`)
- `messages:read` (`chatStore.ts:118`)
- `message:send` (`chatStore.ts:157`)
- `typing:start` (`chatStore.ts:167`)
- `typing:stop` (`chatStore.ts:175`)
- `contacts:get` (`contactStore.ts:54`, `WebSocketEvents.tsx:47`)

Emit suspect:
- `contact:get` (`contactStore.ts:78`) -> aucun handler backend trouve.

## 5) Front -> Events ecoutes
Source: `front/src/components/WebSocketEvents.tsx`

Listeners:
- `chat:event` (`line 214`)
  - cases traites:
    - `MESSAGE_ADD` (`line 75`)
    - `CONVERSATION_UPSERT` (`line 96`)
    - `MESSAGE_LIST` (`line 102`)
    - `CONVERSATION_REMOVED` (`line 108`)
    - `CONVERSATION_ASSIGNED` (`line 112`)
    - `CONVERSATION_LIST` (`line 124`)
    - `CONVERSATION_REASSIGNED` (`line 130`)
    - `CONVERSATION_READONLY` (`line 136`)
    - `MESSAGE_SEND_ERROR` (`line 142`)
- `contact:event` (`line 215`) -> `CONTACT_LIST`
- `message:status:update` (`line 216`)
- `typing:start` (`line 217`)
- `typing:stop` (`line 218`)
- `connect` + `reconnect` (`line 220-221`) -> resync auto

## 6) Ecarts Backend/Front (audit)

### Critique
- `contact:get` emis cote front sans subscribe backend.
  - Ref: `front/src/store/contactStore.ts:78`
  - Impact: action morte / confusion fonctionnelle.

### Eleve
- `message:status:update` ecoute cote front mais jamais emis cote backend.
  - Ref front: `front/src/components/WebSocketEvents.tsx:216`
  - Ref backend: aucune emission trouvee.
  - Impact: statut message potentiellement stale si non couvert par `CONVERSATION_UPSERT`.

- `CONVERSATION_REASSIGNED` et `AUTO_MESSAGE_STATUS` traites cote front mais non emis cote backend.
  - Ref front: `front/src/components/WebSocketEvents.tsx:118`, `:130`
  - Ref backend: aucune emission trouvee.
  - Impact: branches mortes / maintenance difficile.

### Moyen
- Incoherence payload `typing:start/typing:stop`:
  - emission poste inclut `commercial_id` (`gateway.ts:239`, `:253`)
  - emission auto-typing chat n inclut que `chat_id` (`gateway.ts:479`)
  - front suppose `commercial_id` optionnel et filtre sur `user.id`.
  - Impact: comportement typing moins previsible selon source.

- `queue:updated` emis cote backend sans consumer front/admin trouve.
  - Ref backend: `gateway.ts:517`
  - Impact: event non exploite.

## 7) Recommandations
1. Supprimer `contact:get` du front ou implementer `@SubscribeMessage('contact:get')` cote backend.
2. Soit emettre `message:status:update` cote backend, soit retirer le listener front et standardiser sur `chat:event`.
3. Retirer les cases mortes front (`CONVERSATION_REASSIGNED`, `AUTO_MESSAGE_STATUS`) ou implementer emissions backend correspondantes.
4. Unifier payload typing (`{ chat_id, commercial_id? }`) et documenter contrat unique.
5. Documenter officiellement la matrice d events (emetteur, payload, consommateur, SLA) dans `docs/`.

## 8) Conclusion
Le flux principal conversation/message est coherent et operationnel, mais plusieurs events legacy/non relies restent en place. Le nettoyage de ces ecarts reduira les risques de regression et simplifiera l evolution du protocole socket.
