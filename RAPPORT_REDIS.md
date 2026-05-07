# Rapport Redis — Audit & Plan d'Amélioration
**Projet :** message_whatsapp (NestJS + BullMQ + ioredis)  
**Date :** 2026-05-07  
**Auteur :** Analyse automatisée

---

## 1. État actuel — Vue d'ensemble

Redis est utilisé à trois niveaux distincts dans le backend :

| Niveau | Usage | Fichiers concernés |
|--------|-------|-------------------|
| **BullMQ** | File de travaux asynchrones (webhooks, broadcasts, sentiment) | `queue/`, `broadcast/workers/`, `sentiment/` |
| **Cache** | Résolution de contexte canal + cache permissions RBAC | `context/`, `rbac/` |
| **Verrous distribués** | Mutex pour la rotation de fenêtres glissantes | `redis/distributed-lock.service.ts` |

### Topologie Redis
```
┌─────────────────────────────────────────────────┐
│                   Redis Server                  │
│                                                 │
│  Queues BullMQ                                  │
│  ├── bull:webhook-processing:{...}              │
│  ├── bull:broadcast-sending:{...}               │
│  └── bull:sentiment-analysis:{...}              │
│                                                 │
│  Cache clés                                     │
│  ├── ctx:channel:{channelId}        TTL 60s     │
│  └── rbac:perms:{tenantId}:{userId} TTL 300s    │
│                                                 │
│  Verrous Redlock                                │
│  └── lock:window:rotation:{posteId} TTL 120s    │
└─────────────────────────────────────────────────┘
```

---

## 2. Inventaire des queues BullMQ

### 2.1 webhook-processing

| Paramètre | Valeur |
|-----------|--------|
| Nom | `webhook-processing` |
| Concurrence | 5 (configurable via `BULL_CONCURRENCY`) |
| Attempts | 3 |
| Backoff | Exponentiel, 1 s de base |
| Rétention succès | 100 jobs |
| Rétention échecs | 500 jobs |
| Producteur | `WhapiController` (tous les providers : Whapi, Meta, Messenger, Instagram, Telegram) |
| Consumer | `WebhookWorker` |

**Flux :**
```
POST /webhook/* → WhapiController → add('process', { provider, payload, ... }) → WebhookWorker.process()
```

### 2.2 broadcast-sending

| Paramètre | Valeur |
|-----------|--------|
| Nom | `broadcast-sending` |
| Concurrence | 2 (hard-codée) |
| Attempts | 2 |
| Backoff | Exponentiel, 2 s de base |
| Taille de batch | 50 destinataires / job |
| Délai inter-batch | 1 000 ms |
| Producteur | `BroadcastService.enqueueBatches()` |
| Consumer | `BroadcastWorker` |

**Flux :**
```
POST /broadcast/:id/send → enqueueBatches() → N jobs 'send-batch' → BroadcastWorker → Meta API
```

### 2.3 sentiment-analysis

| Paramètre | Valeur |
|-----------|--------|
| Nom | `sentiment-analysis` |
| Concurrence | 5 |
| Attempts | 3 (défaut global) |
| Rétention succès | Immédiate (removeOnComplete: true) |
| Rétention échecs | 50 jobs |
| Producteur | `SentimentListener` sur événement `message.saved` |
| Consumer | `SentimentWorker` |
| Filtre | Messages entrants (`direction = 'IN'`) de 3+ caractères |

**Flux :**
```
Webhook entrant → message.saved event → SentimentListener → add('analyze', ...) → SentimentWorker → UPDATE whatsapp_message
```

---

## 3. Inventaire du cache Redis

### 3.1 Cache contexte canal — ContextResolverService

- **Clé :** `ctx:channel:{channelId}`
- **TTL :** 60 secondes
- **Contenu :** ID du contexte (tenant, canal)
- **Stratégie :** Redis L1 → in-process Map L2 → base de données L3
- **Invalidation :** Manuelle via `invalidate(channelId)` sur événement de mise à jour canal

### 3.2 Cache permissions RBAC — RbacService

- **Clé :** `rbac:perms:{tenantId}:{commercialId}`
- **TTL :** 300 secondes (5 minutes)
- **Contenu :** Ensemble des permissions de l'utilisateur
- **Invalidation :** Aucune invalidation explicite — expiration seule

### 3.3 Verrou distribué — DistributedLockService

- **Clé :** `lock:window:rotation:{posteId}`
- **TTL :** 120 secondes
- **Mécanisme :** Redlock (ioredis)
- **Stratégie :** `tryWithLock` (fail-fast, sans retry)
- **Fallback :** `Set<string>` en mémoire si Redis absent

---

## 4. Bilan — Points positifs ✅

1. **Graceful degradation bien implémentée** : le token `REDIS_CLIENT` peut être `null`, tous les services vérifient `if (this.redis)` avant usage. L'application démarre même sans Redis.

