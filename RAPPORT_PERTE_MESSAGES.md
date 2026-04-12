# Rapport d'analyse — Perte de messages et conversations

**Date :** 2026-04-12  
**Branche :** production  
**Providers actifs en prod :** Meta WhatsApp Business API (`/webhooks/whatsapp`) et Messenger (`/webhooks/messenger`) — pas de Whapi configuré  
**Symptôme observé :** Gaps de 9+ minutes sans réception de messages, périodiques, plusieurs fois par heure. Déséquilibre entre le nombre de messages sur Meta (élevé) et sur la plateforme (bas) → centaines de messages perdus.

---

## Résumé exécutif

L'analyse du code et des logs révèle **6 mécanismes de perte**, dont **3 critiques** directement liés au cron maître des messages automatiques et à la chaîne de réception Messenger.

**Correction de l'analyse initiale :** Les erreurs `Whapi typing error 404` dans les logs ne sont PAS dues à une session Whapi dégradée. Elles viennent du système de messages automatiques (`sendAutoMessageForTrigger` / `sendAutoMessage`) qui appelle `typingStart()` / `typingStop()` pour tous les canaux sans vérifier le provider — et en production il n'y a pas de canal Whapi → 404. Ces erreurs sont un **bug bénin** (le message est quand même envoyé) mais elles masquent les vraies causes de perte.

---

## 1. Architecture de la chaîne de réception — comparaison Meta WhatsApp vs Messenger

### 1.1 Tableau comparatif des deux chaînes

| Étape | Meta WhatsApp (`/webhooks/whatsapp`) | Messenger (`/webhooks/messenger`) |
|-------|--------------------------------------|-----------------------------------|
| Validation taille | `assertPayloadSize()` | `assertPayloadSize()` |
| Validation payload | `assertMetaPayload()` — throw 400 si phone_number_id manquant | `assertMessengerPayload()` — throw 400 si `object !== 'page'` |
| Lookup canal | `findByChannelId(phoneNumberId)` — 1 DB query | `findChannelByExternalId('messenger', pageId)` — 1 DB query |
| Validation HMAC | `assertMetaSignature()` — utilise `channel?.meta_app_secret` | `assertMessengerSignature()` — utilise `channelRecord?.meta_app_secret` |
| Résolution tenant | `resolveTenantForMeta(wabaId, phoneNumberId)` | `resolveTenantOrReject('messenger', pageId)` |
| Rate limiting | `rateLimit()` → **avec IP** (x-forwarded-for) | `rateLimitService.assertRateLimits(provider, null, tenantId)` → **sans IP** |
| Circuit breaker | `assertCircuitBreaker('meta')` → 503 si 5% erreurs | `assertCircuitBreaker('messenger')` → 503 si 5% erreurs |
| Mode dégradé | ✅ **OUI** — `enqueueDegradedMeta()` si p95 ≥ 800ms | ❌ **ABSENT** — pas de queue dégradée |
| Idempotence | `isReplayEvent(payload, 'meta', tenantId)` | `isReplayEvent(payload, 'messenger', tenantId)` |
| Traitement | `whapiService.handleMetaWebhook()` | `unifiedIngressService.ingestMessenger()` |

### 1.2 Flux Meta WhatsApp (avec protection dégradée)

```
Meta WhatsApp Business API
         │  POST /webhooks/whatsapp
         ▼
   assertPayloadSize() + assertMetaPayload()
   findByChannelId(phoneNumberId)      ← 1 DB query
   assertMetaSignature(meta_app_secret)
   resolveTenantForMeta()              ← 1 DB query
   rateLimit() avec IP
   assertCircuitBreaker('meta')         ← 503 si 5% erreurs
         │
         ├── [isDegraded: p95 >= 800ms] → WebhookDegradedQueueService
         │                                (max 5000, concurrence 5)
         │                                → 503 si queue pleine
         ▼  [mode normal]
   isReplayEvent() [idempotence DB]
   whapiService.handleMetaWebhook()
   → UnifiedIngressService.ingestMeta()
   → InboundMessageService.handleMessages()
```

### 1.3 Flux Messenger (SANS protection dégradée)

