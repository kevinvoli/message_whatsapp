# Plan de résolution des bugs — Perte de messages

**Basé sur :** `RAPPORT_PERTE_MESSAGES.md`  
**Date :** 2026-04-12  
**Providers concernés :** Meta WhatsApp Business API + Facebook Messenger  
**Objectif :** Éliminer les gaps de 9+ minutes et les pertes de messages périodiques

---

## Vue d'ensemble

```
Phase 0 — Vérifications sans code           (aujourd'hui, 1h)
Phase 1 — Corrections critiques réception   (Jour 1, ~4h)
Phase 2 — Corrections cron maître           (Jour 2, ~3h)
Phase 3 — Corrections orchestrateur auto    (Jour 3, ~2h)
Phase 4 — Observabilité                     (Semaine 1, ~3h)
Phase 5 — Renforcements secondaires         (Semaine 2, ~4h)
```

---

## Phase 0 — Vérifications sans code (aujourd'hui)

> Aucun déploiement nécessaire. Permet de confirmer le diagnostic et d'évaluer l'ampleur des dégâts.

### 0.1 — Vérifier l'état du circuit breaker en production

Les circuit breakers sont **in-memory** — ils ne survivent pas au redémarrage. Pour voir s'ils sont actuellement ouverts, chercher dans les logs récents :

```bash
docker exec whatsapp-back grep -E "Backpressure ENABLED|Circuit breaker OPEN|Degraded queue" \
  /app/logs/app-2026-04-12.log

# Chercher les vrais 503 retournés à Meta
docker exec whatsapp-back grep -E "SERVICE_UNAVAILABLE|503|Degraded queue overloaded" \
  /app/logs/app-2026-04-12.log | tail -20
```

**Résultat attendu si M0/M1 est la cause :** lignes `Circuit breaker OPEN for messenger` ou `Degraded queue overloaded`.

---

### 0.2 — Compter les conversations verrouillées (read_only permanent)

```sql
-- Conversations bloquées par un restart précédent (orchestrateur)
-- read_only=true mais aucun auto-message encore envoyé → restart = lock permanent
SELECT COUNT(*), status
FROM whatsapp_chats
WHERE read_only = true
  AND last_auto_message_sent_at IS NULL
GROUP BY status;

-- Si le count est élevé → agents ne peuvent pas répondre à ces clients
```

**Action immédiate si count > 0 :**
```sql
UPDATE whatsapp_chats
SET read_only = false
WHERE read_only = true
  AND last_auto_message_sent_at IS NULL;
```

---

### 0.3 — Vérifier si auto-message-master est activé en prod

```sql
SELECT key, enabled, intervalMinutes, scheduleType
FROM cron_config
WHERE key IN ('auto-message-master', 'auto-message');
```

**Si `enabled = 1` pour `auto-message-master`** → le cron tourne toutes les 5 minutes sans LIMIT sur les queries → contribue à la surcharge DB → déclenche les circuits breakers.

---

### 0.4 — Estimer la taille de la table webhook_event_log

```sql
SELECT COUNT(*) as total,
       MIN(created_at) as oldest,
       MAX(created_at) as newest
FROM webhook_event_log;

-- Vérifier la taille sur disque
SELECT table_name,
       ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name = 'webhook_event_log';
```

**Si taille > 50 Mo ou count > 100 000** → la purge à 03h00 prend > 30s → lock table → gap garanti chaque nuit.

---

### 0.5 — Identifier les canaux sans meta_app_secret en DB

```sql
-- Canaux Messenger sans secret configuré → HMAC échoue → 401 → perte définitive
SELECT channel_id, external_id, provider, created_at
FROM whapi_channels
WHERE provider = 'messenger'
  AND (meta_app_secret IS NULL OR meta_app_secret = '');

-- Canaux Meta WhatsApp sans secret
SELECT channel_id, external_id, provider, created_at
FROM whapi_channels
WHERE provider = 'meta'
  AND (meta_app_secret IS NULL OR meta_app_secret = '');
```

**Si résultat non vide** → configurer `meta_app_secret` immédiatement pour ces canaux.

---

## Phase 1 — Corrections critiques réception (Jour 1)

> Priorité absolue. Ces 4 corrections stoppent les pertes actives.  
> Branche suggérée : `fix/webhook-resilience`

---

### FIX-1 — Ajouter le mode dégradé pour Messenger

