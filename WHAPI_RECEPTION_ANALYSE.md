# Analyse du flux de reception WHAPI

Date: 2026-02-20

## 1) Flux actuel (selon le code)

1. **POST /webhooks/whapi** (`message_whatsapp/src/whapi/whapi.controller.ts`)
   - Verifie signature si `WHAPI_WEBHOOK_SECRET_*` configure.
   - Verifie payload (channel_id, event, messages/statuses).
   - Resolve `tenantId` via `channel_id`.
   - Idempotency via `WebhookIdempotencyService`.
   - Si `FF_UNIFIED_WEBHOOK_ROUTER` actif (par defaut **true**):
     - Appelle `WhapiService.handleIncomingMessage()` qui route vers `UnifiedIngressService.ingestWhapi()`.
   - Sinon, legacy path `handleIncomingMessageLegacy()`.

2. **UnifiedIngressService.ingestWhapi** (`message_whatsapp/src/webhooks/unified-ingress.service.ts`)
   - Utilise `WhapiAdapter` pour normaliser messages/statuses.
   - Envoie vers `InboundMessageService.handleMessages()`.

3. **InboundMessageService.handleMessages** (`message_whatsapp/src/webhooks/inbound-message.service.ts`)
   - Ignore les messages `direction !== 'in'`.
   - Validation `chat_id` (doit contenir `@`, pas de groupe `@g.us`, numero 8-20 chiffres).
   - `dispatcherService.assignConversation()`.
   - Sauvegarde message (`saveIncomingFromUnified`).
   - Sauvegarde medias.
   - `messageGateway.notifyNewMessage()` (WebSocket).


## 2) Raisons probables d'erreur de reception WHAPI

### A. **Messages ignores par validation `chat_id`**
- Si WHAPI envoie un `chat_id` sans suffixe `@s.whatsapp.net` (ou equivalent),
  la validation rejette le message (`invalid_chat_id_format`).
- Si le `chat_id` contient un numero trop court ou trop long (hors 8-20 chiffres),
  il est rejete.

Symptome: les webhooks arrivent, mais aucun message n'apparait.

### B. **Tenant non resolu (channel_id non mappe)**
- Si `channel_id` n'est pas mappe a un tenant, le webhook retourne 422.
- Aucun message traite.

Symptome: erreurs HTTP 422 sur le webhook.

### C. **FF_UNIFIED_WEBHOOK_ROUTER actif + normalisation incorrecte**
- Le flux par defaut passe par le **Unified Router**.
- Si `WhapiAdapter.normalizeMessages()` ne mappe pas correctement le `chat_id` ou `timestamp`,
  le message peut etre ignore, rejete, ou mal persiste.

Symptome: webhooks OK, mais pas de message en DB.

### D. **Message de type sortant**
- Si WHAPI marque le message `from_me=true`, il est ignore.

Symptome: les messages entrants n'apparaissent pas si `from_me` est errone.

### E. **Rate limit / circuit breaker**
- `WebhookRateLimitService` peut rejeter.
- Circuit breaker peut etre ouvert.

Symptome: erreurs 429 ou 503 sur webhook.

### F. **Idempotency**
- Si message considere `duplicate`, il est ignore.
- Si `conflict`, HTTP 409.

Symptome: webhooks recus mais ignores.


## 3) Hypothese la plus probable (a verifier)

1. **Validation `chat_id` trop stricte** pour WHAPI.
   - Beaucoup d'implementations WHAPI utilisent `chat_id` sans suffixe `@`.
   - La validation actuelle exige un format WhatsApp standard.

2. **Unified Router actif par defaut**.
   - Le legacy path (plus permissif) n'est jamais utilise si `FF_UNIFIED_WEBHOOK_ROUTER` est a true.
   - Si `WhapiAdapter` ne mappe pas correctement, tout est bloque.


## 4) Comment confirmer rapidement

1. Activer logs sur webhook:
   - Chercher `INCOMING_IGNORED` dans les logs.
   - Chercher `Missing tenant id` ou `Unknown channel mapping`.

2. Tester la route en forçant legacy:
   - Mettre `FF_UNIFIED_WEBHOOK_ROUTER=false` (temporaire).
   - Rejouer un webhook.

3. Verifier contenu exact de `chat_id` dans le payload WHAPI reel.


## 5) Probleme probable (resume clair)

> La reception WHAPI est probablement bloquee parce que le flux par defaut passe par le **Unified Router**,
> et la validation `chat_id` / normalisation ne correspond pas au format WHAPI reel (chat_id sans `@` ou numero hors format).
> Dans ce cas, les messages sont ignores (`INCOMING_IGNORED`) et n'arrivent jamais au frontend.


## 6) Actions correctives suggerees

1. Confirmer le format WHAPI `chat_id` en prod.
2. Adapter `validateIncomingChatId()` pour accepter ce format.
3. Si besoin, ajuster `WhapiAdapter.mapMessage()`.
4. En urgence, basculer sur legacy router (`FF_UNIFIED_WEBHOOK_ROUTER=false`) pour debloquer reception.