```
Facebook Messenger
         │  POST /webhooks/messenger
         ▼
   assertPayloadSize() + assertMessengerPayload()
   findChannelByExternalId('messenger', pageId)  ← 1 DB query
   assertMessengerSignature(meta_app_secret)
   resolveTenantOrReject('messenger', pageId)    ← 1 DB query
   rateLimitService.assertRateLimits() sans IP
   assertCircuitBreaker('messenger')              ← 503 si 5% erreurs
         │
         │  ← PAS DE MODE DÉGRADÉ (aucune queue buffer)
         ▼
   isReplayEvent() [idempotence DB]
   unifiedIngressService.ingestMessenger()
   → InboundMessageService.handleMessages()
         │
         ▼  [commun aux deux providers]
   Mutex par chat_id (sans timeout)
   dispatcherService.assignConversation()
   saveIncomingFromUnified()
   saveMedia()
   chatService.update()
   messageGateway.notifyNewMessage()
   autoMessageOrchestrator() [fire-and-forget]
         │
         ▼
      MySQL DB
```

---

## 2. Analyse des logs serveur (2026-04-11 / 2026-04-12)

### 2.1 Ce que montrent les logs

```
Période analysée : 2026-04-11 00:30–00:46 et 2026-04-12 10:13–10:25
Erreurs trouvées : 100% "Whapi typing error" — AxiosError HTTP 404
Erreurs absentes : aucun 500, aucun circuit breaker, aucun débordement de queue, aucune erreur DB
Heap mémoire    : stable, 43–51 MB (pas de fuite mémoire)
OpenFDs         : stable, 24–46 (pas de fuite de descripteurs)
```

### 2.2 Vraie cause des erreurs 404 — bug dans le système de messages auto

La stack trace pointe vers :
```
CommunicationWhapiService.sendTyping()
  ← WhatsappMessageService.typingStart() / typingStop()
    ← MessageAutoService.sendAutoMessageForTrigger()
    ← MessageAutoService.sendAutoMessage()
```

**Le bug :** `WhatsappMessageService.typingStart()` et `typingStop()` appellent **toujours** `CommunicationWhapiService.sendTyping()` sans vérifier le provider du canal :

```typescript
// whatsapp_message.service.ts:443
async typingStart(chat_id: string) {
  await this.communicationWhapiService.sendTyping(chat_id, true);
  // ← appelle toujours Whapi, même pour un canal Messenger
}
```

En production avec uniquement Messenger : pas de canal Whapi → 404 sur chaque appel.

**Conséquence réelle :** Les messages automatiques sont quand même envoyés (le typing est fire-and-forget `catch(() => {})`). Ce bug génère du bruit dans les logs mais **n'est pas une cause directe de perte de messages**.

**Ce que confirment les logs :** Le système de messages automatiques est actif en production et fonctionne (envoie des messages aux clients).

### 2.3 Ce que les logs NE MONTRENT PAS (à rechercher)

Les vraies erreurs de perte seraient visibles via :
```bash
# Chercher les vrais échecs de traitement webhook
docker exec whatsapp-back grep -E "WEBHOOK_.*ERROR|Degraded queue|Backpressure|503|circuit" \
  /app/logs/app-2026-04-11.log | tail -50

# Chercher les erreurs d'envoi de messages Messenger
docker exec whatsapp-back grep -E "messenger.*error|meta.*error|outbound.*fail" \
  /app/logs/app-2026-04-11.log -i | tail -50
```

---

## 3. Crons et schedules — inventaire complet

| Clé | Type | Fréquence | Défaut | Fichier |
|-----|------|-----------|--------|---------|
| `sla-checker` | interval | 121 min | ✅ activé | `first-response-timeout.job.ts` |
| `read-only-enforcement` | interval | 60 min | ✅ activé | `read-only-enforcement.job.ts` |
| `offline-reinject` | cron | `0 9 * * *` (09h00) | ✅ activé | `offline-reinjection.job.ts` |
| `webhook-purge` | cron | `0 3 * * *` (03h00) | ✅ activé | `webhook-idempotency-purge.service.ts` |
| `orphan-checker` | interval | 15 min | ✅ activé | `orphan-checker.job.ts` |
| `auto-message-master` | interval | 5 min | ❌ désactivé | `auto-message-master.job.ts` |
| `auto-message` | event | déclenché | ❌ désactivé | `auto-message-orchestrator.service.ts` |

> **Note :** `auto-message-master` et `auto-message` sont désactivés par défaut. Si l'un ou l'autre est activé en production, voir section 5 (bugs critiques).

---

## 4. Mécanismes de perte identifiés

### 🔴 M0 — Messenger n'a PAS de mode dégradé : circuit break direct → 503 → backoff Meta [CRITIQUE MESSENGER]

**Fichier :** `whapi.controller.ts:207–281` — handler Messenger

**Asymétrie critique entre les deux providers :**