**Bug :** M0 — Messenger n'a pas de queue dégradée → moindre erreur = circuit break = 503 = backoff Meta 10 min  
**Fichier :** `message_whatsapp/src/whapi/whapi.controller.ts`  
**Lignes :** 258–276 (handler Messenger)  
**Complexité :** Faible — copier le pattern existant de Meta WhatsApp  
**Risque de régression :** Très faible

**Changement :**

1. Ajouter `isDegraded()` dans le handler Messenger (entre `metricsService.recordReceived` et `isReplayEvent`) :

```typescript
// Après : this.metricsService.recordReceived(provider, tenantId);
const degraded = this.healthService.isDegraded(provider);
```

2. Ajouter la logique de queue dégradée dans le `try` :

```typescript
try {
  if (degraded) {
    const queued = this.enqueueDegradedMessenger(
      provider, messengerPayload, tenantId, channelId,
    );
    if (!queued) {
      throw new HttpException('Degraded queue overloaded', HttpStatus.SERVICE_UNAVAILABLE);
    }
    this.healthService.record(provider, true, Date.now() - startedAt);
    this.metricsService.recordLatency(provider, Date.now() - startedAt);
    throw new HttpException({ status: 'accepted', mode: 'degraded' }, HttpStatus.ACCEPTED);
  }
  await this.unifiedIngressService.ingestMessenger(messengerPayload, {
    provider: 'messenger', tenantId, channelId,
  });
} catch (err) { ... }
```

3. Ajouter la méthode privée `enqueueDegradedMessenger()` :

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
        provider: 'messenger',
        tenantId,
        channelId,
      });
    },
  });
}
```

**Test :** Simuler une latence élevée (mocker `ingestMessenger` pour durer 1s), vérifier que `isDegraded` s'active et que les webhooks suivants passent par la queue au lieu de retourner des erreurs.

---

### FIX-2 — Augmenter les seuils de la queue dégradée

**Bug :** M1 — maxQueueSize=5000 et concurrence=5 trop restrictifs → saturation rapide  
**Fichier :** `message_whatsapp/src/whapi/webhook-degraded-queue.service.ts`  
**Lignes :** 10–11  
**Complexité :** Très faible — changer 2 constantes  
**Risque de régression :** Très faible (plus de mémoire utilisée en mode dégradé, acceptable)

```typescript
// AVANT
private readonly maxQueueSize = 5000;
private readonly concurrency = 5;

// APRÈS
private readonly maxQueueSize = 50000;
private readonly concurrency = 20;
```

**Test :** Aucun test spécifique requis. Surveiller la consommation mémoire en mode dégradé.

---

### FIX-3 — Relever le seuil p95 du circuit breaker

**Bug :** M1 — seuil 800ms trop bas pour la réalité de production  
**Fichier :** `message_whatsapp/src/whapi/webhook-traffic-health.service.ts`  
**Ligne :** 60  
**Complexité :** Très faible  
**Risque de régression :** Faible (mode dégradé se déclenche moins souvent, c'est voulu)

```typescript
// AVANT
const degrade = p95 >= 800;

