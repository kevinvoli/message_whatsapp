# Analyse backend NestJS – Webhooks Whapi + WhatsApp Cloud API

Date: 2026-02-14

## 1) État actuel du backend (code)

### Où le webhook Whapi est traité
- `POST /webhooks/whapi` dans `message_whatsapp/src/whapi/whapi.controller.ts`
  - Vérifie le secret Whapi (headers)
  - Déduplication via `whapiService.isReplayEvent()`
  - `event.type === "messages"` -> `whapiService.handleIncomingMessage()`
  - `event.type === "statuses"` -> `whapiService.updateStatusMessage()`

### Où le webhook Meta est traité (Cloud API)
- `GET /webhooks/whatsapp` (verification token)
- `POST /webhooks/whatsapp`
  - Vérifie signature `x-hub-signature-256`
  - Convertit payload Meta -> Whapi via `metaToWhapi()`
  - Reutilise le flux Whapi (dedupe + handleIncomingMessage)

### Où la logique métier commence réellement
- `message_whatsapp/src/whapi/whapi.service.ts` -> `handleIncomingMessage()`
  - Déduplication (table `webhook_event_log`)
  - **Début métier** : `dispatcherService.assignConversation(...)`
  - **Persistance** : `whatsappMessageService.saveIncomingFromWhapi(...)`
  - **Médias** : `extractMedia()` + `saveMedia()`
  - **Notification** : `messageGateway.notifyNewMessage(...)`

### Points notables
- Le flux Meta est “forcé” dans le modèle Whapi, ce qui crée un couplage fort au format Whapi.
- Les entités DB et services sont nommés Whapi (`WhapiChannel`, `saveIncomingFromWhapi`, etc.).

## 2) Comparaison des payloads (Whapi vs Meta) — version vérifiée

### Sources vérifiées
- Doc Whapi officielle (format des webhooks + statut)  
- Meta WhatsApp Cloud API (référence Webhooks via la collection officielle Meta sur Postman)  
- Meta WhatsApp Cloud API (SDK officiel, section Webhooks start, pour la vérification GET/POST)

> Note: La page officielle Meta `developers.facebook.com/docs/whatsapp/cloud-api/webhooks` n’a pas pu être récupérée via l’outil (erreur d’accès). Les éléments Meta ci‑dessous sont confirmés à partir des sources officielles accessibles (collection Postman Meta + SDK Meta).

### Enveloppe (structure globale)
- **Whapi**: `channel_id`, `event`, et `messages[]` ou `statuses[]`.  
  - Exemple de payload Whapi (`messages.post`) et description des statuts dans `statuses.post`.  
- **Meta**: `object` -> `entry[]` -> `changes[]` -> `value`, avec `field="messages"` et `value.messages[]` ou `value.statuses[]`.  
  - La structure `entry/changes/value` est confirmée dans la référence Webhooks Meta (Postman officiel).

### Identifiants
- **Whapi**: `chat_id` est fourni directement dans `messages[]`.  
- **Meta**: pas de `chat_id` natif; on reconstruit via `messages[].from` + suffix `@s.whatsapp.net` (choix d’implémentation interne), et `metadata.phone_number_id` sert de `channelId`.

### Types de messages
- **Whapi**: très large (text, image, video, audio, voice, document, sticker, location, interactive, poll, order, etc.).  
- **Meta**: collection officielle Meta liste des objets de messages (text, media, interactive, reaction, contacts, location, etc.) via les exemples “Webhook Payload Reference”.  

### Statuts
- **Whapi**: `statuses[]` contient `id`, `code`, `status`, `recipient_id`, `timestamp`.  
- **Meta**: `value.statuses[]` contient `id`, `status`, `timestamp`, `recipient_id` (exemples Meta/partners + référence Meta).  

### Champs obligatoires vs optionnels
- **Whapi** (doc officielle) : `id`, `type`, `chat_id`, `from_me`, `timestamp` requis sur un message.  
- **Meta** (référence Webhooks Meta) : enveloppe `entry/changes/value` + `messages[]` est attendue pour les messages entrants; `metadata.phone_number_id` est présent dans `value.metadata`.

## 3) Architecture cible (production-ready, multi-tenant)

### Objectifs
- Supprimer la dépendance “Whapi-first”.
- Normaliser tous les webhooks vers un **modèle interne unique**.
- Garder la logique métier indépendante du provider.
- Extensible à d’autres providers.