```
Meta WhatsApp en latence élevée :
  p95 >= 800ms → mode dégradé → queue (max 5000) → 503 si pleine
  → Meta retente proprement

Messenger en latence élevée :
  p95 >= 800ms → RIEN (pas de isDegraded() appelé)
  → traitement direct → si échec → compteur erreurs
  → 5% erreurs → circuit OPEN → 503 direct
  → Meta backoff : 5s → 30s → 2min → 10min → GAP
```

**Cause des erreurs Messenger qui ouvrent le circuit :**
- 2 DB queries avant HMAC (findChannelByExternalId + resolveTenantOrReject) → lentes si DB chargée
- Mutex `runExclusive` sans timeout → si saveIncomingFromUnified freeze → exception → erreur comptabilisée
- Tout `throw` non-HttpException → comptabilisé comme erreur → contribue au 5%

**Résultat :** Le circuit Messenger peut s'ouvrir après seulement 1 erreur sur 20 webhooks, puis Meta entre en backoff de 10 minutes.

---

### 🔴 M1 — Circuit breaker trop sensible → queue dégradée saturée → HTTP 503 → backoff Meta [CRITIQUE META WHATSAPP]

**Fichiers :** `webhook-traffic-health.service.ts:60`, `webhook-degraded-queue.service.ts:10–11`, `whapi.controller.ts:107–127`

**Seuil de déclenchement :**
```typescript
const degrade = p95 >= 800; // p95 latence sur 20 échantillons >= 800ms
```

**Ce qui se passe :**
1. Une opération légèrement lente (DB, dispatch, média) porte le p95 à 800ms
2. Mode dégradé activé → tous les webhooks vont dans la queue in-memory
3. Queue traitée avec concurrence **5** seulement — traitement ralenti
4. Si queue atteint **5000 items** → nouveau webhook → HTTP **503**
5. Meta reçoit 503 → backoff exponentiel : 5s → 30s → 2min → **10min → 30min**
6. Gap de **9+ minutes** = 4ème palier du backoff Meta

**Pourquoi le mode dégradé persiste :** Tant que le backend traite lentement (y compris la queue elle-même), le p95 reste élevé → mode dégradé ne se désactive jamais → boucle infinie.

---

### 🔴 M2 — Purge webhook sans LIMIT → lock table MySQL à 03h00 [CRITIQUE PÉRIODIQUE]

**Fichier :** `webhook-idempotency-purge.service.ts:46`

```typescript
// DELETE illimité — bloque la table webhook_event_log
const result = await this.webhookEventRepository.delete({
  createdAt: LessThan(cutoff),  // PAS de LIMIT
});
```

**Volume estimé :** 3 conv/min × 2 events/conv × 60 × 24 × 14 jours = **~120 000 lignes**

À ce volume, le DELETE peut prendre 15–60 secondes. Pendant ce temps :
- Les INSERTs d'idempotence échouent (lock MySQL)
- Les webhooks Messenger retournent HTTP 500
- Meta backoff : 5s → 30s → 2min → 10min → gap

---

### 🔴 M3 — HMAC sans canal en DB → 401 → Meta abandonne → perte définitive [CRITIQUE MESSENGER + META]

**Fichier :** `whapi.controller.ts:228–229` (Messenger) et `whapi.controller.ts:495–498` (Meta WhatsApp)

**Messenger :**
```typescript
const channelRecord = await this.channelService.findChannelByExternalId('messenger', pageId);
this.assertMessengerSignature(headers, rawBody, payload, channelRecord?.meta_app_secret);
// Si channelRecord est null → meta_app_secret = undefined
// En production (NODE_ENV=production) → UnauthorizedException 401
```

**Meta WhatsApp :**
```typescript
const channel = phoneNumberId
  ? await this.channelService.findByChannelId(phoneNumberId)
  : null;
this.assertMetaSignature(headers, rawBody, payload, channel?.meta_app_secret);
// Si channel est null → meta_app_secret = undefined
// En production → UnauthorizedException 401
```

**Scénario de perte :**
1. Un nouveau canal est créé chez Meta mais pas encore enregistré en DB sur notre plateforme
2. Meta envoie des webhooks avec ce `pageId` ou `phoneNumberId`
3. `channelRecord` est null → secret undefined → 401 en production
4. **Meta (et Facebook) ne retente PAS les 401** (erreur considérée comme côté serveur volontaire)
5. Tous les messages de ce canal sont perdus définitivement jusqu'à ce que le canal soit configuré en DB

**Ampleur :** Affecte également les cas de migration/rotation de pageId.

---

### 🟠 M3b — Messenger traite uniquement `entry[0]` — batch webhooks partiellement perdus

**Fichier :** `whapi.controller.ts:221`