// APRÈS
const degrade = p95 >= 3000; // 3 secondes — seuil réaliste
```

**Note :** Le seuil d'ouverture du circuit (5% erreurs) reste inchangé — seul le mode dégradé préventif est assoupli.

---

### FIX-4 — Corriger la purge webhook (DELETE sans LIMIT)

**Bug :** M2 — DELETE illimité bloque la table webhook_event_log à 03h00 pendant 15–60s  
**Fichier :** `message_whatsapp/src/whapi/webhook-idempotency-purge.service.ts`  
**Lignes :** 41–65  
**Complexité :** Faible  
**Risque de régression :** Très faible

Remplacer la méthode `purgeOldEvents()` :

```typescript
async purgeOldEvents(): Promise<string> {
  const ttlDays = await this.getTtlDays();
  const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);

  try {
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

      if (deleted > 0) {
        // Pause de 50ms entre les lots pour ne pas saturer la DB
        await new Promise(r => setTimeout(r, 50));
      }
    } while (deleted === 500);

    if (total > 0) {
      this.metricsService.recordIdempotencyPurge(total);
      this.logger.log(
        `Idempotency purge removed=${total} before=${cutoff.toISOString()} (by batches of 500)`,
      );
    }
    return `${total} événement(s) webhook supprimé(s) (TTL ${ttlDays}j)`;

  } catch (error) {
    const code = (error as { driverError?: { code?: string } })?.driverError?.code;
    if (code === 'ER_NO_SUCH_TABLE') {
      this.logger.warn('Idempotency purge skipped: webhook_event_log missing');
      return 'Ignoré — table webhook_event_log absente';
    }
    this.logger.error('Idempotency purge failed', error as Error);
    throw error;
  }
}
```

**Test :** Créer 2000 lignes test, lancer la purge, vérifier que la table n'est pas bloquée pendant l'opération (requête SELECT en parallèle).

---

## Phase 2 — Corrections cron maître (Jour 2)

> Branche suggérée : `fix/auto-message-master`  
> Prérequis : Phase 1 déployée

---

### FIX-5 — Corriger `typingStart/typingStop` — guard provider

**Bug :** M4 — appel Whapi pour tous les canaux → 404 constant pour Messenger → pollue les logs, masque les vraies erreurs  
**Fichier :** `message_whatsapp/src/communication_whapi/communication_whapi.service.ts`  
**Ligne :** 66  
**Complexité :** Très faible  
**Risque de régression :** Aucun

```typescript
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

    // AJOUT : ne rien faire si ce n'est pas un canal Whapi
    if (channel.provider !== 'whapi') return;

    const token = channel.token;
    // ... reste inchangé
  } catch (err) { ... }
}
```

**Résultat immédiat :** Disparition de 100% des erreurs `Whapi typing error 404` dans les logs → visibilité des vraies erreurs restaurée.

---

### FIX-6 — Ajouter LIMIT sur toutes les queries du cron maître

**Bug :** M-cron3 — queries sans LIMIT → N envois séquentiels → surcharge DB → déclenche M0/M1  
**Fichier :** `message_whatsapp/src/jorbs/auto-message-master.job.ts`  
**Lignes :** tous les triggers A, C, D, E, F, G, H, I  
**Complexité :** Faible — ajouter `.limit(N)` sur chaque queryBuilder  
**Risque de régression :** Faible (certaines conversations éligibles attendront le prochain tick)

| Trigger | Description | LIMIT recommandé |
|---------|-------------|-----------------|
| A — Sans réponse | Conversations sans réponse | `.limit(50)` |
| C — Hors horaires | Conversations hors plage | `.limit(100)` |
| D — Réouverture | Conversations réouvertes | `.limit(100)` |
| E — Attente queue | Conversations en attente | `.limit(50)` |
| F — Mot-clé | Conversations récentes | `.limit(30)` (double-requête) |
| G — Type client | Nouvelles conversations | `.limit(100)` |
| H — Inactivité | Conversations inactives | `.limit(50)` |
| I — Après assignation | Conversations assignées | `.limit(100)` |

**Exemple pour TriggerA :**
```typescript
const chats = await this.chatRepo
  .createQueryBuilder('c')
  .leftJoinAndSelect('c.channel', 'channel')
  .where('c.last_client_message_at IS NOT NULL')
  // ... autres conditions
  .limit(50)   // ← AJOUT
  .getMany();
