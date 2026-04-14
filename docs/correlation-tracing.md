# Traçage corrélé webhook → message → chat → socket

**Date :** 2026-04-14  
**TICKET :** TICKET-11-C  
**Dépendance :** TICKET-04-A ✓

> Ce document décrit le mécanisme de corrélation des logs sur l'ensemble du pipeline ingress : de la requête HTTP webhook à l'émission de l'événement WebSocket.

---

## Principe

Chaque requête webhook entrant reçoit un `correlationId` unique au niveau du contrôleur HTTP. Ce `correlationId` est propagé à travers toutes les couches du pipeline et apparaît dans chaque ligne de log. Un simple `grep correlationId=<id>` dans les logs retrace le chemin complet d'un message.

---

## Génération du `correlationId`

**Source :** `WhapiController` (fichier `src/whapi/whapi.controller.ts`)

```typescript
const correlationId = this.headerValue(headers['x-request-id']) ?? randomUUID();
```

- Si le client fournit un header `x-request-id` → utilisé comme `correlationId` (idempotence possible côté appelant)
- Sinon → UUID v4 généré localement (via `crypto.randomUUID()`)

**Providers concernés :** `whapi`, `meta`, `messenger`, `instagram`, `telegram`

---

## Propagation dans le pipeline

```
[HTTP] WhapiController
  correlationId généré (header x-request-id ou UUID)
  log → WEBHOOK_ACCEPTED correlationId=<id> provider=<p> tenant_id=<t>
        │
        ▼
[Service] WhapiService.handleIncomingMessage(payload, tenantId, correlationId)
        │
        ▼
[Service] UnifiedIngressService.ingestWhapi(payload, tenantId, correlationId)
  correlationId injecté sur chaque UnifiedMessage
  log → INGRESS_START correlationId=<id> provider=<p> messages=N statuses=N
        │
        ▼
[Service] InboundMessageService.handleMessages(messages)
  correlationId lu depuis message.correlationId
  log → INCOMING_RECEIVED correlationId=<id> provider_msg_id=<pid> chat_id=<c> type=<t>
        │
        ├─ [si chat_id invalide]
        │  log → INCOMING_IGNORED correlationId=<id> reason=<r> chat_id=<c>
        │
        ▼
  processOneMessage(message, correlationId)
        │
        ├─ assignConversation(chatId, name, correlationId, tenantId, channelId)
        │    → correlationId = traceId dans DispatcherService.assignConversation()
        │    → log dans dispatcher : DISPATCH_ASSIGN trace=<correlationId>
        │
        ├─ messagePersistence.persist(message, conversation, correlationId)
        │
        ├─ [si aucun poste disponible]
        │  log → INCOMING_NO_AGENT correlationId=<id> chat_id=<c>
        │
        ▼
  log → INCOMING_DISPATCHED correlationId=<id> chat_id=<c> poste_id=<p>
        │
        ▼
[Gateway] WhatsappMessageGateway.notifyNewMessage(...)
  → émission socket MESSAGE_ADD vers le frontend

[EventEmitter2] 'inbound.message.processed' { traceId: correlationId }
  → déclenche les automatismes (AutoMessageOrchestrator)
```

---

## Format des logs

Tous les logs du pipeline utilisent le format `clé=valeur` sans séparateur pour faciliter le grep :

| Étape | Log type | Clés obligatoires |
|-------|----------|-------------------|
| Contrôleur HTTP | `WEBHOOK_ACCEPTED` | `correlationId`, `provider`, `tenant_id` |
| UnifiedIngressService | `INGRESS_START` | `correlationId`, `provider`, `tenant_id`, `messages`, `statuses` |
| InboundMessageService | `INCOMING_RECEIVED` | `correlationId`, `provider_msg_id`, `chat_id`, `type` |
| InboundMessageService | `INCOMING_IGNORED` | `correlationId`, `reason`, `chat_id` |
| InboundMessageService | `INCOMING_NO_AGENT` | `correlationId`, `chat_id` |
| InboundMessageService | `INCOMING_DISPATCHED` | `correlationId`, `chat_id`, `poste_id` |

---

## Utilisation pratique

### Retracer un message complet

```bash
grep "correlationId=3f8a1c2d-..." /var/log/app.log
```

Exemple de sortie attendue :
```
[WebhookAudit] WEBHOOK_ACCEPTED correlationId=3f8a1c2d provider=whapi tenant_id=tenant-1 ...
[UnifiedIngressService] INGRESS_START correlationId=3f8a1c2d provider=whapi messages=1 statuses=0
[InboundMessageService] INCOMING_RECEIVED correlationId=3f8a1c2d provider_msg_id=wamid.xxx chat_id=336...@s.whatsapp.net type=text
[InboundMessageService] INCOMING_DISPATCHED correlationId=3f8a1c2d chat_id=336...@s.whatsapp.net poste_id=poste-1
```

### Depuis le client (traçage end-to-end)

Si le client HTTP (webhook provider ou proxy) envoie un header `x-request-id: <uuid>`, ce même UUID sera présent dans tous les logs backend. Cela permet de corréler les logs backend avec les logs du provider.

---

## Fallback : messages sans `correlationId`

Si un `UnifiedMessage` arrive sans `correlationId` (mode legacy ou shadow), le `correlationId` est calculé comme :

```typescript
const correlationId = message.correlationId ?? this.buildTraceId(message.providerMessageId, message.chatId);
// buildTraceId = providerMessageId ?? `chat:${chatId}:${Date.now()}`
```

Ce fallback garantit que tous les logs ont toujours une valeur greatable, même sans passage par le pipeline unifié.

---

## Fichiers impactés

| Fichier | Rôle |
|---------|------|
| `src/webhooks/normalization/unified-message.ts` | Ajout du champ `correlationId?: string` |
| `src/webhooks/unified-ingress.service.ts` | Réception et injection du `correlationId` sur chaque message |
| `src/whapi/whapi.service.ts` | Propagation du `correlationId` vers `UnifiedIngressService` |
| `src/whapi/whapi.controller.ts` | Génération du `correlationId` à l'entrée HTTP |
| `src/webhooks/inbound-message.service.ts` | Utilisation du `correlationId` dans tous les logs pipeline |