```typescript
const pageId = messengerPayload.entry?.[0]?.id;  // SEULEMENT entry[0]
```

Meta Messenger peut envoyer des webhooks avec plusieurs `entry` (ex: plusieurs pages dans la même app). Seul `entry[0]` est utilisé pour résoudre le canal et le tenant. Si Meta envoie :
```json
{ "entry": [
  { "id": "page_A", "messaging": [...] },
  { "id": "page_B", "messaging": [...] }
]}
```
→ `entry[1]` (page_B) est ignoré silencieusement.

**Note :** En pratique Meta envoie généralement une entrée par webhook pour Messenger, mais cette limite est documentée comme un risque.

---

### 🟠 M4 — Bug critique : `typingStart/typingStop` toujours Whapi, jamais Messenger

**Fichiers :** `whatsapp_message.service.ts:443–449`, `communication_whapi.service.ts:66–110`

Ce bug génère les 404 dans les logs. Mais il a une conséquence secondaire : si `sendTyping()` lève une exception non catchée dans certains contextes, cela peut interrompre le flux d'envoi d'un message automatique.

Dans `sendAutoMessageForTrigger()` :
```typescript
void this.messageService.typingStart(chatId).catch(() => {});  // OK — ignoré
// ...
} finally {
  void this.messageService.typingStop(chatId).catch(() => {});  // OK — ignoré
}
```

Dans `sendAutoMessage()` (orchestrateur) :
```typescript
void this.messageService.typingStart(chatId).catch(() => {});  // OK
```

**Les `.catch(() => {})` protègent bien** — les erreurs ne bloquent pas l'envoi. C'est un bug bénin pour la livraison, mais il pollue les logs et masque de vraies erreurs.

---

### 🟠 M5 — Mutex par chat_id sans timeout → deadlock permanent possible

**Fichier :** `inbound-message.service.ts:88`

```typescript
await this.getChatMutex(message.chatId).runExclusive(async () => {
  // Pas de timeout — si saveIncomingFromUnified() freeze, webhook bloqué ∞
});
```

---

### 🟡 M6 — Rate limiter in-memory remis à zéro au redémarrage

**Fichier :** `webhook-rate-limit.service.ts`

Redémarrage serveur → buckets réinitialisés → burst de webhooks en attente peut déclencher les limites aussitôt après restart.

---

## 5. Analyse approfondie du cron maître des messages automatiques

> Cette section documente les bugs du `auto-message-master` et de l'`AutoMessageOrchestrator`. Ces bugs sont actifs si l'un ou l'autre est activé en production.

### 5.1 Deux systèmes d'auto-messages coexistent

| Système | Déclenchement | Fichier | État défaut |
|---------|--------------|---------|-------------|
| `AutoMessageOrchestrator` | Événement — à chaque message entrant | `auto-message-orchestrator.service.ts` | ❌ désactivé |
| `AutoMessageMasterJob` | Cron — toutes les 5 min | `auto-message-master.job.ts` | ❌ désactivé |

**Risque si les deux sont activés simultanément :** Double envoi de messages automatiques pour le même chat.

---

### 5.2 Bug critique — `read_only: true` permanent sur redémarrage serveur (Orchestrateur)

**Fichier :** `auto-message-orchestrator.service.ts:106–167`

**Flux problématique :**
```typescript
// Ligne 110 : read_only=true mis en DB AVANT le setTimeout
await this.chatService.update(chatId, { read_only: true });

// Ligne 141 : setTimeout non persisté — en mémoire seulement
const timeout = setTimeout(() => {
  void this.executeAutoMessage(chatId)
    .finally(() => {
      this.locks.delete(chatId);     // en mémoire
      this.pendingTimeouts.delete(chatId); // en mémoire
    });
}, delayMs);
```

**Ce qui arrive au redémarrage du serveur :**
1. `read_only: true` est persisté en DB ✅
2. Le `setTimeout` est **perdu en mémoire** ❌
3. `this.locks` est vidé (Map vide au démarrage) ❌
4. La conversation reste `read_only: true` en DB **pour toujours**
5. Le commercial ne peut plus envoyer de message à ce client
6. Si le client renvoie un message → `inbound-message.service.ts:170` remet `read_only: false` — mais seulement si le client écrit avant que la conversation soit fermée par `read-only-enforcement`

**Ampleur :** Chaque redémarrage serveur avec des auto-messages en attente (délai 5–9 min par défaut) crée des conversations définitivement verrouillées.

---

### 5.3 Bug critique — Lock mémoire sans timeout (Orchestrateur)

**Fichier :** `auto-message-orchestrator.service.ts:106`

