# Backlog d'implémentation Redis
**Projet :** WhatsApp Platform  
**Date :** 2026-05-07  
**Source :** PLAN_REDIS_FLUIDITE_REQUETES.md  
**Total tickets :** 20

---

## Légende

| Symbole | Signification |
|---------|--------------|
| `[P0]` | Critique — bloquer le sprint suivant si non fait |
| `[P1]` | Haute priorité — dans le sprint en cours |
| `[P2]` | Important — sprint suivant |
| `[P3]` | Valeur ajoutée — planifié |
| `[P4]` | Multi-instance — requis pour le scaling |
| `[P5]` | Observabilité — parallélisable |
| `XS` `S` `M` `L` `XL` | Estimation effort (XS < 1h · S < 4h · M < 1j · L < 3j · XL > 3j) |

---

## Groupe A — Infrastructure Redis

> Fondations. Aucun autre ticket ne doit être démarré sans A-01 et A-02.

---

### [A-01] · [P0] · Corriger la politique mémoire Redis
**Sprint :** 1 · **Estimation :** XS

**Contexte**  
Redis utilise `allkeys-lru` qui peut évincer des clés BullMQ sous pression mémoire. Les jobs disparaissent sans erreur visible.

**Points d'implémentation**
- [ ] Ouvrir `docker-compose.yml`
- [ ] Remplacer `--maxmemory-policy allkeys-lru` par `--maxmemory-policy noeviction`
- [ ] Vérifier que `--maxmemory` est défini (si absent, Redis s'étend sans limite)
- [ ] Documenter la valeur `maxmemory` choisie dans le `.env` ou le compose
- [ ] Redémarrer le service Redis et vérifier avec `redis-cli CONFIG GET maxmemory-policy`

**Critères d'acceptation**
- `redis-cli CONFIG GET maxmemory-policy` retourne `noeviction`
- `evicted_keys` reste à `0` après 10 minutes en charge normale
- Les jobs BullMQ ne disparaissent plus silencieusement

**Rollback**  
Remettre `allkeys-lru` dans le compose et redémarrer Redis. Aucun impact applicatif immédiat.

---

### [A-02] · [P0] · Sécuriser Redis
**Sprint :** 1 · **Estimation :** S

**Contexte**  
Redis est accessible sans authentification. Le port `6379` peut être exposé selon la configuration réseau Docker.

**Points d'implémentation**
- [ ] Ajouter `REDIS_PASSWORD=<valeur-forte>` dans `.env` production
- [ ] Ajouter `--requirepass ${REDIS_PASSWORD}` dans `docker-compose.yml`
- [ ] Mettre à jour `redis.module.ts` pour passer `password: process.env.REDIS_PASSWORD || undefined`
- [ ] Mettre à jour `queue.module.ts` pour passer `password` dans la connexion BullMQ
- [ ] Mettre à jour le `afterInit()` du gateway Socket.IO pour passer `password` aux clients pub/sub
- [ ] Vérifier que le port `6379` n'est pas exposé en dehors du réseau Docker interne (`ports:` retiré ou restreint à `127.0.0.1`)
- [ ] Tester la connexion : `redis-cli -a <password> ping`

**Critères d'acceptation**
- `redis-cli ping` sans password retourne `NOAUTH`
- Le backend démarre et se connecte sans erreur
- BullMQ traite un job de test avec succès
- Socket.IO émet un événement de test avec succès

**Rollback**  
Retirer `requirepass` du compose et vider le champ password dans le code. Redémarrer Redis.

---

### [A-03] · [P0] · Ajouter les préfixes Redis par usage
**Sprint :** 1 · **Estimation :** S

**Contexte**  
Sans préfixes, les clés de local, staging et production se mélangent si le même Redis est partagé. Le debug via `SCAN` est impossible.

**Points d'implémentation**
- [ ] Ajouter dans `.env` :
  ```
  REDIS_KEY_PREFIX=whatsapp:prod:
  BULLMQ_PREFIX=whatsapp:prod:bull
  SOCKET_IO_REDIS_PREFIX=whatsapp:prod:socket
  ```
- [ ] Dans `redis.module.ts` : ajouter `keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'wapp:'` à l'options ioredis
- [ ] Dans `queue.module.ts` : ajouter `prefix: process.env.BULLMQ_PREFIX ?? '{wapp:bull}'` dans `forRootAsync`
- [ ] Dans `whatsapp_message.gateway.ts` : passer le préfixe `keyPrefix` aux clients `pubClient` et `subClient` de l'adapter
- [ ] Vérifier avec `redis-cli KEYS whatsapp:prod:*` que les clés sont bien préfixées
- [ ] Mettre à jour les `.env.example` et `.env.local`

**Critères d'acceptation**
- `KEYS *` ne retourne que des clés préfixées par l'env courant
- Les queues BullMQ apparaissent sous `whatsapp:prod:bull:*`
- Aucun conflit avec un autre environnement sur le même Redis

**Rollback**  
Retirer les préfixes du code et du compose. Nettoyer les clés orphelines avec `SCAN` + `DEL`.

---

### [A-04] · [P0] · Monitoring mémoire et connexions Redis
**Sprint :** 1 · **Estimation :** S

**Contexte**  
Après passage à `noeviction`, la pression mémoire se traduit en erreurs d'écriture. Sans monitoring, ces erreurs sont silencieuses.

**Points d'implémentation**
- [ ] Identifier le fichier `system-health.controller.ts`
- [ ] Ajouter une méthode `getRedisInfo()` dans le service health qui appelle `redis.info('memory')`, `redis.info('clients')`, `redis.info('stats')`
- [ ] Parser et exposer dans la réponse :
  - `used_memory_human`
  - `maxmemory` et `maxmemory_policy`
  - `mem_fragmentation_ratio`
  - `connected_clients` / `blocked_clients` / `maxclients`
  - `rejected_connections`
  - `evicted_keys` / `expired_keys`
- [ ] Ajouter la latence Redis via `redis.ping()` chronométré
- [ ] Ajouter un statut `redis_adapter_active: boolean` reflétant si l'adapter Socket.IO est initialisé
- [ ] Protéger l'endpoint avec `AdminGuard`
- [ ] Ajouter des seuils d'alerte dans la réponse (`warnings: string[]`) :
  - `evicted_keys > 0`
  - `rejected_connections > 0`
  - `used_memory / maxmemory > 80%`

**Critères d'acceptation**
- `GET /system-health` retourne les métriques Redis
- `evicted_keys > 0` déclenche un warning dans la réponse
- La latence Redis est mesurée en millisecondes

**Rollback**  
L'endpoint est additif — le supprimer n'a aucun impact.

---

## Groupe B — Rate Limiting Distribué

> Rend les protections cohérentes entre plusieurs instances backend.

---

### [B-01] · [P1] · Rate limiting WebSocket via Redis
**Sprint :** 2 · **Estimation :** M · **Feature flag :** `REDIS_SOCKET_THROTTLE_ENABLED`

**Contexte**  
`SocketThrottleGuard` utilise un `Map` en mémoire locale. En multi-instance, un client peut multiplier ses requêtes en changeant d'instance.

**Points d'implémentation**
- [ ] Ajouter `REDIS_SOCKET_THROTTLE_ENABLED=false` dans `.env`
- [ ] Injecter `REDIS_CLIENT` dans `SocketThrottleGuard`
- [ ] Remplacer le `Map` local par `redis.incr(key)` + `redis.expire(key, windowSec)` si flag activé
- [ ] Clés : `throttle:socket:{commercialId}:{event}` · TTL = fenêtre de limitation
- [ ] Utiliser `pipeline()` pour grouper `INCR` + `EXPIRE` en une seule aller-retour Redis
- [ ] Garder le fallback `Map` si `REDIS_CLIENT === null` ou si flag désactivé
- [ ] Appliquer sur les 6 events limités : `message:send`, `messages:get`, `conversations:get`, `chat:event`, `messages:read`, `contacts:get`
- [ ] Nettoyer le cron de cleanup des buckets locaux (inutile si Redis actif)
- [ ] Tester : simuler 11 `message:send` en 10s → vérifier `RATE_LIMITED` au 11ème

**Critères d'acceptation**
- Avec flag activé : la limite est partagée entre deux instances backend démarrées
- Avec `REDIS_SOCKET_THROTTLE_ENABLED=false` : comportement identique à l'existant
- Latence ajoutée par la vérification Redis < 2ms (pipeline)

**Rollback**  
`REDIS_SOCKET_THROTTLE_ENABLED=false` → retour immédiat au `Map` local.

---

### [B-02] · [P1] · Rate limiting webhooks via Redis
**Sprint :** 2 · **Estimation :** M · **Feature flag :** `REDIS_WEBHOOK_RATE_LIMIT_ENABLED`

**Contexte**  
`WebhookRateLimitService` stocke les compteurs en mémoire. Ils disparaissent au redémarrage et ne sont pas partagés entre instances.

**Points d'implémentation**
- [ ] Ajouter `REDIS_WEBHOOK_RATE_LIMIT_ENABLED=false` dans `.env`
- [ ] Injecter `REDIS_CLIENT` dans `WebhookRateLimitService`
- [ ] Migrer les 4 compteurs vers Redis si flag activé :
  - `rate:webhook:global` · TTL = fenêtre globale
  - `rate:webhook:provider:{provider}`
  - `rate:webhook:ip:{ip}`
  - `rate:webhook:tenant:{tenantId}`
- [ ] Utiliser `INCR + EXPIRE` (même pattern que B-01)
- [ ] Garder le fallback `Map` si flag désactivé ou Redis absent
- [ ] Tester : simuler un flood sur `/webhook` → vérifier que le quota est respecté après redémarrage

**Critères d'acceptation**
- Après redémarrage du backend, le compteur de rate limit est préservé
- Les quotas sont cohérents entre deux instances
- `REDIS_WEBHOOK_RATE_LIMIT_ENABLED=false` préserve l'ancien comportement

**Rollback**  
`REDIS_WEBHOOK_RATE_LIMIT_ENABLED=false`.

---

### [B-03] · [P1] · Anti-doublon envoi agent via Redis
**Sprint :** 2 · **Estimation :** M · **Feature flag :** `REDIS_SEND_DEDUPE_ENABLED`

**Contexte**  
`recentTempIds` et `pendingAgentMessages` sont en mémoire locale dans le gateway. En multi-instance, un doublon peut passer si deux requêtes arrivent sur deux backends différents.

**Points d'implémentation**
- [ ] Ajouter `REDIS_SEND_DEDUPE_ENABLED=false` dans `.env`
- [ ] Injecter `REDIS_CLIENT` dans le gateway ou créer un `SendDedupeService`
- [ ] Implémenter la vérification d'idempotence via `SET key value NX EX ttl` :
  - `dedupe:send:temp:{tempId}` · TTL `30s`
  - `dedupe:send:text:{chatId}:{sha256(text)}` · TTL `5s`
- [ ] Si `SET NX` retourne `null` → doublon détecté → retourner un ACK sans renvoi
- [ ] Garder le fallback `Set` / `Map` local si flag désactivé ou Redis absent
- [ ] Logger les doublons détectés (warn level)
- [ ] Tester : envoyer le même `tempId` depuis deux connexions différentes → vérifier qu'un seul message arrive chez le destinataire

**Critères d'acceptation**
- Un même `tempId` ne déclenche qu'un seul appel provider
- Un doublon texte dans les 5s ne déclenche pas de second envoi
- En cas de Redis indisponible, le fallback mémoire prend le relai

**Rollback**  
`REDIS_SEND_DEDUPE_ENABLED=false`.

---

## Groupe C — Socket.IO Temps Réel

---

### [C-01] · [P1] · Fiabiliser l'adapter Redis Socket.IO
**Sprint :** 1 · **Estimation :** S

**Contexte**  
L'adapter Redis est configuré dans `afterInit()` mais les clients pub/sub ne sont pas explicitement attendus avant l'activation. En multi-instance, un broadcast peut échouer silencieusement si l'adapter n'est pas prêt.

**Points d'implémentation**
- [ ] Dans `whatsapp_message.gateway.ts`, refactorer `afterInit()` :
  - Créer `pubClient` et `subClient` comme instances ioredis dédiées (séparées du client cache)
  - Passer password si `REDIS_PASSWORD` défini
  - Attendre explicitement l'événement `ready` sur les deux clients avant `server.adapter(...)`
  - Logger `[Gateway] Redis adapter actif — mode multi-instance` ou `[Gateway] Redis adapter non disponible — mode mono-instance`
- [ ] Stocker un flag `adapterActive: boolean` dans `RealtimeServerService`
- [ ] Exposer ce flag dans `GET /system-health` (voir A-04)
- [ ] En cas d'erreur pendant l'init de l'adapter : logger `warn` et continuer en mode local (ne pas crasher)
- [ ] Tester en lançant deux instances : émettre un event depuis l'instance A, vérifier réception chez un client connecté sur l'instance B

**Critères d'acceptation**
- `GET /system-health` indique `redis_adapter_active: true` quand Redis est disponible
- Un event émis depuis l'instance A atteint les clients de l'instance B
- Si Redis est down, le gateway démarre sans planter (dégradation gracieuse)

**Rollback**  
Revenir à l'implémentation `afterInit()` existante sans await ready.

---

## Groupe D — BullMQ Fiabilisation

> Rendre les jobs résistants aux redémarrages et aux erreurs partielles.

---

### [D-01] · [P2] · Queue outbound-webhook-delivery (migration setTimeout → BullMQ)
**Sprint :** 2 · **Estimation :** L · **Feature flag :** `BULLMQ_OUTBOUND_WEBHOOK_ENABLED`

**Contexte**  
`OutboundWebhookService.deliverWithRetry()` utilise `setTimeout` pour les retries. Ces timers disparaissent au redémarrage du process — les webhooks sortants ne sont pas rejoués.

**Points d'implémentation**
- [ ] Créer la constante `OUTBOUND_WEBHOOK_QUEUE = 'outbound-webhook-delivery'`
- [ ] Enregistrer la queue dans `queue.module.ts` (retirer le doublon BROADCAST_QUEUE au passage)
- [ ] Créer `OutboundWebhookWorker` (`@Processor`) avec concurrence configurable via `OUTBOUND_WEBHOOK_CONCURRENCY`
- [ ] Le worker appelle la logique de livraison HTTP existante
- [ ] Configurer : attempts = max_retries existant, backoff exponentiel 2s, `removeOnComplete: { count: 500, age: 86400 }`, `removeOnFail: { count: 2000, age: 604800 }`
- [ ] Dans `OutboundWebhookService` : si `BULLMQ_OUTBOUND_WEBHOOK_ENABLED=true`, enqueuer le job au lieu d'appeler `setTimeout`
- [ ] Garder l'ancien chemin `setTimeout` derrière le flag désactivé
- [ ] Ajouter les exports dans le module outbound-webhook
- [ ] Tester : créer un webhook sortant, couper le destinataire, redémarrer le backend → vérifier que le retry repart

**Critères d'acceptation**
- Les retries survivent au redémarrage du container
- `GET /admin/queue-stats` montre les jobs `outbound-webhook-delivery`
- `BULLMQ_OUTBOUND_WEBHOOK_ENABLED=false` préserve l'ancien comportement

**Rollback**  
`BULLMQ_OUTBOUND_WEBHOOK_ENABLED=false` → retour immédiat aux `setTimeout`.

---

### [D-02] · [P2] · Graceful shutdown des workers BullMQ
**Sprint :** 3 · **Estimation :** M

**Contexte**  
Quand Docker envoie `SIGTERM`, les jobs `active` sont interrompus et marqués `stalled`. BullMQ les relance au prochain démarrage, mais les effets partiels (message envoyé sans compteur, webhook livré sans log) créent des incohérences.

**Points d'implémentation**
- [ ] Créer un `BullMQShutdownService` injectable avec `implements OnApplicationShutdown`
- [ ] Injecter les workers : `WebhookWorker`, `BroadcastWorker`, `SentimentWorker`, `OutboundWebhookWorker` (quand créé)
- [ ] Implémenter `onApplicationShutdown(signal)` :
  - Logger les workers en cours de fermeture
  - Appeler `worker.close()` sur chaque worker
  - Attendre avec `Promise.allSettled()`
  - Logger les workers encore actifs au moment du shutdown
- [ ] Configurer un timeout de shutdown Docker < grace period (`stop_grace_period` dans compose)
- [ ] Rendre le job broadcast idempotent : vérifier `alreadySent` avant chaque envoi destinataire (clé `dedupe:broadcast:{broadcastId}:{recipientId}` TTL 24h)
- [ ] Rendre le job webhook sortant idempotent : vérifier un log de livraison en DB avant retry
- [ ] Tester : démarrer un broadcast, tuer le container en cours de traitement, redémarrer → vérifier que les destinataires non traités sont rejoués sans doubler les envoyés

**Critères d'acceptation**
- Les logs indiquent "workers closed" avant l'arrêt du process
- Aucun message doublon après redémarrage pendant un broadcast actif
- `stop_grace_period` dans compose ≥ timeout de shutdown applicatif

**Rollback**  
Supprimer `BullMQShutdownService` des imports. Les workers continuent de s'interrompre brusquement comme avant.

---

### [D-03] · [P2] · Dead Letter Queue
**Sprint :** 3 · **Estimation :** M

**Contexte**  
Les jobs définitivement échoués (après N tentatives) disparaissent dans `failed` sans possibilité de replay structuré ni d'alerte claire.

**Points d'implémentation**
- [ ] Créer la constante `DEAD_LETTER_QUEUE = 'dead-letter'`
- [ ] Enregistrer la queue dans `queue.module.ts`
- [ ] Définir l'interface `DeadLetterPayload` : `{ originalQueue, originalJobId, payload, error, failedAt, attemptsMade }`
- [ ] Dans chaque worker (`WebhookWorker`, `BroadcastWorker`, `SentimentWorker`, `OutboundWebhookWorker`) :
  - Dans le `catch` final, vérifier `job.attemptsMade >= job.opts.attempts - 1`
  - Si oui : enqueuer dans `dead-letter` avec le payload complet
- [ ] Créer un endpoint `GET /admin/dead-letter` qui liste les jobs avec pagination
- [ ] Créer un endpoint `POST /admin/dead-letter/:jobId/replay` qui ré-enqueue le job dans sa queue d'origine
- [ ] Protéger les deux endpoints avec `AdminGuard`
- [ ] Configurer `removeOnFail: { count: 0 }` sur la DLQ (garder indéfiniment jusqu'à traitement manuel)

**Critères d'acceptation**
- Un job échouant 3 fois apparaît dans `GET /admin/dead-letter`
- `POST /admin/dead-letter/:id/replay` ré-enqueue le job et le supprime de la DLQ
- Le payload original est intact dans la DLQ

**Rollback**  
Supprimer l'enqueue DLQ dans les workers. Les jobs restent dans `failed` comme avant.

---

### [D-04] · [P4] · FlowBot — Remplacer les scans cron par delayed jobs
**Sprint :** 4 · **Estimation :** XL · **Feature flag :** `BULLMQ_FLOWBOT_DELAYED_ENABLED`

**Contexte**  
`flow-polling.job.ts` scanne périodiquement la base pour trouver les sessions en attente. Plus le volume augmente, plus ces scans coûtent. Un delayed job ciblé est plus précis et moins gourmand.

**Points d'implémentation**
- [ ] Créer la constante `FLOWBOT_DELAYED_QUEUE = 'flowbot-delayed'`
- [ ] Enregistrer la queue dans le module flowbot
- [ ] Créer `FlowbotDelayedWorker` avec les handlers :
  - `resume-waiting-delay`
  - `no-response-check`
  - `queue-wait-check`
  - `inactivity-check`
- [ ] À chaque entrée d'une session FlowBot en état d'attente : si flag activé, créer un job delayed avec `delay = targetTimestamp - Date.now()`
- [ ] Dans chaque handler : vérifier que la session est toujours en attente avant de traiter (idempotence)
- [ ] Garder les crons existants désactivés par flag (ne pas les supprimer immédiatement)
- [ ] Tester sur un environnement de staging avec volume simulé

**Critères d'acceptation**
- Les sessions FlowBot en attente reprennent dans la fenêtre de 1-2s attendue
- Aucun scan SQL périodique pour les sessions couvertes par les delayed jobs
- `BULLMQ_FLOWBOT_DELAYED_ENABLED=false` repart sur les crons existants

**Rollback**  
`BULLMQ_FLOWBOT_DELAYED_ENABLED=false` → les crons reprennent. Les delayed jobs déjà créés s'exécutent mais n'ont pas d'effet (sessions traitées).

---

## Groupe E — Cache Applicatif

---

### [E-01] · [P3] · Cache system_config
**Sprint :** 2 · **Estimation :** S

**Contexte**  
`SystemConfigService` est appelé à chaque opération de dispatch et à chaque webhook. Les paramètres système changent rarement.

**Points d'implémentation**
- [ ] Dans `SystemConfigService.get(key)` : vérifier `redis.get('config:{key}')` avant la DB
- [ ] Si Redis miss : charger depuis DB et stocker `redis.setex('config:{key}', TTL, value)` · TTL = 60s à 300s selon la clé
- [ ] Dans `SystemConfigService.set(key, value)` : après écriture DB, appeler `redis.del('config:{key}')` (invalidation write-through)
- [ ] Si Redis absent : fallback DB direct sans erreur
- [ ] Créer un endpoint admin `POST /admin/system-config/flush-cache` pour invalidation manuelle

**Critères d'acceptation**
- Un appel `get(key)` après une mise en cache ne génère pas de requête SQL (vérifiable via logs QueryBuilder)
- Une mise à jour via `set(key)` invalide le cache immédiatement
- Sans Redis : comportement identique à l'existant

**Rollback**  
Supprimer les appels Redis dans `SystemConfigService`. Purement additif.

---

### [E-02] · [P3] · Cache channels et templates
**Sprint :** 5 · **Estimation :** M

**Contexte**  
Chaque webhook entrant résout le channel (par `channel_id` ou `external_id`) et charge souvent le template associé. Ces données changent rarement.

**Points d'implémentation**
- [ ] Dans `ChannelService` : ajouter cache `channel:id:{channelId}` · TTL 120s
- [ ] Dans `ChannelService` : ajouter cache `channel:external:{provider}:{externalId}` · TTL 120s
- [ ] Dans `WhatsappTemplateService.findOne()` : ajouter cache `template:id:{templateId}` · TTL 300s
- [ ] Dans `ChannelService.getPostededicatedChannels(posteId)` : ajouter cache `poste:dedicated_channels:{posteId}` · TTL 60s
- [ ] Invalidation après `updateChannel()` / `deleteChannel()` / `updateTemplate()`
- [ ] Fallback DB si Redis absent

**Critères d'acceptation**
- Un webhook traitant 100 messages consécutifs sur le même canal ne génère qu'une seule requête SQL channel
- L'invalidation après modification admin est immédiate
- Le cache ne sert jamais un channel supprimé

**Rollback**  
Supprimer les appels cache dans les services. Purement additif.

---

### [E-03] · [P3] · Cache listes socket (conversations, contacts, queue)
**Sprint :** 5 · **Estimation :** M

**Contexte**  
Plusieurs agents sur le même poste demandent `conversations:get` simultanément. Chaque appel génère une requête SQL complète.

**Points d'implémentation**
- [ ] Créer un `SocketListCacheService` injectable
- [ ] Implémenter cache `socket:conversations:{posteId}:{cursorHash}` · **TTL 2s maximum**
- [ ] Implémenter cache `socket:contacts:{posteId}` · TTL 10s
- [ ] Implémenter cache `queue:positions` · TTL 3s
- [ ] Invalider `socket:conversations:{posteId}:*` via `SCAN` + `DEL` après tout `CONVERSATION_UPSERT` ou `CONVERSATION_ASSIGNED`
- [ ] Ne jamais cacher si `REDIS_CLIENT === null`
- [ ] Logger un warning si le TTL paramétré dépasse 3s pour les conversations

**Critères d'acceptation**
- 10 agents demandant `conversations:get` simultanément → 1 seule requête SQL dans la fenêtre de 2s
- Après un message entrant, le cache est invalidé et la prochaine requête recharge depuis DB
- TTL conversations ne peut pas dépasser 3s (validé en code)

**Rollback**  
Désactiver `SocketListCacheService`. Les handlers reviennent aux requêtes SQL directes.

---

## Groupe F — Coordination Multi-instance

---

### [F-01] · [P4] · Redlock sur QueueService dispatcher
**Sprint :** 4 · **Estimation :** L

**Contexte**  
`QueueService` gère la file d'attente des postes. En multi-instance, plusieurs backends peuvent modifier simultanément la queue et créer des positions dupliquées ou des désynchronisations.

**Points d'implémentation**
- [ ] Injecter `DistributedLockService` dans `QueueService`
- [ ] Identifier les 7 opérations à protéger : `addPosteToQueue`, `removeFromQueue`, `getNextInQueue`, `moveToEnd`, `fillQueueWithAllPostes`, `syncQueueWithActivePostes`, `resetQueueState`
- [ ] Envelopper chaque opération dans `lockService.withLock('lock:dispatcher:queue', 5000, handler)` · TTL 5s
- [ ] Pour les opérations poste-spécifiques, utiliser `lock:dispatcher:poste:{posteId}` pour réduire la contention
- [ ] Mesurer l'impact latence : logguer si l'acquisition du lock dépasse 100ms
- [ ] Tester avec deux instances modifiant la queue simultanément → vérifier cohérence

**Critères d'acceptation**
- Deux instances ne peuvent pas modifier la queue simultanément
- Aucune position dupliquée après 1000 opérations concurrentes simulées
- Latence moyenne d'acquisition du lock < 20ms

**Rollback**  
Supprimer les appels `withLock` autour des opérations. Retour aux mutex locaux.

---

### [F-02] · [P4] · Redlock sur les crons critiques
**Sprint :** 4 · **Estimation :** M

**Contexte**  
En multi-instance, plusieurs backends exécutent les mêmes crons simultanément. Cela génère des doubles traitements, une charge DB inutile, et des comportements imprévisibles.

**Points d'implémentation**
- [ ] Lister les 6 crons à protéger :
  - `WindowRotationService` (déjà partiellement protégé — vérifier)
  - `ValidationEngineService` (validation horaire)
  - `FollowUpReminderService`
  - `OrderCallSyncJob`
  - `FlowPollingJob` (tant qu'il n'est pas migré via D-04)
  - Purge outbox (si existante)
- [ ] Pour chaque cron : envelopper le handler dans `lockService.tryWithLock('cron:{jobName}', ttl, handler)`
- [ ] TTL = durée max raisonnable du cron × 1.5 (ex : cron 30s → TTL 45s)
- [ ] Logger `LOCK_SKIPPED` quand une instance ne peut pas acquérir le lock
- [ ] Vérifier que `WindowRotationService` utilise bien le pattern `tryWithLock` et pas `withLock`

**Critères d'acceptation**
- Sur deux instances, le cron ne s'exécute que sur une seule à chaque tick
- Les logs montrent `LOCK_SKIPPED` sur l'instance non-élue
- Aucun double traitement en base après 30 minutes avec deux instances actives

**Rollback**  
Supprimer les `tryWithLock` autour des crons. Les doubles exécutions reprennent.

---

### [F-03] · [P4] · Présence agents dans Redis + keyspace notifications
**Sprint :** 4 · **Estimation :** L · **Feature flag :** `REDIS_PRESENCE_ENABLED`

**Contexte**  
La présence des agents est stockée uniquement en mémoire socket locale. En multi-instance, une instance ne connaît pas les agents connectés sur les autres.

**Points d'implémentation**
- [ ] Ajouter `REDIS_PRESENCE_ENABLED=false` dans `.env`
- [ ] Créer `AgentPresenceService` avec :
  - `setPresent(commercialId, posteId, tenantId)` → `redis.setex('presence:commercial:{id}', 45, JSON.stringify({posteId, tenantId}))`
  - `setPresent` pour poste : `redis.setex('presence:poste:{id}', 45, '1')`
  - `refresh(commercialId)` → renouveler le TTL (heartbeat toutes les 20s)
  - `isPresent(commercialId)` → `redis.exists('presence:commercial:{id}')`
  - `getPresentAgents(tenantId)` → `SCAN presence:commercial:*` + filtrer par tenantId
- [ ] Appeler `setPresent` à la connexion socket et `refresh` sur heartbeat
- [ ] Activer les keyspace notifications Redis avec `notify-keyspace-events Ex` (expiration only)
- [ ] Créer un subscriber sur `__keyevent@0__:expired` qui filtre les clés `presence:*` :
  - Émettre un événement interne `agent.disconnected`
  - Déclencher une reconciliation douce de la queue dispatcher
- [ ] Ajouter un job de réconciliation périodique faible fréquence (toutes les 5 min) comme filet de sécurité
- [ ] Exposer `GET /admin/agents/online` → liste des agents présents depuis Redis

**Critères d'acceptation**
- Un agent connecté sur l'instance A est visible depuis l'instance B via `isPresent()`
- La déconnexion d'un agent est détectée dans les 45-50s (TTL expiry)
- `REDIS_PRESENCE_ENABLED=false` préserve l'ancien comportement mémoire locale

**Rollback**  
`REDIS_PRESENCE_ENABLED=false`. Désabonner le subscriber keyspace.

---

## Groupe G — Monitoring & Observabilité

---

### [G-01] · [P5] · Endpoint /admin/queue-stats
**Sprint :** 3 · **Estimation :** S

**Contexte**  
Aucune visibilité sur l'état des queues BullMQ en production.

**Points d'implémentation**
- [ ] Créer `QueueStatsController` protégé par `AdminGuard`
- [ ] Injecter les queues via `@InjectQueue` pour chaque queue enregistrée
- [ ] Implémenter `GET /admin/queue-stats` retournant pour chaque queue :
  ```json
  {
    "webhook-processing": { "waiting": 0, "active": 0, "completed": 0, "failed": 0, "delayed": 0, "paused": false },
    "broadcast-sending": { ... },
    "sentiment-analysis": { ... },
    "outbound-webhook-delivery": { ... },
    "dead-letter": { ... }
  }
  ```
- [ ] Utiliser `queue.getJobCounts()` + `queue.isPaused()`
- [ ] Ajouter les queues au fur et à mesure qu'elles sont créées (D-01, D-03, D-04)

**Critères d'acceptation**
- L'endpoint retourne des données réelles (non mockées)
- Accessible uniquement avec un token admin valide
- Latence < 100ms (appels parallèles avec `Promise.all`)

**Rollback**  
Supprimer le contrôleur. Aucun impact.

---

### [G-02] · [P5] · Bull Board UI
**Sprint :** 3 · **Estimation :** M

**Contexte**  
Les admins ne peuvent pas visualiser, diagnostiquer ou rejouer les jobs sans accès Redis CLI.

**Points d'implémentation**
- [ ] Installer `@bull-board/nestjs` et `@bull-board/ui`
- [ ] Créer un module `BullBoardModule` dans `src/admin/`
- [ ] Enregistrer les queues : `webhook-processing`, `broadcast-sending`, `sentiment-analysis`, `outbound-webhook-delivery` (quand créé), `dead-letter` (quand créé)
- [ ] Monter l'interface sur `/admin/queues` avec protection par middleware vérifiant le cookie admin
- [ ] Désactiver en production si `BULL_BOARD_ENABLED=false` (pour désactivation rapide)
- [ ] Documenter l'URL dans le RUNBOOK

**Critères d'acceptation**
- Interface accessible à `/admin/queues` avec session admin active
- Jobs `failed` visibles et rejouables depuis l'UI
- L'interface est inaccessible sans session admin

**Rollback**  
`BULL_BOARD_ENABLED=false` ou suppression du module.

---

## Résumé par sprint

### Sprint 1 — Stabilisation Redis (5 tickets)
| Ticket | Titre | Priorité | Effort |
|--------|-------|----------|--------|
| A-01 | Politique mémoire noeviction | P0 | XS |
| A-02 | Sécuriser Redis | P0 | S |
| A-03 | Préfixes Redis par usage | P0 | S |
| A-04 | Monitoring mémoire et connexions | P0 | S |
| C-01 | Fiabiliser adapter Socket.IO | P1 | S |

**Résultat attendu :** Redis sécurisé, queues protégées, visibilité production minimale.

---

### Sprint 2 — Fluidité temps réel (5 tickets)
| Ticket | Titre | Priorité | Effort |
|--------|-------|----------|--------|
| B-01 | Rate limiting WebSocket Redis | P1 | M |
| B-02 | Rate limiting webhooks Redis | P1 | M |
| B-03 | Anti-doublon envoi agent Redis | P1 | M |
| D-01 | Queue outbound-webhook-delivery | P2 | L |
| E-01 | Cache system_config | P3 | S |

**Résultat attendu :** Protections distribuées, retries fiables, moins de SQL répétitif.  
**Rollback sprint :** Désactiver tous les feature flags Redis.

---

### Sprint 3 — Fiabilité jobs (4 tickets)
| Ticket | Titre | Priorité | Effort |
|--------|-------|----------|--------|
| D-02 | Graceful shutdown workers | P2 | M |
| D-03 | Dead Letter Queue | P2 | M |
| G-01 | Endpoint /admin/queue-stats | P5 | S |
| G-02 | Bull Board UI | P5 | M |

**Résultat attendu :** Redeploiements sans perte de jobs, pannes visibles et rejouables.  
**Rollback sprint :** Supprimer shutdown service, désactiver DLQ enqueue dans les workers.

---

### Sprint 4 — Coordination multi-instance (4 tickets)
| Ticket | Titre | Priorité | Effort |
|--------|-------|----------|--------|
| F-01 | Redlock QueueService dispatcher | P4 | L |
| F-02 | Redlock crons critiques | P4 | M |
| F-03 | Présence agents Redis | P4 | L |
| D-04 | FlowBot delayed jobs | P4 | XL |

**Résultat attendu :** Architecture prête pour plusieurs instances backend.  
**Rollback sprint :** Désactiver les feature flags présence/flowbot, supprimer les withLock.

---

### Sprint 5 — Optimisations fines (3 tickets)
| Ticket | Titre | Priorité | Effort |
|--------|-------|----------|--------|
| E-02 | Cache channels et templates | P3 | M |
| E-03 | Cache listes socket | P3 | M |
| — | Ajustement TTL selon métriques réelles | — | S |

**Résultat attendu :** UI plus réactive, charge DB réduite, architecture optimisée.  
**Rollback sprint :** Désactiver les caches (purement additifs).

---

## Tableau récapitulatif — tous tickets

| Ticket | Titre | Groupe | Priorité | Sprint | Effort | Flag |
|--------|-------|--------|----------|--------|--------|------|
| A-01 | Politique mémoire noeviction | Infrastructure | P0 | 1 | XS | — |
| A-02 | Sécuriser Redis | Infrastructure | P0 | 1 | S | — |
| A-03 | Préfixes Redis par usage | Infrastructure | P0 | 1 | S | — |
| A-04 | Monitoring mémoire et connexions | Infrastructure | P0 | 1 | S | — |
| C-01 | Fiabiliser adapter Socket.IO | Socket.IO | P1 | 1 | S | — |
| B-01 | Rate limiting WebSocket Redis | Rate Limiting | P1 | 2 | M | `REDIS_SOCKET_THROTTLE_ENABLED` |
| B-02 | Rate limiting webhooks Redis | Rate Limiting | P1 | 2 | M | `REDIS_WEBHOOK_RATE_LIMIT_ENABLED` |
| B-03 | Anti-doublon envoi agent Redis | Rate Limiting | P1 | 2 | M | `REDIS_SEND_DEDUPE_ENABLED` |
| D-01 | Queue outbound-webhook-delivery | BullMQ | P2 | 2 | L | `BULLMQ_OUTBOUND_WEBHOOK_ENABLED` |
| E-01 | Cache system_config | Cache | P3 | 2 | S | — |
| D-02 | Graceful shutdown workers | BullMQ | P2 | 3 | M | — |
| D-03 | Dead Letter Queue | BullMQ | P2 | 3 | M | — |
| G-01 | Endpoint /admin/queue-stats | Monitoring | P5 | 3 | S | — |
| G-02 | Bull Board UI | Monitoring | P5 | 3 | M | `BULL_BOARD_ENABLED` |
| F-01 | Redlock QueueService dispatcher | Coordination | P4 | 4 | L | — |
| F-02 | Redlock crons critiques | Coordination | P4 | 4 | M | — |
| F-03 | Présence agents Redis | Coordination | P4 | 4 | L | `REDIS_PRESENCE_ENABLED` |
| D-04 | FlowBot delayed jobs | BullMQ | P4 | 4 | XL | `BULLMQ_FLOWBOT_DELAYED_ENABLED` |
| E-02 | Cache channels et templates | Cache | P3 | 5 | M | — |
| E-03 | Cache listes socket | Cache | P3 | 5 | M | — |

---

*Backlog généré le 2026-05-07 · Source : PLAN_REDIS_FLUIDITE_REQUETES.md*