2. **Pattern verrou distribué correct** : Redlock avec drift factor, jitter, et extension automatique. Le fallback in-process est cohérent pour mono-instance.

3. **Séparation des queues** : trois queues distinctes avec des concurrences adaptées à leur criticité (2 pour broadcast = respecte rate-limit Meta).

4. **Sentiment non-bloquant** : l'analyse est découplée du pipeline principal via events + queue. Un échec d'analyse n'impacte pas la réception du message.

5. **Cache double niveau (Redis + in-process)** dans ContextResolverService : réduit la latence même lors de pics de charge.

6. **defaultJobOptions centralisés** dans `queue.module.ts` : configuration cohérente sans duplication.

---

## 5. Problèmes identifiés ⚠️

### P1 — Double enregistrement de BROADCAST_QUEUE (Haut risque)

**Localisation :**
- `src/queue/queue.module.ts` ligne ~17 : `BullModule.registerQueue({ name: BROADCAST_QUEUE })`
- `src/broadcast/broadcast.module.ts` ligne ~22 : `BullModule.registerQueue({ name: BROADCAST_QUEUE })`

**Impact :** Deux registrations du même nom de queue dans des modules différents peuvent créer des comportements imprévisibles avec BullMQ (double worker, conflits de stats).

**Correction :** Ne conserver l'enregistrement que dans `BroadcastModule`. Retirer la déclaration de `queue.module.ts`.

---

### P2 — Concurrence broadcast hard-codée à 2 (Moyen risque)

**Localisation :** `src/broadcast/workers/broadcast.worker.ts`
```typescript
@Processor(BROADCAST_QUEUE, { concurrency: 2 })
```

**Impact :** Impossible d'adapter à la charge sans recompiler. Si Meta augmente son rate-limit ou si l'on passe à plusieurs tenants, le seul levier est un redéploiement.

**Correction :**
```typescript
@Processor(BROADCAST_QUEUE, {
  concurrency: parseInt(process.env.BROADCAST_CONCURRENCY ?? '2', 10),
})
```

---

### P3 — Aucune invalidation de cache RBAC (Moyen risque)

**Localisation :** `src/rbac/rbac.service.ts`

**Impact :** Si les permissions d'un utilisateur sont modifiées en base, le cache Redis peut servir les anciennes permissions pendant jusqu'à 5 minutes. Dans un contexte RH ou sécurité, c'est inacceptable.

**Correction :** Ajouter une méthode `invalidateUserPermissions(tenantId, commercialId)` appelée depuis le service qui modifie les rôles, et exposer un endpoint admin de purge.

---

### P4 — Absence de monitoring des queues (Moyen risque)

**Impact :** Impossible de savoir combien de jobs sont en attente, combien ont échoué, quel est le throughput. En cas de panne Redis, les jobs en échec ne sont pas visibles.

**Correction :** Intégrer Bull Board (interface web) ou exposer un endpoint `/admin/queue-stats` retournant les métriques BullMQ.

---

### P5 — `removeOnComplete: true` sur sentiment (Faible risque)

**Localisation :** `src/sentiment/sentiment.listener.ts`

**Impact :** Les jobs sentiment terminés sont immédiatement supprimés de Redis, rendant tout debug ou audit de sentiment impossible.

**Correction :** Conserver un historique minimal :
```typescript
removeOnComplete: { count: 200, age: 3600 }  // 1h ou 200 jobs max
```

---

### P6 — Pas de `@socket.io/redis-adapter` configuré (Faible risque)

**Impact :** Le package `@socket.io/redis-adapter` est installé (`package.json`) mais n'est pas utilisé dans le code. Si le backend est déployé en plusieurs instances (horizontal scaling), les WebSockets ne seront pas synchronisés entre instances.

**Correction :** Soit supprimer la dépendance si le scaling n'est pas prévu, soit câbler l'adapter dans le module WebSocket.

---

### P7 — Pas de préfixe de clé Redis (Faible risque)

**Impact :** Si deux environnements (staging, production) partagent le même Redis, les clés `ctx:channel:xxx`, `rbac:perms:xxx` et les queues BullMQ s'entremêlent.

**Correction :** Ajouter un préfixe via variable d'environnement :
```typescript
// Dans redis.module.ts
keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'wapp:'

// Dans queue.module.ts (BullMQ)
prefix: process.env.REDIS_KEY_PREFIX ?? '{wapp}'
```

---

### P8 — TTL Redlock trop long pour les rotations (Faible risque)

**Localisation :** `src/window/services/window-rotation.service.ts`

**Impact :** TTL de 120 secondes sur le verrou de rotation de fenêtre. Si le processus crashe pendant la rotation, le verrou est tenu 2 minutes, bloquant toutes les rotations suivantes pour ce poste.

**Correction :** Réduire à 30–45 secondes (la rotation ne devrait pas durer plus de quelques secondes) et activer l'`automaticExtension` si le traitement est plus long que prévu.

---