### Patterns recommandés
- **Adapter**: transformation provider -> UnifiedMessage.
- **Strategy**: parsing par type de message (text, media, interactive, …).
- **Factory/Registry**: sélection de l’adapter selon provider.

### Flux proposé
1. `WebhookController` (route par provider)
2. `SignatureGuard`
3. `ProviderAdapter.normalize()`
4. `UnifiedEventService.handle()`
5. Domain services (dispatcher, persistence, gateway)

## 4) Modèle interne proposé: UnifiedMessage

```ts
export type Provider = "whapi" | "meta" | string;

export type UnifiedMessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "location"
  | "interactive"
  | "sticker"
  | "reaction"
  | "unknown";

export interface UnifiedMessage {
  provider: Provider;
  providerMessageId: string;
  tenantId: string;
  channelId: string;
  chatId: string;
  from: string;
  fromName?: string;
  timestamp: number; // unix seconds
  direction: "in" | "out";
  type: UnifiedMessageType;

  text?: string;

  media?: {
    id: string;
    mimeType?: string;
    fileName?: string;
    fileSize?: number;
    caption?: string;
    sha256?: string;
  };

  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };

  interactive?: {
    kind: "button_reply" | "list_reply" | "unknown";
    id?: string;
    title?: string;
    description?: string;
  };

  context?: {
    quotedMessageId?: string;
    forwarded?: boolean;
    ad?: unknown;
  };

  raw: unknown;
}
```

## 5) Exemple de mapping

### Whapi -> UnifiedMessage
```ts
const msg = payload.messages[0];

const unified: UnifiedMessage = {
  provider: "whapi",
  providerMessageId: msg.id,
  tenantId: resolveTenant(payload.channel_id),
  channelId: payload.channel_id,
  chatId: msg.chat_id,
  from: msg.from,
  fromName: msg.from_name,
  timestamp: msg.timestamp,
  direction: msg.from_me ? "out" : "in",
  type: mapWhapiType(msg.type),
  text: msg.text?.body ?? undefined,
  media: mapWhapiMedia(msg),
  location: msg.location
    ? {
        latitude: msg.location.latitude,
        longitude: msg.location.longitude,
        name: msg.location.name,
        address: msg.location.address,
      }
    : undefined,
  context: mapWhapiContext(msg.context),
  raw: payload,
};
```

### Meta -> UnifiedMessage
```ts
const value = body.entry[0].changes[0].value;
const msg = value.messages[0];

const unified: UnifiedMessage = {
  provider: "meta",
  providerMessageId: msg.id,
  tenantId: resolveTenant(value.metadata.phone_number_id),
  channelId: value.metadata.phone_number_id,
  chatId: `${msg.from}@s.whatsapp.net`,
  from: msg.from,
  fromName: value.contacts?.[0]?.profile?.name,
  timestamp: Number(msg.timestamp),
  direction: "in",
  type: mapMetaType(msg.type),
  text: msg.type === "text" ? msg.text?.body : undefined,
  media: mapMetaMedia(msg),
  location: msg.type === "location" ? msg.location : undefined,
  interactive: mapMetaInteractive(msg),
  raw: body,
};
```

## 6) Architecture modulaire (fichiers à créer/modifier)

### À créer
- `message_whatsapp/src/webhooks/webhooks.module.ts`
- `message_whatsapp/src/webhooks/webhooks.controller.ts`
- `message_whatsapp/src/webhooks/webhook-router.service.ts`
- `message_whatsapp/src/webhooks/adapters/provider-adapter.interface.ts`
- `message_whatsapp/src/webhooks/adapters/whapi.adapter.ts`
- `message_whatsapp/src/webhooks/adapters/meta.adapter.ts`
- `message_whatsapp/src/webhooks/normalization/unified-message.ts`
- `message_whatsapp/src/webhooks/normalization/unified-status.ts`
- `message_whatsapp/src/webhooks/guards/webhook-signature.guard.ts`
- `message_whatsapp/src/webhooks/idempotency/webhook-idempotency.service.ts`

### À modifier
- `message_whatsapp/src/whapi/whapi.controller.ts` (router vers `WebhookRouterService`)
- `message_whatsapp/src/whapi/whapi.service.ts` (déplacer logique métier vers `InboundMessageService`)
- `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts`
  - remplacer `saveIncomingFromWhapi()` par `saveIncomingFromUnified()`