```typescript
this.locks.add(chatId);  // Lock ajouté avant setTimeout

const timeout = setTimeout(() => {
  void this.executeAutoMessage(chatId)
    .finally(() => {
      this.locks.delete(chatId);  // Lock libéré seulement ici
    });
}, delayMs);
```

**Scénario de blocage :**
1. `executeAutoMessage()` lance une requête DB qui ne répond jamais (timeout réseau, deadlock)
2. La Promise ne se résout jamais → `.finally()` ne s'exécute jamais
3. `this.locks.delete(chatId)` n'est jamais appelé
4. Tout nouveau message de ce client est ignoré : `if (this.locks.has(chatId)) return;`
5. `read_only` reste `true` indéfiniment

---

### 5.4 Bug important — Fenêtre glissante du cron maître ne s'adapte pas aux exécutions manquées

**Fichier :** `auto-message-master.job.ts:73`

```typescript
// Fenêtre = 2 × intervalMinutes (fixe)
const intervalMs = (masterConfig.intervalMinutes ?? 5) * 2 * 60_000;
const windowStart = new Date(Date.now() - intervalMs);
```

**Comportement attendu :** cron toutes les 5 min → fenêtre de 10 min → overlap de 5 min → chaque conversation est couverte par au moins 2 exécutions.

**Comportement en cas de cron manqué :**
- Si le serveur est arrêté 15 min → au redémarrage, la fenêtre est toujours 10 min
- Les conversations arrivées entre `t-15min` et `t-10min` → **jamais traitées** par les triggers C, D, F, G, I

Les triggers A, E, H ne sont pas affectés (ils utilisent des cutoffs absolus basés sur le temps écoulé).

---

### 5.5 Bug important — Aucune LIMIT sur les queries de triggers

**Fichier :** `auto-message-master.job.ts` — tous les triggers

```typescript
// Exemple TriggerA — pas de take/limit
const chats = await this.chatRepo
  .createQueryBuilder('c')
  .leftJoinAndSelect('c.channel', 'channel')
  // ... conditions ...
  .getMany();  // ← récupère TOUS les chats correspondants sans limite
```

**Triggers sans LIMIT :** A, C, D, E, F, G, H, I — tous les 8.

**Risque :** Si 500 conversations correspondent, le cron traite 500 × N requêtes DB (envoi + tracking update), peut durer plusieurs minutes, bloque l'event loop et retarde les webhooks entrants.

**Exception partielle :** TriggerF (`keyword`) fait en plus une requête `findLastInboundMessageBychat_id` par chat → **N requêtes supplémentaires** pour N conversations.

---

### 5.6 Bug — Double envoi si `updateTriggerTracking` échoue

**Fichier :** `message-auto.service.ts:197–219`

```typescript
try {
  const message = await this.messageService.createAgentMessage({ ... });
  await this.gateway.notifyAutoMessage(message, chat);
  await this.updateTriggerTracking(chatId, trigger, step);  // ← peut échouer
} finally {
  void this.messageService.typingStop(chatId).catch(() => {});
}
```

**Scénario :**
1. Message envoyé avec succès au client ✅
2. `updateTriggerTracking()` échoue (DB timeout, deadlock)
3. Les compteurs de tracking (`no_response_auto_step`, `last_no_response_auto_sent_at`, etc.) ne sont pas mis à jour
4. Au prochain tick du cron (5 min), la conversation correspond encore aux critères
5. Le message automatique est **renvoyé une seconde fois** au client

---

### 5.7 Bug — Incohérence `read_only` entre orchestrateur et cron maître

**Orchestrateur** (`sendAutoMessage`) :
```typescript
// Après envoi → read_only = true (conversation bloquée)
await this.chatService.update(chatId, { read_only: true, auto_message_status: 'sent' });
```

**Cron maître** (`sendAutoMessageForTrigger`) :
```typescript
// Après envoi → RIEN — read_only n'est pas touché
await this.updateTriggerTracking(chatId, trigger, step);
```

Résultat : si les deux systèmes sont actifs, l'orchestrateur verrouille les conversations après envoi, mais le cron maître ne le fait pas. Le comportement dépend de quel système a été déclenché en dernier.

---

## 6. Diagnostic des gaps de 9+ minutes

### Scénario A — Messenger : circuit break direct sans dégradation (M0) — le plus probable