## 6. Plan d'amélioration priorisé

### Sprint immédiat (P0)

| # | Action | Fichier | Effort |
|---|--------|---------|--------|
| 1 | Supprimer double enregistrement BROADCAST_QUEUE | `queue.module.ts` | 5 min |
| 2 | Externaliser `BROADCAST_CONCURRENCY` en env var | `broadcast.worker.ts` | 5 min |
| 3 | Ajouter invalidation cache RBAC à la modification de rôle | `rbac.service.ts` | 30 min |

### Sprint court (P1)

| # | Action | Fichier | Effort |
|---|--------|---------|--------|
| 4 | Ajouter préfixe Redis configurable par env | `redis.module.ts`, `queue.module.ts` | 1h |
| 5 | Exposer endpoint `/admin/queue-stats` (jobs en attente, failed, completed) | Nouveau contrôleur | 2h |
| 6 | Corriger `removeOnComplete` sentiment | `sentiment.listener.ts` | 5 min |
| 7 | Réduire TTL verrou Redlock de 120s à 30s | `window-rotation.service.ts` | 5 min |

### Sprint moyen terme (P2)

| # | Action | Description | Effort |
|---|--------|-------------|--------|
| 8 | Bull Board UI | Intégrer `@bull-board/nestjs` pour monitorer les queues visuellement | 3h |
| 9 | Dead Letter Queue | Créer une queue `dead-letter` qui reçoit les jobs webhook en échec définitif pour rejouer manuellement | 4h |
| 10 | Socket.IO Redis Adapter | Câbler `@socket.io/redis-adapter` ou supprimer la dépendance | 2h |
| 11 | Métriques Redis Prometheus | Exposer `redis_connected`, `queue_size`, `queue_failed` via `/metrics` | 4h |

---

## 7. Recommandations d'architecture

### 7.1 Séparation Redis instances

Pour la production à terme, envisager **deux instances Redis distinctes** :

```
Redis Instance 1 (cache) → ctx:channel:*, rbac:perms:*   (TTL courts, peut être flushé)
Redis Instance 2 (queues) → BullMQ queues                 (persistance critique, ne jamais flush)
```

Cela permet de flusher le cache sans risquer de perdre des jobs en attente.

### 7.2 Bull Board — Monitoring des queues

```bash
npm install @bull-board/nestjs @bull-board/ui
```

```typescript
// Dans AppModule
BullBoardModule.forRoot({ route: '/admin/queues', adapter: ExpressAdapter })
BullBoardModule.forFeature({ name: WEBHOOK_PROCESSING_QUEUE })
BullBoardModule.forFeature({ name: BROADCAST_QUEUE })
BullBoardModule.forFeature({ name: SENTIMENT_QUEUE })
```

Accessible à `/admin/queues` avec protection AdminGuard.

### 7.3 Invalidation RBAC — Pattern recommandé

```typescript
// Dans RbacService
async invalidatePermissions(tenantId: string, commercialId: string): Promise<void> {
  if (this.redis) {
    await this.redis.del(`rbac:perms:${tenantId}:${commercialId}`);
  }
}

// Appel depuis CommercialService.updateRole()
await this.rbacService.invalidatePermissions(tenantId, commercial.id);
```

### 7.4 Endpoint stats queues

```typescript
@Get('queue-stats')
@UseGuards(AdminGuard)
async getQueueStats() {
  const [wh, bc, sa] = await Promise.all([
    this.webhookQueue.getJobCounts(),
    this.broadcastQueue.getJobCounts(),
    this.sentimentQueue.getJobCounts(),
  ]);
  return { webhook: wh, broadcast: bc, sentiment: sa };
}
```

Retourne : `{ waiting, active, completed, failed, delayed, paused }` par queue.

---

## 8. Résumé exécutif

| Catégorie | État | Note |
|-----------|------|------|
| Architecture globale | ✅ Solide | Graceful degradation, séparation des queues |
| BullMQ webhooks | ✅ Bien configuré | Retry, backoff, concurrence adaptée |
| BullMQ broadcasts | ⚠️ Amélioration mineure | Double enregistrement, concurrence fixe |
| BullMQ sentiment | ✅ Correct | Découplage propre, non-bloquant |
| Cache contexte | ✅ Optimal | Double niveau (Redis + in-process) |
| Cache RBAC | ⚠️ Incomplet | Pas d'invalidation proactive |
| Verrous distribués | ✅ Correct | Redlock + fallback in-process |
| Monitoring | ❌ Absent | Aucune visibilité sur l'état des queues |
| Multi-instance | ⚠️ Partiel | Adapter Socket.IO non câblé |

**Score global : 7/10** — L'architecture est saine et résiliente. Les améliorations prioritaires sont le monitoring des queues (P1), l'invalidation RBAC (P1), et le nettoyage du double enregistrement broadcast (P0, 5 minutes).

---

*Rapport généré le 2026-05-07 — Projet message_whatsapp*