```

**Test :** Créer 200 conversations éligibles, lancer le cron, vérifier que l'exécution dure < 5s et que seules 50 sont traitées par tick.

---

### FIX-7 — Corriger le double envoi si updateTriggerTracking échoue

**Bug :** M-cron4 — message envoyé mais tracking non mis à jour → renvoyé au prochain tick  
**Fichier :** `message_whatsapp/src/message-auto/message-auto.service.ts`  
**Lignes :** 165–219 (`sendAutoMessageForTrigger`)  
**Complexité :** Moyenne  
**Risque de régression :** Faible

**Stratégie :** Mettre à jour le tracking AVANT l'envoi pour rendre l'opération idempotente. Si l'envoi échoue, on peut retenter sans risque de doublon.

```typescript
async sendAutoMessageForTrigger(
  chatId: string,
  trigger: AutoMessageTriggerType,
  step: number,
  options?: { clientTypeTarget?: 'new' | 'returning' | 'all' },
): Promise<void> {
  const chat = await this.chatService.findBychat_id(chatId);
  if (!chat) return;

  if (!chat.last_msg_client_channel_id) {
    throw new Error(`channel manquant pour ${chatId}`);
  }

  const template = await this.getTemplateForTrigger(trigger, step, { ... });
  if (!template) return;

  // ÉTAPE 1 : Marquer comme "en cours" AVANT l'envoi
  // → si le serveur crash entre les deux, au pire le message n'est pas envoyé
  // → mais il ne sera PAS renvoyé en double au prochain tick
  await this.updateTriggerTracking(chatId, trigger, step);

  // ÉTAPE 2 : Tenter l'envoi (best-effort)
  void this.messageService.typingStart(chatId).catch(() => {});
  try {
    const text = this.formatMessageAuto({ ... });
    const message = await this.messageService.createAgentMessage({ ... });
    await this.gateway.notifyAutoMessage(message, chat);
  } catch (err) {
    // Log l'échec mais ne pas re-throw — le tracking est déjà mis à jour
    // → pas de double envoi au prochain tick
    this.logger.error(
      `sendAutoMessageForTrigger: envoi échoué pour ${chatId}: ${(err as Error).message}`,
      undefined,
      MessageAutoService.name,
    );
  } finally {
    void this.messageService.typingStop(chatId).catch(() => {});
  }
}
```

**Test :** Mocker `createAgentMessage` pour lancer une exception, vérifier que le tracking est bien mis à jour et que le message n'est pas renvoyé au tick suivant.

---

## Phase 3 — Corrections orchestrateur auto-message (Jour 3)

> Branche suggérée : `fix/auto-message-orchestrator`  
> S'applique uniquement si `auto-message` (orchestrateur événementiel) est activé en production

---

### FIX-8 — Libérer les conversations bloquées au démarrage

**Bug :** M-cron1 — `read_only: true` mis en DB avant `setTimeout` → redémarrage = lock permanent  
**Fichiers :**  
- `message_whatsapp/src/message-auto/auto-message-orchestrator.service.ts` (ajout `onModuleInit`)  
- `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts` (nouvelle méthode)  
**Complexité :** Faible  
**Risque de régression :** Faible — ne touche que les conversations dans un état impossible (read_only sans auto-message envoyé)

**Dans `WhatsappChatService` :**
```typescript
async resetStaleAutoMessageLocks(): Promise<number> {
  const result = await this.chatRepo.update(
    {
      read_only: true,
      last_auto_message_sent_at: IsNull(),
    },
    { read_only: false },
  );
  return result.affected ?? 0;
}
```

**Dans `AutoMessageOrchestrator.onModuleInit()` :**
```typescript
// Ajouter la méthode onModuleInit
async onModuleInit(): Promise<void> {
  const released = await this.chatService.resetStaleAutoMessageLocks();
  if (released > 0) {
    this.logger.warn(
      `STARTUP: ${released} conversation(s) déverrouillées (read_only bloqué par restart précédent)`,
      AutoMessageOrchestrator.name,
    );
  }
}
```

**Exécution manuelle immédiate :** Le SQL de la Phase 0.2 suffit pour le parc actuel. Ce fix protège les redémarrages futurs.

---

### FIX-9 — Ajouter un timeout sur le lock mémoire de l'orchestrateur

**Bug :** M-cron2 — `this.locks` sans timeout → si `executeAutoMessage` freeze → lock jamais libéré → conversation bloquée  
**Fichier :** `message_whatsapp/src/message-auto/auto-message-orchestrator.service.ts`  
**Complexité :** Faible  
**Risque de régression :** Très faible

Ajouter un timeout de sécurité sur le lock :

```typescript
// Dans handleClientMessage(), remplacer :
this.locks.add(chatId);

// Par :
this.locks.add(chatId);

// Timeout de sécurité : si executeAutoMessage ne se résout pas en 10 min,
// libérer automatiquement le lock
const safetyTimeout = setTimeout(() => {
  if (this.locks.has(chatId)) {
    this.logger.warn(
      `AUTO_MESSAGE_LOCK_TIMEOUT chatId=${chatId} — verrou forcé après 10min`,
      AutoMessageOrchestrator.name,
    );
    this.locks.delete(chatId);
    // Déverrouiller la conversation en DB (best-effort)
    void this.chatService.update(chatId, { read_only: false }).catch(() => {});
  }
}, 10 * 60 * 1000); // 10 minutes

