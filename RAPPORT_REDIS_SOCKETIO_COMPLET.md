# Rapport Complet — Redis & Socket.IO
## Audit, Bilan & Plan d'Architecture pour Montée en Charge

**Projet :** WhatsApp Platform (message_whatsapp + front + admin)  
**Date :** 2026-05-07  
**Stack :** NestJS 11 · Socket.IO 4.8 · BullMQ 5 · ioredis 5 · Redis 7 · Next.js 15

---

## Table des matières

1. [Vue d'ensemble de l'architecture temps-réel](#1-vue-densemble)
2. [Audit Redis — État actuel](#2-audit-redis)
3. [Audit Socket.IO — État actuel](#3-audit-socketio)
4. [Problèmes identifiés](#4-problèmes-identifies)
5. [Comment Redis DOIT être utilisé à grande échelle](#5-redis-grande-echelle)
6. [Comment Socket.IO DOIT être utilisé à grande échelle](#6-socketio-grande-echelle)
7. [Plan d'amélioration priorisé](#7-plan-amelioration)
8. [Bilan exécutif](#8-bilan-executif)

---

## 1. Vue d'ensemble

### Topologie actuelle (mono-instance)

```
┌─────────────────────────────────────────────────────────────┐
│                    Serveur 148.230.112.175                   │
│                                                             │
│  ┌──────────────┐     ┌──────────────┐    ┌─────────────┐  │
│  │ front:3000   │     │ admin:3001   │    │ back:3002   │  │
│  │ (Next.js)    │     │ (Next.js)    │    │ (NestJS)    │  │
│  │              │     │              │    │             │  │
│  │ Socket.IO    │────▶│  REST only   │    │ Gateway WS  │  │
│  │ client       │◀────│              │    │ BullMQ      │  │
│  └──────────────┘     └──────────────┘    │ ioredis     │  │
│                                           └──────┬──────┘  │
│                                                  │          │
│                                    ┌─────────────▼──────┐  │
│                                    │   Redis :6379        │  │
│                                    │                      │  │
│                                    │  BullMQ queues (3)   │  │
│                                    │  Cache clés (2 types)│  │
│                                    │  Redlock (verrous)   │  │
│                                    │  Socket.IO rooms *   │  │
│                                    └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
* Redis adapter pour Socket.IO configuré mais non validé en prod
```

---

## 2. Audit Redis — État actuel

### 2.1 Dépendances installées

| Package | Version | Rôle |
|---------|---------|------|
| `ioredis` | ^5.10.1 | Client Redis bas niveau |
| `bullmq` | ^5.74.1 | Queue de jobs |
| `@nestjs/bullmq` | ^11.0.4 | Intégration NestJS |
| `@socket.io/redis-adapter` | ^8.3.0 | Adapter pub/sub pour Socket.IO multi-instance |

### 2.2 Configuration du client Redis

**Fichier :** `src/redis/redis.module.ts`

```typescript
// Token injectable : REDIS_CLIENT (Redis | null)
// Graceful degradation : retourne null si REDIS_HOST absent
// Options : lazyConnect: true
// Variables : REDIS_HOST, REDIS_PORT (6379), REDIS_PASSWORD
```

Variables d'environnement actives :
```
REDIS_HOST=redis       (nom du service Docker Compose)
REDIS_PORT=6379
REDIS_PASSWORD=(vide)
```

> **Note critique :** Pas de TLS, pas de password en production. À corriger avant tout scaling.

### 2.3 Queues BullMQ

#### Queue 1 — `webhook-processing`

| Paramètre | Valeur actuelle |
|-----------|----------------|
| Concurrence | 5 (via `BULL_CONCURRENCY` env) |
| Attempts | 3 |
| Backoff | Exponentiel 1s |
| Rétention succès | 100 jobs |
| Rétention échecs | 500 jobs |
| Producteur | `WhapiController` (tous providers : Whapi, Meta, Messenger, Instagram, Telegram) |
| Consumer | `WebhookWorker` |

**Flux complet :**
```
POST /webhook/* 
  → WhapiController.handleWebhook()
  → webhookQueue.add('process', { provider, payload, tenantId, channelId, correlationId, eventType, enqueuedAt })
  → WebhookWorker.process()
  → UnifiedIngressService (routing par provider)
  → [messages DB, socket emit, event emitter]
```

#### Queue 2 — `broadcast-sending`

| Paramètre | Valeur actuelle |
|-----------|----------------|
| Concurrence | **2 (hard-codée)** |
| Attempts | 2 |
| Backoff | Exponentiel 2s |
| Taille de batch | 50 destinataires / job |
| Délai inter-batch | 1 000 ms |
| Producteur | `BroadcastService.enqueueBatches()` |
| Consumer | `BroadcastWorker` |

**Flux complet :**
```
POST /broadcast/:id/send
  → BroadcastService.enqueueBatches()
  → N jobs 'send-batch' avec delay = batch_index * 1000ms
  → BroadcastWorker.process()
  → Meta Graph API (envoi HSM par lot de 50)
  → UPDATE whatsapp_broadcast_recipient (SENT/FAILED)
  → Compteurs broadcast incrémentés
```

#### Queue 3 — `sentiment-analysis`

| Paramètre | Valeur actuelle |
|-----------|----------------|
| Concurrence | 5 |
| Attempts | 3 (défaut global) |
| Rétention succès | **Immédiate** (`removeOnComplete: true`) |
| Rétention échecs | 50 jobs |
| Déclencheur | `@OnEvent('message.saved')` sur messages entrants |
| Consumer | `SentimentWorker` |

**Flux complet :**
```
Webhook message entrant
  → message.saved event (si direction='IN' et text.length >= 3)
  → SentimentListener
  → sentimentQueue.add('analyze', { messageId, text })
  → SentimentWorker.process()
  → SentimentService.analyze(text) → { score, label }
  → UPDATE whatsapp_message SET sentiment_score, sentiment_label
```

### 2.4 Cache Redis

#### Cache 1 — Résolution de contexte canal

| Propriété | Valeur |
|-----------|--------|
| Clé | `ctx:channel:{channelId}` |
| TTL | 60 secondes |
| Contenu | ID du contexte (tenant + canal) |
| Stratégie | Redis L1 → in-process Map L2 → DB L3 |
| Invalidation | Manuelle via `invalidate(channelId)` |
| Fallback | Map in-process si Redis absent |

#### Cache 2 — Permissions RBAC

| Propriété | Valeur |
|-----------|--------|
| Clé | `rbac:perms:{tenantId}:{commercialId}` |
| TTL | 300 secondes (5 min) |
| Contenu | Set des permissions |
| Invalidation | **Aucune** — expiration uniquement |
| Fallback | Aucun (contournement si Redis absent) |

### 2.5 Verrous distribués (Redlock)

| Propriété | Valeur |
|-----------|--------|
| Clé | `lock:window:rotation:{posteId}` |
| TTL | **120 secondes** |
| Mécanisme | Redlock (ioredis) |
| Stratégie | `tryWithLock` (fail-fast, 0 retry) |
| Paramètres | driftFactor=0.01, retryCount=3, retryDelay=200ms, jitter=100ms |
| Extension automatique | Seuil 500ms |
| Fallback | `Set<string>` en mémoire si Redis absent |

### 2.6 Socket.IO Redis Adapter

**Statut : configuré mais non vérifié en production**

```typescript
// Dans WhatsappMessageGateway.afterInit()
const pubClient = new Redis({ host, port, password });
const subClient = pubClient.duplicate();
server.adapter(createAdapter(pubClient, subClient));
```

Sans cet adapter actif en multi-instance, les événements socket émis par une instance NestJS ne parviennent **pas** aux clients connectés sur une autre instance.

---

## 3. Audit Socket.IO — État actuel

### 3.1 Architecture temps-réel

```
┌──────────────────────────────────────────────────────┐
│                    FRONTEND (front/)                  │
│                                                      │
│  SocketProvider (Context)                            │
│  └── socket = io(SOCKET_URL, { transports: ['websocket'], withCredentials: true, auth: { token } })
│                                                      │
│  WebSocketEvents (Orchestrateur)                     │
│  ├── on('chat:event')      → socket-event-router     │
│  ├── on('contact:event')   → contactStore            │
│  ├── on('queue:updated')   → queueStore              │
│  └── on('error')           → logger                  │
│                                                      │
│  Stores Zustand                                      │
│  ├── chatStore.emit('messages:get', ...)             │
│  ├── chatStore.emit('messages:read', ...)            │
│  ├── chatStore.emit('message:send', ...)             │
│  └── contactStore.emit('contact:get_detail', ...)    │
└──────────────────┬───────────────────────────────────┘
                   │  WSS
┌──────────────────▼───────────────────────────────────┐
│                   BACKEND (message_whatsapp/)         │
│                                                      │
│  WhatsappMessageGateway                              │
│  ├── @SubscribeMessage('conversations:get')          │
│  ├── @SubscribeMessage('messages:get')               │
│  ├── @SubscribeMessage('messages:read')              │
│  ├── @SubscribeMessage('message:send')               │
│  ├── @SubscribeMessage('chat:event')                 │
│  ├── @SubscribeMessage('contacts:get')               │
│  ├── @SubscribeMessage('contact:get_detail')         │
│  └── @SubscribeMessage('call_logs:get')              │
│                                                      │
│  Publishers (Serveur → Client)                       │
│  ├── ConversationPublisher → room poste:{id}         │
│  ├── QueuePublisher        → room poste:{id}         │
│  ├── FollowUpPublisher     → room poste:{id}         │
│  ├── WindowPublisher       → room poste:{id}         │
│  └── TargetPublisher       → room commercial:{id}    │
└──────────────────────────────────────────────────────┘
```

### 3.2 Événements Client → Serveur (10 events)

| Event | Handler | Rate limit |
|-------|---------|-----------|
| `conversations:get` | Charge la fenêtre de conversations | 20/10s |
| `messages:get` | Charge messages d'une conversation (pagination) | 30/10s |
| `messages:read` | Marque messages comme lus | 20/10s |
| `message:send` | Envoie un message WhatsApp | 10/10s |
| `message:send:media` | Envoie un média | — |
| `chat:event` | Change le statut d'une conversation | 20/10s |
| `contacts:get` | Charge la liste des contacts | 10/10s |
| `contact:get_detail` | Charge le détail d'un contact | — |
| `call_logs:get` | Charge les logs d'appels | — |
| `queue:get` | Charge la file d'attente | — |

### 3.3 Événements Serveur → Client (25+ events)

**Canal `chat:event` (25 types) :**

| Catégorie | Events |
|-----------|--------|
| Conversations | `CONVERSATION_LIST`, `CONVERSATION_UPSERT`, `CONVERSATION_ASSIGNED`, `CONVERSATION_REMOVED`, `CONVERSATION_READONLY`, `CONVERSATION_STATUS_CHANGE` |
| Messages | `MESSAGE_LIST`, `MESSAGE_LIST_PREPEND`, `MESSAGE_ADD`, `MESSAGE_STATUS_UPDATE`, `MESSAGE_SEND_ERROR` |
| Fenêtre glissante | `WINDOW_ROTATED`, `WINDOW_BLOCK_PROGRESS`, `WINDOW_ROTATION_BLOCKED` |
| Objectifs | `TARGET_PROGRESS_UPDATE` |
| Rapports | `REPORT_SUBMITTED`, `CONVERSATION_CLOSE_BLOCKED` |
| UX | `RATE_LIMITED`, `TYPING_START`, `TYPING_STOP`, `TOTAL_UNREAD_UPDATE` |
| Relances | `FOLLOW_UP_REMINDER` |

**Canal `contact:event` (6 types) :**
`CONTACT_LIST`, `CONTACT_DETAIL`, `CONTACT_UPSERT`, `CONTACT_REMOVED`, `CONTACT_CALL_STATUS_UPDATED`, `CALL_LOG_NEW`, `CALL_LOG_LIST`

**Canal `queue:updated` (1 type) :**
`queue:updated` avec payload `{ timestamp, reason, data: queue[] }`

### 3.4 Système de rooms

```
tenant:{tenantId}          → tous les agents du tenant
poste:{posteId}            → agents connectés sur ce poste
commercial:{commercialId}  → session individuelle d'un agent
```

### 3.5 Rate limiting (Token Bucket)

Implémenté via `SocketThrottleGuard` en mémoire (pas Redis) :

| Event | Limite | Fenêtre |
|-------|--------|---------|
| `message:send` | 10 req | 10s |
| `messages:get` | 30 req | 10s |
| `conversations:get` | 20 req | 10s |
| `chat:event` | 20 req | 10s |
| `messages:read` | 20 req | 10s |
| `contacts:get` | 10 req | 10s |
| Cleanup des buckets | — | Toutes les 60s (max age 2 min) |

### 3.6 Authentification WebSocket

```
1. Client connecte avec auth: { token: 'JWT...' }
2. SocketAuthService extrait le token (auth.token OU cookie 'Authentication=')
3. jwtService.verifyAsync(token) → { sub: commercialId }
4. Résolution des tenantIds via les postes du commercial
5. Enregistrement AgentSession { commercialId, posteId, tenantId, tenantIds }
6. Join rooms : tenant:{id}, poste:{id}, commercial:{id}
```

### 3.7 Admin — Pas de Socket.IO actif

Le panel admin n'utilise **pas** Socket.IO pour le moment. `socket.io-client` est installé (`^4.8.1`) mais aucun provider n'est câblé. L'admin fonctionne entièrement en REST polling.

---

## 4. Problèmes identifiés

### P0 — Critiques (bloquants pour la production)

#### P0.1 — CORS WebSocket ouvert à `*`

```typescript
@WebSocketGateway({ cors: { origin: '*', credentials: true } })
```

**Impact :** N'importe quel site peut initier une connexion WebSocket vers le backend.  
**Correction :**
```typescript
@WebSocketGateway({
  cors: {
    origin: (process.env.ALLOWED_ORIGINS ?? '').split(','),
    credentials: true,
  },
})
```

#### P0.2 — Redis sans authentification ni TLS

**Fichier :** `.env`
```
REDIS_PASSWORD=(vide)
```
**Impact :** Redis accessible en clair sur le réseau Docker sans authentification.  
**Correction :** Ajouter un `REDIS_PASSWORD` fort dans `.env` et activer TLS si Redis est exposé.

#### P0.3 — Redis Adapter Socket.IO non validé en production

**Impact :** Si le backend est déployé en 2+ instances (load balancer), les broadcasts Socket.IO ne transitent pas entre instances. Un agent connecté sur l'instance A ne reçoit pas les events émis depuis l'instance B.  
**Correction :** Vérifier que `afterInit()` initialise bien l'adapter avant tout broadcast.

---

### P1 — Hauts (dégradation fonctionnelle)

#### P1.1 — Double enregistrement de BROADCAST_QUEUE

```typescript
// queue.module.ts ligne ~17
BullModule.registerQueue({ name: BROADCAST_QUEUE })

// broadcast.module.ts ligne ~22
BullModule.registerQueue({ name: BROADCAST_QUEUE })  // doublon
```
**Impact :** Comportement imprévisible, potentiel double processing.  
**Correction :** Conserver uniquement dans `BroadcastModule`.

#### P1.2 — Aucune invalidation du cache RBAC

**Impact :** Modification de rôle → anciennes permissions actives 5 minutes.  
**Correction :** Appeler `redis.del('rbac:perms:...')` dans `CommercialService.updateRole()`.

#### P1.3 — Rate limiting Socket en mémoire uniquement

Le `SocketThrottleGuard` utilise un `Map` in-process.  
**Impact :** En multi-instance, un client peut multiplier ses requêtes en changeant d'instance à chaque appel.  
**Correction :** Migrer vers Redis via `redis.incr()` + `redis.expire()` (sliding window counter).

#### P1.4 — Aucun monitoring des queues

**Impact :** Impossible de détecter des jobs bloqués, un backlog croissant, ou des failures répétées.  
**Correction :** Exposer `/admin/queue-stats` ou intégrer Bull Board.

---

### P2 — Moyens (optimisation)

#### P2.1 — Concurrence broadcast hard-codée

```typescript
@Processor(BROADCAST_QUEUE, { concurrency: 2 })
```
**Correction :** `parseInt(process.env.BROADCAST_CONCURRENCY ?? '2', 10)`

#### P2.2 — TTL verrou Redlock trop long (120s)

Une rotation prend < 5 secondes. Un TTL de 120s bloque inutilement en cas de crash.  
**Correction :** Réduire à 30s.

#### P2.3 — removeOnComplete immédiat sur sentiment

```typescript
removeOnComplete: true
```
**Impact :** Impossible de diagnostiquer les problèmes d'analyse.  
**Correction :** `removeOnComplete: { count: 500, age: 7200 }` (2h)

#### P2.4 — Pas de préfixe Redis

**Impact :** Collision de clés entre environnements sur le même Redis.  
**Correction :** `keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'wapp:'`

#### P2.5 — Reconnexion Socket.IO non configurée côté client

```typescript
// Défauts Socket.IO : reconnection toutes les 1s à 5s, infiniment
// Aucune configuration explicite dans SocketProvider.tsx
```
**Impact :** En cas de backend down, avalanche de tentatives de reconnexion.  
**Correction :** Configurer un backoff exponentiel (voir section 6).

#### P2.6 — Admin sans temps réel

**Impact :** Les données admin sont figées jusqu'au rechargement manuel.  
**Correction :** Ajouter un `AdminSocketProvider` pour les événements critiques (nouveaux messages, alertes système, stats en temps réel).

---

## 5. Comment Redis DOIT être utilisé à grande échelle

### 5.1 Architecture Redis pour 10 000+ connexions simultanées

```
┌─────────────────────────────────────────────────────────┐
│                Architecture recommandée                  │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Back #1  │  │ Back #2  │  │ Back #3  │             │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
│       │              │              │                    │
│  ┌────▼──────────────▼──────────────▼────┐             │
│  │         Redis Cluster (3 nœuds)        │             │
│  │                                        │             │
│  │  Shard 1        Shard 2       Shard 3  │             │
│  │  {queues:*}     {cache:*}     {lock:*} │             │
│  └────────────────────────────────────────┘             │
│                                                         │
│  Redis Sentinel (haute disponibilité)                   │
│  → Primary + 2 Replicas                                 │
│  → Failover automatique < 30s                           │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Séparation des responsabilités Redis

**Règle fondamentale : ne pas mélanger les usages sur le même pool de connexions.**

```typescript
// MAUVAIS : une seule instance pour tout
const redis = new Redis({ host, port });
bullmq.use(redis);           // queues
socket.adapter(redis);       // socket.io
cache.store(redis);          // cache

// BON : instances dédiées par usage
const queueRedis   = new Redis({ host, port, db: 0 });  // BullMQ
const cacheRedis   = new Redis({ host, port, db: 1 });  // Cache applicatif
const sessionRedis = new Redis({ host, port, db: 2 });  // Sessions/locks
const socketRedis  = new Redis({ host, port, db: 3 });  // Socket.IO adapter
```

> Note : avec Redis Cluster, utiliser des key prefixes plutôt que des DB numérotées (les DB sont mono-node uniquement).

### 5.3 Patterns de cache pour requêtes lourdes

#### Pattern Cache-Aside (actuel, correct)
```typescript
async getContext(channelId: string) {
  // 1. Redis L1
  const cached = await redis.get(`ctx:channel:${channelId}`);
  if (cached) return JSON.parse(cached);

  // 2. DB L2
  const ctx = await this.db.findContext(channelId);
  await redis.setex(`ctx:channel:${channelId}`, 60, JSON.stringify(ctx));
  return ctx;
}
```

#### Pattern Write-Through (pour données critiques)
```typescript
async updateCommercialRole(id: string, role: string) {
  // 1. Écrire en DB
  await this.db.updateRole(id, role);
  
  // 2. Invalider le cache IMMÉDIATEMENT (pas d'attente TTL)
  await redis.del(`rbac:perms:${tenantId}:${id}`);
  
  // 3. OU pré-charger le nouveau cache
  const perms = await this.computePermissions(id);
  await redis.setex(`rbac:perms:${tenantId}:${id}`, 300, JSON.stringify(perms));
}
```

#### Pattern Stale-While-Revalidate (pour requêtes coûteuses)
```typescript
async getHeavyReport(tenantId: string) {
  const key = `report:heavy:${tenantId}`;
  const staleTtlKey = `${key}:stale`;

  const cached = await redis.get(key);
  
  if (cached) {
    // Vérifier si le cache sera bientôt périmé (< 30s restantes)
    const ttl = await redis.ttl(key);
    if (ttl < 30) {
      // Régénérer en arrière-plan sans bloquer la requête
      this.revalidateInBackground(key, tenantId);
    }
    return JSON.parse(cached);
  }

  const data = await this.computeHeavyReport(tenantId);
  await redis.setex(key, 300, JSON.stringify(data));
  return data;
}
```

### 5.4 Patterns BullMQ pour gros volumes

#### Configuration optimale pour 10 000+ jobs/heure

```typescript
// queue.module.ts - Configuration recommandée
BullModule.forRootAsync({
  useFactory: (config: ConfigService) => ({
    connection: {
      host: config.get('REDIS_HOST'),
      port: config.get('REDIS_PORT'),
      password: config.get('REDIS_PASSWORD'),
      tls: config.get('REDIS_TLS') === 'true' ? {} : undefined,
      maxRetriesPerRequest: null,  // Requis pour BullMQ
      enableReadyCheck: false,     // Évite les blocages au démarrage
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 1000, age: 86400 },   // 24h ou 1000 jobs
      removeOnFail: { count: 5000, age: 604800 },      // 7 jours ou 5000 jobs
    },
  }),
})
```

#### Dead Letter Queue — indispensable en production

```typescript
// Créer une queue "morgue" pour les jobs définitivement échoués
const DEAD_LETTER_QUEUE = 'dead-letter';

// Dans WebhookWorker
async process(job: Job<WebhookJobData>): Promise<void> {
  try {
    await this.handleWebhook(job.data);
  } catch (error) {
    if (job.attemptsMade >= job.opts.attempts - 1) {
      // Dernière tentative échouée → Dead Letter
      await this.deadLetterQueue.add('failed-webhook', {
        originalJob: job.data,
        error: error.message,
        failedAt: new Date().toISOString(),
        jobId: job.id,
      });
    }
    throw error;
  }
}
```

#### Priority Queue pour les webhooks critiques

```typescript
// Prioriser les messages entrants sur les broadcasts
await webhookQueue.add('process', data, {
  priority: isCritical ? 1 : 10,  // 1 = plus haute priorité
});
```

### 5.5 Monitoring Redis en production

```typescript
// Endpoint /admin/redis-health
async getRedisHealth() {
  const [info, queueStats, memoryUsage] = await Promise.all([
    this.redis.info('server'),
    this.getQueueStats(),
    this.redis.info('memory'),
  ]);
  
  return {
    connected: this.redis.status === 'ready',
    version: this.parseRedisVersion(info),
    usedMemoryMb: this.parseMemoryMb(memoryUsage),
    queues: queueStats,
    uptime: this.parseUptime(info),
  };
}

// Endpoint /admin/queue-stats
async getQueueStats() {
  const queues = [webhookQueue, broadcastQueue, sentimentQueue];
  return Promise.all(
    queues.map(async (q) => ({
      name: q.name,
      counts: await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      isPaused: await q.isPaused(),
    }))
  );
}
```

---

## 6. Comment Socket.IO DOIT être utilisé à grande échelle

### 6.1 Architecture Redis Adapter pour multi-instance

Sans l'adapter Redis, chaque instance NestJS a sa propre mémoire de sockets. Un broadcast ne touche que les clients de l'instance émettrice.

```
SANS Redis Adapter (état actuel approximatif) :
  Instance A ──broadcast──▶ Clients de A seulement
  Instance B ──broadcast──▶ Clients de B seulement
  → Les clients de A ne reçoivent pas les events émis par B

AVEC Redis Adapter :
  Instance A ──broadcast──▶ Redis Pub/Sub ──▶ Instance B ──▶ Clients de B
                                            ──▶ Instance A ──▶ Clients de A
  → Tous les clients reçoivent tous les events
```

```typescript
// Gateway : configuration correcte
async afterInit(server: Server): Promise<void> {
  try {
    const pubClient = new Redis({
      host: this.config.get('REDIS_HOST'),
      port: this.config.get('REDIS_PORT'),
      password: this.config.get('REDIS_PASSWORD') || undefined,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: null,
    });
    const subClient = pubClient.duplicate();

    await Promise.all([
      new Promise<void>((resolve) => pubClient.once('ready', resolve)),
      new Promise<void>((resolve) => subClient.once('ready', resolve)),
    ]);

    server.adapter(createAdapter(pubClient, subClient));
    this.logger.log('Socket.IO Redis adapter actif');
  } catch (err) {
    this.logger.warn(`Redis adapter non disponible, mode mono-instance : ${err.message}`);
  }

  this.realtimeServer.setServer(server);
}
```

### 6.2 Reconnexion client — Configuration robuste

```typescript
// SocketProvider.tsx — Configuration recommandée pour la production
const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  withCredentials: true,
  auth: { token },

  // Reconnexion avec backoff exponentiel (évite les tempêtes de reconnexion)
  reconnection: true,
  reconnectionAttempts: 10,          // 10 tentatives max
  reconnectionDelay: 1000,           // 1s initiale
  reconnectionDelayMax: 30000,       // 30s maximum
  randomizationFactor: 0.5,          // Jitter pour éviter le thundering herd

  // Timeout de connexion
  timeout: 10000,                    // 10s avant d'abandonner la tentative

  // Ping/Pong pour détecter les connexions zombies
  // (configurer côté serveur : pingTimeout: 20000, pingInterval: 10000)
});
```

### 6.3 Gestion des rooms — Bonnes pratiques

```typescript
// BON : rooms granulaires
client.join(`tenant:${tenantId}`);           // Broadcast tenant-wide
client.join(`poste:${posteId}`);             // Broadcast par poste
client.join(`commercial:${commercialId}`);   // Unicast ciblé

// MAUVAIS : room unique globale (tous les agents reçoivent tout)
client.join('all-agents');   // Ne jamais faire ça à l'échelle

// MAUVAIS : rooms trop granulaires (une par conversation)
client.join(`chat:${chatId}`);  // 1000 agents × N conversations = explosion mémoire
```

### 6.4 Réduction des payloads Socket.IO

**Problème actuel :** `CONVERSATION_LIST` et `MESSAGE_LIST` envoient des tableaux complets à chaque requête.

```typescript
// MAUVAIS : envoyer toute la liste à chaque fois
server.to(room).emit('chat:event', {
  type: 'CONVERSATION_LIST',
  payload: { conversations: allConversations }  // potentiellement 500+ objets
});

// BON : incrémental avec curseur
server.to(room).emit('chat:event', {
  type: 'CONVERSATION_LIST',
  payload: {
    conversations: page,
    cursor: lastId,
    hasMore: true,
  }
});

// OPTIMAL : diff uniquement
server.to(room).emit('chat:event', {
  type: 'CONVERSATION_UPSERT',
  payload: { conversation: updatedConversation }  // 1 objet
});
```

### 6.5 Rate limiting distribué avec Redis

```typescript
// SocketThrottleGuard — version Redis (multi-instance)
async canActivate(context: WsArgumentsHost): Promise<boolean> {
  const client = context.getClient<Socket>();
  const event = context.getPattern();
  const key = `throttle:socket:${client.id}:${event}`;
  
  const limit = RATE_LIMITS[event] ?? 10;
  const window = 10; // secondes

  const current = await this.redis.incr(key);
  if (current === 1) {
    await this.redis.expire(key, window);
  }
  
  if (current > limit) {
    client.emit('chat:event', { type: 'RATE_LIMITED', payload: { event } });
    return false;
  }
  
  return true;
}
```

### 6.6 Heartbeat et détection de zombies

```typescript
// Dans database.module.ts ou gateway config
// Côté serveur NestJS (socket.io options)
const io = new Server(server, {
  pingTimeout: 20000,    // 20s sans réponse → considéré mort
  pingInterval: 10000,   // Ping toutes les 10s
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6, // 1MB max par message
  connectTimeout: 45000,
});
```

### 6.7 Architecture pour 10 000+ connexions simultanées

```
Charge = 10 000 connexions × 5 events/min = 50 000 events/min = ~833 events/s

Dimensionnement recommandé :
┌─────────────────────────────────────────────────────────┐
│   Load Balancer (Nginx / HAProxy / Cloudflare)          │
│   → Sticky sessions par IP OU via cookie io             │
│   → Ou Redis adapter (toutes instances équivalentes)    │
└──────────────┬─────────────────────────────────────────┘
               │
     ┌─────────┼──────────┐
     │         │          │
  Back #1    Back #2    Back #3
  (3 000)    (3 000)    (4 000)  ← connexions par instance
     │         │          │
     └─────────┼──────────┘
               │
        Redis Cluster
      (Pub/Sub adapter)
```

**Règles de dimensionnement :**
- 1 cœur CPU → ~3 000 connexions WebSocket maintenues
- 1 Go RAM → ~10 000 connexions (selon payload moyen)
- Redis Pub/Sub : ~100 000 messages/s sur un serveur standard

### 6.8 Namespace séparé pour l'admin

```typescript
// Actuellement : admin utilise REST uniquement → pas de temps réel
// Recommandation : namespace dédié

@WebSocketGateway({ namespace: '/admin', cors: { origin: adminOrigin } })
export class AdminGateway {
  // Events admin spécifiques :
  // - Nouvel agent connecté
  // - Alerte système
  // - Statistiques en temps réel (dashboard live)
  // - Broadcast administratif à tous les agents
}

// Namespace agent (existant)
@WebSocketGateway({ namespace: '/agent', cors: { origin: frontOrigin } })
export class AgentGateway { ... }
```

---

## 7. Plan d'amélioration priorisé

### Sprint P0 — Sécurité (1 jour)

| # | Action | Fichier | Effort |
|---|--------|---------|--------|
| 1 | Restreindre CORS WebSocket à `ALLOWED_ORIGINS` | `whatsapp_message.gateway.ts` | 15 min |
| 2 | Ajouter `REDIS_PASSWORD` dans `.env` production | `.env` + `docker-compose.yml` | 30 min |
| 3 | Vérifier que l'adapter Redis Socket.IO s'initialise correctement | `afterInit()` | 30 min |

### Sprint P1 — Stabilité (2-3 jours)

| # | Action | Fichier | Effort |
|---|--------|---------|--------|
| 4 | Supprimer double enregistrement BROADCAST_QUEUE | `queue.module.ts` | 5 min |
| 5 | Externaliser `BROADCAST_CONCURRENCY` en env | `broadcast.worker.ts` | 5 min |
| 6 | Invalidation cache RBAC sur modification de rôle | `rbac.service.ts` + `commercial.service.ts` | 30 min |
| 7 | Rate limiting Socket via Redis (multi-instance) | `socket-throttle.guard.ts` | 2h |
| 8 | Reconnexion Socket.IO avec backoff exponentiel côté client | `SocketProvider.tsx` | 20 min |
| 9 | Réduire TTL verrou Redlock de 120s à 30s | `window-rotation.service.ts` | 5 min |

### Sprint P2 — Monitoring (3-4 jours)

| # | Action | Description | Effort |
|---|--------|-------------|--------|
| 10 | Endpoint `/admin/queue-stats` | Métriques BullMQ (waiting, active, failed) | 2h |
| 11 | Bull Board UI | Interface web `/admin/queues` avec protection AdminGuard | 3h |
| 12 | Endpoint `/admin/redis-health` | Connexion, mémoire, uptime | 1h |
| 13 | Corriger `removeOnComplete: true` → historique 2h | `sentiment.listener.ts` | 5 min |
| 14 | Ajouter préfixe Redis configurable | `redis.module.ts`, `queue.module.ts` | 30 min |

### Sprint P3 — Montée en charge (1-2 semaines)

| # | Action | Description | Effort |
|---|--------|-------------|--------|
| 15 | Dead Letter Queue | File de récupération pour jobs webhook définitivement échoués | 1 jour |
| 16 | Namespace admin Socket.IO | Temps réel dans le panel admin (stats, alertes, présence agents) | 2 jours |
| 17 | Pagination incrémentale | Réduire le payload `CONVERSATION_LIST` en diff | 3 jours |
| 18 | Séparation instances Redis | Cache / Queues / Sessions sur connexions dédiées | 1 jour |
| 19 | Redis Sentinel | Haute disponibilité avec failover automatique | 2 jours |

---

## 8. Bilan exécutif

### Scorecard global

| Domaine | Note | Commentaire |
|---------|------|-------------|
| Architecture Redis générale | 7/10 | Graceful degradation bien implémentée, séparation des usages à améliorer |
| BullMQ — Webhooks | 8/10 | Bien configuré, retry/backoff corrects |
| BullMQ — Broadcasts | 6/10 | Concurrence fixe, double enregistrement |
| BullMQ — Sentiment | 7/10 | Non-bloquant, mais pas d'historique |
| Cache contexte | 9/10 | Double niveau Redis + in-process, excellent |
| Cache RBAC | 5/10 | Pas d'invalidation proactive |
| Verrous distribués | 8/10 | Redlock + fallback, TTL à réduire |
| Socket.IO — Architecture | 7/10 | Rooms bien structurées, events bien typés |
| Socket.IO — Sécurité | 4/10 | CORS ouvert, rate limiting non distribué |
| Socket.IO — Multi-instance | 5/10 | Adapter configuré mais non validé |
| Socket.IO — Client | 6/10 | Reconnexion non configurée, admin sans temps réel |
| Monitoring global | 2/10 | Aucune visibilité en production |
| **SCORE GLOBAL** | **6.3/10** | **Solide pour mono-instance, fragile pour la montée en charge** |

### Risques principaux

```
🔴 CRITIQUE
  → CORS WebSocket ouvert à * (brèche de sécurité)
  → Redis sans auth (accessible sans password)

🟠 IMPORTANT
  → Multi-instance impossible sans validation Redis Adapter
  → Cache RBAC sans invalidation (faille d'autorisation 5 min)
  → Rate limiting non distribué (contournement facile)

🟡 ATTENTION
  → Aucun monitoring = pannes silencieuses
  → Double enregistrement BROADCAST_QUEUE
  → Reconnexion WebSocket non maîtrisée (thundering herd possible)
```

### Ce qui fonctionne bien

```
✅ Graceful degradation Redis (l'app tourne sans Redis)
✅ BullMQ webhooks : retry, backoff, concurrence configurable
✅ Cache contexte dual-level (Redis + in-process)
✅ Redlock avec fallback in-process
✅ Authentification JWT sur WebSocket
✅ 25+ events typés et bien organisés en rooms granulaires
✅ Rate limiting présent (même si mono-instance)
✅ Sentiment non-bloquant via EventEmitter + queue
✅ Typing indicator avec débounce
✅ Publisher pattern propre (5 publishers séparés)
```

---

### Commandes de diagnostic rapide (depuis le serveur)

```bash
# État Redis
docker exec -it redis redis-cli ping
docker exec -it redis redis-cli info memory | grep used_memory_human
docker exec -it redis redis-cli info keyspace

# Clés en cours
docker exec -it redis redis-cli keys 'bull:*' | wc -l
docker exec -it redis redis-cli keys 'ctx:*'
docker exec -it redis redis-cli keys 'rbac:*'

# Jobs en attente dans les queues
docker exec -it redis redis-cli llen 'bull:webhook-processing:wait'
docker exec -it redis redis-cli llen 'bull:broadcast-sending:wait'
docker exec -it redis redis-cli llen 'bull:sentiment-analysis:wait'

# Jobs en échec
docker exec -it redis redis-cli zcount 'bull:webhook-processing:failed' -inf +inf
docker exec -it redis redis-cli zcount 'bull:broadcast-sending:failed' -inf +inf
```

---

*Rapport généré le 2026-05-07 — Projet WhatsApp Platform*  
*Auteur : Claude Code — Analyse automatisée du code source*