- `message_whatsapp/src/channel/entities/channel.entity.ts`
  - renommer et ajouter `provider`, `tenant_id`, `external_id`

## 7) Diagramme d’architecture

```
[WebhookController]
   |
   v
[SignatureGuard] ---> [IdempotencyStore]
   |
   v
[ProviderAdapter (Whapi|Meta|...)]
   |
   v
[UnifiedMessage / UnifiedStatus]
   |
   v
[InboundMessageService]
   |
   +--> [DispatcherService] (assign conversation)
   +--> [MessageRepository] (save)
   +--> [MediaService]
   +--> [Gateway]
```

## 8) Sécurité Webhook (Meta)

- Vérification GET `hub.verify_token` et retour `hub.challenge`.
- Vérification POST via signature `x-hub-signature-256` + App Secret.
- Utiliser `rawBody` (déjà activé dans `main.ts`) pour éviter les erreurs de signature.
- Déduplication via `webhook_event_log` (déjà présent).

## 9) Action Plan (exécution progressive)

1. **Normalisation des payloads**  
   - Créer le modèle `UnifiedMessage` et `UnifiedStatus`.  
   - Ajouter une couche d’adapters provider (`WhapiAdapter`, `MetaAdapter`).  
   - Garder le `WhapiService` pour l’instant, mais l’alimenter via `UnifiedMessage`.

2. **Extraction logique métier**  
   - Créer un `InboundMessageService` qui reçoit un `UnifiedMessage`.  
   - Déplacer `handleIncomingMessage` (dispatcher + persistence + media + gateway) dans ce service.  
   - Le `WhapiService` devient un simple “provider facade”.

3. **Stabilisation & observabilité**  
   - Enrichir `webhook_event_log` avec `provider_message_id`, `tenant_id`.  
   - Ajouter logs structurés (provider, channelId, messageId, status).

4. **Multi-tenant ready**  
   - Normaliser la notion de `channel` (renommer `WhapiChannel` en `Channel`, ajouter `provider`, `tenant_id`, `external_id`).  
   - Résolution `tenant_id` par `channel_id` (lookup DB).

5. **Migration progressive**  
   - Supporter Whapi + Meta en parallèle.  
   - Basculer les contrôleurs sur `WebhookRouterService`.  
   - Retirer `metaToWhapi()` quand l’adapter Meta est stable.

## 10) Migration Steps (technique)

1. **Phase 0 – Préparation**  
   - Ajouter `webhooks/` module + interfaces (`UnifiedMessage`, `UnifiedStatus`).  
   - Ajouter `ProviderAdapter` interface.

2. **Phase 1 – Adapter Whapi**  
   - `WhapiAdapter.normalize(payload) -> UnifiedMessage[]/UnifiedStatus[]`.  
   - `WhapiController` appelle `WebhookRouterService` plutôt que `WhapiService`.

3. **Phase 2 – Adapter Meta**  
   - `MetaAdapter.normalize(payload)` depuis `entry/changes/value`.  
   - Conserver la validation signature existante.

4. **Phase 3 – Cœur métier**  
   - Nouveau `InboundMessageService.handle(unified)`  
   - `WhatsappMessageService.saveIncomingFromUnified()`  
   - Tests unitaires sur le mapping + idempotency.

5. **Phase 4 – Cleanup**  
   - Retirer `metaToWhapi()`  
   - Renommer entités `Whapi*` -> `Channel*` (migration DB)

## Annexes: Sources (URLs)

- Whapi Webhooks format + status: https://support.whapi.cloud/help-desk/receiving/webhooks/incoming-webhooks-format/sent-message  
- Whapi Webhooks overview: https://support.whapi.cloud/help-desk/receiving/webhooks  
- Meta Webhooks structure (Postman collection officielle): https://www.postman.com/meta/whatsapp-business-platform/folder/c2upa9j/entry-object  
- Meta Webhooks value object (messages/statuses/errors): https://www.postman.com/meta/whatsapp-business-platform/folder/g57makk/value-object  
- Meta Webhooks GET/POST verification (SDK officiel): https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/

---

## Points ouverts / à confirmer
- Confirmer les champs exacts du payload Meta (doc officielle) :
  - types exacts des messages
  - structure exacte de `statuses[]`
  - champs optionnels (context, errors, pricing, etc.)

```

Fichier cible: `docs/WEBHOOK_ANALYSIS.md`