// Annuler ce timeout si le vrai processus se termine avant
// → dans le finally du setTimeout principal, ajouter :
// clearTimeout(safetyTimeout);
```

**Note :** Ce timeout est un filet de sécurité pour les cas de freeze, pas pour le délai normal d'envoi (5–9 min). 10 min couvre largement le cas normal.

---

## Phase 4 — Observabilité (Semaine 1)

> Branche suggérée : `feat/webhook-observability`  
> Ces ajouts ne corrigent pas les bugs mais permettent de les détecter en temps réel.

---

### FIX-10 — Logs structurés au déclenchement du mode dégradé

**Fichier :** `message_whatsapp/src/whapi/webhook-traffic-health.service.ts`  
**Lignes :** 73–83

```typescript
// Remplacer les logs generiques par des logs structurés
if (prevDegraded !== degrade) {
  this.degraded.set(provider, degrade);
  if (degrade) {
    this.logger.warn(
      `BACKPRESSURE_ENABLED provider=${provider} p95=${p95}ms errorRate=${(errorRate*100).toFixed(1)}% samples=${list.length}`,
    );
  } else {
    this.logger.log(
      `BACKPRESSURE_DISABLED provider=${provider} p95=${p95}ms`,
    );
  }
}

if (prevCircuit !== circuit) {
  this.circuitOpen.set(provider, circuit);
  if (circuit) {
    this.logger.error(
      `CIRCUIT_BREAKER_OPEN provider=${provider} errorRate=${(errorRate*100).toFixed(1)}% samples=${list.length}`,
    );
  } else {
    this.logger.warn(
      `CIRCUIT_BREAKER_CLOSED provider=${provider}`,
    );
  }
}
```

**Résultat :** En cherchant `CIRCUIT_BREAKER_OPEN` dans les logs, on peut corréler exactement les gaps de réception avec les ouvertures de circuit.

---

### FIX-11 — Log du dernier webhook reçu par provider (détection de gap)

**Fichier :** `message_whatsapp/src/whapi/webhook-metrics.service.ts`

Ajouter un tracker du dernier webhook reçu :

```typescript
private readonly lastReceivedAt = new Map<string, number>();

recordReceived(provider: string, tenantId: string): void {
  this.lastReceivedAt.set(provider, Date.now()); // ← AJOUT
  // ... reste inchangé
}

getLastReceivedAt(provider: string): number | undefined {
  return this.lastReceivedAt.get(provider);
}

getGapSeconds(provider: string): number | null {
  const last = this.lastReceivedAt.get(provider);
  if (!last) return null;
  return Math.floor((Date.now() - last) / 1000);
}
```

Exposer via l'endpoint `/webhooks/metrics` existant (ou un endpoint admin dédié) pour monitoring.

---

### FIX-12 — Log résumé d'exécution du cron maître

**Fichier :** `message_whatsapp/src/jorbs/auto-message-master.job.ts`

Ajouter un résumé en fin de `run()` :

```typescript
async run(): Promise<void> {
  const runStart = Date.now();
  // ... exécution des triggers (inchangée)

  const durationMs = Date.now() - runStart;
  this.logger.log(
    `AutoMessageMasterJob completed duration=${durationMs}ms`,
    AutoMessageMasterJob.name,
  );

  // Alerter si le cron dure plus de 30s (signe de surcharge DB)
  if (durationMs > 30_000) {
    this.logger.warn(
      `AutoMessageMasterJob SLOW run duration=${durationMs}ms — risque de surcharge DB`,
      AutoMessageMasterJob.name,
    );
  }
}
```

---

## Phase 5 — Renforcements secondaires (Semaine 2)

> Branche suggérée : `feat/webhook-hardening`

---

### FIX-13 — Timeout sur le mutex `runExclusive` inbound

**Bug :** M5 — mutex sans timeout → si DB freeze → webhook bloqué indéfiniment  
**Fichier :** `message_whatsapp/src/webhooks/inbound-message.service.ts`

```typescript
import { withTimeout } from 'async-mutex';