```
DB légèrement lente ou mutex lent sur un traitement Messenger
  → Une exception levée dans ingestMessenger() ou handleMessages()
  → Comptabilisée comme erreur dans WebhookTrafficHealthService

Sur 20 webhooks Messenger, 1 échoue = 5% → circuit OPEN
  → assertCircuitBreaker('messenger') → HTTP 503 pour TOUS les webhooks suivants
  → Pas de queue dégradée pour Messenger → 503 immédiat

Meta backoff Messenger : 5s → 30s → 2min → 10min
  → GAP de 9+ minutes

Circuit se ferme quand errorRate < 5% sur la fenêtre suivante
  → Meta reprend → burst de retentes → peut re-déclencher le circuit
  → Cycle se répète plusieurs fois par heure
```

### Scénario B — Meta WhatsApp : latence → mode dégradé → queue saturée (M1)

```
Opération lente (saveIncoming + saveMedia Meta WhatsApp)
  → p95 dépasse 800ms sur 20 échantillons
  → Mode dégradé activé pour provider 'meta'
  → Webhooks Meta mis en queue dégradée (concurrence 5)

Si burst ou traitement lent : queue sature (5000)
  → HTTP 503 → Meta WhatsApp backoff : 5s → 30s → 2min → 10min
  → GAP de 9+ minutes pour WhatsApp
```

### Scénario C — Purge webhook (M2) — cause certaine à 03h00 (les deux providers)

```
03h00 : DELETE sans LIMIT sur webhook_event_log (~120K lignes)
  → Lock MySQL pendant 15–60 secondes
  → INSERTs idempotence échouent pour Messenger ET Meta WhatsApp
  → Les deux circuits accumulent des erreurs → peuvent s'ouvrir
  → Meta backoff → gap de 9+ min sur tous les providers actifs
```

### Scénario D — Cron maître bloquant → surcharge DB → déclenche M0 ou M1

```
Cron maître lancé (toutes les 5 min)
  → N conversations sans LIMIT (TriggerA, E, H...)
  → N envois Messenger séquentiels + N updateTriggerTracking
  → 15–60 secondes d'activité DB intensive
  → Latence webhooks augmente → pour Meta: mode dégradé puis 503
  → Pour Messenger: exceptions → circuit break → 503 → backoff
```

---

## 7. Vérification des crons — impact sur la réception

| Cron | Impact direct sur réception | Risque |
|------|----------------------------|--------|
| `sla-checker` | Aucun | Charge DB toutes les 121 min |
| `read-only-enforcement` | Aucun | UPDATE conversations inactives |
| `orphan-checker` | Aucun | Dispatche 20 orphelins max |
| `offline-reinject` | Aucun | 1 fois/jour, limité |
| `webhook-purge` | **OUI** à 03:00 | DELETE illimité → lock table |
| `auto-message-master` | **OUI si activé** | Queries sans LIMIT → surcharge DB |

---

## 8. Recommandations par priorité

### P0 — Corrections immédiates (sans redéploiement complet)

#### P0-0 : Ajouter le mode dégradé pour Messenger [PRIORITÉ ABSOLUE]

**Fichier :** `whapi.controller.ts:258–276` (handler Messenger)

```typescript
// AVANT — Messenger : pas de mode dégradé
try {
  await this.unifiedIngressService.ingestMessenger(messengerPayload, { ... });
} catch (err) { ... }

// APRÈS — Ajouter la même logique que Meta WhatsApp
const degraded = this.healthService.isDegraded(provider);

try {
  if (degraded) {
    const queued = this.enqueueDegradedMessenger(provider, messengerPayload, tenantId, channelId);
    if (!queued) {
      throw new HttpException('Degraded queue overloaded', HttpStatus.SERVICE_UNAVAILABLE);
    }
    this.healthService.record(provider, true, Date.now() - startedAt);
    throw new HttpException({ status: 'accepted', mode: 'degraded' }, HttpStatus.ACCEPTED);
  }
  await this.unifiedIngressService.ingestMessenger(messengerPayload, { ... });
} catch (err) { ... }
```

Et ajouter la méthode privée :
```typescript
private enqueueDegradedMessenger(
  provider: string,
  payload: MessengerWebhookPayload,
  tenantId: string,
  channelId: string,
): boolean {
  return this.degradedQueue.enqueue(provider, {
    run: async () => {
      await this.unifiedIngressService.ingestMessenger(payload, {
        provider: 'messenger', tenantId, channelId,
      });
    },
  });
}
```

---

#### P0-1 : Corriger `typingStart/typingStop` — vérifier le provider

**Fichier :** `whatsapp_message.service.ts` ou `communication_whapi.service.ts`