private getChatMutex(chatId: string): Mutex {
  let mutex = this.chatMutexes.get(chatId);
  if (!mutex) {
    // Timeout de 30s : si le traitement ne se termine pas, lever une erreur
    mutex = withTimeout(new Mutex(), 30_000);
    this.chatMutexes.set(chatId, mutex);
  }
  return mutex;
}
```

---

### FIX-14 — Traiter tous les entries d'un webhook Messenger

**Bug :** M3b — seul `entry[0]` est utilisé pour résoudre le canal  
**Fichier :** `message_whatsapp/src/whapi/whapi.controller.ts`  
**Complexité :** Moyenne — nécessite de comprendre si Meta envoie réellement des batches multi-pages

**Analyse préalable :** Vérifier dans les logs si des payloads Messenger ont déjà eu `entry.length > 1` :
```bash
# Les logs n'ont pas cette info directement — ajouter temporairement un log :
this.logger.debug(`Messenger entries count: ${messengerPayload.entry?.length}`);
```

Si `entry.length > 1` n'est jamais observé en production, ce fix peut être déprioritisé.

---

### FIX-15 — Alerte proactive sur les canaux sans meta_app_secret

**Bug :** M3 — canal sans secret en DB → 401 → Meta abandonne  
**Fichier :** Nouveau job de vérification ou vérification au démarrage

Ajouter dans un service d'initialisation :

```typescript
// Au démarrage, log d'alerte pour chaque canal sans secret configuré
async checkChannelSecrets(): Promise<void> {
  const unsecured = await this.channelRepo.find({
    where: [
      { provider: 'messenger', meta_app_secret: IsNull() },
      { provider: 'meta', meta_app_secret: IsNull() },
    ],
  });
  for (const ch of unsecured) {
    this.logger.error(
      `CHANNEL_NO_SECRET provider=${ch.provider} channel_id=${ch.channel_id} — les webhooks retourneront 401 en production`,
    );
  }
}
```

---

## Récapitulatif des fichiers modifiés

| Phase | Fix | Fichier | Lignes | Complexité |
|-------|-----|---------|--------|------------|
| 1 | FIX-1 | `whapi.controller.ts` | ~260–280 | Faible |
| 1 | FIX-2 | `webhook-degraded-queue.service.ts` | 10–11 | Très faible |
| 1 | FIX-3 | `webhook-traffic-health.service.ts` | 60 | Très faible |
| 1 | FIX-4 | `webhook-idempotency-purge.service.ts` | 41–65 | Faible |
| 2 | FIX-5 | `communication_whapi.service.ts` | 66–110 | Très faible |
| 2 | FIX-6 | `auto-message-master.job.ts` | tous triggers | Faible |
| 2 | FIX-7 | `message-auto.service.ts` | 165–219 | Moyenne |
| 3 | FIX-8 | `auto-message-orchestrator.service.ts` + `whatsapp_chat.service.ts` | onModuleInit | Faible |
| 3 | FIX-9 | `auto-message-orchestrator.service.ts` | ~106–170 | Faible |
| 4 | FIX-10 | `webhook-traffic-health.service.ts` | 73–83 | Très faible |
| 4 | FIX-11 | `webhook-metrics.service.ts` | + méthodes | Très faible |
| 4 | FIX-12 | `auto-message-master.job.ts` | run() | Très faible |
| 5 | FIX-13 | `inbound-message.service.ts` | getChatMutex | Très faible |
| 5 | FIX-14 | `whapi.controller.ts` | handleMessengerWebhook | Moyenne |
| 5 | FIX-15 | nouveau service | onModuleInit | Faible |

---

## Impact attendu par phase

| Phase | Avant | Après |
|-------|-------|-------|
| Phase 1 | Gaps 9+ min plusieurs fois/h (M0 Messenger direct 503) | Circuit Messenger protégé par queue dégradée ; purge sans lock |
| Phase 2 | Erreurs 404 dans les logs ; cron surcharge DB | Logs propres ; cron limité à 50 chats/trigger/tick |
| Phase 3 | Conversations bloquées read_only après restart | Déverrouillage automatique au boot |
| Phase 4 | Impossible de savoir quand un circuit s'ouvre | Logs `CIRCUIT_BREAKER_OPEN` corrélables aux gaps |
| Phase 5 | Mutex pouvant bloquer ∞ ; batches partiellement perdus | Timeout 30s sur mutex ; détection canaux sans secret |

---

## Ordre de déploiement recommandé

```
1. Phase 0 : vérifications SQL → aujourd'hui, corrige read_only bloqués immédiatement
2. FIX-2 + FIX-3 : changer 3 constantes → commit trivial, déployable maintenant
3. FIX-1 + FIX-4 : logique dégradée Messenger + purge par lots → PR prioritaire
4. FIX-5 : guard provider typing → élimine les 404 → plus de bruit dans les logs
5. FIX-6 + FIX-7 : cron maître → limits + idempotence
6. FIX-8 + FIX-9 : orchestrateur → lock safety
7. Phase 4 : observabilité → avant de monitorer les résultats
8. Phase 5 : renforcements mineurs
```

---

*Plan basé sur `RAPPORT_PERTE_MESSAGES.md` — commit `7600907` — 2026-04-12*