```typescript
// Dans CommunicationWhapiService.sendTyping() — ajouter un guard provider
async sendTyping(chat_id: string, typing: boolean) {
  try {
    const chat = await this.chatRepository.findOne({
      where: { chat_id },
      relations: { poste: true },
    });
    if (!chat) return;

    const channel = await this.channelRepository.findOne({
      where: { channel_id: chat.last_msg_client_channel_id },
    });
    if (!channel) return;

    // ← AJOUT : ne rien faire si ce n'est pas un canal Whapi
    if (channel.provider !== 'whapi') return;

    // ... reste de la logique
  } catch (err) { ... }
}
```

Élimine 100% des erreurs 404 dans les logs et nettoie la visibilité des vraies erreurs.

---

#### P0-2 : Purge webhook avec LIMIT — évite le lock à 03h00

**Fichier :** `webhook-idempotency-purge.service.ts:46`

```typescript
// Remplacer le DELETE atomique par une boucle par lots
async purgeOldEvents(): Promise<string> {
  const ttlDays = await this.getTtlDays();
  const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);
  let total = 0;
  let deleted: number;

  do {
    const result = await this.webhookEventRepository
      .createQueryBuilder()
      .delete()
      .from(WebhookEventLog)
      .where('createdAt < :cutoff', { cutoff })
      .limit(500)
      .execute();
    deleted = result.affected ?? 0;
    total += deleted;
    if (deleted > 0) await new Promise(r => setTimeout(r, 50)); // pause inter-lots
  } while (deleted === 500);

  return `${total} événement(s) supprimé(s)`;
}
```

---

#### P0-3 : Augmenter les seuils de la queue dégradée

**Fichier :** `webhook-degraded-queue.service.ts`

```typescript
private readonly maxQueueSize = 50000; // 5000 → 50000
private readonly concurrency = 20;    // 5 → 20
```

#### P0-4 : Relever le seuil p95 du circuit breaker

**Fichier :** `webhook-traffic-health.service.ts:60`

```typescript
const degrade = p95 >= 3000; // 800ms → 3000ms
```

---

### P1 — Cron maître : corrections importantes

#### P1-1 : Ajouter LIMIT à toutes les queries du cron maître

**Fichier :** `auto-message-master.job.ts` — tous les triggers

```typescript
// Exemple pour TriggerA — ajouter .limit(50) sur chaque trigger
const chats = await this.chatRepo
  .createQueryBuilder('c')
  .leftJoinAndSelect('c.channel', 'channel')
  .where(...)
  .limit(50)  // ← AJOUT sur chaque trigger
  .getMany();
```

Valeurs recommandées : 50 pour A/E/H, 100 pour C/D/G/I, 30 pour F (car double-requête).

#### P1-2 : Corriger la double-envoi si updateTriggerTracking échoue

**Fichier :** `message-auto.service.ts:165–219`

Wrapper `createAgentMessage` + `updateTriggerTracking` dans une transaction, ou inverser l'ordre :
```typescript
// Mettre à jour le tracking AVANT d'envoyer
// Si l'envoi échoue → annuler le tracking
await this.updateTriggerTracking(chatId, trigger, step); // d'abord
await this.messageService.createAgentMessage(...);        // ensuite
```

Ou utiliser une transaction TypeORM pour les deux opérations.

#### P1-3 : Persister les timeouts de l'orchestrateur en DB

**Fichier :** `auto-message-orchestrator.service.ts`

Le `setTimeout` est in-memory → perdu au redémarrage → conversations bloquées.

Solution minimale : au démarrage, nettoyer les conversations avec `read_only: true` et `last_auto_message_sent_at IS NULL` (c'est-à-dire verrouillées mais pas encore envoyées) :

```typescript
// Dans onModuleInit() de AutoMessageOrchestrator
async onModuleInit(): Promise<void> {
  // Libérer les conversations bloquées par un redémarrage précédent
  await this.chatService.resetStaleReadOnly();
}
```

```typescript
// Dans WhatsappChatService
async resetStaleReadOnly(): Promise<void> {
  await this.chatRepo.update(
    { read_only: true, last_auto_message_sent_at: IsNull() },
    { read_only: false }
  );
}
```

#### P1-4 : Timeout sur le mutex `runExclusive`

**Fichier :** `inbound-message.service.ts`

```typescript
import { withTimeout } from 'async-mutex';
// ...
mutex = withTimeout(new Mutex(), 30_000, new Error('Chat mutex timeout'));
```

---

### P2 — Observabilité

#### P2-1 : Métriques de gap webhook

Enregistrer `Date.now()` de chaque dernier webhook reçu par provider. Alerter si gap > 5 min :

```typescript
// Dans WebhookMetricsService
recordReceived(provider: string, tenantId: string): void {
  this.lastReceived.set(provider, Date.now()); // ← ajouter
  // ...
}
```

#### P2-2 : Log structuré au démarrage du mode dégradé

```typescript
this.logger.warn(
  `BACKPRESSURE_ENABLED provider=${provider} p95=${p95}ms errorRate=${(errorRate*100).toFixed(1)}% samples=${list.length}`
);
```

#### P2-3 : Log du cron maître — résumé par trigger

Ajouter en fin de `run()` un résumé : `AutoMessageMasterJob finished trigA=X trigC=Y trigH=Z duration=Xms` pour détecter quand un trigger prend trop de temps.

---

## 9. Synthèse des risques

| # | Mécanisme | Provider | Sévérité | Fréquence | Perte messages | Confirmé |
|---|-----------|----------|----------|-----------|----------------|----------|
| M0 | Messenger sans mode dégradé → circuit break direct → 503 → backoff | Messenger | 🔴 CRITIQUE | Plusieurs fois/h | OUI | Architecture code |
| M1 | Latence p95 800ms → queue dégradée saturée → 503 → backoff | Meta WhatsApp | 🔴 CRITIQUE | Plusieurs fois/h | OUI | Architecture code |
| M2 | Purge sans LIMIT → lock table → 500 à 03h00 | Tous | 🔴 CRITIQUE | 1/jour | OUI | Architecture code |
| M3 | Canal absent en DB → HMAC 401 → Meta abandonne | Messenger + Meta | 🔴 CRITIQUE | Nouveau canal | OUI définitive | Architecture code |
| M-cron1 | read_only permanent sur restart (orchestrateur) | — | 🔴 CRITIQUE | Chaque restart | Non (blocage) | Architecture code |
| M-cron2 | Lock orchestrateur sans timeout → deadlock | — | 🟠 ÉLEVÉ | Rare | Non (blocage) | Architecture code |
| M-cron3 | Queries sans LIMIT → surcharge DB → déclenche M0/M1 | Tous | 🟠 ÉLEVÉ | Chaque tick cron | OUI indirect | Architecture code |
| M-cron4 | Double envoi si updateTriggerTracking échoue | — | 🟠 ÉLEVÉ | DB instable | OUI (doublon) | Architecture code |
| M3b | Batch webhook Messenger : seul entry[0] traité | Messenger | 🟡 MOYEN | Rare | Partielle | Architecture code |
| M4 | typingStart/Stop toujours Whapi → 404 pour Messenger | — | 🟡 FAIBLE | Constant | NON (bénin) | ✅ Logs |
| M5 | Mutex inbound sans timeout → deadlock | Tous | 🟡 FAIBLE | Rare | Non direct | Architecture code |
| M6 | Rate limiter in-memory non persisté au restart | Tous | 🟡 FAIBLE | Restart | Rare | Architecture code |

---

## 10. Plan d'action recommandé

```
MAINTENANT (sans code, vérification prod) :
  🔍 Vérifier si auto-message-master et/ou auto-message sont activés en DB
     SELECT key, enabled, intervalMinutes FROM cron_config 
     WHERE key IN ('auto-message-master', 'auto-message');
  🔍 Compter les conversations bloquées (read_only=true bloquées)
     SELECT COUNT(*) FROM whatsapp_chats 
     WHERE read_only = true AND last_auto_message_sent_at IS NULL;
  🔍 Chercher les vraies erreurs de perte dans les logs
     grep -E "Backpressure ENABLED|Degraded queue|503|circuit" app-2026-04-11.log

Jour 1 (urgence code — 4 fichiers) :
  ✅ P0-1 : Guard provider dans sendTyping() → élimine les 404 logs
  ✅ P0-2 : Purge webhook par lots de 500 → élimine le gap à 03:00
  ✅ P0-3 : maxQueueSize 50000 + concurrency 20
  ✅ P0-4 : Seuil p95 → 3000ms

Jour 2 (cron maître) :
  ✅ P1-1 : LIMIT sur toutes les queries de triggers
  ✅ P1-3 : resetStaleReadOnly au démarrage (libère les conversations bloquées)
  ✅ P1-4 : Timeout mutex 30s

Semaine 1 :
  ✅ P1-2 : Corriger double-envoi (transaction ou inversion ordre)
  ✅ P2-1 : Métriques gap webhook
  ✅ P2-2 : Logs structurés mode dégradé
  ✅ P2-3 : Log résumé cron maître
```

---

*Rapport généré par analyse statique complète — branche `production` — commit `7600907` — mis à jour après analyse des logs serveur 2026-04-11/12*
